-- ====== إضافة مفتاح خارجي لربط سجلات العمليات بالبروفايلات ======
ALTER TABLE public.audit_logs 
  DROP CONSTRAINT IF EXISTS fk_audit_logs_actor_profiles;

ALTER TABLE public.audit_logs 
  ADD CONSTRAINT fk_audit_logs_actor_profiles 
  FOREIGN KEY (actor_id) REFERENCES public.profiles(id) 
  ON DELETE SET NULL;
