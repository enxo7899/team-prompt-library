import test from "node:test";
import assert from "node:assert/strict";
import { chatgptMarkdown, claudeProjectFiles, libraryIndex } from "../src/export.js";
import { lintLibrary } from "../src/lint.js";
import { bundles, config, get } from "./helpers.js";

test("the ChatGPT bundle is one file holding the instructions and every knowledge file", () => {
  const b = get("contract-summariser");
  const md = chatgptMarkdown(b);
  assert.ok(md.includes(b.instructions.trim()));
  for (const [file, text] of Object.entries(b.knowledge)) {
    assert.ok(md.includes(`### ${file}`));
    assert.ok(md.includes(text.trim()));
  }
  assert.ok(md.includes("Code interpreter: off"));
});

test("the instructions of every assistant fit the 8,000 character Custom GPT limit", () => {
  for (const b of bundles) assert.ok(b.instructions.length <= 8000, b.slug);
});

test("the Claude Project folder has instructions, knowledge and test cases", () => {
  const b = get("email-reply");
  const paths = claudeProjectFiles(b).map((f) => f.path);
  assert.ok(paths.includes("email-reply/claude-project/custom-instructions.md"));
  assert.ok(paths.includes("email-reply/claude-project/knowledge/price-list.md"));
  assert.equal(paths.filter((p) => p.includes("/test-cases/")).length, b.examples.length * 2);
});

test("the library index lists every assistant with its lint result and file locations", () => {
  const lib = lintLibrary(bundles, config);
  const idx = libraryIndex(bundles, lib.reports);
  assert.equal(idx.assistants.length, 5);
  for (const a of idx.assistants) {
    assert.equal(a.lint.ok, true);
    assert.match(a.files.chatgpt, /chatgpt-custom-gpt\.md$/);
    assert.ok(a.rules >= 4 && a.examples >= 3);
  }
});

test("exporting twice gives byte-identical output", () => {
  const b = get("social-writer");
  assert.equal(chatgptMarkdown(b), chatgptMarkdown(structuredClone(b)));
});
