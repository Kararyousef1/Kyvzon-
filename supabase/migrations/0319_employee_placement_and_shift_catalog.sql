-- ============================================================================
-- FILE: 0319_employee_placement_and_shift_catalog.sql
-- PURPOSE: إتمام إصلاحات 0318 في طبقة الخدمة — التنسيب والورديات
--
-- ─────────────────────────────────────────────────────────────────────────
-- 0318 أضاف employees.branch_id و shift_code و structure_shifts.tenant_id،
-- لكن الواجهة ما زالت عاجزة عن استعمالها:
--
-- ★ ① مسار تعديل الموظف لا يحفظ الفرع ولا الوردية
--     AdminEmployeesPage عند التعديل ينفّذ:
--         userService.updateUser(id, {full_name, department, position, phone, status})
--         supabase.from('profiles').update({custom_permissions: {...currentCustom,
--                                            allowed_pages: effectiveAllowedPages}})
--     لا ذكر لـ branch_id ولا shift_code ⇒ يبقيان على قيمتهما القديمة،
--     وأي تغيير في النموذج يُهمَل صامتاً. والقراءة تستعمل emp.branch_id
--     وهو عمود لم يكن موجوداً على profiles أصلاً ⇒ الحقل يظهر فارغاً دوماً.
--
-- ★ ② قائمة الورديات ثابتة في JSX
--     أربع قيم مكتوبة يدوياً: morning · evening · night · flexible
--     بينما structure_shifts جدول حقيقي صار مُستأجَراً في 0318.
--     النتيجة: شركة تُعرّف ورديات خاصة بها فلا تظهر لأحد.
--
-- ★ ③ لا دالة قاعدة للتنسيب
--     الصفحة ستضطر لـ UPDATE مباشر على employees — وهذا يخالف
--     «الصفحات لا تلمس Supabase مباشرة» وينقصه تحقق الانتماء.
--
-- ─────────────────────────────────────────────────────────────────────────
-- الحل: ثلاث دوال + قوالب ورديات افتراضية.
-- ❌ لا حذف · ✅ توسيع لا تضييق
-- ============================================================================

-- ═══ 1) كتالوج الورديات — للشركة مع القوالب العامة ══════════════════════
DROP FUNCTION IF EXISTS public.shift_catalog();

CREATE FUNCTION public.shift_catalog()
RETURNS TABLE (
  out_code       TEXT,
  out_name_ar    TEXT,
  out_start_time TEXT,
  out_end_time   TEXT,
  out_is_global  BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.code::TEXT,
         s.name_ar::TEXT,
         to_char(s.start_time, 'HH24:MI'),
         to_char(s.end_time,   'HH24:MI'),
         (s.tenant_id IS NULL)
    FROM public.structure_shifts s
   WHERE COALESCE(s.is_active, TRUE)
     AND public.current_user_tenant_id() IS NOT NULL
     -- ورديات شركتي + القوالب العامة (نفس منطق RLS في 0318)
     AND (s.tenant_id IS NULL OR s.tenant_id = public.current_user_tenant_id())
   ORDER BY (s.tenant_id IS NULL), s.start_time, s.name_ar;
$$;

COMMENT ON FUNCTION public.shift_catalog() IS
  'ورديات الشركة + القوالب العامة. يحلّ محلّ القائمة الثابتة في شاشة إدارة المستخدمين (0319).';

REVOKE ALL ON FUNCTION public.shift_catalog() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shift_catalog() FROM anon;
GRANT EXECUTE ON FUNCTION public.shift_catalog() TO authenticated, service_role;

-- ═══ 2) قوالب الورديات الأربعة — بديل القائمة الثابتة ═══════════════════
-- نُدرجها كقوالب عامة (tenant_id IS NULL) فتراها كل الشركات، وتبقى
-- الشركة حرّة في تعريف ورديات خاصة. القيم تطابق ما كان في JSX حرفياً
-- فلا ينكسر أي صف بيانات قديم يحمل 'morning' أو 'evening'.
DO $$
DECLARE v_n INT := 0;
BEGIN
  INSERT INTO public.structure_shifts(tenant_id, code, name_ar, start_time, end_time, is_active)
  SELECT NULL, v.code, v.name_ar, v.st::TIME, v.en::TIME, TRUE
    FROM (VALUES
      ('morning',  'الوردية الصباحية', '08:00', '16:00'),
      ('evening',  'الوردية المسائية', '16:00', '00:00'),
      ('night',    'الوردية الليلية',  '00:00', '08:00'),
      ('flexible', 'وردية مرنة',       '00:00', '23:59')
    ) AS v(code, name_ar, st, en)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.structure_shifts s
      WHERE s.code = v.code AND s.tenant_id IS NULL
   );

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE '0319: أُضيف % قالب وردية عام', v_n;
END $$;

-- ═══ 3) تنسيب الموظف — القسم والفرع والوردية معاً ═══════════════════════
DROP FUNCTION IF EXISTS public.set_employee_placement(UUID, UUID, UUID, TEXT);

CREATE FUNCTION public.set_employee_placement(
  p_user_id      UUID,
  p_department_id UUID DEFAULT NULL,
  p_branch_id    UUID DEFAULT NULL,
  p_shift_code   TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_eid    UUID;
  v_name   TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  -- الامتياز: إدارة الموظفين عمل إداري
  IF public.current_user_role() NOT IN ('admin','hr','developer','it_admin') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_TO_PLACE_EMPLOYEE';
  END IF;

  -- المستهدَف داخل المستأجر
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = p_user_id AND p.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'TARGET_USER_NOT_IN_TENANT';
  END IF;

  -- القسم من المستأجر نفسه
  IF p_department_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.departments d
     WHERE d.id = p_department_id AND d.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'DEPARTMENT_NOT_IN_TENANT';
  END IF;

  -- الفرع من المستأجر نفسه
  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches b
     WHERE b.id = p_branch_id AND b.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'BRANCH_NOT_IN_TENANT';
  END IF;

  -- الوردية موجودة في الكتالوج (شركتي أو قالب عام)
  IF p_shift_code IS NOT NULL AND btrim(p_shift_code) <> '' AND NOT EXISTS (
    SELECT 1 FROM public.structure_shifts s
     WHERE s.code = p_shift_code
       AND (s.tenant_id IS NULL OR s.tenant_id = v_tenant)
  ) THEN
    RAISE EXCEPTION 'SHIFT_NOT_FOUND (%)', p_shift_code;
  END IF;

  -- صف employees مضمون بمحفّز 0317، لكن نتحوّط لو استُدعيت مبكراً
  SELECT e.id INTO v_eid FROM public.employees e WHERE e.user_id = p_user_id;

  IF v_eid IS NULL THEN
    SELECT p.full_name INTO v_name FROM public.profiles p WHERE p.id = p_user_id;
    INSERT INTO public.employees
      (tenant_id, user_id, department_id, branch_id, shift_code,
       employee_code, first_name, last_name)
    VALUES
      (v_tenant, p_user_id, p_department_id, p_branch_id,
       NULLIF(btrim(COALESCE(p_shift_code,'')), ''),
       'EMP-' || substr(replace(p_user_id::TEXT,'-',''), 1, 8),
       COALESCE(NULLIF(split_part(btrim(v_name),' ',1),''), 'موظف'),
       COALESCE(NULLIF(btrim(substr(btrim(v_name),
          length(split_part(btrim(v_name),' ',1)) + 1)), ''), '—'))
    RETURNING id INTO v_eid;
    RETURN v_eid;
  END IF;

  -- ★ NULL يعني «لا تغيير» لا «امسح» — الشاشة قد ترسل حقلاً واحداً.
  --   لمسح قيمة يُرسَل السلسلة الفارغة في shift_code، أو تُستعمل
  --   دالة منفصلة مستقبلاً. هذا يمنع محو الفرع بتحديث لا يخصّه —
  --   وهو بعينه العطل الذي أصلحناه.
  UPDATE public.employees e
     SET department_id = COALESCE(p_department_id, e.department_id),
         branch_id     = COALESCE(p_branch_id,     e.branch_id),
         shift_code    = CASE
                           WHEN p_shift_code IS NULL THEN e.shift_code
                           WHEN btrim(p_shift_code) = '' THEN NULL
                           ELSE p_shift_code
                         END
   WHERE e.id = v_eid;

  RETURN v_eid;
END $$;

COMMENT ON FUNCTION public.set_employee_placement(UUID, UUID, UUID, TEXT) IS
  'يحفظ قسم الموظف وفرعه ووردیته. NULL = لا تغيير · سلسلة فارغة في shift_code = مسح. يتحقق من انتماء كل مرجع للمستأجر (0319).';

REVOKE ALL ON FUNCTION public.set_employee_placement(UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_employee_placement(UUID, UUID, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_employee_placement(UUID, UUID, UUID, TEXT)
  TO authenticated, service_role;

-- ═══ 4) قراءة تنسيب الموظف — لملء النموذج عند التعديل ═══════════════════
DROP FUNCTION IF EXISTS public.employee_placement(UUID);

CREATE FUNCTION public.employee_placement(p_user_id UUID)
RETURNS TABLE (
  out_department_id   UUID,
  out_department_name TEXT,
  out_branch_id       UUID,
  out_branch_name     TEXT,
  out_shift_code      TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.department_id,
         d.name_ar::TEXT,
         e.branch_id,
         b.name_ar::TEXT,
         e.shift_code::TEXT
    FROM public.employees e
    LEFT JOIN public.departments d ON d.id = e.department_id
    LEFT JOIN public.branches    b ON b.id = e.branch_id
   WHERE e.user_id   = p_user_id
     AND e.tenant_id = public.current_user_tenant_id()
   LIMIT 1;
$$;

COMMENT ON FUNCTION public.employee_placement(UUID) IS
  'تنسيب الموظف الحالي (قسم · فرع · وردية) لملء نموذج التعديل. كانت الشاشة تقرأ emp.branch_id وهو عمود غير موجود.';

REVOKE ALL ON FUNCTION public.employee_placement(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.employee_placement(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.employee_placement(UUID) TO authenticated, service_role;

-- ═══ 5) حرّاس التحقق ════════════════════════════════════════════════════
DO $$
DECLARE
  v_cnt  INT;
  v_t    UUID := gen_random_uuid();
  v_t2   UUID := gen_random_uuid();
  v_d    UUID := gen_random_uuid();
  v_b    UUID := gen_random_uuid();
  v_b2   UUID := gen_random_uuid();
  v_adm  UUID := gen_random_uuid();
  v_emp  UUID := gen_random_uuid();
  v_txt  TEXT;
BEGIN
  FOR v_cnt IN
    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('shift_catalog','set_employee_placement','employee_placement')
  LOOP
    ASSERT v_cnt = 3, format('0319 failed: functions = %s (expected 3)', v_cnt);
  END LOOP;

  -- القوالب الأربعة موجودة
  SELECT count(*) INTO v_cnt FROM public.structure_shifts
   WHERE tenant_id IS NULL AND code IN ('morning','evening','night','flexible');
  ASSERT v_cnt = 4, format('0319 failed: global shift templates = %s', v_cnt);

  -- ═══ اختبار سلوكي ═══════════════════════════════════════════════════
  INSERT INTO public.tenants(id,name,name_ar,slug) VALUES
    (v_t, 'G319','حارس','g319-'||substr(v_t::text,1,8)),
    (v_t2,'O319','آخر', 'o319-'||substr(v_t2::text,1,8));
  INSERT INTO public.departments(id,tenant_id,name_ar) VALUES (v_d,v_t,'العمليات');
  INSERT INTO public.branches(id,tenant_id,name_ar,code) VALUES
    (v_b, v_t, 'فرع الحارس','G1'),
    (v_b2,v_t2,'فرع شركة أخرى','O1');
  INSERT INTO auth.users(id,email) VALUES
    (v_adm,'a319-'||substr(v_adm::text,1,8)||'@t.io'),
    (v_emp,'e319-'||substr(v_emp::text,1,8)||'@t.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_adm,v_t,'مدير النظام','admin'),
    (v_emp,v_t,'موظف الحارس','employee');

  PERFORM set_config('request.jwt.claim.sub', v_adm::TEXT, TRUE);

  -- الكتالوج يعيد القوالب على الأقل
  SELECT count(*) INTO v_cnt FROM public.shift_catalog();
  ASSERT v_cnt >= 4, format('0319 failed: shift_catalog = %s', v_cnt);

  -- التنسيب يعمل
  PERFORM public.set_employee_placement(v_emp, v_d, v_b, 'morning');

  SELECT out_shift_code INTO v_txt FROM public.employee_placement(v_emp);
  ASSERT v_txt = 'morning', format('0319 failed: shift = %s', COALESCE(v_txt,'NULL'));

  ASSERT (SELECT out_branch_id FROM public.employee_placement(v_emp)) = v_b,
    '0319 failed: branch not saved';

  -- ★ NULL لا يمسح: تحديث القسم وحده يُبقي الفرع
  PERFORM public.set_employee_placement(v_emp, v_d, NULL, NULL);
  ASSERT (SELECT out_branch_id FROM public.employee_placement(v_emp)) = v_b,
    '0319 failed: ★ NULL wiped branch — this is the original bug';
  SELECT out_shift_code INTO v_txt FROM public.employee_placement(v_emp);
  ASSERT v_txt = 'morning', '0319 failed: ★ NULL wiped shift';

  -- السلسلة الفارغة تمسح الوردية
  PERFORM public.set_employee_placement(v_emp, NULL, NULL, '');
  SELECT out_shift_code INTO v_txt FROM public.employee_placement(v_emp);
  ASSERT v_txt IS NULL, format('0319 failed: empty string did not clear (%s)', v_txt);

  -- ★ فرع من مستأجر آخر مرفوض
  BEGIN
    PERFORM public.set_employee_placement(v_emp, NULL, v_b2, NULL);
    RAISE EXCEPTION '0319 failed: accepted branch from another tenant';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%BRANCH_NOT_IN_TENANT%' THEN RAISE; END IF;
  END;

  -- وردية مجهولة مرفوضة
  BEGIN
    PERFORM public.set_employee_placement(v_emp, NULL, NULL, 'no_such_shift');
    RAISE EXCEPTION '0319 failed: accepted unknown shift';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%SHIFT_NOT_FOUND%' THEN RAISE; END IF;
  END;

  -- غير المخوَّل لا يُنسّب
  PERFORM set_config('request.jwt.claim.sub', v_emp::TEXT, TRUE);
  BEGIN
    PERFORM public.set_employee_placement(v_emp, v_d, v_b, 'morning');
    RAISE EXCEPTION '0319 failed: employee placed himself';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%NOT_AUTHORIZED_TO_PLACE_EMPLOYEE%' THEN RAISE; END IF;
  END;

  -- تنظيف
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  DELETE FROM public.employees   WHERE tenant_id IN (v_t,v_t2);
  DELETE FROM public.profiles    WHERE id IN (v_adm,v_emp);
  DELETE FROM auth.users         WHERE id IN (v_adm,v_emp);
  DELETE FROM public.branches    WHERE id IN (v_b,v_b2);
  DELETE FROM public.departments WHERE id = v_d;
  DELETE FROM public.tenants     WHERE id IN (v_t,v_t2);

  ASSERT NOT has_function_privilege('anon',
    'public.set_employee_placement(uuid,uuid,uuid,text)','EXECUTE'),
    '0319 failed: anon can place employees';

  RAISE NOTICE '✅ 0319: التنسيب يحفظ الفرع والوردية · وكتالوج الورديات من القاعدة';
END $$;
