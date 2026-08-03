import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Finance unit 09 fixed assets contract', () => {
  it('has official finance unit 09 docs and checklist', () => {
    expect(read('docs/finance/09-fixed-assets.md')).toContain('Fixed Assets');
    expect(read('docs/finance/09-fixed-assets-technical-checklist.md')).toContain('upsert_finance_fixed_asset');
  });

  it('0249 migration adds fixed asset RPCs and views', () => {
    const sql = read('supabase/migrations/0249_finance_fixed_assets.sql');
    for (const fn of ['upsert_finance_fixed_asset','generate_fixed_asset_depreciation_schedule','run_fixed_asset_depreciation','update_fixed_asset_status']) expect(sql).toContain(fn);
    for (const view of ['finance_fixed_asset_board','finance_depreciation_schedule_board','finance_fixed_asset_dashboard']) expect(sql).toContain(view);
    expect(sql).toContain('FIXED_ASSET_STATUS_REASON_REQUIRED');
    expect(sql).not.toContain('DROP TABLE');
  });

  it('SDK, route and UI expose governed fixed asset flows without direct any create', () => {
    const sdk = read('src/services/sdk/FixedAssetService.ts');
    expect(sdk).toContain("supabase.rpc('upsert_finance_fixed_asset'");
    expect(sdk).toContain("supabase.rpc('run_fixed_asset_depreciation'");
    expect(read('src/router/AppRouter.tsx')).toContain('path="fixed-assets"');
    const page = read('src/pages/app/finance/FixedAssetsPage.tsx');
    expect(page).toContain('<FinanceUnitNav unit="assets"');
    expect(page).not.toContain('as any');
    expect(page).not.toContain('prompt(');
    expect(page).not.toContain('confirm(');
  });

  it('post migration checks include Finance Unit 09 objects', () => {
    const checks = read('scripts/tests/99_post_migration_checks.sql');
    expect(checks).toContain('Finance Unit 09 fixed assets');
    expect(checks).toContain('finance_fixed_asset_dashboard');
    expect(checks).toContain('run_fixed_asset_depreciation(uuid,date,text)');
  });
});
