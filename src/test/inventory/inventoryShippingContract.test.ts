import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Inventory unit 04 shipping/outbound contract', () => {
  it('reads official shipping document and technical checklist', () => {
    expect(read('docs/inventory/04-shipping-outbound-operations.md')).toContain('Packing Station');
    expect(read('docs/inventory/04-shipping-outbound-technical-checklist.md')).toContain('Rate Shopping');
    expect(read('docs/inventory/04-shipping-outbound-technical-checklist.md')).toContain('AC-SHP-07');
  });

  it('0208 migration implements packing shipping documents carriers staging loading tracking notifications and KPIs', () => {
    const sql = read('supabase/migrations/0208_inventory_shipping_outbound.sql');
    for (const obj of ['inventory_packing_stations','inventory_packaging_materials','inventory_packing_sessions','inventory_packages','inventory_package_lines','inventory_carriers','inventory_carrier_services','inventory_shipments','inventory_shipment_packages','inventory_carrier_rate_quotes','inventory_shipping_documents','inventory_shipping_staging_lanes','inventory_loading_manifests','inventory_manifest_packages','inventory_loading_scans','inventory_shipment_tracking_events','inventory_customer_shipping_notifications','inventory_rate_shopping_rules','inventory_carrier_webhook_events','inventory_international_document_templates','inventory_shipping_dashboard','inventory_shipping_kpis','inventory_carrier_performance','inventory_shipping_cost_report','inventory_shipment_tracking_timeline','inventory_manifest_completion']) expect(sql).toContain(obj);
    for (const fn of ['start_inventory_packing_session','suggest_inventory_carton','verify_inventory_pack_scan','close_inventory_package','create_inventory_package','create_inventory_shipment','rate_shop_inventory_shipment','select_inventory_best_rate_quote','generate_inventory_shipping_document','stage_inventory_package','create_inventory_loading_manifest','add_inventory_package_to_manifest','scan_inventory_load_package','close_inventory_loading_manifest','record_inventory_tracking_event','receive_inventory_carrier_webhook']) expect(sql).toContain(fn);
    for (const doc of ['shipping_label','packing_list','bol','commercial_invoice','certificate_of_origin','msds','customs']) expect(sql).toContain(doc);
    expect(sql).not.toContain('p_tenant_id');
  });

  it('exports typed shipping SDK services', () => {
    const sdk = read('src/services/sdk/Inventory/ShippingService.ts');
    const index = read('src/services/sdk/index.ts');
    expect(sdk).toContain("super('inventory_shipments')");
    expect(sdk).toContain("supabase.rpc('rate_shop_inventory_shipment'");
    expect(sdk).toContain("supabase.rpc('scan_inventory_load_package'");
    expect(sdk).toContain("supabase.rpc('select_inventory_best_rate_quote'");
    expect(sdk).toContain("supabase.rpc('receive_inventory_carrier_webhook'");
    expect(index).toContain('inventoryShipmentService');
    expect(index).toContain('inventoryShippingAnalyticsService');
  });

  it('adds shipping pages and routes', () => {
    const router = read('src/router/AppRouter.tsx');
    const legacy = read('src/router/legacyRedirect.ts');
    for (const route of ['shipping/packages','shipping/shipments','shipping/carriers','shipping/documents','shipping/manifests','shipping/manifest-completion','shipping/rate-quotes','shipping/rate-rules','shipping/tracking','shipping/webhooks','shipping/kpis']) expect(router).toContain(route);
    for (const page of ['inventory-shipping-packages','inventory-shipments','inventory-carriers','inventory-shipping-documents','inventory-manifests','inventory-manifest-completion','inventory-rate-quotes','inventory-rate-rules','inventory-shipment-tracking','inventory-carrier-webhooks','inventory-shipping-kpis']) expect(legacy).toContain(page);
    expect(read('src/pages/app/inventory/shipping/ShippingShared.tsx')).toContain('inventoryShippingAnalyticsService');
  });
});
