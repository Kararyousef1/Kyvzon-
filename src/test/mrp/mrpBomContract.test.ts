import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root=process.cwd(); const read=(p:string)=>readFileSync(join(root,p),'utf8');

describe('MRP unit 01 BOM and engineering change contract',()=>{
  it('has BOM docs and technical checklist',()=>{
    expect(read('docs/mrp/01-bill-of-materials-BOM.md')).toContain('Bill of Materials');
    expect(read('docs/mrp/01-bom-technical-checklist.md')).toContain('BOM Explosion');
  });
  it('0219 migration implements BOM, lines, ECR/ECO, explosion and availability',()=>{
    const sql=read('supabase/migrations/0219_mrp_bom_engineering_change.sql');
    for(const obj of ['mrp_bom_headers','mrp_bom_versions','mrp_bom_lines','mrp_bom_line_substitutes','mrp_bom_line_suppliers','mrp_engineering_change_requests','mrp_engineering_change_orders','mrp_bom_approvals','mrp_bom_explosion_runs','mrp_bom_explosion_lines','mrp_bom_availability_checks','mrp_bom_import_batches','mrp_bom_export_requests','mrp_bom_tree','mrp_bom_dashboard','mrp_bom_kpis','mrp_eco_dashboard','mrp_bom_explosion_summary','mrp_bom_availability_shortages']) expect(sql).toContain(obj);
    for(const fn of ['create_mrp_bom','add_mrp_bom_line','approve_mrp_bom_version','duplicate_mrp_bom_version','create_mrp_ecr','create_mrp_eco','implement_mrp_eco','explode_mrp_bom','check_mrp_bom_availability','request_mrp_bom_export']) expect(sql).toContain(fn); const ux=read('supabase/migrations/0230_mrp_bom_ux_actions.sql'); for(const fn of ['add_mrp_bom_line_substitute','add_mrp_bom_line_supplier','create_mrp_bom_import_batch','close_mrp_ecr']) expect(ux).toContain(fn);
    expect(sql).toContain('EBOM'); expect(sql).toContain('MBOM'); expect(sql).toContain('SBOM'); expect(sql).toContain('SALES');
    expect(sql).not.toContain('p_tenant_id');
  });
  it('exports BOM SDK and pages/routes',()=>{
    expect(read('src/services/sdk/MrpBomService.ts')).toContain('mrpBomHeaderService');
    expect(read('src/services/sdk/index.ts')).toContain('mrpBomAnalyticsService');
    expect(read('src/router/AppRouter.tsx')).toContain('path="bom/builder"');
    expect(read('src/router/legacyRedirect.ts')).toContain('mrp-bom-builder');
    expect(read('src/shared/components/dashboard/Sidebar.tsx')).toContain('mrp-bom');
    for(const p of ['BomDashboard','BomBuilderPage','BomHeadersPage','BomVersionsPage','BomLinesPage','BomExplosionPage','BomAvailabilityPage','EcrPage','EcoPage','BomImportExportPage','BomReportsPage']) expect(read(`src/pages/app/mrp/bom/${p}.tsx`)).toContain('MrpBomPage');
  });
});
