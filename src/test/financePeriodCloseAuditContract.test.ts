import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Finance unit 03 period close/audit GRC contract', () => {
  it('has official finance unit 03 docs and checklist', () => {
    expect(read('docs/finance/03-period-close-audit-grc.md')).toContain('Period Close & Audit/GRC');
    expect(read('docs/finance/03-period-close-audit-grc-technical-checklist.md')).toContain('close_accounting_period_controlled');
  });

  it('0243 migration adds close tasks, controlled close RPCs and GRC views', () => {
    const sql = read('supabase/migrations/0243_finance_period_close_audit_grc.sql');
    expect(sql).toContain('finance_period_close_tasks');
    for (const fn of ['generate_finance_period_close_checklist', 'complete_finance_close_task', 'waive_finance_close_task', 'close_accounting_period_controlled', 'reopen_accounting_period_controlled']) expect(sql).toContain(fn);
    for (const view of ['finance_period_close_readiness', 'finance_close_checklist_board', 'finance_audit_event_board', 'finance_grc_dashboard']) expect(sql).toContain(view);
    expect(sql).toContain('PERIOD_NOT_READY_FOR_FINAL_CLOSE');
    expect(sql).not.toContain('DROP TABLE');
  });

  it('SDK and UI expose period close without prompt/confirm', () => {
    const sdk = read('src/services/sdk/FinanceFoundationService.ts');
    expect(sdk).toContain('financePeriodCloseService');
    expect(sdk).toContain("supabase.rpc('close_accounting_period_controlled'");
    expect(sdk).toContain("supabase.rpc('generate_finance_period_close_checklist'");
    const page = read('src/pages/app/finance/AccountingPeriodsPage.tsx');
    expect(page).toContain('<FinanceUnitNav unit="close"');
    expect(page).toContain('generateChecklist');
    expect(page).toContain('ready_for_final_close');
    expect(page).not.toContain('prompt(');
    expect(page).not.toContain('confirm(');
    const audit = read('src/pages/app/finance/SystemNotesPage.tsx');
    expect(audit).toContain('findFinanceAuditEvents');
    expect(audit).toContain('<FinanceUnitNav unit="close"');
  });

  it('post migration checks include Finance Unit 03 objects', () => {
    const checks = read('scripts/tests/99_post_migration_checks.sql');
    expect(checks).toContain('Finance Unit 03 period close/audit GRC');
    expect(checks).toContain('finance_audit_event_board');
    expect(checks).toContain('reopen_accounting_period_controlled(uuid,text)');
  });
});
