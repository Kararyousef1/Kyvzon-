/**
 * ═════════════════════════════════════════════════════════════════════════
 *  social-oauth-start — بدء تدفّق OAuth لربط حساب تواصل اجتماعي
 *
 *  الدور: يبني رابط تفويض المنصة (Meta/LinkedIn) ويعيده للواجهة لتوجيه المستخدم.
 *   - مستخدم مُصادَق (JWT) بصلاحية تسويق يطلب ربط منصة.
 *   - يبني state مُوقّع (يحوي tenant/user) لمنع CSRF، ويعيد authorize URL.
 *
 *  بلا مفاتيح تطبيق المنصة → mode='simulated' (لا يفشل).
 *  المتغيّرات (مثال Facebook): META_APP_ID · META_APP_SECRET · OAUTH_REDIRECT_BASE
 *    (رابط الـ callback العام، مثل https://<ref>.supabase.co/functions/v1/social-oauth-callback)
 *  OAUTH_STATE_SECRET (سرّ توقيع state).
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
    'Content-Type': 'application/json', 'Vary': 'Origin',
  };
  if (origin) base['Access-Control-Allow-Origin'] = origin;
  return base;
}
function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}

// state مُوقّع (base64(payload).hmac) لمنع CSRF والتلاعب
async function signState(payload: Record<string, unknown>, secret: string): Promise<string> {
  const data = btoa(JSON.stringify(payload));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${data}.${hex}`;
}

const PROVIDER_CONFIG: Record<string, { authUrl: string; scope: string; appIdEnv: string }> = {
  facebook: { authUrl: 'https://www.facebook.com/v19.0/dialog/oauth', scope: 'pages_manage_posts,pages_read_engagement', appIdEnv: 'META_APP_ID' },
  instagram: { authUrl: 'https://www.facebook.com/v19.0/dialog/oauth', scope: 'instagram_basic,instagram_content_publish', appIdEnv: 'META_APP_ID' },
  linkedin: { authUrl: 'https://www.linkedin.com/oauth/v2/authorization', scope: 'w_member_social', appIdEnv: 'LINKEDIN_CLIENT_ID' },
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const requestOrigin = req.headers.get('origin');
  if (requestOrigin && resolveAllowedOrigin(req) === '') return json(req, { error: 'Origin not allowed' }, 403);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const authorization = req.headers.get('authorization');
  if (!supabaseUrl || !anonKey || !authorization?.startsWith('Bearer ')) return json(req, { error: 'Auth/config missing' }, 503);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json(req, { error: 'جلسة غير صالحة' }, 401);
  const { data: profile } = await userClient.from('profiles').select('role, tenant_id').eq('id', authData.user.id).single();
  if (!profile || !['marketing', 'admin', 'developer', 'it_admin'].includes(String(profile.role))) {
    return json(req, { error: 'غير مخوّل — يتطلب صلاحية تسويق' }, 403);
  }

  let body: { provider?: unknown };
  try { body = await req.json(); } catch { return json(req, { error: 'حمولة غير صالحة' }, 400); }
  const provider = String(body.provider || '');
  const cfg = PROVIDER_CONFIG[provider];
  if (!cfg) return json(req, { error: 'منصة غير مدعومة' }, 400);

  const appId = Deno.env.get(cfg.appIdEnv);
  const redirectBase = Deno.env.get('OAUTH_REDIRECT_BASE');
  const stateSecret = Deno.env.get('OAUTH_STATE_SECRET');
  if (!appId || !redirectBase || !stateSecret) {
    return json(req, { mode: 'simulated', message: `لم تُضبط مفاتيح تطبيق ${provider} — الربط بوضع محاكاة. سجّل تطبيقاً وأضف المفاتيح.` }, 200);
  }

  const state = await signState(
    { tenant_id: profile.tenant_id, user_id: authData.user.id, provider, ts: Date.now() },
    stateSecret,
  );
  const redirectUri = `${redirectBase}?provider=${provider}`;
  const authorizeUrl = `${cfg.authUrl}?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(cfg.scope)}&response_type=code&state=${encodeURIComponent(state)}`;

  return json(req, { mode: 'live', ok: true, authorize_url: authorizeUrl }, 200);
});
