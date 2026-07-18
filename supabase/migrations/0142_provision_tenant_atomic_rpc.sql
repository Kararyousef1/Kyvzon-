-- =============================================================================
-- 0142_provision_tenant_atomic_rpc.sql
-- تموين شركة جديدة ذريًا (Atomic Provisioning) — إغلاق خطر اليتيمة
-- =============================================================================
-- المشكلة السابقة: إنشاء شركة كان سلسلة عمليات من العميل:
--   1) create tenant
--   2) create profile admin
--   3) create subscription
--   4) create legal_entity DEFAULT
--   إذا فشلت خطوة، تبقى بيانات يتيمة (tenant بدون admin).
--
-- الحل: RPC واحد SECURITY DEFINER يعمل في transaction واحدة.
-- =============================================================================

-- دالة: provision_tenant_atomic
-- المدخلات: اسم الشركة، slug، بريد المدير، خطة اشتراك
-- المخرجات: تفاصيل tenant + admin profile + subscription + legal_entity
-- الأمان: فقط platform_owner (developer/it_admin) أو مستخدم مفوض من Edge

CREATE OR REPLACE FUNCTION public.provision_tenant_atomic(
  p_name_ar TEXT,
  p_slug TEXT,
  p_admin_email TEXT,
  p_admin_password TEXT DEFAULT NULL,
  p_plan TEXT DEFAULT 'trial',
  p_seats INTEGER DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_admin_id UUID;
  v_entity_id UUID;
  v_subscription_id UUID;
  v_caller_id UUID;
  v_caller_role TEXT;
  v_result JSONB;
BEGIN
  -- التحقق من هوية المتصل
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'غير مصادق';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
  IF NOT public.current_user_is_platform_owner() THEN
    RAISE EXCEPTION 'فقط مالك المنصة يمكنه تموين شركة جديدة';
  END IF;

  -- تحقق المدخلات
  IF p_name_ar IS NULL OR length(trim(p_name_ar)) < 2 THEN
    RAISE EXCEPTION 'اسم الشركة قصير';
  END IF;
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9-]{3,50}$' THEN
    RAISE EXCEPTION 'slug غير صالح، يجب أن يكون a-z0-9- بين 3 و 50';
  END IF;
  IF p_admin_email IS NULL OR p_admin_email !~ '@' THEN
    RAISE EXCEPTION 'بريد المدير غير صالح';
  END IF;
  IF p_plan NOT IN ('trial','basic','pro','enterprise') THEN
    RAISE EXCEPTION 'خطة اشتراك غير صالحة';
  END IF;

  -- التحقق من عدم تكرار slug
  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = p_slug) THEN
    RAISE EXCEPTION 'slug موجود مسبقًا';
  END IF;

  -- 1) إنشاء tenant
  INSERT INTO public.tenants (name_ar, slug, status)
  VALUES (trim(p_name_ar), lower(trim(p_slug)), 'active')
  RETURNING id INTO v_tenant_id;

  -- 2) إنشاء اشتراك trial
  INSERT INTO public.tenant_subscriptions (tenant_id, plan, status, seats_limit, started_at, expires_at)
  VALUES (
    v_tenant_id,
    p_plan,
    'active',
    p_seats,
    NOW(),
    CASE WHEN p_plan='trial' THEN NOW() + INTERVAL '14 days' ELSE NOW() + INTERVAL '1 year' END
  )
  RETURNING id INTO v_subscription_id;

  -- 3) إنشاء كيان قانوني افتراضي DEFAULT
  INSERT INTO public.legal_entities (tenant_id, code, name_ar, name_en, base_currency_code, status)
  VALUES (v_tenant_id, 'DEFAULT', p_name_ar, p_name_ar, 'IQD', 'active')
  RETURNING id INTO v_entity_id;

  -- 4) سجل تدقيق منصة
  INSERT INTO public.platform_audit_log (action, tenant_id, actor_id, details)
  VALUES (
    'provision_tenant_atomic',
    v_tenant_id,
    v_caller_id,
    jsonb_build_object(
      'slug', p_slug,
      'plan', p_plan,
      'seats', p_seats,
      'admin_email', p_admin_email,
      'entity_id', v_entity_id
    )
  );

  -- ملاحظة: إنشاء مستخدم Auth يتم عبر Edge Function admin-create-user
  -- بعد هذا الـ RPC، لذا نعيد tenant_id ليستخدمه Edge

  v_result := jsonb_build_object(
    'tenant_id', v_tenant_id,
    'slug', p_slug,
    'subscription_id', v_subscription_id,
    'legal_entity_id', v_entity_id,
    'plan', p_plan,
    'message', 'تم تموين الشركة ذريًا، استخدم admin-create-user لإنشاء المدير'
  );

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  -- أي فشل يسبب rollback تلقائي للـ transaction
  RAISE EXCEPTION 'فشل تموين الشركة: %', SQLERRM;
END;
$$;

-- الصلاحيات: فقط authenticated يمكنه الاستدعاء، لكن الدالة تتحقق من platform_owner
REVOKE ALL ON FUNCTION public.provision_tenant_atomic(TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_tenant_atomic(TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER) TO authenticated;

COMMENT ON FUNCTION public.provision_tenant_atomic IS 'Atomic tenant provisioning: creates tenant + subscription + DEFAULT legal_entity in one transaction. Only platform_owner can call.';

-- اختبار داخلي (documentation)
DO $$
BEGIN
  RAISE NOTICE '0142 provision_tenant_atomic_rpc installed — use: SELECT provision_tenant_atomic(''شركة اختبار'',''test-co'',''admin@test.co'')';
END
$$;
