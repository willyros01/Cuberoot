// Documentation-only build. Captures static screen fixtures using the exact Marker CSS
// and DOM patterns from its app.js, then updates the two public guide PDFs.
// The Apple Watch (0.9.8) chapters contain source-matched SVG diagrams also included in PDFs.
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const screenDir = path.join(root, "marker/assets/screens");
const scenes = ["choose","signin","setup","course","manual","photo","verify","players","games",
                "one","all","typed","card","fixing","date","corrections","correct","repost","start-member","totals","post","status","share","history","help","menu",
                "caddie-offer","caddie-join","caddie-live","follow-offer","follow-join","follow-live"];
// Legacy scenes from Marker 0.6.4; caddie/follower scenes source-based on 0.8.3.
const guides = ["marker/quick-start/index.html", "marker/guide/index.html"];
await fs.mkdir(screenDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const scene of scenes) {
    const page = await browser.newPage({ viewport: { width: 430, height: 800 }, deviceScaleFactor: 2 });
    const errors=[]; page.on("pageerror", error=>errors.push(error.message));
    const uri = pathToFileURL(path.join(root,"marker/screens/index.html")).href + "?view=" + scene;
    await page.goto(uri, { waitUntil: "load" });
    const result = await page.locator("#app").innerText();
    const expected={"caddie-offer":"Let my caddie score","caddie-join":"Join the card","caddie-live":"Your caddie is scoring","follow-offer":"Let others follow","follow-join":"Follow the card","follow-live":"Following"};
    if(expected[scene]&&!result.includes(expected[scene]))throw new Error("Wrong Marker scene: "+scene);
    if(scene.endsWith("-offer")&&await page.locator("svg.qr").count()!==1)throw new Error("Missing example QR: "+scene);
    if (!result.trim() || result.includes("could not start")) throw new Error("Fixture failed: " + scene+" "+errors.join("; "));
    await page.screenshot({ path:path.join(screenDir, scene+".png"), fullPage: !["manual","photo"].includes(scene),
      animations: "disabled" });
    await page.close();
  }
  for (const filename of guides) {
    let html = await fs.readFile(path.join(root,filename),"utf8");
    // Static images are generated from the actual Marker stylesheet, not by AI.
    html = html.replace(/<iframe class="source-screen"[^>]*src="\.\.\/screens\/\?view=([^"]+)"[^>]*><\/iframe>/g,
      (_,view) => '<a href="../screens/?view='+view+'" target="_blank" rel="noopener"><img class="source-image" loading="lazy" src="../assets/screens/'+view+'.png" alt="The Marker '+view+' screen — source-matched interface"></a>');
    html = html.replace(/(assets\/screens\/[^"?]+\.png)(?:\?v=[^" ]+)?/g, "$1?v=0.8.3");
    await fs.writeFile(path.join(root,filename),html);
    const page=await browser.newPage({ viewport:{width:1280,height:920}, deviceScaleFactor:1 });
    await page.goto(pathToFileURL(path.join(root,filename)).href,{waitUntil:"load"});
    await page.emulateMedia({media:"print"});
    await page.evaluate(async()=>{ await document.fonts.ready; 
      // Eager-load images that would otherwise remain deferred below the viewport.
      for (const img of document.images) img.loading = "eager";
      await Promise.all([...document.images].map(x=>x.decode().catch(()=>{}))); 
    });
    const output = filename.includes("quick-start")?
       "guides/the-marker/marker-quick-starter.pdf":"guides/the-marker/marker-user-guide.pdf";
    await page.pdf({path:path.join(root,output),format:"A4",printBackground:true,
      margin:{top:"12mm",right:"12mm",bottom:"12mm",left:"12mm"}});
    await page.close();
  }
  const ixPath=path.join(root,"guides/index.json");
  const index=JSON.parse(await fs.readFile(ixPath,"utf8"));
  for(const item of index.apps["the-marker"].docs){

    const stat=await fs.stat(path.join(root,item.path));
    item.size=stat.size;
    item.date=new Date().toISOString();
  }
  await fs.writeFile(ixPath,JSON.stringify(index,null,2)+"\n");
} finally { await browser.close(); }
