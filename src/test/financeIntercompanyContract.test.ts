import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Finance unit 11 intercompany/consolidation contract', () => {
  it('has official finance unit 11 docs and checklist', () => {
    expect(read('docs/finance/11-intercompany-consolidation.md')).toContain('Intercompany & Consolidation');
    expect(read('docs/finance/11-intercompany-consolidation-technical-checklist.md')).toContain('create_intercompany_transaction_controlled');
  });
  it('0251 migration adds intercompany RPCs and views', () => {
    const sql = read('supabase/migrations/0251_finance_intercompany_consolidation.sql');
    for (const fn of ['create_intercompany_transaction_controlled','match_intercompany_transaction','eliminate_intercompany_transaction','void_intercompany_transaction']) expect(sql).toContain(fn);
    for (const view of ['finance_intercompany_transaction_board','finance_consolidation_entry_board','finance_intercompany_dashboard']) expect(sql).toContain(view);
    expect(sql).toContain('INTERCOMPANY_ELIMINATION_REASON_REQUIRED');
    expect(sql).not.toContain('DROP TABLE');
  });
  it('SDK, route and UI expose governed intercompany flows', () => {
    const sdk = read('src/services/sdk/IntercompanyService.ts');
    expect(sdk).toContain("supabase.rpc('create_intercompany_transaction_controlled'");
    expect(sdk).toContain("supabase.rpc('eliminate_intercompany_transaction'");
    expect(read('src/router/AppRouter.tsx')).toContain('path="intercompany"');
    const page = read('src/pages/app/finance/IntercompanyPage.tsx');
    expect(page).toContain('<FinanceUnitNav unit="intercompany"');
    expect(page).not.toContain('as any');
    expect(page).not.toContain('prompt(');
    expect(page).not.toContain('confirm(');
  });
  it('post migration checks include Finance Unit 11 objects', () => {
    const checks = read('scripts/tests/99_post_migration_checks.sql');
    expect(checks).toContain('Finance Unit 11 intercompany/consolidation');
    expect(checks).toContain('finance_intercompany_dashboard');
    expect(checks).toContain('eliminate_intercompany_transaction(uuid,text)');
  });
});
