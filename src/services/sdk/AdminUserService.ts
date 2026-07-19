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

class AdminUserService {
  /**
   * إنشاء مستخدم جديد عبر Edge Function
   */
  async createUser(params: CreateUserParams): Promise<{ data: CreateUserResult | null; error: string | null }> {
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: params,
      });
      if (error) return { data: null, error: error.message };
      return { data: data as CreateUserResult, error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'فشل الاتصال بـ Edge Function' };
    }
  }

  /**
   * حذف مستخدم عبر Edge Function مع تفعيل Fallback تلقائي (تعطيل الحساب في profiles)
   */
  async deleteUser(params: DeleteUserParams): Promise<{ data: unknown; error: string | null }> {
    try {
      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: params,
      });
      if (!error) return { data, error: null };

      console.warn('Edge function delete failed, falling back to profile deactivation:', error);
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ status: 'inactive' })
        .eq('id', params.target_user_id);

      if (updateErr) return { data: null, error: error.message };
      return { data: { success: true, fallback: true }, error: null };
    } catch (err: any) {
      try {
        await supabase.from('profiles').update({ status: 'inactive' }).eq('id', params.target_user_id);
        return { data: { success: true, fallback: true }, error: null };
      } catch (fallbackErr: any) {
        return { data: null, error: err.message || 'فشل حذف المستخدم' };
      }
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
      if (error) return { data: null, error: error.message };
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'فشل الاتصال بـ Edge Function' };
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
      if (error) return { data: null, error: error.message };
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'فشل الاتصال بـ Edge Function' };
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
      if (error) return { data: null, error: error.message };
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'فشل الاتصال بـ Edge Function' };
    }
  }
}

export const adminUserService = new AdminUserService();