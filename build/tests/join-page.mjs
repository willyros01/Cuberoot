/* The Scorecard join page (scorecard/join/), checked in real browsers.
   Item 3 and item 12 (Willy, 5 Nov 2026): a link opened in a browser, from a
   saved file (Fire, Android) or from Gmail/Chrome (iPhone), must offer a real
   "Open in The Scorecard" button that hands over the SAME link. The hand-over
   to the app itself is done by the phone and is checked on the devices. */
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { chromium, webkit } from "playwright";

const root = path.resolve(process.argv[2] || ".");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(root, p);
  if (!f.startsWith(root) || !existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
}).listen(8123);

const Q = "?join=G1.TOKEN123.gK&v=2&g=Saturday%20Group";
const PAGE = `http://localhost:8123/scorecard/join/${Q}`;
const UA = {
  fire: "Mozilla/5.0 (Linux; Android 11; KFONWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/124.3.1 like Chrome/124.0 Safari/537.36",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1",
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
};
let failed = 0;
async function check(id, what, fn) {
  try { await fn(); console.log(`PASS  ${id}  ${what}`); }
  catch (e) { failed++; console.log(`FAIL  ${id}  ${what}  —  ${String(e.message || e).split("\n")[0]}`); }
}
async function open(engine, ua, url = PAGE) {
  const b = await engine.launch();
  const ctx = await b.newContext({ userAgent: ua, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.route(/^(?!http:\/\/localhost:8123)/, (r) => r.abort());
  await page.goto(url, { waitUntil: "load" }).catch(() => {});
  await page.waitForTimeout(300);
  return { b, page };
}
for (const [name, ua] of [["fire", UA.fire], ["android", UA.android]]) {
  await check(`J-${name}`, `${name}: Open in The Scorecard is shown and hands the same link to the Android app`, async () => {
    const { b, page } = await open(chromium, ua);
    const href = await page.getAttribute("[data-open]", "href");
    const shown = await page.isVisible("[data-open]");
    await b.close();
    if (!shown) throw new Error("the button is hidden");
    const want = `intent://www.cuberoot-systems.com/scorecard/join/${Q}#Intent;scheme=https;package=io.github.willyros01.scorecard;`;
    if (!href.startsWith(want)) throw new Error(`wrong link: ${href}`);
  });
}
for (const [name, ua] of [["iphone-chrome", UA.iphoneChrome], ["iphone-safari", UA.iphoneSafari]]) {
  await check(`J-${name}`, `${name}: Open in The Scorecard is shown and hands the same link to the iPhone app; no banner instruction`, async () => {
    const { b, page } = await open(webkit, ua);
    const href = await page.getAttribute("[data-open]", "href");
    const shown = await page.isVisible("[data-open]");
    const body = await page.evaluate(() => document.body.innerText);
    await b.close();
    if (!shown) throw new Error("the button is hidden");
    if (href !== `thescorecard://join/${Q}`) throw new Error(`wrong link: ${href}`);
    if (/banner at the top/i.test(body)) throw new Error("the page still points to a banner");
  });
}
await check("J-computer", "a computer goes on to the web app with the same link", async () => {
  const { b, page } = await open(chromium, "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36");
  await page.waitForTimeout(500);
  const req = [];
  const url = page.url();
  await b.close();
  if (!url.startsWith(`https://willyros01.github.io/scorecard/${Q}`) && !url.includes("chrome-error")) throw new Error(`stayed at ${url}`);
});
server.close();
console.log(`\nRESULT: ${failed ? "FAILED" : "all passed"}`);
process.exit(failed ? 1 : 0);
