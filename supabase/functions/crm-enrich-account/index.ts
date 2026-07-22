/**
 * ═════════════════════════════════════════════════════════════════════════
 *  crm-enrich-account — إثراء بيانات حساب CRM من مزوّد خارجي (Clearbit)
 *
 *  الدور: الوسيط الآمن بين البوابة ومزوّد الإثراء (نفس نمط البريد/الدفع).
 *   - مستخدم مُصادَق (JWT) بصلاحية مبيعات/إدارة يطلب إثراء حساب.
 *   - يقرأ CLEARBIT_API_KEY من Secrets، يجلب بيانات الشركة عبر النطاق/الاسم.
 *   - يكتب النتائج عبر crm_apply_enrichment (service role).
 *
 *  بلا CLEARBIT_API_KEY → يعيد mode='simulated' (لا يفشل، توافق عكسي).
 *  المتغيّرات: CLEARBIT_API_KEY.
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

interface Payload { account_id?: unknown; }

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
  const { data: profile } = await userClient.from('profiles').select('role').eq('id', authData.user.id).single();
  if (!profile || !['sales', 'marketing', 'admin', 'developer', 'it_admin'].includes(String(profile.role))) {
    return json(req, { error: 'غير مخوّل — يتطلب صلاحية مبيعات/إدارة' }, 403);
  }

  let payload: Payload;
  try { payload = await req.json() as Payload; } catch { return json(req, { error: 'حمولة غير صالحة' }, 400); }
  const accountId = String(payload.account_id || '');
  if (!accountId) return json(req, { error: 'account_id مطلوب' }, 400);

  // بيانات الحساب (عبر عميل المستخدم — RLS يضمن العزل)
  const { data: acc, error: accErr } = await userClient
    .from('crm_accounts').select('id, name, website').eq('id', accountId).single();
  if (accErr || !acc) return json(req, { error: 'الحساب غير موجود' }, 404);

  const clearbitKey = Deno.env.get('CLEARBIT_API_KEY');
  if (!clearbitKey) {
    // لا مفتاح → نستدعي دالة المحاكاة القديمة (تعلّم simulated) عبر عميل المستخدم
    try { await userClient.rpc('crm_enrich_account', { p_account_id: accountId, p_provider: 'clearbit' }); } catch { /* noop */ }
    return json(req, { mode: 'simulated', message: 'لم يُضبط CLEARBIT_API_KEY — الإثراء بوضع محاكاة. أضف المفتاح للتفعيل.' }, 200);
  }

  // استخلاص النطاق من website أو الاسم
  let domain = '';
  if (acc.website) {
    try { domain = new URL(acc.website.startsWith('http') ? acc.website : `https://${acc.website}`).hostname.replace(/^www\./, ''); }
    catch { domain = String(acc.website).replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]; }
  }
  if (!domain) {
    return json(req, { mode: 'live', ok: false, error: 'لا يوجد نطاق/موقع للحساب — أضف website للإثراء عبر Clearbit' }, 400);
  }

  try {
    const res = await fetch(`https://company.clearbit.com/v2/companies/find?domain=${encodeURIComponent(domain)}`, {
      headers: { 'Authorization': `Bearer ${clearbitKey}` },
    });
    if (!res.ok) {
      console.error('Clearbit error:', res.status);
      return json(req, { mode: 'live', ok: false, status: res.status, error: 'تعذّر جلب بيانات الشركة من Clearbit' }, 502);
    }
    const co = await res.json().catch(() => ({}));

    // تطبيق النتائج عبر service role (يملأ الفراغات فقط)
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    await admin.rpc('crm_apply_enrichment', {
      p_account_id: accountId,
      p_provider: 'clearbit',
      p_industry: co?.category?.industry ?? null,
      p_employee_count: co?.metrics?.employees ?? null,
      p_annual_revenue: co?.metrics?.annualRevenue ?? null,
      p_website: co?.domain ? `https://${co.domain}` : null,
      p_linkedin_url: co?.linkedin?.handle ? `https://linkedin.com/${co.linkedin.handle}` : null,
      p_country: co?.geo?.country ?? null,
      p_city: co?.geo?.city ?? null,
    });

    return json(req, { mode: 'live', ok: true, enriched: true }, 200);
  } catch (error) {
    console.error('crm-enrich-account exception:', error instanceof Error ? error.message : String(error));
    return json(req, { error: 'خطأ داخلي أثناء الإثراء' }, 500);
  }
});
