// Regenerates lib/licenses.json from the installed production dependencies.
import { readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const rows = Object.keys(pkg.dependencies)
  .sort()
  .map((name) => {
    const p = JSON.parse(readFileSync(`node_modules/${name}/package.json`, "utf8"));
    const repo = typeof p.repository === "string" ? p.repository : p.repository?.url ?? "";
    const url = (p.homepage || repo).replace("git+", "").replace(/\.git$/, "").replace("git://", "https://");
    return { name, version: p.version, license: p.license ?? "", url };
  });
writeFileSync("lib/licenses.json", JSON.stringify(rows, null, 2) + "\n");
console.log(`lib/licenses.json: ${rows.length} packages`);
