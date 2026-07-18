-- ====== إضافة سياسة تسمح لمدراء النظام والموارد البشرية بتحديث البروفايلات ======
-- تاريخ الإنشاء: 2026-07-19
-- الهدف: حل مشكلة الخطأ 406 عند قيام المدير بتعديل بيانات موظف آخر

DROP POLICY IF EXISTS kyvzon_profiles_update_admin ON public.profiles;

CREATE POLICY kyvzon_profiles_update_admin ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_role() IN ('admin', 'hr', 'developer', 'it_admin')
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
  );
