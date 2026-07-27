import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root=process.cwd();
const read=(p:string)=>readFileSync(join(root,p),'utf8');

describe('MRP unit 00 manufacturing foundation contract',()=>{
  it('has MRP foundation docs and checklist',()=>{
    expect(read('docs/mrp/00-mrp-foundation-technical-addendum.md')).toContain('manufacturing_plants');
    expect(read('docs/mrp/00-mrp-foundation-technical-checklist.md')).toContain('work_centers');
  });
  it('0218 migration creates foundation tables RPCs views and role',()=>{
    const sql=read('supabase/migrations/0218_mrp_foundation_core.sql');
    for(const obj of ['manufacturing_plants','manufacturing_areas','production_lines','work_centers','manufacturing_resources','manufacturing_assets','manufacturing_calendars','manufacturing_shifts','work_center_shift_capacity','manufacturing_operation_catalog','routing_headers','routing_operations','mrp_numbering_rules','mrp_audit_log','mrp_foundation_dashboard','mrp_work_center_capacity_calendar','mrp_resource_matrix','mrp_routing_overview','mrp_open_masterdata_issues','mrp_integration_health']) expect(sql).toContain(obj);
    for(const fn of ['mrp_require_roles','upsert_mrp_numbering_rule','generate_mrp_next_code','create_mrp_plant','create_mrp_work_center','create_mrp_calendar','generate_work_center_capacity','upsert_operation_catalog','create_routing_header','add_routing_operation','approve_routing','archive_mrp_master_record','check_work_center_availability']) expect(sql).toContain(fn);
    expect(sql).toContain("'manufacturing'");
    expect(sql).not.toContain('p_tenant_id');
  });
  it('0229 migration adds missing foundation UX action RPCs',()=>{
    const sql=read('supabase/migrations/0229_mrp_foundation_ux_actions.sql');
    for(const fn of ['create_mrp_area','create_mrp_line','upsert_mrp_resource','link_mrp_work_center_resource','upsert_mrp_asset','create_mrp_shift']) expect(sql).toContain(fn);
    expect(sql).not.toContain('p_tenant_id');
  });
  it('exports MRP SDK and registers module/role/routes',()=>{
    expect(read('src/services/sdk/MrpService.ts')).toContain('createArea');
    expect(read('src/services/sdk/MrpService.ts')).toContain('createLine');
    expect(read('src/services/sdk/MrpService.ts')).toContain('createShift');
    expect(read('src/services/sdk/index.ts')).toContain('mrpCapacityService');
    expect(read('src/services/sdk/TenantModuleCatalog.ts')).toContain("key: 'mrp'");
    expect(read('src/shared/types/index.ts')).toContain("'manufacturing'");
    expect(read('src/router/AppRouter.tsx')).toContain('path="mrp"');
    expect(read('src/router/legacyRedirect.ts')).toContain('mrp-dashboard');
    expect(read('src/shared/components/dashboard/Sidebar.tsx')).toContain('mrp-main');
    expect(read('src/pages/admin/AdminEmployeesPage.tsx')).toContain('manufacturing');
  });
  it('adds MRP foundation pages',()=>{
    for(const p of ['Dashboard','PlantsPage','AreasPage','LinesPage','WorkCentersPage','ResourcesPage','AssetsPage','CalendarsPage','ShiftsPage','CapacityPage','OperationsPage','RoutingsPage','NumberingPage','AuditPage','IntegrationsPage']) expect(read(`src/pages/app/mrp/foundation/${p}.tsx`)).toContain('MrpPage');
  });
});
