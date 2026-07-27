import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Inventory unit 08 warehouse analytics/KPI dashboard contract', () => {
  it('reads official analytics document and technical checklist', () => {
    expect(read('docs/inventory/08-warehouse-analytics-KPI-dashboard.md')).toContain('Warehouse Analytics');
    expect(read('docs/inventory/08-warehouse-analytics-technical-checklist.md')).toContain('الكمال الحرفي');
    expect(read('docs/inventory/08-warehouse-analytics-technical-checklist.md')).toContain('Executive Dashboard');
  });

  it('0212 migration implements role dashboards KPIs trends heatmap root-cause alerts reports exports and cost dashboard', () => {
    const sql = read('supabase/migrations/0212_inventory_warehouse_analytics_kpi_dashboard.sql');
    for (const obj of [
      'inventory_analytics_kpi_catalog','inventory_analytics_kpi_targets','inventory_analytics_kpi_snapshots','inventory_analytics_alert_rules','inventory_analytics_alerts',
      'inventory_root_cause_analyses','inventory_periodic_report_schedules','inventory_periodic_report_runs','inventory_report_exports','inventory_operating_cost_entries',
      'inventory_executive_dashboard','inventory_operations_manager_dashboard','inventory_shift_supervisor_dashboard','inventory_kpi_scorecard','inventory_kpi_trends',
      'inventory_inventory_heatmap_analytics','inventory_seasonal_inventory_patterns','inventory_root_cause_dashboard','inventory_predictive_alerts_queue','inventory_periodic_reports_dashboard','inventory_operating_cost_dashboard'
    ]) expect(sql).toContain(obj);
    for (const fn of ['seed_inventory_analytics_kpi_targets','refresh_inventory_kpi_snapshots','run_inventory_root_cause_analysis','seed_inventory_analytics_alert_rules','generate_inventory_predictive_alerts','acknowledge_inventory_analytics_alert','upsert_inventory_periodic_report_schedule','generate_inventory_periodic_report','request_inventory_report_export','record_inventory_operating_cost']) expect(sql).toContain(fn);
    for (const kpi of ['dock_to_stock_hours','asn_compliance','receiving_accuracy','dock_utilization','osd_rate','putaway_time_hours','inventory_record_accuracy','space_utilization','inventory_turnover','slow_moving_percent','stockout_rate','pick_accuracy','pick_rate_units_hour','short_pick_rate','order_cycle_hours','on_time_shipping','perfect_order_rate','shipping_cost_per_order','carrier_otif','labor_utilization','cost_per_unit_handled','productivity_rate','error_cost_percent']) expect(sql).toContain(kpi);
    for (const alert of ['urgent','warning','info','stockout','vip_delay','receiving_error','barcode_outage','capacity','ira_drop','low_productivity']) expect(sql).toContain(alert);
    expect(sql).not.toContain('p_tenant_id');
  });

  it('exports typed analytics SDK services', () => {
    const sdk = read('src/services/sdk/Inventory/AnalyticsService.ts');
    const index = read('src/services/sdk/index.ts');
    expect(sdk).toContain("super('inventory_analytics_kpi_targets')");
    expect(sdk).toContain("supabase.rpc('refresh_inventory_kpi_snapshots'");
    expect(sdk).toContain("supabase.rpc('generate_inventory_predictive_alerts'");
    expect(sdk).toContain("supabase.rpc('generate_inventory_periodic_report'");
    expect(sdk).toContain("supabase.rpc('request_inventory_report_export'");
    expect(index).toContain('inventoryWarehouseAnalyticsService');
    expect(index).toContain('inventoryAnalyticsKpiTargetService');
  });

  it('adds analytics pages routes sidebar and legacy ids', () => {
    const router = read('src/router/AppRouter.tsx');
    const legacy = read('src/router/legacyRedirect.ts');
    const sidebar = read('src/shared/components/dashboard/Sidebar.tsx');
    for (const route of ['analytics/executive','analytics/operations','analytics/supervisor','analytics/scorecard','analytics/trends','analytics/heatmap','analytics/seasonal','analytics/root-cause','analytics/alerts','analytics/reports','analytics/exports','analytics/costs','analytics/targets']) expect(router).toContain(route);
    for (const page of ['inventory-analytics-executive','inventory-analytics-operations','inventory-analytics-supervisor','inventory-kpi-scorecard','inventory-kpi-trends','inventory-analytics-heatmap','inventory-seasonal-patterns','inventory-root-cause','inventory-predictive-alerts','inventory-periodic-reports','inventory-report-exports','inventory-operating-costs','inventory-kpi-targets']) {
      expect(legacy).toContain(page);
      expect(sidebar).toContain(page);
    }
    expect(read('src/pages/app/inventory/analytics/AnalyticsShared.tsx')).toContain('inventoryWarehouseAnalyticsService');
  });
});
