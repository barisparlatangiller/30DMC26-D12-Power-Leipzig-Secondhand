"""
Second-hand places in Leipzig (OpenStreetMap export provided as data/secondhand_places_leipzig.geojson): clean, classify,
place them in their Ortsteil and in the LoD2 building they sit in.

  · removed: records tagged second_hand=no (regular shops such as C&A or Norma that are in the export)
  · category from the OSM tags (CATS below)
  · building: the LoD2 footprint containing the point, else the nearest one within 25 m

  python pipeline/a_places.py
Output  build/places.parquet · docs/data/places.geojson
"""
import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

D, IN, B, W = Path("data"), Path("input"), Path("build"), Path("docs/data")
B.mkdir(exist_ok=True); W.mkdir(parents=True, exist_ok=True)
CRS = 25833
CATS = ["Fashion & shoes", "Charity & social stores", "Antiques & flea markets", "General second-hand & home",
        "Books, music & tech", "Bikes", "Used cars & motorbikes"]


def txt(v):
    return "" if v is None or (isinstance(v, float) and np.isnan(v)) else str(v)


def category(r):
    shop, name, clothes = txt(r.get("shop")), txt(r.get("name")).lower(), txt(r.get("clothes"))
    if shop == "charity" or "sozialkaufhaus" in name or "caritas" in name or "tauschladen" in name: return 1
    if shop in ("car", "motorcycle"): return 6
    if shop == "bicycle": return 5
    if "antiquariat" in name or shop in ("books", "music", "computer"): return 4
    if shop in ("clothes", "shoes") or clothes or any(k in name for k in ("vintage", "kleid", "humana")): return 0
    if shop in ("antiques", "jewelry") or "antik" in name or "trödel" in name or "auktion" in name or "briefmarken" in name: return 2
    return 3


def main():
    g = gpd.read_file(D / "secondhand_places_leipzig.geojson")
    n0 = len(g)
    removed = g[g.second_hand.fillna("") == "no"]
    g = g[g.second_hand.fillna("") != "no"].copy()
    g["cat"] = g.apply(category, axis=1)
    # de-duplicate: the same name (first word, lower case) within 50 m is one place (a shop mapped as point and as area, …)
    gm = g.to_crs(CRS); key = gm.name.fillna("").str.lower().str.extract(r"(\w+)")[0].fillna("")
    drop = set()
    for i in range(len(gm)):
        for j in range(i + 1, len(gm)):
            if key.iloc[i] and key.iloc[i] == key.iloc[j] and gm.geometry.iloc[i].distance(gm.geometry.iloc[j]) < 50: drop.add(gm.index[j])
    dups = g.loc[sorted(drop)]
    g = g.drop(index=sorted(drop))
    g["osm"] = g["@id"].fillna(g["id"]).astype(str)
    g = g.to_crs(CRS)
    # Ortsteil
    ot = gpd.read_file(next(IN.glob("ortsteil.*"))).to_crs(CRS)
    name_col = next(c for c in ot.columns if c.lower() in ("name", "ot_name", "ortsteil", "bezeichnung")) if any(c.lower() in ("name", "ot_name", "ortsteil", "bezeichnung") for c in ot.columns) else ot.columns[1]
    ot = ot.rename(columns={name_col: "ortsteil"})[["ortsteil", "geometry"]]
    g = gpd.sjoin(g, ot, how="left", predicate="within").drop(columns="index_right")
    # LoD2 building
    b = gpd.read_parquet(IN / "leipzig_lod2.parquet").to_crs(CRS).reset_index(drop=True)
    b["bid"] = np.arange(len(b))
    j = gpd.sjoin_nearest(g[["osm", "geometry"]], b[["bid", "h", "geometry"]], how="left", max_distance=25, distance_col="dist")
    j = j[~j.index.duplicated()]
    g["bid"] = j.bid.reindex(g.index).fillna(-1).astype(int)
    g["bh"] = j.h.reindex(g.index)
    keep = ["osm", "name", "shop", "second_hand", "cat", "ortsteil", "bid", "bh", "addr:street", "addr:housenumber", "website", "opening_hours", "geometry"]
    g = g[[c for c in keep if c in g.columns]]
    g.to_parquet(B / "places.parquet")
    o = g.to_crs(4326)
    o.to_file(W / "places.geojson", driver="GeoJSON")
    print(f"records: {n0} · removed second_hand=no: {len(removed)} ({', '.join(removed.name.fillna('?'))}) · duplicates: {len(dups)} ({', '.join(dups.name.fillna('?'))}) · kept: {len(g)}")
    print("categories:", pd.Series([CATS[c] for c in g.cat]).value_counts().to_dict())
    print(f"in a LoD2 building (≤25 m): {(g.bid >= 0).sum()} of {len(g)}")
    print("by Ortsteil:", g.ortsteil.value_counts().head(12).to_dict())
    json.dump({"n_records": n0, "removed": removed.name.fillna("").tolist(), "duplicates": dups.name.fillna("").tolist(), "kept": len(g)}, open(B / "places_meta.json", "w"))


if __name__ == "__main__":
    main()
