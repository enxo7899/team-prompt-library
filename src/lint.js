// The prompt linter. Pure functions: give it a loaded assistant bundle and the config,
// get back a report. Runs in Node (npm run lint, tests) and in the browser page.
import { wordCount, charCount, findPhrases } from "./text.js";
import { placeholders, parse } from "./template.js";

export const CHECKS = [
  { id: "meta", title: "Metadata is complete", what: "meta.json has a name, purpose, owner role, inputs, output format, do and don't lists, model settings and where to paste it in ChatGPT and Claude." },
  { id: "sections", title: "Required sections are present", what: "Instructions have Role, Audience, Inputs, Output format, Rules, Refusals and escalation, and Examples, each with real content." },
  { id: "length", title: "Word limits", what: "Instructions stay between 180 and 700 words and under 8,000 characters (the Custom GPT limit); knowledge files and example outputs stay inside their limits." },
  { id: "placeholders", title: "No placeholder text left", what: "No TODO, TBD, lorem ipsum, [insert ...] or unfilled {{field}} in instructions, knowledge or examples." },
  { id: "rules", title: "Rules are numbered and testable", what: "Rules are numbered R1, R2, ... and each uses a hard word (never, always, only, must, or fewer) instead of vague advice like 'try to'." },
  { id: "coverage", title: "Every rule has an example", what: "Each rule is exercised by at least one example, declared with tags in meta.json, and there are at least 3 examples." },
  { id: "knowledge", title: "Knowledge files are used", what: "At least 2 knowledge files exist and the instructions name every one of them." },
  { id: "template", title: "Input template matches", what: "Template fields equal the declared inputs, and every example input follows the template exactly." },
  { id: "banned", title: "No banned phrases in outputs", what: "Example outputs contain none of the library-wide or assistant-specific banned phrases." },
  { id: "format", title: "Outputs match the declared format", what: "Every example output meets its format: required lines or headings, JSON that parses, length limits per field, word limits." },
];

const TITLES = Object.fromEntries(CHECKS.map((c) => [c.id, c.title]));

export function parseSections(md = "") {
  const out = {};
  let cur = null;
  for (const line of md.split("\n")) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) { cur = m[1].toLowerCase(); out[cur] = ""; continue; }
    if (cur) out[cur] += line + "\n";
  }
  return out;
}

export function extractRules(body = "") {
  const rules = [];
  for (const line of body.split("\n")) {
    const m = /^R(\d+)\.\s+(.+)$/.exec(line.trim());
    if (m) rules.push({ id: `R${m[1]}`, n: Number(m[1]), text: m[2] });
  }
  return rules;
}

export function getRules(bundle) {
  return extractRules(parseSections(bundle.instructions)["rules"] || "");
}

function checkMeta(b) {
  const m = b.meta || {};
  const issues = [...(b.loadErrors || [])];
  for (const k of ["name", "purpose", "ownerRole"]) if (!String(m[k] || "").trim()) issues.push(`meta.${k} is missing`);
  if (m.slug !== b.slug) issues.push(`meta.slug "${m.slug}" does not match the folder "${b.slug}"`);
  if (!Array.isArray(m.inputs) || !m.inputs.length) issues.push("meta.inputs must list at least one input");
  else for (const i of m.inputs) if (!i.name || !i.label) issues.push("every input needs a name and a label");
  if (!["text", "markdown", "json"].includes(m.output?.format)) issues.push('meta.output.format must be "text", "markdown" or "json"');
  if (!(m.output?.maxWords > 0)) issues.push("meta.output.maxWords must be a number");
  for (const k of ["do", "dont"]) if (!Array.isArray(m.doDont?.[k]) || m.doDont[k].length < 2) issues.push(`meta.doDont.${k} needs at least 2 items`);
  if (!m.modelSettings || m.modelSettings.temperature === undefined || !m.modelSettings.notes) issues.push("meta.modelSettings needs temperature and notes");
  for (const k of ["chatgpt", "claude"]) if (!String(m.paste?.[k] || "").trim()) issues.push(`meta.paste.${k} is missing`);
  if (b.dirFiles) {
    const listed = new Set([...(m.knowledge || []).map((f) => `knowledge/${f}`), ...(m.examples || []).flatMap((e) => [`examples/${e.input}`, `examples/${e.output}`]), "meta.json", "instructions.md", "input-template.md"]);
    for (const f of b.dirFiles) if (!listed.has(f)) issues.push(`${f} exists but meta.json does not list it`);
  }
  return issues;
}

function checkSections(b, cfg) {
  const issues = [];
  const secs = parseSections(b.instructions);
  for (const name of cfg.requiredSections) {
    if (!(name in secs)) issues.push(`Missing section "## ${name[0].toUpperCase() + name.slice(1)}"`);
    else if (wordCount(secs[name]) < cfg.minSectionWords) issues.push(`Section "${name}" is almost empty (under ${cfg.minSectionWords} words)`);
  }
  return issues;
}

function checkLength(b, cfg) {
  const issues = [];
  const w = wordCount(b.instructions);
  const c = charCount(b.instructions);
  if (w < cfg.instructionWords.min) issues.push(`Instructions are ${w} words; the minimum is ${cfg.instructionWords.min}`);
  if (w > cfg.instructionWords.max) issues.push(`Instructions are ${w} words; the limit is ${cfg.instructionWords.max}`);
  if (c > cfg.instructionMaxChars) issues.push(`Instructions are ${c} characters; Custom GPTs accept ${cfg.instructionMaxChars}`);
  for (const [f, t] of Object.entries(b.knowledge || {})) {
    const kw = wordCount(t);
    if (kw < cfg.knowledgeWords.min) issues.push(`knowledge/${f} is ${kw} words; the minimum is ${cfg.knowledgeWords.min}`);
    if (kw > cfg.knowledgeWords.max) issues.push(`knowledge/${f} is ${kw} words; the limit is ${cfg.knowledgeWords.max}`);
  }
  return issues;
}

function checkPlaceholders(b, cfg) {
  const issues = [];
  const res = cfg.placeholderPatterns.map((p) => new RegExp(p, "i"));
  const scan = (label, text) => {
    for (const re of res) { const m = re.exec(text || ""); if (m) issues.push(`${label} contains placeholder text "${m[0]}"`); }
  };
  scan("Instructions", b.instructions);
  for (const [f, t] of Object.entries(b.knowledge || {})) scan(`knowledge/${f}`, t);
  for (const ex of b.examples || []) { scan(`Example ${ex.id} input`, ex.input); scan(`Example ${ex.id} output`, ex.output); }
  return issues;
}

function checkRules(b, cfg) {
  const issues = [];
  const rules = getRules(b);
  if (rules.length < cfg.minRules) issues.push(`Only ${rules.length} numbered rules found; at least ${cfg.minRules} are required (format: "R1. Never ...")`);
  let jumped = false;
  rules.forEach((r, i) => {
    if (r.n !== i + 1 && !jumped) { jumped = true; issues.push(`Rule numbering jumps at ${r.id}; expected R${i + 1}`); }
    const low = r.text.toLowerCase();
    if (!cfg.hardWords.some((h) => low.includes(h))) issues.push(`${r.id} has no hard word (never, always, only, must, or fewer): it cannot be tested`);
    const weak = cfg.weakPhrases.filter((p) => low.includes(p));
    if (weak.length) issues.push(`${r.id} uses vague wording: "${weak.join('", "')}"`);
  });
  return issues;
}

function checkCoverage(b, cfg) {
  const issues = [];
  const rules = getRules(b);
  const ids = new Set(rules.map((r) => r.id));
  const exs = b.meta?.examples || [];
  if (exs.length < cfg.minExamples) issues.push(`${exs.length} examples declared; at least ${cfg.minExamples} are required`);
  const covered = new Set();
  for (const ex of exs) {
    if (!ex.tags?.length) issues.push(`Example ${ex.id} has no rule tags`);
    for (const t of ex.tags || []) {
      if (!ids.has(t)) issues.push(`Example ${ex.id} is tagged ${t}, which is not a rule in the instructions`);
      covered.add(t);
    }
  }
  for (const r of rules) if (!covered.has(r.id)) issues.push(`${r.id} has no example exercising it`);
  return issues;
}

function checkKnowledge(b, cfg) {
  const issues = [];
  const files = b.meta?.knowledge || [];
  if (files.length < cfg.minKnowledgeFiles) issues.push(`${files.length} knowledge files; at least ${cfg.minKnowledgeFiles} are required`);
  for (const f of files) if (!b.instructions.includes(f)) issues.push(`Instructions never mention knowledge/${f}`);
  return issues;
}

function checkTemplate(b) {
  const issues = [];
  const fields = placeholders(b.template || "");
  const declared = (b.meta?.inputs || []).map((i) => i.name);
  for (const f of fields) if (!declared.includes(f)) issues.push(`Template field {{${f}}} is not declared in meta.inputs`);
  for (const d of declared) if (!fields.includes(d)) issues.push(`Input "${d}" is declared but missing from input-template.md`);
  for (const ex of b.examples || []) {
    const vals = parse(b.template || "", ex.input || "");
    if (!vals) { issues.push(`Example ${ex.id} input does not follow input-template.md`); continue; }
    for (const i of b.meta?.inputs || []) {
      if (i.required && !vals[i.name]) issues.push(`Example ${ex.id} leaves the required input "${i.name}" empty`);
    }
  }
  return issues;
}

function checkBanned(b, cfg) {
  const issues = [];
  const list = [...cfg.bannedPhrases, ...(b.meta?.output?.bannedPhrases || [])];
  for (const ex of b.examples || []) {
    const hit = findPhrases(ex.output || "", list);
    if (hit.length) issues.push(`Example ${ex.id} output uses banned phrase "${hit.join('", "')}"`);
  }
  return issues;
}

function checkJson(b, ex, out, issues) {
  const label = `Example ${ex.id}`;
  let data;
  try { data = JSON.parse(ex.output); } catch (e) { issues.push(`${label}: output is not valid JSON (${e.message})`); return; }
  const j = out.json || {};
  for (const k of j.rootKeys || []) if (!(k in data)) issues.push(`${label}: missing top-level key "${k}"`);
  const items = data?.[j.itemsPath];
  if (!Array.isArray(items)) { issues.push(`${label}: "${j.itemsPath}" must be an array`); return; }
  items.forEach((it, i) => {
    const at = `${label} ${j.itemsPath}[${i}]`;
    for (const k of j.itemKeys || []) if (!(k in it)) issues.push(`${at}: missing key "${k}"`);
    const lb = j.limitsByField;
    if (lb && typeof it[lb.field] === "string") {
      const lim = lb.limits[it[lb.keyField]];
      if (lim === undefined) issues.push(`${at}: unknown ${lb.keyField} "${it[lb.keyField]}"`);
      else if (charCount(it[lb.field]) > lim) issues.push(`${at}: ${lb.field} is ${charCount(it[lb.field])} characters; ${it[lb.keyField]} allows ${lim}`);
    }
    for (const [f, r] of Object.entries(j.arrayLimits || {})) {
      const n = Array.isArray(it[f]) ? it[f].length : -1;
      if (n < r.min || n > r.max) issues.push(`${at}: ${f} has ${n} items; allowed ${r.min} to ${r.max}`);
    }
    for (const [f, max] of Object.entries(j.stringMax || {})) {
      if (typeof it[f] === "string" && charCount(it[f]) > max) issues.push(`${at}: ${f} is ${charCount(it[f])} characters; limit ${max}`);
    }
    const lm = j.lengthFieldMatches;
    if (lm && typeof it[lm.of] === "string" && it[lm.count] !== charCount(it[lm.of])) {
      issues.push(`${at}: ${lm.count} is ${it[lm.count]} but ${lm.of} is ${charCount(it[lm.of])} characters`);
    }
    for (const [f, allowed] of Object.entries(j.enums || {})) if (!allowed.includes(it[f])) issues.push(`${at}: ${f} "${it[f]}" is not one of ${allowed.join(", ")}`);
    if (j.allowedFrom) {
      const bank = new Set((b.knowledge?.[j.allowedFrom.knowledge] || "").match(/#[\p{L}\p{N}_]+/gu)?.map((s) => s.toLowerCase()));
      for (const h of it[j.allowedFrom.field] || []) if (!bank.has(String(h).toLowerCase())) issues.push(`${at}: hashtag ${h} is not in ${j.allowedFrom.knowledge}`);
    }
  });
  for (const [i, f] of (Array.isArray(data.flags) ? data.flags : []).entries()) {
    for (const k of j.flagKeys || []) if (!f?.[k]) issues.push(`${label} flags[${i}]: missing "${k}"`);
  }
}

function checkFormat(b) {
  const issues = [];
  const out = b.meta?.output || {};
  for (const ex of b.examples || []) {
    const t = ex.output || "";
    const label = `Example ${ex.id}`;
    if (!t.trim()) { issues.push(`${label}: output is empty`); continue; }
    const words = wordCount(t);
    if (out.maxWords && words > out.maxWords) issues.push(`${label}: ${words} words; the limit is ${out.maxWords}`);
    for (const re of out.forbidPatterns || []) if (new RegExp(re, "u").test(t)) issues.push(`${label}: output contains data that must never appear (matches /${re}/)`);
    if (out.refusalPrefix && t.trim().startsWith(out.refusalPrefix)) continue;
    if (out.format === "json") { checkJson(b, ex, out, issues); continue; }
    for (const s of out.mustContain || []) if (!t.includes(s)) issues.push(`${label}: output is missing "${s}"`);
    for (const re of out.mustMatch || []) if (!new RegExp(re, "m").test(t)) issues.push(`${label}: output has nothing matching /${re}/`);
    if (out.format === "text" && out.forbidMarkdown && /(\*\*|^#{1,6}\s|`)/m.test(t)) issues.push(`${label}: output contains markdown but plain text is required`);
    if (out.format === "markdown" && out.requiredHeadings?.length) {
      const found = [...t.matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => m[1].toLowerCase());
      let from = 0;
      for (const h of out.requiredHeadings) {
        const at = found.indexOf(h.toLowerCase(), from);
        if (at < 0) issues.push(`${label}: heading "## ${h}" is missing or out of order`);
        else from = at + 1;
      }
    }
  }
  return issues;
}

export function lintBundle(bundle, config) {
  const checks = [];
  const add = (id, issues, level = "fail") => checks.push({ id, title: TITLES[id], status: issues.length ? level : "pass", issues });
  add("meta", checkMeta(bundle));
  add("sections", checkSections(bundle, config));
  add("length", checkLength(bundle, config));
  add("placeholders", checkPlaceholders(bundle, config));
  add("rules", checkRules(bundle, config));
  add("coverage", checkCoverage(bundle, config));
  add("knowledge", checkKnowledge(bundle, config));
  add("template", checkTemplate(bundle));
  add("banned", checkBanned(bundle, config));
  add("format", checkFormat(bundle));
  const errors = checks.filter((c) => c.status === "fail").length;
  return { slug: bundle.slug, name: bundle.meta?.name || bundle.slug, checks, errors, passed: checks.length - errors, ok: errors === 0 };
}

export function lintLibrary(bundles, config) {
  const reports = bundles.map((b) => lintBundle(b, config));
  return { reports, ok: reports.every((r) => r.ok), checksRun: reports.reduce((n, r) => n + r.checks.length, 0) };
}
