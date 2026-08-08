-- ============================================================================
-- اختبار سلوكي لترحيل البيانات (0292) والمزامنة الحيّة (0293)
--
-- المنهج: نزرع بيانات قديمة **واقعية** تشمل كل الحالات الحدّية التي
-- تُفشل الترحيل الساذج، ثم نُشغّل الترحيل ونتحقق من كل صف.
--
-- ملاحظة منهجية: المايجريشن 0292 نفسه يعمل على قاعدة فارغة وقت التطبيق،
-- فالتحقق الحقيقي يجري عبر migrate_pending_legacy_movements() التي تحمل
-- المنطق نفسه — وهي الدالة التي ستلتقط بيانات الإنتاج الفعلية.
-- ============================================================================
\set ON_ERROR_STOP on

DO $outer$
DECLARE
  v_tenant  UUID;  v_tenant2 UUID;
  v_emp1    UUID;  v_emp2 UUID;  v_gate UUID;
  v_p_ok    UUID;  v_p_nopurpose UUID;  v_p_used UUID;  v_p_cancel UUID;
  v_m_open  UUID;  v_m_returned UUID;  v_m_overdue UUID;  v_m_violation UUID;
  v_m_nodest UUID; v_m_noexpect UUID;  v_m_t2 UUID;
  v_r       RECORD;
  v_n       BIGINT;
  v_txt     TEXT;
  v_pass    INT := 0;
BEGIN
  -- ══════════════ تهيئة: مستأجران ══════════════
  INSERT INTO public.tenants(name_ar, slug) VALUES ('T-MIG-A','tmiga') RETURNING id INTO v_tenant;
  INSERT INTO public.tenants(name_ar, slug) VALUES ('T-MIG-B','tmigb') RETURNING id INTO v_tenant2;

  INSERT INTO auth.users(id,email) VALUES (gen_random_uuid(),'e1@mig.local') RETURNING id INTO v_emp1;
  INSERT INTO auth.users(id,email) VALUES (gen_random_uuid(),'e2@mig.local') RETURNING id INTO v_emp2;
  INSERT INTO auth.users(id,email) VALUES (gen_random_uuid(),'g@mig.local')  RETURNING id INTO v_gate;

  INSERT INTO public.profiles(id,tenant_id,full_name,role) VALUES
    (v_emp1, v_tenant,  'موظف أول',  'employee'),
    (v_emp2, v_tenant,  'موظف ثانٍ', 'employee'),
    (v_gate, v_tenant,  'حارس',      'gatekeeper');

  -- ══════════════ زرع بيانات قديمة تغطي الحالات الحدّية ══════════════

  -- تصريح سليم
  INSERT INTO public.movement_permits(tenant_id, employee_id, employee_name, department,
    destination, purpose, valid_from, valid_until, max_duration_minutes, status, created_by)
  VALUES (v_tenant, v_emp1, 'موظف أول', 'المالية', 'مصرف الرافدين', 'إيداع شيك',
          now() - interval '2 hours', now() + interval '2 hours', 60, 'approved', v_gate)
  RETURNING id INTO v_p_ok;

  -- تصريح بلا غرض (العمود NOT NULL في الجديد — يُفشل الترحيل الساذج)
  INSERT INTO public.movement_permits(tenant_id, employee_id, destination, purpose,
    valid_until, status)
  VALUES (v_tenant, v_emp2, '  مصرف   الرافدين  ', NULL,
          now() + interval '1 hour', 'approved')
  RETURNING id INTO v_p_nopurpose;

  -- تصريح مستخدَم
  INSERT INTO public.movement_permits(tenant_id, employee_id, destination, purpose,
    valid_until, status, used_at)
  VALUES (v_tenant, v_emp1, 'دائرة الضريبة', 'مراجعة', now() - interval '1 day',
          'used', now() - interval '25 hours')
  RETURNING id INTO v_p_used;

  -- تصريح ملغى + ملاحظات موجودة
  INSERT INTO public.movement_permits(tenant_id, employee_id, destination, purpose,
    valid_until, status, notes)
  VALUES (v_tenant, v_emp2, 'وزارة العمل', 'مقابلة', now() + interval '3 hours',
          'cancelled', 'أُلغي بطلب المدير')
  RETURNING id INTO v_p_cancel;

  -- حركة مفتوحة (لم يعد)
  INSERT INTO public.movements_log(tenant_id, employee_id, movement_type, departure_at,
    destination, purpose, expected_return_at, logged_by_id)
  VALUES (v_tenant, v_emp1, 'official', now() - interval '30 minutes',
          'مصرف الرافدين', 'إيداع', now() + interval '30 minutes', v_gate)
  RETURNING id INTO v_m_open;

  -- حركة مكتملة
  INSERT INTO public.movements_log(tenant_id, employee_id, departure_at, returned_at,
    destination, purpose, expected_return_at, return_notes, logged_by_id)
  VALUES (v_tenant, v_emp1, now() - interval '5 hours', now() - interval '4 hours',
          'دائرة الضريبة', 'مراجعة', now() - interval '4 hours',
          'عاد في الوقت المحدد', v_gate)
  RETURNING id INTO v_m_returned;

  -- حركة متأخرة (لم يعد وتجاوز الوقت)
  INSERT INTO public.movements_log(tenant_id, employee_id, departure_at,
    destination, expected_return_at)
  VALUES (v_tenant, v_emp2, now() - interval '6 hours', 'وزارة العمل',
          now() - interval '3 hours')
  RETURNING id INTO v_m_overdue;

  -- حركة بمخالفة مسار
  INSERT INTO public.movements_log(tenant_id, employee_id, departure_at, returned_at,
    destination, route_violation, actual_location)
  VALUES (v_tenant, v_emp2, now() - interval '8 hours', now() - interval '7 hours',
          'مصرف الرافدين', TRUE, 'موقع خارج المسار')
  RETURNING id INTO v_m_violation;

  -- ★ حركة بلا وجهة (NOT NULL في الجديد)
  INSERT INTO public.movements_log(tenant_id, employee_id, departure_at, destination)
  VALUES (v_tenant, v_emp1, now() - interval '10 hours', NULL)
  RETURNING id INTO v_m_nodest;

  -- ★ حركة بلا expected_return_at (NOT NULL في الجديد)
  INSERT INTO public.movements_log(tenant_id, employee_id, departure_at, returned_at,
    destination, expected_return_at)
  VALUES (v_tenant, v_emp1, now() - interval '12 hours', now() - interval '11 hours',
          'مكان ما', NULL)
  RETURNING id INTO v_m_noexpect;

  -- حركة في المستأجر الثاني (لاختبار العزل)
  INSERT INTO public.movements_log(tenant_id, employee_id, departure_at, destination)
  VALUES (v_tenant2, v_emp1, now() - interval '1 hour', 'وجهة المستأجر الثاني')
  RETURNING id INTO v_m_t2;

  -- ══════════════ الترحيل ══════════════
  /*
    ملاحظة منهجية مهمة:

    محفّزات 0293 نشطة، فكل INSERT أعلاه زُوِّد **لحظياً** إلى الجداول
    الجديدة. استدعاء migrate_pending_legacy_movements() هنا سيُرجع
    أصفاراً — وهذا هو السلوك الصحيح لا خطأً.

    لذا نتحقق من **النتيجة النهائية** (كل صف قديم له مقابل) بدل
    التحقق من عدد ما رحّلته الدالة. الدالة تبقى ضرورية لالتقاط أي
    صف كُتب قبل تفعيل المحفّزات، ونختبرها صراحةً في F25.
  */
  SELECT * INTO v_r FROM public.migrate_pending_legacy_movements();
  RAISE NOTICE '   الالتقاط اليدوي: % تصريحاً · % حركة · % موقعاً (صفر متوقَّع — المحفّزات سبقته)',
    v_r.permits_migrated, v_r.movements_migrated, v_r.locations_created;

  -- ═══════════════════════════════════════════════════════════
  --  المجموعة أ: مطابقة العدد — جوهر الأمان
  -- ═══════════════════════════════════════════════════════════

  -- 1) كل تصريح قديم له مقابل في الجديد
  SELECT count(*) INTO v_n FROM public.employee_movement_permits
   WHERE legacy_permit_id IS NOT NULL;
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'A1 FAILED: expected 4 permits mirrored, got %', v_n;
  END IF; v_pass := v_pass + 1;

  -- 2) كل حركة قديمة لها مقابل (7 = 6 في A + 1 في B)
  SELECT count(*) INTO v_n FROM public.employee_movements_log
   WHERE legacy_movement_id IS NOT NULL;
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'A2 FAILED: expected 7 movements mirrored, got %', v_n;
  END IF; v_pass := v_pass + 1;

  -- 3) العرض يؤكد صفر متبقٍّ
  SELECT sum(pending_rows) INTO v_n FROM public.movement_legacy_migration_status;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'A3 FAILED: % rows still pending', v_n;
  END IF; v_pass := v_pass + 1;

  -- 4) العدد القديم = العدد المُرحَّل في العرض
  FOR v_r IN SELECT * FROM public.movement_legacy_migration_status LOOP
    IF v_r.legacy_rows <> v_r.migrated_rows THEN
      RAISE EXCEPTION 'A4 FAILED: % legacy=% migrated=%',
        v_r.legacy_table, v_r.legacy_rows, v_r.migrated_rows;
    END IF;
  END LOOP; v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════
  --  المجموعة ب: الحالات الحدّية التي تُفشل الترحيل الساذج
  -- ═══════════════════════════════════════════════════════════

  -- 5) ★ التصريح بلا غرض حصل على نص بديل لا NULL
  SELECT purpose INTO v_txt FROM public.employee_movement_permits
   WHERE legacy_permit_id = v_p_nopurpose;
  IF v_txt IS NULL OR trim(v_txt) = '' THEN
    RAISE EXCEPTION 'B5 FAILED: NULL purpose survived migration';
  END IF; v_pass := v_pass + 1;

  -- 6) ★ الحركة بلا وجهة حصلت على اسم بديل
  SELECT destination_name INTO v_txt FROM public.employee_movements_log
   WHERE legacy_movement_id = v_m_nodest;
  IF v_txt IS NULL OR trim(v_txt) = '' THEN
    RAISE EXCEPTION 'B6 FAILED: NULL destination survived';
  END IF; v_pass := v_pass + 1;

  -- 7) ★ الحركة بلا expected_return_at اشتقّت قيمة من العودة الفعلية
  SELECT expected_return_at INTO v_r FROM public.employee_movements_log
   WHERE legacy_movement_id = v_m_noexpect;
  IF v_r.expected_return_at IS NULL THEN
    RAISE EXCEPTION 'B7 FAILED: NULL expected_return_at survived';
  END IF;
  -- يجب أن تساوي وقت العودة (السلّم: الأصل → العودة → +30د)
  IF v_r.expected_return_at <> (SELECT returned_at FROM public.movements_log
                                 WHERE id = v_m_noexpect) THEN
    RAISE EXCEPTION 'B7b FAILED: expected_return_at not derived from returned_at';
  END IF; v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════
  --  المجموعة ج: اشتقاق الحالة من الواقع
  -- ═══════════════════════════════════════════════════════════

  -- 8) حركة مفتوحة → out
  IF (SELECT status FROM public.employee_movements_log
       WHERE legacy_movement_id = v_m_open) <> 'out' THEN
    RAISE EXCEPTION 'C8 FAILED: open movement not "out"';
  END IF; v_pass := v_pass + 1;

  -- 9) حركة عادت → returned
  IF (SELECT status FROM public.employee_movements_log
       WHERE legacy_movement_id = v_m_returned) <> 'returned' THEN
    RAISE EXCEPTION 'C9 FAILED: returned movement not "returned"';
  END IF; v_pass := v_pass + 1;

  -- 10) حركة متأخرة → overdue
  IF (SELECT status FROM public.employee_movements_log
       WHERE legacy_movement_id = v_m_overdue) <> 'overdue' THEN
    RAISE EXCEPTION 'C10 FAILED: late movement not "overdue"';
  END IF; v_pass := v_pass + 1;

  -- 11) مخالفة مسار → violated (تسبق returned)
  IF (SELECT status FROM public.employee_movements_log
       WHERE legacy_movement_id = v_m_violation) <> 'violated' THEN
    RAISE EXCEPTION 'C11 FAILED: violation not "violated"';
  END IF; v_pass := v_pass + 1;

  -- 12) علم المخالفة محفوظ
  IF NOT (SELECT route_violation FROM public.employee_movements_log
           WHERE legacy_movement_id = v_m_violation) THEN
    RAISE EXCEPTION 'C12 FAILED: route_violation lost';
  END IF; v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════
  --  المجموعة د: لا فقدان بيانات
  -- ═══════════════════════════════════════════════════════════

  -- 13) ★ return_notes لم تُفقد — ضُمّت إلى notes
  SELECT notes INTO v_txt FROM public.employee_movements_log
   WHERE legacy_movement_id = v_m_returned;
  IF v_txt IS NULL OR v_txt NOT LIKE '%عاد في الوقت المحدد%' THEN
    RAISE EXCEPTION 'D13 FAILED: return_notes lost — got %', COALESCE(v_txt,'NULL');
  END IF; v_pass := v_pass + 1;

  -- 14) ★ movement_type القديم لم يُفقد
  SELECT notes INTO v_txt FROM public.employee_movements_log
   WHERE legacy_movement_id = v_m_open;
  IF v_txt IS NULL OR v_txt NOT LIKE '%official%' THEN
    RAISE EXCEPTION 'D14 FAILED: movement_type lost';
  END IF; v_pass := v_pass + 1;

  -- 15) ملاحظات التصريح الأصلية محفوظة
  SELECT notes INTO v_txt FROM public.employee_movement_permits
   WHERE legacy_permit_id = v_p_cancel;
  IF v_txt IS NULL OR v_txt NOT LIKE '%أُلغي بطلب المدير%' THEN
    RAISE EXCEPTION 'D15 FAILED: permit notes lost — got %', COALESCE(v_txt,'NULL');
  END IF; v_pass := v_pass + 1;

  /*
    16) كل سجل قادم من القديم يحمل وسم مصدره.
    وسمان مقبولان: [مُرحَّل] من الترحيل الدفعي (0292)،
    و[مُزامَن] من المحفّز الحيّ (0293). كلاهما يُثبت المصدر.
  */
  SELECT count(*) INTO v_n FROM public.employee_movements_log
   WHERE legacy_movement_id IS NOT NULL
     AND notes NOT LIKE '%movements_log]%';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'D16 FAILED: % rows lack a source tag', v_n;
  END IF; v_pass := v_pass + 1;

  -- 17) الطوابع الزمنية الأصلية محفوظة (لا now())
  IF (SELECT departure_at FROM public.employee_movements_log
       WHERE legacy_movement_id = v_m_returned)
     <> (SELECT departure_at FROM public.movements_log WHERE id = v_m_returned) THEN
    RAISE EXCEPTION 'D17 FAILED: departure_at altered';
  END IF; v_pass := v_pass + 1;

  -- 18) الحالات الأصلية للتصاريح محفوظة
  IF (SELECT status FROM public.employee_movement_permits
       WHERE legacy_permit_id = v_p_used) <> 'used' THEN
    RAISE EXCEPTION 'D18 FAILED: permit status altered';
  END IF; v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════
  --  المجموعة هـ: المواقع والتطبيع
  -- ═══════════════════════════════════════════════════════════

  -- 19) ★ الوجهة المكرَّرة بمسافات زائدة = موقع واحد لا اثنان
  --     'مصرف الرافدين' و '  مصرف   الرافدين  ' يجب أن تتوحّدا
  SELECT count(*) INTO v_n FROM public.movement_locations
   WHERE tenant_id = v_tenant AND lower(name_ar) = lower('مصرف الرافدين');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'E19 FAILED: whitespace variants created % locations', v_n;
  END IF; v_pass := v_pass + 1;

  -- 20) المواقع المُنشأة من الترحيل موسومة
  SELECT count(*) INTO v_n FROM public.movement_locations
   WHERE tenant_id = v_tenant AND code ~ '^LEG-[0-9]+$';
  IF v_n < 3 THEN
    RAISE EXCEPTION 'E20 FAILED: only % legacy locations created', v_n;
  END IF; v_pass := v_pass + 1;

  -- 21) نوعها client_site وبلا إحداثيات (لا تخمين)
  IF EXISTS (SELECT 1 FROM public.movement_locations
              WHERE code ~ '^LEG-[0-9]+$'
                AND (location_type <> 'client_site'
                     OR latitude IS NOT NULL OR longitude IS NOT NULL)) THEN
    RAISE EXCEPTION 'E21 FAILED: legacy location has wrong type or guessed coords';
  END IF; v_pass := v_pass + 1;

  -- 22) التصريح رُبط بموقعه المُنشأ
  IF (SELECT destination_id FROM public.employee_movement_permits
       WHERE legacy_permit_id = v_p_ok) IS NULL THEN
    RAISE EXCEPTION 'E22 FAILED: permit not linked to location';
  END IF; v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════
  --  المجموعة و: العزل وإعادة التشغيل
  -- ═══════════════════════════════════════════════════════════

  -- 23) ★ عزل المستأجرين: لا صف عبر الحدود
  SELECT count(*) INTO v_n
    FROM public.employee_movements_log e
    JOIN public.movements_log m ON m.id = e.legacy_movement_id
   WHERE m.tenant_id <> e.tenant_id;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'F23 FAILED: % rows crossed tenants', v_n;
  END IF; v_pass := v_pass + 1;

  -- 24) حركة المستأجر الثاني بقيت عنده
  IF (SELECT tenant_id FROM public.employee_movements_log
       WHERE legacy_movement_id = v_m_t2) <> v_tenant2 THEN
    RAISE EXCEPTION 'F24 FAILED: tenant B movement landed elsewhere';
  END IF; v_pass := v_pass + 1;

  -- 25) ★★ إعادة التشغيل لا تُنتج تكراراً
  SELECT * INTO v_r FROM public.migrate_pending_legacy_movements();
  IF v_r.permits_migrated <> 0 OR v_r.movements_migrated <> 0
     OR v_r.locations_created <> 0 THEN
    RAISE EXCEPTION 'F25 FAILED: rerun migrated %/%/% (must be 0/0/0)',
      v_r.permits_migrated, v_r.movements_migrated, v_r.locations_created;
  END IF; v_pass := v_pass + 1;

  -- 26) العدد الإجمالي لم يتغيّر بعد إعادة التشغيل
  SELECT count(*) INTO v_n FROM public.employee_movements_log
   WHERE legacy_movement_id IS NOT NULL;
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'F26 FAILED: rerun changed count to %', v_n;
  END IF; v_pass := v_pass + 1;

  -- 27) ★ صف جديد يُكتب في القديم بعد الترحيل → يُلتقط
  DECLARE v_late UUID;
  BEGIN
    INSERT INTO public.movements_log(tenant_id, employee_id, departure_at, destination)
    VALUES (v_tenant, v_emp1, now(), 'وجهة متأخرة')
    RETURNING id INTO v_late;

    /*
      مع محفّزات 0293 الصف يُزامَن لحظياً، فـ pending = 0 مباشرةً.
      نتحقق من ذلك، ثم نُثبت أن دالة الالتقاط تظل صالحة (لا تُكرّر).
    */
    SELECT sum(pending_rows) INTO v_n FROM public.movement_legacy_migration_status;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'F27 FAILED: live sync left % pending rows', v_n;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.employee_movements_log
                    WHERE legacy_movement_id = v_late) THEN
      RAISE EXCEPTION 'F27b FAILED: new legacy row not mirrored';
    END IF;

    SELECT * INTO v_r FROM public.migrate_pending_legacy_movements();
    IF v_r.movements_migrated <> 0 THEN
      RAISE EXCEPTION 'F27c FAILED: catch-up duplicated an already-synced row';
    END IF;
  END; v_pass := v_pass + 1;

  -- 28) لا ازدواج في المعرّفات القديمة
  SELECT count(*) INTO v_n FROM (
    SELECT legacy_movement_id FROM public.employee_movements_log
     WHERE legacy_movement_id IS NOT NULL
     GROUP BY legacy_movement_id HAVING count(*) > 1) x;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'F28 FAILED: % duplicated legacy ids', v_n;
  END IF; v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════
  --  المجموعة ز: السلامة والصلاحيات
  -- ═══════════════════════════════════════════════════════════

  -- 29) ★ الجداول القديمة لم تُمَس — لا حذف ولا إفراغ
  --     (8 = 7 مزروعة + 1 من اختبار F27)
  IF (SELECT count(*) FROM public.movements_log) < 8 THEN
    RAISE EXCEPTION 'G29 FAILED: rows disappeared from legacy movements_log';
  END IF;
  IF (SELECT count(*) FROM public.movement_permits) < 4 THEN
    RAISE EXCEPTION 'G29b FAILED: rows disappeared from legacy movement_permits';
  END IF;
  -- ولا صفَّ قديماً بلا مقابل
  IF EXISTS (SELECT 1 FROM public.movements_log m
              WHERE NOT EXISTS (SELECT 1 FROM public.employee_movements_log e
                                 WHERE e.legacy_movement_id = m.id)) THEN
    RAISE EXCEPTION 'G29c FAILED: a legacy movement has no counterpart';
  END IF; v_pass := v_pass + 1;

  -- 30) anon لا يقرأ حالة الترحيل ولا يُشغّل الدالة
  IF has_table_privilege('anon','public.movement_legacy_migration_status','SELECT') THEN
    RAISE EXCEPTION 'G30 FAILED: anon can read migration status';
  END IF;
  IF has_function_privilege('anon','public.migrate_pending_legacy_movements()','EXECUTE')
     OR has_function_privilege('authenticated','public.migrate_pending_legacy_movements()','EXECUTE') THEN
    RAISE EXCEPTION 'G30b FAILED: non-service_role can run migration';
  END IF; v_pass := v_pass + 1;

  -- 31) service_role يستطيع (وإلا فالالتقاط المجدول مستحيل)
  IF NOT has_function_privilege('service_role','public.migrate_pending_legacy_movements()','EXECUTE') THEN
    RAISE EXCEPTION 'G31 FAILED: service_role cannot run catch-up';
  END IF; v_pass := v_pass + 1;

  -- 32) كل الحالات المُرحَّلة ضمن CHECK الجديد
  IF EXISTS (SELECT 1 FROM public.employee_movements_log
              WHERE legacy_movement_id IS NOT NULL
                AND status NOT IN ('out','returned','overdue','violated')) THEN
    RAISE EXCEPTION 'G32 FAILED: invalid status after migration';
  END IF; v_pass := v_pass + 1;

  -- ═══════════════════════════════════════════════════════════
  --  المجموعة ح: 0293 — المزامنة الحيّة (لا انقسام بعد اليوم)
  -- ═══════════════════════════════════════════════════════════

  -- 33) ★★ إدراج في القديم يظهر في الجديد **فوراً** بلا استدعاء يدوي
  DECLARE v_live UUID; v_st TEXT; v_before BIGINT;
  BEGIN
    SELECT count(*) INTO v_before FROM public.employee_movements_log;

    INSERT INTO public.movements_log(tenant_id, employee_id, departure_at,
      destination, expected_return_at, movement_type)
    VALUES (v_tenant, v_emp1, now(), 'وجهة المزامنة الحيّة',
            now() + interval '45 minutes', 'personal')
    RETURNING id INTO v_live;

    IF NOT EXISTS (SELECT 1 FROM public.employee_movements_log
                    WHERE legacy_movement_id = v_live) THEN
      RAISE EXCEPTION 'H33 FAILED: live sync did not fire on INSERT';
    END IF;
    IF (SELECT count(*) FROM public.employee_movements_log) <> v_before + 1 THEN
      RAISE EXCEPTION 'H33b FAILED: sync inserted wrong number of rows';
    END IF;

    -- 34) الحالة مشتقّة صحيحة
    SELECT status INTO v_st FROM public.employee_movements_log
     WHERE legacy_movement_id = v_live;
    IF v_st <> 'out' THEN
      RAISE EXCEPTION 'H34 FAILED: synced status = % (expected out)', v_st;
    END IF;

    -- 35) ★ التحديث يُزامَن ولا يُنشئ صفاً ثانياً
    UPDATE public.movements_log
       SET returned_at = now(), return_notes = 'عاد بسلام', route_violation = TRUE
     WHERE id = v_live;

    SELECT status INTO v_st FROM public.employee_movements_log
     WHERE legacy_movement_id = v_live;
    IF v_st <> 'violated' THEN
      RAISE EXCEPTION 'H35 FAILED: UPDATE not synced (status=%)', v_st;
    END IF;
    IF (SELECT count(*) FROM public.employee_movements_log
         WHERE legacy_movement_id = v_live) <> 1 THEN
      RAISE EXCEPTION 'H35b FAILED: UPDATE created duplicate';
    END IF;

    -- 36) ملاحظة العودة ونوع الحركة محفوظان بعد المزامنة
    IF NOT EXISTS (SELECT 1 FROM public.employee_movements_log
                    WHERE legacy_movement_id = v_live
                      AND notes LIKE '%عاد بسلام%' AND notes LIKE '%personal%') THEN
      RAISE EXCEPTION 'H36 FAILED: data lost during live sync';
    END IF;
  END; v_pass := v_pass + 4;

  -- 37) ★ تصريح جديد في القديم يُزامَن ويحصل على موقع
  DECLARE v_lp UUID;
  BEGIN
    INSERT INTO public.movement_permits(tenant_id, employee_id, destination,
      purpose, valid_until, status)
    VALUES (v_tenant, v_emp2, 'وجهة تصريح حيّة', NULL,
            now() + interval '2 hours', 'approved')
    RETURNING id INTO v_lp;

    IF NOT EXISTS (SELECT 1 FROM public.employee_movement_permits
                    WHERE legacy_permit_id = v_lp) THEN
      RAISE EXCEPTION 'H37 FAILED: permit not live-synced';
    END IF;
    -- purpose الفارغ حصل على بديل
    IF EXISTS (SELECT 1 FROM public.employee_movement_permits
                WHERE legacy_permit_id = v_lp
                  AND (purpose IS NULL OR trim(purpose) = '')) THEN
      RAISE EXCEPTION 'H37b FAILED: NULL purpose survived live sync';
    END IF;
    -- وارتبط بموقع
    IF (SELECT destination_id FROM public.employee_movement_permits
         WHERE legacy_permit_id = v_lp) IS NULL THEN
      RAISE EXCEPTION 'H37c FAILED: live-synced permit has no location';
    END IF;
  END; v_pass := v_pass + 1;

  -- 38) ★★ العرض يبقى عند صفر متبقٍّ — الانقسام انتهى فعلاً
  SELECT sum(pending_rows) INTO v_n FROM public.movement_legacy_migration_status;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'H38 FAILED: % rows pending after live sync — split persists', v_n;
  END IF; v_pass := v_pass + 1;

  -- 39) دوال المزامنة محجوبة عن anon و authenticated
  IF has_function_privilege('anon','public.movement_resolve_legacy_location(uuid,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.movement_resolve_legacy_location(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'H39 FAILED: location resolver exposed';
  END IF; v_pass := v_pass + 1;

  -- 40) المحفّزان قائمان على الجدولين
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname='trg_sync_legacy_movement_log'
                    AND tgrelid='public.movements_log'::regclass)
     OR NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname='trg_sync_legacy_movement_permit'
                    AND tgrelid='public.movement_permits'::regclass) THEN
    RAISE EXCEPTION 'H40 FAILED: sync triggers missing';
  END IF; v_pass := v_pass + 1;

  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════';
  RAISE NOTICE '  ✅ 0292+0293: % / 40 اختباراً نجح', v_pass;
  RAISE NOTICE '════════════════════════════════════════════';
END $outer$;
