"""
The hinterland of Leipzig's second-hand places: who lives within a 15-minute walk.

  walking network = OpenStreetMap paths and streets usable on foot (Geofabrik, Sachsen extract), distances along the network
  15 minutes       = 1,200 m at 4.8 km/h
  residents        = Zensus 2022, 100 m grid (Destatis); each cell is reached from its centre's nearest network node

For every 100 m cell: how many second-hand places (in total and per category) lie within 15 minutes, and the walk to the nearest.
For every place: the residents in its 15-minute hinterland.

  python pipeline/b_hinterland.py        (needs osmium-tool)
Output  build/cells.parquet · build/hinterland.json
"""
import json, subprocess, zipfile
from pathlib import Path

import geopandas as gpd
import numpy as np
import osmium
import pandas as pd
import requests
import shapely
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import connected_components, dijkstra
from scipy.spatial import cKDTree

IN, B = Path("input"), Path("build")
CRS, WALK, LIMIT = 25833, 1200.0, 2000.0
FOOT = {"footway", "path", "pedestrian", "living_street", "residential", "service", "unclassified", "tertiary", "tertiary_link",
        "secondary", "secondary_link", "primary", "primary_link", "steps", "track", "cycleway", "bridleway", "corridor"}
CATS = 7


def get(url, f):
    if f.exists() and f.stat().st_size > 1000: return f
    with requests.get(url, stream=True, timeout=(30, 1800), headers={"User-Agent": "Mozilla/5.0 30DMC26"}) as r:
        r.raise_for_status()
        with open(f.with_suffix(".part"), "wb") as o:
            for c in r.iter_content(1 << 22): o.write(c)
    f.with_suffix(".part").rename(f); return f


class Paths(osmium.SimpleHandler):
    def __init__(self, tr):
        super().__init__(); self.tr = tr; self.a, self.b, self.w, self.xy = [], [], [], {}

    def way(self, w):
        hw = w.tags.get("highway")
        if hw not in FOOT or w.tags.get("foot") in ("no", "private") or w.tags.get("access") in ("private", "no") and w.tags.get("foot") not in ("yes", "designated"): return
        try: pts = [(n.ref, n.lon, n.lat) for n in w.nodes]
        except osmium.InvalidLocationError: return
        for (i, x0, y0), (j, x1, y1) in zip(pts, pts[1:]):
            self.xy[i] = (x0, y0); self.xy[j] = (x1, y1); self.a.append(i); self.b.append(j)


def main():
    city = gpd.read_file(next(IN.glob("stadtgrenze.*"))).to_crs(CRS).union_all()
    reach = city.buffer(LIMIT)
    bb = gpd.GeoSeries([reach], crs=CRS).to_crs(4326).total_bounds
    pbf = get("https://download.geofabrik.de/europe/germany/sachsen-latest.osm.pbf", IN / "sachsen-latest.osm.pbf")
    sub = B / "leipzig_paths.osm.pbf"
    subprocess.run(["osmium", "extract", "-b", ",".join(f"{v:.4f}" for v in bb), str(pbf), "-o", str(B / "leipzig.osm.pbf"), "--overwrite"], check=True)
    subprocess.run(["osmium", "tags-filter", str(B / "leipzig.osm.pbf"), "w/highway", "-o", str(sub), "--overwrite"], check=True)
    h = Paths(None); h.apply_file(str(sub), locations=True, idx="flex_mem")
    ids = np.fromiter(h.xy.keys(), dtype=np.int64); pos = {k: i for i, k in enumerate(ids)}
    ll = np.array([h.xy[k] for k in ids])
    xy = np.c_[gpd.GeoSeries(gpd.points_from_xy(ll[:, 0], ll[:, 1]), crs=4326).to_crs(CRS).get_coordinates().values]
    a = np.array([pos[k] for k in h.a]); b = np.array([pos[k] for k in h.b])
    d = np.hypot(*(xy[a] - xy[b]).T)
    G = csr_matrix((np.r_[d, d], (np.r_[a, b], np.r_[b, a])), shape=(len(ids), len(ids)))
    _, lab = connected_components(G, directed=False)
    main_ = np.flatnonzero(lab == np.bincount(lab).argmax())
    tree = cKDTree(xy[main_])
    print(f"walking network: {len(ids):,} nodes, {len(a):,} segments", flush=True)

    p = gpd.read_parquet(B / "places.parquet").to_crs(CRS).reset_index(drop=True)
    snap_d, snap_i = tree.query(p.get_coordinates().values)
    src = main_[snap_i]
    dist = dijkstra(G, directed=False, indices=src, limit=LIMIT) + snap_d[:, None]          # places × nodes

    # Zensus 2022 residents, 100 m grid
    z = get("https://www.destatis.de/static/DE/zensus/gitterdaten/Zensus2022_Bevoelkerungszahl.zip", IN / "Zensus2022_Bevoelkerungszahl.zip")
    x0, y0, x1, y1 = gpd.GeoSeries([reach], crs=CRS).to_crs(3035).total_bounds
    zf = zipfile.ZipFile(z); name = next(n for n in zf.namelist() if "100m" in n.lower() and n.lower().endswith(".csv"))
    parts = []
    with zf.open(name) as fh:
        for ch in pd.read_csv(fh, sep=";", chunksize=500_000, encoding="latin-1", dtype=str):
            ch.columns = [c.strip() for c in ch.columns]
            xs, ys = pd.to_numeric(ch.x_mp_100m), pd.to_numeric(ch.y_mp_100m)
            m = (xs >= x0) & (xs <= x1) & (ys >= y0) & (ys <= y1)
            if m.any(): parts.append(ch[m])
    t = pd.concat(parts)
    pcol = next(c for c in t.columns if "einwohner" in c.lower() or c.lower() in ("bevoelkerungszahl", "insgesamt_bevoelkerung"))
    t["pop"] = pd.to_numeric(t[pcol].str.replace("–", "").str.strip(), errors="coerce").fillna(0)
    t = t[t["pop"] > 0]
    xs, ys = t.x_mp_100m.astype(float).values, t.y_mp_100m.astype(float).values
    c = gpd.GeoDataFrame({"pop": t["pop"].values}, geometry=[shapely.box(x - 50, y - 50, x + 50, y + 50) for x, y in zip(xs, ys)], crs=3035).to_crs(CRS)
    c = c[c.centroid.within(city)].reset_index(drop=True)
    cd, ci = tree.query(c.centroid.get_coordinates().values)
    D = dist[:, main_[ci]] + cd[None, :]                                                    # places × cells, metres
    near = D <= WALK
    c["n"] = near.sum(0)
    for k in range(CATS): c[f"n{k}"] = near[(p.cat.values == k)].sum(0)
    c["nearest"] = np.round(np.minimum(D.min(0), 9999))
    c.to_parquet(B / "cells.parquet")
    p["hinterland"] = (near * c["pop"].values[None, :]).sum(1).round()
    p[["osm", "hinterland"]].to_parquet(B / "hinterland_places.parquet")
    tot = c["pop"].sum()
    out = {"residents": int(tot), "walk_m": WALK, "covered_any": int(c.loc[c.n > 0, "pop"].sum()),
           "covered_cat": [int(c.loc[c[f"n{k}"] > 0, "pop"].sum()) for k in range(CATS)],
           "mean_reachable": round(float((c.n * c["pop"]).sum() / tot), 2),
           "best_cells": int((c.n >= 5).sum())}
    (B / "hinterland.json").write_text(json.dumps(out, indent=1))
    print(json.dumps(out, indent=1))
    print("largest hinterlands:", p.sort_values("hinterland", ascending=False)[["name", "hinterland"]].head(8).values.tolist())


if __name__ == "__main__":
    main()
