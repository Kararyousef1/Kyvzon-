import { supabase } from '../supabase/supabase';

/**
 * Read-only lookup registry used by MRP forms.
 *
 * Keeping the table name, projection and row cap inside the SDK prevents UI
 * components from issuing arbitrary Supabase queries while preserving the
 * small, purpose-built datasets required by select controls.
 */
const MRP_LOOKUPS = {
  bomVersionDetailed: { table: 'mrp_bom_versions', select: 'id,version_no,status,bom_id,mrp_bom_headers(bom_code)', limit: 300 },
  bomVersion: { table: 'mrp_bom_versions', select: 'id,version_no,status', limit: 200 },
  bomLine: { table: 'mrp_bom_lines', select: 'id,line_no,component_item_id', limit: 300 },
  ecr: { table: 'mrp_engineering_change_requests', select: 'id,ecr_number,reason,status', limit: 200 },
  eco: { table: 'mrp_engineering_change_orders', select: 'id,eco_number,status,effectivity_date', limit: 200 },

  plant: { table: 'manufacturing_plants', select: 'id,plant_code,name_ar,status', limit: 200 },
  workCenter: { table: 'work_centers', select: 'id,work_center_code,name_ar,status', limit: 200 },
  forecastRun: { table: 'mrp_forecast_runs', select: 'id,run_number,method,bucket,status', limit: 200 },
  forecastModel: { table: 'mrp_forecast_models', select: 'id,model_code,method,bucket,status', limit: 200 },
  mpsPlan: { table: 'mrp_mps_plans', select: 'id,plan_number,plan_name,status', limit: 200 },
  mpsBoardLine: { table: 'mrp_mps_board', select: 'mps_line_id,item_code,bucket_start,mps_qty,status', limit: 300 },
  forecastLine: { table: 'mrp_forecast_line_board', select: 'id,run_number,item_code,bucket_start,final_forecast_qty', limit: 300 },
  mpsAlert: { table: 'mrp_mps_alerts', select: 'id,alert_type,severity,title,status', limit: 200 },

  workOrder: { table: 'mrp_work_orders', select: 'id,work_order_number,status', limit: 200 },
  workOrderPlanning: { table: 'mrp_work_orders', select: 'id,work_order_number,status,quantity_to_produce', limit: 200 },
  workCenterWip: { table: 'work_centers', select: 'id,work_center_code,name_ar,status', limit: 200 },
  wipLocation: { table: 'mrp_wip_location_lookup', select: 'id,wip_code,name_ar,status', limit: 200 },
  workOrderMaterialDetailed: { table: 'mrp_work_order_materials', select: 'id,item_id,required_qty,issued_qty,status', limit: 300 },
  workOrderMaterial: { table: 'mrp_work_order_materials', select: 'id,item_id,required_qty,status', limit: 300 },
  valuationPolicy: { table: 'mrp_inventory_valuation_policies', select: 'id,item_id,valuation_method,is_active', limit: 200 },
  workOrderOperation: { table: 'mrp_work_order_operations', select: 'id,operation_name,sequence_no,status', limit: 300 },
  inventoryLot: { table: 'inventory_lots', select: 'id,lot_number,status,quality_status', limit: 300 },

  plannedOrder: { table: 'mrp_planned_orders', select: 'id,planned_order_number,status,suggested_qty', limit: 200 },
  routing: { table: 'routing_headers', select: 'id,routing_code,version_no,status', limit: 200 },
  dispatch: { table: 'mrp_dispatch_lookup', select: 'id,dispatch_number,status,operation_name', limit: 200 },
  workOrderAlert: { table: 'mrp_work_order_alerts', select: 'id,alert_type,severity,title,status', limit: 200 },

  procurementRecommendation: { table: 'mrp_procurement_recommendations', select: 'id,recommendation_number,description,status,required_qty', limit: 200 },
  bomExplosionRun: { table: 'mrp_bom_explosion_runs', select: 'id,run_number,demand_quantity,status', limit: 200 },
  supplierTcoCandidate: { table: 'mrp_supplier_tco_candidate_board', select: 'id,recommendation_number,supplier_name,tco_score,status', limit: 200 },
  procurementAlert: { table: 'mrp_procurement_alerts', select: 'id,alert_type,severity,title,status', limit: 200 },

  qualityPlan: { table: 'mrp_quality_inspection_plans', select: 'id,plan_code,name_ar,inspection_stage,status', limit: 200 },
  qualityInspection: { table: 'mrp_quality_inspections', select: 'id,inspection_number,inspection_stage,status,decision', limit: 200 },
  qualityNcr: { table: 'mrp_quality_ncrs', select: 'id,ncr_number,defect_class,status', limit: 200 },
  qualityDevice: { table: 'mrp_quality_measurement_devices', select: 'id,device_code,name_ar,status', limit: 200 },
  qualityTemplate: { table: 'mrp_quality_checklist_templates', select: 'id,template_code,name_ar,status', limit: 200 },
  qualityInspectionPoint: { table: 'mrp_quality_inspection_point_lookup', select: 'id,point_code,name_ar,inspection_stage', limit: 200 },
} as const;

export type MrpLookupKey = keyof typeof MRP_LOOKUPS;
export type MrpLookupRow = Record<string, unknown>;

class MrpLookupService {
  async find(key: MrpLookupKey): Promise<MrpLookupRow[]> {
    const config = MRP_LOOKUPS[key];
    const { data, error } = await supabase
      .from(config.table)
      .select(config.select)
      .limit(config.limit);

    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as MrpLookupRow[];
  }
}

export const mrpLookupService = new MrpLookupService();
