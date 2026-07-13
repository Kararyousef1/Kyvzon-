/**
 * ════════════════════════════════════════════════════════════════
 *  AuthService - خدمة المصادقة (نسخة SDK جديدة)
 *  مسؤولة فقط عن: Login, Logout, Session, Password
 *  لا تحتوي أي منطق للموظفين أو الصلاحيات
 * ════════════════════════════════════════════════════════════════
 */

import { supabase } from '../supabase/supabase';
import { SdkError, SdkErrorCode } from './BaseService';
import { logger } from '../utils/logger';

export interface LoginResult {
  user: {
    id: string;
    email: string;
  } | null;
  session: unknown;
}

export interface SessionResult {
  session: {
    user: {
      id: string;
      email: string;
    } | null;
  } | null;
}

/**
 * نتيجة ضبط سياق الجلسة في Postgres.
 * resolvedRole و isPlatformOwner تُحسب من قاعدة البيانات نفسها
 * (من جدول profiles) وليس من أي قيمة يرسلها العميل.
 */
export interface SessionContextResult {
  resolvedRole: string;
  resolvedTenantId: string | null;
  isPlatformOwner: boolean;
}

class AuthService {
  /**
   * تسجيل الدخول
   */
  async login(email: string, password: string): Promise<LoginResult> {
    try {
      logger.info('AuthService.login attempt', {
        component: 'AuthService',
        action: 'login',
        email,
      });

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw new SdkError(
          SdkErrorCode.PERMISSION_DENIED,
          error.message === 'Invalid login credentials'
            ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
            : error.message,
        );
      }

      return {
        user: data.user
          ? { id: data.user.id, email: data.user.email || '' }
          : null,
        session: data.session,
      };
    } catch (error) {
      if (error instanceof SdkError) throw error;
      throw SdkError.fromSupabaseError(error as any);
    }
  }

  /**
   * ضبط سياق الجلسة في Postgres بعد نجاح تسجيل الدخول.
   *
   * ⚠️ يجب استدعاؤها فوراً بعد login() الناجح، وقبل أي طلب بيانات آخر.
   * بدونها، دوال RLS مثل is_platform_owner() و is_same_tenant()
   * (Migration 101) ترجع دائماً false — أي أن الوصول يُمنع للجميع
   * وليس فقط للمستخدمين غير المصرح لهم.
   *
   * الدالة لا تقبل أي معامل: الدور والـ tenant يُقرآن من profiles
   * داخل قاعدة البيانات (SECURITY DEFINER)، بحيث لا يمكن لمستخدم
   * عادي انتحال صفة platform_owner من جهة العميل.
   */
  async setSessionContext(): Promise<SessionContextResult> {
    try {
      logger.debug('AuthService.setSessionContext', {
        component: 'AuthService',
        action: 'setSessionContext',
      });

      const { data, error } = await supabase.rpc('set_session_context');
      if (error) throw SdkError.fromSupabaseError(error);

      const row = Array.isArray(data) ? data[0] : data;
      return {
        resolvedRole: row?.resolved_role ?? '',
        resolvedTenantId: row?.resolved_tenant_id ?? null,
        isPlatformOwner: !!row?.is_owner,
      };
    } catch (error) {
      if (error instanceof SdkError) throw error;
      throw SdkError.fromSupabaseError(error as any);
    }
  }

  /**
   * تصفير سياق الجلسة. تُستدعى عند logout كإجراء احتياطي إضافي
   * (Supabase غالباً يفتح اتصالاً جديداً لكل طلب، لكن هذا يحمي
   * في حال إعادة استخدام اتصال pooled).
   */
  async clearSessionContext(): Promise<void> {
    try {
      const { error } = await supabase.rpc('clear_session_context');
      if (error) throw SdkError.fromSupabaseError(error);
    } catch (error) {
      // لا نرمي الخطأ هنا عمداً — فشل التصفير لا يجب أن يمنع تسجيل الخروج
      console.error('clearSessionContext failed:', error);
    }
  }

  /**
   * تسجيل الخروج
   */
  async logout(): Promise<void> {
    try {
      logger.info('AuthService.logout', {
        component: 'AuthService',
        action: 'logout',
      });

      const { error } = await supabase.auth.signOut();
      if (error) throw SdkError.fromSupabaseError(error);
    } catch (error) {
      logger.error('AuthService.logout failed', {
        component: 'AuthService',
        action: 'logout',
        error: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof SdkError) throw error;
      throw SdkError.fromSupabaseError(error as any);
    }
  }

  /**
   * الحصول على الجلسة الحالية
   */
  async getSession(): Promise<SessionResult> {
    try {
      logger.debug('AuthService.getSession', {
        component: 'AuthService',
        action: 'getSession',
      });

      const { data, error } = await supabase.auth.getSession();
      if (error) throw SdkError.fromSupabaseError(error);
      return data as SessionResult;
    } catch (error) {
      logger.error('AuthService.getSession failed', {
        component: 'AuthService',
        action: 'getSession',
        error: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof SdkError) throw error;
      throw SdkError.fromSupabaseError(error as any);
    }
  }

  /**
   * تحديث الجلسة
   */
  async refreshSession(): Promise<SessionResult | null> {
    try {
      logger.debug('AuthService.refreshSession', {
        component: 'AuthService',
        action: 'refreshSession',
      });

      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw SdkError.fromSupabaseError(error);
      return data as SessionResult;
    } catch (error) {
      logger.error('AuthService.refreshSession failed', {
        component: 'AuthService',
        action: 'refreshSession',
        error: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof SdkError) throw error;
      throw SdkError.fromSupabaseError(error as any);
    }
  }

  /**
   * إعادة تعيين كلمة المرور
   */
  async resetPassword(email: string): Promise<void> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw SdkError.fromSupabaseError(error);
    } catch (error) {
      if (error instanceof SdkError) throw error;
      throw SdkError.fromSupabaseError(error as any);
    }
  }

  /**
   * تحديث كلمة المرور
   */
  async updatePassword(newPassword: string): Promise<void> {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw SdkError.fromSupabaseError(error);
    } catch (error) {
      if (error instanceof SdkError) throw error;
      throw SdkError.fromSupabaseError(error as any);
    }
  }

  /**
   * الحصول على المستخدم الحالي
   */
  async getCurrentUser(): Promise<{ id: string; email: string } | null> {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw SdkError.fromSupabaseError(error);
      if (!user) return null;
      return { id: user.id, email: user.email || '' };
    } catch (error) {
      if (error instanceof SdkError) throw error;
      throw SdkError.fromSupabaseError(error as any);
    }
  }

  /**
   * التحقق من صحة الجلسة
   */
  async validateSession(): Promise<boolean> {
    try {
      const session = await this.getSession();
      return !!session?.session?.user;
    } catch {
      return false;
    }
  }
}

export const authService = new AuthService();