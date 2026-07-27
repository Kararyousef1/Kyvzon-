import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Inventory/Warehouse foundation contract', () => {
  it('has official inventory docs and technical foundation addendum', () => {
    expect(read('docs/inventory/00-inventory-foundation-technical-addendum.md')).toContain('Stock Ledger');
    expect(read('docs/inventory/01-receiving-inbound-operations.md')).toContain('ASN');
    expect(read('docs/inventory/08-warehouse-analytics-KPI-dashboard.md')).toContain('Warehouse Analytics');
  });

  it('registers inventory role/module in required integration points', () => {
    expect(read('src/shared/types/index.ts')).toContain("'inventory'");
    expect(read('src/utils/userUtils.ts')).toContain("'inventory'");
    expect(read('src/router/constants.ts')).toContain("inventory: '/app/inventory'");
    expect(read('src/pages/admin/AdminEmployeesPage.tsx')).toContain("inventory: 'inventory'");
    expect(read('supabase/functions/_shared/adminAuth.ts')).toContain("'inventory'");
    expect(read('supabase/functions/admin-create-user/index.ts')).toContain("'inventory'");
    expect(read('src/services/sdk/TenantModuleCatalog.ts')).toContain("key: 'inventory'");
    expect(read('src/router/moduleMap.ts')).toContain("moduleKey: 'inventory'");
  });

  it('exposes protected inventory routes and sidebar entries', () => {
    const router = read('src/router/AppRouter.tsx');
    const sidebar = read('src/shared/components/dashboard/Sidebar.tsx');
    expect(router).toContain('path="inventory"');
    expect(router).toContain('RequireModule moduleKey="inventory"');
    for (const page of ['inventory-dashboard','inventory-items','inventory-warehouses','inventory-stock','inventory-movements','inventory-receiving','inventory-storage','inventory-picking','inventory-shipping','inventory-counting','inventory-returns','inventory-labor','inventory-analytics']) {
      expect(sidebar).toContain(page);
      expect(read('src/router/legacyRedirect.ts')).toContain(page);
    }
  });

  it('0204 migration creates WMS foundation tables, RLS, RPCs and analytics views', () => {
    const sql = read('supabase/migrations/0204_inventory_foundation_core.sql');
    for (const table of ['inventory_items','inventory_warehouses','inventory_locations','inventory_docks','inventory_lots','inventory_serial_numbers','inventory_lpn','inventory_barcodes','inventory_stock_balances','inventory_stock_movements','inventory_reservations']) {
      expect(sql).toContain(`public.${table}`);
    }
    expect(sql).toContain('uq_inventory_stock_balance_identity');
    expect(sql).toContain('COALESCE(location_id');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('inventory_require_roles');
    expect(sql).toContain('post_inventory_movement');
    expect(sql).toContain('reserve_inventory');
    expect(sql).toContain('inventory_kpis');
    expect(sql).toContain('NOTIFY pgrst');
    expect(sql).not.toContain('p_tenant_id');
  });

  it('exports typed inventory SDK services', () => {
    const sdk = read('src/services/sdk/InventoryService.ts');
    const index = read('src/services/sdk/index.ts');
    expect(sdk).toContain("super('inventory_items')");
    expect(sdk).toContain("super('inventory_stock_movements')");
    expect(sdk).toContain("supabase.rpc('post_inventory_movement'");
    expect(index).toContain('inventoryItemService');
    expect(index).toContain('inventoryAnalyticsService');
  });
});
