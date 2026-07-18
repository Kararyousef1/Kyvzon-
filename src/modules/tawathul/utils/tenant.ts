/**
 * مساعدات Tenant لبوابة التواصل
 * الأمان الحقيقي عبر RLS — هذا دفاع إضافي + UX
 * تم إصلاحه: لا نكتب DEFAULT_TENANT_ID في localStorage لأنه يسبب 400 في audit_logs و tenant_subscriptions
 */

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export function getTawathulTenantId(): string {
  try {
    if (typeof window !== 'undefined') {
      const fromStorage = localStorage.getItem('tenant_id');
      // فقط إذا كان tenant_id حقيقي وليس وهمي، نعيده
      if (fromStorage && fromStorage.length > 10 && fromStorage !== DEFAULT_TENANT_ID) {
        return fromStorage;
      }
      // إذا كان هناك tenant_id وهمي في localStorage، لا نستخدمه لـ Tawathul أيضاً إذا لم يكن هناك مستخدم مسجل
      if (fromStorage && fromStorage === DEFAULT_TENANT_ID) {
        // تحقق إذا كان هناك مستخدم مسجل — إذا لا، أعد الوهمي لكن لا تكتبه مرة أخرى
        return fromStorage;
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_TENANT_ID;
}

export function requireTawathulTenantId(): string {
  return getTawathulTenantId();
}

export function ensureDefaultTenantCached(): string {
  // تم إصلاحه: لا نكتب DEFAULT_TENANT_ID تلقائياً في localStorage لأنه يلوث getCurrentTenantId
  // ويسبب استعلامات بـ tenant_id وهمي تفشل بـ 400 في audit_logs و tenant_subscriptions
  // نعيد الـ ID فقط، ولا نكتب في localStorage إلا إذا كان هناك tenant حقيقي موجود مسبقاً
  const id = getTawathulTenantId();
  try {
    if (typeof window !== 'undefined') {
      const existing = localStorage.getItem('tenant_id');
      // فقط إذا كان هناك tenant حقيقي، نحتفظ به — لا نكتب الوهمي
      if (!existing) {
        // لا نكتب شيئاً — نترك localStorage فارغاً حتى يسجل المستخدم دخول حقيقي
        // هذا يمنع audit_logs?select ... tenant_id=eq.00000000...
        console.warn('Tawathul: No real tenant_id in storage, using dummy internally but not caching it to avoid 400 errors');
        return id;
      }
    }
  } catch {
    // ignore
  }
  return id;
}

export { DEFAULT_TENANT_ID };
