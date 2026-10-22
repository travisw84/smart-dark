import { build } from "esbuild";
import { mkdir, cp, rm, copyFile } from "node:fs/promises";
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("public", "dist", { recursive: true });
await build({
  entryPoints: ["src/content.js"],
  bundle: true,
  outdir: "dist",
  format: "iife",
  target: "chrome120",
  minify: true,
  legalComments: "eof",
});
await build({
  entryPoints: ["src/background.js", "src/popup.js", "src/options.js"],
  bundle: true,
  outdir: "dist",
  format: "esm",
  target: "chrome120",
  minify: true,
  legalComments: "eof",
});
await copyFile(
  "node_modules/darkreader/LICENSE",
  "dist/DARK_READER_LICENSE.txt",
);
await copyFile("README.md", "dist/README.md");
console.log("Built dist/ for Load unpacked.");
