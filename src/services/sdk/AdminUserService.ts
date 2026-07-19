/**
 * ════════════════════════════════════════════════════════════════
 *  AdminUserService - خدمة إدارة المستخدمين الآمنة
 *  تتعامل مع Edge Functions بدلاً من supabaseAdmin
 *  التدفق: Page → AdminUserService → Edge Function → Supabase Admin API
 * ════════════════════════════════════════════════════════════════
 */

import { supabase } from '../supabase/supabase';

export interface CreateUserParams {
  email: string;
  password: string;
  full_name: string;
  role: string;
  department_id?: string;
  department?: string;
  position?: string;
  phone?: string;
  employee_id?: string;
}

export interface CreateUserResult {
  user_id: string;
  email: string;
  message: string;
}

export interface DeleteUserParams {
  target_user_id: string;
  deleted_by: string;
  reason?: string;
}

// استخراج رسالة الخطأ الحقيقية من FunctionsHttpError أو أي خطأ
async function extractEdgeFunctionError(error: unknown): Promise<string> {
  if (!error || typeof error !== 'object') return 'خطأ غير معروف';

  // FunctionsHttpError من Supabase JS SDK يحتوي على context.json()
  const e = error as {
    message?: string;
    context?: { json?: () => Promise<{ error?: string }> };
  };

  try {
    if (e.context?.json) {
      const body = await e.context.json();
      if (body?.error) return body.error;
    }
  } catch {
    // تجاهل أخطاء parsing
  }

  return e.message || 'فشل الاتصال بـ Edge Function';
}

class AdminUserService {
  /**
   * إنشاء مستخدم جديد عبر Edge Function
   */
  async createUser(params: CreateUserParams): Promise<{ data: CreateUserResult | null; error: string | null }> {
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: params,
      });
      if (error) {
        const msg = await extractEdgeFunctionError(error);
        return { data: null, error: msg };
      }
      return { data: data as CreateUserResult, error: null };
    } catch (err: unknown) {
      const msg = await extractEdgeFunctionError(err);
      return { data: null, error: msg };
    }
  }

  /**
   * حذف مستخدم عبر Edge Function
   * لا يوجد fallback صامت — الفشل يجب أن يظهر للمسؤول
   */
  async deleteUser(params: DeleteUserParams): Promise<{ data: unknown; error: string | null }> {
    try {
      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: params,
      });

      if (error) {
        const msg = await extractEdgeFunctionError(error);
        console.error('Failed to delete user:', msg);
        return { data: null, error: msg };
      }

      return { data, error: null };
    } catch (err: unknown) {
      const msg = await extractEdgeFunctionError(err);
      console.error('Failed to delete user:', msg);
      return { data: null, error: msg };
    }
  }

  /**
   * تغيير دور المستخدم عبر Edge Function
   */
  async updateUserRole(targetUserId: string, newRole: string, updatedBy: string): Promise<{ data: unknown; error: string | null }> {
    try {
      const { data, error } = await supabase.functions.invoke('admin-update-role', {
        body: { target_user_id: targetUserId, new_role: newRole, updated_by: updatedBy },
      });
      if (error) {
        const msg = await extractEdgeFunctionError(error);
        return { data: null, error: msg };
      }
      return { data, error: null };
    } catch (err: unknown) {
      const msg = await extractEdgeFunctionError(err);
      return { data: null, error: msg };
    }
  }

  /**
   * إعادة تعيين كلمة مرور مستخدم عبر Edge Function
   */
  async resetPassword(targetUserId: string, newPassword: string): Promise<{ data: unknown; error: string | null }> {
    try {
      const { data, error } = await supabase.functions.invoke('admin-reset-password', {
        body: { target_user_id: targetUserId, new_password: newPassword },
      });
      if (error) {
        const msg = await extractEdgeFunctionError(error);
        return { data: null, error: msg };
      }
      return { data, error: null };
    } catch (err: unknown) {
      const msg = await extractEdgeFunctionError(err);
      return { data: null, error: msg };
    }
  }

  /**
   * تعطيل/تفعيل مستخدم عبر Edge Function
   */
  async toggleUserStatus(targetUserId: string, disabled: boolean, updatedBy: string): Promise<{ data: unknown; error: string | null }> {
    try {
      const { data, error } = await supabase.functions.invoke('admin-toggle-status', {
        body: { target_user_id: targetUserId, disabled, updated_by: updatedBy },
      });
      if (error) {
        const msg = await extractEdgeFunctionError(error);
        return { data: null, error: msg };
      }
      return { data, error: null };
    } catch (err: unknown) {
      const msg = await extractEdgeFunctionError(err);
      return { data: null, error: msg };
    }
  }
}

export const adminUserService = new AdminUserService();