import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Finance unit 06 cash/bank reconciliation contract', () => {
  it('has official finance unit 06 docs and checklist', () => {
    expect(read('docs/finance/06-cash-bank-reconciliation.md')).toContain('Cash & Bank Reconciliation');
    expect(read('docs/finance/06-cash-bank-reconciliation-technical-checklist.md')).toContain('upsert_finance_bank_account');
  });

  it('0246 migration adds governed cash/bank RPCs and views', () => {
    const sql = read('supabase/migrations/0246_finance_cash_bank_reconciliation.sql');
    for (const fn of ['upsert_finance_bank_account','update_finance_bank_account_status','create_bank_statement_import_with_lines','match_bank_statement_line','create_bank_reconciliation_controlled','complete_bank_reconciliation','void_bank_reconciliation']) expect(sql).toContain(fn);
    for (const view of ['finance_bank_account_board','finance_bank_statement_import_board','finance_bank_statement_line_board','finance_bank_reconciliation_board','finance_cash_bank_dashboard']) expect(sql).toContain(view);
    expect(sql).toContain('BANK_STATEMENT_ALREADY_IMPORTED');
    expect(sql).not.toContain('DROP TABLE');
  });

  it('SDK, routes and UI expose governed cash/bank flows without direct any create', () => {
    const sdk = read('src/services/sdk/BankStatementImportService.ts');
    expect(sdk).toContain("supabase.rpc('upsert_finance_bank_account'");
    expect(sdk).toContain("supabase.rpc('create_bank_statement_import_with_lines'");
    expect(sdk).toContain("supabase.rpc('complete_bank_reconciliation'");
    expect(read('src/router/AppRouter.tsx')).toContain('path="cash-management"');
    expect(read('src/router/AppRouter.tsx')).toContain('path="bank-statement-import"');
    for (const page of ['CashManagementPage.tsx','BankStatementImportPage.tsx']) {
      const src = read(`src/pages/app/finance/${page}`);
      expect(src).toContain('<FinanceUnitNav unit="cash"');
      expect(src).not.toContain('as any');
      expect(src).not.toContain('prompt(');
      expect(src).not.toContain('confirm(');
    }
  });

  it('post migration checks include Finance Unit 06 objects', () => {
    const checks = read('scripts/tests/99_post_migration_checks.sql');
    expect(checks).toContain('Finance Unit 06 cash/bank reconciliation');
    expect(checks).toContain('finance_cash_bank_dashboard');
    expect(checks).toContain('complete_bank_reconciliation(uuid,text)');
  });
});
