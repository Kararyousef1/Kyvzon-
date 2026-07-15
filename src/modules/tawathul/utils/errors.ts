import { SdkError, SdkErrorCode } from '../../../services/sdk/BaseService';
import { authService } from '../../../services/sdk/AuthService';

export function tawathulDbError(error: { message?: string; code?: string } | null): never {
  const msg = error?.message || 'خطأ في قاعدة البيانات';
  if (msg.includes('does not exist') || error?.code === '42P01') {
    throw new SdkError(
      SdkErrorCode.DATABASE_ERROR,
      'جداول/ميزات بوابة التواصل غير مكتملة. تأكد من تنفيذ Migrations 0004 و 0005 على Supabase',
    );
  }
  if (msg.includes('row-level security') || error?.code === '42501') {
    throw new SdkError(
      SdkErrorCode.PERMISSION_DENIED,
      'تم رفض العملية بسبب الصلاحيات (RLS). تحقق من عضويتك في المحادثة',
    );
  }
  throw SdkError.fromSupabaseError(error || { message: msg });
}

/**
 * يعيد id المستخدم الحالي أو يرمي SdkError.PERMISSION_DENIED.
 * يستخدم authService (SDK) بدلاً من supabase.auth مباشرة —
 * ليكون هناك مصدر واحد للأخطاء والتوثيق.
 */
export async function requireAuthUserId(): Promise<string> {
  const user = await authService.getCurrentUser();
  if (!user?.id) {
    throw new SdkError(SdkErrorCode.PERMISSION_DENIED, 'يجب تسجيل الدخول لاستخدام بوابة التواصل');
  }
  return user.id;
}
