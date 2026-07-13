/**
 * ════════════════════════════════════════════════════════════════
 *  Edge Function: admin-create-user
 *  Kyvzon Platform — Deno Runtime (Supabase Edge)
 *
 *  🔒 هذا هو البديل الآمن لـ supabaseAdmin.auth.admin.createUser()
 *  - Service Role Key يبقى في بيئة Deno الآمنة فقط
 *  - لا يُعرَض للمتصفح أبداً
 *  - التحقق من صلاحية المستدعي (admin فقط)
 * ════════════════════════════════════════════════════════════════
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── CORS Headers ────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── الأنواع ─────────────────────────────────────────────────────
interface CreateUserPayload {
  email: string;
  password: string;
  full_name: string;
  role: 'employee' | 'supervisor' | 'manager' | 'hr' | 'gatekeeper' | 'admin';
  department_id?: string;
  employee_number?: string;
  phone?: string;
  position?: string;
}

// ── الأدوار المسموح لها باستدعاء هذه الـ Function ──────────────
const ALLOWED_ROLES = ['admin', 'developer'] as const;

// ════════════════════════════════════════════════════════════════
serve(async (req) => {
  // OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    // ══ 1. استخراج JWT من الـ Authorization header ══
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'مطلوب توكن المصادقة' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const callerJwt = authHeader.replace('Bearer ', '');

    // ══ 2. إنشاء عميل Supabase للتحقق من المستدعي (Anon Key) ══
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${callerJwt}` } },
    });

    // ══ 3. التحقق من هوية المستدعي ══
    const { data: { user: callerUser }, error: authError } = await callerClient.auth.getUser();

    if (authError || !callerUser) {
      return new Response(
        JSON.stringify({ error: 'جلسة غير صالحة' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ══ 4. التحقق من صلاحية المستدعي (admin/developer فقط) ══
    const { data: callerProfile, error: profileError } = await callerClient
      .from('profiles')
      .select('role, full_name')
      .eq('id', callerUser.id)
      .single();

    if (profileError || !callerProfile) {
      return new Response(
        JSON.stringify({ error: 'ملف المستخدم غير موجود' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!ALLOWED_ROLES.includes(callerProfile.role as any)) {
      console.warn(`🚫 Unauthorized access attempt by ${callerUser.id} (role: ${callerProfile.role})`);
      return new Response(
        JSON.stringify({ error: 'غير مخوَّل. يتطلب صلاحية admin أو developer.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ══ 5. استخراج البيانات ══
    const payload: CreateUserPayload = await req.json();

    const { email, password, full_name, role, department_id, employee_number, phone, position } = payload;

    // التحقق من البيانات الإلزامية
    if (!email || !password || !full_name || !role) {
      return new Response(
        JSON.stringify({ error: 'البيانات الإلزامية ناقصة: email, password, full_name, role' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ══ 6. إنشاء المستخدم بـ Service Role Key (آمن — في Deno فقط) ══
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // تأكيد تلقائي
      user_metadata: { full_name, role },
    });

    if (createError) {
      console.error('Create user error:', createError.message);
      
      if (createError.message.includes('already registered') || createError.message.includes('already been registered')) {
        return new Response(
          JSON.stringify({ error: `البريد الإلكتروني ${email} مسجَّل مسبقاً` }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!newUser.user) {
      return new Response(
        JSON.stringify({ error: 'فشل إنشاء المستخدم' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ══ 7. إنشاء ملف الموظف في جدول profiles ══
    const { error: profileInsertError } = await adminClient
      .from('profiles')
      .upsert({
        id: newUser.user.id,
        email,
        full_name,
        role,
        department_id: department_id || null,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (profileInsertError) {
      console.warn('Profile insert warning:', profileInsertError.message);
      // لا نُلغي العملية — المستخدم أُنشئ بنجاح في auth.users
    }

    // ══ 8. إنشاء سجل في جدول employees (اختياري) ══
    if (employee_number || phone || position || department_id) {
      const { error: empError } = await adminClient
        .from('employees')
        .upsert({
          user_id: newUser.user.id,
          email,
          full_name_ar: full_name,
          role,
          department_id: department_id || null,
          employee_number: employee_number || null,
          phone: phone || null,
          position: position || null,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (empError) {
        console.warn('Employee insert warning:', empError.message);
      }
    }

    // ══ 9. تسجيل في security_events ══
    await adminClient
      .from('security_events')
      .insert({
        event_type: 'admin_create_user',
        actor_id: callerUser.id,
        target_id: newUser.user.id,
        description: `أنشأ ${callerProfile.full_name} مستخدماً جديداً: ${email} (${role})`,
        metadata: { email, role, department_id },
        created_at: new Date().toISOString(),
      })
      .then(() => {}); // non-blocking

    console.log(`✅ User created: ${email} by ${callerUser.id}`);

    // ══ 10. الإرجاع الناجح ══
    return new Response(
      JSON.stringify({
        success: true,
        user_id: newUser.user.id,
        email,
        message: `تم إنشاء المستخدم ${full_name} بنجاح`,
      }),
      {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );

  } catch (error: any) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'خطأ داخلي في الخادم', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
