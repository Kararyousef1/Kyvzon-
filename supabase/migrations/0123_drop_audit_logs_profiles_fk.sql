-- ====== حذف المفتاح الخارجي لتجربة حل مشكلة تسجيل الدخول ======
ALTER TABLE public.audit_logs 
  DROP CONSTRAINT IF EXISTS fk_audit_logs_actor_profiles;
