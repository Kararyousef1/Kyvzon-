import { BaseService } from '../BaseService';
import { supabase } from '../../supabase/supabase';

export interface InventoryRmaRecord { id:string; tenant_id:string; rma_number:string; return_type:string; customer_name?:string|null; status:string; reason_code:string; expected_total_value:number; created_at:string; }
export interface InventoryRmaLineRecord { id:string; tenant_id:string; rma_id:string; item_id:string; expected_qty:number; received_qty:number; status:string; created_at:string; }
export interface InventoryReturnReceiptRecord { id:string; tenant_id:string; receipt_number:string; rma_id?:string|null; warehouse_id:string; status:string; received_at:string; }
export interface InventoryReturnReceiptLineRecord { id:string; tenant_id:string; receipt_id:string; item_id:string; received_qty:number; status:string; created_at:string; }
export interface InventoryReturnConditionAssessmentRecord { id:string; tenant_id:string; receipt_line_id:string; condition_grade:'A'|'B'|'C'|'D'; recommended_disposition:string; estimated_recovered_value:number; assessed_at:string; }
export interface InventoryReturnDispositionTaskRecord { id:string; tenant_id:string; task_number:string; disposition:string; quantity:number; status:string; created_at:string; }
export interface InventoryReturnRtvClaimRecord { id:string; tenant_id:string; rtv_number:string; supplier_id:string; item_id:string; quantity:number; claim_value:number; status:string; created_at:string; }
export interface InventoryProductionReturnRecord { id:string; tenant_id:string; production_return_number:string; work_order_id:string; status:string; reason_code:string; created_at:string; }
export interface InventoryReturnCustomerNotificationRecord { id:string; tenant_id:string; rma_id:string; notification_type:string; channel:string; status:string; created_at:string; }
export interface InventorySupplierRtvReportRecord { id:string; tenant_id:string; report_number:string; supplier_id:string; total_claims:number; total_claim_value:number; status:string; generated_at:string; }
export interface InventoryReturnCapaActionRecord { id:string; tenant_id:string; corrective_action:string; preventive_action?:string|null; status:string; created_at:string; }

type Json = Record<string, unknown> | unknown[];

export class InventoryRmaService extends BaseService<InventoryRmaRecord>{
  constructor(){super('inventory_rmas')}
  async createRma(input:Record<string,unknown>):Promise<string>{
    const {data,error}=await supabase.rpc('create_inventory_rma',{
      p_return_type: input.return_type || 'customer_return',
      p_customer_id: input.customer_id || null,
      p_customer_name: input.customer_name || null,
      p_supplier_id: input.supplier_id || null,
      p_original_sales_order_id: input.original_sales_order_id || null,
      p_original_invoice_id: input.original_invoice_id || null,
      p_original_shipment_id: input.original_shipment_id || null,
      p_original_po_id: input.original_po_id || null,
      p_reason_code: input.reason_code,
      p_warranty_valid: input.warranty_valid ?? true,
      p_valid_days: input.valid_days || 30,
      p_packing_instructions: input.packing_instructions || null,
      p_shipping_instructions: input.shipping_instructions || null,
      p_lines: input.lines || [],
    });
    if(error) throw new Error(error.message); return data as string;
  }
  async approve(rmaId:string, decision:string, labelUrl?:string, instructions?:string, validDays=30):Promise<void>{
    const {error}=await supabase.rpc('approve_inventory_rma',{p_rma_id:rmaId,p_decision:decision,p_return_label_url:labelUrl||null,p_instructions:instructions||null,p_valid_days:validDays});
    if(error) throw new Error(error.message);
  }
}

export class InventoryReturnReceiptService extends BaseService<InventoryReturnReceiptRecord>{
  constructor(){super('inventory_return_receipts')}
  async receive(input:Record<string,unknown>):Promise<string>{
    const {data,error}=await supabase.rpc('receive_inventory_return',{p_rma_id:input.rma_id,p_warehouse_id:input.warehouse_id,p_quarantine_location_id:input.quarantine_location_id||null,p_package_condition:input.package_condition||'unknown',p_carrier_name:input.carrier_name||null,p_tracking_number:input.tracking_number||null,p_lines:input.lines||[]});
    if(error) throw new Error(error.message); return data as string;
  }
  async scan(receiptId:string, value:string, scanType='barcode'):Promise<unknown[]>{
    const {data,error}=await supabase.rpc('scan_inventory_return_barcode',{p_receipt_id:receiptId,p_scanned_value:value,p_scan_type:scanType});
    if(error) throw new Error(error.message); return data || [];
  }
}

export class InventoryReturnConditionAssessmentService extends BaseService<InventoryReturnConditionAssessmentRecord>{
  constructor(){super('inventory_return_condition_assessments')}
  async grade(input:Record<string,unknown>):Promise<string>{
    const {data,error}=await supabase.rpc('grade_inventory_return_line',{p_receipt_line_id:input.receipt_line_id,p_condition_grade:input.condition_grade,p_defect_source:input.defect_source||null,p_defect_type:input.defect_type||null,p_defect_description:input.defect_description||null,p_functional_test_result:input.functional_test_result||'not_required',p_packaging_status:input.packaging_status||null,p_estimated_original_value:input.estimated_original_value||0,p_estimated_recovered_value:input.estimated_recovered_value||0,p_photos:input.photos||[]});
    if(error) throw new Error(error.message); return data as string;
  }
}

export class InventoryReturnDispositionTaskService extends BaseService<InventoryReturnDispositionTaskRecord>{
  constructor(){super('inventory_return_disposition_tasks')}
  async route(input:Record<string,unknown>):Promise<string>{
    const {data,error}=await supabase.rpc('route_inventory_return_disposition',{p_assessment_id:input.assessment_id,p_disposition:input.disposition,p_target_warehouse_id:input.target_warehouse_id||null,p_target_location_id:input.target_location_id||null,p_refurbished_item_id:input.refurbished_item_id||null,p_supplier_id:input.supplier_id||null,p_notes:input.notes||null});
    if(error) throw new Error(error.message); return data as string;
  }
  async complete(taskId:string, actualRecoveredValue?:number, environmentalDocUrl?:string, creditNoteNumber?:string):Promise<void>{
    const {error}=await supabase.rpc('complete_inventory_return_disposition',{p_task_id:taskId,p_actual_recovered_value:actualRecoveredValue||null,p_environmental_doc_url:environmentalDocUrl||null,p_credit_note_number:creditNoteNumber||null});
    if(error) throw new Error(error.message);
  }
}

export class InventoryProductionReturnService extends BaseService<InventoryProductionReturnRecord>{
  constructor(){super('inventory_production_returns')}
  async createReturn(input:Record<string,unknown>):Promise<string>{
    const {data,error}=await supabase.rpc('create_inventory_production_return',{p_work_order_id:input.work_order_id,p_warehouse_id:input.warehouse_id,p_return_location_id:input.return_location_id||null,p_reason_code:input.reason_code||'unused_material',p_quality_required:input.quality_required??true,p_lines:input.lines||[]});
    if(error) throw new Error(error.message); return data as string;
  }
  async receive(id:string, qualityStatus:string, notes?:string):Promise<number>{
    const {data,error}=await supabase.rpc('receive_inventory_production_return',{p_production_return_id:id,p_quality_status:qualityStatus,p_visual_inspection_notes:notes||null});
    if(error) throw new Error(error.message); return Number(data||0);
  }
}

export class InventoryReturnRtvClaimService extends BaseService<InventoryReturnRtvClaimRecord>{constructor(){super('inventory_return_rtv_claims')}}
export class InventoryReturnCustomerNotificationService extends BaseService<InventoryReturnCustomerNotificationRecord>{
  constructor(){super('inventory_return_customer_notifications')}
  async send(rmaId:string,type:string,channel:string,recipient:string,message:string,payload:Json={}):Promise<string>{const{data,error}=await supabase.rpc('send_inventory_return_notification',{p_rma_id:rmaId,p_notification_type:type,p_channel:channel,p_recipient:recipient,p_message:message,p_payload:payload}); if(error) throw new Error(error.message); return data as string;}
}
export class InventorySupplierRtvReportService extends BaseService<InventorySupplierRtvReportRecord>{
  constructor(){super('inventory_supplier_rtv_reports')}
  async generate(supplierId:string,from:string,to:string):Promise<string>{const{data,error}=await supabase.rpc('generate_inventory_supplier_rtv_report',{p_supplier_id:supplierId,p_period_start:from,p_period_end:to}); if(error) throw new Error(error.message); return data as string;}
}
export class InventoryReturnCapaActionService extends BaseService<InventoryReturnCapaActionRecord>{constructor(){super('inventory_return_capa_actions')}}

class InventoryReturnsAnalyticsService{
  async dashboard(){const{data,error}=await supabase.from('inventory_returns_dashboard').select('*').limit(20); if(error) throw new Error(error.message); return data||[];}
  async kpis(){const{data,error}=await supabase.from('inventory_returns_kpis').select('*').limit(20); if(error) throw new Error(error.message); return data||[];}
  async conditionDistribution(){const{data,error}=await supabase.from('inventory_return_condition_distribution').select('*').limit(100); if(error) throw new Error(error.message); return data||[];}
  async reasonAnalysis(){const{data,error}=await supabase.from('inventory_return_reason_analysis').select('*').limit(100); if(error) throw new Error(error.message); return data||[];}
  async valueRecovery(){const{data,error}=await supabase.from('inventory_return_value_recovery').select('*').limit(100); if(error) throw new Error(error.message); return data||[];}
  async supplierRtvSummary(){const{data,error}=await supabase.from('inventory_supplier_rtv_report_summary').select('*').limit(100); if(error) throw new Error(error.message); return data||[];}
  async productionDashboard(){const{data,error}=await supabase.from('inventory_production_returns_dashboard').select('*').limit(100); if(error) throw new Error(error.message); return data||[];}
  async qualityDefects(){const{data,error}=await supabase.from('inventory_return_quality_defects_report').select('*').limit(100); if(error) throw new Error(error.message); return data||[];}
}

export const inventoryRmaService=new InventoryRmaService();
export const inventoryReturnReceiptService=new InventoryReturnReceiptService();
export const inventoryReturnConditionAssessmentService=new InventoryReturnConditionAssessmentService();
export const inventoryReturnDispositionTaskService=new InventoryReturnDispositionTaskService();
export const inventoryProductionReturnService=new InventoryProductionReturnService();
export const inventoryReturnRtvClaimService=new InventoryReturnRtvClaimService();
export const inventoryReturnCustomerNotificationService=new InventoryReturnCustomerNotificationService();
export const inventorySupplierRtvReportService=new InventorySupplierRtvReportService();
export const inventoryReturnCapaActionService=new InventoryReturnCapaActionService();
export const inventoryReturnsAnalyticsService=new InventoryReturnsAnalyticsService();
