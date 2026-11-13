// Documentation-only build: makes the two public guide PDFs from the guide pages.
// The pictures are real app screens (see below).
// The Apple Watch (0.9.8) chapters contain source-matched SVG diagrams also included in PDFs.
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const screenDir = path.join(root, "marker/assets/screens");
const guides = ["marker/quick-start/index.html", "marker/guide/index.html"];
await fs.mkdir(screenDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  /* 13 Nov 2026: the pictures are real screens of The Marker 1.1.0, taken by
     test/ui/doc-shots.mjs in the marker repo (made-up golfers) and copied into
     marker/assets/screens. Nothing is drawn here any more. */
  for (const filename of guides) {
    let html = await fs.readFile(path.join(root,filename),"utf8");
    // Old fixture links (if any) become the real pictures.
    html = html.replace(/<iframe class="source-screen"[^>]*src="\.\.\/screens\/\?view=([^"]+)"[^>]*><\/iframe>/g,
      (_,view) => '<a href="../screens/?view='+view+'" target="_blank" rel="noopener"><img class="source-image" loading="lazy" src="../assets/screens/'+view+'.png" alt="The Marker '+view+' screen — source-matched interface"></a>');
    html = html.replace(/(assets\/screens\/[^"?]+\.png)(?:\?v=[^" ]+)?/g, "$1?v=1.1.0");
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
