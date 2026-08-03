import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root=process.cwd(); const read=(p:string)=>readFileSync(join(root,p),'utf8');

describe('Finance unit 00 foundation/control plane contract',()=>{
  it('has official finance unit 00 docs and checklist',()=>{
    expect(read('docs/finance/00-finance-foundation-control-plane.md')).toContain('Finance Foundation');
    expect(read('docs/finance/00-finance-foundation-technical-checklist.md')).toContain('update_legal_entity_status');
  });
  it('0240 migration adds foundation control plane RPCs and views',()=>{
    const sql=read('supabase/migrations/0240_finance_foundation_control_plane.sql');
    for(const fn of ['update_legal_entity_status','assign_finance_entity_membership','deactivate_finance_entity_membership','upsert_finance_cost_center','update_finance_cost_center_status','upsert_finance_project','update_finance_project_status','upsert_finance_exchange_rate']) expect(sql).toContain(fn);
    for(const view of ['finance_foundation_dashboard','finance_legal_entity_lookup','finance_entity_membership_board','finance_cost_center_lookup','finance_project_lookup','finance_exchange_rate_board']) expect(sql).toContain(view);
    expect(sql).not.toContain('p_tenant_id');
  });
  it('SDK and routes expose finance foundation pages',()=>{
    expect(read('src/services/sdk/FinanceFoundationService.ts')).toContain('financeCostCenterService');
    expect(read('src/services/sdk/FinanceFoundationService.ts')).toContain('exchangeRateService');
    expect(read('src/services/sdk/index.ts')).toContain('financeProjectService');
    expect(read('src/router/AppRouter.tsx')).toContain('path="finance"');
    expect(read('src/router/AppRouter.tsx')).toContain('path="cost-centers"');
    expect(read('src/router/AppRouter.tsx')).toContain('path="exchange-rates"');
    expect(read('src/router/legacyRedirect.ts')).toContain('finance-foundation');
    expect(read('src/pages/app/finance/shared/FinanceUnitNav.tsx')).toContain('FinanceUnitNav');
  });
});
