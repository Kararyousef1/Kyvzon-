-- Platform control plane: developer/IT-admin access to cross-tenant billing
-- and audit records. Earlier tenant-scoped policies correctly protected normal
-- users, but also prevented the Developer Portal from completing company setup.

ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kyvzon_tenant_subscriptions_select ON public.tenant_subscriptions;
DROP POLICY IF EXISTS kyvzon_tenant_subscriptions_insert ON public.tenant_subscriptions;
DROP POLICY IF EXISTS kyvzon_tenant_subscriptions_update ON public.tenant_subscriptions;
DROP POLICY IF EXISTS kyvzon_tenant_subscriptions_delete ON public.tenant_subscriptions;
DROP POLICY IF EXISTS tenant_subscriptions_select_platform ON public.tenant_subscriptions;
DROP POLICY IF EXISTS tenant_subscriptions_write_platform ON public.tenant_subscriptions;

CREATE POLICY tenant_subscriptions_select_platform ON public.tenant_subscriptions
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    OR public.current_user_is_platform_owner()
  );

CREATE POLICY tenant_subscriptions_write_platform ON public.tenant_subscriptions
  FOR ALL TO authenticated
  USING (public.current_user_is_platform_owner())
  WITH CHECK (public.current_user_is_platform_owner());

DROP POLICY IF EXISTS kyvzon_platform_audit_log_select ON public.platform_audit_log;
DROP POLICY IF EXISTS kyvzon_platform_audit_log_insert ON public.platform_audit_log;
DROP POLICY IF EXISTS kyvzon_platform_audit_log_update ON public.platform_audit_log;
DROP POLICY IF EXISTS kyvzon_platform_audit_log_delete ON public.platform_audit_log;
DROP POLICY IF EXISTS platform_audit_log_platform_owner ON public.platform_audit_log;

CREATE POLICY platform_audit_log_platform_owner ON public.platform_audit_log
  FOR ALL TO authenticated
  USING (public.current_user_is_platform_owner())
  WITH CHECK (public.current_user_is_platform_owner());
