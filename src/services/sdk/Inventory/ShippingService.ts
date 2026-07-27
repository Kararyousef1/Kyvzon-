import { BaseService } from '../BaseService';
import { supabase } from '../../supabase/supabase';

export interface InventoryShipmentRecord { id:string; tenant_id:string; shipment_number:string; source_type:string; consignee_name:string; status:string; tracking_number?:string|null; shipping_cost?:number|null; created_at:string; }
export interface InventoryPackageRecord { id:string; tenant_id:string; package_number:string; package_barcode:string; status:string; actual_weight_kg?:number|null; }
export interface InventoryCarrierRecord { id:string; tenant_id:string; carrier_code:string; name_ar:string; provider:string; api_mode:string; is_active:boolean; }
export interface InventoryShippingDocumentRecord { id:string; tenant_id:string; document_type:string; document_number:string; status:string; generated_at:string; }
export interface InventoryLoadingManifestRecord { id:string; tenant_id:string; manifest_number:string; status:string; truck_number?:string|null; created_at:string; }
export interface InventoryCarrierRateQuoteRecord { id:string; tenant_id:string; shipment_id:string; quoted_cost:number; selected:boolean; created_at:string; }
export interface InventoryTrackingEventRecord { id:string; tenant_id:string; shipment_id:string; event_status:string; event_time:string; details?:string|null; }
export interface InventoryRateShoppingRuleRecord { id:string; tenant_id:string; rule_code:string; name_ar:string; strategy:string; is_active:boolean; }
export interface InventoryCarrierWebhookEventRecord { id:string; tenant_id:string; tracking_number?:string|null; event_status?:string|null; processed:boolean; received_at:string; }

export class InventoryShipmentService extends BaseService<InventoryShipmentRecord> {
  constructor(){ super('inventory_shipments'); }
  async createShipment(input: Record<string, unknown>): Promise<string> {
    const {data,error}=await supabase.rpc('create_inventory_shipment',{p_source_type:input.source_type,p_source_id:input.source_id||null,p_consignee_name:input.consignee_name,p_consignee_address:input.consignee_address,p_destination_city:input.destination_city||null,p_destination_country:input.destination_country||'SA',p_package_ids:input.package_ids||[]});
    if(error) throw new Error(error.message); return data as string;
  }
  async rateShop(id:string): Promise<number> { const {data,error}=await supabase.rpc('rate_shop_inventory_shipment',{p_shipment_id:id}); if(error) throw new Error(error.message); return Number(data||0); }
  async selectBestQuote(id:string, ruleId?:string): Promise<string> { const {data,error}=await supabase.rpc('select_inventory_best_rate_quote',{p_shipment_id:id,p_rule_id:ruleId||null}); if(error) throw new Error(error.message); return data as string; }
  async document(id:string, type:string, packageId?:string): Promise<string> { const {data,error}=await supabase.rpc('generate_inventory_shipping_document',{p_shipment_id:id,p_package_id:packageId||null,p_document_type:type}); if(error) throw new Error(error.message); return data as string; }
  async tracking(id:string, status:string, details?:string): Promise<string> { const {data,error}=await supabase.rpc('record_inventory_tracking_event',{p_shipment_id:id,p_event_status:status,p_location_text:null,p_details:details||null,p_raw_payload:{}}); if(error) throw new Error(error.message); return data as string; }
}

export class InventoryPackageService extends BaseService<InventoryPackageRecord> {
  constructor(){ super('inventory_packages'); }
  async createPackage(packingSessionId:string, packagingMaterialId?:string):Promise<string>{ const{data,error}=await supabase.rpc('create_inventory_package',{p_packing_session_id:packingSessionId,p_packaging_material_id:packagingMaterialId||null}); if(error) throw new Error(error.message); return data as string; }
  async close(input:Record<string,unknown>):Promise<string>{const{data,error}=await supabase.rpc('close_inventory_package',{p_packing_session_id:input.packing_session_id,p_packaging_material_id:input.packaging_material_id||null,p_actual_weight_kg:input.actual_weight_kg||null,p_length_cm:input.length_cm||null,p_width_cm:input.width_cm||null,p_height_cm:input.height_cm||null}); if(error) throw new Error(error.message); return data as string;}
}

export class InventoryCarrierService extends BaseService<InventoryCarrierRecord> { constructor(){ super('inventory_carriers'); } }
export class InventoryShippingDocumentService extends BaseService<InventoryShippingDocumentRecord> { constructor(){ super('inventory_shipping_documents'); } }
export class InventoryCarrierRateQuoteService extends BaseService<InventoryCarrierRateQuoteRecord> { constructor(){ super('inventory_carrier_rate_quotes'); } }
export class InventoryRateShoppingRuleService extends BaseService<InventoryRateShoppingRuleRecord> { constructor(){ super('inventory_rate_shopping_rules'); } }
export class InventoryCarrierWebhookEventService extends BaseService<InventoryCarrierWebhookEventRecord> {
  constructor(){ super('inventory_carrier_webhook_events'); }
  async receive(carrierId:string, trackingNumber:string, eventStatus:string, payload:Record<string,unknown> = {}):Promise<string>{ const{data,error}=await supabase.rpc('receive_inventory_carrier_webhook',{p_carrier_id:carrierId,p_tracking_number:trackingNumber,p_event_status:eventStatus,p_payload:payload}); if(error) throw new Error(error.message); return data as string; }
}

export class InventoryLoadingManifestService extends BaseService<InventoryLoadingManifestRecord> {
  constructor(){ super('inventory_loading_manifests'); }
  async createManifest(input:Record<string,unknown>):Promise<string>{ const{data,error}=await supabase.rpc('create_inventory_loading_manifest',{p_warehouse_id:input.warehouse_id,p_carrier_id:input.carrier_id||null,p_truck_number:input.truck_number||null,p_driver_name:input.driver_name||null}); if(error) throw new Error(error.message); return data as string; }
  async addPackage(manifestId:string, packageId:string):Promise<string>{ const{data,error}=await supabase.rpc('add_inventory_package_to_manifest',{p_manifest_id:manifestId,p_package_id:packageId}); if(error) throw new Error(error.message); return data as string; }
  async scan(manifestId:string, barcode:string):Promise<string>{const{data,error}=await supabase.rpc('scan_inventory_load_package',{p_manifest_id:manifestId,p_package_barcode:barcode}); if(error) throw new Error(error.message); return data as string;}
  async close(manifestId:string):Promise<void>{const{error}=await supabase.rpc('close_inventory_loading_manifest',{p_manifest_id:manifestId}); if(error) throw new Error(error.message);}
}

class InventoryShippingAnalyticsService {
  async dashboard(){const{data,error}=await supabase.from('inventory_shipping_dashboard').select('*').limit(1); if(error) throw new Error(error.message); return data||[]}
  async kpis(){const{data,error}=await supabase.from('inventory_shipping_kpis').select('*').limit(1); if(error) throw new Error(error.message); return data||[]}
  async carrierPerformance(){const{data,error}=await supabase.from('inventory_carrier_performance').select('*').limit(100); if(error) throw new Error(error.message); return data||[]}
  async costReport(){const{data,error}=await supabase.from('inventory_shipping_cost_report').select('*').limit(100); if(error) throw new Error(error.message); return data||[]}
  async trackingTimeline(){const{data,error}=await supabase.from('inventory_shipment_tracking_timeline').select('*').limit(200); if(error) throw new Error(error.message); return data||[]}
  async manifestCompletion(){const{data,error}=await supabase.from('inventory_manifest_completion').select('*').limit(100); if(error) throw new Error(error.message); return data||[]}
}

export const inventoryShipmentService=new InventoryShipmentService();
export const inventoryPackageService=new InventoryPackageService();
export const inventoryCarrierService=new InventoryCarrierService();
export const inventoryShippingDocumentService=new InventoryShippingDocumentService();
export const inventoryCarrierRateQuoteService=new InventoryCarrierRateQuoteService();
export const inventoryRateShoppingRuleService=new InventoryRateShoppingRuleService();
export const inventoryCarrierWebhookEventService=new InventoryCarrierWebhookEventService();
export const inventoryLoadingManifestService=new InventoryLoadingManifestService();
export const inventoryShippingAnalyticsService=new InventoryShippingAnalyticsService();
