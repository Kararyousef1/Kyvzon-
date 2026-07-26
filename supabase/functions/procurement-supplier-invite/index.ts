/**
 * Edge Function: procurement-supplier-invite
 * يرسل دعوة بوابة ذاتية للمورد + token_hash + expiry 7d عبر Resend/BYOK
 *
 * الأمان:
 *  - JWT + role procurement/admin/developer/it_admin
 *  - APP_ORIGIN allowlist
 *  - token خام لا يخزن في DB؛ نخزن SHA-256 فقط
 *  - لا نستخدم RPC تعتمد على current_user_tenant_id() مع service_role؛ نتحقق tenant صراحة ثم ندرج الدعوة
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

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

serve(async (req: Request) => {
  if (req.method==='OPTIONS') return new Response(null, { status: 204, headers: headers(req) });
  if (req.method!=='POST') return json(req, { error: 'Method not allowed' }, 405);

  const requestOrigin = req.headers.get('origin');
  if (requestOrigin && resolveAllowedOrigin(req)==='') return json(req, { error: 'Origin not allowed' }, 403);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const authorization = req.headers.get('authorization');
  if (!supabaseUrl || !anonKey || !authorization?.startsWith('Bearer ')) {
    return json(req, { error: 'Auth/config missing' }, 503);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json(req, { error: 'جلسة غير صالحة' }, 401);

  const { data: profile } = await userClient.from('profiles').select('role, tenant_id').eq('id', authData.user.id).single();
  const allowedRoles = new Set(['procurement','admin','developer','it_admin']);
  if (!profile || !allowedRoles.has(String(profile.role)) || !profile.tenant_id) {
    return json(req, { error: 'غير مخوّل — يتطلب صلاحية مشتريات' }, 403);
  }

  let body: { supplier_id?: unknown; email?: unknown };
  try { body = await req.json(); } catch { return json(req, { error: 'حمولة غير صالحة' }, 400); }
  const supplierId = String(body.supplier_id || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  if (!supplierId || !email || !email.includes('@')) return json(req, { error: 'supplier_id و email مطلوبان' }, 400);

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) return json(req, { error: 'Service not configured' }, 503);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: supplier, error: supplierError } = await admin
    .from('suppliers')
    .select('id, tenant_id, legal_name')
    .eq('id', supplierId)
    .eq('tenant_id', profile.tenant_id)
    .single();
  if (supplierError || !supplier) return json(req, { error: 'المورد غير موجود داخل شركتك' }, 404);

  const token = generateToken();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();

  const { data: invite, error: inviteError } = await admin
    .from('supplier_portal_invites')
    .insert({
      tenant_id: profile.tenant_id,
      supplier_id: supplierId,
      email,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_by: authData.user.id,
    })
    .select('id')
    .single();

  if (inviteError) {
    console.error('invite error:', inviteError.message);
    return json(req, { error: 'فشل إنشاء الدعوة' }, 500);
  }

  let emailMode: 'live' | 'simulated' = 'simulated';
  let resendKey: string | undefined;
  let fromEmail = Deno.env.get('RESEND_FROM') || 'onboarding@resend.dev';

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

  const portalBase = (Deno.env.get('APP_ORIGIN') || 'http://localhost:5173').split(',')[0].trim();
  const inviteLink = `${portalBase}/supplier-portal/${token}`;

  if (resendKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromEmail,
          to: email,
          subject: 'دعوة للتسجيل في بوابة الموردين — Kyvzon',
          html: `<p>مرحباً،</p><p>تمت دعوتك لإكمال ملف المورد الخاص بشركة ${supplier.legal_name || ''} في Kyvzon.</p><p><a href="${inviteLink}">اضغط هنا للتسجيل</a></p><p>الرابط صالح 7 أيام.</p>`,
        }),
      });
      if (res.ok) emailMode = 'live';
    } catch (e) {
      console.warn('Resend failed, simulated mode:', e);
    }
  }

  await admin.from('supplier_audit_log').insert({
    tenant_id: profile.tenant_id,
    supplier_id: supplierId,
    actor_id: authData.user.id,
    action: 'supplier_portal_invite_created',
    entity_table: 'supplier_portal_invites',
    entity_id: invite.id,
    new_value: { email, expires_at: expiresAt, mode: emailMode },
    comments: emailMode === 'live' ? 'Invitation email sent' : 'Invitation created in simulated mode',
  }).catch(() => undefined);

  return json(req, {
    ok: true,
    mode: emailMode,
    invite_id: invite.id,
    invite_link: inviteLink,
    token: emailMode === 'simulated' ? token : undefined,
    message: emailMode==='live' ? 'تم إرسال الدعوة بالبريد' : 'تم إنشاء الدعوة (محاكاة — أضف RESEND_API_KEY للإرسال الفعلي)',
  }, 200);
});
