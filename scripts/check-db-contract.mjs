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

// Order-aware parsing
const tables = new Set();
const views = new Set();

const createTableRegex = /CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi;
const dropTableRegex = /DROP TABLE(?:\s+IF EXISTS)?\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi;
const createViewRegex = /CREATE(?:\s+OR\s+REPLACE)?(?:\s+MATERIALIZED)?\s+VIEW(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi;
const dropViewRegex = /DROP VIEW(?:\s+IF EXISTS)?\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi;

for (const file of migrationFiles) {
  const sql = fs.readFileSync(file, 'utf8');
  const ops = [];

  let m;
  while ((m = createTableRegex.exec(sql)) !== null) {
    ops.push({ idx: m.index, type: 'create_table', name: m[1].toLowerCase() });
  }
  createTableRegex.lastIndex = 0;
  while ((m = dropTableRegex.exec(sql)) !== null) {
    ops.push({ idx: m.index, type: 'drop_table', name: m[1].toLowerCase() });
  }
  dropTableRegex.lastIndex = 0;
  while ((m = createViewRegex.exec(sql)) !== null) {
    ops.push({ idx: m.index, type: 'create_view', name: m[1].toLowerCase() });
  }
  createViewRegex.lastIndex = 0;
  while ((m = dropViewRegex.exec(sql)) !== null) {
    ops.push({ idx: m.index, type: 'drop_view', name: m[1].toLowerCase() });
  }
  dropViewRegex.lastIndex = 0;

  ops.sort((a,b)=>a.idx-b.idx);
  for (const op of ops) {
    if (op.type === 'create_table') tables.add(op.name);
    else if (op.type === 'drop_table') tables.delete(op.name);
    else if (op.type === 'create_view') views.add(op.name);
    else if (op.type === 'drop_view') views.delete(op.name);
  }
}

// Merge
const schemaObjects = new Set([...tables, ...views]);

const references = new Map();
for (const root of sourceRoots) {
  for (const file of walk(root)) {
    if (!/\.(ts|tsx)$/.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/\.from\(['\"]([a-z_][a-z0-9_]*)['\"]\)/gi)) {
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
console.log(`Final tables sample: ${[...tables].slice(0,10).join(', ')}...`);
if (tables.has('currencies')) console.log('✅ currencies table exists in final schema');
else console.log('❌ currencies table NOT in final schema');

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
