import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd(); const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('MRP unit 07 shop floor control and MES contract', () => {
  it('has official doc and technical checklist', () => {
    expect(read('docs/mrp/07-shop-floor-control.md')).toContain('Shop Floor Control');
    const checklist = read('docs/mrp/07-shop-floor-control-technical-checklist.md');
    for (const term of ['Digital Work Stations', 'Real-Time Production Tracking', 'OEE', 'Downtime', 'Andon', 'Maintenance']) expect(checklist).toContain(term);
  });

  it('0225 migration implements workstations production events OEE downtime labor andon maintenance bridge', () => {
    const sql = read('supabase/migrations/0225_mrp_shop_floor_control.sql');
    for (const obj of [
      'mrp_shop_floor_workstations','mrp_shop_floor_terminal_sessions','mrp_downtime_reason_codes','mrp_downtime_events','mrp_production_events','mrp_actual_material_consumption','mrp_labor_assignments','mrp_andon_signals','mrp_shopfloor_maintenance_requests','mrp_oee_snapshots',
      'mrp_shop_floor_dashboard','mrp_digital_workstation_board','mrp_real_time_production_tracking','mrp_actual_vs_standard_consumption','mrp_oee_dashboard','mrp_downtime_dashboard','mrp_downtime_pareto','mrp_work_order_execution_status','mrp_labor_shift_dashboard','mrp_andon_board','mrp_supervisor_dashboard','mrp_production_manager_dashboard','mrp_shopfloor_maintenance_queue','mrp_shopfloor_kpis'
    ]) expect(sql).toContain(obj);
    for (const fn of [
      'upsert_mrp_workstation','open_mrp_terminal_session','close_mrp_terminal_session','start_mrp_operation','pause_mrp_operation','resume_mrp_operation','start_mrp_downtime','end_mrp_downtime','record_mrp_production_event','record_mrp_actual_material_consumption','assign_mrp_labor_to_operation','close_mrp_labor_assignment','raise_mrp_andon_signal','acknowledge_mrp_andon_signal','resolve_mrp_andon_signal','raise_mrp_quality_issue_from_floor','create_mrp_breakdown_maintenance_request','calculate_mrp_oee_snapshot'
    ]) expect(sql).toContain(fn);
    const ux = read('supabase/migrations/0236_mrp_shop_floor_ux_actions.sql');
    for (const fn of ['update_mrp_workstation_status','force_close_mrp_terminal_session','upsert_mrp_downtime_reason','update_mrp_shopfloor_maintenance_request_status','cancel_mrp_production_event']) expect(ux).toContain(fn);
    expect(sql).toContain('create_mrp_quality_ncr');
    expect(sql).toContain('tenant_id=public.current_user_tenant_id()');
    expect(sql).not.toContain('p_tenant_id');
  });

  it('exports SDK services and app pages/routes/sidebar/hybrid catalog', () => {
    expect(read('src/services/sdk/MrpShopFloorService.ts')).toContain('mrpShopFloorAnalyticsService');
    expect(read('src/services/sdk/index.ts')).toContain('mrpShopFloorExecutionService');
    expect(read('src/router/AppRouter.tsx')).toContain('path="shopfloor/andon"');
    expect(read('src/router/legacyRedirect.ts')).toContain('mrp-shopfloor-maintenance');
    expect(read('src/shared/components/dashboard/Sidebar.tsx')).toContain('mrp-shopfloor');
    expect(read('src/pages/hybridportal/hybridPagesCatalog.ts')).toContain('mrp-shopfloor-oee');
    expect(read('src/pages/app/mrp/shopfloor/MrpShopFloorShared.tsx')).toContain('OEE');
  });
});
