-- ============================================================================
-- 0326_unify_notification_surface.sql
--
-- توحيد سطح الإشعارات: بوابة التواصل تصل الجرس · تنظيف الأيتام.
--
-- ══ ما فُحص فعلياً قبل أي تعديل ═══════════════════════════════════════
--
--  ★ تصحيح لتقديرٍ سابق في قائمة النواقص:
--    وُصفت الحالة بأنها «تسعة أنظمة إشعارات منفصلة». الفحص الفعلي
--    على Postgres أظهر تصنيفاً أدقّ — أربع فئات لا فئة واحدة:
--
--    ① يستهدف مستخدماً ويصل الجرس:  `notifications`
--    ② يستهدف مستخدماً ولا يصله:    `tawathul_notifications`   ← العطل
--    ③ يتيم بلا كاتب:               `inventory_inbound_notifications`
--    ④ سجلّ تدقيق لا إشعار مستخدم:  `movement_notification_log`
--                                    `procurement_notification_log`
--                                    `*_dispatch_status` ×2
--                                    `inventory_customer_shipping_*`
--                                    `inventory_return_customer_*`
--
--    الفئة ④ **لا يجوز دمجها**: لا `user_id` ولا `is_read` فيها، وهي
--    سجلّات «أُرسل كذا في تاريخ كذا لعدد كذا» أو طوابير إرسال خارجي
--    (بريد/رسائل للعملاء). دمجها في جرس المستخدم خطأ تصميمي لا إصلاح.
--
--    والحركة والمشتريات **تكتبان في `notifications` الموحّد أصلاً**
--    (مُحقَّق: `INSERT INTO public.notifications` داخل
--    `notify_movement_roles_for_tenant` و`notify_procurement_roles_for_tenant`).
--    فالسجلّات لديهما إضافة تدقيقية لا بديل.
--
-- ══ الأعطال المُثبَتة تشغيلياً ═════════════════════════════════════════
--
--  ① ★ رسائل التواصل لا تصل جرس الإشعارات إطلاقاً.
--     `tawathul_notify_on_message` تكتب في `tawathul_notifications`
--     وحدها. مقيس على Postgres:
--        tawathul_notifications = 1
--        notifications          = 0   ← الجرس لا يرى شيئاً
--        my_unread_notification_count = 0
--        بينما لدى المستخدم 1 إشعار تواصل غير مقروء
--
--     الأثر: موظف يُشار إليه بالاسم في محادثة لا يعلم — إلا إن فتح
--     بوابة التواصل بنفسه. الجرس يقول «لا جديد» وهو كاذب.
--
--  ② ★ `inventory_inbound_notifications` جدول يتيم.
--     مقيس: صفر دالة تكتب فيه · صفر محفّز · والواجهة تقرؤه عبر
--     `InventoryInboundNotificationService`. جدول يُقرأ ولا يُكتب أبداً
--     ⇒ شاشة فارغة دائماً بلا تفسير.
--
--  ③ الإشعار المقروء في بوابة التواصل يبقى غير مقروء في الجرس والعكس.
--     نظامان مستقلان لنفس الحدث ⇒ العدّاد لا يهدأ.
--
-- ══ ما فُحص فوجد سليماً (تصحيح توقّع) ══════════════════════════════════
--
--  عزل بوابة التواصل **سليم تماماً**. اختُبر بـRLS حقيقي:
--     موظف من شركة أخرى        ⇒ 0 محادثة · 0 رسالة · 0 عضو
--     موظف من نفس الشركة غير عضو ⇒ 0 محادثة · 0 رسالة
--     عضو حقيقي                 ⇒ 1 رسالة ✔
--  و22 سياسة RLS على 8 جداول. لم أغيّر شيئاً هنا.
--
-- ══ المبدأ ══════════════════════════════════════════════════════════════
--   لا نُلغي `tawathul_notifications` — هي تحمل `conversation_id`
--   و`message_id` وتخدم واجهة التواصل. نُضيف **جسراً**: كل إشعار تواصل
--   يُنسخ إلى `notifications` بـ`group_key` يربطهما، والقراءة تتزامن
--   في الاتجاهين.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- ① جسر التواصل ← الجرس الموحّد — عطل ①
--
--    نُبقي الكتابة في الجدول الخاص (واجهة التواصل تعتمده) ونُضيف نسخة
--    في `notifications` عبر `notify_user` — فتُطبَّق حراستها كلها:
--    لا إشعار ذاتي · لا انهيار للعملية الأصلية عند فشل الإشعار.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tawathul_notify_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     RECORD;
  v_title   TEXT;
  v_conv    TEXT;
  v_is_ment BOOLEAN;
BEGIN
  -- عنوان المحادثة للسياق: «رسالة جديدة» وحدها لا تُخبر أين
  SELECT c.title INTO v_conv
    FROM public.tawathul_conversations c
   WHERE c.id = NEW.conversation_id;

  FOR v_row IN
    SELECT m.user_id
      FROM public.tawathul_members m
     WHERE m.conversation_id = NEW.conversation_id
       AND m.left_at IS NULL
       AND m.user_id IS DISTINCT FROM NEW.sender_id
       AND COALESCE(m.is_muted, FALSE) = FALSE
  LOOP
    v_is_ment := NEW.mentions IS NOT NULL
                 AND NEW.mentions @> to_jsonb(ARRAY[v_row.user_id::TEXT]);

    v_title := CASE WHEN v_is_ment THEN 'تمت الإشارة إليك' ELSE 'رسالة جديدة' END;

    -- (أ) الجدول الخاص — واجهة التواصل تقرؤه (conversation_id/message_id)
    INSERT INTO public.tawathul_notifications
      (tenant_id, user_id, conversation_id, message_id, type, title, body)
    VALUES
      (NEW.tenant_id, v_row.user_id, NEW.conversation_id, NEW.id,
       CASE WHEN v_is_ment THEN 'mention' ELSE 'message' END,
       v_title, LEFT(COALESCE(NEW.body, 'مرفق'), 180));

    -- (ب) ★ الجرس الموحّد — لم يكن يحدث أبداً (عطل ①).
    --     group_key يربط النسختين لمزامنة القراءة.
    PERFORM public.notify_user(
      NEW.tenant_id,
      v_row.user_id,
      CASE WHEN v_is_ment THEN 'tawathul_mention' ELSE 'tawathul_message' END,
      v_title || COALESCE(' — ' || v_conv, ''),
      LEFT(COALESCE(NEW.body, 'مرفق'), 180),
      '/app/tawathul?c=' || NEW.conversation_id::TEXT,
      'tawathul_messages',
      NEW.id);
  END LOOP;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tawathul_notify_on_message() IS
  'إشعار أعضاء المحادثة في الجدول الخاص **وفي** notifications الموحّد. '
  'قبل 0326 كانت رسائل التواصل لا تصل الجرس إطلاقاً: '
  'tawathul_notifications=1 بينما notifications=0 (عطل ①).';

-- ─────────────────────────────────────────────────────────────────────────
-- ② مزامنة القراءة في الاتجاهين — عطل ③
--
--    قراءة الإشعار في بوابة التواصل تُعلّم نظيره في الجرس والعكس،
--    عبر (user_id, related_table='tawathul_messages', related_id).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_sync_tawathul_read()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- لا تغيير في حالة القراءة ⇒ لا عمل
  IF COALESCE(NEW.is_read, FALSE) IS NOT DISTINCT FROM COALESCE(OLD.is_read, FALSE) THEN
    RETURN NEW;
  END IF;
  IF NOT COALESCE(NEW.is_read, FALSE) THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'tawathul_notifications' THEN
    UPDATE public.notifications n
       SET is_read = TRUE, read_at = COALESCE(n.read_at, NOW())
     WHERE n.user_id        = NEW.user_id
       AND n.tenant_id      = NEW.tenant_id
       AND n.related_table  = 'tawathul_messages'
       AND n.related_id     = NEW.message_id
       AND NOT COALESCE(n.is_read, FALSE);

  ELSIF TG_TABLE_NAME = 'notifications'
        AND NEW.related_table = 'tawathul_messages' THEN
    UPDATE public.tawathul_notifications t
       SET is_read = TRUE
     WHERE t.user_id    = NEW.user_id
       AND t.tenant_id  = NEW.tenant_id
       AND t.message_id = NEW.related_id
       AND NOT COALESCE(t.is_read, FALSE);
  END IF;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_sync_tawathul_read() IS
  'يزامن حالة القراءة بين tawathul_notifications و notifications. '
  'بدونه يبقى الإشعار مقروءاً في مكان وغير مقروء في الآخر فلا يهدأ '
  'العدّاد (عطل 0326/③).';

DROP TRIGGER IF EXISTS trg_sync_tawathul_read ON public.tawathul_notifications;
CREATE TRIGGER trg_sync_tawathul_read
  AFTER UPDATE OF is_read ON public.tawathul_notifications
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_tawathul_read();

DROP TRIGGER IF EXISTS trg_sync_tawathul_read ON public.notifications;
CREATE TRIGGER trg_sync_tawathul_read
  AFTER UPDATE OF is_read ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_tawathul_read();

-- ─────────────────────────────────────────────────────────────────────────
-- ③ الجدول اليتيم: كاتب حقيقي — عطل ②
--
--    `inventory_inbound_notifications` تُقرأ من
--    `InventoryInboundNotificationService` ولا يكتب فيها أحد
--    (مقيس: صفر دالة · صفر محفّز) ⇒ شاشة فارغة دائماً.
--
--    نُعطيها دالة كتابة تُغذّي الجدول **والجرس** معاً بدل تركها ميتة.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.notify_inventory_inbound(TEXT, TEXT, UUID, TEXT, TEXT, UUID, TEXT);

CREATE FUNCTION public.notify_inventory_inbound(
  p_event_type   TEXT,
  p_title        TEXT,
  p_target_user  UUID  DEFAULT NULL,
  p_body         TEXT  DEFAULT NULL,
  p_entity_table TEXT  DEFAULT NULL,
  p_entity_id    UUID  DEFAULT NULL,
  p_target_role  TEXT  DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_row    RECORD;
  v_n      INT := 0;
BEGIN
  IF v_tenant IS NULL THEN RETURN 0; END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN RETURN 0; END IF;

  -- مستخدم بعينه
  IF p_target_user IS NOT NULL THEN
    INSERT INTO public.inventory_inbound_notifications
      (tenant_id, event_type, target_role, target_user_id,
       entity_table, entity_id, title, body)
    VALUES (v_tenant, p_event_type, p_target_role, p_target_user,
            p_entity_table, p_entity_id, p_title, p_body);

    IF public.notify_user(v_tenant, p_target_user, 'inventory_inbound',
         p_title, p_body, '/app/inventory/receiving',
         p_entity_table, p_entity_id) IS NOT NULL
    THEN v_n := v_n + 1;
    END IF;
    RETURN v_n;
  END IF;

  -- أو كل شاغلي دور في وحدة المخزون
  IF p_target_role IS NOT NULL THEN
    FOR v_row IN
      SELECT DISTINCT u.user_id
        FROM public.portal_unit_assignments u
       WHERE u.tenant_id = v_tenant
         AND u.is_active
         AND u.unit_key  = 'inventory'
         AND u.base_role = p_target_role
    LOOP
      INSERT INTO public.inventory_inbound_notifications
        (tenant_id, event_type, target_role, target_user_id,
         entity_table, entity_id, title, body)
      VALUES (v_tenant, p_event_type, p_target_role, v_row.user_id,
              p_entity_table, p_entity_id, p_title, p_body);

      IF public.notify_user(v_tenant, v_row.user_id, 'inventory_inbound',
           p_title, p_body, '/app/inventory/receiving',
           p_entity_table, p_entity_id) IS NOT NULL
      THEN v_n := v_n + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN v_n;
END $$;

COMMENT ON FUNCTION public.notify_inventory_inbound(TEXT,TEXT,UUID,TEXT,TEXT,UUID,TEXT) IS
  'يكتب إشعار استلام المخزون في جدوله **وفي** الجرس الموحّد. الجدول كان '
  'يتيماً: تقرؤه الواجهة ولا يكتب فيه أحد (عطل 0326/②).';

REVOKE ALL ON FUNCTION public.notify_inventory_inbound(TEXT,TEXT,UUID,TEXT,TEXT,UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_inventory_inbound(TEXT,TEXT,UUID,TEXT,TEXT,UUID,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.notify_inventory_inbound(TEXT,TEXT,UUID,TEXT,TEXT,UUID,TEXT)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ④ لوحة سطح الإشعارات — تشخيص لا تخمين
--
--    تُظهر لكل جدول إشعارات: فئته · هل يصل الجرس · عدد صفوفه.
--    الغرض أن يُبنى أي قرار لاحق على قياس لا على ذاكرة.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.notification_surface_overview();

CREATE FUNCTION public.notification_surface_overview()
RETURNS TABLE(
  out_table       TEXT,
  out_category    TEXT,
  out_reaches_bell BOOLEAN,
  out_rows        BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_user_tenant_id();
  v_t      TEXT;
  v_cnt    BIGINT;
  v_has_u  BOOLEAN;
  v_has_r  BOOLEAN;
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  FOR v_t IN
    SELECT t.table_name FROM information_schema.tables t
     WHERE t.table_schema = 'public'
       AND t.table_type = 'BASE TABLE'
       AND (t.table_name LIKE '%notification%')
     ORDER BY t.table_name
  LOOP
    SELECT EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema='public' AND c.table_name=v_t
                      AND c.column_name IN ('user_id','target_user_id')),
           EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema='public' AND c.table_name=v_t
                      AND c.column_name='is_read')
      INTO v_has_u, v_has_r;

    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE tenant_id = $1', v_t)
      INTO v_cnt USING v_tenant;

    out_table        := v_t;
    out_category     := CASE
                          WHEN v_t = 'notifications'            THEN 'الجرس الموحّد'
                          WHEN v_has_u AND v_has_r              THEN 'إشعار مستخدم — مجسور'
                          ELSE 'سجلّ تدقيق/إرسال خارجي'
                        END;
    out_reaches_bell := (v_t = 'notifications') OR (v_has_u AND v_has_r);
    out_rows         := v_cnt;
    RETURN NEXT;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.notification_surface_overview() IS
  'تشخيص سطح الإشعارات: فئة كل جدول وهل يصل الجرس. سجلّات التدقيق '
  'والإرسال الخارجي لا user_id فيها فلا تُدمج عمداً.';

REVOKE ALL ON FUNCTION public.notification_surface_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notification_surface_overview() FROM anon;
GRANT EXECUTE ON FUNCTION public.notification_surface_overview() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- ⑤ عدّاد الجرس يشمل التواصل — يوسّع 0323
--
--    الجسر يجعل رسائل التواصل في `notifications`، فالعدّاد يلتقطها
--    تلقائياً. نُبقيه كما هو ونضيف تفصيلاً حسب النوع للواجهة.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.my_unread_by_kind();

CREATE FUNCTION public.my_unread_by_kind()
RETURNS TABLE(out_kind TEXT, out_count INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
           WHEN n.type LIKE 'tawathul%' THEN 'messages'
           WHEN n.type LIKE 'approval%' THEN 'approvals'
           ELSE 'other'
         END AS out_kind,
         count(*)::INTEGER AS out_count
    FROM public.notifications n
   WHERE n.user_id   = auth.uid()
     AND n.tenant_id = public.current_user_tenant_id()
     AND NOT COALESCE(n.is_read, FALSE)
     AND (n.expires_at IS NULL OR n.expires_at > NOW())
   GROUP BY 1;
$$;

COMMENT ON FUNCTION public.my_unread_by_kind() IS
  'تفصيل غير المقروء حسب النوع: رسائل · موافقات · أخرى.';

REVOKE ALL ON FUNCTION public.my_unread_by_kind() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_unread_by_kind() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_unread_by_kind() TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ 0326: توحيد سطح الإشعارات — التواصل يصل الجرس';
END $$;
