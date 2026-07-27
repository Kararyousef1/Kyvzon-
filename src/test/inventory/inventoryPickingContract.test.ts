import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Inventory unit 03 picking/fulfillment contract', () => {
  it('reads official picking document and technical checklist', () => {
    expect(read('docs/inventory/03-picking-operations-fulfillment.md')).toContain('Wave Picking');
    expect(read('docs/inventory/03-picking-operations-technical-checklist.md')).toContain('Scan-to-Confirm');
    expect(read('docs/inventory/03-picking-operations-technical-checklist.md')).toContain('AC-PICK-07');
  });

  it('0207 migration implements pick orders methods waves scans exceptions productivity and KPIs', () => {
    const sql = read('supabase/migrations/0207_inventory_picking_fulfillment.sql');
    for (const obj of ['inventory_pick_orders','inventory_pick_order_lines','inventory_pick_waves','inventory_pick_wave_orders','inventory_pick_lists','inventory_pick_containers','inventory_pick_tasks','inventory_pick_scans','inventory_pick_exceptions','inventory_picking_technology_events','inventory_pick_zone_handoffs','inventory_pick_sorting_sessions','inventory_pick_sorting_lines','inventory_pick_task_queue','inventory_picking_productivity','inventory_picking_exceptions_report','inventory_picking_kpis','inventory_pick_wave_dashboard','inventory_pick_route_map','inventory_pick_sorting_dashboard','inventory_picking_technology_events_report','inventory_zone_handoff_queue']) expect(sql).toContain(obj);
    for (const fn of ['create_inventory_pick_order','generate_inventory_pick_list','confirm_inventory_pick_scan','report_inventory_pick_exception','create_inventory_pick_wave','release_inventory_pick_wave','generate_inventory_picking_interleaving','confirm_inventory_voice_pick','trigger_inventory_pick_to_light','ingest_inventory_rfid_pick_event','create_inventory_pick_sorting_session','confirm_inventory_sorting_line','create_inventory_zone_handoff','complete_inventory_zone_handoff']) expect(sql).toContain(fn);
    for (const method of ['discrete','batch','cluster','zone','wave']) expect(sql).toContain(method);
    for (const tech of ['barcode','voice','pick_to_light','rfid']) expect(sql).toContain(tech);
    expect(sql).toContain('WRONG_ITEM_SCAN');
    expect(sql).toContain('short_pick');
    expect(sql).not.toContain('p_tenant_id');
  });

  it('exports typed picking SDK services and RPC wrappers', () => {
    const sdk = read('src/services/sdk/Inventory/PickingService.ts');
    const index = read('src/services/sdk/index.ts');
    expect(sdk).toContain("super('inventory_pick_orders')");
    expect(sdk).toContain("supabase.rpc('confirm_inventory_pick_scan'");
    expect(sdk).toContain("supabase.rpc('release_inventory_pick_wave'");
    expect(sdk).toContain('confirmVoice');
    expect(sdk).toContain('triggerPickToLight');
    expect(sdk).toContain('ingestRfid');
    expect(index).toContain('inventoryPickOrderService');
    expect(index).toContain('inventoryPickingAnalyticsService');
  });

  it('adds picking pages and routes', () => {
    const router = read('src/router/AppRouter.tsx');
    const legacy = read('src/router/legacyRedirect.ts');
    for (const route of ['picking/orders','picking/tasks','picking/waves','picking/exceptions','picking/scans','picking/productivity','picking/kpis','picking/route-map','picking/voice','picking/pick-to-light','picking/rfid','picking/sorting','picking/handoffs']) expect(router).toContain(route);
    for (const page of ['inventory-pick-orders','inventory-pick-tasks','inventory-pick-waves','inventory-pick-exceptions','inventory-pick-scans','inventory-picking-productivity','inventory-picking-kpis','inventory-pick-route-map','inventory-voice-picking','inventory-pick-to-light','inventory-rfid-picking','inventory-pick-sorting','inventory-zone-handoffs']) expect(legacy).toContain(page);
    expect(read('src/pages/app/inventory/picking/PickingShared.tsx')).toContain('Scan-to-Confirm');
  });
});
