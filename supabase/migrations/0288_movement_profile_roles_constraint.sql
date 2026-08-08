-- ============================================================================
-- FILE: 0288_movement_profile_roles_constraint.sql
-- PURPOSE: إصلاح ثغرة P0 اكتُشفت في الجولة السادسة.
--
-- المشكلة (تصحيح لتقرير الجولة الأولى):
--   الجولة الأولى أضافت 'employee_movement' و'logistics' و'movement_manager'
--   إلى UserRole في TypeScript، وإلى permissions.ts و userUtils.ts —
--   لكنها **لم تُحدِّث** قيد profiles_role_check في قاعدة البيانات.
--   آخر من عدَّله كان 0218 (MRP) وقائمته تنتهي عند 'manufacturing'.
--
--   الأثر: أي محاولة لإسناد أحد أدوار الحركة الثلاثة لمستخدم تفشل بـ
--     ERROR: new row for relation "profiles" violates check constraint
--            "profiles_role_check"
--   أي أن البوابة كاملةً — 19 وحدة و 5 مايجريشنات RPC — كانت غير قابلة
--   للإسناد لأي مستخدم فعلي. الحارس movement_require_role يقرأ
--   movement_role_assignments، لكن قائمة الموظفين وتبديل الأدوار في
--   AdminEmployeesPage تكتب في profiles.role.
--
-- لماذا لم تكشفه الجولات 1–5:
--   اختبارات 0282–0286 أدخلت صفوف profiles بأدوار قائمة مسبقاً
--   ('admin'/'manager') واعتمدت على movement_role_assignments وحدها،
--   فلم يمرّ أي اختبار على القيد.
--
-- النمط متبَع من 0164 و 0181 و 0204 و 0218: إسقاط القيد ثم إعادة بنائه
-- بالقائمة الكاملة. لا حذف بيانات ولا تعديل صفوف.
-- ============================================================================

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
CHECK (role IN (
  'employee','hr','admin','gatekeeper','developer','supervisor','manager',
  'it_admin','tech','finance','marketing','sales','procurement','inventory',
  'manufacturing',
  -- بوابة الحركة واللوجستيات (0270-0287)
  'employee_movement','logistics','movement_manager'
));

COMMENT ON CONSTRAINT profiles_role_check ON public.profiles IS
  'أدوار النظام المسموحة. يجب أن تطابق UserRole في src/shared/types/index.ts.';

-- ---------------------------------------------------------------------------
-- حارس التحقق: القيد يقبل أدوار الحركة الثلاثة ويرفض المجهول
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_def  TEXT;
  v_role TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint WHERE conname = 'profiles_role_check';

  IF v_def IS NULL THEN
    RAISE EXCEPTION '0288 failed: profiles_role_check missing';
  END IF;

  FOREACH v_role IN ARRAY ARRAY[
    'employee','hr','admin','gatekeeper','developer','supervisor','manager',
    'it_admin','tech','finance','marketing','sales','procurement','inventory',
    'manufacturing','employee_movement','logistics','movement_manager'
  ] LOOP
    IF v_def NOT LIKE '%''' || v_role || '''%' THEN
      RAISE EXCEPTION '0288 failed: role % missing from constraint', v_role;
    END IF;
  END LOOP;

  -- لا يجوز أن يكون القيد مفتوحاً: دور مختلَق يجب أن يُرفض
  BEGIN
    INSERT INTO public.profiles(id, full_name, role)
    VALUES ('00000000-0000-0000-0000-0000000c0288'::uuid, '0288 probe', 'not_a_real_role');
    RAISE EXCEPTION '0288 failed: constraint accepts arbitrary roles';
  EXCEPTION
    WHEN check_violation THEN NULL;              -- المتوقَّع
    WHEN foreign_key_violation THEN NULL;        -- القيد الخارجي سبق فحص CHECK
  END;

  RAISE NOTICE '✅ 0288: profiles_role_check now covers 18 roles incl. movement portal';
END $$;
