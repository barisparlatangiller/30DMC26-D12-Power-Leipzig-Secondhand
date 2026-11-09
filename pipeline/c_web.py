"""
Web layers and a QGIS GeoPackage.

  buildings.pmtiles  LoD2 footprints with height h; c = category of the second-hand place inside (−1 = none), nm = its name
  trees.pmtiles      Baumkataster Leipzig: every street and park tree, crown diameter d and height th (drawn in one colour)
  cells.pmtiles      100 m Zensus cells: residents, second-hand places within a 15-minute walk (total n and per category n0…n6)
  ortsteile.geojson  places and walkable second-hand places per Ortsteil

  python pipeline/c_web.py     (needs tippecanoe)
Output  docs/data/* · build/leipzig_secondhand.gpkg
"""
import json, shutil, subprocess
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

IN, B, W = Path("input"), Path("build"), Path("docs/data")
CRS = 25833
CATS = ["Fashion & shoes", "Charity & social stores", "Antiques & flea markets", "General second-hand & home",
        "Books, music & tech", "Bikes", "Used cars & motorbikes"]


def tiles(gdf, name, layer, zmin, zmax, extra=()):
    f = B / f"{name}.geojsonl"
    gdf.to_crs(4326).to_file(f, driver="GeoJSONSeq", COORDINATE_PRECISION=6)
    subprocess.run(["tippecanoe", "-o", str(W / f"{name}.pmtiles"), "--force", "-q", "-l", layer, f"-Z{zmin}", f"-z{zmax}", *extra, str(f)], check=True)
    print(f"{name}.pmtiles {(W / f'{name}.pmtiles').stat().st_size / 1e6:.1f} MB", flush=True)


def main():
    city = gpd.read_file(next(IN.glob("stadtgrenze.*"))).to_crs(CRS)
    cu = city.union_all()
    p = gpd.read_parquet(B / "places.parquet").to_crs(CRS)
    hp = pd.read_parquet(B / "hinterland_places.parquet")
    p = p.merge(hp, on="osm", how="left")
    cells = gpd.read_parquet(B / "cells.parquet")
    H = json.loads((B / "hinterland.json").read_text())
    meta = json.loads((B / "places_meta.json").read_text())

    # buildings
    b = gpd.read_parquet(IN / "leipzig_lod2.parquet").to_crs(CRS).reset_index(drop=True)
    b["bid"] = np.arange(len(b))
    b = b[b.intersects(cu.buffer(300))]
    pb = p[p.bid >= 0].sort_values("cat").drop_duplicates("bid")
    b["c"] = b.bid.map(dict(zip(pb.bid, pb.cat))).fillna(-1).astype(int)
    b["nm"] = b.bid.map(dict(zip(pb.bid, pb.name.fillna("")))).fillna("")
    b["h"] = b.h.clip(2, 200).round(1)
    tiles(b[["h", "c", "nm", "geometry"]], "buildings", "b", 11, 15, ["--drop-smallest-as-needed", "--simplification=2", "--maximum-tile-bytes=1500000", "-y", "h", "-y", "c", "-y", "nm"])

    # trees
    tf = next(IN.glob("Baumkataster*"))
    t = gpd.read_file(tf).to_crs(CRS)
    t["d"] = pd.to_numeric(t.get("kr_durchm"), errors="coerce").fillna(6).clip(2, 25).round()
    t["th"] = pd.to_numeric(t.get("baumhoehe"), errors="coerce").fillna(10).clip(3, 40).round()
    t = t[t.geometry.notna() & t.within(cu)]
    tiles(t[["d", "th", "geometry"]], "trees", "t", 11, 15, ["--drop-densest-as-needed", "-y", "d", "-y", "th"])

    # hinterland cells
    cc = cells.copy()
    for k in ["n"] + [f"n{i}" for i in range(7)]: cc[k] = cc[k].astype(int)
    cc["pop"] = cc["pop"].astype(int); cc["nearest"] = cc.nearest.astype(int)
    tiles(cc[["pop", "n", "nearest"] + [f"n{i}" for i in range(7)] + ["geometry"]], "cells", "c", 10, 14, ["--no-feature-limit", "--no-tile-size-limit"])

    # Ortsteile
    ot = gpd.read_file(next(IN.glob("ortsteil.*"))).to_crs(CRS)
    nc = next((c for c in ot.columns if c.lower() in ("name", "ot_name", "ortsteil", "bezeichnung")), ot.columns[1])
    ot = ot.rename(columns={nc: "ortsteil"})[["ortsteil", "geometry"]]
    ot["places"] = ot.ortsteil.map(p.ortsteil.value_counts()).fillna(0).astype(int)
    for k in range(7): ot[f"p{k}"] = ot.ortsteil.map(p[p.cat == k].ortsteil.value_counts()).fillna(0).astype(int)
    cj = gpd.sjoin(gpd.GeoDataFrame(cc[["pop", "n"]], geometry=cc.centroid, crs=CRS), ot[["ortsteil", "geometry"]], predicate="within")
    agg = cj.groupby("ortsteil").apply(lambda g: pd.Series({"res": g["pop"].sum(), "walk": (g.n * g["pop"]).sum() / max(1, g["pop"].sum()),
                                                            "cov": g.loc[g.n > 0, "pop"].sum() / max(1, g["pop"].sum())}), include_groups=False)
    ot = ot.join(agg, on="ortsteil")
    ot["res"] = ot.res.fillna(0).astype(int); ot["walk"] = ot.walk.fillna(0).round(2); ot["cov"] = ot["cov"].fillna(0).round(3)
    o = ot.to_crs(4326); o["geometry"] = o.simplify(0.00008)
    lab = ot.copy(); lab["geometry"] = ot.representative_point()
    o.to_file(W / "ortsteile.geojson", driver="GeoJSON", COORDINATE_PRECISION=5)

    pp = p.to_crs(4326)
    pp["hinterland"] = pp.hinterland.fillna(0).astype(int)
    pp.drop(columns=["bid", "bh"]).to_file(W / "places.geojson", driver="GeoJSON")

    plag = ot[ot.ortsteil.str.contains("Plagwitz", case=False)]
    west = ot[ot.ortsteil.str.contains("Plagwitz|Lindenau|Schleußig|Kleinzschocher|Altlindenau|Neulindenau", case=False)]
    stats = {"cats": CATS, "count": [int((p.cat == k).sum()) for k in range(7)], "total": len(p), "meta": meta, "hinterland": H,
             "hinterland_cat_share": [round(v / H["residents"], 3) for v in H["covered_cat"]],
             "top_places": p.sort_values("hinterland", ascending=False)[["name", "cat", "ortsteil", "hinterland"]].head(10).fillna("").values.tolist(),
             "top_ortsteile_places": ot.sort_values("places", ascending=False)[["ortsteil", "places"]].head(8).values.tolist(),
             "top_ortsteile_walk": ot[ot.res > 2000].sort_values("walk", ascending=False)[["ortsteil", "walk", "res"]].head(8).values.tolist(),
             "plagwitz": {k: (int(v) if k != "walk" else float(v)) for k, v in plag[["places", "res", "walk"]].sum().items()} if len(plag) else None,
             "west": {"places": int(west.places.sum()), "names": west.ortsteil.tolist()},
             "labels": {r.ortsteil: [round(x, 5) for x in gpd.GeoSeries([r.geometry], crs=CRS).to_crs(4326).iloc[0].coords[0]] for r in lab.itertuples()}}
    (W / "stats.json").write_text(json.dumps(stats, indent=1, ensure_ascii=False))
    gp = B / "leipzig_secondhand.gpkg"; gp.unlink(missing_ok=True)
    p.assign(category=p.cat.map(dict(enumerate(CATS)))).drop(columns=["bid"]).to_file(gp, layer="secondhand_places")
    cc.to_file(gp, layer="hinterland_100m"); ot.to_file(gp, layer="ortsteile")
    b[b.c >= 0].assign(category=lambda d: d.c.map(dict(enumerate(CATS)))).to_file(gp, layer="secondhand_buildings")
    shutil.copy(gp, W / gp.name)
    print(json.dumps({k: v for k, v in stats.items() if k != "labels"}, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
