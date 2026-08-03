import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Finance unit 10 revenue recognition contract', () => {
  it('has official finance unit 10 docs and checklist', () => {
    expect(read('docs/finance/10-revenue-recognition.md')).toContain('Revenue Recognition');
    expect(read('docs/finance/10-revenue-recognition-technical-checklist.md')).toContain('upsert_finance_revenue_contract');
  });
  it('0250 migration adds revenue RPCs and views', () => {
    const sql = read('supabase/migrations/0250_finance_revenue_recognition.sql');
    for (const fn of ['upsert_finance_revenue_contract','generate_revenue_recognition_schedule','recognize_revenue_schedule_line','update_revenue_contract_status']) expect(sql).toContain(fn);
    for (const view of ['finance_revenue_contract_board','finance_revenue_schedule_board','finance_revenue_dashboard']) expect(sql).toContain(view);
    expect(sql).toContain('REVENUE_RECOGNITION_REASON_REQUIRED');
    expect(sql).not.toContain('DROP TABLE');
  });
  it('SDK, route and UI expose governed revenue flows', () => {
    const sdk = read('src/services/sdk/RevenueRecognitionService.ts');
    expect(sdk).toContain("supabase.rpc('upsert_finance_revenue_contract'");
    expect(sdk).toContain("supabase.rpc('recognize_revenue_schedule_line'");
    expect(read('src/router/AppRouter.tsx')).toContain('path="revenue-recognition"');
    const page = read('src/pages/app/finance/RevenueRecognitionPage.tsx');
    expect(page).toContain('<FinanceUnitNav unit="revenue"');
    expect(page).not.toContain('as any');
    expect(page).not.toContain('prompt(');
    expect(page).not.toContain('confirm(');
  });
  it('post migration checks include Finance Unit 10 objects', () => {
    const checks = read('scripts/tests/99_post_migration_checks.sql');
    expect(checks).toContain('Finance Unit 10 revenue recognition');
    expect(checks).toContain('finance_revenue_dashboard');
    expect(checks).toContain('recognize_revenue_schedule_line(uuid,text)');
  });
});
