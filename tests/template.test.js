import test from "node:test";
import assert from "node:assert/strict";
import { render, parse, placeholders, hasCardNumber, redactCards, preflight, luhn } from "../src/template.js";
import { bundles, get } from "./helpers.js";

test("every example input can be taken apart and put back together exactly", () => {
  for (const b of bundles) {
    for (const ex of b.examples) {
      const values = parse(b.template, ex.input);
      assert.ok(values, `${b.slug} ${ex.id} does not follow its template`);
      assert.equal(render(b.template, values), ex.input.trim(), `${b.slug} ${ex.id}`);
    }
  }
});

test("a filled form builds the prompt with the labels in the template", () => {
  const b = get("email-reply");
  const prompt = render(b.template, { agent_name: "Besa", client_email: "Hello, price please?", booking_notes: "" });
  assert.equal(prompt, "AGENT NAME: Besa\nCLIENT EMAIL:\nHello, price please?\nBOOKING NOTES: (none)");
});

test("every template field is declared as an input and the other way round", () => {
  for (const b of bundles) assert.deepEqual([...placeholders(b.template)].sort(), b.meta.inputs.map((i) => i.name).sort(), b.slug);
});

test("a card number is detected with spaces or dashes, and order numbers are not", () => {
  assert.ok(hasCardNumber("pay with 4111 1111 1111 1111 please"));
  assert.ok(hasCardNumber("card 4111-1111-1111-1111"));
  assert.equal(hasCardNumber("Booking TT-4821, 14 Nov 2026, total EUR 137.50"), null);
  assert.equal(hasCardNumber("phone +355 69 123 4567"), null);
  assert.equal(luhn("4111111111111112"), false);
});

test("the email example where a client pastes a card is stopped by the pre-flight check", () => {
  const b = get("email-reply");
  const ex = b.examples.find((e) => e.id === "04-english-card-number");
  const issues = preflight(parse(b.template, ex.input), b.meta);
  assert.equal(issues.some((i) => i.level === "block" && i.code === "card"), true);
  assert.doesNotMatch(redactCards(ex.input), /4111/);
  assert.match(redactCards(ex.input), /\[card number removed\]/);
});

test("a form with a required field left empty is blocked", () => {
  const b = get("email-reply");
  const issues = preflight({ agent_name: "", client_email: "Hi", booking_notes: "" }, b.meta);
  assert.deepEqual(issues.map((i) => i.code), ["missing"]);
});

test("the messy bookings export is warned about client emails, the clean one is not", () => {
  const b = get("bookings-report");
  const codes = (id) => preflight(parse(b.template, b.examples.find((e) => e.id === id).input), b.meta).map((i) => i.code);
  assert.deepEqual(codes("02-messy-export"), ["email"]);
  assert.deepEqual(codes("01-clean-week"), []);
});

test("the other shipped examples pass the pre-flight check without warnings", () => {
  for (const b of bundles) {
    for (const ex of b.examples) {
      if (ex.id === "04-english-card-number" || ex.id === "02-messy-export") continue;
      assert.deepEqual(preflight(parse(b.template, ex.input), b.meta), [], `${b.slug} ${ex.id}`);
    }
  }
});
