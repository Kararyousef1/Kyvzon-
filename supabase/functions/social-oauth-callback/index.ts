/**
 * ═════════════════════════════════════════════════════════════════════════
 *  social-oauth-callback — استقبال رمز OAuth من المنصة وتخزينه بأمان
 *
 *  الدور: المنصة (Meta/LinkedIn) تُعيد توجيه المستخدم هنا بـ code + state.
 *   - يتحقق من توقيع state (منع CSRF) ويستخرج tenant/user/provider.
 *   - يبدّل code بـ access_token عبر المنصة، ويخزّنه (service role) في الخزنة السرّية.
 *   - يعيد توجيه المستخدم لصفحة نجاح في التطبيق.
 *
 *  رابط عام (المنصة تُعيد التوجيه بلا JWT) — يُنشر بـ --no-verify-jwt.
 *  المتغيّرات: META_APP_ID/SECRET · OAUTH_REDIRECT_BASE · OAUTH_STATE_SECRET
 *    · APP_ORIGIN · SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

async function verifyState(state: string, secret: string): Promise<Record<string, unknown> | null> {
  try {
    const [data, hex] = state.split('.');
    if (!data || !hex) return null;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
    const expected = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
    if (expected.length !== hex.length) return null;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ hex.charCodeAt(i);
    if (diff !== 0) return null;
    const payload = JSON.parse(atob(data));
    // انتهاء صلاحية state بعد 10 دقائق (منع إعادة الاستخدام)
    if (typeof payload.ts !== 'number' || Date.now() - payload.ts > 600000) return null;
    return payload;
  } catch { return null; }
}

const TOKEN_URL: Record<string, string> = {
  facebook: 'https://graph.facebook.com/v19.0/oauth/access_token',
  instagram: 'https://graph.facebook.com/v19.0/oauth/access_token',
  linkedin: 'https://www.linkedin.com/oauth/v2/accessToken',
};

serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const provider = url.searchParams.get('provider') || 'facebook';
  const appOrigin = (Deno.env.get('APP_ORIGIN') || 'http://localhost:5173').split(',')[0].trim();

  const fail = (reason: string) => Response.redirect(`${appOrigin}/app/marketing/social?connect=error&reason=${encodeURIComponent(reason)}`, 302);

  const stateSecret = Deno.env.get('OAUTH_STATE_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const redirectBase = Deno.env.get('OAUTH_REDIRECT_BASE');
  if (!stateSecret || !supabaseUrl || !serviceKey || !redirectBase) return fail('not_configured');
  if (!code || !state) return fail('missing_code');

  const payload = await verifyState(state, stateSecret);
  if (!payload) return fail('invalid_state');

  // ─── مفاتيح التطبيق: مفتاح الشركة أولاً (BYOK)، ثم مفتاح المنصة ───────────
  const credProvider = provider === 'linkedin' ? 'linkedin' : 'meta';
  let appId = Deno.env.get(provider === 'linkedin' ? 'LINKEDIN_CLIENT_ID' : 'META_APP_ID');
  let appSecret = Deno.env.get(provider === 'linkedin' ? 'LINKEDIN_CLIENT_SECRET' : 'META_APP_SECRET');
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  if (payload.tenant_id) {
    try {
      const { data: cred } = await admin.rpc('get_tenant_provider_secret', {
        p_tenant_id: payload.tenant_id, p_channel: 'social', p_provider: credProvider,
      });
      const row = Array.isArray(cred) ? cred[0] : cred;
      if (row?.secret_value) {
        appSecret = row.secret_value;                          // App Secret = السرّ
        if (row.config?.app_id) appId = String(row.config.app_id);
      }
    } catch (e) { console.warn('tenant cred lookup failed:', e instanceof Error ? e.message : String(e)); }
  }
  if (!appId || !appSecret) return fail('app_keys_missing');

  const redirectUri = `${redirectBase}?provider=${provider}`;

  try {
    // تبديل code بـ access_token
    let tokenRes: Response;
    if (provider === 'linkedin') {
      const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: appId, client_secret: appSecret });
      tokenRes = await fetch(TOKEN_URL[provider], { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
    } else {
      const q = new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code });
      tokenRes = await fetch(`${TOKEN_URL[provider]}?${q.toString()}`);
    }
    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('token exchange failed:', tokenRes.status, JSON.stringify(tokenData));
      return fail('token_exchange');
    }

    const expiresAt = tokenData.expires_in ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString() : null;

    // تخزين الرمز بأمان (service role — نفس عميل admin المُنشأ أعلاه)
    await admin.rpc('store_social_oauth_token', {
      p_tenant_id: payload.tenant_id, p_provider: provider,
      p_account_name: `حساب ${provider}`, p_account_handle: `@${provider}_${String(payload.user_id).slice(0, 6)}`,
      p_external_id: tokenData.user_id || null,
      p_access_token: tokenData.access_token, p_refresh_token: tokenData.refresh_token || null,
      p_scope: tokenData.scope || null, p_expires_at: expiresAt,
    });

    return Response.redirect(`${appOrigin}/app/marketing/social?connect=success&provider=${provider}`, 302);
  } catch (error) {
    console.error('oauth callback exception:', error instanceof Error ? error.message : String(error));
    return fail('internal');
  }
});
