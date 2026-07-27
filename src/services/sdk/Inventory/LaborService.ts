import { BaseService } from '../BaseService';
import { supabase } from '../../supabase/supabase';

export interface InventoryLaborStandardRecord { id:string; tenant_id:string; standard_code:string; task_type:string; task_subtype:string; name_ar:string; standard_minutes:number; standard_basis:string; is_active:boolean; created_at:string; }
export interface InventoryWorkerAvailabilityRecord { id:string; tenant_id:string; worker_id:string; warehouse_id?:string|null; work_date:string; shift_code:string; status:string; planned_minutes:number; efficiency_factor:number; created_at:string; }
export interface InventoryLaborWorkforcePlanRecord { id:string; tenant_id:string; plan_number:string; plan_date:string; horizon:string; expected_workload_minutes:number; effective_capacity_minutes:number; capacity_status:string; recommendation?:string|null; }
export interface InventoryLaborSkillRecord { id:string; tenant_id:string; skill_code:string; name_ar:string; skill_category:string; requires_certification:boolean; is_active:boolean; }
export interface InventoryWorkerSkillRecord { id:string; tenant_id:string; worker_id:string; skill_id:string; skill_level:string; certified_at?:string|null; expires_at?:string|null; }
export interface InventoryLaborTrainingRecord { id:string; tenant_id:string; worker_id:string; training_name:string; status:string; started_at?:string|null; completed_at?:string|null; }
export interface InventoryLaborDispatchTaskRecord { id:string; tenant_id:string; task_number:string; warehouse_id:string; task_type:string; priority:number; status:string; assigned_to?:string|null; standard_minutes:number; actual_minutes?:number|null; created_at:string; }
export interface InventoryLaborTimeLogRecord { id:string; tenant_id:string; worker_id:string; time_category:string; reason_code?:string|null; actual_minutes?:number|null; standard_minutes:number; created_at:string; }
export interface InventoryLaborIncentiveProgramRecord { id:string; tenant_id:string; program_name:string; period_start:string; period_end:string; status:string; }
export interface InventoryLaborIncentiveAwardRecord { id:string; tenant_id:string; worker_id:string; incentive_tier:string; award_amount:number; calculated_at:string; }
export interface InventoryLaborLeaderboardRecord { id:string; tenant_id:string; work_date:string; shift_code:string; team_average_productivity:number; status:string; }
export interface InventoryLaborReportRunRecord { id:string; tenant_id:string; report_number:string; report_type:string; period_start:string; period_end:string; generated_at:string; }
export interface InventoryLaborSafetyIncidentRecord { id:string; tenant_id:string; incident_date:string; incident_type:string; recordable:boolean; status:string; }

type Row = Record<string, unknown>;

export class InventoryLaborStandardService extends BaseService<InventoryLaborStandardRecord>{
  constructor(){super('inventory_labor_standards')}
  async seedTemplates(warehouseId?:string):Promise<number>{const{data,error}=await supabase.rpc('seed_inventory_labor_standards_from_templates',{p_warehouse_id:warehouseId||null}); if(error) throw new Error(error.message); return Number(data||0);}
  async upsert(input:Row):Promise<string>{const{data,error}=await supabase.rpc('upsert_inventory_labor_standard',{p_warehouse_id:input.warehouse_id||null,p_standard_code:input.standard_code,p_task_type:input.task_type,p_task_subtype:input.task_subtype,p_name_ar:input.name_ar,p_standard_minutes:input.standard_minutes,p_standard_basis:input.standard_basis||'engineered',p_required_skill_code:input.required_skill_code||null}); if(error) throw new Error(error.message); return data as string;}
}
export class InventoryWorkerAvailabilityService extends BaseService<InventoryWorkerAvailabilityRecord>{
  constructor(){super('inventory_worker_availability')}
  async record(input:Row):Promise<string>{const{data,error}=await supabase.rpc('record_inventory_worker_availability',{p_worker_id:input.worker_id,p_warehouse_id:input.warehouse_id||null,p_work_date:input.work_date,p_shift_code:input.shift_code||'day',p_shift_start:input.shift_start,p_shift_end:input.shift_end,p_efficiency_factor:input.efficiency_factor||0.85,p_hourly_cost:input.hourly_cost||0}); if(error) throw new Error(error.message); return data as string;}
}
export class InventoryLaborWorkforcePlanService extends BaseService<InventoryLaborWorkforcePlanRecord>{
  constructor(){super('inventory_labor_workforce_plans')}
  async generate(planDate:string, warehouseId?:string, horizon='daily'):Promise<string>{const{data,error}=await supabase.rpc('generate_inventory_workforce_plan',{p_plan_date:planDate,p_warehouse_id:warehouseId||null,p_horizon:horizon}); if(error) throw new Error(error.message); return data as string;}
}
export class InventoryLaborSkillService extends BaseService<InventoryLaborSkillRecord>{constructor(){super('inventory_labor_skill_catalog')} async seedCatalog():Promise<number>{const{data,error}=await supabase.rpc('seed_inventory_labor_skill_catalog'); if(error) throw new Error(error.message); return Number(data||0);}}
export class InventoryWorkerSkillService extends BaseService<InventoryWorkerSkillRecord>{
  constructor(){super('inventory_worker_skills')}
  async upsert(workerId:string, skillCode:string, nameAr:string, level='certified', expiresAt?:string):Promise<string>{const{data,error}=await supabase.rpc('upsert_inventory_worker_skill',{p_worker_id:workerId,p_skill_code:skillCode,p_name_ar:nameAr,p_skill_level:level,p_expires_at:expiresAt||null}); if(error) throw new Error(error.message); return data as string;}
}
export class InventoryLaborTrainingService extends BaseService<InventoryLaborTrainingRecord>{constructor(){super('inventory_labor_training_records')}}
export class InventoryLaborDispatchTaskService extends BaseService<InventoryLaborDispatchTaskRecord>{
  constructor(){super('inventory_labor_dispatch_tasks')}
  async createLaborTask(input:Row):Promise<string>{const{data,error}=await supabase.rpc('create_inventory_labor_dispatch_task',{p_warehouse_id:input.warehouse_id,p_source_task_type:input.source_task_type||'manual',p_source_task_id:input.source_task_id||null,p_task_type:input.task_type,p_task_subtype:input.task_subtype||null,p_priority:input.priority||50,p_from_location_id:input.from_location_id||null,p_to_location_id:input.to_location_id||null,p_required_skill_code:input.required_skill_code||null,p_due_at:input.due_at||null,p_units:input.units||1}); if(error) throw new Error(error.message); return data as string;}
  async dispatch(taskId?:string, workerId?:string):Promise<string>{const{data,error}=await supabase.rpc('dispatch_inventory_labor_task',{p_task_id:taskId||null,p_worker_id:workerId||null}); if(error) throw new Error(error.message); return data as string;}
  async start(taskId:string):Promise<void>{const{error}=await supabase.rpc('start_inventory_labor_task',{p_task_id:taskId}); if(error) throw new Error(error.message);}
  async complete(taskId:string, units?:number, errors=0):Promise<void>{const{error}=await supabase.rpc('complete_inventory_labor_task',{p_task_id:taskId,p_units_processed:units||null,p_error_count:errors}); if(error) throw new Error(error.message);}
}
export class InventoryLaborTimeLogService extends BaseService<InventoryLaborTimeLogRecord>{
  constructor(){super('inventory_labor_time_logs')}
  async record(input:Row):Promise<string>{const{data,error}=await supabase.rpc('record_inventory_labor_time',{p_worker_id:input.worker_id,p_warehouse_id:input.warehouse_id||null,p_time_category:input.time_category,p_reason_code:input.reason_code||null,p_start_at:input.start_at,p_end_at:input.end_at||null,p_notes:input.notes||null}); if(error) throw new Error(error.message); return data as string;}
  async classify(id:string, reasonCode:string, category:string, notes?:string):Promise<void>{const{error}=await supabase.rpc('classify_inventory_unexplained_time',{p_time_log_id:id,p_reason_code:reasonCode,p_new_category:category,p_notes:notes||null}); if(error) throw new Error(error.message);}
  async seedNonProductiveReasons():Promise<number>{const{data,error}=await supabase.rpc('seed_inventory_labor_non_productive_reasons'); if(error) throw new Error(error.message); return Number(data||0);}
}
export class InventoryLaborInterleavingService{
  async generate(workerId?:string):Promise<number>{const{data,error}=await supabase.rpc('generate_inventory_labor_interleaving_suggestions',{p_worker_id:workerId||null}); if(error) throw new Error(error.message); return Number(data||0);}
  async accept(suggestionId:string):Promise<void>{const{error}=await supabase.rpc('accept_inventory_labor_interleaving',{p_suggestion_id:suggestionId}); if(error) throw new Error(error.message);}
  async suggestions(){const{data,error}=await supabase.from('inventory_labor_task_interleaving_suggestions').select('*').order('created_at',{ascending:false}).limit(100); if(error) throw new Error(error.message); return data||[];}
}
export class InventoryLaborIncentiveProgramService extends BaseService<InventoryLaborIncentiveProgramRecord>{
  constructor(){super('inventory_labor_incentive_programs')}
  async calculate(programId:string):Promise<number>{const{data,error}=await supabase.rpc('calculate_inventory_labor_incentives',{p_program_id:programId}); if(error) throw new Error(error.message); return Number(data||0);}
}
export class InventoryLaborIncentiveAwardService extends BaseService<InventoryLaborIncentiveAwardRecord>{constructor(){super('inventory_labor_incentive_awards')}}
export class InventoryLaborLeaderboardService extends BaseService<InventoryLaborLeaderboardRecord>{
  constructor(){super('inventory_labor_shift_leaderboards')}
  async generate(warehouseId:string|undefined, workDate:string, shiftCode='day', target=90):Promise<string>{const{data,error}=await supabase.rpc('generate_inventory_shift_leaderboard',{p_warehouse_id:warehouseId||null,p_work_date:workDate,p_shift_code:shiftCode,p_target_percent:target}); if(error) throw new Error(error.message); return data as string;}
}
export class InventoryLaborReportRunService extends BaseService<InventoryLaborReportRunRecord>{
  constructor(){super('inventory_labor_productivity_report_runs')}
  async generate(type:string, from:string, to:string, warehouseId?:string):Promise<string>{const{data,error}=await supabase.rpc('generate_inventory_labor_productivity_report',{p_report_type:type,p_period_start:from,p_period_end:to,p_warehouse_id:warehouseId||null}); if(error) throw new Error(error.message); return data as string;}
}
export class InventoryLaborSafetyIncidentService extends BaseService<InventoryLaborSafetyIncidentRecord>{
  constructor(){super('inventory_labor_safety_incidents')}
  async record(input:Row):Promise<string>{const{data,error}=await supabase.rpc('record_inventory_labor_safety_incident',{p_warehouse_id:input.warehouse_id||null,p_worker_id:input.worker_id||null,p_incident_date:input.incident_date,p_incident_type:input.incident_type,p_recordable:input.recordable||false,p_description:input.description,p_corrective_action:input.corrective_action||null}); if(error) throw new Error(error.message); return data as string;}
}

class InventoryLaborAnalyticsService{
  async dashboard(){const{data,error}=await supabase.from('inventory_labor_dashboard').select('*').limit(20); if(error) throw new Error(error.message); return data||[];}
  async kpis(){const{data,error}=await supabase.from('inventory_labor_kpis').select('*').limit(20); if(error) throw new Error(error.message); return data||[];}
  async workloadCapacity(){const{data,error}=await supabase.from('inventory_labor_workload_capacity').select('*').limit(100); if(error) throw new Error(error.message); return data||[];}
  async dispatchQueue(){const{data,error}=await supabase.from('inventory_labor_dispatch_queue').select('*').limit(100); if(error) throw new Error(error.message); return data||[];}
  async employeePerformance(){const{data,error}=await supabase.from('inventory_employee_performance_realtime').select('*').limit(100); if(error) throw new Error(error.message); return data||[];}
  async managerDashboard(){const{data,error}=await supabase.from('inventory_labor_manager_dashboard').select('*').limit(100); if(error) throw new Error(error.message); return data||[];}
  async nonProductive(){const{data,error}=await supabase.from('inventory_non_productive_time_analysis').select('*').limit(100); if(error) throw new Error(error.message); return data||[];}
  async skillMatrix(){const{data,error}=await supabase.from('inventory_labor_skill_matrix').select('*').limit(100); if(error) throw new Error(error.message); return data||[];}
  async leaderboard(){const{data,error}=await supabase.from('inventory_shift_leaderboard_current').select('*').limit(100); if(error) throw new Error(error.message); return data||[];}
  async incentives(){const{data,error}=await supabase.from('inventory_labor_incentive_summary').select('*').limit(100); if(error) throw new Error(error.message); return data||[];}
  async productivityTrends(){const{data,error}=await supabase.from('inventory_labor_productivity_trends').select('*').limit(100); if(error) throw new Error(error.message); return data||[];}
  async safetyTrir(){const{data,error}=await supabase.from('inventory_labor_safety_trir').select('*').limit(20); if(error) throw new Error(error.message); return data||[];}
  async turnover(){const{data,error}=await supabase.from('inventory_labor_turnover_report').select('*').limit(100); if(error) throw new Error(error.message); return data||[];}
}

export const inventoryLaborStandardService=new InventoryLaborStandardService();
export const inventoryWorkerAvailabilityService=new InventoryWorkerAvailabilityService();
export const inventoryLaborWorkforcePlanService=new InventoryLaborWorkforcePlanService();
export const inventoryLaborSkillService=new InventoryLaborSkillService();
export const inventoryWorkerSkillService=new InventoryWorkerSkillService();
export const inventoryLaborTrainingService=new InventoryLaborTrainingService();
export const inventoryLaborDispatchTaskService=new InventoryLaborDispatchTaskService();
export const inventoryLaborTimeLogService=new InventoryLaborTimeLogService();
export const inventoryLaborInterleavingService=new InventoryLaborInterleavingService();
export const inventoryLaborIncentiveProgramService=new InventoryLaborIncentiveProgramService();
export const inventoryLaborIncentiveAwardService=new InventoryLaborIncentiveAwardService();
export const inventoryLaborLeaderboardService=new InventoryLaborLeaderboardService();
export const inventoryLaborReportRunService=new InventoryLaborReportRunService();
export const inventoryLaborSafetyIncidentService=new InventoryLaborSafetyIncidentService();
export const inventoryLaborAnalyticsService=new InventoryLaborAnalyticsService();
