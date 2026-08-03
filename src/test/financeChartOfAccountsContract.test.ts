import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Finance unit 01 chart of accounts/dimensions contract', () => {
  it('has official finance unit 01 docs and checklist', () => {
    expect(read('docs/finance/01-chart-of-accounts-dimensions.md')).toContain('دليل الحسابات والأبعاد');
    expect(read('docs/finance/01-chart-of-accounts-dimensions-technical-checklist.md')).toContain('upsert_finance_chart_account');
    expect(read('docs/finance/01-chart-of-accounts-dimensions.md')).toContain('Supabase Runtime');
  });

  it('0241 migration adds governed COA RPCs, dimensions policy, views and trigger', () => {
    const sql = read('supabase/migrations/0241_finance_chart_of_accounts_dimensions.sql');
    for (const fn of [
      'upsert_finance_chart_account',
      'archive_finance_chart_account',
      'update_finance_account_posting',
      'upsert_finance_account_dimension_policy',
      'validate_finance_account_hierarchy',
      'finance_validate_journal_line_dimensions',
    ]) expect(sql).toContain(fn);
    for (const view of [
      'finance_chart_of_accounts_tree',
      'finance_posting_account_lookup',
      'finance_account_usage_summary',
      'finance_account_dimension_policy_board',
      'finance_dimensions_dashboard',
    ]) expect(sql).toContain(view);
    expect(sql).toContain('finance_account_dimension_policies');
    expect(sql).toContain('ARCHIVE_REASON_REQUIRED');
    expect(sql).not.toContain('DROP TABLE');
  });

  it('SDK and UI use Finance Unit 01 RPCs instead of direct unsafe mutations', () => {
    const sdk = read('src/services/sdk/ChartOfAccountService.ts');
    expect(sdk).toContain("supabase.rpc('upsert_finance_chart_account'");
    expect(sdk).toContain("supabase.rpc('archive_finance_chart_account'");
    expect(sdk).toContain("supabase.rpc('update_finance_account_posting'");
    expect(sdk).toContain("finance_posting_account_lookup");

    const page = read('src/pages/app/finance/ChartOfAccountsPage.tsx');
    expect(page).toContain('<FinanceUnitNav unit="coa"');
    expect(page).toContain('upsertDimensionPolicy');
    expect(page).toContain('سبب');
    expect(page).not.toContain('confirm(');
    expect(page).not.toContain('prompt(');
    expect(page).not.toContain('chartOfAccountService.create(');
    expect(page).not.toContain('chartOfAccountService.update(');
  });

  it('post migration checks include Finance Unit 01 objects', () => {
    const checks = read('scripts/tests/99_post_migration_checks.sql');
    expect(checks).toContain('Finance Unit 01 chart of accounts/dimensions');
    expect(checks).toContain('finance_dimensions_dashboard');
    expect(checks).toContain('validate_finance_account_hierarchy(uuid)');
  });
});
