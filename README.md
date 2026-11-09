# The Power of Secondhand — the second life of a neighbourhood

**#30DayMapChallenge 2026 · Day 12 · Power · Leipzig** · live map: https://barisparlatangiller.github.io/30DMC26-D12-Power-Leipzig-Secondhand/

Leipzig's second-hand places in 3D: every building that houses one is coloured by its kind, the city's trees are drawn in one
colour, and a second view shows the **hinterland**: how many second-hand places each 100 m of the city reaches within a
15-minute walk, and how many residents live within that walk. Plagwitz and Leipzig's west are the focus.

## Data
| | Source |
|---|---|
| Second-hand places | OpenStreetMap (shop=second_hand, second_hand=yes/only, shop=charity), export `data/secondhand_places_leipzig.geojson` (95 records) |
| Buildings | 3D-Stadtmodell LoD2 Sachsen, © GeoSN, dl-de/by-2-0 |
| Trees, Ortsteile, city boundary | Stadt Leipzig open data (WFS) |
| Residents | Zensus 2022, 100 m grid (Destatis) |
| Walking network | OpenStreetMap via Geofabrik (ODbL) |

## Method
- Records tagged `second_hand=no` (regular shops in the export) are removed; same-name records within 50 m count once.
- Category from the OSM shop tag and the name: fashion & shoes, charity & social stores, antiques & flea markets, general
  second-hand & home, books/music/tech, bikes, used cars & motorbikes.
- A place colours the LoD2 building it sits in, else the nearest within 25 m.
- Hinterland: network walking distance (OSM paths and streets), 15 min = 1,200 m at 4.8 km/h; each 100 m Zensus cell counts the
  places within that walk.

## Limits
OSM can miss shops or still hold closed ones; markets and pop-ups are not included. Customer age or ownership is not measured.

## Run
```
pip install -r requirements.txt     # plus tippecanoe, osmium-tool
python pipeline/fetch_inputs.py leipzig && python pipeline/fetch_inputs.py lod2
python pipeline/lod2_to_footprints.py --lod2 input/lod2 --out input/leipzig_lod2.parquet
python pipeline/a_places.py && python pipeline/b_hinterland.py && python pipeline/c_web.py
node pipeline/posters.mjs           # LinkedIn images
```
`docs/data/leipzig_secondhand.gpkg` opens in QGIS (places, second-hand buildings, hinterland grid, Ortsteile).

Barış Parlatangiller, built with Claude.
