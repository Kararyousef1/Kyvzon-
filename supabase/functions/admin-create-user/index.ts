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
  employee_number?: string;
  phone?: string;
  position?: string;
  target_tenant_id?: string; // جديد: يسمح للمطور بتحديد tenant آخر لإنشاء أول admin
  finance_role?: string; // جديد: دور مالي اختياري
  legal_entity_id?: string; // جديد: كيان قانوني للدور المالي
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
    if (!callerProfile.tenant_id && !PLATFORM_ROLES.has(String(callerProfile.role))) {
      return json(req, { error: 'لا توجد شركة مرتبطة بالمستخدم الإداري.' }, 403);
    }

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
    const targetTenantIdInput = payload.target_tenant_id ? String(payload.target_tenant_id).trim() : null;
    const financeRole = payload.finance_role ? String(payload.finance_role).trim() : null;
    const legalEntityIdInput = payload.legal_entity_id ? String(payload.legal_entity_id).trim() : null;

    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
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
    if (targetTenantIdInput && !isUuid(targetTenantIdInput)) {
      return json(req, { error: 'معرّف الشركة المستهدفة غير صالح' }, 400);
    }
    if (legalEntityIdInput && !isUuid(legalEntityIdInput)) {
      return json(req, { error: 'معرّف الكيان القانوني غير صالح' }, 400);
    }

    if (PLATFORM_ROLES.has(role)) {
      return json(req, { error: 'لا يمكن إنشاء مستخدم بدور منصة عبر هذه الواجهة' }, 403);
    }

    // تحديد الشركة المستهدفة — المنطق الجديد لإصلاح مشكلة Dev Portal
    let targetTenantId = callerProfile.tenant_id;

    if (targetTenantIdInput) {
      // فقط platform owners يمكنهم تحديد tenant آخر
      if (!PLATFORM_ROLES.has(String(callerProfile.role))) {
        return json(req, { error: 'فقط مطور المنصة يمكنه إنشاء مستخدم في شركة أخرى (target_tenant_id)' }, 403);
      }
      targetTenantId = targetTenantIdInput;

      // تحقق أن الشركة المستهدفة موجودة
      const tempAdminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: targetTenant, error: tenantError } = await tempAdminClient
        .from('tenants')
        .select('id, status')
        .eq('id', targetTenantId)
        .maybeSingle();

      if (tenantError || !targetTenant) {
        return json(req, { error: 'الشركة المستهدفة غير موجودة' }, 404);
      }
    }

    if (!targetTenantId) {
      return json(req, { error: 'لا يمكن تحديد الشركة المستهدفة' }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let departmentName: string | null = null;
    if (payload.department_id) {
      const { data: department, error: departmentError } = await adminClient
        .from('departments')
        .select('id, name_ar')
        .eq('id', payload.department_id)
        .eq('tenant_id', targetTenantId)
        .maybeSingle();
      if (departmentError || !department) {
        return json(req, { error: 'القسم المحدد غير موجود ضمن الشركة المستهدفة' }, 400);
      }
      departmentName = department.name_ar;
    }

    // تحقق من legal_entity إذا تم تمريره
    let validatedLegalEntityId: string | null = null;
    if (legalEntityIdInput) {
      const { data: entity, error: entityError } = await adminClient
        .from('legal_entities')
        .select('id, tenant_id')
        .eq('id', legalEntityIdInput)
        .eq('tenant_id', targetTenantId)
        .maybeSingle();
      if (entityError || !entity) {
        return json(req, { error: 'الكيان القانوني غير موجود ضمن الشركة المستهدفة' }, 400);
      }
      validatedLegalEntityId = entity.id;
    }

    const { firstName, lastName } = splitName(fullName);
    const employeeCode = String(
      payload.employee_code || payload.employee_number || `EMP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    ).trim();

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role, tenant_id: targetTenantId },
    });

    if (createError || !newUser.user) {
      console.error('Create user error:', createError?.message || 'missing user');
      return json(req, { error: 'فشل إنشاء المستخدم' }, createError?.message.includes('registered') ? 409 : 500);
    }

    const { error: profileInsertError } = await adminClient
      .from('profiles')
      .insert({
        id: newUser.user.id,
        tenant_id: targetTenantId,
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
        tenant_id: targetTenantId,
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

    // جديد: إذا تم تمرير finance_role و legal_entity_id، أنشئ عضوية مالية
    // أو إذا كان role=admin، اجعله entity_admin للـ DEFAULT entity تلقائياً (للحساب الأولي)
    try {
      if (financeRole && validatedLegalEntityId) {
        const allowedFinanceRoles = new Set(['viewer','accountant','approver','finance_manager','entity_admin']);
        if (allowedFinanceRoles.has(financeRole)) {
          await adminClient.from('entity_memberships').insert({
            tenant_id: targetTenantId,
            legal_entity_id: validatedLegalEntityId,
            user_id: newUser.user.id,
            finance_role: financeRole,
            is_active: true,
          });
        }
      } else if (role === 'admin') {
        // للحساب الإداري الأولي، امنحه entity_admin في الكيان الافتراضي DEFAULT تلقائياً
        const { data: defaultEntity } = await adminClient
          .from('legal_entities')
          .select('id')
          .eq('tenant_id', targetTenantId)
          .eq('code', 'DEFAULT')
          .maybeSingle();

        if (defaultEntity) {
          await adminClient.from('entity_memberships').insert({
            tenant_id: targetTenantId,
            legal_entity_id: defaultEntity.id,
            user_id: newUser.user.id,
            finance_role: 'entity_admin',
            is_active: true,
          });
        }
      }
    } catch (membershipError) {
      console.warn('Entity membership creation failed (non-critical):', membershipError instanceof Error ? membershipError.message : String(membershipError));
      // لا نفشل العملية كاملة إذا فشل إنشاء العضوية المالية — يمكن إضافته لاحقاً من Admin Portal
    }

    await audit(
      adminClient,
      targetTenantId,
      authData.user.id,
      newUser.user.id,
      'admin_create_user',
      { 
        email, 
        role, 
        department_id: payload.department_id || null, 
        target_tenant_id: targetTenantId,
        finance_role: financeRole || null,
        legal_entity_id: validatedLegalEntityId || null,
        is_initial_admin: !!targetTenantIdInput,
      },
    );

    return json(req, {
      success: true,
      user_id: newUser.user.id,
      email,
      tenant_id: targetTenantId,
      message: targetTenantIdInput 
        ? `تم إنشاء حساب إداري أولي ${fullName} للشركة ${targetTenantId} بنجاح` 
        : `تم إنشاء المستخدم ${fullName} بنجاح`,
    }, 201);
  } catch (error) {
    console.error('Unexpected admin-create-user error:', error instanceof Error ? error.message : String(error));
    return json(req, { error: 'خطأ داخلي في الخادم' }, 500);
  }
});
