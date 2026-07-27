import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Inventory unit 02 storage/slotting contract', () => {
  it('reads official storage document and technical checklist', () => {
    expect(read('docs/inventory/02-storage-management-slotting.md')).toContain('Slotting');
    expect(read('docs/inventory/02-storage-management-technical-checklist.md')).toContain('inventory_location_map');
    expect(read('docs/inventory/02-storage-management-technical-checklist.md')).toContain('AC-STO-08');
  });

  it('0206 migration implements warehouse map ABC slotting replenishment capacity heatmap slow stock and labels', () => {
    const sql = read('supabase/migrations/0206_inventory_storage_slotting.sql');
    for (const obj of ['inventory_abc_classifications','inventory_slotting_strategies','inventory_fixed_item_locations','inventory_affinity_rules','inventory_slotting_recommendations','inventory_replenishment_policies','inventory_replenishment_tasks','inventory_location_label_prints','inventory_location_numbering_rules','inventory_seasonal_slotting_plans','inventory_task_interleaving_suggestions','inventory_slow_moving_report_subscriptions','inventory_location_map','inventory_location_heatmap','inventory_capacity_report','inventory_capacity_alerts','inventory_slow_moving_report','inventory_storage_kpis','inventory_seasonal_slotting_status','inventory_task_interleaving_queue']) {
      expect(sql).toContain(obj);
    }
    for (const fn of ['refresh_inventory_abc_classification','suggest_inventory_putaway_location','generate_inventory_slotting_recommendations','generate_inventory_replenishment_tasks','complete_inventory_replenishment_task','print_inventory_location_label','refresh_inventory_affinity_rules','activate_inventory_seasonal_slotting_plan','generate_inventory_dynamic_replenishment_tasks','generate_inventory_task_interleaving_suggestions','generate_inventory_slow_moving_report_run','generate_inventory_location_code']) {
      expect(sql).toContain(fn);
    }
    expect(sql).toContain('is_golden_zone');
    expect(sql).toContain('allowed_item_types');
    expect(sql).not.toContain('p_tenant_id');
  });

  it('exports typed storage SDK services', () => {
    const sdk = read('src/services/sdk/Inventory/StorageSlottingService.ts');
    const index = read('src/services/sdk/index.ts');
    expect(sdk).toContain("super('inventory_abc_classifications')");
    expect(sdk).toContain("supabase.rpc('suggest_inventory_putaway_location'");
    expect(sdk).toContain('inventoryStorageAnalyticsService');
    expect(sdk).toContain('refresh_inventory_affinity_rules');
    expect(sdk).toContain('generate_inventory_task_interleaving_suggestions');
    expect(index).toContain('inventorySlottingRecommendationService');
    expect(index).toContain('inventoryReplenishmentTaskService');
  });

  it('adds storage pages and routes', () => {
    const router = read('src/router/AppRouter.tsx');
    const legacy = read('src/router/legacyRedirect.ts');
    for (const route of ['storage/map','storage/visual-map','storage/heatmap','storage/slotting','storage/abc','storage/replenishment','storage/capacity','storage/slow-moving','storage/location-labels','storage/affinity','storage/seasonal','storage/interleaving','storage/slow-moving-reports']) expect(router).toContain(route);
    for (const page of ['inventory-location-map','inventory-visual-map','inventory-storage-heatmap','inventory-slotting','inventory-abc','inventory-replenishment','inventory-capacity','inventory-slow-moving','inventory-location-labels','inventory-affinity','inventory-seasonal-slotting','inventory-task-interleaving','inventory-slow-moving-reports']) expect(legacy).toContain(page);
    expect(read('src/pages/app/inventory/storage/StorageShared.tsx')).toContain('inventoryStorageAnalyticsService');
    expect(read('src/pages/app/inventory/storage/VisualWarehouseMapPage.tsx')).toContain('الخريطة التفاعلية');
    expect(read('src/pages/app/inventory/storage/VisualWarehouseMapPage.tsx')).toContain('setZoom');
  });
});
