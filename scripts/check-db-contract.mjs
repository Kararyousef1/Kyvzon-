#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');
const sourceRoots = [path.join(repoRoot, 'src'), path.join(repoRoot, 'supabase', 'functions')];
const allowedViews = new Set(['public_landing_config']);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

const migrationFiles = walk(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort();

if (migrationFiles.length === 0) {
  console.error('DB contract check failed: no canonical migrations found.');
  process.exit(1);
}

const migrationSql = migrationFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const tables = new Set(
  [...migrationSql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)]
    .map((match) => match[1].toLowerCase()),
);

const references = new Map();
for (const root of sourceRoots) {
  for (const file of walk(root)) {
    if (!/\.(ts|tsx)$/.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/\.from\(['"]([a-z_][a-z0-9_]*)['"]\)/gi)) {
      const table = match[1].toLowerCase();
      if (!references.has(table)) references.set(table, []);
      references.get(table).push(path.relative(repoRoot, file));
    }
  }
}

const missing = [...references.keys()]
  .filter((table) => !tables.has(table) && !allowedViews.has(table))
  .sort();

const secretPatterns = [
  /VITE_(?:OPENROUTER|GROQ|GEMINI|CLAUDE|OPENAI)_API_KEY/,
  /VITE_SUPABASE_SERVICE_KEY/,
];
const secretLeaks = [];
for (const root of sourceRoots) {
  for (const file of walk(root)) {
    if (!/\.(ts|tsx)$/.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (secretPatterns.some((pattern) => pattern.test(text))) {
      secretLeaks.push(path.relative(repoRoot, file));
    }
  }
}

const migrationNames = migrationFiles.map((file) => path.basename(file));
const invalidNames = migrationNames.filter((name) => !/^\d{4}_[a-z0-9_]+\.sql$/.test(name));

console.log(`Canonical migrations: ${migrationNames.length}`);
console.log(`Literal table references: ${references.size}`);
console.log(`Canonical tables: ${tables.size}`);

let failed = false;
if (missing.length) {
  failed = true;
  console.error(`Missing canonical tables/views: ${missing.join(', ')}`);
  for (const table of missing) console.error(`  ${table}: ${references.get(table).join(', ')}`);
}
if (secretLeaks.length) {
  failed = true;
  console.error(`Frontend/server source contains forbidden VITE secret references: ${secretLeaks.join(', ')}`);
}
if (invalidNames.length) {
  failed = true;
  console.error(`Invalid canonical migration filenames: ${invalidNames.join(', ')}`);
}

if (failed) process.exit(1);
console.log('DB contract check: PASS');
