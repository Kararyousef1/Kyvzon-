import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Inventory unit 01 receiving/inbound contract', () => {
  it('reads the official receiving document and technical checklist', () => {
    expect(read('docs/inventory/01-receiving-inbound-operations.md')).toContain('Advanced Shipping Notice');
    expect(read('docs/inventory/01-receiving-inbound-operations.md')).toContain('OS&D');
    expect(read('docs/inventory/01-receiving-inbound-technical-checklist.md')).toContain('inventory_asns');
    expect(read('docs/inventory/01-receiving-inbound-technical-checklist.md')).toContain('AC-RCV-06');
  });

  it('0205 migration implements ASN dock receiving OSD quarantine LPN cross-dock and KPIs', () => {
    const sql = read('supabase/migrations/0205_inventory_receiving_inbound.sql');
    for (const object of [
      'inventory_asns', 'inventory_asn_lines', 'inventory_dock_appointments',
      'inventory_receiving_sessions', 'inventory_receiving_lines', 'inventory_osd_cases',
      'inventory_quarantine_holds', 'inventory_putaway_tasks', 'inventory_cross_dock_tasks',
      'inventory_receiving_scans', 'inventory_lpn_label_prints', 'inventory_inbound_notifications',
      'inventory_receiving_dashboard', 'inventory_receiving_kpis', 'inventory_receiving_osd_report', 'inventory_receiving_productivity',
    ]) expect(sql).toContain(object);
    for (const fn of [
      'create_inventory_asn', 'schedule_inventory_dock_appointment', 'start_inventory_receiving_session',
      'record_inventory_receiving_line', 'create_inventory_osd_case', 'generate_inventory_lpn_for_receipt',
      'scan_inventory_receiving_barcode', 'print_inventory_lpn_label',
      'post_inventory_receiving_session',
    ]) expect(sql).toContain(fn);
    expect(sql).toContain('DOCK_WINDOW_ALREADY_BOOKED');
    expect(sql).toContain('quality_hold_qty=quality_hold_qty+v_line.accepted_qty');
    expect(sql).toContain('INSERT INTO public.goods_receipts');
    expect(sql).toContain('UPDATE public.purchase_orders');
    expect(sql).toContain('inventory_inbound_notifications');
    expect(sql).toContain('NOTIFY pgrst');
    expect(sql).not.toContain('p_tenant_id');
  });

  it('exports typed receiving SDK services and RPC wrappers', () => {
    const sdk = read('src/services/sdk/Inventory/ReceivingService.ts');
    const index = read('src/services/sdk/index.ts');
    expect(sdk).toContain("super('inventory_asns')");
    expect(sdk).toContain("supabase.rpc('create_inventory_asn'");
    expect(sdk).toContain("supabase.rpc('post_inventory_receiving_session'");
    expect(sdk).toContain("supabase.rpc('scan_inventory_receiving_barcode'");
    expect(sdk).toContain("supabase.rpc('print_inventory_lpn_label'");
    expect(index).toContain('inventoryReceivingSessionService');
    expect(index).toContain('inventoryReceivingAnalyticsService');
  });

  it('adds receiving pages and routes under inventory/receiving', () => {
    const router = read('src/router/AppRouter.tsx');
    const legacy = read('src/router/legacyRedirect.ts');
    for (const route of ['receiving/asn', 'receiving/dock-schedule', 'receiving/sessions', 'receiving/osd', 'receiving/quarantine', 'receiving/putaway', 'receiving/cross-dock', 'receiving/mobile-scan', 'receiving/lpn-labels', 'receiving/reports']) {
      expect(router).toContain(route);
    }
    for (const page of ['inventory-asn','inventory-dock-schedule','inventory-receiving-sessions','inventory-osd','inventory-quarantine','inventory-putaway','inventory-cross-dock','inventory-mobile-scan','inventory-lpn-labels','inventory-receiving-reports']) {
      expect(legacy).toContain(page);
    }
    expect(read('src/pages/app/inventory/receiving/ReceivingShared.tsx')).toContain('inventoryReceivingAnalyticsService');
  });

  it('adds Edge Functions for receiving attachments and supplier dock booking', () => {
    const attachmentFn = read('supabase/functions/inventory-receiving-attachment/index.ts');
    const supplierDockFn = read('supabase/functions/inventory-supplier-dock-portal/index.ts');
    const config = read('supabase/config.toml');
    expect(attachmentFn).toContain('inventory-receiving-documents');
    expect(attachmentFn).toContain('inventory_receiving_attachments');
    expect(supplierDockFn).toContain('inventory_supplier_dock_invites');
    expect(supplierDockFn).toContain('inventory_dock_appointments');
    expect(read('src/router/AppRouter.tsx')).toContain('/supplier-dock/:token');
    expect(read('src/pages/public/supplier/SupplierDockPortalPage.tsx')).toContain('inventory-supplier-dock-portal');
    expect(config).toContain('[functions.inventory-receiving-attachment]');
    expect(config).toContain('[functions.inventory-supplier-dock-portal]');
  });
});
