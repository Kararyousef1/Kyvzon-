-- ============================================================================
-- 0203 — Procurement PR approvals compatibility view
-- السبب: الواجهة/SDK تقرأ pr_approvals لعرض سير موافقات PR، بينما نموذج البيانات
-- النهائي يستخدم procurement_approval_requests + procurement_approval_steps.
-- هذا View يحافظ على عقد الواجهة القديم دون إنشاء جدول مكرر أو كسر RLS.
-- ============================================================================

CREATE OR REPLACE VIEW public.pr_approvals
WITH (security_invoker = true) AS
SELECT
  s.id,
  s.tenant_id,
  r.related_id AS pr_id,
  s.approver_id,
  s.step_order AS approval_level,
  s.approver_role AS role_required,
  CASE
    WHEN s.status IN ('approved','rejected') THEN s.status
    ELSE 'pending'
  END::TEXT AS decision,
  s.comments,
  s.decided_at,
  s.created_at
FROM public.procurement_approval_steps s
JOIN public.procurement_approval_requests r
  ON r.id = s.request_id
 AND r.tenant_id = s.tenant_id
WHERE r.request_type = 'pr'
  AND r.related_id IS NOT NULL
  AND s.tenant_id = public.current_user_tenant_id();

GRANT SELECT ON public.pr_approvals TO authenticated;

-- اطلب من PostgREST تحديث schema cache حتى يظهر الـ View فوراً في REST API.
NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.pr_approvals') IS NULL THEN
    RAISE EXCEPTION '0203 failed: public.pr_approvals compatibility view missing';
  END IF;
  RAISE NOTICE '✅ 0203: public.pr_approvals compatibility view created for PR approval workflow UI';
END $$;
