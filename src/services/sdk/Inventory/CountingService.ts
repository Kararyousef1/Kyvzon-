import { BaseService } from '../BaseService';
import { supabase } from '../../supabase/supabase';
export interface InventoryCycleCountPlanRecord { id:string; tenant_id:string; plan_number:string; plan_type:string; status:string; created_at:string; }
export interface InventoryCountTaskRecord { id:string; tenant_id:string; task_number:string; status:string; count_round:number; created_at:string; }
export interface InventoryCountVarianceRecord { id:string; tenant_id:string; variance_qty:number; variance_percent:number; status:string; created_at:string; }
export interface InventoryAdjustmentApprovalRecord { id:string; tenant_id:string; required_role:string; decision:string; created_at:string; }
export interface InventoryCountFreezeRecord { id:string; tenant_id:string; freeze_scope:string; status:string; reason?:string|null; created_at:string; }
export interface InventoryAnnualCountPlanRecord { id:string; tenant_id:string; fiscal_year:number; status:string; planned_start:string; planned_end:string; }
export class InventoryCycleCountPlanService extends BaseService<InventoryCycleCountPlanRecord>{constructor(){super('inventory_cycle_count_plans')} async generate(type:string, warehouseId?:string, days=30):Promise<string>{const{data,error}=await supabase.rpc('generate_inventory_cycle_count_schedule',{p_plan_type:type,p_warehouse_id:warehouseId||null,p_days_ahead:days}); if(error) throw new Error(error.message); return data as string;} async post(planId:string):Promise<number>{const{data,error}=await supabase.rpc('post_inventory_count_adjustments',{p_plan_id:planId}); if(error) throw new Error(error.message); return Number(data||0);} }
export class InventoryCountTaskService extends BaseService<InventoryCountTaskRecord>{constructor(){super('inventory_count_tasks')} async requestRecount(countLineId:string, round:number):Promise<string>{const{data,error}=await supabase.rpc('request_inventory_recount',{p_count_line_id:countLineId,p_required_round:round}); if(error) throw new Error(error.message); return data as string;} async submit(input:Record<string,unknown>):Promise<string>{const{data,error}=await supabase.rpc('submit_inventory_count',{p_task_id:input.task_id,p_item_id:input.item_id,p_counted_qty:input.counted_qty,p_scan_location:input.scan_location||null,p_scan_item:input.scan_item||null,p_lot_id:input.lot_id||null,p_lpn_id:input.lpn_id||null,p_notes:input.notes||null}); if(error) throw new Error(error.message); return data as string;} }
export class InventoryCountVarianceService extends BaseService<InventoryCountVarianceRecord>{constructor(){super('inventory_count_variances')} }
export class InventoryAdjustmentApprovalService extends BaseService<InventoryAdjustmentApprovalRecord>{constructor(){super('inventory_adjustment_approvals')} async decide(id:string,decision:string,comments?:string):Promise<void>{const{error}=await supabase.rpc('approve_inventory_adjustment',{p_approval_id:id,p_decision:decision,p_comments:comments||null}); if(error) throw new Error(error.message);} }

export class InventoryCountFreezeService extends BaseService<InventoryCountFreezeRecord>{
  constructor(){super('inventory_count_freezes')}
  async freeze(input:Record<string,unknown>):Promise<string>{const{data,error}=await supabase.rpc('freeze_inventory_for_count',{p_plan_id:input.plan_id||null,p_warehouse_id:input.warehouse_id,p_location_id:input.location_id||null,p_reason:input.reason||null}); if(error) throw new Error(error.message); return data as string;}
  async unfreeze(id:string):Promise<void>{const{error}=await supabase.rpc('unfreeze_inventory_after_count',{p_freeze_id:id}); if(error) throw new Error(error.message);}
}
export class InventoryAnnualCountPlanService extends BaseService<InventoryAnnualCountPlanRecord>{constructor(){super('inventory_annual_count_plans')}}

class InventoryCountingAnalyticsService{async ira(){const{data,error}=await supabase.from('inventory_ira_dashboard').select('*').limit(1); if(error) throw new Error(error.message); return data||[]} async completion(){const{data,error}=await supabase.from('inventory_cycle_count_completion').select('*').limit(100); if(error) throw new Error(error.message); return data||[]} async variance(){const{data,error}=await supabase.from('inventory_variance_analysis').select('*').limit(100); if(error) throw new Error(error.message); return data||[]} async expiry(){const{data,error}=await supabase.from('inventory_expiry_count_report').select('*').limit(100); if(error) throw new Error(error.message); return data||[]} async freezes(){const{data,error}=await supabase.from('inventory_count_freezes').select('*').limit(100); if(error) throw new Error(error.message); return data||[]} }
export const inventoryCycleCountPlanService=new InventoryCycleCountPlanService();
export const inventoryCountTaskService=new InventoryCountTaskService();
export const inventoryCountVarianceService=new InventoryCountVarianceService();
export const inventoryAdjustmentApprovalService=new InventoryAdjustmentApprovalService();
export const inventoryCountFreezeService=new InventoryCountFreezeService();
export const inventoryAnnualCountPlanService=new InventoryAnnualCountPlanService();
export const inventoryCountingAnalyticsService=new InventoryCountingAnalyticsService();
