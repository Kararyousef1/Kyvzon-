/**
 * ═════════════════════════════════════════════════════════════════════════
 *  adminAuth.ts — مساعدات مشتركة لجميع Admin Edge Functions
 *
 *  يوفر:
 *   - CORS headers موحدة
 *   - JSON response helper
 *   - UUID validation
 *   - requireAdmin() — يفحص JWT + دور المستدعي + tenant
 *   - targetInCallerTenant() — يضمن أن target ينتمي لنفس الشركة
 *   - audit() — تسجيل fire-and-forget مع schema الحالي
 *   - PLATFORM_ROLES / TARGET_ROLES / CALLER_ROLES
 * ═════════════════════════════════════════════════════════════════════════
 */
import { createClient, type SupabaseClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { checkRateLimit, rateLimitHeaders, type RateLimitConfig } from './rateLimit.ts';

/** الأدوار التي يمكن إسنادها لمستخدم داخل شركة (لا developer/it_admin) */
export const TARGET_ROLES = new Set([
  'employee',
  'supervisor',
  'manager',
  'hr',
  'gatekeeper',
  'admin',
]);

/** الأدوار المسموح لها باستدعاء Admin Functions */
export const CALLER_ROLES = new Set(['admin', 'developer', 'it_admin']);

/** أدوار المنصة — لا يجوز رفع مستخدم عادي إليها عبر Edge Functions */
export const PLATFORM_ROLES = new Set(['developer', 'it_admin']);

export interface AdminProfile {
  id: string;
  full_name: string | null;
  role: string;
  tenant_id: string | null;
}

export interface AdminContext {
  caller: User;
  callerProfile: AdminProfile;
  adminClient: SupabaseClient;
}

// ─── CORS / HTTP helpers ────────────────────────────────────────────────────
//
// سياسة CORS مُشدّدة (P1 hardening):
//   - APP_ORIGIN إلزامي في الإنتاج. يقبل قيمة واحدة أو قائمة مفصولة بفواصل.
//   - لا نُرجع '*' أبداً عندما يكون هناك بيانات اعتماد (Authorization) في اللعبة.
//   - في التطوير فقط (DENO_ENV !== 'production') نسمح بأصول localhost.
//   - إن لم يُطابق الأصل القائمة، لا نُصدر رأس Allow-Origin (المتصفح يمنع الطلب).
function isProduction(): boolean {
  return (Deno.env.get('DENO_ENV') || Deno.env.get('APP_ENV') || 'production') === 'production';
}

function allowedOrigins(): string[] {
  return (Deno.env.get('APP_ORIGIN') || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/** يُحدّد قيمة Access-Control-Allow-Origin الآمنة لهذا الطلب (أو '' للرفض). */
export function resolveAllowedOrigin(req: Request): string {
  const requestOrigin = req.headers.get('origin') || '';
  const allowlist = allowedOrigins();
  const isLocal =
    requestOrigin.includes('localhost') || requestOrigin.includes('127.0.0.1');

  // مطابقة صريحة مع القائمة البيضاء
  if (requestOrigin && allowlist.includes(requestOrigin)) return requestOrigin;

  // localhost مسموح في التطوير فقط
  if (requestOrigin && isLocal && !isProduction()) return requestOrigin;

  // لا مطابقة → لا نسمح بأي أصل (منع تسريب wildcard مع بيانات الاعتماد)
  return '';
}

export function headers(req: Request, extra: Record<string, string> = {}): Record<string, string> {
  const origin = resolveAllowedOrigin(req);

  const base: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-name',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
    ...extra,
  };

  // نُضيف Allow-Origin فقط عند وجود أصل مسموح به (لا wildcard مطلقاً).
  if (origin) base['Access-Control-Allow-Origin'] = origin;

  return base;
}

export function json(req: Request, body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: headers(req, extraHeaders) });
}

// ─── Input validation ───────────────────────────────────────────────────────
export function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// ─── Admin authorization gate ───────────────────────────────────────────────
export async function requireAdmin(req: Request): Promise<AdminContext | Response> {
  // سياسة أصل مُشدّدة: يُرفض أي Origin غير مُدرَج في APP_ORIGIN (أو localhost في التطوير).
  const requestOrigin = req.headers.get('origin');
  if (requestOrigin && resolveAllowedOrigin(req) === '') {
    return json(req, { error: 'Origin not allowed' }, 403);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = req.headers.get('authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization?.startsWith('Bearer ')) {
    return json(req, { error: 'Authentication or function configuration is missing' }, 503);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await callerClient.auth.getUser();
  if (authError || !authData.user) return json(req, { error: 'جلسة غير صالحة' }, 401);

  const { data: profile, error: profileError } = await callerClient
    .from('profiles')
    .select('id, full_name, role, tenant_id')
    .eq('id', authData.user.id)
    .single();
  if (profileError || !profile || !CALLER_ROLES.has(String(profile.role))) {
    return json(req, { error: 'غير مخوّل. يتطلب صلاحية إدارية.' }, 403);
  }
  if (!profile.tenant_id) return json(req, { error: 'لا توجد شركة مرتبطة بالمستخدم الإداري.' }, 403);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return {
    caller: authData.user,
    callerProfile: profile as AdminProfile,
    adminClient,
  };
}

// ─── Target ownership check ─────────────────────────────────────────────────
export async function targetInCallerTenant(
  adminClient: SupabaseClient,
  targetUserId: string,
  tenantId: string,
): Promise<{ profile: AdminProfile | null; error: string | null }> {
  const { data, error } = await adminClient
    .from('profiles')
    .select('id, full_name, role, tenant_id')
    .eq('id', targetUserId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { profile: data as AdminProfile | null, error: error?.message || null };
}

// ─── Rate limiting helper (لـ Admin functions) ─────────────────────────────
/**
 * فحص الحد المسموح لـ admin function. يُرجع Response جاهز في حالة التجاوز،
 * أو null إذا كان الطلب مسموحاً.
 *
 * الاستخدام:
 *   const rateLimitResponse = enforceRateLimit(req, context.caller.id, 'admin-create-user', RATE_LIMITS.ADMIN_CREATE);
 *   if (rateLimitResponse) return rateLimitResponse;
 */
export function enforceRateLimit(
  req: Request,
  userId: string,
  functionName: string,
  config: RateLimitConfig,
): Response | null {
  const result = checkRateLimit(userId, functionName, config);
  if (result.allowed) return null;
  return new Response(
    JSON.stringify({
      error: `تجاوزت الحد المسموح (${config.max} طلبات في ${Math.ceil(config.windowMs / 1000)} ثانية). حاول بعد ${Math.ceil(result.retryAfterMs / 1000)} ثانية.`,
      retryAfterMs: result.retryAfterMs,
    }),
    { status: 429, headers: { ...headers(req), ...rateLimitHeaders(result) } },
  );
}

// ─── Audit logging (fire-and-forget) ────────────────────────────────────────
/**
 * تسجيل حدث أمني في security_events.
 *
 * التصميم:
 *  - fire-and-forget: يبتلع أي خطأ ولا يُرجع
 *  - يستخدم الأعمدة الحالية (type, threat_level, details) لتوافق SDK
 *  - يحتفظ بالأعمدة القديمة (event_type, actor_id, target_id) للتوافق العكسي
 *
 * لماذا fire-and-forget؟
 *  إذا فشل audit، يجب ألا يفشل العملية الأصلية (لن يعود المستخدم للحالة السابقة
 *  بسبب سطر audit). التسجيل مهم لكنه ليس critical path.
 */
export async function audit(
  adminClient: SupabaseClient,
  tenantId: string,
  callerId: string,
  targetId: string,
  action: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const { error } = await adminClient.from('security_events').insert({
      // Schema الحالي (SDK يستخدمها)
      type: action,
      threat_level: 'low',       // admin actions = مسار سليم
      user_id: targetId,
      details: JSON.stringify({ action, caller: callerId, ...details }),
      metadata: { action, caller_id: callerId, target_id: targetId, ...details },
      // Schema القديم (للتوافق العكسي — يبقى حتى نتأكد أن لا شيء يعتمد عليه)
      event_type: action,
      actor_id: callerId,
      target_id: targetId,
      description: action,
      tenant_id: tenantId,
      created_at: now,
    });
    if (error) {
      // نستخدم console.warn عمداً (لا logger هنا لأن Edge Functions
      // لا تدعم logger مركزياً بعد)
      console.warn('audit() insert failed:', error.message);
    }
  } catch (err) {
    console.warn('audit() exception:', err instanceof Error ? err.message : String(err));
  }
}
