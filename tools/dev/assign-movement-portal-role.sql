-- ============================================================================
-- FILE: tools/dev/assign-movement-portal-role.sql
-- PURPOSE: إسناد أدوار بوابة الحركة واللوجستيات إلى مستخدم عبر بريده الإلكتروني
-- USAGE:   بدّل قيمة v_email في السطر المُعلَّم أدناه فقط. لا شيء آخر.
-- SAFETY:  آمن للتكرار (idempotent) · لا يحذف شيئاً · يفشل بوضوح إن كان البريد خاطئاً
-- TESTED:  Postgres 17.10 محلياً على قاعدة مبنية من 228 مايجريشن — 2026-08-04
-- ============================================================================

DO $$
DECLARE
  ------------------------------------------------------------------
  -- ▼▼▼ غيّر هذا السطر وحده ▼▼▼
  v_email   TEXT := 'ضع-بريدك-هنا@example.com';
  ------------------------------------------------------------------
  -- الأدوار المطلوب منحها. movement_manager يشمل الدورين الآخرين
  -- في movement_require_role، لكن نمنح الثلاثة لتظهر كل الوحدات
  -- في الشريط الجانبي بلا لبس.
  v_roles   TEXT[] := ARRAY['movement_manager','logistics','employee_movement'];

  v_user_id   UUID;
  v_tenant_id UUID;
  v_name      TEXT;
  v_role      TEXT;
  v_count     INT;
BEGIN
  SELECT p.id, p.tenant_id, p.full_name
    INTO v_user_id, v_tenant_id, v_name
    FROM public.profiles p
   WHERE lower(p.email) = lower(v_email)
   LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION
      'لم يُعثر على مستخدم بالبريد %. تحقق من الإملاء عبر: SELECT email FROM public.profiles ORDER BY created_at DESC LIMIT 20;',
      v_email;
  END IF;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION
      'المستخدم % موجود لكن tenant_id فارغ — لا يمكن الإسناد بلا مستأجر.',
      v_email;
  END IF;

  INSERT INTO public.movement_role_assignments
    (tenant_id, user_id, portal_role, is_active, assigned_by, notes)
  SELECT v_tenant_id, v_user_id, r, TRUE, v_user_id,
         'إسناد أولي لتفعيل بوابة الحركة — ' || to_char(NOW(),'YYYY-MM-DD')
    FROM unnest(v_roles) AS r
  ON CONFLICT (tenant_id, user_id, portal_role)
  DO UPDATE SET is_active = TRUE, updated_at = NOW();

  SELECT count(*) INTO v_count
    FROM public.movement_role_assignments
   WHERE user_id = v_user_id AND is_active = TRUE;

  RAISE NOTICE '✅ تم إسناد % دور فعّال إلى % (%) · المستأجر %',
    v_count, COALESCE(v_name,'—'), v_email, v_tenant_id;
END $$;

-- ---------------------------------------------------------------------------
-- التحقق: يجب أن ترى ثلاثة صفوف is_active = true
-- ---------------------------------------------------------------------------
SELECT p.email,
       p.full_name,
       p.role        AS profile_role,
       a.portal_role,
       a.is_active,
       t.name_ar     AS tenant_name,
       a.created_at
  FROM public.movement_role_assignments a
  JOIN public.profiles p ON p.id = a.user_id
  JOIN public.tenants  t ON t.id = a.tenant_id
 ORDER BY p.email, a.portal_role;
