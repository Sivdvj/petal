import { build, context } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, "dist");
const watch = process.argv.includes("--watch");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

function copyStatic() {
  cpSync(path.join(root, "manifest.json"), path.join(dist, "manifest.json"));
  cpSync(path.join(root, "src/viewer/viewer.html"), path.join(dist, "viewer.html"));
  cpSync(path.join(root, "icons"), path.join(dist, "icons"), { recursive: true });

  const pdfjs = path.join(root, "node_modules/pdfjs-dist");
  cpSync(path.join(pdfjs, "build/pdf.worker.min.mjs"), path.join(dist, "pdf.worker.min.mjs"));
  cpSync(path.join(pdfjs, "cmaps"), path.join(dist, "cmaps"), { recursive: true });
  cpSync(path.join(pdfjs, "standard_fonts"), path.join(dist, "standard_fonts"), { recursive: true });
}

const backgroundOpts = {
  entryPoints: [path.join(root, "src/background/background.js")],
  outfile: path.join(dist, "background.js"),
  bundle: true,
  format: "iife",
  target: "chrome110",
  logLevel: "info",
};

const viewerScriptOpts = {
  entryPoints: [path.join(root, "src/viewer/viewer.js")],
  outfile: path.join(dist, "viewer.js"),
  bundle: true,
  format: "esm",
  target: "chrome110",
  logLevel: "info",
};

const viewerStyleOpts = {
  entryPoints: [path.join(root, "src/styles/main.css")],
  outdir: dist,
  entryNames: "viewer",
  assetNames: "fonts/[name]",
  loader: { ".woff2": "file" },
  bundle: true,
  target: "chrome110",
  logLevel: "info",
};

if (watch) {
  copyStatic();
  const contexts = await Promise.all(
    [backgroundOpts, viewerScriptOpts, viewerStyleOpts].map((opts) => context(opts))
  );
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log("Watching for changes... (static files are copied once; re-run build.mjs if you change them)");
} else {
  await Promise.all([build(backgroundOpts), build(viewerScriptOpts), build(viewerStyleOpts)]);
  copyStatic();
  console.log("Build complete -> dist/");
}
