import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Finance unit 08 budgeting/forecasting contract', () => {
  it('has official finance unit 08 docs and checklist', () => {
    expect(read('docs/finance/08-budgeting-forecasting.md')).toContain('Budgeting & Forecasting');
    expect(read('docs/finance/08-budgeting-forecasting-technical-checklist.md')).toContain('upsert_finance_budget');
  });

  it('0248 migration adds governed budget/forecast RPCs and views', () => {
    const sql = read('supabase/migrations/0248_finance_budgeting_forecasting.sql');
    for (const fn of ['upsert_finance_budget','upsert_finance_budget_line','update_finance_budget_status','generate_budget_variance_report','upsert_finance_forecast_scenario','update_finance_forecast_status']) expect(sql).toContain(fn);
    for (const view of ['finance_budget_board','finance_budget_line_board','finance_budget_variance_board','finance_budget_dashboard','finance_forecast_scenario_board']) expect(sql).toContain(view);
    expect(sql).toContain('BUDGET_STATUS_REASON_REQUIRED');
    expect(sql).not.toContain('DROP TABLE');
  });

  it('SDK, route and UI expose governed budgeting flows without direct any create', () => {
    const sdk = read('src/services/sdk/BudgetService.ts');
    expect(sdk).toContain("supabase.rpc('upsert_finance_budget'");
    expect(sdk).toContain("supabase.rpc('generate_budget_variance_report'");
    expect(sdk).toContain("supabase.rpc('upsert_finance_forecast_scenario'");
    const router = read('src/router/AppRouter.tsx');
    expect(router).toContain('path="budget"');
    expect(router).toContain('path="budget-variance"');
    for (const page of ['BudgetPage.tsx','AdvancedVariancePage.tsx','CashForecastPage.tsx']) {
      const src = read(`src/pages/app/finance/${page}`);
      expect(src).toContain('unit="budget"');
      expect(src).not.toContain('as any');
      expect(src).not.toContain('prompt(');
      expect(src).not.toContain('confirm(');
    }
  });

  it('post migration checks include Finance Unit 08 objects', () => {
    const checks = read('scripts/tests/99_post_migration_checks.sql');
    expect(checks).toContain('Finance Unit 08 budgeting/forecasting');
    expect(checks).toContain('finance_budget_dashboard');
    expect(checks).toContain('upsert_finance_forecast_scenario(uuid,text,date,date,numeric,text,text,jsonb,uuid)');
  });
});
