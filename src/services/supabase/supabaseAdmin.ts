/**
 * ════════════════════════════════════════════════════════════════
 *  دوال الإدارة الآمنة - Kyvzon Platform
 * 
 *  ✅ الإصدار النهائي (v3):
 *  - تمت إزالة supabaseAdmin تماماً (لا مفتاح Service Role في المتصفح)
 *  - جميع العمليات الإدارية عبر Edge Functions
 *  - لا GoTrueClient إضافي → لا تحذير "تم اكتشاف عميل متعدد"
 * ════════════════════════════════════════════════════════════════
 */

import { supabase } from './supabase';

// ══════════════════════════════════════════════════════════════
//  البديل الآمن: استدعاء Edge Functions
// ══════════════════════════════════════════════════════════════

/**
 * استدعاء Edge Function إدارية بشكل آمن
 * المفتاح يبقى في Deno runtime — لا يُعرَض للمتصفح أبداً
 *
 * @example
 * const result = await callAdminFunction('admin-create-user', {
 *   email: 'user@example.com',
 *   password: 'securepass',
 *   role: 'employee',
 * });
 */
export const callAdminFunction = async <T = unknown, P extends Record<string, unknown> = Record<string, unknown>>(
  functionName: string,
  payload: P,
): Promise<{ data: T | null; error: string | null }> => {
  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: payload,
    });

    if (error) {
      console.error(`Edge Function [${functionName}] error:`, error.message);
      return { data: null, error: error.message };
    }

    return { data: data as T, error: null };
  } catch (err: any) {
    console.error(`Edge Function [${functionName}] exception:`, err);
    return { data: null, error: err.message || 'خطأ غير متوقع' };
  }
};

// ══════════════════════════════════════════════════════════════
//  دوال الإدارة الآمنة (عبر Edge Functions)
// ══════════════════════════════════════════════════════════════

interface CreateUserPayload {
  email: string;
  password: string;
  full_name: string;
  role: string;
  department_id?: string;
  employee_id?: string;
  [key: string]: unknown;
}

interface CreateUserResult {
  user_id: string;
  email: string;
  message: string;
}

/**
 * إنشاء مستخدم جديد عبر Edge Function (آمن)
 * يستبدل الاستخدام المباشر لـ supabaseAdmin.auth.admin.createUser()
 */
export const adminCreateUser = async (
  payload: CreateUserPayload,
): Promise<{ data: CreateUserResult | null; error: string | null }> => {
  return callAdminFunction<CreateUserResult>('admin-create-user', payload);
};

interface UpdateUserRolePayload {
  target_user_id: string;
  new_role: string;
  updated_by: string;
  [key: string]: unknown;
}

/**
 * تغيير دور المستخدم عبر Edge Function (آمن)
 */
export const adminUpdateUserRole = async (
  payload: UpdateUserRolePayload,
): Promise<{ data: unknown; error: string | null }> => {
  return callAdminFunction('admin-update-role', payload);
};

interface DeleteUserPayload {
  target_user_id: string;
  deleted_by: string;
  reason?: string;
  [key: string]: unknown;
}

/**
 * حذف مستخدم عبر Edge Function (آمن)
 */
export const adminDeleteUser = async (
  payload: DeleteUserPayload,
): Promise<{ data: unknown; error: string | null }> => {
  return callAdminFunction('admin-delete-user', payload);
};

// ══════════════════════════════════════════════════════════════
//  تصدير للتوافق مع الكود القديم (null دائماً)
//  ⚠️ هذا التصدير موجود فقط لمنع كسر الاستيرادات
//     استخدم دوال Edge Functions بدلاً منه
// ══════════════════════════════════════════════════════════════

/**
 * @deprecated تمت إزالة العميل الإداري.
 * استخدم callAdminFunction() أو adminCreateUser() بدلاً منه.
 * هذه القيمة ستُرجع null دائماً.
 */
export const supabaseAdmin = null;

export default supabaseAdmin;
