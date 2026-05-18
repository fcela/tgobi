import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const cssPath = resolve(root, "dist-lib", "tgobi.css");

if (!existsSync(cssPath)) {
  console.error("dist-lib/tgobi.css not found");
  process.exit(1);
}

let css = readFileSync(cssPath, "utf-8");

const fontUrlRegex = /url\((\/fonts\/[^")\s]+)\)/g;
let changed = false;

css = css.replace(fontUrlRegex, (_match, fontPath) => {
  const fullPath = resolve(root, "public", fontPath);
  if (!existsSync(fullPath)) return _match;
  changed = true;
  const data = readFileSync(fullPath);
  const base64 = data.toString("base64");
  const ext = fullPath.slice(fullPath.lastIndexOf(".") + 1);
  const mime = ext === "woff2" ? "font/woff2" : ext === "woff" ? "font/woff" : "application/octet-stream";
  return `url("data:${mime};base64,${base64}")`;
});

if (changed) {
  writeFileSync(cssPath, css);
  console.log("Fonts inlined in dist-lib/tgobi.css");
} else {
  console.log("No font URLs found to inline");
}
