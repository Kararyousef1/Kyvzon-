-- ============================================================================
-- 0340_permission_request_integrity.sql
--
-- نزاهة طلبات الزمنيات: القرار · الأثر · الاسم · منطق الأوقات.
-- امتداد 0339 إلى `permissions_request` و`permissions`.
--
-- ══ الأعطال المُثبَتة تشغيلياً في هذه الجولة ═══════════════════════════
--   قاعدة Postgres 17 مبنيّة من الصفر بـ268 مايجريشن، وجلسات RLS حقيقية
--   (SET ROLE authenticated). كل رقم أدناه من تشغيل فعلي.
--
--  ① ★★★ زرّ «موافقة» في PermissionsPage يفشل في **كل** الحالات المشروعة.
--     `PermissionsPage.tsx:200` — `approveRequest(id, employeeId || user?.id || '')`
--     و`employeeId` مضبوط من `employees[0].id` (السطر 107).
--     القياس بثلاث حالات بجلسة RLS بدور hr:
--
--       أ) للمُعتمِد سجلّ موظف + للطلب سلسلة
--          ⇒ APPROVAL_CHAIN_BYPASS  ·  status يبقى 'انتظار'
--       ب) لا سجلّ موظف (يسقط إلى user.id) + سلسلة
--          ⇒ APPROVAL_CHAIN_BYPASS  ·  status يبقى 'انتظار'
--       ج) بلا سلسلة اعتماد أصلاً
--          ⇒ نجح — لكنه اعتماد بلا أي رقابة
--
--     ولعزل الـFK عن الحارس (BEFORE trigger يسبق فحص FK):
--       بلا سلسلة + approved_by = employees.id
--       ⇒ insert or update on table "permissions_request" violates foreign
--         key constraint "permissions_request_approved_by_fkey"
--
--     أي أن الزرّ يفشل بعطلين متراكبين: FK خاطئ **و** تجاوز السلسلة.
--     ⇒ نفس عطل ① في 0339 لكن على الزمنيات. الجولة السابقة أصلحت
--        `LeaveRequestPage` ولم تلمس `PermissionsPage`.
--
--  ② ★★★ فرعان ميّتان في PermissionsPage.
--     `PermissionsPage.tsx:94` يفحص:
--        p.startsWith('/app/hr/')  →  'hr'
--        p.startsWith('/app/manager/')  →  'manager'
--     فحص آلي لكتل AppRouter: PermissionsPage مسجَّلة في موضعين فقط:
--        /app/employee/permissions          ⇒ viewMode = 'employee'
--        /app/admin/permissions-management  ⇒ viewMode = 'hr'
--     لا `/app/hr/...` ولا `/app/manager/...`. فرعان لم يُنفَّذا قط.
--     ⇒ نفس عطل ③ في 0339.
--
--  ③ ★★ اكتمال السلسلة يترك الطلب ناقصاً.
--     مُقاس: زمنية اعتُمدت بمسارها الصحيح (decide_hr_approval_step)
--        permissions_request.status = 'موافق'   ✅
--        approved_by                = NULL      ★ لا يُملأ
--        reviewed_at                = NULL      ★ لا يُملأ
--     `sync_hr_source_status` (0323) تكتب `status` وحده.
--     الأثر: لا أثر تدقيقي لمن اعتمد الزمنية ولا متى.
--
--  ④ ★★ الزمنية المعتمَدة لا تُنفَّذ إطلاقاً.
--     جدولان منفصلان: `permissions_request` (الطلب) و`permissions` (المنفَّذ
--     بحقلَي actual_out_time/actual_return_time). مُقاس بعد اعتماد كامل:
--        permissions_request = 4 صفوف
--        permissions         = 0 صفّاً   ★ فارغ دائماً
--     لا كود ولا محفّز ينقل بينهما. `permissionService` (جدول `permissions`)
--     لا تستدعيها **أي صفحة** — مُحقَّق بالبحث في src كلّه.
--
--  ⑤ ★ الاسم مخزَّن نصّاً حرّاً لا مرجعاً.
--     `employee_name` و`employee_department` عمودان نصّيان يُملآن من
--     `user.full_name` وقت الطلب. مُقاس:
--        تغيير profiles.full_name إلى 'الاسم الجديد'
--        ⇒ الطلب ما زال يعرض 'الموظف'
--     ⇒ نفس نمط عطل 0338 (البيانات المكرّرة تتباعد عن مصدرها).
--
--  ⑥ ★ لا تحقق من منطق الأوقات ولا النوع. مُقاس — كلها قُبِلت:
--        خروج 16:00 وعودة 09:00        (عودة قبل الخروج)
--        تاريخ = current_date - 500     (ماضٍ بعيد)
--        permission_type = 'نوع_مخترع'  (بلا CHECK)
--
-- ══ ما كان سليماً — نوثّقه لئلا يُعاد إصلاحه ═════════════════════════
--   • سقف 0339 اليومي يعمل (الخامسة رُفضت بـPERMISSION_DAILY_CAP).
--   • سياسة المعتمِد من 0339 تعمل: المشرف والمدير يريان الطلب (1 لكلٍّ).
--   • حارس 0324 يصدّ الاعتماد المباشر متى وُجدت سلسلة.
--
-- ══ المبدأ ══════════════════════════════════════════════════════════════
--   الطلب يمرّ ببوّابة واحدة، والقرار عبر السلسلة وحدها، وأثر القرار
--   يُكتب في القاعدة لا في المتصفح — بما فيه تنفيذ الزمنية المعتمَدة.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- ① قيد نوع الزمنية (كان نصّاً حرّاً — عطل ⑥)
--
--    القيم الأربع من `PermissionType` في src/utils/shiftUtils.ts.
--    نُطبّع قبل القيد لأن قواعد التطوير قد تحمل قيماً لا نعرفها.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_n INT;
BEGIN
  UPDATE public.permissions_request SET permission_type = 'عادية'
   WHERE permission_type NOT IN ('عادية','مغادرة','تعويضية','بدون_راتب');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    RAISE NOTICE '0340: طُبِّع % نوع زمنية خارج القيم الأربعة إلى ''عادية''', v_n;
  END IF;

  UPDATE public.permissions SET permission_type = 'عادية'
   WHERE permission_type NOT IN ('عادية','مغادرة','تعويضية','بدون_راتب');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    RAISE NOTICE '0340: طُبِّع % نوع في permissions', v_n;
  END IF;

  -- عودة قبل الخروج — نُفرغ العودة بدل رفض الصفّ (لا نُتلف بيانات)
  UPDATE public.permissions_request SET expected_return_time = NULL
   WHERE expected_return_time IS NOT NULL
     AND expected_return_time <= expected_out_time;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    RAISE NOTICE '0340: أُفرِغ وقت العودة في % طلباً كانت عودته قبل خروجه', v_n;
  END IF;
END $$;

ALTER TABLE public.permissions_request
  DROP CONSTRAINT IF EXISTS permissions_request_type_check;
ALTER TABLE public.permissions_request ADD CONSTRAINT permissions_request_type_check
  CHECK (permission_type IN ('عادية','مغادرة','تعويضية','بدون_راتب'));

ALTER TABLE public.permissions_request
  DROP CONSTRAINT IF EXISTS permissions_request_time_order_check;
ALTER TABLE public.permissions_request ADD CONSTRAINT permissions_request_time_order_check
  CHECK (expected_return_time IS NULL OR expected_return_time > expected_out_time);

COMMENT ON CONSTRAINT permissions_request_type_check ON public.permissions_request IS
  'قبل 0340 كان permission_type نصّاً حرّاً: ''نوع_مخترع'' كان يُقبَل ويسقط '
  'من كل خرائط الألوان والتسميات في الواجهة (عطل ⑥).';

COMMENT ON CONSTRAINT permissions_request_time_order_check ON public.permissions_request IS
  'قبل 0340: خروج 16:00 وعودة 09:00 كان يُقبَل (عطل ⑥).';

ALTER TABLE public.permissions
  DROP CONSTRAINT IF EXISTS permissions_type_check;
ALTER TABLE public.permissions ADD CONSTRAINT permissions_type_check
  CHECK (permission_type IN ('عادية','مغادرة','تعويضية','بدون_راتب'));

ALTER TABLE public.permissions
  DROP CONSTRAINT IF EXISTS permissions_status_check;
ALTER TABLE public.permissions ADD CONSTRAINT permissions_status_check
  CHECK (status IN ('انتظار','موافق','مرفوض','ملغى'));

-- ─────────────────────────────────────────────────────────────────────────
-- ② بوّابة طلب الزمنية — دالة واحدة ذرّية
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.submit_permission_request(TEXT, DATE, TIME, TIME, TEXT);

CREATE FUNCTION public.submit_permission_request(
  p_permission_type TEXT,
  p_date            DATE,
  p_out_time        TIME,
  p_return_time     TIME DEFAULT NULL,
  p_reason          TEXT DEFAULT NULL
) RETURNS TABLE (
  out_permission_id UUID,
  out_request_id    UUID
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_emp    UUID := public.current_user_employee_id();
  v_name   TEXT;
  v_dept   TEXT;
  v_ret    TIME;
  v_id     UUID;
  v_req    UUID;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'PERM_NO_TENANT: لا سياق شركة' USING ERRCODE = 'check_violation';
  END IF;

  -- ★ لا نثق بمعرّف من المتصفح — نشتقّه من الجلسة (عائلة عطل 0335)
  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'PERM_NO_EMPLOYEE: لا سجلّ موظف مرتبط بحسابك'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_permission_type NOT IN ('عادية','مغادرة','تعويضية','بدون_راتب') THEN
    RAISE EXCEPTION 'PERM_BAD_TYPE: نوع زمنية غير معروف: %', p_permission_type
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_date IS NULL OR p_out_time IS NULL THEN
    RAISE EXCEPTION 'PERM_BAD_INPUT: التاريخ ووقت الخروج مطلوبان'
      USING ERRCODE = 'check_violation';
  END IF;

  -- عطل ⑥: الماضي البعيد. أسبوع للخلف للتسوية بأثر رجعي.
  IF p_date < current_date - 7 THEN
    RAISE EXCEPTION 'PERM_TOO_OLD: لا يمكن طلب زمنية لتاريخ مضى عليه أكثر من أسبوع'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 'مغادرة' = خروج بلا رجوع ⇒ نتجاهل وقت العودة إن أُرسل
  v_ret := CASE WHEN p_permission_type = 'مغادرة' THEN NULL ELSE p_return_time END;

  IF v_ret IS NOT NULL AND v_ret <= p_out_time THEN
    RAISE EXCEPTION 'PERM_BAD_TIMES: وقت العودة يجب أن يكون بعد وقت الخروج'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ★ الاسم من مصدره لا من المتصفح (عطل ⑤).
  --   ★★★ profiles.full_name **أوّلاً** لا employees.first_name:
  --   محفّز trg_ensure_employee_row (0317) ينسخ الاسم إلى employees مرّة
  --   واحدة بـON CONFLICT DO NOTHING فلا يُحدَّث أبداً بعدها. مُقاس:
  --     profiles.full_name = 'الاسم الجديد'
  --     employees.first_name = 'الموظف'   ← متجمّد على القيمة القديمة
  --   لو قدّمنا employees لعاد العطل الذي نُصلحه (اسم لا يتبع مصدره).
  SELECT COALESCE(NULLIF(btrim(p.full_name), ''),
                  NULLIF(btrim(e.first_name || ' ' || e.last_name), '')),
         COALESCE(d.name_ar, p.department)
    INTO v_name, v_dept
    FROM public.employees e
    LEFT JOIN public.profiles    p ON p.id = e.user_id
    LEFT JOIN public.departments d ON d.id = e.department_id
   WHERE e.id = v_emp;

  INSERT INTO public.permissions_request (
    tenant_id, employee_id, employee_name, employee_department, date,
    permission_type, expected_out_time, expected_return_time, reason, status)
  VALUES (v_tenant, v_emp, v_name, v_dept, p_date,
          p_permission_type, p_out_time, v_ret,
          COALESCE(NULLIF(btrim(COALESCE(p_reason,'')), ''), 'بلا سبب مُدخَل'),
          'انتظار')
  RETURNING id INTO v_id;

  -- السلسلة في نفس المعاملة — فلا يبقى طلب بلا رقابة (الحالة ج في عطل ①)
  v_req := public.create_hr_approval('permission', v_id, v_emp);

  out_permission_id := v_id;
  out_request_id    := v_req;
  RETURN NEXT;
END $$;

COMMENT ON FUNCTION public.submit_permission_request(TEXT, DATE, TIME, TIME, TEXT) IS
  'بوّابة طلب الزمنية الوحيدة: النوع والأوقات والاسم والسلسلة ذرّياً. '
  'قبل 0340 كان المتصفح يُدرج مباشرةً ثم يُنشئ السلسلة في استدعاء ثانٍ — '
  'فشلُه يترك طلباً بلا رقابة يُعتمَد بلا سلسلة (الحالة ج في عطل ①).';

REVOKE ALL ON FUNCTION public.submit_permission_request(TEXT, DATE, TIME, TIME, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_permission_request(TEXT, DATE, TIME, TIME, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_permission_request(TEXT, DATE, TIME, TIME, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ③ إلغاء الزمنية — بديل الحذف
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.cancel_permission_request(UUID, TEXT);

CREATE FUNCTION public.cancel_permission_request(
  p_permission_id UUID,
  p_reason        TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_emp    UUID := public.current_user_employee_id();
  v_staff  BOOLEAN := public.current_user_is_staff();
  v_row    RECORD;
BEGIN
  SELECT * INTO v_row FROM public.permissions_request
   WHERE id = p_permission_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERM_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT v_staff AND v_row.employee_id IS DISTINCT FROM v_emp THEN
    RAISE EXCEPTION 'PERM_NOT_OWNER: لا تملك هذا الطلب'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_row.status = 'ملغى' THEN RETURN FALSE; END IF;

  IF NOT v_staff AND v_row.status <> 'انتظار' THEN
    RAISE EXCEPTION 'PERM_NOT_CANCELLABLE: لا يمكن إلغاء طلب حالته %', v_row.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- إغلاق السلسلة أولاً وإلا صدّ حارس 0324 تغييرَ الحالة
  PERFORM set_config('kyvzon.approval_sync', 'true', TRUE);

  UPDATE public.hr_approval_steps s
     SET status = 'skipped', decided_at = NOW()
    FROM public.hr_approval_requests r
   WHERE s.request_id = r.id
     AND r.related_id = p_permission_id
     AND r.tenant_id  = v_tenant
     AND r.request_type = 'permission'
     AND s.status IN ('pending','active');

  UPDATE public.hr_approval_requests
     SET status = 'rejected', updated_at = NOW()
   WHERE related_id = p_permission_id AND tenant_id = v_tenant
     AND request_type = 'permission' AND status = 'pending';

  UPDATE public.permissions_request
     SET status = 'ملغى',
         reviewed_at = NOW(),
         rejection_reason = CASE WHEN btrim(COALESCE(p_reason,'')) = ''
                                 THEN rejection_reason ELSE p_reason END
   WHERE id = p_permission_id AND tenant_id = v_tenant;

  -- الزمنية المنفَّذة (إن وُجدت) تُلغى معها
  UPDATE public.permissions SET status = 'ملغى'
   WHERE tenant_id = v_tenant
     AND employee_id = v_row.employee_id
     AND date = v_row.date
     AND expected_out_time = v_row.expected_out_time
     AND status <> 'ملغى';

  RETURN TRUE;
END $$;

COMMENT ON FUNCTION public.cancel_permission_request(UUID, TEXT) IS
  'إلغاء طلب زمنية مع إغلاق السلسلة وإلغاء التنفيذ. بديل الحذف النهائي.';

REVOKE ALL ON FUNCTION public.cancel_permission_request(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_permission_request(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_permission_request(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ④ ★★★ أثر القرار: approved_by · reviewed_at · تنفيذ الزمنية
--
--    نُعيد بناء `sync_hr_source_status` بثلاث إضافات لا رابع لها:
--      (أ) `approved_by` = المُعتمِد الأخير في السلسلة (profiles.id الصحيح).
--      (ب) `reviewed_at` = وقت القرار.
--      (ج) نقل الزمنية المعتمَدة إلى `permissions` — الجدول كان فارغاً دوماً.
--    بقية المنطق منقول حرفياً من 0324 — قُورن سطراً بسطر.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.sync_hr_source_status(UUID, TEXT);

CREATE FUNCTION public.sync_hr_source_status(
  p_request_id UUID,
  p_final      TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type     TEXT;
  v_related  UUID;
  v_tenant   UUID;
  v_label    TEXT;
  v_decider  UUID;
  v_n        INTEGER := 0;
  v_perm     RECORD;
BEGIN
  IF p_request_id IS NULL OR p_final NOT IN ('approved','rejected') THEN
    RETURN 0;
  END IF;

  SELECT r.request_type, r.related_id, r.tenant_id
    INTO v_type, v_related, v_tenant
    FROM public.hr_approval_requests r
   WHERE r.id = p_request_id;

  IF v_related IS NULL THEN RETURN 0; END IF;

  v_label := CASE WHEN p_final = 'approved' THEN 'موافق' ELSE 'مرفوض' END;

  -- ★ 0340: من اتّخذ القرار الأخير فعلاً — approver_id هو profiles.id
  --   (hr_approval_steps.approver_id يأتي من departments.manager_id
  --   الذي يشير إلى profiles — مُحقَّق من pg_constraint).
  SELECT s.approver_id INTO v_decider
    FROM public.hr_approval_steps s
   WHERE s.request_id = p_request_id
     AND s.status IN ('approved','rejected')
     AND s.decided_at IS NOT NULL
   ORDER BY s.decided_at DESC, s.step_order DESC
   LIMIT 1;

  -- ★ علَم المزامنة: يُخبر الحارس أن الكتابة قادمة من المحرّك.
  --   محلّي للمعاملة (is_local = TRUE) فلا يتسرّب لعمليات أخرى.
  PERFORM set_config('kyvzon.approval_sync', 'true', TRUE);

  IF v_type = 'leave' THEN
    UPDATE public.leaves
       SET status = v_label,
           approved_by = COALESCE(v_decider, approved_by)
     WHERE id = v_related AND tenant_id = v_tenant;
    GET DIAGNOSTICS v_n = ROW_COUNT;

  ELSIF v_type = 'permission' THEN
    UPDATE public.permissions_request
       SET status = v_label,
           approved_by = COALESCE(v_decider, approved_by),
           reviewed_at = NOW()
     WHERE id = v_related AND tenant_id = v_tenant;
    GET DIAGNOSTICS v_n = ROW_COUNT;

    -- ★★★ 0340: الزمنية المعتمَدة تُنفَّذ. قبله كان جدول `permissions`
    --   فارغاً دائماً مهما اعتُمد من طلبات (عطل ④).
    IF p_final = 'approved' THEN
      SELECT * INTO v_perm FROM public.permissions_request
       WHERE id = v_related AND tenant_id = v_tenant;

      IF FOUND AND NOT EXISTS (
        SELECT 1 FROM public.permissions x
         WHERE x.tenant_id = v_tenant
           AND x.employee_id = v_perm.employee_id
           AND x.date = v_perm.date
           AND x.expected_out_time = v_perm.expected_out_time)
      THEN
        INSERT INTO public.permissions (
          tenant_id, employee_id, date, permission_type,
          expected_out_time, expected_return_time, status, approved_by, reason)
        VALUES (v_tenant, v_perm.employee_id, v_perm.date, v_perm.permission_type,
                v_perm.expected_out_time, v_perm.expected_return_time,
                'موافق', v_decider, v_perm.reason);
      END IF;
    END IF;

  -- ★★★ تصحيح انحدار في 0340: النسخة الأولى من هذه الدالة نُقلت عن
  --   **0324** بدل 0325 — فسقط فرعا `expense` و`loan` صامتَين.
  --   مُقاس على قاعدة نظيفة بـ270 مايجريشن:
  --     verify-financial-approvals-0325 ⇒
  --       «6.2 ★ expense_requests.status = «pending» بعد الاعتماد»
  --   الفرعان منقولان حرفياً من 0325 وقُورنا سطراً بسطر.
  ELSIF v_type = 'expense' THEN
    -- ★ المفردات الإنجليزية بعد توحيد 0325/①
    UPDATE public.expense_requests
       SET status      = p_final,
           approved_at = CASE WHEN p_final = 'approved' THEN NOW() ELSE approved_at END,
           updated_at  = NOW()
     WHERE id = v_related AND tenant_id = v_tenant;
    GET DIAGNOSTICS v_n = ROW_COUNT;

  ELSIF v_type = 'loan' THEN
    -- ★ end_date و remaining_amount تُحسبان هنا (عطل ⑥ في 0325):
    --   الصفحة كانت تحسب end ثم تُهمله، وremaining يبقى 0 رغم المبلغ.
    UPDATE public.employee_loans
       SET status           = p_final,
           end_date         = CASE
                                WHEN p_final = 'approved'
                                THEN (start_date + (COALESCE(months_count,1) || ' months')::INTERVAL)::DATE
                                ELSE end_date END,
           remaining_amount = CASE
                                WHEN p_final = 'approved' THEN amount
                                ELSE remaining_amount END,
           updated_at       = NOW()
     WHERE id = v_related AND tenant_id = v_tenant;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;

  PERFORM set_config('kyvzon.approval_sync', 'false', TRUE);

  RETURN v_n;
END $$;

COMMENT ON FUNCTION public.sync_hr_source_status(UUID, TEXT) IS
  'يكتب نتيجة السلسلة في leaves/permissions_request مع رفع علَم '
  'kyvzon.approval_sync ليعبر حارس 0324. يغطّي أربعة مصادر: leaves و'
  'permissions_request (عربي) و expense_requests و employee_loans '
  '(إنجليزي). ★ 0340: يملأ approved_by و reviewed_at (كانا NULL بعد كل '
  'اعتماد) ويُنفّذ الزمنية المعتمَدة في جدول permissions (كان فارغاً '
  'دائماً — عطلا ③ و④).';

REVOKE ALL ON FUNCTION public.sync_hr_source_status(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_hr_source_status(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_hr_source_status(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑤ قراءة موحّدة للزمنيات — نظير leave_requests_view من 0339
--
--    الاسم يُحلّ من مصدره لا من العمود المخزَّن (عطل ⑤)، وصلاحية القرار
--    من السلسلة لا من مسار URL (عطل ②).
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.permission_requests_view(TEXT, TEXT, INTEGER, INTEGER);

CREATE FUNCTION public.permission_requests_view(
  p_scope  TEXT DEFAULT 'mine',
  p_status TEXT DEFAULT NULL,
  p_limit  INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
) RETURNS TABLE (
  out_id              UUID,
  out_employee_id     UUID,
  out_employee_name   TEXT,
  out_department      TEXT,
  out_permission_type TEXT,
  out_date            DATE,
  out_out_time        TIME,
  out_return_time     TIME,
  out_status          TEXT,
  out_reason          TEXT,
  out_rejection       TEXT,
  out_reviewed_at     TIMESTAMPTZ,
  out_created_at      TIMESTAMPTZ,
  out_can_decide      BOOLEAN,
  out_can_cancel      BOOLEAN,
  out_executed        BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER          -- ★ يحترم RLS جدول permissions_request عمداً
SET search_path = public
AS $$
DECLARE
  v_emp UUID := public.current_user_employee_id();
BEGIN
  RETURN QUERY
  SELECT pr.id,
         pr.employee_id,
         -- ★★★ الاسم من مصدره الحيّ: profiles.full_name أوّلاً.
         --   employees.first_name متجمّد منذ محفّز 0317 (ON CONFLICT DO
         --   NOTHING)، و pr.employee_name نصّ مخزَّن وقت الطلب. كلاهما
         --   يتباعد عن الحقيقة. الترتيب هنا مقصود ويحرسه التأكيد 8.4.
         COALESCE(NULLIF(btrim(p.full_name), ''),
                  NULLIF(btrim(e.first_name || ' ' || e.last_name), ''),
                  pr.employee_name, '—')                        AS employee_name,
         COALESCE(d.name_ar, pr.employee_department, '—')      AS department,
         pr.permission_type,
         pr.date,
         pr.expected_out_time,
         pr.expected_return_time,
         pr.status,
         pr.reason,
         pr.rejection_reason,
         pr.reviewed_at,
         pr.created_at,
         EXISTS (SELECT 1
                   FROM public.hr_approval_steps s
                   JOIN public.hr_approval_requests r ON r.id = s.request_id
                  WHERE r.related_id = pr.id
                    AND r.request_type = 'permission'
                    AND s.status = 'active'
                    AND s.approver_id = auth.uid())            AS can_decide,
         (pr.employee_id = v_emp AND pr.status = 'انتظار')     AS can_cancel,
         -- ★ هل نُفِّذت فعلاً في جدول permissions؟
         EXISTS (SELECT 1 FROM public.permissions x
                  WHERE x.tenant_id = pr.tenant_id
                    AND x.employee_id = pr.employee_id
                    AND x.date = pr.date
                    AND x.expected_out_time = pr.expected_out_time)
                                                               AS executed
    FROM public.permissions_request pr
    LEFT JOIN public.employees   e ON e.id = pr.employee_id
    LEFT JOIN public.profiles    p ON p.id = e.user_id
    LEFT JOIN public.departments d ON d.id = e.department_id
   WHERE (p_status IS NULL OR pr.status = p_status)
     AND (CASE
            WHEN p_scope = 'mine'  THEN pr.employee_id = v_emp
            WHEN p_scope = 'inbox' THEN EXISTS (
                 SELECT 1 FROM public.hr_approval_steps s
                   JOIN public.hr_approval_requests r ON r.id = s.request_id
                  WHERE r.related_id = pr.id
                    AND r.request_type = 'permission'
                    AND s.status = 'active'
                    AND s.approver_id = auth.uid())
            ELSE TRUE   -- 'all' — تبقى محكومة بـRLS
          END)
   ORDER BY pr.created_at DESC
   LIMIT GREATEST(COALESCE(p_limit, 100), 0)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END $$;

COMMENT ON FUNCTION public.permission_requests_view(TEXT, TEXT, INTEGER, INTEGER) IS
  'قراءة طلبات الزمنية مع الاسم من مصدره وصلاحية القرار من السلسلة. '
  'قبل 0340 كانت PermissionsPage تشتقّ الصلاحية من مسار URL عبر فرعين '
  'غير مسجَّلين في AppRouter، وتعرض اسماً نصّياً لا يتبع profiles.';

REVOKE ALL ON FUNCTION public.permission_requests_view(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.permission_requests_view(TEXT, TEXT, INTEGER, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.permission_requests_view(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑥ سياسة المعتمِد على `permissions` (الجدول المنفَّذ)
--
--    0339 غطّت permissions_request. الجدول المنفَّذ يحتاج نفس المنطق
--    وإلّا رأى الموظفُ زمنيته منفَّذةً ولم يرها من اعتمدها.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS kyvzon_permissions_select_approver ON public.permissions;
CREATE POLICY kyvzon_permissions_select_approver ON public.permissions
  FOR SELECT
  USING (
    tenant_id = public.current_user_tenant_id()
    AND approved_by = auth.uid()
  );

COMMENT ON POLICY kyvzon_permissions_select_approver ON public.permissions IS
  '0340: من اعتمد الزمنية يرى تنفيذها. الجدول كان فارغاً قبل 0340 فلم '
  'يظهر العطل.';

-- ─────────────────────────────────────────────────────────────────────────
-- ⑦ فهارس
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_permissions_exec_probe
  ON public.permissions (tenant_id, employee_id, date, expected_out_time);

CREATE INDEX IF NOT EXISTS idx_permissions_request_employee_date
  ON public.permissions_request (tenant_id, employee_id, date DESC);
