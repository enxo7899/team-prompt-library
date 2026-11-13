// Builds the copy-paste bundles. Pure functions that return text, so the same code
// runs in scripts/export.mjs and behind the download buttons on the page.
import { wordCount, charCount } from "./text.js";
import { getRules } from "./lint.js";

const fence = "````";

export function chatgptMarkdown(b) {
  const m = b.meta;
  const starters = b.examples.slice(0, 4).map((e) => `- ${e.title}`);
  const parts = [
    `# ${m.name}: ChatGPT Custom GPT bundle`,
    "",
    "Paste each block below into the matching field of the GPT builder (Explore GPTs, Create, Configure).",
    "",
    "## 1. Name",
    m.name,
    "",
    "## 2. Description",
    m.purpose,
    "",
    "## 3. Instructions (paste into the Instructions field)",
    `${charCount(b.instructions)} of 8,000 characters used.`,
    "",
    fence + "markdown",
    b.instructions.trim(),
    fence,
    "",
    "## 4. Conversation starters",
    ...starters,
    "",
    "## 5. Capabilities",
    `- Web search: ${m.modelSettings.webBrowsing ? "on" : "off"}`,
    `- Code interpreter: ${m.modelSettings.codeInterpreter ? "on" : "off"}`,
    `- Notes: ${m.modelSettings.notes}`,
    "",
    "## 6. Knowledge (save each block as a file and upload it under Knowledge)",
  ];
  for (const [file, text] of Object.entries(b.knowledge)) parts.push("", `### ${file}`, "", fence + "markdown", text.trim(), fence);
  parts.push("", "## 7. Input template (give this to your team)", "", fence, b.template.trim(), fence, "");
  return parts.join("\n");
}

// A folder layout for a Claude Project: instructions, knowledge, and test cases.
export function claudeProjectFiles(b) {
  const root = `${b.slug}/claude-project/`;
  const files = [
    { path: `${root}README.md`, content: `# ${b.meta.name}: Claude Project\n\n1. Create a Project.\n2. Paste custom-instructions.md into the project instructions.\n3. Add every file in knowledge/ as project knowledge.\n4. Check it with the files in test-cases/: send an input, compare with the output.\n\n${b.meta.paste.claude}\n` },
    { path: `${root}custom-instructions.md`, content: b.instructions },
    { path: `${root}input-template.md`, content: b.template },
  ];
  for (const [f, t] of Object.entries(b.knowledge)) files.push({ path: `${root}knowledge/${f}`, content: t });
  for (const e of b.examples) {
    files.push({ path: `${root}test-cases/${e.inputFile}`, content: e.input });
    files.push({ path: `${root}test-cases/${e.outputFile}`, content: e.output });
  }
  return files;
}

export function libraryIndex(bundles, lintReports) {
  return {
    company: "Teuta Travel (fictional)",
    assistants: bundles.map((b) => {
      const rep = lintReports.find((r) => r.slug === b.slug);
      return {
        slug: b.slug,
        name: b.meta.name,
        purpose: b.meta.purpose,
        ownerRole: b.meta.ownerRole,
        outputFormat: b.meta.output.format,
        rules: getRules(b).length,
        examples: b.examples.length,
        knowledgeFiles: Object.keys(b.knowledge),
        instructionsWords: wordCount(b.instructions),
        instructionsChars: charCount(b.instructions),
        lint: { ok: rep.ok, checksPassed: rep.passed, checksRun: rep.checks.length },
        files: { chatgpt: `${b.slug}/chatgpt-custom-gpt.md`, claudeProject: `${b.slug}/claude-project/` },
      };
    }),
  };
}
