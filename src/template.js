// Input templates: {{placeholders}} that staff fill in, and a pre-flight check that
// stops risky data (card numbers) from being pasted into an assistant.
const RE = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi;

export function placeholders(template) {
  return [...template.matchAll(RE)].map((m) => m[1]);
}

export function render(template, values, emptyAs = "(none)") {
  return template
    .replace(RE, (_, k) => String(values[k] ?? "").trim() || emptyAs)
    .replace(/\s+$/, "");
}

// Reverse of render(): recover the field values from a filled-in input. Returns null
// when the text does not follow the template.
export function parse(template, text) {
  const parts = template.replace(/\s+$/, "").split(RE);
  const src = String(text).replace(/\s+$/, "");
  if (!src.startsWith(parts[0])) return null;
  let pos = parts[0].length;
  const values = {};
  for (let i = 1; i < parts.length; i += 2) {
    const name = parts[i];
    const lit = parts[i + 1];
    if (lit === "") {
      values[name] = src.slice(pos).trim();
      pos = src.length;
      continue;
    }
    const idx = src.indexOf(lit, pos);
    if (idx < 0) return null;
    values[name] = src.slice(pos, idx).trim();
    pos = idx + lit.length;
  }
  return values;
}

export function luhn(digits) {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function hasCardNumber(text) {
  for (const m of String(text).matchAll(/\b(?:\d[ -]?){13,19}\b/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return m[0].trim();
  }
  return null;
}

export function redactCards(text) {
  return String(text).replace(/\b(?:\d[ -]?){13,19}\b/g, (m) =>
    luhn(m.replace(/\D/g, "")) ? "[card number removed]" : m);
}

// Returns [{level: "block" | "warn", code, message}]. "block" means do not send yet.
export function preflight(values, meta) {
  const issues = [];
  for (const inp of meta.inputs || []) {
    if (inp.required && !String(values[inp.name] ?? "").trim()) {
      issues.push({ level: "block", code: "missing", message: `"${inp.label}" is required.` });
    }
  }
  const detectors = meta.preflight || [];
  const all = Object.values(values).join("\n");
  if (detectors.includes("card") && hasCardNumber(all)) {
    issues.push({ level: "block", code: "card", message: "This looks like a payment card number. Card details must never go into an assistant. Remove them before sending." });
  }
  if (detectors.includes("email") && /[\w.+-]+@[\w-]+\.[\w.-]+/.test(all)) {
    issues.push({ level: "warn", code: "email", message: "Client email addresses found. Remove the name and email columns before pasting: the report needs booking ids only." });
  }
  return issues;
}
