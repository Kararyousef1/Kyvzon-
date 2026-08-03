import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Finance unit 07 tax management/filing contract', () => {
  it('has official finance unit 07 docs and checklist', () => {
    expect(read('docs/finance/07-tax-management-filing.md')).toContain('Tax Management & Filing');
    expect(read('docs/finance/07-tax-management-filing-technical-checklist.md')).toContain('upsert_finance_tax_code');
  });

  it('0247 migration adds tax filing lines, governed RPCs and views', () => {
    const sql = read('supabase/migrations/0247_finance_tax_management_filing.sql');
    expect(sql).toContain('finance_tax_filing_lines');
    for (const fn of ['upsert_finance_tax_code','update_finance_tax_code_status','generate_tax_filing_draft','update_tax_filing_status']) expect(sql).toContain(fn);
    for (const view of ['finance_tax_code_board','finance_tax_filing_board','finance_tax_filing_line_board','finance_tax_dashboard']) expect(sql).toContain(view);
    expect(sql).toContain('TAX_FILING_STATUS_REASON_REQUIRED');
    expect(sql).not.toContain('DROP TABLE');
  });

  it('SDK, route and UI expose governed tax flows without direct any create', () => {
    const sdk = read('src/services/sdk/TaxService.ts');
    expect(sdk).toContain("supabase.rpc('upsert_finance_tax_code'");
    expect(sdk).toContain("supabase.rpc('generate_tax_filing_draft'");
    expect(sdk).toContain("supabase.rpc('update_tax_filing_status'");
    expect(read('src/router/AppRouter.tsx')).toContain('path="tax-management"');
    const page = read('src/pages/app/finance/TaxManagementPage.tsx');
    expect(page).toContain('<FinanceUnitNav unit="tax"');
    expect(page).not.toContain('as any');
    expect(page).not.toContain('prompt(');
    expect(page).not.toContain('confirm(');
  });

  it('post migration checks include Finance Unit 07 objects', () => {
    const checks = read('scripts/tests/99_post_migration_checks.sql');
    expect(checks).toContain('Finance Unit 07 tax management/filing');
    expect(checks).toContain('finance_tax_dashboard');
    expect(checks).toContain('generate_tax_filing_draft(uuid,text,date,date)');
  });
});
