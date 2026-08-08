-- ============================================================================
-- FILE: 0317_fix_department_membership_and_hr_requester.sql
-- PURPOSE: إصلاح عطلين مُبلَّغ عنهما من المتصفح (2026-08-05)
--
-- ─────────────────────────────────────────────────────────────────────────
-- ★ البلاغ الأول: «عدّلتُ مستخدماً وأضفتُه لقسم، ولم يظهر في الهيكل التنظيمي»
--
--   السبب المُثبَت تشغيلياً: **عمودان مختلفان لنفس المعنى**.
--     profiles.department      TEXT    ← نصّ حرّ · ما تكتبه شاشة التعديل
--     employees.department_id  UUID    ← مفتاح أجنبي · ما يعدّه الهيكل
--
--   org_structure_overview() تعدّ هكذا:
--       SELECT count(*) FROM employees e WHERE e.department_id = d.id
--
--   ومسار «تعديل موظف» في AdminEmployeesPage يستدعي:
--       userService.updateUser(id, { department: form.department, ... })
--   أي يكتب النصّ في profiles ولا يلمس employees إطلاقاً.
--
--   مسبار على قاعدة نظيفة:
--       profiles.department = 'العمليات'  ✓
--       عدّ الهيكل التنظيمي              = 0   ← البلاغ حرفياً
--       صف الموظف في employees           = 0
--
--   والأسوأ: مستخدم بلا صف في employees لا يظهر في أي تقرير فريق،
--   ولا تعمل معه is_in_my_team() عبر نطاق القسم.
--
-- ─────────────────────────────────────────────────────────────────────────
-- ★ البلاغ الثاني: «هل تصل الطلبات للوحدات؟»
--
--   الجواب المُثبَت: **لا — طلبات HR لا تصل**.
--
--   عرض unified_approvals يضع في فرع hr:
--       r.employee_id AS requester_id      ← وهذا employees.id
--   بينما my_approval_inbox تفحص:
--       public.is_in_my_team(u.requester_id)   ← وتتوقع profiles.id
--
--   مسبار: مدير له وحدة hr على قسم الموظف، والطلب pending:
--       has_portal_unit('manager','hr') = TRUE
--       صندوق المدير                     = 0     ← العطل
--       is_in_my_team(employees.id)      = FALSE  ← معرّف من جدول آخر
--
--   هذا **نفس مرض المشروع**: employee_id له معنيان مختلفان بحسب الجدول.
--   موثَّق سابقاً في مذكرات المعمارية، وهنا يظهر أثره العملي.
--
-- ─────────────────────────────────────────────────────────────────────────
-- الحل — ثلاث طبقات:
--   ① دالة تُطبّع أي معرّف (profiles.id أو employees.id) إلى profiles.id
--   ② تصحيح العرض ليعطي profiles.id دائماً
--   ③ توسيع is_in_my_team لتقرأ employees.department_id أيضاً
--   ④ ضمان صف employees لكل مستخدم (محفّز + ترحيل أثري)
--
-- ❌ لا حذف · ❌ لا تغيير أعمدة قائمة · ✅ توسيع لا تضييق
-- ============================================================================

-- ═══ 0) إسقاط العرض أولاً — يعتمد على دوال سنُعيد تعريفها ═══════════════
-- عند إعادة التشغيل يكون unified_approvals معتمداً على resolve_person_user_id،
-- فيمنع DROP FUNCTION بـ «other objects depend on it». نُسقط العرض هنا
-- ونُعيد بناءه في القسم ٤. (اكتُشف بإعادة التشغيل لا بالمراجعة.)
DROP VIEW IF EXISTS public.unified_approvals CASCADE;

-- ═══ 1) تطبيع المعرّف: أي معرّف ⇒ profiles.id ═══════════════════════════
DROP FUNCTION IF EXISTS public.resolve_person_user_id(UUID);

CREATE FUNCTION public.resolve_person_user_id(p_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- الحالة الشائعة: هو أصلاً profiles.id
    WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id = p_id) THEN p_id
    -- وإلا: قد يكون employees.id فنُترجمه
    ELSE (SELECT e.user_id FROM public.employees e WHERE e.id = p_id)
  END;
$$;

COMMENT ON FUNCTION public.resolve_person_user_id(UUID) IS
  'يُطبّع أي معرّف شخص إلى profiles.id. يحلّ ازدواج معنى employee_id بين الجداول (0317).';

REVOKE ALL ON FUNCTION public.resolve_person_user_id(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_person_user_id(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_person_user_id(UUID) TO authenticated, service_role;

-- ═══ 2) قسم الشخص — من employees أو profiles.department ═════════════════
DROP FUNCTION IF EXISTS public.resolve_person_department(UUID);

CREATE FUNCTION public.resolve_person_department(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dept   UUID;
  v_tenant UUID;
  v_name   TEXT;
BEGIN
  IF p_user_id IS NULL THEN RETURN NULL; END IF;

  -- (أ) المسار الصحيح: employees.department_id
  SELECT e.department_id, e.tenant_id INTO v_dept, v_tenant
    FROM public.employees e
   WHERE e.user_id = p_user_id
   LIMIT 1;

  IF v_dept IS NOT NULL THEN RETURN v_dept; END IF;

  -- (ب) جسر التوافق: profiles.department نصّاً ⇒ نطابقه بالاسم.
  --     ضروري لأن شاشة تعديل الموظف تكتب النصّ وحده — وهذا ما سبّب البلاغ.
  SELECT p.tenant_id, p.department INTO v_tenant, v_name
    FROM public.profiles p
   WHERE p.id = p_user_id;

  IF v_name IS NULL OR btrim(v_name) = '' THEN RETURN NULL; END IF;

  SELECT d.id INTO v_dept
    FROM public.departments d
   WHERE d.tenant_id = v_tenant
     AND btrim(d.name_ar) = btrim(v_name)
   LIMIT 1;

  RETURN v_dept;
END $$;

COMMENT ON FUNCTION public.resolve_person_department(UUID) IS
  'قسم الشخص: employees.department_id أولاً، ثم مطابقة profiles.department نصّاً (جسر توافق 0317).';

REVOKE ALL ON FUNCTION public.resolve_person_department(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_person_department(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_person_department(UUID) TO authenticated, service_role;

-- ═══ 3) توسيع is_in_my_team — تقرأ القسم من المصدرين ════════════════════
-- التوسيع لا التضييق: كل من كان يمرّ يبقى يمرّ، ويُضاف من كان يُحجب خطأً.
CREATE OR REPLACE FUNCTION public.is_in_my_team(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := auth.uid();
  v_tenant UUID := public.current_user_tenant_id();
  v_target UUID;
  v_dept   UUID;
  v_depth  INT := 0;
BEGIN
  IF v_me IS NULL OR v_tenant IS NULL OR p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- ★ تطبيع المُدخَل: قد يصل employees.id بدل profiles.id (0317)
  v_target := public.resolve_person_user_id(p_user_id);
  IF v_target IS NULL THEN RETURN FALSE; END IF;

  IF v_target = v_me THEN RETURN TRUE; END IF;

  -- (ج) نطاق المستأجر: إسناد وحدة بنطاق tenant يغطي كل الموظفين
  IF EXISTS (
    SELECT 1 FROM public.portal_unit_assignments a
     WHERE a.tenant_id = v_tenant AND a.user_id = v_me
       AND a.is_active AND a.scope_type = 'tenant'
  ) AND EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = v_target AND p.tenant_id = v_tenant
  ) THEN
    RETURN TRUE;
  END IF;

  -- (أ) رئاسة مباشرة
  IF EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = v_target AND p.tenant_id = v_tenant
       AND (p.manager_id = v_me OR p.supervisor_id = v_me)
  ) THEN
    RETURN TRUE;
  END IF;

  -- (ب) نطاق القسم — مع وراثة عبر شجرة الأقسام.
  --     ★ القسم يُحلّ الآن عبر resolve_person_department فيغطي:
  --       employees.department_id · و profiles.department نصّاً
  v_dept := public.resolve_person_department(v_target);

  WHILE v_dept IS NOT NULL AND v_depth < 10 LOOP
    IF EXISTS (
      SELECT 1 FROM public.portal_unit_assignments a
       WHERE a.tenant_id = v_tenant AND a.user_id = v_me
         AND a.is_active AND a.scope_type = 'department'
         AND a.scope_id = v_dept
    ) THEN
      RETURN TRUE;
    END IF;

    -- مدير القسم عبر الأعمدة القديمة أو org_role_assignments
    IF EXISTS (
      SELECT 1 FROM public.departments d
       WHERE d.id = v_dept AND d.tenant_id = v_tenant
         AND (d.manager_id = v_me OR d.supervisor_id = v_me
              OR d.direct_manager_id = v_me)
    ) OR EXISTS (
      SELECT 1 FROM public.org_role_assignments o
       WHERE o.tenant_id = v_tenant AND o.department_id = v_dept
         AND o.user_id = v_me AND o.is_active
    ) THEN
      RETURN TRUE;
    END IF;

    SELECT d.parent_department_id INTO v_dept
      FROM public.departments d WHERE d.id = v_dept;
    v_depth := v_depth + 1;
  END LOOP;

  -- (د) نطاق الفرع
  IF EXISTS (
    SELECT 1
      FROM public.portal_unit_assignments a
      JOIN public.profiles p ON p.id = v_target
     WHERE a.tenant_id = v_tenant AND a.user_id = v_me
       AND a.is_active AND a.scope_type = 'branch'
       AND a.scope_id = (p.custom_permissions->>'branch_id')::UUID
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END $$;

COMMENT ON FUNCTION public.is_in_my_team(UUID) IS
  'هل هذا الشخص ضمن فريقي؟ يقبل profiles.id أو employees.id (0317). القسم من employees أو profiles.department.';

-- ═══ 4) تصحيح العرض: requester_id يجب أن يكون profiles.id دائماً ════════
-- الفرعان المتأثران: hr (employee_id) و movement (permits.employee_id).
-- البقية تستعمل profiles.id أصلاً، والتطبيع لا يضرّها.
DROP VIEW IF EXISTS public.unified_approvals CASCADE;

CREATE VIEW public.unified_approvals AS
  -- ① الموارد البشرية — إجازة · إذن (زمنية)
  SELECT 'hr'::TEXT AS source_module, r.id AS source_id, r.tenant_id,
         r.request_type,
         CASE r.request_type WHEN 'leave' THEN 'طلب إجازة'::TEXT
                             ELSE 'طلب إذن'::TEXT END AS title,
         -- ★ 0317: كان r.employee_id (وهو employees.id) فلا تطابقه is_in_my_team
         public.resolve_person_user_id(r.employee_id) AS requester_id,
         r.department_id, NULL::NUMERIC AS amount, r.status, r.related_id,
         r.created_at, 'hr'::TEXT AS unit_key
    FROM public.hr_approval_requests r
   WHERE r.status = 'pending'

  UNION ALL
  SELECT 'procurement'::TEXT, r.id, r.tenant_id, r.request_type,
         'طلب شراء'::TEXT, r.requester_id, r.department_id,
         r.total_amount, r.status, r.related_id, r.created_at, 'procurement'::TEXT
    FROM public.procurement_approval_requests r
   WHERE r.status = 'pending'

  UNION ALL
  SELECT 'finance'::TEXT, r.id, r.tenant_id, r.request_type::TEXT,
         CASE r.request_type
           WHEN 'journal_entry' THEN 'قيد محاسبي'::TEXT
           WHEN 'invoice'       THEN 'فاتورة'::TEXT
           WHEN 'expense'       THEN 'مصروف'::TEXT
           WHEN 'budget'        THEN 'موازنة'::TEXT
           ELSE 'إقرار ضريبي'::TEXT END,
         r.requested_by, NULL::UUID, NULL::NUMERIC,
         r.status::TEXT, r.reference_id, r.created_at, 'finance'::TEXT
    FROM public.financial_approval_requests r
   WHERE r.status::TEXT = 'pending'

  UNION ALL
  SELECT 'contracts'::TEXT, r.id, r.tenant_id, 'contract'::TEXT,
         'اعتماد عقد'::TEXT, r.requested_by, NULL::UUID, NULL::NUMERIC,
         r.status, r.contract_id, r.created_at, 'contracts'::TEXT
    FROM public.contract_approval_requests r
   WHERE r.status = 'pending'

  UNION ALL
  -- ② الحركة — تصريح خروج
  SELECT 'movement'::TEXT, a.id, a.tenant_id, 'movement_permit'::TEXT,
         'تصريح خروج'::TEXT,
         -- ★ 0317: permits.employee_id يشير إلى profiles في هذا الجدول،
         --   لكن التطبيع يجعله صامداً لو تغيّر لاحقاً.
         public.resolve_person_user_id(
           (SELECT p.employee_id FROM public.employee_movement_permits p
             WHERE p.id = a.permit_id)) ,
         NULL::UUID, NULL::NUMERIC, a.decision, a.permit_id, a.created_at,
         'movement'::TEXT
    FROM public.employee_movement_approvals a
   WHERE a.decision = 'pending'

  UNION ALL
  SELECT 'inventory'::TEXT, a.id, a.tenant_id, 'stock_adjustment'::TEXT,
         'اعتماد تسوية مخزون'::TEXT, a.approver_id, NULL::UUID, NULL::NUMERIC,
         a.decision, a.variance_id, a.created_at, 'inventory'::TEXT
    FROM public.inventory_adjustment_approvals a
   WHERE a.decision = 'pending'

  UNION ALL
  SELECT 'mrp'::TEXT, a.id, a.tenant_id, 'bom_version'::TEXT,
         'اعتماد قائمة مواد'::TEXT, a.approver_id, NULL::UUID, NULL::NUMERIC,
         a.decision, a.bom_version_id, a.created_at, 'mrp'::TEXT
    FROM public.mrp_bom_approvals a
   WHERE a.decision = 'pending'

  UNION ALL
  SELECT 'crm'::TEXT, a.id, a.tenant_id, 'discount'::TEXT,
         'اعتماد خصم'::TEXT, a.requested_by, NULL::UUID, a.deal_value,
         a.status, a.quote_id, a.created_at, 'crm'::TEXT
    FROM public.crm_discount_approvals a
   WHERE a.status = 'pending'

  UNION ALL
  -- ③ البلاغات والطلبات العامة
  SELECT 'general'::TEXT, r.id, r.tenant_id, r.request_type::TEXT,
         r.title::TEXT,
         public.resolve_person_user_id(r.requester_id),
         NULL::UUID, NULL::NUMERIC, r.status::TEXT, r.related_id,
         r.created_at, 'hr'::TEXT
    FROM public.approval_requests r
   WHERE r.status::TEXT = 'pending';

COMMENT ON VIEW public.unified_approvals IS
  'الطلبات المعلّقة من تسع بوابات. requester_id مُطبَّع إلى profiles.id دائماً (0317).';

GRANT SELECT ON public.unified_approvals TO authenticated, service_role;

-- ═══ 4.5) تنظيف مرجعي: حذف القسم لا يجب أن يُعطّله مرجع موظف ════════════
--
-- ★ انحدار كشفه تشغيل الاختبارات السلوكية بعد 0317:
--   محفّز tg_ensure_employee_row (القسم ٥) يُنشئ صف employees لكل مستخدم
--   ويربطه بقسمه. لكن employees_department_id_fkey كان بلا ON DELETE،
--   أي RESTRICT ضمناً. فصار حذف أي قسم يفشل بـ:
--       ERROR: update or delete on table "departments" violates foreign key
--              constraint "employees_department_id_fkey"
--   وسقطت ثمانية ملفات اختبار كانت ناجحة — كلها تحذف أقساماً في تنظيفها.
--
--   الأثر في الإنتاج أخطر: أرشفة قسم أو حذفه تصير مستحيلة بلا نقل
--   كل موظفيه يدوياً أولاً.
--
--   الحل: ON DELETE SET NULL — الموظف يبقى، وقسمه يصير NULL فيظهر
--   «بلا قسم» بدل أن يُحذف معه. هذا يطابق سياسة المشروع: لا فقدان بيانات.
DO $$
DECLARE v_del TEXT;
BEGIN
  SELECT confdeltype INTO v_del
    FROM pg_constraint
   WHERE conname = 'employees_department_id_fkey'
     AND conrelid = 'public.employees'::regclass;

  -- 'a' = NO ACTION (الافتراضي) · 'n' = SET NULL
  IF v_del IS NOT NULL AND v_del <> 'n' THEN
    ALTER TABLE public.employees DROP CONSTRAINT employees_department_id_fkey;
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_department_id_fkey
      FOREIGN KEY (department_id) REFERENCES public.departments(id)
      ON DELETE SET NULL;
    RAISE NOTICE '0317: employees_department_id_fkey ⇒ ON DELETE SET NULL';
  END IF;
END $$;

-- ═══ 5) ضمان صف employees لكل مستخدم ════════════════════════════════════
-- السبب: بلا صف employees لا يظهر المستخدم في عدّ الهيكل التنظيمي،
-- ولا يعمل معه نطاق القسم. الشاشة تُنشئه عند الإضافة لا عند التعديل.
CREATE OR REPLACE FUNCTION public.tg_ensure_employee_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dept UUID;
  v_code TEXT;
BEGIN
  IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;

  -- أدوار المنصة لا تُعدّ موظفين
  IF NEW.role IN ('developer','it_admin') THEN RETURN NEW; END IF;

  v_dept := public.resolve_person_department(NEW.id);

  IF EXISTS (SELECT 1 FROM public.employees e WHERE e.user_id = NEW.id) THEN
    -- مزامنة القسم فقط إن كان الصف موجوداً وقسمه فارغاً أو تغيّر النصّ
    UPDATE public.employees e
       SET department_id = COALESCE(v_dept, e.department_id)
     WHERE e.user_id = NEW.id
       AND v_dept IS NOT NULL
       AND e.department_id IS DISTINCT FROM v_dept;
    RETURN NEW;
  END IF;

  -- رمز موظف فريد بلا تصادم
  v_code := 'EMP-' || substr(replace(NEW.id::TEXT,'-',''), 1, 8);

  INSERT INTO public.employees
    (tenant_id, user_id, department_id, employee_code, first_name, last_name)
  VALUES
    (NEW.tenant_id, NEW.id, v_dept, v_code,
     COALESCE(split_part(btrim(NEW.full_name), ' ', 1), 'موظف'),
     COALESCE(NULLIF(btrim(substr(btrim(NEW.full_name),
        length(split_part(btrim(NEW.full_name),' ',1)) + 1)), ''), '—'))
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_ensure_employee_row() IS
  'يضمن صف employees لكل مستخدم ويزامن قسمه. بدونه لا يظهر في الهيكل التنظيمي (0317).';

DROP TRIGGER IF EXISTS trg_ensure_employee_row ON public.profiles;
CREATE TRIGGER trg_ensure_employee_row
  AFTER INSERT OR UPDATE OF department, tenant_id, full_name ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_ensure_employee_row();

-- ═══ 6) ترحيل أثري: كل من ليس له صف employees ═══════════════════════════
DO $$
DECLARE v_n INT := 0;
BEGIN
  INSERT INTO public.employees
    (tenant_id, user_id, department_id, employee_code, first_name, last_name)
  SELECT p.tenant_id, p.id,
         public.resolve_person_department(p.id),
         'EMP-' || substr(replace(p.id::TEXT,'-',''), 1, 8),
         COALESCE(NULLIF(split_part(btrim(p.full_name),' ',1),''), 'موظف'),
         COALESCE(NULLIF(btrim(substr(btrim(p.full_name),
            length(split_part(btrim(p.full_name),' ',1)) + 1)), ''), '—')
    FROM public.profiles p
   WHERE p.tenant_id IS NOT NULL
     AND p.role NOT IN ('developer','it_admin')
     AND NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.user_id = p.id)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE '0317: أُنشئ % صف employees ناقصاً', v_n;
END $$;

-- ترحيل الأقسام الناقصة لمن له صف بلا قسم
DO $$
DECLARE v_n INT := 0;
BEGIN
  UPDATE public.employees e
     SET department_id = public.resolve_person_department(e.user_id)
   WHERE e.department_id IS NULL
     AND e.user_id IS NOT NULL
     AND public.resolve_person_department(e.user_id) IS NOT NULL;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE '0317: رُبِط % موظف بقسمه من profiles.department', v_n;
END $$;

-- ═══ 7) حرّاس التحقق ════════════════════════════════════════════════════
DO $$
DECLARE
  v_cnt  INT;
  v_t    UUID := gen_random_uuid();
  v_d    UUID := gen_random_uuid();
  v_mgr  UUID := gen_random_uuid();
  v_emp  UUID := gen_random_uuid();
  v_eid  UUID;
  v_lv   UUID := gen_random_uuid();
BEGIN
  FOR v_cnt IN
    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('resolve_person_user_id','resolve_person_department')
  LOOP
    ASSERT v_cnt = 2, format('0317 failed: helper functions = %s', v_cnt);
  END LOOP;

  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='trg_ensure_employee_row'
       AND tgrelid='public.profiles'::regclass AND NOT tgisinternal
  ), '0317 failed: trigger missing';

  -- ★ اختبار سلوكي كامل: البلاغان معاً
  INSERT INTO public.tenants(id,name,name_ar,slug)
    VALUES (v_t,'G317','حارس','g317-'||substr(v_t::text,1,8));
  INSERT INTO public.departments(id,tenant_id,name_ar) VALUES (v_d,v_t,'العمليات');
  INSERT INTO auth.users(id,email) VALUES
    (v_mgr,'m317-'||substr(v_mgr::text,1,8)||'@t.io'),
    (v_emp,'e317-'||substr(v_emp::text,1,8)||'@t.io');
  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_mgr,v_t,'مدير الحارس','manager');

  -- البلاغ ①: نكتب النصّ فقط كما تفعل شاشة التعديل
  INSERT INTO public.profiles(id,tenant_id,full_name,role,department)
    VALUES (v_emp,v_t,'موظف منقول','employee','العمليات');

  SELECT count(*) INTO v_cnt FROM public.employees e
   WHERE e.department_id = v_d AND e.tenant_id = v_t;
  ASSERT v_cnt = 1,
    format('0317 failed: عدّ الهيكل = %s (البلاغ الأول لم يُصلَح)', v_cnt);

  -- البلاغ ②: طلب إجازة يصل صندوق المدير
  --
  -- ★ ملاحظة مُكتشَفة بالتشغيل: create_hr_approval (من 0153) تبني مراحلها
  --   من resolve_department_chain(department_id) — أي من أعمدة departments
  --   الثلاثة. وإن كانت كلها فارغة تعتمد الطلب **تلقائياً**:
  --       "لا معتمِدين → اعتماد تلقائي"  ⇒  status='approved'
  --   فيختفي من unified_approvals (تعرض pending فقط).
  --
  --   لذلك نُسنِد مدير القسم أيضاً — وهذا هو الإعداد الصحيح واقعياً:
  --   وحدة البوابة تحدّد «أي مجال يُشرف عليه»، وسلسلة القسم تحدّد
  --   «من يعتمد». الاثنان مطلوبان معاً.
  UPDATE public.departments SET manager_id = v_mgr WHERE id = v_d;

  INSERT INTO public.portal_unit_assignments
    (tenant_id,user_id,base_role,unit_key,scope_type,scope_id)
    VALUES (v_t,v_mgr,'manager','hr','department',v_d);

  SELECT e.id INTO v_eid FROM public.employees e WHERE e.user_id = v_emp;
  INSERT INTO public.leaves(id,tenant_id,employee_id,leave_type,date_from,date_to,status)
    VALUES (v_lv,v_t,v_eid,'annual','2026-09-01','2026-09-03','pending');
  PERFORM set_config('request.jwt.claim.sub', v_emp::TEXT, TRUE);
  PERFORM public.create_hr_approval('leave', v_lv, v_eid);

  PERFORM set_config('request.jwt.claim.sub', v_mgr::TEXT, TRUE);
  SELECT count(*) INTO v_cnt FROM public.my_approval_inbox('hr');
  ASSERT v_cnt = 1,
    format('0317 failed: صندوق المدير = %s (البلاغ الثاني لم يُصلَح)', v_cnt);

  -- التطبيع يعمل بالاتجاهين
  ASSERT public.resolve_person_user_id(v_emp) = v_emp,
    '0317 failed: profiles.id لم يُعَد كما هو';
  ASSERT public.resolve_person_user_id(v_eid) = v_emp,
    '0317 failed: employees.id لم يُترجَم';

  -- تنظيف
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  DELETE FROM public.hr_approval_requests    WHERE tenant_id = v_t;
  DELETE FROM public.leaves                  WHERE tenant_id = v_t;
  DELETE FROM public.portal_unit_assignments WHERE tenant_id = v_t;
  DELETE FROM public.employees               WHERE tenant_id = v_t;
  DELETE FROM public.profiles                WHERE id IN (v_mgr,v_emp);
  DELETE FROM auth.users                     WHERE id IN (v_mgr,v_emp);
  DELETE FROM public.departments             WHERE id = v_d;
  DELETE FROM public.tenants                 WHERE id = v_t;

  RAISE NOTICE '✅ 0317: عضوية القسم تظهر في الهيكل · وطلبات HR تصل صندوق المدير';
END $$;
