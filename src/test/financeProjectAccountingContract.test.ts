import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Finance unit 12 project accounting contract', () => {
  it('has official finance unit 12 docs and checklist', () => {
    expect(read('docs/finance/12-project-accounting.md')).toContain('Project Accounting');
    expect(read('docs/finance/12-project-accounting-technical-checklist.md')).toContain('upsert_project_accounting_project');
  });
  it('0252 migration adds project accounting tables, RPCs and views', () => {
    const sql = read('supabase/migrations/0252_finance_project_accounting.sql');
    for (const table of ['finance_project_budget_lines','finance_project_actual_snapshots']) expect(sql).toContain(table);
    for (const fn of ['upsert_project_accounting_project','upsert_project_budget_line','generate_project_actuals_snapshot','update_project_accounting_status']) expect(sql).toContain(fn);
    for (const view of ['finance_project_accounting_board','finance_project_budget_line_board','finance_project_actuals_board','finance_project_accounting_dashboard']) expect(sql).toContain(view);
    expect(sql).toContain('PROJECT_STATUS_REASON_REQUIRED');
    expect(sql).not.toContain('DROP TABLE');
  });
  it('SDK, route and UI expose governed project accounting flows', () => {
    const sdk = read('src/services/sdk/ProjectAccountingService.ts');
    expect(sdk).toContain("supabase.rpc('upsert_project_accounting_project'");
    expect(sdk).toContain("supabase.rpc('generate_project_actuals_snapshot'");
    expect(read('src/router/AppRouter.tsx')).toContain('path="project-accounting"');
    const page = read('src/pages/app/finance/ProjectAccountingPage.tsx');
    expect(page).toContain('<FinanceUnitNav unit="project"');
    expect(page).not.toContain('as any');
    expect(page).not.toContain('prompt(');
    expect(page).not.toContain('confirm(');
  });
  it('post migration checks include Finance Unit 12 objects', () => {
    const checks = read('scripts/tests/99_post_migration_checks.sql');
    expect(checks).toContain('Finance Unit 12 project accounting');
    expect(checks).toContain('finance_project_accounting_dashboard');
    expect(checks).toContain('generate_project_actuals_snapshot(uuid,date)');
  });
});
