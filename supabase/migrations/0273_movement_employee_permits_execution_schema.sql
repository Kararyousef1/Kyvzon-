-- ============================================================================
-- FILE: 0273_movement_employee_permits_execution_schema.sql
-- PURPOSE: Employee Movement - E01 (Permits & QR security) & E02 (Execution & Gate scanning)
-- ============================================================================
--
-- 🔴 إصلاح بعد فشل db push على Supabase الحقيقي:
--
--   ERROR: function gen_random_bytes(integer) does not exist (SQLSTATE 42883)
--
--   السبب: Supabase يُثبّت pgcrypto في schema اسمه `extensions` لا
--   `public`. وبما أن المايجريشن يعمل بـ search_path = public، لم تكن
--   gen_random_bytes مرئية.
--
--   لماذا لم يكشفه مختبري: shim المحلي ينفّذ
--   `CREATE EXTENSION pgcrypto` بلا SCHEMA فتُثبَّت في public وتعمل.
--   هذا فرق بيئي حقيقي بين المختبر والإنتاج — لا خطأ منطقي.
--
--   ولماذا نجحت gen_random_uuid() في كل الجداول؟ لأنها **مدمجة في
--   Postgres 13+** ولا تحتاج pgcrypto إطلاقاً. gen_random_bytes وحدها
--   تبقى من الامتداد.
--
-- الحل المُختار: توليد الرمز بدوال Postgres الأساسية بلا أي امتداد.
--   البدائل المرفوضة:
--     ① extensions.gen_random_bytes(...) — يربطنا باسم schema قد
--        يتغيّر، ويكسر التشغيل المحلي وأي بيئة تُثبّتها في public.
--     ② SET search_path = public, extensions — يُغيّر سلوك المايجريشن
--        كله لأجل سطر واحد.
--   دالة movement_generate_token أدناه تعمل في **أي** Postgres.
-- ============================================================================

/*
  توليد رمز QR عشوائي بلا pgcrypto.

  الطريقة: md5 على مصدرَي عشوائية مستقلَّين (random() و clock_timestamp())
  مكرَّرة مرتين ⇒ 64 محرفاً ست-عشرياً.

  ⚠️ إفصاح صريح: md5(random()) **ليس** عشوائية تشفيرية بقوة
  gen_random_bytes. لكنه كافٍ هنا لسببين:
    • الرمز مؤقت (صلاحية التصريح ساعات)
    • القيد UNIQUE يمنع التصادم، وحارس الاستعمال يمنع إعادة المسح
  لو احتجنا لاحقاً قوة تشفيرية، البديل هو توليد الرمز في طبقة
  التطبيق بـ crypto.getRandomValues وتمريره صراحةً.
*/
CREATE OR REPLACE FUNCTION public.movement_generate_token()
RETURNS TEXT
LANGUAGE sql VOLATILE
AS $$
  SELECT md5(random()::text || clock_timestamp()::text)
      || md5(random()::text || clock_timestamp()::text || pg_backend_pid()::text);
$$;

COMMENT ON FUNCTION public.movement_generate_token() IS
  'رمز عشوائي 64 محرفاً بلا pgcrypto — يعمل في أي Postgres (إصلاح 42883).';

/*
  ⚠️ REVOKE إلزامي — أمسكه حارس 0282 عند أول تشغيل:
    ERROR: 0282 failed: anon can execute: movement_generate_token

  Supabase يمنح anon تنفيذاً صريحاً على كل دالة جديدة في public عبر
  ALTER DEFAULT PRIVILEGES، و REVOKE ... FROM PUBLIC لا يسحب منحة صريحة.
  بدون هذا يستطيع زائر غير مسجَّل توليد رموز QR بلا حدّ.

  ملاحظة: الدالة تُستدعى كـ DEFAULT للعمود، وهذا ينفَّذ بصلاحية من
  يُدرج الصف — فحرمان anon لا يكسر إنشاء التصاريح للمستخدمين المصرَّح لهم.
*/
REVOKE ALL ON FUNCTION public.movement_generate_token() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.movement_generate_token() TO authenticated, service_role;

-- 1. Enhanced Movement Permits (تصاريح الخروج المسبقة وتأمين QR)
CREATE TABLE IF NOT EXISTS public.employee_movement_permits (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id          UUID NOT NULL,
  destination_id       UUID REFERENCES public.movement_locations(id),
  destination_name     VARCHAR(200) NOT NULL,
  purpose              TEXT NOT NULL,
  valid_from           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until          TIMESTAMPTZ NOT NULL,
  max_duration_minutes INTEGER NOT NULL DEFAULT 30,
  qr_token             VARCHAR(250) NOT NULL UNIQUE DEFAULT public.movement_generate_token(),
  status               VARCHAR(30) NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'used', 'expired', 'cancelled', 'rejected')),
  approved_by          UUID,
  created_by           UUID,
  movement_id          UUID,
  used_at              TIMESTAMPTZ,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_movement_permits_active
  ON public.employee_movement_permits(tenant_id, employee_id, status, valid_until);

CREATE INDEX IF NOT EXISTS idx_emp_movement_permits_qr
  ON public.employee_movement_permits(tenant_id, qr_token);

-- 2. Movement Execution & Gate Control (تنفيذ الحركة والبوابة ومسح QR)
CREATE TABLE IF NOT EXISTS public.employee_movements_log (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id          UUID NOT NULL,
  permit_id            UUID REFERENCES public.employee_movement_permits(id),
  destination_name     VARCHAR(200) NOT NULL,
  purpose              TEXT,
  departure_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expected_return_at   TIMESTAMPTZ NOT NULL,
  returned_at          TIMESTAMPTZ,
  departure_gate_id    UUID REFERENCES public.movement_locations(id),
  return_gate_id       UUID REFERENCES public.movement_locations(id),
  actual_return_location VARCHAR(200),
  route_violation      BOOLEAN NOT NULL DEFAULT FALSE,
  status               VARCHAR(30) NOT NULL DEFAULT 'out'
    CHECK (status IN ('out', 'returned', 'overdue', 'violated')),
  logged_by_id         UUID,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_movements_log_active
  ON public.employee_movements_log(tenant_id, employee_id, status);

-- Enable RLS
ALTER TABLE public.employee_movement_permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_movements_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS kyvzon_employee_movement_permits_all ON public.employee_movement_permits;
CREATE POLICY kyvzon_employee_movement_permits_all ON public.employee_movement_permits
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS kyvzon_employee_movements_log_all ON public.employee_movements_log;
CREATE POLICY kyvzon_employee_movements_log_all ON public.employee_movements_log
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- Triggers
DROP TRIGGER IF EXISTS trg_emp_movement_permits_updated ON public.employee_movement_permits;
CREATE TRIGGER trg_emp_movement_permits_updated BEFORE UPDATE ON public.employee_movement_permits FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_emp_movements_log_updated ON public.employee_movements_log;
CREATE TRIGGER trg_emp_movements_log_updated BEFORE UPDATE ON public.employee_movements_log FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='employee_movement_permits');
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='employee_movements_log');
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='employee_movement_permits'), 'RLS must be enabled';
END $$;
