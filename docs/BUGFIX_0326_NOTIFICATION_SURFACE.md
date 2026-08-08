# 0326 — توحيد سطح الإشعارات: بوابة التواصل تصل الجرس

**التاريخ:** 2026-08-05 · **الفرع:** `remediation/p0-security-and-build-health`
**الحالة:** مُطبَّق ومُختبَر على Postgres 17.10 محلي · **لم يُدفع للسحابة بعد**

---

## ⚠️ تصحيح تقديرٍ سابق في قائمة النواقص

القائمة وصفت الحالة بأنها **«تسعة أنظمة إشعارات منفصلة»** تحتاج توحيداً.
الفحص الفعلي على Postgres أظهر تصنيفاً أدقّ — **أربع فئات لا فئة واحدة**:

| الفئة | الجداول | `user_id` | `is_read` | القرار |
|---|---|---|---|---|
| ① الجرس الموحّد | `notifications` | ✔ | ✔ | المرجع |
| ② يستهدف مستخدماً ولا يصل الجرس | `tawathul_notifications` | ✔ | ✔ | **جُسِر** |
| ③ يتيم بلا كاتب | `inventory_inbound_notifications` | ✔ | ✔ | **أُحيي** |
| ④ سجلّ تدقيق / إرسال خارجي | `movement_notification_log` · `procurement_notification_log` · `*_dispatch_status`×2 · `inventory_customer_shipping_*` · `inventory_return_customer_*` | ✗ | ✗ | **لا تُدمج عمداً** |

**الفئة ④ لا يجوز دمجها.** لا `user_id` ولا `is_read` فيها؛ هي سجلّات
«أُرسل كذا في تاريخ كذا لعدد كذا» أو طوابير إرسال خارجي (بريد ورسائل
للعملاء). دمجها في جرس المستخدم خطأ تصميمي لا إصلاح.

وتبيّن كذلك أن **الحركة والمشتريات تكتبان في `notifications` الموحّد
أصلاً** — مُحقَّق بقراءة `notify_movement_roles_for_tenant` و
`notify_procurement_roles_for_tenant`: كلتاهما فيها
`INSERT INTO public.notifications`. فسجلّاتهما إضافة تدقيقية لا بديل.

فالعدد الحقيقي للأنظمة المنفصلة التي تحتاج إصلاحاً كان **اثنين** لا تسعة.

---

## ★ العطل ① — رسائل التواصل لا تصل الجرس إطلاقاً

`tawathul_notify_on_message` تكتب في `tawathul_notifications` وحدها.
مقيس على Postgres:

```
tawathul_notifications       = 1
notifications                = 0     ← الجرس لا يرى شيئاً
my_unread_notification_count = 0
بينما لدى المستخدم 1 إشعار تواصل غير مقروء
```

**الأثر:** موظف يُشار إليه بالاسم في محادثة لا يعلم — إلا إن فتح بوابة
التواصل بنفسه. الجرس يقول «لا جديد» وهو كاذب.

### الحل: جسر لا استبدال

`tawathul_notifications` تحمل `conversation_id` و`message_id` وتخدم
واجهة التواصل، فلا تُلغى. أُضيفت نسخة في `notifications` عبر
**`notify_user`** — فتُطبَّق حراستها كلها:

- لا إشعار ذاتي (`p_user_id = auth.uid()` ⇒ `NULL`)
- فشل الإشعار لا يُسقط العملية الأصلية (`EXCEPTION WHEN OTHERS`)
- `related_table='tawathul_messages'` + `related_id` يربطان النسختين

وأُضيف ما لم يكن: **عنوان المحادثة** في نص الإشعار («رسالة جديدة» وحدها
لا تُخبر أين) و**رابط للمحادثة بعينها** `/app/tawathul?c=<id>`.

---

## العطلان ② و③

| # | العطل | القياس |
|---|---|---|
| ② | `inventory_inbound_notifications` جدول يتيم | صفر دالة تكتب فيه · صفر محفّز · والواجهة تقرؤه عبر `InventoryInboundNotificationService` ⇒ شاشة فارغة دائماً بلا تفسير |
| ③ | القراءة لا تتزامن | الإشعار مقروء في بوابة التواصل وغير مقروء في الجرس والعكس ⇒ العدّاد لا يهدأ |

للعطل ③ محفّز في **الاتجاهين** على `is_read`، يتجاهل التحديث الذي لا
يغيّر حالة القراءة (لا حلقة لانهائية) ويحصر المزامنة بالمستخدم والمستأجر
نفسه.

---

## ✔ ما فُحص فوجد سليماً — تصحيح توقّعي

توقّعتُ ثغرة عزل في بوابة التواصل. **الفحص أثبت العكس.** اختُبر بـRLS
حقيقي (`SET ROLE authenticated`):

```
موظف من شركة أخرى            ⇒ 0 محادثة · 0 رسالة · 0 عضو
موظف من نفس الشركة غير عضو    ⇒ 0 محادثة · 0 رسالة
عضو حقيقي                     ⇒ 1 رسالة ✔
```

و**22 سياسة RLS** على 8 جداول تواصل. لم أغيّر شيئاً هناك.

لكن الادّعاء بلا اختبار دائم لا قيمة له، فكتبتُ
`verify-tawathul-isolation-0326-rls.sh` (8 فحوص) — وأثبتُّ أنه يلتقط
تسريباً فعلياً بتوسيع سياسة `notifications_select_own` مؤقتاً:

```
❌ ★ الجسر كشف محادثة لغير عضو: 1
```

ثم استُرجعت السياسة فعاد `8/8`.

---

## إثبات العكس

| العكس | التأكيد الساقط |
|---|---|
| إزالة الجسر | `2.2 ★ رسالة التواصل لم تصل الجرس (0) — الموظف لا يعلم` |
| إزالة محفّز المزامنة | `1.2 محفّزات مزامنة القراءة = 1 (متوقَّع 2)` |
| `notify_inventory_inbound` لا تكتب في الجرس | `6.3 ★ إشعار المخزون لم يصل الجرس (0)` |
| توسيع سياسة قراءة الجرس (RLS) | `❌ ★ الجسر كشف محادثة لغير عضو: 1` |

بعد كل استرجاع: `✅ verify-0326: 36/36` و`✅ verify-0326-rls: 8/8`.

---

## خطأ منهجي وقعتُ فيه

اختباري الأول سقط بـ:
```
new row for relation "inventory_inbound_notifications"
violates check constraint "inventory_inbound_notifications_event_type_check"
```

كنتُ اخترعتُ `'asn_arrived'` من رأسي. القيم الحقيقية المسموحة:
`asn_created` · `dock_scheduled` · `receiving_posted` · `quality_required`
· `osd_created` · `putaway_created` · `cross_dock_ready` · `po_updated`.

نفس الدرس المتكرر: **لا تُخمّن عموداً ولا قيمة — استخرجها من
`information_schema` و`pg_constraint`.** وُثّق القيد في الاختبار نفسه.

---

## حالة الفحوص

```
255 مايجريشن من الصفر            صفر فشل
33/34 ملف سلوكي · 420 تأكيداً مرقّماً
verify-0326         36/36
verify-0326-rls      8/8   (RLS حقيقي)
verify-0324-rls      5/5   (RLS حقيقي)
2281/2281 اختبار وحدة في 119 ملفاً   (+31 جديداً)
tsc EXIT=0
lint 0 خطأ · 1322 تحذيراً
build ✅  ·  db:contract-check PASS
sdk:boundary-check: 52 انتهاكاً موروثاً — صفر في الجديد
```

**الملف الفاشل الوحيد:** `verify-procurement-0256-0269.sql` — أداة تشخيص
للسحابة تقرأ `supabase_migrations.schema_migrations` (غير موجود محلياً).
ليس اختباراً ولم يُلمَس.

---

## ما لم يُختبر

- **المتصفح** — لم يُختبر في أي جولة.
- **Supabase حقيقي** — `db push` لـ`0317`–`0326` بيد المستخدم.
- **Realtime**: الجرس يشترك عبر `supabase.channel` على `notifications`.
  الجسر يجعل رسائل التواصل تصل هذه القناة، لكن ذلك يتطلّب أن يكون جدول
  `notifications` مضافاً في **Realtime publication** بلوحة Supabase.
  إن لم يكن، سيظهر الإشعار عند إعادة التحميل لا فوراً.
- **`notify_inventory_inbound` بلا مُستدعٍ بعد**: الدالة جاهزة والجدول
  صار قابلاً للكتابة، لكن ربطها بأحداث الاستلام الفعلية (وصول ASN،
  جدولة رصيف…) عمل منفصل في بوابة المخزون.

---

## الملفات

```
supabase/migrations/0326_unify_notification_surface.sql        جديد
tools/dev/verify-notification-surface-0326.sql                 جديد · 36 تأكيداً
tools/dev/verify-tawathul-isolation-0326-rls.sh                جديد · 8 عبر RLS
src/test/notificationSurfaceContract.test.ts                   جديد · 31 اختباراً
src/modules/tawathul/services/TawathulNotificationService.ts   توثيق المزامنة
```
