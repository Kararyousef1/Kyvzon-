/**
 * procurement-send-rfq — إرسال RFQ للموردين عبر Resend/BYOK
 * JWT + role procurement/admin + APP_ORIGIN + BYOK email
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

function isProduction(): boolean {
  return (Deno.env.get('DENO_ENV') || Deno.env.get('APP_ENV') || 'production') === 'production';
}
function resolveAllowedOrigin(req: Request): string {
  const origin = req.headers.get('origin') || '';
  const allowlist = (Deno.env.get('APP_ORIGIN') || '').split(',').map(o=>o.trim()).filter(Boolean);
  const isLocal = origin.includes('localhost') || origin.includes('127.0.0.1');
  if (origin && allowlist.includes(origin)) return origin;
  if (origin && isLocal && !isProduction()) return origin;
  return '';
}
function headers(req: Request): Record<string,string> {
  const origin = resolveAllowedOrigin(req);
  const base: Record<string,string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-name',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };
  if (origin) base['Access-Control-Allow-Origin'] = origin;
  return base;
}
function json(req: Request, body: unknown, status=200): Response {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}

serve(async (req: Request) => {
  if (req.method==='OPTIONS') return new Response(null, { status: 204, headers: headers(req) });
  if (req.method!=='POST') return json(req, { error: 'Method not allowed' }, 405);

  const requestOrigin = req.headers.get('origin');
  if (requestOrigin && resolveAllowedOrigin(req)==='') return json(req, { error: 'Origin not allowed' }, 403);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const authorization = req.headers.get('authorization');
  if (!supabaseUrl || !anonKey || !authorization?.startsWith('Bearer ')) return json(req, { error: 'Auth/config missing' }, 503);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json(req, { error: 'جلسة غير صالحة' }, 401);

  const { data: profile } = await userClient.from('profiles').select('role, tenant_id').eq('id', authData.user.id).single();
  const allowedRoles = new Set(['procurement','admin','developer','it_admin']);
  if (!profile || !allowedRoles.has(String(profile.role))) return json(req, { error: 'غير مخوّل — يتطلب صلاحية مشتريات' }, 403);

  let body: { event_id?: unknown; supplier_ids?: unknown };
  try { body = await req.json(); } catch { return json(req, { error: 'حمولة غير صالحة' }, 400); }
  const eventId = String(body.event_id || '').trim();
  const supplierIds = Array.isArray(body.supplier_ids) ? body.supplier_ids.map((s:any)=>String(s)) : [];
  if (!eventId || !supplierIds.length) return json(req, { error: 'event_id و supplier_ids مطلوبان' }, 400);

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) return json(req, { error: 'Service not configured' }, 503);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // جلب حدث التوريد
  const { data: event, error: eventError } = await admin.from('sourcing_events').select('*').eq('id', eventId).eq('tenant_id', profile.tenant_id).single();
  if (eventError || !event) return json(req, { error: 'حدث التوريد غير موجود' }, 404);

  // جلب الموردين
  const { data: suppliers } = await admin.from('suppliers').select('id, legal_name, email').in('id', supplierIds).eq('tenant_id', profile.tenant_id);

  // مفتاح البريد BYOK
  let resendKey: string | undefined;
  let fromEmail = Deno.env.get('RESEND_FROM') || 'procurement@kyvzon.com';
  try {
    const { data: cred } = await admin.rpc('get_tenant_provider_secret', {
      p_tenant_id: profile.tenant_id, p_channel: 'email', p_provider: 'resend',
    });
    const row = Array.isArray(cred) ? cred[0] : cred;
    if (row?.secret_value) {
      resendKey = row.secret_value;
      if (row.config?.from_email) fromEmail = String(row.config.from_email);
    }
  } catch {}
  if (!resendKey) resendKey = Deno.env.get('RESEND_API_KEY');

  if (!resendKey) {
    return json(req, { mode: 'simulated', message: 'لم يُضبط مفتاح Resend — تم تسجيل الإرسال كمحاكاة', sent_to: suppliers?.length || 0 }, 200);
  }

  let sent = 0;
  let failed = 0;
  for (const sup of suppliers || []) {
    try {
      const email = (sup as any).email || `${(sup as any).legal_name}@example.com`;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromEmail,
          to: email,
          subject: `طلب تسعير ${event.event_number} — ${event.title}`,
          html: `<p>مرحباً ${ (sup as any).legal_name},</p><p>تمت دعوتك لتقديم عرض لحدث التوريد ${event.event_number}: ${event.title}</p><p>نوع الحدث: ${event.type}</p><p>تاريخ الإغلاق: ${event.close_date ? new Date(event.close_date).toLocaleDateString('ar-SA') : '-'}</p><p>يرجى الدخول لبوابة الموردين لتقديم عرضك.</p>`,
        }),
      });
      if (res.ok) sent++; else failed++;
    } catch { failed++; }
  }

  await admin.from('platform_audit_log').insert({
    action: 'procurement_rfq_sent',
    category: 'procurement',
    target_type: 'sourcing_event',
    target_id: eventId,
    details: { event_number: event.event_number, supplier_count: supplierIds.length, sent, failed },
    description: `تم إرسال RFQ ${event.event_number} لـ ${sent} موردين`,
  });

  return json(req, { mode: 'live', ok: true, sent, failed }, 200);
});
