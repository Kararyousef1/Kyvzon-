import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { audit, isUuid, PLATFORM_ROLES } from '../_shared/adminAuth.ts';
import { checkRateLimit, rateLimitHeaders, RATE_LIMITS } from '../_shared/rateLimit.ts';

const TARGET_ROLES = new Set([
  'employee',
  'supervisor',
  'manager',
  'hr',
  'gatekeeper',
  'admin',
]);
const CALLER_ROLES = new Set(['admin', 'developer', 'it_admin']);

interface CreateUserPayload {
  email: string;
  password: string;
  full_name: string;
  role: string;
  department_id?: string;
  employee_code?: string;
  // Backward-compatible input name; stored as employee_code.
  employee_number?: string;
  phone?: string;
  position?: string;
}

function corsHeaders(req: Request): Record<string, string> {
  const allowedOrigin = Deno.env.get('APP_ORIGIN') || '*';
  const requestOrigin = req.headers.get('origin') || '';
  const isLocal = requestOrigin.includes('localhost') || requestOrigin.includes('127.0.0.1');
  const origin = (allowedOrigin && allowedOrigin !== '*' && requestOrigin === allowedOrigin)
    ? allowedOrigin
    : (isLocal ? requestOrigin : allowedOrigin);
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-name',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || 'موظف',
    lastName: parts.slice(1).join(' ') || 'جديد',
  };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const allowedOrigin = Deno.env.get('APP_ORIGIN') || '*';
  const requestOrigin = req.headers.get('origin');
  const isLocal = requestOrigin && (requestOrigin.includes('localhost') || requestOrigin.includes('127.0.0.1'));
  if (requestOrigin && allowedOrigin !== '*' && requestOrigin !== allowedOrigin && !isLocal) {
    return json(req, { error: 'Origin not allowed' }, 403);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = req.headers.get('authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization?.startsWith('Bearer ')) {
    return json(req, { error: 'Function is not configured or authentication is missing' }, 503);
  }

  try {
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await callerClient.auth.getUser();
    if (authError || !authData.user) return json(req, { error: 'جلسة غير صالحة' }, 401);

    const { data: callerProfile, error: profileError } = await callerClient
      .from('profiles')
      .select('role, full_name, tenant_id')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !callerProfile || !CALLER_ROLES.has(String(callerProfile.role))) {
      return json(req, { error: 'غير مخوّل. يتطلب صلاحية إدارية.' }, 403);
    }
    if (!callerProfile.tenant_id) {
      return json(req, { error: 'لا توجد شركة مرتبطة بالمستخدم الإداري.' }, 403);
    }

    // 🛡️ Rate limiting — بعد التحقق من الهوية (لا نضيع حدوداً على غير المصرّح لهم)
    const rl = checkRateLimit(authData.user.id, 'admin-create-user', RATE_LIMITS.ADMIN_CREATE);
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ error: `تجاوزت الحد المسموح. حاول بعد ${Math.ceil(rl.retryAfterMs / 1000)} ثانية.` }),
        {
          status: 429,
          headers: { ...corsHeaders(req), ...rateLimitHeaders(rl) },
        },
      );
    }

    const payload = await req.json() as Partial<CreateUserPayload>;
    const email = String(payload.email || '').trim().toLowerCase();
    const password = String(payload.password || '');
    const fullName = String(payload.full_name || '').trim();
    const role = String(payload.role || '');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(req, { error: 'البريد الإلكتروني غير صالح' }, 400);
    }
    if (password.length < 8 || password.length > 128) {
      return json(req, { error: 'كلمة المرور يجب أن تكون بين 8 و128 حرفاً' }, 400);
    }
    if (!fullName || fullName.length > 200) {
      return json(req, { error: 'الاسم الكامل مطلوب وبحد أقصى 200 حرف' }, 400);
    }
    if (!TARGET_ROLES.has(role)) {
      return json(req, { error: 'الدور المطلوب غير مسموح' }, 400);
    }
    if (payload.department_id && !isUuid(payload.department_id)) {
      return json(req, { error: 'معرّف القسم غير صالح' }, 400);
    }

    // 🛡️ منع Privilege Escalation عبر إنشاء مستخدم بدور منصة
    if (PLATFORM_ROLES.has(role)) {
      return json(req, { error: 'لا يمكن إنشاء مستخدم بدور منصة عبر هذه الواجهة' }, 403);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // لا تثق باسم القسم القادم من المتصفح. تحقق من UUID ومن أن القسم
    // يخص نفس الشركة، ثم استخدم الاسم المعتمد من قاعدة البيانات للـ profile.
    let departmentName: string | null = null;
    if (payload.department_id) {
      const { data: department, error: departmentError } = await adminClient
        .from('departments')
        .select('id, name_ar')
        .eq('id', payload.department_id)
        .eq('tenant_id', callerProfile.tenant_id)
        .maybeSingle();
      if (departmentError || !department) {
        return json(req, { error: 'القسم المحدد غير موجود ضمن شركتك' }, 400);
      }
      departmentName = department.name_ar;
    }

    const { firstName, lastName } = splitName(fullName);
    const employeeCode = String(
      payload.employee_code || payload.employee_number || `EMP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    ).trim();

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role, tenant_id: callerProfile.tenant_id },
    });

    if (createError || !newUser.user) {
      console.error('Create user error:', createError?.message || 'missing user');
      return json(req, { error: 'فشل إنشاء المستخدم' }, createError?.message.includes('registered') ? 409 : 500);
    }

    const { error: profileInsertError } = await adminClient
      .from('profiles')
      .insert({
        id: newUser.user.id,
        tenant_id: callerProfile.tenant_id,
        email,
        full_name: fullName,
        role,
        department: departmentName,
        position: payload.position || null,
        phone: payload.phone || null,
        status: 'active',
      });

    if (profileInsertError) {
      await adminClient.auth.admin.deleteUser(newUser.user.id);
      console.error('Profile insert failed; auth user rolled back:', profileInsertError.message);
      return json(req, { error: 'فشل إنشاء ملف المستخدم' }, 500);
    }

    const { error: employeeInsertError } = await adminClient
      .from('employees')
      .insert({
        tenant_id: callerProfile.tenant_id,
        user_id: newUser.user.id,
        employee_code: employeeCode,
        first_name: firstName,
        last_name: lastName,
        full_name_ar: fullName,
        email,
        phone: payload.phone || null,
        department_id: payload.department_id || null,
        position: payload.position || null,
        role,
        is_active: true,
      });

    if (employeeInsertError) {
      await adminClient.auth.admin.deleteUser(newUser.user.id);
      console.error('Employee insert failed; auth/profile rolled back:', employeeInsertError.message);
      return json(req, { error: 'فشل إنشاء سجل الموظف' }, 500);
    }

    // Audit (fire-and-forget — لن يفشل حتى لو DB down)
    await audit(
      adminClient,
      callerProfile.tenant_id,
      authData.user.id,
      newUser.user.id,
      'admin_create_user',
      { email, role, department_id: payload.department_id || null },
    );

    return json(req, {
      success: true,
      user_id: newUser.user.id,
      email,
      message: `تم إنشاء المستخدم ${fullName} بنجاح`,
    }, 201);
  } catch (error) {
    console.error('Unexpected admin-create-user error:', error instanceof Error ? error.message : String(error));
    return json(req, { error: 'خطأ داخلي في الخادم' }, 500);
  }
});
