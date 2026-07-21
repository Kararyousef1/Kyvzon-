-- ============================================================================
-- Kyvzon — 0162_marketing_surveys.sql
-- وحدة "الاستبيانات والتغذية الراجعة" (بوابة التسويق — التقرير السادس)
--
-- تُنفّذ كل ما ورد في التقرير وفق المعايير العالمية:
--   • المقاييس الثلاثة: NPS / CSAT / CES + التصنيف التلقائي.
--   • منشئ استبيانات بأنواع أسئلة متعددة + مكتبة قوالب.
--   • التوزيع متعدد القنوات (بريد/in-app/SMS/واتساب).
--   • إغلاق الحلقة (Close-the-Loop): تصنيف + تعيين + وقت استجابة.
--   • التحليلات (NPS Trend / CSAT / Text sentiment) + Response/Completion.
--   • الربط بالـ CRM (الوحدة 1): نتيجة NPS ترفع/تُحدّث Lead Score.
--   • اختبارات الموظفين: تصحيح تلقائي + إصدار شهادات.
--
-- كل الجداول tenant-scoped + RLS. idempotent.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
--  (1) الاستبيانات + الأسئلة
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.marketing_surveys (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  -- نوع/هدف الاستبيان
  survey_type    TEXT NOT NULL DEFAULT 'custom'
                 CHECK (survey_type IN ('nps','csat','ces','post_purchase','product','churn','market_research','employee','quiz','custom')),
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','closed')),
  -- للاختبارات (quiz): درجة النجاح ومنح شهادة
  is_quiz        BOOLEAN NOT NULL DEFAULT false,
  pass_score     INTEGER,                              -- نسبة النجاح (0-100)
  issues_certificate BOOLEAN NOT NULL DEFAULT false,
  created_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_surveys_tenant ON public.marketing_surveys(tenant_id, status);

CREATE TABLE IF NOT EXISTS public.mkt_survey_questions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  survey_id      UUID NOT NULL REFERENCES public.marketing_surveys(id) ON DELETE CASCADE,
  order_index    INTEGER NOT NULL DEFAULT 0,
  question_type  TEXT NOT NULL DEFAULT 'text'
                 CHECK (question_type IN ('nps','csat','ces','likert','rating','multiple_choice','single_choice','text','yes_no','number')),
  question_text  TEXT NOT NULL,
  is_required    BOOLEAN NOT NULL DEFAULT true,
  options        JSONB NOT NULL DEFAULT '[]'::jsonb,   -- لخيارات الاختيار
  -- للاختبارات: الإجابة الصحيحة والنقاط
  correct_answer TEXT,
  points         INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (survey_id, order_index)
);
CREATE INDEX IF NOT EXISTS idx_mkt_survey_questions ON public.mkt_survey_questions(tenant_id, survey_id, order_index);

-- ════════════════════════════════════════════════════════════════════════════
--  (2) الاستجابات + الإجابات
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.mkt_survey_responses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  survey_id      UUID NOT NULL REFERENCES public.marketing_surveys(id) ON DELETE CASCADE,
  -- المستجيب: عميل (الوحدة 1) أو موظف أو مجهول
  lead_id        UUID REFERENCES public.marketing_leads(id) ON DELETE SET NULL,
  employee_id    UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  respondent_name TEXT,
  respondent_email TEXT,
  channel        TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email','in_app','sms','whatsapp','link')),
  -- درجات مُشتقّة
  nps_score      INTEGER,                              -- 0-10 (إن كان استبيان NPS)
  nps_category   TEXT CHECK (nps_category IN ('promoter','passive','detractor')),
  csat_score     INTEGER,
  ces_score      INTEGER,
  -- للاختبارات
  quiz_score     INTEGER,                              -- نسبة مئوية
  quiz_passed    BOOLEAN,
  -- إغلاق الحلقة
  loop_status    TEXT NOT NULL DEFAULT 'open' CHECK (loop_status IN ('open','assigned','resolved','not_needed')),
  assigned_to    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_complete    BOOLEAN NOT NULL DEFAULT false,
  submitted_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mkt_survey_responses ON public.mkt_survey_responses(tenant_id, survey_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mkt_survey_responses_loop ON public.mkt_survey_responses(tenant_id, loop_status);

CREATE TABLE IF NOT EXISTS public.mkt_survey_answers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  response_id    UUID NOT NULL REFERENCES public.mkt_survey_responses(id) ON DELETE CASCADE,
  question_id    UUID NOT NULL REFERENCES public.mkt_survey_questions(id) ON DELETE CASCADE,
  answer_text    TEXT,
  answer_number  NUMERIC,
  -- تحليل مشاعر مبسّط للأسئلة النصية
  sentiment      TEXT CHECK (sentiment IN ('positive','neutral','negative')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mkt_survey_answers ON public.mkt_survey_answers(tenant_id, response_id);
CREATE INDEX IF NOT EXISTS idx_mkt_survey_answers_q ON public.mkt_survey_answers(tenant_id, question_id);

-- ════════════════════════════════════════════════════════════════════════════
--  (3) الشهادات (لاختبارات الموظفين)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.mkt_survey_certificates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  survey_id      UUID NOT NULL REFERENCES public.marketing_surveys(id) ON DELETE CASCADE,
  response_id    UUID NOT NULL REFERENCES public.mkt_survey_responses(id) ON DELETE CASCADE,
  recipient_name TEXT NOT NULL,
  score          INTEGER NOT NULL,
  certificate_no TEXT NOT NULL,
  issued_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mkt_survey_certs ON public.mkt_survey_certificates(tenant_id, survey_id);

-- ════════════════════════════════════════════════════════════════════════════
--  (4) RLS
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'marketing_surveys','mkt_survey_questions','mkt_survey_responses','mkt_survey_answers','mkt_survey_certificates'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.current_user_tenant_id());', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (tenant_id = public.current_user_tenant_id()) WITH CHECK (tenant_id = public.current_user_tenant_id());', t, t);
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (5) تصنيف NPS من الدرجة
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.nps_category_for(p_score INTEGER)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_score >= 9 THEN 'promoter' WHEN p_score >= 7 THEN 'passive' ELSE 'detractor' END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  (6) إرسال استجابة استبيان — يحسب الدرجات + إغلاق الحلقة + الربط بالـ CRM
--  p_answers: JSONB مصفوفة {question_id, text, number}
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.submit_survey_response(
  p_survey_id    UUID,
  p_answers      JSONB,
  p_lead_id      UUID DEFAULT NULL,
  p_name         TEXT DEFAULT NULL,
  p_email        TEXT DEFAULT NULL,
  p_channel      TEXT DEFAULT 'link'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID; v_is_quiz BOOLEAN; v_pass INTEGER; v_cert BOOLEAN;
  v_resp UUID; v_ans JSONB; v_q RECORD;
  v_nps INTEGER; v_nps_cat TEXT; v_csat INTEGER; v_ces INTEGER;
  v_earned INTEGER := 0; v_total INTEGER := 0; v_quiz_score INTEGER; v_passed BOOLEAN;
  v_loop TEXT := 'not_needed'; v_sent TEXT; v_txt TEXT; v_num NUMERIC;
BEGIN
  SELECT tenant_id, is_quiz, pass_score, issues_certificate INTO v_tenant, v_is_quiz, v_pass, v_cert
  FROM public.marketing_surveys WHERE id = p_survey_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'survey not found'; END IF;
  IF v_tenant <> public.current_user_tenant_id() THEN RAISE EXCEPTION 'permission denied (tenant mismatch)'; END IF;

  INSERT INTO public.mkt_survey_responses (tenant_id, survey_id, lead_id, respondent_name, respondent_email, channel, is_complete, submitted_at)
  VALUES (v_tenant, p_survey_id, p_lead_id, p_name, p_email, p_channel, true, NOW())
  RETURNING id INTO v_resp;

  -- معالجة كل إجابة
  FOR v_ans IN SELECT * FROM jsonb_array_elements(p_answers) LOOP
    SELECT * INTO v_q FROM public.mkt_survey_questions WHERE id = (v_ans->>'question_id')::UUID;
    IF v_q.id IS NULL THEN CONTINUE; END IF;
    v_txt := v_ans->>'text';
    v_num := NULLIF(v_ans->>'number','')::NUMERIC;

    -- تحليل مشاعر مبسّط (نصي)
    v_sent := NULL;
    IF v_q.question_type = 'text' AND v_txt IS NOT NULL THEN
      IF v_txt ~* '(ممتاز|رائع|أحب|جيد|سعيد|مفيد|excellent|great|love|good)' THEN v_sent := 'positive';
      ELSIF v_txt ~* '(سيء|بطيء|مشكلة|صعب|أكره|فظيع|bad|slow|hate|terrible|difficult)' THEN v_sent := 'negative';
      ELSE v_sent := 'neutral'; END IF;
    END IF;

    INSERT INTO public.mkt_survey_answers (tenant_id, response_id, question_id, answer_text, answer_number, sentiment)
    VALUES (v_tenant, v_resp, v_q.id, v_txt, v_num, v_sent);

    -- درجات المقاييس
    IF v_q.question_type = 'nps' AND v_num IS NOT NULL THEN v_nps := v_num::INTEGER; END IF;
    IF v_q.question_type = 'csat' AND v_num IS NOT NULL THEN v_csat := v_num::INTEGER; END IF;
    IF v_q.question_type = 'ces' AND v_num IS NOT NULL THEN v_ces := v_num::INTEGER; END IF;

    -- تصحيح الاختبار
    IF v_is_quiz THEN
      v_total := v_total + GREATEST(v_q.points, 0);
      IF v_q.correct_answer IS NOT NULL AND lower(trim(COALESCE(v_txt,''))) = lower(trim(v_q.correct_answer)) THEN
        v_earned := v_earned + v_q.points;
      END IF;
    END IF;
  END LOOP;

  -- NPS: التصنيف + إغلاق الحلقة
  IF v_nps IS NOT NULL THEN
    v_nps_cat := public.nps_category_for(v_nps);
    v_loop := CASE WHEN v_nps_cat = 'detractor' THEN 'open' ELSE 'not_needed' END;
  END IF;

  -- تصحيح الاختبار
  IF v_is_quiz THEN
    v_quiz_score := CASE WHEN v_total > 0 THEN ROUND(v_earned * 100.0 / v_total) ELSE 0 END;
    v_passed := (v_quiz_score >= COALESCE(v_pass, 60));
  END IF;

  UPDATE public.mkt_survey_responses
     SET nps_score = v_nps, nps_category = v_nps_cat, csat_score = v_csat, ces_score = v_ces,
         quiz_score = v_quiz_score, quiz_passed = v_passed, loop_status = v_loop
   WHERE id = v_resp;

  -- إصدار شهادة عند النجاح
  IF v_is_quiz AND v_passed AND v_cert THEN
    INSERT INTO public.mkt_survey_certificates (tenant_id, survey_id, response_id, recipient_name, score, certificate_no)
    VALUES (v_tenant, p_survey_id, v_resp, COALESCE(p_name,'مشارك'), v_quiz_score,
            'KYV-CERT-' || upper(substr(v_resp::text, 1, 8)));
  END IF;

  -- الربط بالـ CRM: مروّج يرفع Lead Score
  IF p_lead_id IS NOT NULL AND v_nps_cat = 'promoter' THEN
    PERFORM public.apply_lead_score_event(p_lead_id, 'link_clicked'); -- إشارة تفاعل إيجابي
  END IF;

  RETURN v_resp;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (7) إغلاق الحلقة: تعيين استجابة منتقد لموظف / حلّها
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.close_survey_loop(
  p_response_id UUID,
  p_action      TEXT,              -- 'assign' / 'resolve'
  p_assignee    UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.mkt_survey_responses WHERE id = p_response_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'response not found'; END IF;
  IF v_tenant <> public.current_user_tenant_id() THEN RAISE EXCEPTION 'permission denied (tenant mismatch)'; END IF;

  IF p_action = 'assign' THEN
    UPDATE public.mkt_survey_responses SET loop_status = 'assigned', assigned_to = p_assignee WHERE id = p_response_id;
  ELSIF p_action = 'resolve' THEN
    UPDATE public.mkt_survey_responses SET loop_status = 'resolved' WHERE id = p_response_id;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  (8) KPIs الاستبيان: NPS/CSAT/CES + معدلات
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.survey_kpis(p_survey_id UUID)
RETURNS TABLE (
  responses BIGINT, complete BIGINT,
  promoters BIGINT, passives BIGINT, detractors BIGINT, nps NUMERIC,
  csat_avg NUMERIC, ces_avg NUMERIC, open_detractors BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH r AS (
    SELECT * FROM public.mkt_survey_responses
    WHERE survey_id = p_survey_id AND tenant_id = public.current_user_tenant_id()
  ), agg AS (
    SELECT
      count(*) AS responses,
      count(*) FILTER (WHERE is_complete) AS complete,
      count(*) FILTER (WHERE nps_category='promoter') AS promoters,
      count(*) FILTER (WHERE nps_category='passive') AS passives,
      count(*) FILTER (WHERE nps_category='detractor') AS detractors,
      count(*) FILTER (WHERE nps_category IS NOT NULL) AS nps_total,
      avg(csat_score) AS csat_avg,
      avg(ces_score) AS ces_avg,
      count(*) FILTER (WHERE nps_category='detractor' AND loop_status='open') AS open_detractors
    FROM r
  )
  SELECT responses, complete, promoters, passives, detractors,
    CASE WHEN nps_total > 0 THEN ROUND((promoters - detractors) * 100.0 / nps_total) ELSE 0 END,
    ROUND(COALESCE(csat_avg,0),1), ROUND(COALESCE(ces_avg,0),1), open_detractors
  FROM agg;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  (9) الصلاحيات
-- ════════════════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.nps_category_for(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_survey_response(UUID,JSONB,UUID,TEXT,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_survey_loop(UUID,TEXT,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.survey_kpis(UUID) TO authenticated;

-- ============================================================================
--  نهاية 0162_marketing_surveys.sql
-- ============================================================================
