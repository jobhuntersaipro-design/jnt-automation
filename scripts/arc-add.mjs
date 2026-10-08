// Adds Arc UI (https://uiarc.dev, MIT, free tier only) components to src/components/arc.
// The MIT notice that must ship with them is in src/components/arc/LICENSE.
//
//   node scripts/arc-add.mjs button dialog sortable-data-table
//
// Writes the registry source as-is. Don't use `npx shadcn add` for Arc here: this
// repo's components.json is a Base UI style, so the CLI rewrites Arc's Radix
// `asChild` into Base UI `render`, which Radix ignores at runtime.
//
// Local edits (re-apply if you re-add these items):
// - button/button.module.css: .primary uses --accent (EasyStaff blue) instead of --foreground.
// - search-field/search-field.tsx: clearLabel prop (was a fixed English aria-label).
// - calendar/calendar.tsx, date-picker/date-picker.tsx: messages prop for their English strings.
// - metric-card/metric-card.tsx: prefix, decimals and locale passed to AnimatedCounter (RM amounts).
// - dialog/dialog.tsx: closeLabel prop (was a fixed English aria-label).
// - number-field/number-field.tsx: stepMessages prop (was fixed English Increase/Decrease).
// - calendar/calendar.tsx: eslint-disable for react-hooks/preserve-manual-memoization on `weeks`.
import fs from "node:fs";
import path from "node:path";

const REGISTRY = "https://uiarc.dev/r/";
const seen = new Set();
const npmDeps = new Set();

async function add(nameOrUrl) {
  const url = nameOrUrl.startsWith("http") ? nameOrUrl : `${REGISTRY}${nameOrUrl}.json`;
  if (seen.has(url)) return;
  seen.add(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const item = await res.json();
  if (item.meta?.tier && item.meta.tier !== "free") throw new Error(`${item.name} is not free tier`);
  for (const dep of item.dependencies ?? []) npmDeps.add(dep);
  for (const file of item.files) {
    const target = file.target.replace(/^@components\//, "src/components/");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content);
    console.log("wrote", target);
  }
  for (const dep of item.registryDependencies ?? []) await add(dep);
}

const names = process.argv.slice(2);
if (names.length === 0) {
  console.error("usage: node scripts/arc-add.mjs <item> [item...]");
  process.exit(1);
}
for (const name of names) await add(name);
console.log(`\nnpm deps used: ${[...npmDeps].sort().join(" ")}`);
