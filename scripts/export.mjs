// Writes copy-paste bundles to dist/: one .md per assistant for a ChatGPT Custom GPT,
// a folder per assistant for a Claude Project, and dist/index.json. No zip files.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAll } from "./lint.mjs";
import { lintLibrary } from "../src/lint.js";
import { chatgptMarkdown, claudeProjectFiles, libraryIndex } from "../src/export.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = root + "dist/";
const { config, bundles } = await loadAll();
const lib = lintLibrary(bundles, config);
if (!lib.ok) {
  console.error("Lint failed. Fix the prompts before exporting (npm run lint).");
  process.exit(1);
}
await rm(dist, { recursive: true, force: true });
const write = async (rel, content) => {
  await mkdir(dirname(dist + rel), { recursive: true });
  await writeFile(dist + rel, content);
};
let n = 0;
for (const b of bundles) {
  await write(`${b.slug}/chatgpt-custom-gpt.md`, chatgptMarkdown(b)); n++;
  for (const f of claudeProjectFiles(b)) { await write(f.path, f.content); n++; }
}
await write("index.json", JSON.stringify(libraryIndex(bundles, lib.reports), null, 2) + "\n");
console.log(`Wrote ${n + 1} files to dist/ for ${bundles.length} assistants.`);
