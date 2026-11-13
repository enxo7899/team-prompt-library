// Lints every assistant in assistants/. Exits 1 if any check fails.
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadLibrary } from "../src/load.js";
import { lintLibrary, CHECKS } from "../src/lint.js";

const root = fileURLToPath(new URL("..", import.meta.url));
export const read = (p) => readFile(root + p, "utf8");

async function dirFiles(slug) {
  const base = `${root}assistants/${slug}/`;
  const out = [];
  for (const e of await readdir(base, { withFileTypes: true })) {
    if (e.isDirectory()) for (const f of await readdir(base + e.name)) out.push(`${e.name}/${f}`);
    else out.push(e.name);
  }
  return out;
}

export async function loadAll() {
  const config = JSON.parse(await read("src/lint.config.json"));
  const bundles = await loadLibrary(read);
  for (const b of bundles) b.dirFiles = await dirFiles(b.slug);
  return { config, bundles };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { config, bundles } = await loadAll();
  const lib = lintLibrary(bundles, config);
  for (const r of lib.reports) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.slug}  (${r.passed}/${r.checks.length} checks)`);
    for (const c of r.checks) for (const i of c.issues) console.log(`      [${c.id}] ${i}`);
  }
  console.log(`\n${lib.reports.length} assistants, ${lib.checksRun} checks, ${lib.ok ? "all passing" : "FAILURES"}`);
  process.exit(lib.ok ? 0 : 1);
}
