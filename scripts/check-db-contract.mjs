#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');
const sourceRoots = [path.join(repoRoot, 'src'), path.join(repoRoot, 'supabase', 'functions')];

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

// Extract CREATE TABLE names
const tables = new Set(
  [...migrationSql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)]
    .map((match) => match[1].toLowerCase()),
);

// Extract CREATE VIEW / CREATE OR REPLACE VIEW / CREATE MATERIALIZED VIEW names.
// The frontend accesses views via .from('view_name'), so they must be
// treated as valid schema objects for the contract check.
const views = new Set(
  [...migrationSql.matchAll(
    /CREATE(?:\s+OR\s+REPLACE)?(?:\s+MATERIALIZED)?\s+VIEW(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi
  )].map((match) => match[1].toLowerCase()),
);

// Table-like drops so we don't count objects that a later migration removes.
// Applied only to tables (not views) — a view can be replaced with CREATE OR REPLACE.
const droppedTables = new Set(
  [...migrationSql.matchAll(/DROP TABLE(?:\s+IF EXISTS)?\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)]
    .map((match) => match[1].toLowerCase()),
);
for (const t of droppedTables) tables.delete(t);

// Merge: any name that resolves to a table or a view is valid.
const schemaObjects = new Set([...tables, ...views]);

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
  .filter((table) => !schemaObjects.has(table))
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
console.log(`Canonical views:  ${views.size}`);

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
