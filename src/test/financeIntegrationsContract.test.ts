import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Finance unit 14 integrations contract', () => {
  it('has official finance unit 14 docs and checklist', () => {
    expect(read('docs/finance/14-finance-integrations.md')).toContain('Finance Integrations');
    expect(read('docs/finance/14-finance-integrations-technical-checklist.md')).toContain('upsert_finance_integration_connector');
  });
  it('0254 migration adds integration tables, RPCs and views', () => {
    const sql = read('supabase/migrations/0254_finance_integrations.sql');
    for (const table of ['finance_integration_connectors','finance_integration_events']) expect(sql).toContain(table);
    for (const fn of ['upsert_finance_integration_connector','ingest_finance_integration_event','review_finance_integration_event','create_finance_journal_from_integration_event']) expect(sql).toContain(fn);
    for (const view of ['finance_integration_connector_board','finance_integration_event_board','finance_integration_dashboard']) expect(sql).toContain(view);
    expect(sql).toContain('INTEGRATION_POSTING_REASON_REQUIRED');
    expect(sql).not.toContain('DROP TABLE');
  });
  it('SDK, route and UI expose governed integration flows', () => {
    const sdk = read('src/services/sdk/FinanceIntegrationService.ts');
    expect(sdk).toContain("supabase.rpc('upsert_finance_integration_connector'");
    expect(sdk).toContain("supabase.rpc('create_finance_journal_from_integration_event'");
    expect(read('src/router/AppRouter.tsx')).toContain('path="integrations"');
    const page = read('src/pages/app/finance/FinanceIntegrationsPage.tsx');
    expect(page).toContain('<FinanceUnitNav unit="integrations"');
    expect(page).not.toContain('as any');
    expect(page).not.toContain('prompt(');
    expect(page).not.toContain('confirm(');
  });
  it('post migration checks include Finance Unit 14 objects', () => {
    const checks = read('scripts/tests/99_post_migration_checks.sql');
    expect(checks).toContain('Finance Unit 14 integrations');
    expect(checks).toContain('finance_integration_dashboard');
    expect(checks).toContain('create_finance_journal_from_integration_event(uuid,uuid,text,jsonb,text)');
  });
});
