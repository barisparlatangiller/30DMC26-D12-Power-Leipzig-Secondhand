// 3 LinkedIn images (1080×1350) and the hub thumbnail, rendered from the built site.
//   node pipeline/posters.mjs  → media/post1_3d_west.png · post2_what_kinds.png · post3_hinterland.png · thumb_full.jpg
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".geojson": "application/geo+json" };
http.createServer((req, res) => {
  const u = decodeURIComponent(new globalThis.URL(req.url, "http://x").pathname);
  const f = path.join("docs", u.endsWith("/") ? u + "index.html" : u);
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const size = fs.statSync(f).size, type = TYPES[path.extname(f)] || "application/octet-stream";
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || "");
  if (m) { const a = +m[1], b = m[2] ? Math.min(+m[2], size - 1) : size - 1;
    res.writeHead(206, { "Content-Type": type, "Content-Length": b - a + 1, "Content-Range": `bytes ${a}-${b}/${size}`, "Accept-Ranges": "bytes" });
    fs.createReadStream(f, { start: a, end: b }).pipe(res);
  } else { res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" }); fs.createReadStream(f).pipe(res); }
}).listen(8000);

const URL = "http://localhost:8000/", OUT = "media";
fs.mkdirSync(OUT, { recursive: true });
const br = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-dev-shm-usage"] });
const ready = p => p.waitForFunction(() => window.S && S.ready && S.map.getLayer("bld"), null, { timeout: 180000 });
const settle = p => p.evaluate(() => new Promise(r => { let d = false; const f = () => { if (!d) { d = true; setTimeout(r, 300); } }; S.map.once("idle", f); S.map.triggerRepaint(); setTimeout(f, 20000); }));

{ const p = await br.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(URL, { waitUntil: "networkidle" }); await ready(p); await settle(p); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/thumb_full.jpg`, type: "jpeg", quality: 90, timeout: 120000 }); await p.close(); console.log("thumbnail"); }

const CSS = `
  .panel, .maplibregl-ctrl-top-right, .maplibregl-ctrl-bottom-right { display: none !important; }
  #map { inset: 0 !important; }
  .v { position: absolute; z-index: 5; left: 48px; right: 48px; font-family: Inter; color: #1f1d1a; }
  .v.top { top: 0; padding: 44px 48px 26px; left: 0; right: 0; background: linear-gradient(#fffdf9 75%, rgba(255,253,249,0)); }
  .v .eb { font-size: 18px; letter-spacing: .16em; text-transform: uppercase; color: #8f887c; font-weight: 600; }
  .v h1 { font-family: Fraunces, Georgia, serif; font-size: 70px; line-height: .98; letter-spacing: -.02em; margin: 10px 0 10px; font-weight: 800; }
  .v h1 em { color: #e4572e; }
  .v .q { font-size: 26px; color: #5d5850; line-height: 1.32; max-width: 960px; }
  .v.bot { bottom: 44px; background: rgba(255,253,249,.96); border: 1px solid #e7e2d8; border-radius: 22px; padding: 22px 26px; box-shadow: 0 16px 40px -22px rgba(0,0,0,.35); }
  .v table { width: 100%; border-collapse: collapse; font-size: 21px; font-variant-numeric: tabular-nums; }
  .v td { padding: 6px 4px; border-bottom: 1px solid #f1ece3; } .v td.r { text-align: right; } .v tr:last-child td { border-bottom: 0; }
  .v .sw { display: inline-block; width: 16px; height: 16px; border-radius: 4px; margin-right: 10px; vertical-align: -2px; }
  .v .bar { display: inline-block; height: 14px; border-radius: 7px; vertical-align: middle; }
  .v .kp { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .v .kp b { display: block; font-family: Fraunces, serif; font-size: 50px; font-weight: 800; } .v .kp span { font-size: 18px; color: #5d5850; line-height: 1.3; display: block; }
  .v .ramp { height: 16px; border-radius: 8px; margin-top: 16px; } .v .ends { display: flex; justify-content: space-between; font-size: 17px; color: #8f887c; margin-top: 4px; }
  .v .att { margin-top: 12px; font-size: 14px; color: #8f887c; }
  .maplibregl-popup { display: none; }
`;
const ATT = "OpenStreetMap (ODbL) · LoD2 © GeoSN · Baumkataster, Ortsteile © Stadt Leipzig · Zensus 2022 © Destatis · © CARTO · barisparlatangiller.github.io";
async function poster(name, fn, arg) {
  const p = await br.newPage({ viewport: { width: 1080, height: 1350 } });
  p.on("console", m => m.type() === "error" && console.log("console:", m.text()));
  await p.goto(URL, { waitUntil: "networkidle" }); await ready(p);
  await p.addStyleTag({ content: CSS });
  await p.evaluate(fn, { ...arg, ATT });
  await settle(p); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/${name}.png`, timeout: 180000 }); await p.close(); console.log("poster", name);
}

await poster("post1_3d_west", ({ ATT }) => {
  const st = S.st, COLS = ["#e4572e", "#f2a541", "#8e5572", "#2e86ab", "#1b998b", "#c84b9e", "#5c6b73"];
  S.map.resize(); S.map.jumpTo({ center: [12.3388, 51.3292], zoom: 15.55, pitch: 60, bearing: -20 });
  S.map.setPaintProperty("plh", "circle-radius", 26); S.map.setPaintProperty("plh", "circle-opacity", 0.28); S.map.setPaintProperty("pl", "circle-radius", 6.5);
  S.map.setLayoutProperty("pln", "text-size", 15);
  document.body.insertAdjacentHTML("beforeend", `<div class="v top"><div class="eb">#30DayMapChallenge · Day 12 · Power · Leipzig</div>
    <h1>The second life of <em>a neighbourhood</em></h1><div class="q">Plagwitz and Leipzig's west in 3D: every coloured building houses a second-hand place.
    Green: the city's trees.</div></div>
    <div class="v bot"><table>${st.cats.map((c, k) => `<tr><td><i class="sw" style="background:${COLS[k]}"></i>${c}</td><td class="r"><b>${st.count[k]}</b></td></tr>`).join("")}</table>
    <div class="att">${st.total} second-hand places in Leipzig on OpenStreetMap · ${ATT}</div></div>`);
});
await poster("post2_what_kinds", ({ ATT }) => {
  const st = S.st, COLS = ["#e4572e", "#f2a541", "#8e5572", "#2e86ab", "#1b998b", "#c84b9e", "#5c6b73"], mx = Math.max(...st.count);
  S.map.resize(); S.map.jumpTo({ center: [12.378, 51.318], zoom: 11.55, pitch: 0, bearing: 0 });
  S.map.setPaintProperty("pl", "circle-radius", 7); S.map.setPaintProperty("plh", "circle-radius", 15);
  document.body.insertAdjacentHTML("beforeend", `<div class="v top"><div class="eb">#30DayMapChallenge · Day 12 · Power · Leipzig</div>
    <h1>What kinds of <em>secondhand</em>?</h1><div class="q">${st.total} places across Leipzig, by type. Used cars are the biggest group, spread along the arterial
    roads; fashion, general second-hand and antiques gather in ${st.top_ortsteile_places.slice(0, 4).map(o => o[0]).join(", ")}.</div></div>
    <div class="v bot"><table>${st.cats.map((c, k) => `<tr><td><i class="sw" style="background:${COLS[k]}"></i>${c}</td>
      <td class="r" style="width:330px"><span class="bar" style="width:${260 * st.count[k] / mx}px;background:${COLS[k]}"></span></td><td class="r" style="width:60px"><b>${st.count[k]}</b></td>
      <td class="r" style="width:70px;color:#8f887c">${Math.round(100 * st.count[k] / st.total)}%</td></tr>`).join("")}</table><div class="att">${ATT}</div></div>`);
});
await poster("post3_hinterland", ({ ATT }) => {
  const st = S.st, H = st.hinterland, f = n => Math.round(n).toLocaleString("en-GB");
  S.mode = "hinter"; restyle(); S.map.resize(); S.map.jumpTo({ center: [12.378, 51.322], zoom: 11.6, pitch: 25, bearing: 0 });
  document.body.insertAdjacentHTML("beforeend", `<div class="v top"><div class="eb">#30DayMapChallenge · Day 12 · Power · Leipzig</div>
    <h1>How strong is <em>the hinterland?</em></h1><div class="q">Colour: how many second-hand places can be reached from each 100 m of the city within a
    15-minute walk (1.2 km on real paths and streets).</div></div>
    <div class="v bot"><div class="kp"><div><b>${Math.round(100 * H.covered_any / H.residents)}%</b><span>of ${f(H.residents)} residents live within a 15-min walk of one</span></div>
      <div><b>${H.mean_reachable.toFixed(1)}</b><span>places reachable on foot from an average home</span></div>
      <div><b>${st.top_ortsteile_walk[0][0]}</b><span>strongest hinterland: ${st.top_ortsteile_walk[0][1].toFixed(1)} places on foot</span></div></div>
      <div class="ramp" style="background:linear-gradient(90deg,#f1eefb,#cfc6f1,#a397e2,#7563cc,#47369f,#2a1d6e)"></div><div class="ends"><span>0</span><span>1</span><span>3</span><span>6</span><span>10+ places</span></div>
      <div class="att">${ATT}</div></div>`);
});
await br.close(); process.exit(0);
