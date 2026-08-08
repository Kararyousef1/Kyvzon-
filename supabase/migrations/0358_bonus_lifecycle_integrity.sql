-- ════════════════════════════════════════════════════════════════════════
--  0358 — سلامة دورة حياة المكافآت
--  المرحلة 4 — بوابة الموارد البشرية · صفحة hr/BonusesPage.tsx (274 سطراً)
-- ════════════════════════════════════════════════════════════════════════
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  الأعطال المُثبتة تشغيلياً على Postgres 17 قبل كتابة سطر واحد     │
--  │  (المسبار: tools/dev/_probe_0358.sql — على قاعدة نظيفة)          │
--  └──────────────────────────────────────────────────────────────────┘
--
--  ① ★★★ **زرّ «موافقة» يرمي دائماً.** `handleApprove` يستدعي:
--        bonusService.approveBonus(bonus.id, "system")
--     و`approveBonus` تكتب `approved_by = 'system'` في عمود UUID.
--
--     PROBE_9:
--        ERROR: invalid input syntax for type uuid: "system"
--
--     ⇒ الاعتماد **مستحيل** من الواجهة. مكافأةٌ أُنشئت تبقى
--       `pending` إلى الأبد.
--
--  ② ★★★ **مفردتان عربيّتان تكسران كل شيء.** حتى لو نجح الاعتماد:
--        approveBonus → status = 'موافق'   (عربي)
--        cancelBonus  → status = 'ملغي'    (عربي)
--     والصفحة تُرشِّح وتعرض بالإنجليزية:
--        (b.status as BonusStatus) === 'pending'   ← للأزرار
--        (b.status as BonusStatus) === 'approved'  ← لبطاقة «معتمدة»
--        BONUS_STATUS_LABELS[bonus.status]         ← للشارة
--
--     PROBE_1: الصفّ يحمل `موافق` ⇒ لا يُطابق `'approved'` أبداً
--              و`BONUS_STATUS_LABELS['موافق']` = undefined
--     PROBE_1C: و`ملغي` كذلك — الخريطة تعرف `cancelled` لا `ملغي`.
--
--     ⇒ بطاقة «معتمدة» صفر أبداً · والشارة تعرض النصّ الخام
--       (السطر `|| bonus.status` يُنقذ من الفراغ لا من الخطأ).
--
--     PROBE_1B: والعمود بلا `CHECK` — «حالة مخترعة تماماً» قُبِلت.
--
--  ③ ★★★ **حقلان للمبلغ يمكن أن يتضاربا.**
--     الجدول يحمل `amount NUMERIC NOT NULL` و`bonus_amount NUMERIC`
--     (أُضيف لاحقاً)، ومحفّز `sync_bonus_amount_fields` يملأ **الفارغ
--     منهما فقط**:
--        IF NEW.amount IS NULL AND NEW.bonus_amount IS NOT NULL THEN …
--        IF NEW.bonus_amount IS NULL AND NEW.amount IS NOT NULL THEN …
--
--     والصفحة تُرسل `bonus_amount` وتقرأ `bonus.amount` — يعمل صدفةً
--     بفضل المحفّز. لكن PROBE_2C:
--        INSERT (amount=100000, bonus_amount=999999)
--        ⇒ amount=100000.00 · bonus_amount=999999.00 · diverged = t
--
--     ⇒ صفٌّ واحد بمبلغين مختلفين. الرواتب تقرأ أحدهما والشاشة الآخر.
--
--  ④ ★★ **لا حارس على المبلغ.** PROBE_3: مكافأة بـ`-50000` قُبِلت.
--  ⑤ ★★ **`bonus_type` بلا CHECK.** PROBE_4: «نوع مخترع» قُبِل
--        ⇒ `BONUS_TYPE_LABELS[…]` = undefined ⇒ نصّ فارغ في البطاقة.
--  ⑥ ★★ **لا FK على `employee_id`.** PROBE_6: مكافأة لموظف غير موجود.
--  ⑦ ★ **الحذف النهائي متاح** لأي staff بلا محفّز حارس (PROBE_7B: 0).
--  ⑧ ★ **`period_start`/`period_end` تُجمَعان في النموذج ولا يُمرَّران**
--        (PROBE_8) — حقلا إدخال بلا أثر.
--  ⑨ ★ **`referral` مفقود من أزرار الفلترة** — ستّة أنواع في الخريطة
--        وخمسة أزرار، فمكافآت الإحالة لا تُرى بأيّ ترشيح.
--  ⑩ ★ **جدولان كاملان إلى المتصفّح** + ربط بـMap.
--  ⑪ ★ **نافذة التفاصيل تستعمل `PAYROLL_STATUS_LABELS`** لا
--        `BONUS_STATUS_LABELS` ⇒ `undefined` لكل حالة مكافأة.
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  ما يفعله هذا المايجريشن                                          │
--  └──────────────────────────────────────────────────────────────────┘
--   (أ) توحيد المبلغ: `bonus_amount` عمود مُشتقّ دائماً من `amount`.
--   (ب) القيود: الحالة · النوع · المبلغ الموجب · FK الموظف.
--   (جـ) الأرشفة بدل الحذف.
--   (د) دوال: الملخّص · اللوحة · الإنشاء · البتّ · الأرشفة.
--
-- ════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- (أ) أعمدة الأرشفة
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.bonuses
  ADD COLUMN IF NOT EXISTS archived_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS decided_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decision_note  TEXT;

-- ─────────────────────────────────────────────────────────────────────────
-- (ب) توحيد المبلغ — العطل ③
-- ─────────────────────────────────────────────────────────────────────────
--  المحفّز القديم `sync_bonus_amount_fields` يملأ الفارغ منهما فقط،
--  فصفٌّ يحمل الاثنين مختلفَين يمرّ (مقيس: 100,000 مقابل 999,999).
--  نجعل `amount` **المرجع الوحيد** و`bonus_amount` مرآةً له دائماً.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_bonus_amount_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- ★★ الاتجاه الأول: `amount` فارغ ⇒ يأخذ من `bonus_amount`
  --   (الصفحة كانت ترسل bonus_amount وحده)
  IF NEW.amount IS NULL AND NEW.bonus_amount IS NOT NULL THEN
    NEW.amount := NEW.bonus_amount;
  END IF;

  -- ★★★ ثم `bonus_amount` **مرآة** لا حقلاً مستقلاً: يُكتب دائماً
  --   من `amount`. هذا ما يمنع التضارب المقيس (0358/③).
  NEW.bonus_amount := NEW.amount;

  -- ★★ `bonus_date` له DEFAULT CURRENT_DATE فلا يصل المحفّز فارغاً أبداً
  --   إلا إن مُرِّر NULL صراحةً. والنيّة أن يتبع الفترة حين تُحدَّد:
  --   مكافأةُ يوليو تاريخُها يوليو لا يومَ إدخالها — وإلا سقطت من
  --   `out_amt_month` في الشهر الصحيح وظهرت في الشهر الخطأ.
  --   (كُشف بالتأكيد 5.4: توقّعتُ 2026-07-01 وجاء 2026-08-08.)
  IF NEW.period_start IS NOT NULL THEN
    NEW.bonus_date := NEW.period_start;
  ELSIF NEW.bonus_date IS NULL THEN
    NEW.bonus_date := (NOW() AT TIME ZONE 'Asia/Baghdad')::DATE;
  END IF;

  IF NEW.currency IS NULL OR NEW.currency = '' THEN
    NEW.currency := 'IQD';
  END IF;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.sync_bonus_amount_fields() IS
  'يوحّد amount و bonus_amount. النسخة السابقة كانت تملأ الفارغ منهما '
  'فقط، فصفٌّ بـ(100000, 999999) يمرّ بمبلغين مختلفين (0358/③).';

DROP TRIGGER IF EXISTS trg_sync_bonus_amount_fields ON public.bonuses;
CREATE TRIGGER trg_sync_bonus_amount_fields
  BEFORE INSERT OR UPDATE ON public.bonuses
  FOR EACH ROW EXECUTE FUNCTION public.sync_bonus_amount_fields();

-- ─────────────────────────────────────────────────────────────────────────
-- (جـ) القيود — الأعطال ② ④ ⑤ ⑥
-- ─────────────────────────────────────────────────────────────────────────

-- ★★★ مفردات الحالة الأربع. نُطبّع العربية القائمة أولاً — وإلا فشل
--   المايجريشن على قاعدةٍ فيها صفوفٌ كتبتها `approveBonus`.
DO $$
BEGIN
  UPDATE public.bonuses SET status = 'approved'
   WHERE status IN ('موافق','معتمد','معتمدة');
  UPDATE public.bonuses SET status = 'cancelled'
   WHERE status IN ('ملغي','ملغى','ملغاة','rejected','مرفوض');
  UPDATE public.bonuses SET status = 'paid'
   WHERE status IN ('مدفوع','مدفوعة');
  UPDATE public.bonuses SET status = 'pending'
   WHERE status IS NULL
      OR status NOT IN ('pending','approved','cancelled','paid');

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'bonuses_status_chk') THEN
    ALTER TABLE public.bonuses
      ADD CONSTRAINT bonuses_status_chk
      CHECK (status IN ('pending','approved','cancelled','paid'));
  END IF;
END $$;

-- ★★ مفردات النوع الستّ — مطابِقة لـBONUS_TYPE_LABELS
DO $$
BEGIN
  UPDATE public.bonuses SET bonus_type = 'other'
   WHERE bonus_type IS NULL
      OR bonus_type NOT IN ('performance','overtime','annual',
                            'spot','referral','other');

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'bonuses_type_chk') THEN
    ALTER TABLE public.bonuses
      ADD CONSTRAINT bonuses_type_chk
      CHECK (bonus_type IN ('performance','overtime','annual',
                            'spot','referral','other'));
  END IF;
END $$;

-- ★★ المبلغ موجب
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'bonuses_amount_pos') THEN
    ALTER TABLE public.bonuses
      ADD CONSTRAINT bonuses_amount_pos CHECK (amount > 0) NOT VALID;
  END IF;
END $$;

-- ★★ مدى الفترة
DO $$
BEGIN
  UPDATE public.bonuses SET period_end = period_start
   WHERE period_start IS NOT NULL AND period_end IS NOT NULL
     AND period_end < period_start;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'bonuses_period_chk') THEN
    ALTER TABLE public.bonuses
      ADD CONSTRAINT bonuses_period_chk
      CHECK (period_start IS NULL OR period_end IS NULL
             OR period_end >= period_start);
  END IF;
END $$;

-- ★★ FK على الموظف (العطل ⑥)
DO $$
BEGIN
  DELETE FROM public.bonuses b
   WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = b.employee_id);

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'bonuses_employee_id_fkey') THEN
    ALTER TABLE public.bonuses
      ADD CONSTRAINT bonuses_employee_id_fkey
      FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bonuses_tenant_status
  ON public.bonuses (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_bonuses_tenant_emp
  ON public.bonuses (tenant_id, employee_id);

-- ─────────────────────────────────────────────────────────────────────────
-- (د) الأرشفة بدل الحذف — العطل ⑦
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_block_bonus_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION
    'BONUS_IMMUTABLE: المكافأة لا تُحذف — استعمل الإلغاء أو الأرشفة'
    USING ERRCODE = 'check_violation';
END $$;

DROP TRIGGER IF EXISTS trg_block_bonus_delete ON public.bonuses;
CREATE TRIGGER trg_block_bonus_delete
  BEFORE DELETE ON public.bonuses
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_bonus_delete();

-- ─────────────────────────────────────────────────────────────────────────
-- (هـ) الملخّص
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.bonus_summary();

CREATE FUNCTION public.bonus_summary()
RETURNS TABLE (
  out_total       INTEGER,
  out_pending     INTEGER,
  out_approved    INTEGER,
  out_paid        INTEGER,
  out_cancelled   INTEGER,
  out_amt_pending NUMERIC,
  out_amt_approved NUMERIC,
  out_amt_paid    NUMERIC,
  out_amt_month   NUMERIC,
  out_employees   INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  -- ★ الشهر بتوقيت بغداد صراحةً: الخادم Etc/UTC وبغداد UTC+3، فأوّل
  --   الشهر وآخره يختلفان ثلاث ساعات (درس 0351).
  v_today  DATE := (NOW() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بملخّص المكافآت';
  END IF;

  RETURN QUERY
  SELECT
    count(*)::INTEGER,
    count(*) FILTER (WHERE b.status = 'pending')::INTEGER,
    count(*) FILTER (WHERE b.status = 'approved')::INTEGER,
    count(*) FILTER (WHERE b.status = 'paid')::INTEGER,
    count(*) FILTER (WHERE b.status = 'cancelled')::INTEGER,
    round(COALESCE(sum(b.amount) FILTER (WHERE b.status = 'pending'), 0), 2),
    round(COALESCE(sum(b.amount) FILTER (WHERE b.status = 'approved'), 0), 2),
    round(COALESCE(sum(b.amount) FILTER (WHERE b.status = 'paid'), 0), 2),
    -- ★ مكافآت الشهر الجاري (المعتمَدة والمدفوعة) — الملغاة خارجه
    round(COALESCE(sum(b.amount) FILTER (
      WHERE b.status IN ('approved','paid')
        AND b.bonus_date >= date_trunc('month', v_today)::DATE
        AND b.bonus_date <  (date_trunc('month', v_today) + INTERVAL '1 month')::DATE
    ), 0), 2),
    count(DISTINCT b.employee_id) FILTER (
      WHERE b.status IN ('approved','paid'))::INTEGER
  FROM public.bonuses b
  WHERE b.tenant_id = v_tenant
    AND b.archived_at IS NULL;
END $$;

COMMENT ON FUNCTION public.bonus_summary() IS
  'بطاقات المكافآت. الصفحة كانت تجمع status=''approved'' بينما '
  'approveBonus تكتب ''موافق'' ⇒ البطاقة صفر أبداً (0358/②).';

REVOKE ALL ON FUNCTION public.bonus_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bonus_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.bonus_summary() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- (و) اللوحة
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.bonus_board(TEXT, TEXT, TEXT, BOOLEAN, INTEGER);

CREATE FUNCTION public.bonus_board(
  p_status           TEXT    DEFAULT NULL,
  p_type             TEXT    DEFAULT NULL,
  p_search           TEXT    DEFAULT NULL,
  p_include_archived BOOLEAN DEFAULT FALSE,
  p_limit            INTEGER DEFAULT 200
)
RETURNS TABLE (
  out_id            UUID,
  out_employee_id   UUID,
  out_employee_name TEXT,
  out_employee_code TEXT,
  out_department    TEXT,
  out_type          TEXT,
  out_amount        NUMERIC,
  out_currency      TEXT,
  out_reason        TEXT,
  out_status        TEXT,
  out_period_start  DATE,
  out_period_end    DATE,
  out_bonus_date    DATE,
  out_approved_by   UUID,
  out_approver_name TEXT,
  out_decided_at    TIMESTAMPTZ,
  out_decision_note TEXT,
  out_archived      BOOLEAN,
  out_created_at    TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_q      TEXT := NULLIF(btrim(COALESCE(p_search, '')), '');
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بعرض المكافآت';
  END IF;

  -- ★ الحرّاس تعكس CHECK القاعدة نصّاً
  IF p_status IS NOT NULL
     AND p_status NOT IN ('pending','approved','cancelled','paid') THEN
    RAISE EXCEPTION 'BONUS_BAD_STATUS: حالة غير معروفة «%» — المسموح: '
      'pending·approved·cancelled·paid', p_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_type IS NOT NULL
     AND p_type NOT IN ('performance','overtime','annual','spot','referral','other') THEN
    RAISE EXCEPTION 'BONUS_BAD_TYPE: نوع غير معروف «%» — المسموح: '
      'performance·overtime·annual·spot·referral·other', p_type
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  SELECT
    b.id, b.employee_id,
    -- ★ full_name_ar = NULL لكل موظف (مُحقَّق) — سلسلة احتياطية
    COALESCE(NULLIF(btrim(e.full_name_ar), ''),
             NULLIF(btrim(p.full_name), ''),
             NULLIF(btrim(COALESCE(e.first_name,'') || ' ' ||
                          COALESCE(NULLIF(e.last_name,'—'),'')), ''),
             'موظف ' || COALESCE(e.employee_code,'—'))::TEXT,
    e.employee_code::TEXT,
    COALESCE(d.name_ar, p.department, '—')::TEXT,
    b.bonus_type::TEXT,
    round(b.amount, 2),
    COALESCE(b.currency, 'IQD')::TEXT,
    b.reason,
    b.status::TEXT,
    b.period_start, b.period_end, b.bonus_date,
    b.approved_by,
    COALESCE(NULLIF(btrim(ap.full_name), ''), '—')::TEXT,
    b.decided_at, b.decision_note,
    (b.archived_at IS NOT NULL),
    b.created_at
  FROM public.bonuses b
  JOIN public.employees e ON e.id = b.employee_id
  LEFT JOIN public.profiles    p  ON p.id  = e.user_id
  LEFT JOIN public.profiles    ap ON ap.id = b.approved_by
  LEFT JOIN public.departments d  ON d.id  = e.department_id
  WHERE b.tenant_id = v_tenant
    AND (p_include_archived OR b.archived_at IS NULL)
    AND (p_status IS NULL OR b.status     = p_status)
    AND (p_type   IS NULL OR b.bonus_type = p_type)
    AND (v_q IS NULL
         OR e.full_name_ar  ILIKE '%' || v_q || '%'
         OR e.employee_code ILIKE '%' || v_q || '%'
         OR p.full_name     ILIKE '%' || v_q || '%'
         OR b.reason        ILIKE '%' || v_q || '%')
  ORDER BY b.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 200), 1);
END $$;

COMMENT ON FUNCTION public.bonus_board(TEXT, TEXT, TEXT, BOOLEAN, INTEGER) IS
  'لوحة المكافآت مع الاسم والقسم والمعتمِد. الصفحة كانت تجلب كل '
  'المكافآت وكل الموظفين وتربطهما في المتصفّح بلا حدّ.';

REVOKE ALL ON FUNCTION public.bonus_board(TEXT, TEXT, TEXT, BOOLEAN, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bonus_board(TEXT, TEXT, TEXT, BOOLEAN, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.bonus_board(TEXT, TEXT, TEXT, BOOLEAN, INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- (ز) الإنشاء
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.bonus_create(UUID, TEXT, NUMERIC, TEXT, DATE, DATE);

CREATE FUNCTION public.bonus_create(
  p_employee_id  UUID,
  p_type         TEXT,
  p_amount       NUMERIC,
  p_reason       TEXT,
  p_period_start DATE DEFAULT NULL,
  p_period_end   DATE DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_role   TEXT := public.current_user_role();
  v_id     UUID;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF v_role IS NULL OR v_role NOT IN ('admin','hr') THEN
    RAISE EXCEPTION 'غير مصرَّح بإنشاء مكافأة (الدور: %)', COALESCE(v_role,'—');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.employees e
                  WHERE e.id = p_employee_id AND e.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'الموظف غير موجود في هذا المستأجر';
  END IF;

  IF p_type NOT IN ('performance','overtime','annual','spot','referral','other') THEN
    RAISE EXCEPTION 'BONUS_BAD_TYPE: نوع غير معروف «%»', p_type
      USING ERRCODE = 'check_violation';
  END IF;

  -- ★★ العطل ④: مبلغ سالب كان يمرّ
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'BONUS_BAD_AMOUNT: المبلغ يجب أن يكون موجباً (المُمرَّر: %)',
      COALESCE(p_amount::TEXT,'NULL') USING ERRCODE = 'check_violation';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'BONUS_NO_REASON: السبب إلزاميّ'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ★★ العطل ⑧: الفترة تُمرَّر فعلاً الآن — وتُحرَس
  IF p_period_start IS NOT NULL AND p_period_end IS NOT NULL
     AND p_period_end < p_period_start THEN
    RAISE EXCEPTION 'BONUS_BAD_PERIOD: النهاية (%) قبل البداية (%)',
      p_period_end, p_period_start USING ERRCODE = 'check_violation';
  END IF;

  -- ★ `amount` وحده يُكتب — المحفّز يعكسه على bonus_amount
  INSERT INTO public.bonuses
    (tenant_id, employee_id, bonus_type, amount, reason,
     period_start, period_end, status)
  VALUES (v_tenant, p_employee_id, p_type, p_amount, btrim(p_reason),
          p_period_start, p_period_end, 'pending')
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.bonus_create(UUID, TEXT, NUMERIC, TEXT, DATE, DATE) IS
  'إنشاء مكافأة بحارس النوع والمبلغ والسبب والفترة. الفترة كانت '
  'تُجمَع في النموذج ولا تُمرَّر (0358/⑧).';

REVOKE ALL ON FUNCTION public.bonus_create(UUID, TEXT, NUMERIC, TEXT, DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bonus_create(UUID, TEXT, NUMERIC, TEXT, DATE, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.bonus_create(UUID, TEXT, NUMERIC, TEXT, DATE, DATE) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- (ح) البتّ — العطلان ① و ②
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.bonus_decide(UUID, TEXT, TEXT);

CREATE FUNCTION public.bonus_decide(
  p_bonus_id UUID,
  p_decision TEXT,
  p_note     TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_role   TEXT := public.current_user_role();
  v_cur    TEXT;
  v_arch   TIMESTAMPTZ;
  v_ok     BOOLEAN;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF v_role IS NULL OR v_role NOT IN ('admin','hr') THEN
    RAISE EXCEPTION 'غير مصرَّح بالبتّ في المكافآت (الدور: %)', COALESCE(v_role,'—');
  END IF;
  IF p_decision NOT IN ('approved','cancelled','paid') THEN
    RAISE EXCEPTION 'BONUS_BAD_DECISION: القرار «%» غير معروف — '
      'المسموح: approved·cancelled·paid', p_decision
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_decision = 'cancelled'
     AND (p_note IS NULL OR btrim(p_note) = '') THEN
    RAISE EXCEPTION 'BONUS_NO_NOTE: سبب الإلغاء إلزاميّ'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT b.status, b.archived_at INTO v_cur, v_arch
    FROM public.bonuses b
   WHERE b.id = p_bonus_id AND b.tenant_id = v_tenant;
  IF v_cur IS NULL THEN
    RAISE EXCEPTION 'المكافأة غير موجودة في هذا المستأجر';
  END IF;
  IF v_arch IS NOT NULL THEN
    RAISE EXCEPTION 'BONUS_ARCHIVED: المكافأة مؤرشفة — لا تعديل عليها'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ★★ انتقالات محدَّدة: المدفوعة والملغاة نهائيتان
  v_ok := CASE v_cur
    WHEN 'pending'  THEN p_decision IN ('approved','cancelled')
    WHEN 'approved' THEN p_decision IN ('paid','cancelled')
    ELSE FALSE
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'BONUS_BAD_TRANSITION: لا انتقال من «%» إلى «%»',
      v_cur, p_decision USING ERRCODE = 'check_violation';
  END IF;

  -- ★★★ العطل ①: `approved_by` يأخذ `auth.uid()` — لا السلسلة "system"
  --   التي كانت ترمي `invalid input syntax for type uuid`.
  -- ★★★ والعطل ②: المفردات إنجليزية مطابِقة لما تقرؤه الواجهة.
  UPDATE public.bonuses
     SET status        = p_decision,
         approved_by   = CASE WHEN p_decision IN ('approved','paid')
                              THEN COALESCE(approved_by, auth.uid())
                              ELSE approved_by END,
         decided_at    = NOW(),
         decision_note = COALESCE(NULLIF(btrim(COALESCE(p_note,'')), ''),
                                  decision_note),
         updated_at    = NOW()
   WHERE id = p_bonus_id AND tenant_id = v_tenant;

  RETURN p_decision;
END $$;

COMMENT ON FUNCTION public.bonus_decide(UUID, TEXT, TEXT) IS
  'بتّ في المكافأة. approveBonus كانت تمرّر السلسلة "system" لعمود '
  'UUID فيرمي invalid input syntax، وتكتب المفردة العربية «موافق» '
  'بينما الواجهة تقرأ "approved" (0358/① و②).';

REVOKE ALL ON FUNCTION public.bonus_decide(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bonus_decide(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.bonus_decide(UUID, TEXT, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- (ط) الأرشفة
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.bonus_archive(UUID, TEXT);

CREATE FUNCTION public.bonus_archive(
  p_bonus_id UUID,
  p_reason   TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_role   TEXT := public.current_user_role();
  v_n      INTEGER;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF v_role IS NULL OR v_role NOT IN ('admin','hr') THEN
    RAISE EXCEPTION 'غير مصرَّح بأرشفة المكافآت (الدور: %)', COALESCE(v_role,'—');
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'BONUS_NO_REASON: سبب الأرشفة إلزاميّ'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.bonuses
     SET archived_at = NOW(), archive_reason = btrim(p_reason), updated_at = NOW()
   WHERE id = p_bonus_id AND tenant_id = v_tenant AND archived_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'المكافأة غير موجودة في هذا المستأجر أو مؤرشفة أصلاً';
  END IF;
  RETURN TRUE;
END $$;

COMMENT ON FUNCTION public.bonus_archive(UUID, TEXT) IS
  'أرشفة بدل حذف. الحذف كان متاحاً لأي staff بلا محفّز حارس (0358/⑦).';

REVOKE ALL ON FUNCTION public.bonus_archive(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bonus_archive(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.bonus_archive(UUID, TEXT) TO authenticated;
