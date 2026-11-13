// Reproducible README screenshots. Run `npm run dev` in another terminal, then `npm run screenshots`.
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
const base = process.env.BASE || "http://127.0.0.1:5182/";
const out = process.env.OUT || "docs";
const browser = await chromium.launch();
const errors = [];
async function shot(name, url, { device, viewport = { width: 1440, height: 1000 }, full = false, clip, before } = {}) {
  const ctx = await browser.newContext(device ? { ...devices[device] } : { viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("requestfailed", (r) => !r.url().includes("fonts.") && errors.push(`${name}: request failed ${r.url()}`));
  await page.goto(base + url, { waitUntil: "networkidle" });
  await page.waitForSelector("main h1");
  await page.waitForTimeout(500);
  if (before) await before(page);
  if (device) {
    const w = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (w > 0) errors.push(`${name}: horizontal scroll of ${w}px`);
  }
  await (clip ? page.locator(clip) : page).screenshot({ path: `${out}/${name}.png`, fullPage: full && !clip });
  await ctx.close();
}
await shot("overview", "", { viewport: { width: 1440, height: 1250 } });
await shot("lint-catches-damage", "?a=email-reply&break=refusals,rule,todo#instructions", { viewport: { width: 1440, height: 1000 }, clip: "#instructions" });
await shot("try-it", "?a=email-reply&fill=4#try", { viewport: { width: 1440, height: 1000 }, clip: "#try" });
await shot("examples", "?a=itinerary-builder&ex=2#examples", { viewport: { width: 1440, height: 1000 }, clip: "#examples" });
await shot("mobile", "?a=social-writer&ex=3&break=banned", { device: "iPhone 13" });
await browser.close();
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log("no console errors");
