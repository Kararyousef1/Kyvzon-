-- ============================================================================
-- _undo_0372_inversion.sql — عكسُ العكس قبل إعادة تطبيق 0372
--
-- ★★★★ الحقنُ في 0372 مشروطٌ بغياب العلامة:
--        IF position('LEAVE_SCOPE_FORBIDDEN' IN d) > 0 THEN … skip
--   ودالّةٌ عُكس حقنُها بـ`IF FALSE THEN` **تحتفظ بالعلامة** في نصّها،
--   فإعادةُ تطبيق المايجريشن تتخطّاها ويبقى العكسُ ساريًا إلى الأبد.
--   هذا ما أفسد الاسترجاع في أوّل تشغيلٍ لـ_invert_0372.
--
--   يُستدعى من `_invert_0372.py::reapply()` قبل المايجريشن.
-- ============================================================================

DO $undo$
DECLARE d TEXT; f TEXT; tag TEXT; typ TEXT; q TEXT := chr(39);
BEGIN
  FOREACH f IN ARRAY ARRAY['leave_requests_view','permission_requests_view'] LOOP
    tag := CASE WHEN f = 'leave_requests_view' THEN 'LEAVE_SCOPE_FORBIDDEN'
                ELSE 'PERM_SCOPE_FORBIDDEN' END;
    typ := CASE WHEN f = 'leave_requests_view' THEN 'leave' ELSE 'permission' END;

    SELECT pg_get_functiondef(
      ('public.' || f || '(TEXT,TEXT,INTEGER,INTEGER)')::regprocedure) INTO d;

    IF d LIKE '%IF FALSE THEN%' AND d LIKE '%' || tag || '%' THEN
      -- ★ chr(39) بدل تهريب علامات الاقتباس — أوضح وأقلّ عرضةً للخطأ
      d := replace(d, 'IF FALSE THEN',
             'IF NOT public.can_use_request_scope(p_scope, '
             || q || typ || q || ') THEN');
      EXECUTE d;
    END IF;
  END LOOP;
END $undo$;

-- ★ الدوال المستقلّة تُسقَط ليُعيدها المايجريشن كاملةً من الأصل
DROP FUNCTION IF EXISTS public.can_use_request_scope(TEXT,TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.leave_entitlement(UUID,INTEGER) CASCADE;
DROP FUNCTION IF EXISTS public.ensure_leave_balance(UUID,INTEGER) CASCADE;
DROP FUNCTION IF EXISTS public.leave_policy_board() CASCADE;
DROP FUNCTION IF EXISTS public.leave_policy_update(
  NUMERIC,NUMERIC,NUMERIC,INTEGER,NUMERIC,BOOLEAN) CASCADE;

-- ★ والقيود التي قد يكون العكسُ أسقطها أو بدّلها
ALTER TABLE public.leave_policies DROP CONSTRAINT IF EXISTS chk_leave_policy_sane;
ALTER TABLE public.leave_policies DROP CONSTRAINT IF EXISTS fk_leave_policy_tenant;
