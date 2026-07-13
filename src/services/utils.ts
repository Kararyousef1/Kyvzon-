import type { User } from '../shared/types';

/**
 * التحقق من أن المستخدم محلي (حساب تجريبي)
 * المستخدم المحلي لديه ID يبدأ بـ 'temp-test-' أو 'local-' أو 'emp-' أو 'dev-'
 */
export function isLocalUser(userId?: string): boolean {
  if (!userId) return false;
  return (
    userId.startsWith('temp-test-') ||
    userId.startsWith('local-') ||
    userId.startsWith('emp-') ||
    userId.startsWith('dev-')
  );
}

/**
 * الحصول على اسم العرض للمستخدم
 * @param user المستخدم (قد يكون null)
 * @param fallback النص الافتراضي عند عدم توفر اسم
 */
export function getDisplayName(user: User | null | undefined, fallback = 'مستخدم'): string {
  if (!user) return fallback;
  return user.full_name?.trim() || user.name?.trim() || fallback;
}

/**
 * الحصول على الحرف الأول من اسم المستخدم (كابتال)
 * يدعم الأحرف العربية والإنجليزية
 */
export function getUserInitial(user: User | null | undefined): string {
  const name = getDisplayName(user, '');
  if (!name) return 'U';
  return name.charAt(0).toUpperCase();
}

/**
 * الحصول على دور المستخدم (مع قيمة افتراضية 'employee')
 */
export function getUserRole(user: User | null | undefined): string {
  if (!user || !user.role) return 'employee';
  return user.role;
}

/**
 * الحصول على المسمى الوظيفي للمستخدم
 * يرجع position عند توفره، وإلا يرجع role، وإلا سلسلة فارغة
 */
export function getUserPosition(user: User | null | undefined): string {
  if (!user) return '';
  if (user.position && user.position.trim()) return user.position;
  return user.role || '';
}
