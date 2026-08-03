import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Finance unit 04 accounts payable contract', () => {
  it('has official finance unit 04 docs and checklist', () => {
    expect(read('docs/finance/04-accounts-payable.md')).toContain('Accounts Payable');
    expect(read('docs/finance/04-accounts-payable-technical-checklist.md')).toContain('create_ap_invoice_with_lines');
  });

  it('0244 migration adds AP line table, governed RPCs and board views', () => {
    const sql = read('supabase/migrations/0244_finance_accounts_payable_unit.sql');
    expect(sql).toContain('ap_invoice_lines');
    for (const fn of ['upsert_finance_vendor', 'update_finance_vendor_status', 'create_ap_invoice_with_lines', 'set_ap_invoice_lifecycle_status', 'post_vendor_payment_with_reason', 'void_vendor_payment']) expect(sql).toContain(fn);
    for (const view of ['finance_vendor_lookup', 'finance_ap_invoice_board', 'finance_ap_invoice_line_board', 'finance_ap_dashboard', 'finance_vendor_payment_board', 'finance_vendor_payment_allocation_board']) expect(sql).toContain(view);
    expect(sql).toContain('AP_STATUS_REASON_REQUIRED');
    expect(sql).not.toContain('DROP TABLE');
  });

  it('SDK and UI use governed AP RPCs and no prompt/confirm in AP pages', () => {
    const apSdk = read('src/services/sdk/AccountsPayableService.ts');
    expect(apSdk).toContain("supabase.rpc('create_ap_invoice_with_lines'");
    expect(apSdk).toContain("supabase.rpc('set_ap_invoice_lifecycle_status'");
    expect(apSdk).toContain("supabase.rpc('upsert_finance_vendor'");
    const paySdk = read('src/services/sdk/VendorPaymentService.ts');
    expect(paySdk).toContain("supabase.rpc('post_vendor_payment_with_reason'");
    expect(paySdk).toContain("supabase.rpc('void_vendor_payment'");
    for (const page of ['AccountsPayablePage.tsx', 'VendorsPage.tsx', 'VendorPaymentsPage.tsx', 'APAgingPage.tsx']) {
      const src = read(`src/pages/app/finance/${page}`);
      expect(src).toContain('unit="ap"');
      expect(src).not.toContain('prompt(');
      expect(src).not.toContain('confirm(');
    }
  });

  it('post migration checks include Finance Unit 04 objects', () => {
    const checks = read('scripts/tests/99_post_migration_checks.sql');
    expect(checks).toContain('Finance Unit 04 accounts payable');
    expect(checks).toContain('finance_ap_invoice_board');
    expect(checks).toContain('post_vendor_payment_with_reason(uuid,text)');
  });
});
