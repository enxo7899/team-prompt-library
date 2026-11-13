import { loadAll } from "../scripts/lint.mjs";

const { config, bundles } = await loadAll();
export { config, bundles };
export const get = (slug) => bundles.find((b) => b.slug === slug);
export const clone = (slug) => structuredClone(get(slug));
export const failing = (report, id) => report.checks.find((c) => c.id === id);
