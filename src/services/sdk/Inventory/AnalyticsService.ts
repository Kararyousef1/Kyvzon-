import { BaseService } from '../BaseService';
import { supabase } from '../../supabase/supabase';

export interface InventoryAnalyticsKpiTargetRecord { id:string; tenant_id:string; kpi_code:string; warehouse_id?:string|null; green_min?:number|null; green_max?:number|null; yellow_min?:number|null; yellow_max?:number|null; is_active:boolean; }
export interface InventoryAnalyticsKpiSnapshotRecord { id:string; tenant_id:string; kpi_code:string; snapshot_date:string; snapshot_period:string; kpi_value?:number|null; created_at:string; }
export interface InventoryAnalyticsAlertRuleRecord { id:string; tenant_id:string; rule_code:string; alert_name:string; alert_category:string; severity:string; is_active:boolean; }
export interface InventoryAnalyticsAlertRecord { id:string; tenant_id:string; severity:string; alert_category:string; title:string; body:string; status:string; created_at:string; }
export interface InventoryRootCauseAnalysisRecord { id:string; tenant_id:string; analysis_number:string; kpi_code:string; root_cause_summary:string; recommended_action:string; status:string; created_at:string; }
export interface InventoryPeriodicReportScheduleRecord { id:string; tenant_id:string; report_type:string; schedule_cron:string; timezone:string; is_active:boolean; }
export interface InventoryPeriodicReportRunRecord { id:string; tenant_id:string; report_number:string; report_type:string; period_start:string; period_end:string; delivery_status:string; generated_at:string; }
export interface InventoryReportExportRecord { id:string; tenant_id:string; report_run_id:string; export_type:string; status:string; file_url?:string|null; requested_at:string; }
export interface InventoryOperatingCostEntryRecord { id:string; tenant_id:string; cost_date:string; cost_category:string; amount:number; units_handled:number; created_at:string; }

type Row = Record<string, unknown>;

export class InventoryAnalyticsKpiTargetService extends BaseService<InventoryAnalyticsKpiTargetRecord>{
  constructor(){super('inventory_analytics_kpi_targets')}
  async seed(warehouseId?:string):Promise<number>{const{data,error}=await supabase.rpc('seed_inventory_analytics_kpi_targets',{p_warehouse_id:warehouseId||null}); if(error) throw new Error(error.message); return Number(data||0);}
}
export class InventoryAnalyticsKpiSnapshotService extends BaseService<InventoryAnalyticsKpiSnapshotRecord>{
  constructor(){super('inventory_analytics_kpi_snapshots')}
  async refresh(snapshotDate?:string):Promise<number>{const{data,error}=await supabase.rpc('refresh_inventory_kpi_snapshots',{p_snapshot_date:snapshotDate||null}); if(error) throw new Error(error.message); return Number(data||0);}
}
export class InventoryAnalyticsAlertRuleService extends BaseService<InventoryAnalyticsAlertRuleRecord>{
  constructor(){super('inventory_analytics_alert_rules')}
  async seed():Promise<number>{const{data,error}=await supabase.rpc('seed_inventory_analytics_alert_rules'); if(error) throw new Error(error.message); return Number(data||0);}
}
export class InventoryAnalyticsAlertService extends BaseService<InventoryAnalyticsAlertRecord>{
  constructor(){super('inventory_analytics_alerts')}
  async generate():Promise<number>{const{data,error}=await supabase.rpc('generate_inventory_predictive_alerts'); if(error) throw new Error(error.message); return Number(data||0);}
  async acknowledge(alertId:string,status='acknowledged'):Promise<void>{const{error}=await supabase.rpc('acknowledge_inventory_analytics_alert',{p_alert_id:alertId,p_status:status}); if(error) throw new Error(error.message);}
}
export class InventoryRootCauseAnalysisService extends BaseService<InventoryRootCauseAnalysisRecord>{
  constructor(){super('inventory_root_cause_analyses')}
  async run(kpiCode:string, from?:string, to?:string):Promise<string>{const{data,error}=await supabase.rpc('run_inventory_root_cause_analysis',{p_kpi_code:kpiCode,p_period_start:from||null,p_period_end:to||null}); if(error) throw new Error(error.message); return data as string;}
}
export class InventoryPeriodicReportScheduleService extends BaseService<InventoryPeriodicReportScheduleRecord>{
  constructor(){super('inventory_periodic_report_schedules')}
  async upsert(reportType:string, cron:string, recipients:string[]=[]):Promise<string>{const{data,error}=await supabase.rpc('upsert_inventory_periodic_report_schedule',{p_report_type:reportType,p_schedule_cron:cron,p_recipients:recipients}); if(error) throw new Error(error.message); return data as string;}
}
export class InventoryPeriodicReportRunService extends BaseService<InventoryPeriodicReportRunRecord>{
  constructor(){super('inventory_periodic_report_runs')}
  async generate(reportType:string, from:string, to:string):Promise<string>{const{data,error}=await supabase.rpc('generate_inventory_periodic_report',{p_report_type:reportType,p_period_start:from,p_period_end:to}); if(error) throw new Error(error.message); return data as string;}
}
export class InventoryReportExportService extends BaseService<InventoryReportExportRecord>{
  constructor(){super('inventory_report_exports')}
  async request(reportRunId:string, exportType:string):Promise<string>{const{data,error}=await supabase.rpc('request_inventory_report_export',{p_report_run_id:reportRunId,p_export_type:exportType}); if(error) throw new Error(error.message); return data as string;}
}
export class InventoryOperatingCostEntryService extends BaseService<InventoryOperatingCostEntryRecord>{
  constructor(){super('inventory_operating_cost_entries')}
  async record(input:Row):Promise<string>{const{data,error}=await supabase.rpc('record_inventory_operating_cost',{p_warehouse_id:input.warehouse_id||null,p_cost_date:input.cost_date||null,p_cost_category:input.cost_category,p_amount:input.amount,p_units_handled:input.units_handled||0,p_notes:input.notes||null}); if(error) throw new Error(error.message); return data as string;}
}

class InventoryWarehouseAnalyticsService{
  async executive(){const{data,error}=await supabase.from('inventory_executive_dashboard').select('*').limit(10); if(error) throw new Error(error.message); return data||[];}
  async operations(){const{data,error}=await supabase.from('inventory_operations_manager_dashboard').select('*').limit(10); if(error) throw new Error(error.message); return data||[];}
  async supervisor(){const{data,error}=await supabase.from('inventory_shift_supervisor_dashboard').select('*').limit(10); if(error) throw new Error(error.message); return data||[];}
  async scorecard(){const{data,error}=await supabase.from('inventory_kpi_scorecard').select('*').limit(200); if(error) throw new Error(error.message); return data||[];}
  async trends(){const{data,error}=await supabase.from('inventory_kpi_trends').select('*').limit(500); if(error) throw new Error(error.message); return data||[];}
  async heatmap(){const{data,error}=await supabase.from('inventory_inventory_heatmap_analytics').select('*').limit(500); if(error) throw new Error(error.message); return data||[];}
  async seasonal(){const{data,error}=await supabase.from('inventory_seasonal_inventory_patterns').select('*').limit(500); if(error) throw new Error(error.message); return data||[];}
  async rootCause(){const{data,error}=await supabase.from('inventory_root_cause_dashboard').select('*').limit(100); if(error) throw new Error(error.message); return data||[];}
  async alerts(){const{data,error}=await supabase.from('inventory_predictive_alerts_queue').select('*').limit(200); if(error) throw new Error(error.message); return data||[];}
  async reports(){const{data,error}=await supabase.from('inventory_periodic_reports_dashboard').select('*').limit(100); if(error) throw new Error(error.message); return data||[];}
  async costs(){const{data,error}=await supabase.from('inventory_operating_cost_dashboard').select('*').limit(200); if(error) throw new Error(error.message); return data||[];}
}

export const inventoryAnalyticsKpiTargetService=new InventoryAnalyticsKpiTargetService();
export const inventoryAnalyticsKpiSnapshotService=new InventoryAnalyticsKpiSnapshotService();
export const inventoryAnalyticsAlertRuleService=new InventoryAnalyticsAlertRuleService();
export const inventoryAnalyticsAlertService=new InventoryAnalyticsAlertService();
export const inventoryRootCauseAnalysisService=new InventoryRootCauseAnalysisService();
export const inventoryPeriodicReportScheduleService=new InventoryPeriodicReportScheduleService();
export const inventoryPeriodicReportRunService=new InventoryPeriodicReportRunService();
export const inventoryReportExportService=new InventoryReportExportService();
export const inventoryOperatingCostEntryService=new InventoryOperatingCostEntryService();
export const inventoryWarehouseAnalyticsService=new InventoryWarehouseAnalyticsService();
