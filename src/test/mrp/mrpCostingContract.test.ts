import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root=process.cwd(); const read=(p:string)=>readFileSync(join(root,p),'utf8');

describe('MRP unit 09 manufacturing costing contract',()=>{
  it('has official doc and checklist',()=>{
    expect(read('docs/mrp/09-manufacturing-costing.md')).toContain('Manufacturing Costing');
    const checklist=read('docs/mrp/09-manufacturing-costing-technical-checklist.md');
    for(const term of ['Cost Elements','Standard Cost','Actual Work Order Costing','Variance Analysis','WIP','Finance Posting']) expect(checklist).toContain(term);
  });
  it('0227 migration implements standard actual costing variances WIP FG and finance drafts',()=>{
    const sql=read('supabase/migrations/0227_mrp_manufacturing_costing.sql');
    for(const obj of ['mrp_cost_elements','mrp_costing_profiles','mrp_standard_cost_versions','mrp_item_standard_costs','mrp_cost_rollup_runs','mrp_cost_rollup_lines','mrp_actual_cost_runs','mrp_work_order_cost_lines','mrp_work_order_cost_summaries','mrp_cost_variances','mrp_wip_cost_ledger','mrp_finished_goods_costing','mrp_cost_posting_drafts','mrp_cost_rollup_summary','mrp_work_order_cost_dashboard','mrp_cost_variance_analysis','mrp_wip_valuation','mrp_finished_goods_valuation','mrp_costing_dashboard','mrp_costing_kpis','mrp_cost_by_item_report','mrp_cost_posting_queue']) expect(sql).toContain(obj);
    for(const fn of ['upsert_mrp_cost_element','upsert_mrp_costing_profile','create_mrp_standard_cost_version','upsert_mrp_item_standard_cost','approve_mrp_standard_cost_version','run_mrp_standard_cost_rollup','run_mrp_actual_work_order_costing','calculate_mrp_work_order_variances','post_mrp_wip_cost_ledger','value_mrp_finished_goods_from_work_order','create_mrp_cost_posting_draft','mark_mrp_cost_posting_reviewed','mark_mrp_cost_posting_posted']) expect(sql).toContain(fn); const ux=read('supabase/migrations/0238_mrp_costing_ux_actions.sql'); for(const fn of ['update_mrp_cost_element_status','update_mrp_costing_profile_status','update_mrp_standard_cost_version_status','review_mrp_cost_variance','cancel_mrp_cost_posting_draft']) expect(ux).toContain(fn);
    expect(sql).toContain('mrp_actual_material_consumption');
    expect(sql).toContain('mrp_labor_assignments');
    expect(sql).toContain('mrp_maintenance_work_orders');
    expect(sql).toContain('tenant_id=public.current_user_tenant_id()');
    expect(sql).not.toContain('p_tenant_id');
  });
  it('exports SDK and app pages/routes/sidebar/hybrid/admin catalog',()=>{
    expect(read('src/services/sdk/MrpCostingService.ts')).toContain('mrpCostingAnalyticsService');
    expect(read('src/services/sdk/index.ts')).toContain('mrpActualCostingService');
    expect(read('src/router/AppRouter.tsx')).toContain('path="costing/work-order-costs"');
    expect(read('src/router/legacyRedirect.ts')).toContain('mrp-cost-postings');
    expect(read('src/shared/components/dashboard/Sidebar.tsx')).toContain('mrp-costing');
    expect(read('src/pages/hybridportal/hybridPagesCatalog.ts')).toContain('mrp-cost-variances');
    expect(read('src/pages/admin/AdminEmployeesPage.tsx')).toContain('mrp-costing-reports');
  });
});
