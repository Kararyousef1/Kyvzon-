import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Finance unit 05 accounts receivable/collections contract', () => {
  it('has official finance unit 05 docs and checklist', () => {
    expect(read('docs/finance/05-accounts-receivable-collections.md')).toContain('Accounts Receivable & Collections');
    expect(read('docs/finance/05-accounts-receivable-collections-technical-checklist.md')).toContain('create_ar_invoice_with_lines');
  });

  it('0245 migration adds AR lines, receipts, RPCs and board views', () => {
    const sql = read('supabase/migrations/0245_finance_accounts_receivable_collections.sql');
    for (const table of ['ar_invoice_lines', 'customer_receipts', 'customer_receipt_allocations']) expect(sql).toContain(table);
    for (const fn of ['upsert_finance_customer', 'update_finance_customer_status', 'create_ar_invoice_with_lines', 'set_ar_invoice_lifecycle_status', 'create_customer_receipt_draft', 'post_customer_receipt_with_reason', 'void_customer_receipt', 'get_ar_aging']) expect(sql).toContain(fn);
    for (const view of ['finance_customer_lookup', 'finance_ar_invoice_board', 'finance_ar_invoice_line_board', 'finance_ar_dashboard', 'finance_customer_receipt_board']) expect(sql).toContain(view);
    expect(sql).toContain('AR_STATUS_REASON_REQUIRED');
    expect(sql).not.toContain('DROP TABLE');
  });

  it('SDK, route and UI expose governed AR flows without prompt/confirm/direct any create', () => {
    const sdk = read('src/services/sdk/AccountsReceivableService.ts');
    expect(sdk).toContain("supabase.rpc('create_ar_invoice_with_lines'");
    expect(sdk).toContain("supabase.rpc('set_ar_invoice_lifecycle_status'");
    expect(sdk).toContain("supabase.rpc('post_customer_receipt_with_reason'");
    expect(read('src/router/AppRouter.tsx')).toContain('path="accounts-receivable"');
    const page = read('src/pages/app/finance/AccountsReceivablePage.tsx');
    expect(page).toContain('<FinanceUnitNav unit="ar"');
    expect(page).not.toContain('prompt(');
    expect(page).not.toContain('confirm(');
    expect(page).not.toContain('as any');
  });

  it('post migration checks include Finance Unit 05 objects', () => {
    const checks = read('scripts/tests/99_post_migration_checks.sql');
    expect(checks).toContain('Finance Unit 05 accounts receivable/collections');
    expect(checks).toContain('finance_ar_invoice_board');
    expect(checks).toContain('post_customer_receipt_with_reason(uuid,text)');
  });
});
