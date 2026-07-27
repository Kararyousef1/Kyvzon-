import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root=process.cwd(); const read=(p:string)=>readFileSync(join(root,p),'utf8');

describe('MRP unit 02 forecasting and MPS contract',()=>{
  it('has official doc and checklist',()=>{
    expect(read('docs/mrp/02-demand-forecasting-MPS.md')).toContain('Demand Forecasting');
    expect(read('docs/mrp/02-forecasting-mps-technical-checklist.md')).toContain('RCCP');
  });
  it('0220 migration implements forecasting MPS RCCP alerts and KPIs',()=>{
    const sql=read('supabase/migrations/0220_mrp_forecasting_mps.sql');
    for(const obj of ['mrp_product_planning_policies','mrp_demand_history','mrp_forecast_models','mrp_forecast_runs','mrp_forecast_lines','mrp_forecast_overrides','mrp_forecast_accuracy_snapshots','mrp_mps_plans','mrp_mps_lines','mrp_mps_overrides','mrp_rccp_runs','mrp_rccp_lines','mrp_mps_alerts','mrp_forecast_dashboard','mrp_forecast_accuracy_report','mrp_mps_board','mrp_rccp_load_report','mrp_mps_alert_queue','mrp_mps_kpis']) expect(sql).toContain(obj);
    for(const fn of ['create_mrp_forecast_model','record_mrp_demand_history','run_mrp_forecast','calculate_mrp_forecast_accuracy','create_mrp_mps_plan','generate_mps_from_forecast','override_mps_line','run_mps_rccp','approve_mps_plan','generate_mps_alerts']) expect(sql).toContain(fn); const ux=read('supabase/migrations/0231_mrp_forecasting_mps_ux_actions.sql'); for(const fn of ['upsert_mrp_product_planning_policy','override_mrp_forecast_line','cancel_mrp_mps_plan','release_mrp_mps_plan','close_mrp_mps_alert']) expect(ux).toContain(fn);
    for(const concept of ['simple_moving_average','weighted_moving_average','exponential_smoothing','seasonal_index','MTS','MTO','ATO','ETO']) expect(sql).toContain(concept);
    expect(sql).not.toContain('p_tenant_id');
  });
  it('exports SDK and pages/routes',()=>{
    expect(read('src/services/sdk/MrpForecastingService.ts')).toContain('mrpForecastModelService');
    expect(read('src/services/sdk/MrpForecastingService.ts')).toContain('mrpForecastLineService');
    expect(read('src/services/sdk/index.ts')).toContain('mrpForecastingAnalyticsService');
    expect(read('src/router/AppRouter.tsx')).toContain('path="forecasting/history"');
    expect(read('src/router/AppRouter.tsx')).toContain('path="mps/rccp"');
    expect(read('src/router/legacyRedirect.ts')).toContain('mrp-forecasting');
    expect(read('src/shared/components/dashboard/Sidebar.tsx')).toContain('mrp-mps');
  });
});
