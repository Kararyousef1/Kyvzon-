import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Inventory unit 06 returns/reverse logistics contract', () => {
  it('reads official returns document and technical checklist', () => {
    expect(read('docs/inventory/06-returns-management-reverse-logistics.md')).toContain('Return Merchandise Authorization');
    expect(read('docs/inventory/06-returns-management-technical-checklist.md')).toContain('الكمال');
    expect(read('docs/inventory/06-returns-management-technical-checklist.md')).toContain('A/B/C/D');
  });

  it('0210 migration implements RMA receiving grading disposition production RTV notifications analytics and quality', () => {
    const sql = read('supabase/migrations/0210_inventory_returns_reverse_logistics.sql');
    for (const obj of [
      'inventory_rmas','inventory_rma_lines','inventory_return_receipts','inventory_return_receipt_lines','inventory_return_scans',
      'inventory_return_condition_assessments','inventory_return_disposition_tasks','inventory_return_repack_tasks','inventory_return_repair_orders',
      'inventory_return_rtv_claims','inventory_return_scrap_disposals','inventory_production_returns','inventory_production_return_lines',
      'inventory_production_return_cost_adjustments','inventory_return_customer_notifications','inventory_supplier_rtv_reports','inventory_supplier_rtv_report_lines',
      'inventory_return_capa_actions','inventory_returns_dashboard','inventory_returns_kpis','inventory_return_condition_distribution','inventory_return_reason_analysis',
      'inventory_return_value_recovery','inventory_supplier_rtv_report_summary','inventory_production_returns_dashboard','inventory_return_quality_defects_report'
    ]) expect(sql).toContain(obj);
    for (const fn of ['create_inventory_rma','approve_inventory_rma','receive_inventory_return','scan_inventory_return_barcode','grade_inventory_return_line','route_inventory_return_disposition','complete_inventory_return_disposition','create_inventory_production_return','receive_inventory_production_return','send_inventory_return_notification','generate_inventory_supplier_rtv_report']) expect(sql).toContain(fn);
    for (const grade of ["'A'","'B'","'C'","'D'",'restock','repack_resell','repair_internal','return_to_vendor','scrap_recycle']) expect(sql).toContain(grade);
    expect(sql).toContain('inventory_quality_ncr_cases');
    expect(sql).toContain('value_recovery_percent');
    expect(sql).not.toContain('p_tenant_id');
  });

  it('exports typed returns SDK services', () => {
    const sdk = read('src/services/sdk/Inventory/ReturnsService.ts');
    const index = read('src/services/sdk/index.ts');
    expect(sdk).toContain("super('inventory_rmas')");
    expect(sdk).toContain("supabase.rpc('create_inventory_rma'");
    expect(sdk).toContain("supabase.rpc('receive_inventory_return'");
    expect(sdk).toContain("supabase.rpc('grade_inventory_return_line'");
    expect(sdk).toContain("supabase.rpc('complete_inventory_return_disposition'");
    expect(sdk).toContain("supabase.rpc('generate_inventory_supplier_rtv_report'");
    expect(index).toContain('inventoryRmaService');
    expect(index).toContain('inventoryReturnsAnalyticsService');
  });

  it('adds returns pages routes sidebar and legacy ids', () => {
    const router = read('src/router/AppRouter.tsx');
    const legacy = read('src/router/legacyRedirect.ts');
    const sidebar = read('src/shared/components/dashboard/Sidebar.tsx');
    for (const route of ['returns/rma','returns/receiving','returns/grading','returns/disposition','returns/production','returns/rtv','returns/notifications','returns/supplier-reports','returns/analytics','returns/quality','returns/value-recovery','returns/capa']) expect(router).toContain(route);
    for (const page of ['inventory-rma','inventory-return-receiving','inventory-return-grading','inventory-return-disposition','inventory-production-returns','inventory-return-rtv','inventory-return-notifications','inventory-supplier-rtv-reports','inventory-return-analytics','inventory-return-quality','inventory-return-value-recovery','inventory-return-capa']) {
      expect(legacy).toContain(page);
      expect(sidebar).toContain(page);
    }
    expect(read('src/pages/app/inventory/returns/ReturnsShared.tsx')).toContain('inventoryReturnsAnalyticsService');
  });
});
