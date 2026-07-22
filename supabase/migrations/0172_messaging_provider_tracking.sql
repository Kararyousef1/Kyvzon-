-- ============================================================================
-- Kyvzon — 0172_messaging_provider_tracking.sql
-- توصيل SMS/واتساب الحقيقي: تتبّع معرّف رسالة المزوّد (Twilio SID).
--
-- السياق: وحدة الرسائل (0159) صُمّمت hook-based؛ الإرسال الخارجي يُسجَّل
--   'simulated' حتى إدخال مفاتيح مزوّد. هذا migration يضيف عمود تتبّع
--   provider_message_id في messaging_messages لربط الرسالة بمعرّف Twilio.
--
-- الإرسال الفعلي يتم عبر Edge Function (marketing-send-sms) التي تقرأ
--   TWILIO_* من Secrets. لا مفاتيح في قاعدة البيانات.
--
-- idempotent وآمن لإعادة التشغيل.
-- ============================================================================

ALTER TABLE public.messaging_messages
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_messaging_messages_provider
  ON public.messaging_messages(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messaging_messages' AND column_name = 'provider_message_id'
  ) THEN
    RAISE EXCEPTION 'FAILED: provider_message_id column missing';
  END IF;
  RAISE NOTICE '✅ 0172: تتبّع معرّف رسالة المزوّد (SMS/واتساب) جاهز';
END $$;

-- ============================================================================
-- نهاية 0172 — توصيل SMS/واتساب (Twilio) جاهز على مستوى المخطط.
-- ============================================================================
