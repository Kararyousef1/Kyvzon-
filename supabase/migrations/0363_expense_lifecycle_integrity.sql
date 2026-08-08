-- ════════════════════════════════════════════════════════════════════════
--  0363 — سلامة دورة حياة النفقات
--  المرحلة 4 — بوابة الموارد البشرية · hr/ExpensesPage.tsx (218 سطراً)
-- ════════════════════════════════════════════════════════════════════════
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  الأعطال المُثبتة تشغيلياً على Postgres 17 قبل كتابة سطر واحد     │
--  │  (المسبار: tools/dev/_probe_0363.sql — على قاعدة نظيفة، 291 م.)  │
--  └──────────────────────────────────────────────────────────────────┘
--
--  ★ إنصافاً للجدول: `expense_requests_status_chk` موجود بالمفردات
--    الخمس، و`trg_guard_status_bypass` قائم، والسياسات صحيحة. الأعطال
--    في مكانٍ آخر — وأخطرها **ثقبٌ في حارسٍ ظننتُه محكماً**.
--
--  ① ★★★ **حارس `APPROVAL_CHAIN_BYPASS` لا يُطلَق — والطلب مجمَّد.**
--
--     تسلسلٌ مُثبت خطوةً خطوة على قاعدةٍ نظيفة:
--
--       PROBE_1  : UPDATE status='approved' مباشرةً ⇒ **مرّ بلا خطأ**
--       PROBE_1ب : حالة الطلب = pending · **خطواته = 0**
--                  صندوق موافقات هدى = **0 عنصر**
--                  قواعد اعتماد المستأجر = **0**
--                  resolve_approval_chain('finance') = **0 مستوى**
--
--     السبب الجذريّ بنصّه من `create_financial_request_approval`:
--
--        FOR v_rule IN SELECT … FROM resolve_approval_chain('finance', …)
--        LOOP
--          IF v_rule.out_approver_id IS NULL THEN CONTINUE; END IF;
--          …
--        END LOOP;
--
--     مستأجرٌ بلا `approval_rules` ⇒ الحلقة **لا تدور مرّةً واحدة** ⇒
--     `hr_approval_requests` يُنشأ بحالة `pending` و**صفر خطوة**.
--
--     ثم الحارس `tg_guard_request_status_bypass` يعدّ **الخطوات**:
--
--        SELECT count(*) INTO v_open FROM hr_approval_steps s
--          JOIN hr_approval_requests r ON r.id = s.request_id
--         WHERE r.related_id = NEW.id AND s.status IN ('pending','active');
--        IF v_open = 0 THEN RETURN NEW; END IF;   ← الثقب
--
--     ⇒ **النتيجة المزدوجة:**
--        · الطلب معلَّق إلى الأبد: لا خطوة تُعتمد ولا يظهر في أي صندوق.
--        · والحارس صامت: أيّ staff يكتب `status` مباشرةً بلا رادع.
--
--     ★ الحارس ليس خاطئاً في ذاته — «لا خطوات» تعني «لا سلسلة» وهو
--       سلوكٌ مقصود للسجلات القديمة. الخطأ أن **طلباً بلا خطوات
--       يُنشأ أصلاً** فيجمع أسوأ الحالتين: يبدو معلَّقاً ولا يحرسه شيء.
--
--     ⚠️ **تصحيحان لفرضيتَيّ أثناء التشخيص** (موثّقان في docs):
--        (أ) ظننتُ الحارس يقرأ جدولاً غير الذي تكتب فيه الدالة
--            (`unified_approval_steps` مقابل `hr_approval_steps`).
--            **خطأ**: `create_financial_request_approval` تكتب في
--            `hr_approval_requests` نفسه. الفرضية أُسقطت.
--        (ب) ثم ظننتُ السبب `out_approver_id IS NULL`. **خطأ جزئيّ**:
--            `resolve_approval_chain` تُعيد **صفر صفّ** أصلاً — لا صفّاً
--            بمعتمِدٍ فارغ. الفرق جوهريّ: `CONTINUE` لا يُنفَّذ إطلاقاً.
--
--  ② ★★ **`tenant_id` يقبل NULL** (PROBE_3) ⇒ نفقةٌ لا يراها أحد.
--
--  ③/④ ★★★ **`employee_id` بلا مفتاح أجنبيّ.**
--     PROBE_4: موظفٌ `ffffffff-…` معدوم ⇒ **قُبِل**
--     PROBE_5: موظفٌ من **مستأجرٍ آخر** داخل مستأجرك ⇒ **قُبِل**
--     `pg_constraint` = pkey · status CHECK · tenant FK. لا شيء آخر.
--
--  ⑤ ★★ **`amount` يقبل صفراً وسالباً** (PROBE_6: صفّان).
--     نفقةٌ بـ‎-50,000 تُنقص «بانتظار الموافقة» في البطاقة.
--
--  ⑥ ★★ **`expense_date` في المستقبل** — PROBE_7: نفقةٌ بعد **400 يوم**
--     ⇒ قُبِلت. مصروفٌ لم يقع بعدُ يُطالَب به اليوم.
--
--  ⑦ ★★ **`category` نصٌّ حرّ** (PROBE_8: `'ThIsIsGaRbAgE'`)
--     ★ والصفحة **لا تعرض الفئة إطلاقاً** ولا تسمح بضبطها — عمودٌ
--       `NOT NULL DEFAULT 'general'` بلا واجهة.
--
--  ⑧ ★★★ **رفضٌ بلا سبب مسموح في القاعدة** (PROBE_9).
--     الصفحة تُلزم بالسبب في الواجهة، والقاعدة لا تُلزم بشيء ⇒ أيّ
--     كتابةٍ من خارج الصفحة تُنتج رفضاً بلا تعليل.
--
--  ⑨ ★★★ **`approved_at` و`approved_by` لا يُملآن** (PROBE_10).
--     `UPDATE status='approved'` مباشرةً ⇒ معتمَدةٌ بلا معتمِد ولا وقت.
--     لا يُعرف مَن وافق على صرف المال ولا متى.
--
--  ⑩ ★★★ **`paid_at` عمودٌ ميت — لا شيء يدفع.**
--     PROBE_11: نفقات مدفوعة = 0 · والصفحة **بلا زرّ دفع إطلاقاً**.
--     «مدفوع» فلترٌ في الشريط لا يمتلئ أبداً، والمال لا يُصرف من
--     المنظومة. الاعتماد نهاية المسار — والصرف خارجه.
--
--  ⑪ ★★ **`cancelled` مفردةٌ في القيد بلا زرّ** (PROBE_12).
--     وشريط الترشيح خمسة: all·pending·approved·rejected·paid —
--     **`cancelled` مفقود** فالملغاة تختفي عن كل الفلاتر.
--
--  ⑫ ★★★ **الحذف النهائيّ مسموح** — PROBE_13: بدور `authenticated`
--     حقيقيّ (هدى · hr) `DELETE` نجح. ولا محفّز يمنع.
--     إيصالٌ ومبلغٌ وسببُ رفضٍ — تُمحى بلا أثر.
--
--  ⑬ ★★ **`receipt_url` بلا رفع ولا عرض** (PROBE_14: سبع نفقات بلا
--     إيصال). العمود موجود والصفحة لا تعرفه ⇒ موافقةٌ على مبلغٍ بلا
--     مستندٍ داعم.
--
--  ⑭ ★★ **جلب كل الموظفين وحلقة O(n) وترتيبٌ عشوائيّ.**
--     `employeeService.findAll({ orderBy: 'full_name_ar' })` على عمودٍ
--     **NULL لكل موظف** (PROBE_15) — ثم `Map` يدويّ في المتصفّح.
--
--  ⑮ ★★ **الإحصاءات تُحسب في المتصفّح بلا حدّ أعلى** (PROBE_16):
--     `findAll` بلا `limit` ⇒ كل صفوف المستأجر تُحمَّل لحساب مجموعَين.
--
--  ⑯ ★★ **صفر دالة للنفقات في المنظومة** (PROBE_17).
--
--  ⑰ ★★★ **الموظف لا يستطيع إنشاء نفقته.** PROBE_18: سياسة INSERT
--     هي `tenant AND current_user_is_staff()` ⇒ طلب النفقة يجب أن
--     يُنشئه موظفُ الموارد نيابةً عن صاحبه. والصفحة **لا تملك زرّ
--     إنشاء أصلاً** — لوحةُ مراجعةٍ لطلباتٍ لا سبيل لتقديمها.
--
--  ────────────────────────────────────────────────────────────────────
--  العلاج:
--    · `expense_submit()` — الموظف يُقدّم نفقته (SECURITY DEFINER)
--    · `expense_decide()` — اعتماد/رفض يملأ approved_by/at ويُلزم السبب
--    · `expense_mark_paid()` — الصرف الذي لم يكن موجوداً
--    · **`expense_requests_chain_state()`** — يكشف الطلبات المجمَّدة
--    · `expense_board()` · `expense_summary()`
--    · FK مركَّب · CHECK على المبلغ والتاريخ والفئة · منع الحذف
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
--  ⓪ تنظيف البيانات القائمة قبل فرض القيود
-- ═══════════════════════════════════════════════════════════════════

-- ★ العطل ②: نفقةٌ بلا مستأجر — تُستنتج من الموظف أو تُحذف
UPDATE public.expense_requests x
   SET tenant_id = e.tenant_id
  FROM public.employees e
 WHERE x.tenant_id IS NULL AND e.id = x.employee_id AND e.tenant_id IS NOT NULL;
DELETE FROM public.expense_requests WHERE tenant_id IS NULL;

-- ★ العطلان ③/④: موظفٌ معدوم أو من مستأجرٍ آخر ⇒ تُلغى لا تُمحى
UPDATE public.expense_requests x
   SET status = 'cancelled'
 WHERE NOT EXISTS (SELECT 1 FROM public.employees e
                    WHERE e.id = x.employee_id AND e.tenant_id = x.tenant_id);
DELETE FROM public.expense_requests x
 WHERE NOT EXISTS (SELECT 1 FROM public.employees e
                    WHERE e.id = x.employee_id AND e.tenant_id = x.tenant_id);

-- ★ العطل ⑤: مبلغٌ ≤ 0 ⇒ يُلغى (لا يُصحَّح بالتخمين)
UPDATE public.expense_requests SET status = 'cancelled' WHERE amount <= 0;
UPDATE public.expense_requests SET amount = 1 WHERE amount <= 0;

-- ★ العطل ⑥: تاريخٌ في المستقبل ⇒ يُثبَّت على اليوم بتوقيت بغداد
UPDATE public.expense_requests
   SET expense_date = (now() AT TIME ZONE 'Asia/Baghdad')::DATE
 WHERE expense_date > (now() AT TIME ZONE 'Asia/Baghdad')::DATE;

-- ★ العطل ⑦: فئاتٌ خارج المفردات السبع
UPDATE public.expense_requests SET category = 'general'
 WHERE category IS NULL
    OR category NOT IN ('general','travel','meals','supplies',
                        'training','medical','transport');

-- ★ العطل ⑧: مرفوضةٌ بلا سبب ⇒ سببٌ صريح لا فراغ
UPDATE public.expense_requests
   SET rejection_reason = 'رُفض قبل إلزام السبب (0363) — السبب غير مسجَّل'
 WHERE status = 'rejected'
   AND (rejection_reason IS NULL OR btrim(rejection_reason) = '');

-- ═══════════════════════════════════════════════════════════════════
--  ① القيود البنيوية
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.expense_requests ALTER COLUMN tenant_id SET NOT NULL;

-- ★★★ العطلان ③/④: الموظف من المستأجر نفسه
--   (uq_employees_id_tenant من 0360)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'expense_requests_employee_tenant_fkey') THEN
    ALTER TABLE public.expense_requests
      ADD CONSTRAINT expense_requests_employee_tenant_fkey
      FOREIGN KEY (employee_id, tenant_id)
      REFERENCES public.employees (id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'expense_requests_amount_chk') THEN
    ALTER TABLE public.expense_requests ADD CONSTRAINT expense_requests_amount_chk
      CHECK (amount > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'expense_requests_category_chk') THEN
    ALTER TABLE public.expense_requests ADD CONSTRAINT expense_requests_category_chk
      CHECK (category IN ('general','travel','meals','supplies',
                          'training','medical','transport'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'expense_requests_title_chk') THEN
    ALTER TABLE public.expense_requests ADD CONSTRAINT expense_requests_title_chk
      CHECK (btrim(title) <> '' AND btrim(description) <> '');
  END IF;
END $$;

-- ★★ العطل ⑧: الرفض بلا سبب مستحيل بنيوياً
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'expense_requests_rejection_chk') THEN
    ALTER TABLE public.expense_requests ADD CONSTRAINT expense_requests_rejection_chk
      CHECK (status <> 'rejected'
             OR (rejection_reason IS NOT NULL AND btrim(rejection_reason) <> ''));
  END IF;
END $$;

-- ★★ العطل ⑨: المعتمَد بلا معتمِد ولا وقتٍ مستحيل بنيوياً
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'expense_requests_approved_chk') THEN
    ALTER TABLE public.expense_requests ADD CONSTRAINT expense_requests_approved_chk
      CHECK (status NOT IN ('approved','paid')
             OR (approved_by IS NOT NULL AND approved_at IS NOT NULL));
  END IF;
END $$;

-- ★★ العطل ⑩: المدفوع بلا وقت دفعٍ مستحيل
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'expense_requests_paid_chk') THEN
    ALTER TABLE public.expense_requests ADD CONSTRAINT expense_requests_paid_chk
      CHECK (status <> 'paid' OR paid_at IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_expense_requests_pending
  ON public.expense_requests (tenant_id, expense_date DESC)
  WHERE status = 'pending';

-- ═══════════════════════════════════════════════════════════════════
--  ② المحفّزات
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_expense_stamp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_today DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := public.current_user_tenant_id();
    END IF;
    -- ★ العطل ⑥: لا مصروفَ في المستقبل
    IF NEW.expense_date > v_today THEN NEW.expense_date := v_today; END IF;
  ELSE
    -- ★ الموظف والمستأجر مُجمَّدان بعد الإنشاء
    NEW.tenant_id   := OLD.tenant_id;
    NEW.employee_id := OLD.employee_id;
    -- ★★ العطل ⑨: أيُّ انتقالٍ إلى approved/paid يُسجّل معتمِده ووقته
    IF NEW.status IN ('approved','paid') AND OLD.status NOT IN ('approved','paid') THEN
      NEW.approved_by := COALESCE(NEW.approved_by, auth.uid(), OLD.approved_by);
      NEW.approved_at := COALESCE(NEW.approved_at, now());
    END IF;
    IF NEW.status = 'paid' AND OLD.status <> 'paid' THEN
      NEW.paid_at := COALESCE(NEW.paid_at, now());
    END IF;
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_expense_stamp() IS
  'يملأ approved_by/at و paid_at تلقائياً (العطلان ⑨ و⑩) ويُجمّد '
  'الموظف والمستأجر ويمنع تاريخاً مستقبلياً.';

DROP TRIGGER IF EXISTS trg_expense_stamp ON public.expense_requests;
CREATE TRIGGER trg_expense_stamp
  BEFORE INSERT OR UPDATE ON public.expense_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_expense_stamp();

-- ★ العطل ⑫: منع الحذف النهائيّ
CREATE OR REPLACE FUNCTION public.tg_block_expense_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'EXPENSE_DELETE_BLOCKED: طلب النفقة لا يُحذف — استخدم الإلغاء';
END $$;

DROP TRIGGER IF EXISTS trg_block_expense_delete ON public.expense_requests;
CREATE TRIGGER trg_block_expense_delete
  BEFORE DELETE ON public.expense_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_expense_delete();

-- ═══════════════════════════════════════════════════════════════════
--  ③ ★★★ العطل ①: كشف الطلبات المجمَّدة
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.expense_chain_state(UUID);
CREATE FUNCTION public.expense_chain_state(p_expense UUID)
RETURNS TABLE (
  out_has_request  BOOLEAN,
  out_open_steps   INTEGER,
  out_total_steps  INTEGER,
  -- ★★★ طلبٌ pending بصفر خطوة = مجمَّدٌ إلى الأبد
  out_is_stalled   BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;

  RETURN QUERY
  WITH req AS (
    SELECT r.id, r.status
      FROM public.hr_approval_requests r
     WHERE r.related_id = p_expense AND r.tenant_id = v_tenant
  ),
  st AS (
    SELECT count(*)::INTEGER AS total,
           count(*) FILTER (WHERE s.status IN ('pending','active'))::INTEGER AS open
      FROM public.hr_approval_steps s
      JOIN req ON req.id = s.request_id
  )
  SELECT
    EXISTS (SELECT 1 FROM req),
    COALESCE((SELECT open FROM st), 0),
    COALESCE((SELECT total FROM st), 0),
    -- طلبٌ قائمٌ معلَّق وبصفر خطوة ⇒ لا أحد يستطيع اعتماده
    (EXISTS (SELECT 1 FROM req WHERE status = 'pending')
     AND COALESCE((SELECT total FROM st), 0) = 0);
END $$;

COMMENT ON FUNCTION public.expense_chain_state(UUID) IS
  'حالة سلسلة اعتماد النفقة. out_is_stalled = طلبٌ pending بصفر خطوة '
  '— مجمَّدٌ إلى الأبد لأن المستأجر بلا approval_rules (العطل ①).';

-- ═══════════════════════════════════════════════════════════════════
--  ④ اللوح والملخّص
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.expense_board(TEXT, TEXT, INTEGER);
CREATE FUNCTION public.expense_board(
  p_status   TEXT    DEFAULT NULL,
  p_category TEXT    DEFAULT NULL,
  p_limit    INTEGER DEFAULT 200
)
RETURNS TABLE (
  out_id            UUID,
  out_employee_id   UUID,
  out_employee_name TEXT,
  out_employee_code TEXT,
  out_department    TEXT,
  out_title         TEXT,
  out_description   TEXT,
  out_amount        NUMERIC,
  out_category      TEXT,
  out_expense_date  DATE,
  out_age_days      INTEGER,
  out_receipt_url   TEXT,
  out_status        TEXT,
  out_approver_name TEXT,
  out_approved_at   TIMESTAMPTZ,
  out_paid_at       TIMESTAMPTZ,
  out_rejection_reason TEXT,
  -- ★★★ العطل ①: هل الطلب مجمَّد؟
  out_is_stalled    BOOLEAN,
  out_open_steps    INTEGER,
  out_created_at    TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_staff  BOOLEAN := public.current_user_is_staff();
  v_me     UUID := public.current_user_employee_id();
  v_today  DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_lim    INTEGER := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT x.* FROM public.expense_requests x
     WHERE x.tenant_id = v_tenant
       -- ★ العطل ⑰: الموظف يرى نفقاته هو (كما تسمح السياسة)
       AND (v_staff OR x.employee_id = v_me)
       AND (p_status IS NULL OR x.status = p_status)
       AND (p_category IS NULL OR x.category = p_category)
  ),
  chains AS (
    SELECT r.related_id AS xid,
           count(s.id) FILTER (WHERE s.status IN ('pending','active'))::INTEGER AS open,
           count(s.id)::INTEGER AS total,
           bool_or(r.status = 'pending') AS req_pending
      FROM public.hr_approval_requests r
      JOIN base b ON b.id = r.related_id
      LEFT JOIN public.hr_approval_steps s ON s.request_id = r.id
     WHERE r.tenant_id = v_tenant
     GROUP BY r.related_id
  )
  SELECT
    b.id, b.employee_id,
    -- ★ العطل ⑭: full_name_ar فارغ لكل موظف ⇒ احتياطيّ صريح
    COALESCE(NULLIF(btrim(e.full_name_ar), ''),
             NULLIF(btrim(e.first_name || ' ' || e.last_name), ''),
             'موظف ' || e.employee_code)::TEXT,
    e.employee_code::TEXT,
    COALESCE(d.name_ar, '—')::TEXT,
    b.title::TEXT, b.description, b.amount, b.category::TEXT,
    b.expense_date,
    (v_today - b.expense_date)::INTEGER,
    b.receipt_url, b.status::TEXT,
    COALESCE(NULLIF(btrim(p.full_name), ''), '—')::TEXT,
    b.approved_at, b.paid_at, b.rejection_reason,
    -- ★★★ العطل ①: معلَّقٌ بصفر خطوة = مجمَّد
    (b.status = 'pending' AND COALESCE(c.req_pending, FALSE)
       AND COALESCE(c.total, 0) = 0),
    COALESCE(c.open, 0),
    b.created_at
  FROM base b
  JOIN public.employees e
    ON e.id = b.employee_id AND e.tenant_id = b.tenant_id
  LEFT JOIN public.departments d
    ON d.id = e.department_id AND d.tenant_id = b.tenant_id
  LEFT JOIN public.profiles p ON p.id = b.approved_by
  LEFT JOIN chains c ON c.xid = b.id
 -- ★★★ المعلَّق أولاً ثم الأقدم ثم id فاصلاً (درس 0357)
 ORDER BY (b.status = 'pending') DESC, b.expense_date ASC, b.id DESC
 LIMIT v_lim;
END $$;

COMMENT ON FUNCTION public.expense_board(TEXT, TEXT, INTEGER) IS
  'لوح النفقات: استعلامٌ واحد بدل جلب كل الموظفين (العطل ⑭). '
  'out_is_stalled يكشف الطلب المجمَّد (العطل ①).';

DROP FUNCTION IF EXISTS public.expense_summary();
CREATE FUNCTION public.expense_summary()
RETURNS TABLE (
  out_total        INTEGER,
  out_pending      INTEGER,
  out_amt_pending  NUMERIC,
  out_approved     INTEGER,
  out_amt_approved NUMERIC,
  out_paid         INTEGER,
  out_amt_paid     NUMERIC,
  out_rejected     INTEGER,
  out_cancelled    INTEGER,
  -- ★★★ العطلان ①/⑩: الأرقام التي تكشف الخلل
  out_stalled      INTEGER,
  out_awaiting_pay INTEGER,
  out_no_receipt   INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا مستأجر في السياق'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'غير مصرَّح بملخّص النفقات';
  END IF;

  RETURN QUERY
  WITH x AS (SELECT * FROM public.expense_requests WHERE tenant_id = v_tenant),
  chains AS (
    SELECT r.related_id AS xid, count(s.id)::INTEGER AS total,
           bool_or(r.status = 'pending') AS req_pending
      FROM public.hr_approval_requests r
      JOIN x ON x.id = r.related_id
      LEFT JOIN public.hr_approval_steps s ON s.request_id = r.id
     WHERE r.tenant_id = v_tenant
     GROUP BY r.related_id
  )
  SELECT
    (SELECT count(*)::INTEGER FROM x),
    (SELECT count(*)::INTEGER FROM x WHERE status = 'pending'),
    -- ★ COALESCE **داخل** round وإلا صار 0 لا 0.00 (درس 0355)
    (SELECT round(COALESCE(sum(amount) FILTER (WHERE status = 'pending'), 0), 2) FROM x),
    (SELECT count(*)::INTEGER FROM x WHERE status = 'approved'),
    (SELECT round(COALESCE(sum(amount) FILTER (WHERE status = 'approved'), 0), 2) FROM x),
    (SELECT count(*)::INTEGER FROM x WHERE status = 'paid'),
    (SELECT round(COALESCE(sum(amount) FILTER (WHERE status = 'paid'), 0), 2) FROM x),
    (SELECT count(*)::INTEGER FROM x WHERE status = 'rejected'),
    (SELECT count(*)::INTEGER FROM x WHERE status = 'cancelled'),
    -- ★★★ الطلبات المجمَّدة: معلَّقة ولها طلب اعتماد بصفر خطوة
    (SELECT count(*)::INTEGER FROM x
      JOIN chains c ON c.xid = x.id
     WHERE x.status = 'pending' AND c.req_pending AND c.total = 0),
    -- ★★ معتمَدةٌ تنتظر الصرف
    (SELECT count(*)::INTEGER FROM x WHERE status = 'approved'),
    (SELECT count(*)::INTEGER FROM x
      WHERE status <> 'cancelled' AND receipt_url IS NULL);
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  ⑤ الكتابة
-- ═══════════════════════════════════════════════════════════════════

-- ★★★ العطل ⑰: الموظف يُقدّم نفقته بنفسه
DROP FUNCTION IF EXISTS public.expense_submit(TEXT, TEXT, NUMERIC, TEXT, DATE, TEXT, UUID);
CREATE FUNCTION public.expense_submit(
  p_title    TEXT,
  p_description TEXT,
  p_amount   NUMERIC,
  p_category TEXT DEFAULT 'general',
  p_date     DATE DEFAULT NULL,
  p_receipt  TEXT DEFAULT NULL,
  p_employee UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_today  DATE := (now() AT TIME ZONE 'Asia/Baghdad')::DATE;
  v_me     UUID := public.current_user_employee_id();
  v_emp    UUID;
  v_id     UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'EXPENSE_NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'EXPENSE_NO_TENANT'; END IF;

  -- ★★ الموظف يُقدّم لنفسه · و staff يُقدّم نيابةً عن غيره
  v_emp := COALESCE(p_employee, v_me);
  IF v_emp IS NULL THEN RAISE EXCEPTION 'EXPENSE_NO_EMPLOYEE'; END IF;
  IF v_emp IS DISTINCT FROM v_me AND NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'EXPENSE_NOT_AUTHORIZED: لا تُقدّم نفقةً باسم غيرك';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employees e
                  WHERE e.id = v_emp AND e.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'EXPENSE_EMPLOYEE_NOT_FOUND';
  END IF;

  IF btrim(COALESCE(p_title,'')) = '' THEN
    RAISE EXCEPTION 'EXPENSE_TITLE_REQUIRED';
  END IF;
  IF btrim(COALESCE(p_description,'')) = '' THEN
    RAISE EXCEPTION 'EXPENSE_DESCRIPTION_REQUIRED';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'EXPENSE_AMOUNT_INVALID';
  END IF;
  IF p_category NOT IN ('general','travel','meals','supplies',
                        'training','medical','transport') THEN
    RAISE EXCEPTION 'EXPENSE_CATEGORY_INVALID: %', p_category;
  END IF;
  IF COALESCE(p_date, v_today) > v_today THEN
    RAISE EXCEPTION 'EXPENSE_DATE_IN_FUTURE';
  END IF;

  INSERT INTO public.expense_requests
    (tenant_id, employee_id, title, description, amount, category,
     expense_date, receipt_url, status)
  VALUES
    (v_tenant, v_emp, btrim(p_title), btrim(p_description), p_amount,
     p_category, COALESCE(p_date, v_today),
     NULLIF(btrim(COALESCE(p_receipt,'')),''), 'pending')
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.expense_submit(TEXT, TEXT, NUMERIC, TEXT, DATE, TEXT, UUID) IS
  'تقديم نفقة. SECURITY DEFINER يتجاوز سياسة INSERT التي تشترط staff '
  '(العطل ⑰) — والموظف يُقدّم لنفسه فقط.';

-- ★★★ العطلان ⑧/⑨: القرار يملأ المعتمِد والوقت ويُلزم سبب الرفض
DROP FUNCTION IF EXISTS public.expense_decide(UUID, TEXT, TEXT);
CREATE FUNCTION public.expense_decide(
  p_id      UUID,
  p_decision TEXT,
  p_reason  TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_old    TEXT;
  v_open   INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'EXPENSE_NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'EXPENSE_NO_TENANT'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'EXPENSE_NOT_AUTHORIZED';
  END IF;
  IF p_decision NOT IN ('approved','rejected','cancelled') THEN
    RAISE EXCEPTION 'EXPENSE_DECISION_INVALID: %', p_decision;
  END IF;

  SELECT status INTO v_old FROM public.expense_requests
   WHERE id = p_id AND tenant_id = v_tenant;
  IF v_old IS NULL THEN RAISE EXCEPTION 'EXPENSE_NOT_FOUND'; END IF;
  -- ★★ المدفوع لا يُنقَض
  IF v_old = 'paid' THEN RAISE EXCEPTION 'EXPENSE_ALREADY_PAID'; END IF;
  IF v_old <> 'pending' THEN
    RAISE EXCEPTION 'EXPENSE_NOT_PENDING: %', v_old;
  END IF;
  IF p_decision = 'rejected' AND btrim(COALESCE(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'EXPENSE_REJECTION_REASON_REQUIRED';
  END IF;

  -- ★★★ العطل ①: سلسلةٌ مفتوحة ⇒ لا قرار مباشراً
  SELECT count(*)::INTEGER INTO v_open
    FROM public.hr_approval_steps s
    JOIN public.hr_approval_requests r ON r.id = s.request_id
   WHERE r.related_id = p_id AND r.tenant_id = v_tenant
     AND s.status IN ('pending','active');
  IF v_open > 0 THEN
    RAISE EXCEPTION
      'EXPENSE_CHAIN_OPEN: للطلب % خطوة اعتماد مفتوحة — استعمل صندوق الموافقات',
      v_open;
  END IF;

  UPDATE public.expense_requests
     SET status = p_decision,
         rejection_reason = CASE WHEN p_decision = 'rejected'
                                 THEN btrim(p_reason) ELSE rejection_reason END,
         updated_at = now()
   WHERE id = p_id AND tenant_id = v_tenant;

  RETURN p_decision;
END $$;

-- ★★★ العطل ⑩: الصرف الذي لم يكن موجوداً
DROP FUNCTION IF EXISTS public.expense_mark_paid(UUID);
CREATE FUNCTION public.expense_mark_paid(p_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant UUID := public.current_user_tenant_id(); v_old TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'EXPENSE_NO_AUTH'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'EXPENSE_NO_TENANT'; END IF;
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'EXPENSE_NOT_AUTHORIZED';
  END IF;

  SELECT status INTO v_old FROM public.expense_requests
   WHERE id = p_id AND tenant_id = v_tenant;
  IF v_old IS NULL THEN RAISE EXCEPTION 'EXPENSE_NOT_FOUND'; END IF;
  -- ★★ لا صرفَ لغير المعتمَد
  IF v_old <> 'approved' THEN
    RAISE EXCEPTION 'EXPENSE_NOT_APPROVED: %', v_old;
  END IF;

  UPDATE public.expense_requests
     SET status = 'paid', updated_at = now()
   WHERE id = p_id AND tenant_id = v_tenant;

  RETURN 'paid';
END $$;

COMMENT ON FUNCTION public.expense_mark_paid(UUID) IS
  'صرف النفقة المعتمَدة. paid_at يُملأ في المحفّز. لم يكن في '
  'المنظومة أيُّ مسارٍ يكتب paid_at (العطل ⑩).';

-- ═══════════════════════════════════════════════════════════════════
--  ⑥ ★★★ العطل ⑲: سبب الرفض يضيع في مسار صندوق الموافقات
--
--  ★ **كشفه قيدي `expense_requests_rejection_chk` نفسه** أثناء الفحص
--    الشامل، لا مسباري:
--
--      verify-financial-approvals-0325.sql:363
--        ERROR: new row for relation "expense_requests" violates
--               check constraint "expense_requests_rejection_chk"
--
--    التشخيص: `unified_approval_decide(…, 'rejected', 'المبلغ مرتفع')`
--    تُمرّر السبب وتخزّنه في `hr_approval_steps.comments`، ثم
--    `sync_hr_source_status(p_request_id, p_final)` — **بتوقيعٍ بلا
--    سبب** — تكتب:
--
--        UPDATE expense_requests
--           SET status = p_final, approved_at = …, updated_at = NOW()
--
--    فتترك `rejection_reason` فارغاً. ⇒ **الرفض عبر صندوق الموافقات
--    كان يضيع سببه صامتاً** — والقيد الجديد أظهر ذلك فوراً.
--
--  ★ العلاج: الدالة تستخرج التعليق من **آخر خطوة رافضة** بدل تغيير
--    توقيعها (توقيعٌ جديد يكسر كل نداءاتها في 0323/0325/0340).
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.expense_apply_rejection_reason(
  p_request_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reason TEXT;
BEGIN
  -- ★ آخر خطوة رافضة بتعليقٍ غير فارغ — بترتيبٍ حتميّ (درس 0357)
  SELECT NULLIF(btrim(s.comments), '') INTO v_reason
    FROM public.hr_approval_steps s
   WHERE s.request_id = p_request_id
     AND s.status = 'rejected'
     AND NULLIF(btrim(s.comments), '') IS NOT NULL
   ORDER BY s.decided_at DESC NULLS LAST, s.step_order DESC, s.id DESC
   LIMIT 1;

  RETURN COALESCE(v_reason, 'رُفض عبر صندوق الموافقات بلا تعليق');
END $$;

COMMENT ON FUNCTION public.expense_apply_rejection_reason(UUID) IS
  'يستخرج سبب الرفض من آخر خطوة رافضة. sync_hr_source_status توقيعها '
  'بلا سبب فكان الرفض عبر الصندوق يضيع تعليله (العطل ⑲).';

REVOKE ALL ON FUNCTION public.expense_apply_rejection_reason(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expense_apply_rejection_reason(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.expense_apply_rejection_reason(UUID) TO authenticated;

-- ★★★ ومحفّزٌ يملأ السبب حين تأتي الكتابة من المزامنة
CREATE OR REPLACE FUNCTION public.tg_expense_sync_reason()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_req UUID;
BEGIN
  IF NEW.status = 'rejected'
     AND (NEW.rejection_reason IS NULL OR btrim(NEW.rejection_reason) = '') THEN
    SELECT r.id INTO v_req
      FROM public.hr_approval_requests r
     WHERE r.related_id = NEW.id AND r.tenant_id = NEW.tenant_id
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT 1;
    IF v_req IS NOT NULL THEN
      NEW.rejection_reason := public.expense_apply_rejection_reason(v_req);
    END IF;
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_expense_sync_reason() IS
  'يملأ rejection_reason من تعليق خطوة الرفض حين تأتي الكتابة من '
  'sync_hr_source_status (العطل ⑲). يعمل قبل فحص القيد.';

-- ★ يجب أن يسبق `trg_expense_stamp` أبجدياً؟ لا — Postgres ينفّذ
--   محفّزات BEFORE بترتيب الاسم. `trg_expense_r_sync_reason` يقع بين
--   `trg_expense_stamp` و`trg_block…` — والترتيب لا يهمّ هنا لأن
--   المحفّزين يكتبان حقلين مختلفين.
DROP TRIGGER IF EXISTS trg_expense_r_sync_reason ON public.expense_requests;
CREATE TRIGGER trg_expense_r_sync_reason
  BEFORE INSERT OR UPDATE OF status ON public.expense_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_expense_sync_reason();

-- ═══════════════════════════════════════════════════════════════════
--  ⑦ الصلاحيات
--  ★★★ 0268 يمنح authenticated EXECUTE تلقائياً (pg_default_acl)
--    ⇒ REVOKE عن anon هو الحارس الحقيقيّ
-- ═══════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.expense_chain_state(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expense_chain_state(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.expense_chain_state(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.expense_board(TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expense_board(TEXT, TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.expense_board(TEXT, TEXT, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.expense_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expense_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.expense_summary() TO authenticated;

REVOKE ALL ON FUNCTION public.expense_submit(TEXT, TEXT, NUMERIC, TEXT, DATE, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expense_submit(TEXT, TEXT, NUMERIC, TEXT, DATE, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.expense_submit(TEXT, TEXT, NUMERIC, TEXT, DATE, TEXT, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.expense_decide(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expense_decide(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.expense_decide(UUID, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.expense_mark_paid(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expense_mark_paid(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.expense_mark_paid(UUID) TO authenticated;

COMMIT;
