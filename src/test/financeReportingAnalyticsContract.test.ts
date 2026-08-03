import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Finance unit 13 reporting/analytics contract', () => {
  it('has official finance unit 13 docs and checklist', () => {
    expect(read('docs/finance/13-financial-reporting-analytics.md')).toContain('Financial Reporting & Analytics');
    expect(read('docs/finance/13-financial-reporting-analytics-technical-checklist.md')).toContain('generate_finance_report_run');
  });
  it('0253 migration adds report runs, exports, RPCs and views', () => {
    const sql = read('supabase/migrations/0253_finance_reporting_analytics.sql');
    for (const table of ['finance_report_runs','finance_report_exports']) expect(sql).toContain(table);
    for (const fn of ['generate_finance_report_run','request_finance_report_export','cancel_finance_report_run']) expect(sql).toContain(fn);
    for (const view of ['finance_report_run_board','finance_report_export_board','finance_executive_kpi_dashboard']) expect(sql).toContain(view);
    expect(sql).toContain('REPORT_CANCEL_REASON_REQUIRED');
    expect(sql).not.toContain('DROP TABLE');
  });
  it('SDK and UI expose governed reporting flows', () => {
    const sdk = read('src/services/sdk/FinancialReportService.ts');
    expect(sdk).toContain("supabase.rpc('generate_finance_report_run'");
    expect(sdk).toContain("supabase.rpc('request_finance_report_export'");
    const page = read('src/pages/app/finance/FinancialReportsPage.tsx');
    expect(page).toContain('<FinanceUnitNav unit="reporting"');
    expect(page).not.toContain('as any');
    expect(page).not.toContain('prompt(');
    expect(page).not.toContain('confirm(');
  });
  it('post migration checks include Finance Unit 13 objects', () => {
    const checks = read('scripts/tests/99_post_migration_checks.sql');
    expect(checks).toContain('Finance Unit 13 reporting/analytics');
    expect(checks).toContain('finance_executive_kpi_dashboard');
    expect(checks).toContain('request_finance_report_export(uuid,text)');
  });
});
