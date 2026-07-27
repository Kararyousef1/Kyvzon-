import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd(); const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('MRP unit 08 maintenance CMMS contract', () => {
  it('has official doc and checklist', () => {
    expect(read('docs/mrp/08-maintenance-management-CMMS.md')).toContain('Maintenance Management');
    const checklist = read('docs/mrp/08-maintenance-management-CMMS-technical-checklist.md');
    for (const term of ['Asset Registry','Criticality Matrix','Preventive Maintenance','Spare Parts','MTBF','MTTR']) expect(checklist).toContain(term);
  });

  it('0226 migration implements asset registry PM work orders spares PdM CBM shutdown KPIs integrations', () => {
    const sql = read('supabase/migrations/0226_mrp_maintenance_cmms.sql');
    for (const obj of [
      'mrp_maintenance_assets','mrp_maintenance_asset_documents','mrp_asset_criticality_assessments','mrp_pm_plans','mrp_pm_plan_tasks','mrp_maintenance_work_orders','mrp_maintenance_work_order_tasks','mrp_maintenance_spare_parts','mrp_maintenance_work_order_parts','mrp_condition_monitoring_readings','mrp_condition_alerts','mrp_annual_shutdown_plans','mrp_annual_shutdown_tasks',
      'mrp_maintenance_asset_registry','mrp_pm_calendar','mrp_maintenance_work_order_board','mrp_maintenance_spare_parts_status','mrp_condition_monitoring_board','mrp_condition_alert_queue','mrp_annual_shutdown_schedule','mrp_maintenance_mtbf_mttr','mrp_maintenance_kpis','mrp_maintenance_cost_by_asset','mrp_maintenance_dashboard','mrp_maintenance_integration_health'
    ]) expect(sql).toContain(obj);
    for (const fn of ['upsert_mrp_maintenance_asset','assess_mrp_asset_criticality','create_mrp_pm_plan','add_mrp_pm_plan_task','create_mrp_maintenance_work_order','generate_mrp_pm_work_orders','assign_mrp_maintenance_work_order','start_mrp_maintenance_work_order','complete_mrp_maintenance_work_order','close_mrp_maintenance_work_order','upsert_mrp_maintenance_spare_part','add_mrp_maintenance_work_order_part','issue_mrp_maintenance_spare_part','generate_mrp_spare_part_reorder_recommendations','record_mrp_condition_reading','convert_shopfloor_request_to_maintenance_wo','create_mrp_annual_shutdown_plan','add_mrp_shutdown_task']) expect(sql).toContain(fn);
    const ux = read('supabase/migrations/0237_mrp_maintenance_ux_actions.sql');
    for (const fn of ['update_mrp_maintenance_asset_status','update_mrp_pm_plan_status','hold_mrp_maintenance_work_order','cancel_mrp_maintenance_work_order','update_mrp_maintenance_spare_part_status','close_mrp_condition_alert','update_mrp_annual_shutdown_status','update_mrp_shutdown_task_status']) expect(ux).toContain(fn);
    expect(sql).toContain('create_mrp_procurement_recommendation');
    expect(sql).toContain('mrp_shopfloor_maintenance_requests');
    expect(sql).toContain('tenant_id=public.current_user_tenant_id()');
    expect(sql).not.toContain('p_tenant_id');
  });

  it('exports SDK and app pages/routes/sidebar/hybrid/admin catalog', () => {
    expect(read('src/services/sdk/MrpMaintenanceService.ts')).toContain('mrpMaintenanceAnalyticsService');
    expect(read('src/services/sdk/index.ts')).toContain('mrpMaintenanceWorkOrderService');
    expect(read('src/router/AppRouter.tsx')).toContain('path="maintenance/work-orders"');
    expect(read('src/router/legacyRedirect.ts')).toContain('mrp-maintenance-spare-parts');
    expect(read('src/shared/components/dashboard/Sidebar.tsx')).toContain('mrp-maintenance');
    expect(read('src/pages/hybridportal/hybridPagesCatalog.ts')).toContain('mrp-maintenance-condition');
    expect(read('src/pages/admin/AdminEmployeesPage.tsx')).toContain('mrp-maintenance-reports');
  });
});
