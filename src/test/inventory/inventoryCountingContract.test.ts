import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Inventory unit 05 cycle counting/accuracy contract', () => {
  it('reads official count document and technical checklist', () => {
    expect(read('docs/inventory/05-cycle-counting-inventory-accuracy.md')).toContain('Cycle Counting');
    expect(read('docs/inventory/05-cycle-counting-technical-checklist.md')).toContain('blind count');
  });
  it('0209 migration implements cycle count plans tasks variances approvals freezes and IRA', () => {
    const sql = read('supabase/migrations/0209_inventory_cycle_counting_accuracy.sql');
    for (const obj of ['inventory_cycle_count_plans','inventory_count_tasks','inventory_count_task_lines','inventory_count_verifications','inventory_count_variances','inventory_adjustment_approvals','inventory_count_freezes','inventory_annual_count_plans','inventory_variance_analysis','inventory_ira_dashboard','inventory_cycle_count_completion','inventory_expiry_count_report']) expect(sql).toContain(obj);
    for (const fn of ['generate_inventory_cycle_count_schedule','submit_inventory_count','request_inventory_recount','approve_inventory_adjustment','post_inventory_count_adjustments','freeze_inventory_for_count','unfreeze_inventory_after_count']) expect(sql).toContain(fn);
    expect(sql).toContain('blind_count');
    expect(sql).not.toContain('p_tenant_id');
  });
  it('exports counting SDK services', () => {
    const sdk = read('src/services/sdk/Inventory/CountingService.ts');
    const index = read('src/services/sdk/index.ts');
    expect(sdk).toContain("super('inventory_cycle_count_plans')");
    expect(sdk).toContain("supabase.rpc('submit_inventory_count'");
    expect(sdk).toContain("supabase.rpc('freeze_inventory_for_count'");
    expect(sdk).toContain('requestRecount');
    expect(index).toContain('inventoryCycleCountPlanService');
  });
  it('adds counting pages and routes', () => {
    const router = read('src/router/AppRouter.tsx');
    const legacy = read('src/router/legacyRedirect.ts');
    for (const route of ['counting/plans','counting/tasks','counting/variances','counting/approvals','counting/completion','counting/expiry','counting/mobile','counting/recount','counting/freeze','counting/annual']) expect(router).toContain(route);
    for (const page of ['inventory-count-plans','inventory-count-tasks','inventory-count-variances','inventory-adjustment-approvals','inventory-count-completion','inventory-expiry-count-report','inventory-mobile-count','inventory-recount','inventory-count-freeze','inventory-annual-count']) expect(legacy).toContain(page);
  });
});
