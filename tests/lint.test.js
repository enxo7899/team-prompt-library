import test from "node:test";
import assert from "node:assert/strict";
import { lintBundle, lintLibrary, getRules } from "../src/lint.js";
import { config, bundles, clone, failing } from "./helpers.js";

const lint = (b) => lintBundle(b, config);
const issuesOf = (b, id) => failing(lint(b), id).issues.join(" | ");

test("all five shipped assistants pass every lint check", () => {
  const lib = lintLibrary(bundles, config);
  assert.equal(lib.reports.length, 5);
  for (const r of lib.reports) assert.deepEqual(r.checks.filter((c) => c.status !== "pass").map((c) => c.id), [], r.slug);
  assert.equal(lib.ok, true);
});

test("an assistant without a refusals and escalation section is rejected", () => {
  const b = clone("email-reply");
  b.instructions = b.instructions.replace("## Refusals and escalation", "## Other notes");
  assert.match(issuesOf(b, "sections"), /Missing section "## Refusals and escalation"/);
});

test("instructions over the word limit are rejected", () => {
  const b = clone("email-reply");
  b.instructions += "\n" + "extra words ".repeat(200);
  assert.match(issuesOf(b, "length"), /words; the limit is 700/);
});

test("instructions longer than a Custom GPT accepts are rejected", () => {
  const b = clone("email-reply");
  b.instructions += "\n" + "x".repeat(8000);
  assert.match(issuesOf(b, "length"), /Custom GPTs accept 8000/);
});

test("a TODO left in the instructions is caught as placeholder text", () => {
  const b = clone("itinerary-builder");
  b.instructions += "\nTODO add the winter hours.";
  assert.match(issuesOf(b, "placeholders"), /placeholder text "TODO"/);
});

test("an unfilled {{field}} in an example input is caught", () => {
  const b = clone("social-writer");
  b.examples[0].input = b.examples[0].input.replace("Berat Wine Weekend", "{{topic}}");
  assert.match(issuesOf(b, "placeholders"), /\{\{topic\}\}/);
});

test("a rule that no example exercises is reported by name", () => {
  const b = clone("email-reply");
  for (const ex of b.meta.examples) ex.tags = ex.tags.filter((t) => t !== "R6");
  assert.match(issuesOf(b, "coverage"), /R6 has no example exercising it/);
});

test("an example tagged with a rule that does not exist is rejected", () => {
  const b = clone("email-reply");
  b.meta.examples[0].tags.push("R9");
  assert.match(issuesOf(b, "coverage"), /R9, which is not a rule/);
});

test("a rule written as vague advice cannot be tested and is rejected", () => {
  const b = clone("email-reply");
  b.instructions = b.instructions.replace(/^R3\..*$/m, "R3. Try to quote prices from the price list if possible.");
  const msg = issuesOf(b, "rules");
  assert.match(msg, /R3 has no hard word/);
  assert.match(msg, /vague wording/);
});

test("a banned marketing phrase in an example output is caught", () => {
  const b = clone("social-writer");
  b.examples[0].output = b.examples[0].output.replace("climb the hillside", "climb the hillside in an unforgettable way");
  assert.match(issuesOf(b, "banned"), /unforgettable/);
});

test("a promise of a refund in an email output is caught by the assistant's own banned list", () => {
  const b = clone("email-reply");
  b.examples[0].output = b.examples[0].output.replace("Non posso anticipare", "Garantiamo che andrà bene. Non posso anticipare");
  assert.match(issuesOf(b, "banned"), /garantiamo/);
});

test("a markdown output missing a required heading is rejected", () => {
  const b = clone("itinerary-builder");
  b.examples[0].output = b.examples[0].output.replace("## Open questions", "## Questions");
  assert.match(issuesOf(b, "format"), /heading "## Open questions" is missing/);
});

test("JSON output that does not parse is rejected", () => {
  const b = clone("social-writer");
  b.examples[0].output = b.examples[0].output.slice(0, -10);
  assert.match(issuesOf(b, "format"), /not valid JSON/);
});

test("a post longer than its platform limit is rejected", () => {
  const b = clone("social-writer");
  const data = JSON.parse(b.examples[0].output);
  data.posts[0].text = "word ".repeat(100);
  data.posts[0].char_count = data.posts[0].text.length;
  b.examples[0].output = JSON.stringify(data);
  assert.match(issuesOf(b, "format"), /instagram allows 400/);
});

test("a wrong char_count in the JSON is rejected", () => {
  const b = clone("social-writer");
  const data = JSON.parse(b.examples[0].output);
  data.posts[1].char_count += 3;
  b.examples[0].output = JSON.stringify(data);
  assert.match(issuesOf(b, "format"), /char_count is/);
});

test("a hashtag that is not in the hashtag bank is rejected", () => {
  const b = clone("social-writer");
  const data = JSON.parse(b.examples[0].output);
  data.posts[0].hashtags[0] = "#CheapestTripEver";
  b.examples[0].output = JSON.stringify(data);
  assert.match(issuesOf(b, "format"), /#CheapestTripEver is not in hashtag-bank.md/);
});

test("a bank account number leaking into a contract summary is rejected", () => {
  const b = clone("contract-summariser");
  b.examples[0].output = b.examples[0].output.replace("[bank details masked]", "AL47 2121 1009 0000 0002 3569 8741");
  assert.match(issuesOf(b, "format"), /must never appear/);
});

test("a client email address in a bookings report is rejected", () => {
  const b = clone("bookings-report");
  b.examples[1].output += "\nContact marco.f@mail.example about TT-4821.";
  assert.match(issuesOf(b, "format"), /must never appear/);
});

test("an example input that ignores the template is rejected", () => {
  const b = clone("email-reply");
  b.examples[0].input = "Hi, please reply to this email.";
  assert.match(issuesOf(b, "template"), /does not follow input-template.md/);
});

test("a template field missing from meta.json inputs is rejected", () => {
  const b = clone("email-reply");
  b.template += "EXTRA: {{extra_field}}\n";
  assert.match(issuesOf(b, "template"), /\{\{extra_field\}\} is not declared/);
});

test("a knowledge file that the instructions never mention is rejected", () => {
  const b = clone("email-reply");
  b.instructions = b.instructions.replaceAll("tone-guide.md", "the tone notes");
  assert.match(issuesOf(b, "knowledge"), /never mention knowledge\/tone-guide.md/);
});

test("an incomplete meta.json lists exactly what is missing", () => {
  const b = clone("contract-summariser");
  delete b.meta.paste.claude;
  b.meta.doDont.dont = ["only one"];
  const msg = issuesOf(b, "meta");
  assert.match(msg, /meta.paste.claude is missing/);
  assert.match(msg, /doDont.dont needs at least 2/);
});

test("rules are read in order from the Rules section", () => {
  assert.deepEqual(getRules(bundles.find((b) => b.slug === "contract-summariser")).map((r) => r.id), ["R1", "R2", "R3", "R4", "R5", "R6", "R7"]);
});
