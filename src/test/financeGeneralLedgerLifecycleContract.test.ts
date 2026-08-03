import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Finance unit 02 general ledger/journal lifecycle contract', () => {
  it('has official finance unit 02 docs and checklist', () => {
    expect(read('docs/finance/02-general-ledger-journal-lifecycle.md')).toContain('General Ledger & Journal Lifecycle');
    expect(read('docs/finance/02-general-ledger-journal-lifecycle-technical-checklist.md')).toContain('post_journal_entry_with_reason');
  });

  it('0242 migration adds lifecycle RPCs and journal board views', () => {
    const sql = read('supabase/migrations/0242_finance_general_ledger_journal_lifecycle.sql');
    for (const fn of ['submit_journal_entry', 'approve_journal_entry', 'post_journal_entry_with_reason', 'void_journal_entry', 'finance_assert_journal_entry_postable']) expect(sql).toContain(fn);
    for (const view of ['finance_journal_lifecycle_dashboard', 'finance_journal_entry_board', 'finance_journal_entry_line_board']) expect(sql).toContain(view);
    expect(sql).toContain('VOID_REASON_REQUIRED');
    expect(sql).toContain('POST_REASON_REQUIRED');
    expect(sql).not.toContain('DROP TABLE');
  });

  it('SDK and journal page use governed lifecycle and lookup line builder', () => {
    const sdk = read('src/services/sdk/GeneralLedgerService.ts');
    expect(sdk).toContain("supabase.rpc('submit_journal_entry'");
    expect(sdk).toContain("supabase.rpc('approve_journal_entry'");
    expect(sdk).toContain("supabase.rpc('post_journal_entry_with_reason'");
    expect(sdk).toContain("supabase.rpc('void_journal_entry'");
    expect(sdk).toContain('finance_journal_entry_board');

    const page = read('src/pages/app/finance/JournalEntriesPage.tsx');
    expect(page).toContain('<FinanceUnitNav unit="gl"');
    expect(page).toContain('findPostingLookup');
    expect(page).toContain('financeCostCenterService');
    expect(page).toContain('financeProjectService');
    expect(page).not.toContain('confirm(');
    expect(page).not.toContain('prompt(');
    expect(page).not.toContain('postJournalEntry(entry.id);');
  });

  it('post migration checks include Finance Unit 02 objects', () => {
    const checks = read('scripts/tests/99_post_migration_checks.sql');
    expect(checks).toContain('Finance Unit 02 general ledger/journal lifecycle');
    expect(checks).toContain('finance_journal_entry_line_board');
    expect(checks).toContain('post_journal_entry_with_reason(uuid,text)');
  });
});
