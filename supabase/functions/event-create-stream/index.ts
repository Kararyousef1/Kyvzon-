/**
 * ═════════════════════════════════════════════════════════════════════════
 *  event-create-stream — إنشاء اجتماع بث تلقائياً (Zoom) لفعالية افتراضية
 *
 *  الدور: الوسيط الآمن بين البوابة وZoom (نفس نمط بقية المزوّدين).
 *   - مستخدم مُصادَق (JWT) بصلاحية تسويق يطلب إنشاء اجتماع لفعالية.
 *   - يقرأ مفاتيح Zoom (Server-to-Server OAuth) من Secrets، يُنشئ اجتماعاً،
 *     ويحفظ رابط الانضمام على الفعالية عبر service role.
 *
 *  بلا مفاتيح Zoom → mode='simulated' (استخدم الرابط اليدوي، لا يفشل).
 *  المتغيّرات: ZOOM_ACCOUNT_ID · ZOOM_CLIENT_ID · ZOOM_CLIENT_SECRET.
 *
 *  ملاحظة: المسار اليدوي (لصق الرابط) يعمل دائماً بلا هذه الدالة — وهو الأكثر
 *  استخداماً. هذه الدالة للإنشاء التلقائي المتقدّم فقط.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

function isProduction(): boolean {
  return (Deno.env.get('DENO_ENV') || Deno.env.get('APP_ENV') || 'production') === 'production';
}
function resolveAllowedOrigin(req: Request): string {
  const origin = req.headers.get('origin') || '';
  const allowlist = (Deno.env.get('APP_ORIGIN') || '').split(',').map((o) => o.trim()).filter(Boolean);
  const isLocal = origin.includes('localhost') || origin.includes('127.0.0.1');
  if (origin && allowlist.includes(origin)) return origin;
  if (origin && isLocal && !isProduction()) return origin;
  return '';
}
function headers(req: Request): Record<string, string> {
  const origin = resolveAllowedOrigin(req);
  const base: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-name',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };
  if (origin) base['Access-Control-Allow-Origin'] = origin;
  return base;
}
function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}

interface Payload { event_id?: unknown; }

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const requestOrigin = req.headers.get('origin');
  if (requestOrigin && resolveAllowedOrigin(req) === '') return json(req, { error: 'Origin not allowed' }, 403);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = req.headers.get('authorization');
  if (!supabaseUrl || !anonKey || !serviceKey || !authorization?.startsWith('Bearer ')) {
    return json(req, { error: 'Authentication or configuration missing' }, 503);
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json(req, { error: 'جلسة غير صالحة' }, 401);
  const { data: profile } = await userClient.from('profiles').select('role, tenant_id').eq('id', authData.user.id).single();
  if (!profile || !['marketing', 'admin', 'developer', 'it_admin'].includes(String(profile.role))) {
    return json(req, { error: 'غير مخوّل — يتطلب صلاحية تسويق' }, 403);
  }

  let payload: Payload;
  try { payload = await req.json() as Payload; } catch { return json(req, { error: 'حمولة غير صالحة' }, 400); }
  const eventId = String(payload.event_id || '');
  if (!eventId) return json(req, { error: 'event_id مطلوب' }, 400);

  const { data: ev, error: evErr } = await userClient
    .from('marketing_events').select('id, name, starts_at').eq('id', eventId).single();
  if (evErr || !ev) return json(req, { error: 'الفعالية غير موجودة' }, 404);

  // ─── مفاتيح Zoom: مفتاح الشركة أولاً (BYOK)، ثم مفتاح المنصة، ثم محاكاة ────
  let accountId = Deno.env.get('ZOOM_ACCOUNT_ID');
  let clientId = Deno.env.get('ZOOM_CLIENT_ID');
  let clientSecret = Deno.env.get('ZOOM_CLIENT_SECRET');
  if (serviceKey && profile.tenant_id) {
    try {
      const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
      const { data: cred } = await admin.rpc('get_tenant_provider_secret', {
        p_tenant_id: profile.tenant_id, p_channel: 'streaming', p_provider: 'zoom',
      });
      const row = Array.isArray(cred) ? cred[0] : cred;
      if (row?.secret_value) {
        clientSecret = row.secret_value;                       // Client Secret = السرّ
        if (row.config?.account_id) accountId = String(row.config.account_id);
        if (row.config?.client_id) clientId = String(row.config.client_id);
      }
    } catch (e) { console.warn('tenant cred lookup failed:', e instanceof Error ? e.message : String(e)); }
  }
  if (!accountId || !clientId || !clientSecret) {
    return json(req, { mode: 'simulated', message: 'لم تُضبط مفاتيح Zoom (لا للشركة ولا للمنصة) — استخدم الرابط اليدوي. أضف المفاتيح للإنشاء التلقائي.' }, 200);
  }

  try {
    // 1) Server-to-Server OAuth: الحصول على access token
    const tokenRes = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}` },
    });
    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('Zoom token error:', tokenRes.status, JSON.stringify(tokenData));
      return json(req, { mode: 'live', ok: false, error: 'تعذّر مصادقة Zoom' }, 502);
    }

    // 2) إنشاء الاجتماع
    const meetingRes = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenData.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: ev.name || 'فعالية Kyvzon',
        type: ev.starts_at ? 2 : 1, // 2=مجدول، 1=فوري
        start_time: ev.starts_at || undefined,
        settings: { join_before_host: true, waiting_room: false },
      }),
    });
    const meeting = await meetingRes.json().catch(() => ({}));
    if (!meetingRes.ok || !meeting.join_url) {
      console.error('Zoom meeting error:', meetingRes.status, JSON.stringify(meeting));
      return json(req, { mode: 'live', ok: false, error: 'تعذّر إنشاء اجتماع Zoom' }, 502);
    }

    // 3) حفظ الرابط على الفعالية (service role)
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    await admin.from('marketing_events')
      .update({ stream_provider: 'zoom', stream_url: meeting.join_url, updated_at: new Date().toISOString() })
      .eq('id', eventId).eq('tenant_id', profile.tenant_id);

    return json(req, { mode: 'live', ok: true, url: meeting.join_url }, 200);
  } catch (error) {
    console.error('event-create-stream exception:', error instanceof Error ? error.message : String(error));
    return json(req, { error: 'خطأ داخلي أثناء إنشاء البث' }, 500);
  }
});
