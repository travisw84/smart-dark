import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
const root = process.cwd();
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Smart Dark visual test</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#10131a;color:#e5e9f1;font:15px system-ui}header{padding:24px 32px}h1{font-size:25px;margin:0 0 8px}p{color:#aebbd0}main{display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:0 24px 24px}h2{font-size:14px}iframe{width:100%;height:650px;border:1px solid #48536a;border-radius:12px;background:white}@media(max-width:800px){main{grid-template-columns:1fr}}</style></head><body><header><h1>Smart Dark</h1><p>Synthetic visual fixture · Same page, original and adaptive · No AI calls</p></header><main><section><h2>Original website</h2><iframe title="Original website" src="/demo"></iframe></section><section><h2>Smart Dark theme</h2><iframe title="Adaptive dark website" src="/demo?dark=1"></iframe></section></main></body></html>`;
const demo = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:white;color:#263043;font:14px system-ui}header{padding:20px 24px;border-bottom:1px solid #ddd;display:flex;align-items:center;justify-content:space-between}header strong{color:#295fcc}a{color:#2464cf}main{padding:24px}h1{font-size:26px;letter-spacing:-.8px;margin:0 0 10px}p{line-height:1.7;color:#626d7d}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:22px 0}.card{background:#f2f4f7;border:1px solid #d8dde5;border-radius:12px;padding:18px}.card strong{display:block;font-size:26px;color:#202b3d}.label{font-size:12px;color:#6a7484}.accent{background:#2864d5;color:white;border:0;border-radius:7px;padding:12px 18px}input{background:white;border:1px solid #aeb7c5;color:#1f2937;border-radius:7px;padding:12px;width:100%;margin:10px 0 14px}aside{background:#202936;color:#e5e9f1;border-radius:12px;padding:20px;margin-top:24px}aside p{color:#b7c5d8;margin-bottom:0}.swatches{display:flex;height:46px;border-radius:8px;overflow:hidden;margin-top:14px}.swatches span{flex:1}footer{font-size:12px;color:#6a7484;padding:0 24px 24px}</style></head><body><header><strong>Studio / overview</strong><a href="#report">View report</a></header><main><h1>Project overview</h1><p>Track projects, review this week's activity and create a new project.</p><div class="grid"><div class="card"><span class="label">Projects in progress</span><strong>12</strong><p>4 due this week.</p></div><div class="card"><span class="label">Weekly activity</span><strong>86%</strong><p>Up 6% this week.</p></div></div><label for="name">Project name</label><input id="name" placeholder="Give your project a name"><button class="accent">Create project</button><aside><strong>Existing dark panel</strong><p>This panel keeps its existing colours.</p></aside><div class="swatches" data-smart-dark-preserve aria-label="Preserved artwork colours"><span style="background:#e85c4a"></span><span style="background:#edbd54"></span><span style="background:#43a88a"></span><span style="background:#4f7dd9"></span></div></main><footer>Clearly labelled synthetic fixture. No customer data.</footer><script type="module">if(location.search.includes('dark=1')){const {startRenderer}=await import('/src/renderer.js');startRenderer('neutral');}</script></body></html>`;
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end(page);
      return;
    }
    if (url.pathname === "/demo") {
      res.setHeader("Content-Type", "text/html");
      res.end(demo);
      return;
    }
    const file = path.resolve(root, "." + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + "/")) {
      res.writeHead(403).end();
      return;
    }
    const data = await readFile(file);
    res.setHeader(
      "Content-Type",
      file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".html")
            ? "text/html"
            : "application/octet-stream",
    );
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});
server.listen(4178, "127.0.0.1", () =>
  console.log("Smart Dark visual fixture: http://127.0.0.1:4178"),
);
