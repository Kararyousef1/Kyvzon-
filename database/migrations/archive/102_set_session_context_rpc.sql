-- ============================================================================
-- Kyvzon Platform
-- Migration 102: RPC لضبط سياق الجلسة (app.current_role / app.current_tenant_id)
-- ============================================================================
-- المشكلة التي يحلها هذا الملف:
--   دوال is_platform_owner() و is_same_tenant() (من Migration 101) تعتمد على
--   current_setting('app.current_role') و current_setting('app.current_tenant_id')
--   لكن لا يوجد أي كود في التطبيق يضبط هاتين القيمتين بعد نجاح تسجيل الدخول.
--   النتيجة: كل RLS policies المبنية على هاتين الدالتين ترفض الوصول دائماً،
--   حتى للمستخدم الصحيح.
--
-- الحل:
--   دالة RPC واحدة (set_session_context) يستدعيها التطبيق فور نجاح تسجيل
--   الدخول. الدالة SECURITY DEFINER لكنها تقرأ الدور والـ tenant من قاعدة
--   البيانات نفسها (وليس مما يرسله العميل) — بحيث لا يمكن لمستخدم عادي
--   أن يدّعي أنه platform_owner عبر التلاعب بالطلب من المتصفح.
-- ============================================================================

-- ============================================================================
-- 1. دالة ضبط سياق الجلسة
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_session_context()
RETURNS TABLE (
  resolved_role      VARCHAR(50),
  resolved_tenant_id UUID,
  is_owner           BOOLEAN
)
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_role      VARCHAR(50);
  v_tenant_id UUID;
BEGIN
  -- إذا لا يوجد مستخدم مُصادَق عليه، لا نضبط شيئاً
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'لا توجد جلسة مصادقة نشطة';
  END IF;

  -- ✅ نقرأ الدور والـ tenant_id من profiles مباشرة (مصدر موثوق وحيد)
  -- لا نثق بأي قيمة قد يرسلها العميل لهذه الدالة نفسها — الدالة لا تقبل
  -- أي معامل مدخل أصلاً، لهذا السبب بالتحديد.
  SELECT role, tenant_id
  INTO v_role, v_tenant_id
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'لم يتم العثور على ملف تعريف لهذا المستخدم';
  END IF;

  -- ضبط session variables التي تعتمد عليها is_platform_owner() و is_same_tenant()
  -- الوسيط الثالث (false) يعني: القيمة صالحة طوال الجلسة (transaction + بعدها)
  -- وليس فقط للـ transaction الحالية.
  PERFORM set_config('app.current_role', v_role, false);
  PERFORM set_config('app.current_tenant_id', COALESCE(v_tenant_id::TEXT, ''), false);

  RETURN QUERY SELECT
    v_role,
    v_tenant_id,
    (v_role IN ('platform_owner', 'developer'));
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. صلاحية التنفيذ: أي مستخدم مُصادَق عليه يمكنه استدعاء الدالة
--    (الدالة نفسها تحدد دوره من profiles، فلا خطر من فتح التنفيذ للجميع)
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.set_session_context() TO authenticated;

-- ============================================================================
-- 3. دالة مساعدة: تصفير سياق الجلسة عند تسجيل الخروج
--    (احتياط إضافي؛ Supabase يُنشئ اتصالاً جديداً لكل طلب في الغالب،
--     لكن هذا يحمي في حال إعادة استخدام الاتصال pooled)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.clear_session_context()
RETURNS VOID
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.current_role', '', false);
  PERFORM set_config('app.current_tenant_id', '', false);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.clear_session_context() TO authenticated;

-- ============================================================================
-- تم الانتهاء: RPC لسدّ فجوة RLS بين تسجيل الدخول وضبط app.current_role
-- ============================================================================
