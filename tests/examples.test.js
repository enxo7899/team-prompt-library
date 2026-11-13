import test from "node:test";
import assert from "node:assert/strict";
import { parse } from "../src/template.js";
import { get } from "./helpers.js";

// The weekly report examples quote numbers. These tests recompute them from the CSV
// with the formulas in kpi-definitions.md, so the examples cannot drift from the data.
function kpis(csvText) {
  const [head, ...lines] = csvText.trim().split("\n");
  const cols = head.split(",");
  const rows = lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])));
  const seen = new Set();
  const uniq = rows.filter((r) => !seen.has(r.booking_id) && seen.add(r.booking_id));
  const amt = (r) => Number(r.amount_eur) || 0;
  const sum = (a) => a.reduce((s, r) => s + amt(r), 0);
  const confirmed = uniq.filter((r) => r.status === "confirmed");
  const cancelled = uniq.filter((r) => r.status === "cancelled");
  const revenue = sum(confirmed);
  const pct = (x, y) => (Math.round((1000 * x) / y) / 10).toFixed(1);
  return { rows, uniq, confirmed, cancelled, revenue, pct, sum,
    cancelRate: pct(cancelled.length, confirmed.length + cancelled.length),
    channel: (c) => sum(confirmed.filter((r) => r.channel === c)) };
}
const eur = (n) => n.toLocaleString("en-US");
const report = (id) => {
  const b = get("bookings-report");
  const ex = b.examples.find((e) => e.id === id);
  return { k: kpis(parse(b.template, ex.input).csv), out: ex.output };
};

test("the clean-week report quotes the revenue, count and cancellation rate that the CSV produces", () => {
  const { k, out } = report("01-clean-week");
  assert.equal(k.revenue, 2390);
  assert.equal(k.confirmed.length, 11);
  assert.equal(k.cancelRate, "15.4");
  assert.ok(out.includes(`EUR ${eur(k.revenue)}`));
  assert.ok(out.includes("11 confirmed bookings"));
  assert.ok(out.includes("15.4%"));
});

test("the clean-week report's channel shares and biggest-booking share match the CSV", () => {
  const { k, out } = report("01-clean-week");
  for (const c of ["website", "partner", "walk-in"]) {
    assert.ok(out.includes(`${k.pct(k.channel(c), k.revenue)}%`), c);
  }
  const top = [...k.confirmed].sort((a, b) => b.amount_eur - a.amount_eur)[0];
  assert.equal(top.booking_id, "TT-4806");
  assert.ok(out.includes(`${k.pct(Number(top.amount_eur), k.revenue)}%`));
  assert.ok(out.includes(`EUR ${eur(k.revenue - Number(top.amount_eur))}`));
});

test("the clean-week report's change against last week is calculated correctly", () => {
  const { k, out } = report("01-clean-week");
  assert.ok(out.includes(`EUR ${eur(2710 - k.revenue)} (${k.pct(2710 - k.revenue, 2710)}%)`));
  assert.ok(out.includes(`EUR ${eur(2500 - k.revenue)} (${k.pct(2500 - k.revenue, 2500)}%)`));
});

test("the messy-export report counts the duplicate once and states the provisional total", () => {
  const { k, out } = report("02-messy-export");
  assert.equal(k.rows.length, 8);
  assert.equal(k.uniq.length, 7);
  assert.equal(k.revenue, 491.5);
  assert.ok(out.includes("EUR 491.50"));
  assert.ok(out.includes(`${k.cancelRate}%`));
});

test("every example for the itinerary builder adds up: the total row equals the lines above it", () => {
  const b = get("itinerary-builder");
  for (const ex of b.examples) {
    const rows = [...ex.output.matchAll(/^\| (.+?) \| (\d+) \| (\d+) \|$/gm)].filter((m) => !/^(Item|---)/.test(m[1]));
    const total = rows.find((r) => r[1] === "Total");
    const lines = rows.filter((r) => r[1] !== "Total");
    assert.ok(total, ex.id);
    assert.equal(lines.reduce((s, r) => s + Number(r[2]), 0), Number(total[2]), `${ex.id} low`);
    assert.equal(lines.reduce((s, r) => s + Number(r[3]), 0), Number(total[3]), `${ex.id} high`);
  }
});

test("the family itinerary reports the budget gap that its own totals imply", () => {
  const ex = get("itinerary-builder").examples.find((e) => e.id === "02-family-grandmother");
  assert.ok(ex.output.includes("EUR 19 to 32 above the EUR 150 budget"));
  assert.ok(ex.output.includes("EUR 127 to 140"));
  assert.equal(169 - 150, 19);
  assert.equal(182 - 150, 32);
  assert.equal(169 - 42, 127);
  assert.equal(182 - 42, 140);
});

test("the contract summaries cover all eight checks and end with a legal review decision", () => {
  const b = get("contract-summariser");
  for (const ex of b.examples) {
    const rows = [...ex.output.matchAll(/^\| ([1-8]) \| .+ \| (Pass|Flag|Missing) \| (High|Medium) \|/gm)];
    assert.equal(rows.length, 8, ex.id);
    assert.match(ex.output, /Needs legal review: (Yes|No)/);
  }
});

test("a contract summary says Yes to legal review whenever a High check is flagged or missing", () => {
  const b = get("contract-summariser");
  for (const ex of b.examples) {
    const high = [...ex.output.matchAll(/^\| \d \| .+ \| (Pass|Flag|Missing) \| High \|/gm)].map((m) => m[1]);
    const mustReview = high.some((r) => r !== "Pass");
    const said = /Needs legal review: Yes/.test(ex.output);
    if (mustReview) assert.equal(said, true, ex.id);
  }
});
