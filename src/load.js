// Loads one assistant folder into a plain object. `read(path)` returns a promise of text
// (fs in Node, fetch in the browser), so the same linter runs in both places.
export async function loadBundle(read, slug) {
  const base = `assistants/${slug}/`;
  const loadErrors = [];
  const get = async (p) => {
    try { return await read(base + p); } catch { loadErrors.push(`Cannot read ${p}`); return ""; }
  };
  let meta = {};
  try { meta = JSON.parse(await get("meta.json")); } catch { loadErrors.push("meta.json is not valid JSON"); }
  const instructions = await get("instructions.md");
  const template = await get("input-template.md");
  const knowledge = {};
  for (const f of meta.knowledge || []) knowledge[f] = await get(`knowledge/${f}`);
  const examples = [];
  for (const ex of meta.examples || []) {
    examples.push({ ...ex, inputFile: ex.input, outputFile: ex.output, input: await get(`examples/${ex.input}`), output: await get(`examples/${ex.output}`) });
  }
  return { slug, meta, instructions, template, knowledge, examples, loadErrors };
}

export async function loadLibrary(read) {
  const slugs = JSON.parse(await read("assistants/index.json"));
  return Promise.all(slugs.map((s) => loadBundle(read, s)));
}
