import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Inventory unit 07 labor management/workforce productivity contract', () => {
  it('reads official labor document and technical checklist', () => {
    expect(read('docs/inventory/07-labor-management-productivity.md')).toContain('Labor Standards');
    expect(read('docs/inventory/07-labor-management-technical-checklist.md')).toContain('الكمال الحرفي');
    expect(read('docs/inventory/07-labor-management-technical-checklist.md')).toContain('Task Interleaving');
  });

  it('0211 migration implements labor standards planning dispatching time tracking skills incentives and KPIs', () => {
    const sql = read('supabase/migrations/0211_inventory_labor_management_productivity.sql');
    for (const obj of [
      'inventory_labor_standard_templates','inventory_labor_standards','inventory_labor_skill_catalog','inventory_worker_skills','inventory_labor_training_records',
      'inventory_worker_availability','inventory_labor_workforce_plans','inventory_labor_workforce_plan_lines','inventory_labor_dispatch_tasks',
      'inventory_labor_task_interleaving_suggestions','inventory_labor_time_logs','inventory_labor_non_productive_reasons','inventory_labor_incentive_programs',
      'inventory_labor_incentive_awards','inventory_labor_shift_leaderboards','inventory_labor_shift_leaderboard_lines','inventory_labor_productivity_report_runs',
      'inventory_labor_safety_incidents','inventory_labor_turnover_events','inventory_labor_dashboard','inventory_labor_kpis','inventory_labor_workload_capacity',
      'inventory_labor_dispatch_queue','inventory_employee_performance_realtime','inventory_labor_manager_dashboard','inventory_non_productive_time_analysis',
      'inventory_labor_skill_matrix','inventory_shift_leaderboard_current','inventory_labor_incentive_summary','inventory_labor_productivity_trends','inventory_labor_safety_trir','inventory_labor_turnover_report'
    ]) expect(sql).toContain(obj);
    for (const fn of ['seed_inventory_labor_standards_from_templates','upsert_inventory_labor_standard','record_inventory_worker_availability','upsert_inventory_worker_skill','seed_inventory_labor_skill_catalog','seed_inventory_labor_non_productive_reasons','create_inventory_labor_dispatch_task','dispatch_inventory_labor_task','start_inventory_labor_task','complete_inventory_labor_task','record_inventory_labor_time','classify_inventory_unexplained_time','generate_inventory_labor_interleaving_suggestions','accept_inventory_labor_interleaving','generate_inventory_workforce_plan','calculate_inventory_labor_incentives','generate_inventory_shift_leaderboard','generate_inventory_labor_productivity_report','record_inventory_labor_safety_incident']) expect(sql).toContain(fn);
    for (const concept of ['engineered','historical','direct','indirect','personal','unexplained','waiting','dead_travel','searching','rework','equipment_wait','forklift','tier_exceptional_percent','trir','turnover_rate_percent']) expect(sql).toContain(concept);
    expect(sql).not.toContain('p_tenant_id');
  });

  it('exports typed labor SDK services', () => {
    const sdk = read('src/services/sdk/Inventory/LaborService.ts');
    const index = read('src/services/sdk/index.ts');
    expect(sdk).toContain("super('inventory_labor_standards')");
    expect(sdk).toContain("supabase.rpc('generate_inventory_workforce_plan'");
    expect(sdk).toContain("supabase.rpc('dispatch_inventory_labor_task'");
    expect(sdk).toContain("supabase.rpc('complete_inventory_labor_task'");
    expect(sdk).toContain("supabase.rpc('calculate_inventory_labor_incentives'");
    expect(index).toContain('inventoryLaborStandardService');
    expect(index).toContain('inventoryLaborAnalyticsService');
  });

  it('adds labor pages routes sidebar and legacy ids', () => {
    const router = read('src/router/AppRouter.tsx');
    const legacy = read('src/router/legacyRedirect.ts');
    const sidebar = read('src/shared/components/dashboard/Sidebar.tsx');
    for (const route of ['labor/standards','labor/planning','labor/availability','labor/dispatch','labor/interleaving','labor/time-tracking','labor/employee-performance','labor/manager-dashboard','labor/non-productive','labor/skills-training','labor/incentives','labor/reports','labor/safety-kpis','labor/leaderboard']) expect(router).toContain(route);
    for (const page of ['inventory-labor-standards','inventory-workforce-planning','inventory-worker-availability','inventory-labor-dispatch','inventory-labor-interleaving','inventory-labor-time-tracking','inventory-employee-performance','inventory-labor-manager-dashboard','inventory-non-productive-time','inventory-skills-training','inventory-labor-incentives','inventory-labor-reports','inventory-labor-safety-kpis','inventory-labor-leaderboard']) {
      expect(legacy).toContain(page);
      expect(sidebar).toContain(page);
    }
    expect(read('src/pages/app/inventory/labor/LaborShared.tsx')).toContain('inventoryLaborAnalyticsService');
  });
});
