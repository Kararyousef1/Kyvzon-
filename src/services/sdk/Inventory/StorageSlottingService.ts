import { BaseService } from '../BaseService';
import { supabase } from '../../supabase/supabase';

export interface InventoryAbcClassificationRecord { id: string; tenant_id: string; item_id: string; pick_count: number; movement_percent: number; cumulative_percent: number; abc_class: 'A'|'B'|'C'; calculated_at: string; }
export interface InventorySlottingRecommendationRecord { id: string; tenant_id: string; item_id: string; current_location_id?: string | null; recommended_location_id?: string | null; recommendation_type: string; reason: string; score: number; status: string; created_at: string; }
export interface InventoryReplenishmentPolicyRecord { id: string; tenant_id: string; item_id: string; forward_location_id: string; reserve_location_id?: string | null; min_qty: number; max_qty: number; policy_type: string; is_active: boolean; }
export interface InventoryReplenishmentTaskRecord { id: string; tenant_id: string; task_number: string; item_id: string; from_location_id?: string | null; to_location_id: string; quantity: number; priority: string; status: string; created_at: string; }
export interface InventoryLocationLabelPrintRecord { id: string; tenant_id: string; location_id: string; label_payload: Record<string, unknown>; printer_name?: string | null; printed_at: string; }
export interface InventoryAffinityRuleRecord { id: string; tenant_id: string; item_id: string; related_item_id: string; affinity_score: number; is_active: boolean; calculated_at: string; }
export interface InventorySeasonalSlottingPlanRecord { id: string; tenant_id: string; plan_code: string; name_ar: string; season_name?: string | null; starts_on: string; ends_on: string; status: string; }
export interface InventoryTaskInterleavingSuggestionRecord { id: string; tenant_id: string; source_task_table: string; source_task_id: string; suggested_task_table: string; suggested_task_id: string; score: number; reason: string; status: string; }
export interface InventorySlowMovingReportSubscriptionRecord { id: string; tenant_id: string; report_name: string; recipient_email: string; frequency: string; threshold_days: number; is_active: boolean; }

export class InventoryAbcClassificationService extends BaseService<InventoryAbcClassificationRecord> {
  constructor() { super('inventory_abc_classifications'); }
  async refresh(days = 90): Promise<number> {
    const { data, error } = await supabase.rpc('refresh_inventory_abc_classification', { p_days: days });
    if (error) throw new Error(error.message);
    return Number(data || 0);
  }
}

export class InventorySlottingRecommendationService extends BaseService<InventorySlottingRecommendationRecord> {
  constructor() { super('inventory_slotting_recommendations'); }
  async generate(): Promise<number> {
    const { data, error } = await supabase.rpc('generate_inventory_slotting_recommendations');
    if (error) throw new Error(error.message);
    return Number(data || 0);
  }
  async suggestPutaway(itemId: string, warehouseId: string, quantity = 1): Promise<string> {
    const { data, error } = await supabase.rpc('suggest_inventory_putaway_location', { p_item_id: itemId, p_warehouse_id: warehouseId, p_quantity: quantity });
    if (error) throw new Error(error.message);
    return data as string;
  }
}

export class InventoryReplenishmentPolicyService extends BaseService<InventoryReplenishmentPolicyRecord> { constructor() { super('inventory_replenishment_policies'); } }
export class InventoryReplenishmentTaskService extends BaseService<InventoryReplenishmentTaskRecord> {
  constructor() { super('inventory_replenishment_tasks'); }
  async generate(): Promise<number> {
    const { data, error } = await supabase.rpc('generate_inventory_replenishment_tasks');
    if (error) throw new Error(error.message);
    return Number(data || 0);
  }
  async generateDynamic(): Promise<number> {
    const { data, error } = await supabase.rpc('generate_inventory_dynamic_replenishment_tasks');
    if (error) throw new Error(error.message);
    return Number(data || 0);
  }
  async complete(taskId: string): Promise<void> {
    const { error } = await supabase.rpc('complete_inventory_replenishment_task', { p_task_id: taskId });
    if (error) throw new Error(error.message);
  }
}

export class InventoryAffinityRuleService extends BaseService<InventoryAffinityRuleRecord> {
  constructor() { super('inventory_affinity_rules'); }
  async refresh(days = 180): Promise<number> {
    const { data, error } = await supabase.rpc('refresh_inventory_affinity_rules', { p_days: days });
    if (error) throw new Error(error.message);
    return Number(data || 0);
  }
}

export class InventorySeasonalSlottingPlanService extends BaseService<InventorySeasonalSlottingPlanRecord> {
  constructor() { super('inventory_seasonal_slotting_plans'); }
  async activate(planId: string): Promise<number> {
    const { data, error } = await supabase.rpc('activate_inventory_seasonal_slotting_plan', { p_plan_id: planId });
    if (error) throw new Error(error.message);
    return Number(data || 0);
  }
}

export class InventoryTaskInterleavingSuggestionService extends BaseService<InventoryTaskInterleavingSuggestionRecord> {
  constructor() { super('inventory_task_interleaving_suggestions'); }
  async generate(assignedTo?: string): Promise<number> {
    const { data, error } = await supabase.rpc('generate_inventory_task_interleaving_suggestions', { p_assigned_to: assignedTo || null });
    if (error) throw new Error(error.message);
    return Number(data || 0);
  }
}

export class InventorySlowMovingReportSubscriptionService extends BaseService<InventorySlowMovingReportSubscriptionRecord> {
  constructor() { super('inventory_slow_moving_report_subscriptions'); }
  async run(subscriptionId: string): Promise<string> {
    const { data, error } = await supabase.rpc('generate_inventory_slow_moving_report_run', { p_subscription_id: subscriptionId });
    if (error) throw new Error(error.message);
    return data as string;
  }
}

export class InventoryLocationLabelPrintService extends BaseService<InventoryLocationLabelPrintRecord> {
  constructor() { super('inventory_location_label_prints'); }
  async print(locationId: string, printerName?: string): Promise<Record<string, unknown>> {
    const { data, error } = await supabase.rpc('print_inventory_location_label', { p_location_id: locationId, p_printer_name: printerName || null });
    if (error) throw new Error(error.message);
    return (data || {}) as Record<string, unknown>;
  }
}

class InventoryStorageAnalyticsService {
  async locationMap(): Promise<Record<string, unknown>[]> { const { data, error } = await supabase.from('inventory_location_map').select('*').limit(500); if (error) throw new Error(error.message); return data || []; }
  async heatmap(): Promise<Record<string, unknown>[]> { const { data, error } = await supabase.from('inventory_location_heatmap').select('*').limit(500); if (error) throw new Error(error.message); return data || []; }
  async capacity(): Promise<Record<string, unknown>[]> { const { data, error } = await supabase.from('inventory_capacity_report').select('*').limit(100); if (error) throw new Error(error.message); return data || []; }
  async capacityAlerts(): Promise<Record<string, unknown>[]> { const { data, error } = await supabase.from('inventory_capacity_alerts').select('*').limit(100); if (error) throw new Error(error.message); return data || []; }
  async slowMoving(): Promise<Record<string, unknown>[]> { const { data, error } = await supabase.from('inventory_slow_moving_report').select('*').limit(200); if (error) throw new Error(error.message); return data || []; }
  async seasonalStatus(): Promise<Record<string, unknown>[]> { const { data, error } = await supabase.from('inventory_seasonal_slotting_status').select('*').limit(100); if (error) throw new Error(error.message); return data || []; }
  async interleavingQueue(): Promise<Record<string, unknown>[]> { const { data, error } = await supabase.from('inventory_task_interleaving_queue').select('*').limit(100); if (error) throw new Error(error.message); return data || []; }
  async kpis(): Promise<Record<string, unknown>[]> { const { data, error } = await supabase.from('inventory_storage_kpis').select('*').limit(1); if (error) throw new Error(error.message); return data || []; }
}

export const inventoryAbcClassificationService = new InventoryAbcClassificationService();
export const inventorySlottingRecommendationService = new InventorySlottingRecommendationService();
export const inventoryReplenishmentPolicyService = new InventoryReplenishmentPolicyService();
export const inventoryReplenishmentTaskService = new InventoryReplenishmentTaskService();
export const inventoryLocationLabelPrintService = new InventoryLocationLabelPrintService();
export const inventoryAffinityRuleService = new InventoryAffinityRuleService();
export const inventorySeasonalSlottingPlanService = new InventorySeasonalSlottingPlanService();
export const inventoryTaskInterleavingSuggestionService = new InventoryTaskInterleavingSuggestionService();
export const inventorySlowMovingReportSubscriptionService = new InventorySlowMovingReportSubscriptionService();
export const inventoryStorageAnalyticsService = new InventoryStorageAnalyticsService();
