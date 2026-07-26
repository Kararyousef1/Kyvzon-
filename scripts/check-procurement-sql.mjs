#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');
const procurementMigrationPattern = /^(019\d|020\d)_.*\.sql$/;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n\r]*/g, '');
}

function findMatchingParen(text, start) {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inSingle) {
      if (ch === "'") {
        if (text[i + 1] === "'") i += 1;
        else inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === "'") inSingle = true;
    else if (ch === '"') inDouble = true;
    else if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopLevel(text) {
  const parts = [];
  let current = '';
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inSingle) {
      current += ch;
      if (ch === "'") {
        if (text[i + 1] === "'") {
          i += 1;
          current += text[i];
        } else inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      current += ch;
      if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      current += ch;
    } else if (ch === '"') {
      inDouble = true;
      current += ch;
    } else if (ch === '(') {
      depth += 1;
      current += ch;
    } else if (ch === ')') {
      depth -= 1;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
    } else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function normalizeIdentifier(identifier) {
  return identifier.replace(/^public\./i, '').replace(/"/g, '').toLowerCase();
}

function argTypes(argText) {
  return splitTopLevel(argText)
    .map((arg) => arg.replace(/\s+DEFAULT\s+[\s\S]*$/i, '').trim())
    .filter(Boolean)
    .map((arg) => {
      const tokens = arg.split(/\s+/).filter(Boolean);
      if (tokens.length === 0) return '';
      const first = tokens[0].toUpperCase();
      const withoutMode = ['IN', 'OUT', 'INOUT', 'VARIADIC'].includes(first) ? tokens.slice(1) : tokens;
      if (withoutMode.length <= 1) return withoutMode[0].toLowerCase();
      return withoutMode.slice(1).join(' ').toLowerCase();
    });
}

function returnsTableColumns(returnsText) {
  const tableMatch = returnsText.match(/TABLE\s*\(([^]*?)\)\s*$/i);
  if (!tableMatch) return null;
  return splitTopLevel(tableMatch[1]).map((part) => part.trim().split(/\s+/)[0]?.replace(/"/g, '').toLowerCase()).filter(Boolean);
}

function parseCreateTables(sql, tableColumns) {
  for (const match of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi)) {
    const table = normalizeIdentifier(match[1]);
    const start = match.index + match[0].length - 1;
    const end = findMatchingParen(sql, start);
    if (end < 0) continue;
    const body = sql.slice(start + 1, end);
    if (!tableColumns.has(table)) tableColumns.set(table, new Set());
    const cols = tableColumns.get(table);
    for (const clause of splitTopLevel(body)) {
      const firstRaw = clause.trim().split(/\s+/)[0] ?? '';
      const first = firstRaw.replace(/\(.*/, '').replace(/"/g, '').toLowerCase();
      if (!first || ['constraint', 'primary', 'foreign', 'unique', 'check', 'exclude'].includes(first)) continue;
      cols.add(first);
    }
  }
}

function parseAlterColumns(sql, tableColumns) {
  for (const match of sql.matchAll(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)([^;]*);/gi)) {
    const table = normalizeIdentifier(match[1]);
    const rest = match[2];
    if (!tableColumns.has(table)) tableColumns.set(table, new Set());
    const cols = tableColumns.get(table);
    for (const add of rest.matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi)) {
      cols.add(normalizeIdentifier(add[1]));
    }
    for (const drop of rest.matchAll(/DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi)) {
      cols.delete(normalizeIdentifier(drop[1]));
    }
  }
}

function parseDropTables(sql, tableColumns) {
  for (const match of sql.matchAll(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
    tableColumns.delete(normalizeIdentifier(match[1]));
  }
}

function validateInsertColumnLists(fileName, sql, tableColumns, issues) {
  for (const match of sql.matchAll(/INSERT\s+INTO\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi)) {
    const table = normalizeIdentifier(match[1]);
    const start = match.index + match[0].length - 1;
    const end = findMatchingParen(sql, start);
    if (end < 0) continue;
    const cols = splitTopLevel(sql.slice(start + 1, end))
      .map((col) => normalizeIdentifier(col.trim()))
      .filter((col) => /^[a-z_][a-z0-9_]*$/.test(col));
    if (!tableColumns.has(table)) {
      issues.push(`${fileName}: INSERT references missing table public.${table}`);
      continue;
    }
    const known = tableColumns.get(table);
    for (const col of cols) {
      if (!known.has(col)) issues.push(`${fileName}: INSERT public.${table} references missing column ${col}`);
    }
  }
}

function findTopLevelKeyword(text, keyword, start = 0) {
  const upperKeyword = keyword.toUpperCase();
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inSingle) {
      if (ch === "'") {
        if (text[i + 1] === "'") i += 1;
        else inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === "'") inSingle = true;
    else if (ch === '"') inDouble = true;
    else if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (depth === 0 && text.slice(i, i + keyword.length).toUpperCase() === upperKeyword) {
      const prev = text[i - 1] ?? ' ';
      const next = text[i + keyword.length] ?? ' ';
      if (!/[a-z0-9_]/i.test(prev) && !/[a-z0-9_]/i.test(next)) return i;
    }
  }
  return -1;
}

function findStatementEnd(text, start) {
  let inSingle = false;
  let inDouble = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inSingle) {
      if (ch === "'") {
        if (text[i + 1] === "'") i += 1;
        else inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === "'") inSingle = true;
    else if (ch === '"') inDouble = true;
    else if (ch === ';') return i;
  }
  return text.length;
}

function deriveViewColumnName(expression) {
  const asMatch = expression.match(/\s+AS\s+"?([a-z_][a-z0-9_]*)"?\s*$/i);
  if (asMatch) return normalizeIdentifier(asMatch[1]);
  const simpleMatch = expression.trim().match(/(?:^|\.)("?[a-z_][a-z0-9_]*"?)\s*$/i);
  if (simpleMatch) return normalizeIdentifier(simpleMatch[1]);
  return null;
}

function parseCreateViews(sql) {
  const views = [];
  const createViewRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\b/gi;
  for (const match of sql.matchAll(createViewRegex)) {
    const name = normalizeIdentifier(match[1]);
    const statementEnd = findStatementEnd(sql, match.index);
    const statement = sql.slice(match.index, statementEnd);
    const asSelectMatch = statement.match(/\bAS\s+SELECT\b/i);
    if (!asSelectMatch) continue;
    const selectStart = (asSelectMatch.index ?? 0) + asSelectMatch[0].length;
    const fromIndex = findTopLevelKeyword(statement, 'FROM', selectStart);
    if (fromIndex < 0) continue;
    const columns = splitTopLevel(statement.slice(selectStart, fromIndex))
      .map(deriveViewColumnName)
      .filter(Boolean);
    views.push({ name, columns, statement, index: match.index });
  }
  return views;
}

function functionDependencyKeysInSql(sql) {
  const deps = new Set();
  for (const match of sql.matchAll(/public\.([a-z_][a-z0-9_]*)\s*\(/gi)) {
    const name = normalizeIdentifier(match[1]);
    const start = match.index + match[0].length - 1;
    const end = findMatchingParen(sql, start);
    if (end < 0) continue;
    const args = sql.slice(start + 1, end).trim();
    const argCount = args ? splitTopLevel(args).length : 0;
    deps.add(`${name}/${argCount}`);
  }
  return deps;
}

function removeViewDependency(viewName, knownViewFunctionDeps, functionToViews) {
  const previous = knownViewFunctionDeps.get(viewName);
  if (!previous) return;
  for (const dep of previous) {
    const views = functionToViews.get(dep);
    if (!views) continue;
    views.delete(viewName);
    if (views.size === 0) functionToViews.delete(dep);
  }
  knownViewFunctionDeps.delete(viewName);
}

function addViewDependency(viewName, deps, knownViewFunctionDeps, functionToViews) {
  knownViewFunctionDeps.set(viewName, deps);
  for (const dep of deps) {
    if (!functionToViews.has(dep)) functionToViews.set(dep, new Set());
    functionToViews.get(dep).add(viewName);
  }
}

function validateDropFunctionAgainstViewDependencies(fileName, sql, knownViewFunctionDeps, functionToViews, issues) {
  const ops = [];
  for (const match of sql.matchAll(/DROP\s+VIEW\s+(?:IF\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
    ops.push({ type: 'drop_view', name: normalizeIdentifier(match[1]), index: match.index });
  }
  for (const view of parseCreateViews(sql)) ops.push({ type: 'create_view', ...view });
  for (const match of sql.matchAll(/DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi)) {
    const name = normalizeIdentifier(match[1]);
    const start = match.index + match[0].length - 1;
    const end = findMatchingParen(sql, start);
    const argCount = end > start ? splitTopLevel(sql.slice(start + 1, end)).filter(Boolean).length : null;
    ops.push({ type: 'drop_function', name, argCount, index: match.index });
  }
  ops.sort((a, b) => a.index - b.index);

  for (const op of ops) {
    if (op.type === 'drop_view') {
      removeViewDependency(op.name, knownViewFunctionDeps, functionToViews);
      continue;
    }
    if (op.type === 'create_view') {
      removeViewDependency(op.name, knownViewFunctionDeps, functionToViews);
      addViewDependency(op.name, functionDependencyKeysInSql(op.statement), knownViewFunctionDeps, functionToViews);
      continue;
    }
    if (op.type === 'drop_function') {
      const depKey = `${op.name}/${op.argCount}`;
      const dependentViews = functionToViews.get(depKey);
      if (dependentViews?.size) {
        issues.push(`${fileName}: DROP FUNCTION public.${op.name}/${op.argCount} while views depend on it: ${[...dependentViews].sort().join(', ')}`);
      }
    }
  }
}

function validateViewReplacementCompatibility(fileName, sql, knownViews, issues) {
  const ops = [];
  for (const match of sql.matchAll(/DROP\s+VIEW\s+(?:IF\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
    ops.push({ type: 'drop', name: normalizeIdentifier(match[1]), index: match.index });
  }
  for (const view of parseCreateViews(sql)) ops.push({ type: 'create', ...view });
  ops.sort((a, b) => a.index - b.index);

  for (const op of ops) {
    if (op.type === 'drop') {
      knownViews.delete(op.name);
      continue;
    }
    const previous = knownViews.get(op.name);
    if (previous) {
      if (op.columns.length < previous.length) {
        issues.push(`${fileName}: CREATE OR REPLACE VIEW public.${op.name} would drop columns (${previous.length} -> ${op.columns.length})`);
      } else {
        for (let i = 0; i < previous.length; i += 1) {
          if (previous[i] !== op.columns[i]) {
            issues.push(`${fileName}: CREATE OR REPLACE VIEW public.${op.name} changes column #${i + 1} from ${previous[i]} to ${op.columns[i]}`);
            break;
          }
        }
      }
    }
    knownViews.set(op.name, op.columns);
  }
}

function parseCreateFunctions(sql) {
  const functions = [];
  const createRegex = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+([\w.]+)\s*\(/gi;
  for (const match of sql.matchAll(createRegex)) {
    const name = normalizeIdentifier(match[1]);
    const argsStart = match.index + match[0].length - 1;
    const argsEnd = findMatchingParen(sql, argsStart);
    if (argsEnd < 0) continue;
    const afterArgs = sql.slice(argsEnd + 1);
    const returnsMatch = afterArgs.match(/\s*RETURNS\s+([^]*?)(?=\s+LANGUAGE\s|\s+AS\s|\s+SECURITY\s|\s+STABLE\s|\s+IMMUTABLE\s|\s+VOLATILE\s|\s+SET\s)/i);
    if (!returnsMatch) continue;
    const returns = returnsMatch[1].replace(/\s+/g, ' ').trim();
    const retCols = returnsTableColumns(returns);
    const bodySearchStart = argsEnd + 1 + returnsMatch.index + returnsMatch[0].length;
    const bodyMatch = sql.slice(bodySearchStart).match(/AS\s+(\$[A-Za-z0-9_]*\$)([^]*?)\1/i);
    const body = bodyMatch ? bodyMatch[2].trim() : '';
    functions.push({ name, args: argTypes(sql.slice(argsStart + 1, argsEnd)), returns, retCols, body, index: match.index });
  }
  return functions;
}

function validateFunctionSelectStar(fileName, sql, knownTableReturns, issues) {
  const functions = parseCreateFunctions(sql).sort((a, b) => a.index - b.index);
  for (const fn of functions) {
    if (fn.retCols && /^SELECT\s+\*\s+FROM\s+public\./i.test(fn.body)) {
      const calleeMatch = fn.body.match(/^SELECT\s+\*\s+FROM\s+public\.([a-z_][a-z0-9_]*)\s*\(/i);
      if (calleeMatch) {
        const callee = normalizeIdentifier(calleeMatch[1]);
        const callStart = fn.body.indexOf('(', calleeMatch.index);
        const callEnd = findMatchingParen(fn.body, callStart);
        const callArgCount = callEnd > callStart ? splitTopLevel(fn.body.slice(callStart + 1, callEnd)).length : null;
        const exact = knownTableReturns.get(`${callee}/${callArgCount}`);
        const byName = [...knownTableReturns.entries()].filter(([key]) => key.startsWith(`${callee}/`)).map(([, cols]) => cols.length);
        const expectedCounts = exact ? [exact.length] : [...new Set(byName)];
        if (expectedCounts.length > 0 && !expectedCounts.includes(fn.retCols.length)) {
          issues.push(`${fileName}: ${fn.name} RETURNS TABLE has ${fn.retCols.length} cols but SELECT * callee public.${callee} returns ${expectedCounts.join('/')} cols`);
        }
      }
    }
    if (fn.retCols) knownTableReturns.set(`${fn.name}/${fn.args.length}`, fn.retCols);
  }
}

const migrationFiles = walk(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort();
const tableColumns = new Map();
const knownViews = new Map();
const knownViewFunctionDeps = new Map();
const functionToViews = new Map();
const knownTableReturns = new Map();
const issues = [];

for (const file of migrationFiles) {
  const raw = fs.readFileSync(file, 'utf8');
  const sql = stripComments(raw);
  parseDropTables(sql, tableColumns);
  parseCreateTables(sql, tableColumns);
  parseAlterColumns(sql, tableColumns);
  validateViewReplacementCompatibility(path.basename(file), sql, knownViews, issues);
  validateDropFunctionAgainstViewDependencies(path.basename(file), sql, knownViewFunctionDeps, functionToViews, issues);
  validateFunctionSelectStar(path.basename(file), sql, knownTableReturns, issues);
}

for (const file of migrationFiles.filter((file) => procurementMigrationPattern.test(path.basename(file)))) {
  const sql = stripComments(fs.readFileSync(file, 'utf8'));
  validateInsertColumnLists(path.basename(file), sql, tableColumns, issues);
}

const procurementFiles = migrationFiles.filter((file) => procurementMigrationPattern.test(path.basename(file))).map((file) => path.basename(file));
console.log(`Procurement SQL files checked: ${procurementFiles.length}`);
console.log(`Known tables with columns: ${tableColumns.size}`);
console.log(`Known views with parsed columns: ${knownViews.size}`);
console.log(`Known view→function dependencies: ${knownViewFunctionDeps.size}`);
console.log(`Known RETURNS TABLE functions: ${knownTableReturns.size}`);
if (issues.length > 0) {
  console.error('Procurement SQL consistency check failed:');
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}
console.log('✅ Procurement SQL consistency check: PASS');
