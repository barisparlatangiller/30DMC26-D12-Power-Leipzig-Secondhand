/* The Power of Secondhand · #30DayMapChallenge 2026 · Day 12 · Power · Leipzig */
const COL = ["#e4572e", "#f2a541", "#8e5572", "#2e86ab", "#1b998b", "#c84b9e", "#5c6b73"];
const TREE = "#8dbf7c", BLD = "#ebe7df", RAMP = ["#f1eefb", "#cfc6f1", "#a397e2", "#7563cc", "#47369f", "#2a1d6e"];
const $ = s => document.querySelector(s);
const fmt = n => Math.round(n).toLocaleString("en-GB");
const pct = x => Math.round(100 * x) + "%";
const S = { mode: "places", on: new Set([0, 1, 2, 3, 4, 5, 6]) };
window.S = S;

async function load() {
  const j = u => fetch(u).then(r => r.json());
  [S.st, S.pl, S.ot] = await Promise.all([j("data/stats.json?v=1"), j("data/places.geojson?v=1"), j("data/ortsteile.geojson?v=1")]);
}
const abs = p => new URL(p, location.href).href;

let map;
function initMap() {
  const proto = new pmtiles.Protocol(); maplibregl.addProtocol("pmtiles", proto.tile);
  map = S.map = new maplibregl.Map({ container: "map", style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    center: [12.336, 51.3255], zoom: 14.4, pitch: 56, bearing: -22, maxPitch: 75, antialias: true, attributionControl: false });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "OSM (ODbL) · LoD2 © GeoSN · Stadt Leipzig · Zensus 2022 © Destatis" }), "bottom-right");
}
function buildExpr() {                                               // building colour: category if switched on, else neutral
  const m = ["match", ["get", "c"]]; S.on.forEach(k => m.push(k, COL[k])); m.push(BLD);
  return S.mode === "hinter" ? "#f4f1ea" : m;
}
function cellsExpr() {
  const sum = ["+", 0, ...[...S.on].map(k => ["get", "n" + k])];
  return ["step", sum, "rgba(0,0,0,0)", 1, RAMP[1], 2, RAMP[2], 3, RAMP[3], 6, RAMP[4], 10, RAMP[5]];
}
function addLayers() {
  if (map.getLayer("bld")) return true;
  try {
    const L = map.getStyle().layers, sym = L.find(l => l.type === "symbol")?.id, font = (L.find(l => (l.layout?.["text-font"] || []).join("").includes("Montserrat Medium"))?.layout["text-font"]) || ["Montserrat Medium", "Open Sans Regular"];
    for (const l of L) if (/building/.test(l.id)) map.setLayoutProperty(l.id, "visibility", "none");
    map.addSource("cells", { type: "vector", url: "pmtiles://" + abs("data/cells.pmtiles") });
    map.addLayer({ id: "cells", type: "fill", source: "cells", "source-layer": "c", layout: { visibility: "none" }, paint: { "fill-color": cellsExpr(), "fill-opacity": 0.82 } }, sym);
    map.addSource("ot", { type: "geojson", data: S.ot });
    map.addLayer({ id: "ot", type: "line", source: "ot", paint: { "line-color": ["case", ["in", "Plagwitz", ["get", "ortsteil"]], "#e4572e", "#a59d8f"],
      "line-width": ["case", ["in", "Plagwitz", ["get", "ortsteil"]], 2.4, 0.6], "line-dasharray": [3, 2], "line-opacity": 0.8 } }, sym);
    map.addSource("trees", { type: "vector", url: "pmtiles://" + abs("data/trees.pmtiles") });
    map.addLayer({ id: "trees", type: "circle", source: "trees", "source-layer": "t", paint: { "circle-color": TREE, "circle-opacity": 0.7, "circle-pitch-alignment": "map",
      "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 11, ["max", 0.8, ["/", ["get", "d"], 48]], 14, ["max", 1.6, ["/", ["get", "d"], 6]], 18, ["/", ["get", "d"], 0.4]] } }, sym);
    map.addSource("bld", { type: "vector", url: "pmtiles://" + abs("data/buildings.pmtiles") });
    map.addLayer({ id: "bld", type: "fill-extrusion", source: "bld", "source-layer": "b", minzoom: 11,
      paint: { "fill-extrusion-color": buildExpr(), "fill-extrusion-height": ["get", "h"], "fill-extrusion-opacity": 0.95, "fill-extrusion-vertical-gradient": true } });
    map.addSource("pl", { type: "geojson", data: S.pl });
    map.addLayer({ id: "plh", type: "circle", source: "pl", filter: ["in", ["get", "cat"], ["literal", [...S.on]]],
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 6, 15, 11], "circle-color": ["to-color", ["at", ["get", "cat"], ["literal", COL]]], "circle-opacity": 0.12, "circle-blur": 0.6 } });
    map.addLayer({ id: "pl", type: "circle", source: "pl", filter: ["in", ["get", "cat"], ["literal", [...S.on]]],
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 3.5, 15, 4.5], "circle-color": ["to-color", ["at", ["get", "cat"], ["literal", COL]]],
        "circle-stroke-color": "#fff", "circle-stroke-width": 1.6 } });
    map.addLayer({ id: "pln", type: "symbol", source: "pl", minzoom: 14.2, filter: ["in", ["get", "cat"], ["literal", [...S.on]]],
      layout: { "text-field": ["coalesce", ["get", "name"], ""], "text-font": font, "text-size": 11.5, "text-offset": [0, 1.1], "text-anchor": "top", "text-max-width": 9 },
      paint: { "text-color": "#2b2823", "text-halo-color": "#fffdf9", "text-halo-width": 1.6 } });
    map.on("click", "pl", e => popup(e.features[0].properties, e.lngLat));
    map.on("click", "bld", e => { const p = e.features[0].properties; if (p.c >= 0 && p.nm) { const f = S.pl.features.find(f => f.properties.name === p.nm); if (f) popup(f.properties, e.lngLat); } });
    for (const id of ["pl", "bld"]) { map.on("mouseenter", id, e => { if (id === "pl" || e.features[0].properties.c >= 0) map.getCanvas().style.cursor = "pointer"; }); map.on("mouseleave", id, () => map.getCanvas().style.cursor = ""); }
    return true;
  } catch (e) { console.warn(e); return false; }
}
function popup(p, ll) {
  const c = +p.cat, osm = String(p.osm || "");
  const addr = [p["addr:street"], p["addr:housenumber"]].filter(Boolean).join(" ");
  new maplibregl.Popup({ offset: 10, maxWidth: "300px" }).setLngLat(ll).setHTML(`<div class="tag"><i style="background:${COL[c]}"></i>${S.st.cats[c]}</div>
    <h3>${p.name || "unnamed"}</h3><div>${addr ? addr + " · " : ""}${p.ortsteil || ""}</div>
    ${p.opening_hours ? `<div class="fine">${p.opening_hours}</div>` : ""}
    <div style="margin-top:6px"><b>${fmt(p.hinterland)}</b> residents within a 15-minute walk</div>
    <div style="margin-top:6px">${p.website ? `<a href="${p.website}" target="_blank" rel="noopener">website</a> · ` : ""}<a href="https://www.openstreetmap.org/${osm.includes("/") ? osm : "node/" + osm}" target="_blank" rel="noopener">OSM record</a></div>`).addTo(map);
}

function render() {
  const st = S.st, H = st.hinterland;
  $("#kpis").innerHTML = `<div class="kpi"><b>${st.total}</b><span>second-hand places on OpenStreetMap</span></div>
    <div class="kpi"><b>${pct(H.covered_any / H.residents)}</b><span>of ${fmt(H.residents)} residents live within a 15-min walk of one</span></div>
    <div class="kpi"><b>${H.mean_reachable.toFixed(1)}</b><span>places a resident reaches on foot, on average</span></div>`;
  const tot = st.count.reduce((a, b) => a + b, 0), mx = Math.max(...st.count);
  $("#table").innerHTML = `<thead><tr><th>Category</th><th>Places</th><th>Share</th><th title="residents within a 15-minute walk">≤15′ walk</th></tr></thead><tbody>` +
    st.cats.map((c, k) => `<tr class="row ${S.on.has(k) ? "" : "off"}" data-k="${k}"><td><i class="sw" style="background:${COL[k]}"></i>${c}</td><td>${st.count[k]}</td>
      <td><span class="bar" style="width:${32 * st.count[k] / mx}px;background:${COL[k]}"></span>${pct(st.count[k] / tot)}</td><td>${pct(st.hinterland_cat_share[k])}</td></tr>`).join("") +
    `</tbody><tfoot><tr><td>All</td><td>${tot}</td><td>100%</td><td>${pct(H.covered_any / H.residents)}</td></tr></tfoot>`;
  $("#table").querySelectorAll("tr.row").forEach(tr => tr.onclick = () => { const k = +tr.dataset.k; S.on.has(k) ? S.on.delete(k) : S.on.add(k); if (!S.on.size) S.on.add(k); render(); restyle(); });
  $("#otp").innerHTML = st.top_ortsteile_places.slice(0, 6).map(o => `<li data-o="${o[0]}">${o[0]} <span>${o[1]}</span></li>`).join("");
  $("#otw").innerHTML = st.top_ortsteile_walk.slice(0, 6).map(o => `<li data-o="${o[0]}">${o[0]} <span>${o[1].toFixed(1)}</span></li>`).join("");
  document.querySelectorAll("[data-o]").forEach(li => li.onclick = () => flyOT(li.dataset.o));
  const pw = st.plagwitz;
  $("#plag").innerHTML = pw ? `<b>Plagwitz</b>: ${pw.places} second-hand places for ${fmt(pw.res)} residents; from an average home there, <b>${pw.walk.toFixed(1)}</b> places are within a 15-minute walk.
    Leipzig's west (${st.west.names.join(", ")}) holds <b>${st.west.places}</b> of the ${st.total} places.` : "";
  $("#removed").textContent = `${st.meta.removed.length} records tagged second_hand=no (${st.meta.removed.join(", ")})`;
  $("#ramp").style.background = `linear-gradient(90deg, ${RAMP.join(",")})`;
}
function restyle() {
  if (!map.getLayer("bld")) return;
  map.setPaintProperty("bld", "fill-extrusion-color", buildExpr());
  map.setPaintProperty("cells", "fill-color", cellsExpr());
  map.setLayoutProperty("cells", "visibility", S.mode === "hinter" ? "visible" : "none");
  map.setPaintProperty("trees", "circle-opacity", S.mode === "hinter" ? 0.25 : 0.75);
  map.setPaintProperty("bld", "fill-extrusion-opacity", S.mode === "hinter" ? 0.55 : 0.95);
  const f = ["in", ["get", "cat"], ["literal", [...S.on]]];
  for (const id of ["pl", "plh", "pln"]) map.setFilter(id, f);
  $("#hlegend").classList.toggle("hidden", S.mode !== "hinter");
}
function flyOT(name) {
  const f = S.ot.features.find(f => f.properties.ortsteil === name); if (!f) return;
  let x0 = 99, y0 = 99, x1 = -99, y1 = -99; const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const P of polys) for (const [x, y] of P[0]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  map.fitBounds([[x0, y0], [x1, y1]], { padding: 60, pitch: 55, duration: 1400 });
}
async function main() {
  initMap(); await load(); render();
  const go = () => { if (S.ready) return true; if (!addLayers()) return false; S.ready = true; restyle(); return true; };
  map.on("load", go); const p = setInterval(() => { if (S.ready) return clearInterval(p); if (map.isStyleLoaded() && go()) clearInterval(p); }, 300);
  document.querySelectorAll("[data-m]").forEach(b => b.onclick = () => { S.mode = b.dataset.m; document.querySelectorAll("[data-m]").forEach(x => x.classList.toggle("on", x === b)); restyle();
    if (S.mode === "hinter") map.easeTo({ zoom: 11.6, pitch: 30, bearing: 0, center: [12.375, 51.335], duration: 1400 }); else map.easeTo({ center: [12.336, 51.3255], zoom: 14.4, pitch: 56, bearing: -22, duration: 1400 }); });
}
main();
