// ============================================================================
// Kyvzon Platform
// Edge Function: biometric-device-action
// PURPOSE: Admin/IT actions for biometric devices from Tech Portal.
// ACTIONS:
//   - test_connection: validates device record/config and logs a test event.
//   - manual_sync: records a manual sync request placeholder until a network agent is connected.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { audit, enforceRateLimit, json, requireAdmin } from '../_shared/adminAuth.ts';

const RATE_LIMIT = { windowMs: 60_000, max: 30 };

type Action = 'test_connection' | 'manual_sync';

interface RequestBody {
  action: Action;
  device_id?: string;
  notes?: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const context = await requireAdmin(req);
  if (context instanceof Response) return context;

  const limited = enforceRateLimit(req, context.caller.id, 'biometric-device-action', RATE_LIMIT);
  if (limited) return limited;

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'Invalid JSON body' }, 400);
  }

  const action = body.action;
  if (!['test_connection', 'manual_sync'].includes(action)) {
    return json(req, { error: 'Invalid action' }, 400);
  }

  const tenantId = context.callerProfile.tenant_id;
  if (!tenantId) return json(req, { error: 'Missing tenant context' }, 403);

  try {
    if (action === 'test_connection') {
      if (!body.device_id) return json(req, { error: 'device_id is required' }, 400);

      const { data: device, error: deviceError } = await context.adminClient
        .from('biometric_devices')
        .select('id, name, ip_address, port, is_active, tenant_id')
        .eq('id', body.device_id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (deviceError) return json(req, { error: deviceError.message }, 500);
      if (!device) return json(req, { error: 'Device not found in caller tenant' }, 404);
      if (!device.ip_address) return json(req, { ok: false, message: 'Device has no IP address' }, 400);

      // Supabase Edge cannot usually reach private LAN devices directly.
      // This action validates the device config and records an operational test.
      const now = new Date().toISOString();
      await context.adminClient
        .from('biometric_devices')
        .update({ last_sync_at: now, updated_at: now })
        .eq('id', device.id)
        .eq('tenant_id', tenantId);

      await context.adminClient.from('sync_log').insert({
        tenant_id: tenantId,
        source: 'tech_portal_test_connection',
        device_id: device.id,
        records_synced: 0,
        status: 'success',
        sync_time: now,
        details: {
          device_name: device.name,
          ip_address: device.ip_address,
          port: device.port,
          note: 'Configuration validated by Edge Function. Real LAN test requires an on-premise agent or VPN.',
        },
      });

      await audit(context.adminClient, tenantId, context.caller.id, device.id, 'biometric_test_connection', {
        device_name: device.name,
        ip_address: device.ip_address,
      });

      return json(req, {
        ok: true,
        message: `تم التحقق من إعدادات الجهاز ${device.name}. الاتصال الفعلي يحتاج Agent/VPN إذا كان الجهاز داخل شبكة محلية.`,
        checked_at: now,
      });
    }

    if (action === 'manual_sync') {
      const now = new Date().toISOString();
      let deviceName = 'all-devices';
      let deviceId = body.device_id || 'all-devices';

      if (body.device_id) {
        const { data: device } = await context.adminClient
          .from('biometric_devices')
          .select('id, name')
          .eq('id', body.device_id)
          .eq('tenant_id', tenantId)
          .maybeSingle();
        if (!device) return json(req, { error: 'Device not found in caller tenant' }, 404);
        deviceName = device.name;
        deviceId = device.id;
      }

      await context.adminClient.from('sync_log').insert({
        tenant_id: tenantId,
        source: 'tech_portal_manual_sync_request',
        device_id: deviceId,
        records_synced: 0,
        status: 'partial',
        sync_time: now,
        details: {
          device_name: deviceName,
          requested_by: context.caller.id,
          notes: body.notes || null,
          note: 'Manual sync request recorded. Real pull sync requires an on-premise agent or a scheduled integration worker.',
        },
      });

      await audit(context.adminClient, tenantId, context.caller.id, deviceId, 'biometric_manual_sync_requested', {
        device_name: deviceName,
      });

      return json(req, {
        ok: true,
        message: 'تم تسجيل طلب المزامنة اليدوية. تنفيذ المزامنة الفعلية يتطلب Agent/Job متصل بالأجهزة.',
        requested_at: now,
      });
    }

    return json(req, { error: 'Unhandled action' }, 400);
  } catch (err) {
    console.error('biometric-device-action failed:', err);
    return json(req, { error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
