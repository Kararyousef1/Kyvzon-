-- ============================================================================
-- Kyvzon — 0171_email_provider_resend.sql
-- توصيل البريد الحقيقي: إضافة 'resend' كمزوّد مدعوم + تتبّع معرّف رسالة المزوّد.
--
-- السياق: بوابة التسويق (وحدة البريد 0156) صُمّمت hook-based؛ الإرسال الخارجي
--   يُسجَّل 'simulated' حتى إدخال مفتاح مزوّد. هذا migration يضيف Resend للقائمة
--   المسموحة ويضيف عمود provider_message_id في email_events لتتبّع التسليم الفعلي.
--
-- الإرسال الفعلي يتم عبر Edge Function (marketing-send-email) التي تقرأ
--   RESEND_API_KEY من Secrets. لا مفاتيح في قاعدة البيانات.
--
-- idempotent وآمن لإعادة التشغيل.
-- ============================================================================

-- (1) توسيع قيد المزوّد ليشمل 'resend'
ALTER TABLE public.email_sender_domains
  DROP CONSTRAINT IF EXISTS email_sender_domains_provider_check;
ALTER TABLE public.email_sender_domains
  ADD CONSTRAINT email_sender_domains_provider_check
  CHECK (provider IN ('simulation','resend','sendgrid','amazon_ses','mailgun','postmark'));

-- (2) عمود تتبّع معرّف رسالة المزوّد (لربط الأحداث بالمزوّد) — إن لم يوجد
ALTER TABLE public.email_events
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_email_events_provider_msg
  ON public.email_events(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- (3) تأكيد (assertion) أن التوسيع طُبّق
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'email_sender_domains_provider_check'
      AND check_clause LIKE '%resend%'
  ) THEN
    RAISE EXCEPTION 'FAILED: provider constraint does not include resend';
  END IF;
  RAISE NOTICE '✅ 0171: resend مضاف كمزوّد + provider_message_id جاهز';
END $$;

-- ============================================================================
-- نهاية 0171 — توصيل البريد (Resend) جاهز على مستوى المخطط.
-- ============================================================================
