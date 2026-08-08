# 0332 — بوابة التقنية: الصادرات الموحّدة وأحداث الناقلين

> **الحالة:** المايجريشن مكتوب ومُختبَر على Postgres 17 محلي. **لم يُدفع** —
> الدفع مؤجَّل بقرار صريح حتى انتهاء العمل من المشاكل.
> **لم يُختبر في المتصفح** — كل ما يلي منطق قاعدة وفحص ثابت.

---

## ما الذي كان معطوباً — مُثبَت تشغيلياً قبل أي سطر إصلاح

أُدخلت بيانات حقيقية على Postgres محلي بمستأجر واحد، ثم استُدعيت الدوال
القائمة. هذا ناتج التشغيل الحرفي:

```
★ العطل ①: tech_export_log = 0 صف (5 صادرات حقيقية موجودة)
★ العطل ②: tech_export_summary = 0 نوع
--- الحقيقة ---
  finance_report_exports=2
  inventory_report_exports=1
  mrp_bom_export_requests=1
  mrp_manufacturing_export_requests=1
★ العطل ③: صادرات فاشلة=1 بلا أي إشعار أو عرض
★ العطل ④: webhooks عالقة=2 بلا عرض
```

بعد `0332`، نفس السيناريو الحرفي:

```
بعد الإصلاح: tech_export_log = 5 صف
بعد الإصلاح: tech_export_summary = 4 مصدر
```

### ① سجلّ الصادرات كان يقرأ جدولاً واحداً من خمسة

`tech_export_log` (من `0331`) قرأت `public.export_logs` وحده. هذا جدول
تسجيل يدوي **لا تكتب فيه** أي من مسارات التصدير الأربعة الفعلية:

| الجدول | من يكتب فيه |
|---|---|
| `finance_report_exports` | `request_finance_report_export()` |
| `inventory_report_exports` | `request_inventory_report_export()` |
| `mrp_bom_export_requests` | `request_mrp_bom_export()` |
| `mrp_manufacturing_export_requests` | `request_mrp_manufacturing_report_export()` |
| `export_logs` | استدعاء يدوي من الواجهة |

**الأثر:** تصدير البيانات حدث أمني — من أخرج ماذا ومتى. وكان خفيّاً
بالكامل عن بوابة التقنية.

### ② الملخّص ورث العطل نفسه

`tech_export_summary` جمعت من `export_logs` أيضاً، فأعادت صفراً.

### ③ الصادرة الفاشلة بلا سطح

`finance_report_exports.error_message` عمود موجود ويُكتب فيه، ولا شيء
يقرؤه. الصادرة تسقط، فلا التقني يعلم ولا طالبها.

### ④ العالق أخطر من الفاشل

صادرة بحالة `queued` منذ 30 ساعة تبدو «في الطابور» إلى الأبد. لا أحد
يُنبَّه لأنها ليست `failed`. والمثل في `inventory_carrier_webhook_events`:
حدثان `processed=false` أحدهما عمره 30 ساعة — يعني أن تتبّع شحنة العميل
توقّف بصمت.

---

## ما بُني

### الدوال الخمس — كلها `SECURITY INVOKER`

| الدالة | التوقيع | الغرض |
|---|---|---|
| `tech_export_log` | `(TEXT, TEXT, INTEGER, INTEGER)` | `UNION ALL` فوق خمسة مصادر بترشيح مصدر وحالة |
| `tech_export_summary` | `(INTEGER)` | صف لكل مصدر: إجمالي · جاهز · معلّق · فاشل |
| `tech_export_failures` | `(INTEGER)` | الفاشل + العالق أطول من عتبة، بعمره بالساعات |
| `tech_carrier_webhooks` | `(BOOLEAN, INTEGER, INTEGER)` | أحداث الناقلين، غير المعالَج أولاً |
| `tech_webhook_summary` | `(INTEGER)` | لكل ناقل: معالَج · معلّق · عمر أقدم عالق |

**التوقيع القديم `tech_export_log(INTEGER, INTEGER)` أُسقط صراحةً** حتى لا
تبقى حمولة زائدة غامضة تُستدعى خطأً.

### قرار أمني: لا تجاوز للسياسات

الجداول الخمسة كلها `RLS = true`، لكن بطبقتين مختلفتين:

| الجدول | السياسة |
|---|---|
| `finance_report_exports` | `current_user_can_access_legal_entity(legal_entity_id)` — عضوية كيان |
| الأربعة الأخرى | `tenant_id = current_user_tenant_id() AND current_user_role() IN (…)` |
| `export_logs` | `tenant_id = current_user_tenant_id() AND current_user_is_staff()` |

الدوال `SECURITY INVOKER` فتحترم الطبقتين. **النتيجة العملية المُثبَتة:**
تقني الشركة بلا عضوية كيان **لا يرى** صادرات المالية — وهذا تصميم لا عطل:
بوابة التقنية لا تتجاوز حوكمة الكيانات المالية.

أُثبت الأمر تشغيلياً في `verify-tech-exports-0332-rls.sh`:

```
── ③ ★ سياسة الكيان المالي تُحترم لا تُتجاوز ──
  ✅ بلا عضوية كيان: صفر صادرة مالية (السياسة نافذة)
── ④ ✔ بعد منح عضوية الكيان تظهر صادرات المالية ──
  ✅ عضو الكيان يرى صادرة كيانه
  ✅ الإجمالي صار 5
── ⑤ ★★ عضوية كيان أ لا تفتح صادرات كيان ب ──
  ✅ عضوية كيان واحد لا تعمّم
```

### الفهارس السبعة

`UNION ALL` فوق خمسة جداول بلا فهارس = خمس عمليات مسح كاملة.

```sql
idx_fin_report_exports_tenant_req     (tenant_id, requested_at DESC)
idx_inv_report_exports_tenant_req     (tenant_id, requested_at DESC)
idx_mrp_bom_exports_tenant_req        (tenant_id, requested_at DESC)
idx_mrp_mfg_exports_tenant_req        (tenant_id, requested_at DESC)
idx_export_logs_tenant_created        (tenant_id, created_at DESC)
idx_carrier_webhooks_tenant_received  (tenant_id, received_at DESC)
idx_carrier_webhooks_tenant_pending   (tenant_id, received_at DESC) WHERE NOT processed
```

الأخير **جزئي**: العالق هو المستعلَم عنه بإلحاح وهو الأقلية.

---

## البنية المُحقَّقة — لا تخمين

استُخرجت من `information_schema.columns` و`pg_constraint` على قاعدة
مبنيّة من 261 مايجريشن:

| الجدول | الحقيقة |
|---|---|
| `finance_report_exports` | `report_run_id` **NOT NULL + FK** → `finance_report_runs` · `legal_entity_id` NOT NULL · يحمل `error_message` و`completed_at` وحده |
| `inventory_report_exports` | `report_run_id` FK → **`inventory_periodic_report_runs`** — جدول `inventory_report_runs` **غير موجود أصلاً** · بلا `error_message` |
| `mrp_bom_export_requests` | `request_number` NOT NULL · `UNIQUE(tenant_id, request_number)` · بلا `completed_at` |
| `mrp_manufacturing_export_requests` | `export_number` NOT NULL · يحمل `created_at` **و**`requested_at` · status ∈ `queued`·`processing`·`ready`·`failed`·`cancelled` |
| `export_logs` | `tenant_id`·`user_id`·`export_type`·`record_count`·`created_at` فقط |
| `inventory_carrier_webhook_events` | **`received_at`** لا `created_at` · **`processed BOOLEAN`** لا `status` · `carrier_id` FK **ON DELETE SET NULL** |
| `inventory_carriers` | NOT NULL: `carrier_code`·`name_ar`·`provider` |
| `finance_report_runs` | `report_type` ∈ 11 قيمة (`trial_balance`·`profit_loss`·…) |
| `inventory_periodic_report_runs` | NOT NULL: `report_number`·`report_type`·`period_start`·`period_end`·`delivery_status` |
| `entity_memberships` | **`tenant_id` NOT NULL** — أسقط سكربتي أول مرة |

قيود `CHECK` المُستخرَجة تحدّد الحالات الثماني التي تُعرَّب في الدالة:
`requested`·`queued`·`processing`·`generating`·`ready`·`failed`·`cancelled`·`expired`.

---

## الإثبات

### الاختبار السلوكي — 78 تأكيداً

`tools/dev/verify-tech-exports-0332.sql` — يعمل بدور `postgres`
(`BYPASSRLS`) فيقيس **منطق الدوال**، ويتراجع بالكامل.

```
verify-tech-exports-0332: 78 تأكيداً — نجح
تراجع نظيف — لا أثر في القاعدة.
```

### RLS الحقيقي — 16/16

`tools/dev/verify-tech-exports-0332-rls.sh` — جلسة `psql` واحدة مع
`SET request.jwt.claim.sub` ثم `SET ROLE authenticated`. ثلاثة أدوار
(تقني أ · موظف أ · تقني ب) ومستأجران.

```
✅ verify-0332-rls: 16/16 عبر RLS حقيقي
```

### اختبار العقد — 71 تأكيداً

`src/test/techDataExportsContract.test.ts` — فحص ثابت للمايجريشن
والخدمة والصفحة والمواضع الستة.

---

## ★ عكس كل إصلاح وإثبات سقوط الاختبار

القاعدة الإلزامية: إصلاح لا يُسقط اختباره عند عكسه = إصلاح غير محروس.

| # | العكس المطبَّق | الخطأ الذي ظهر |
|---|---|---|
| ① | `WHERE f.tenant_id = v_tenant` **`AND FALSE`** (إلغاء فرع المالية) | `3.1 ★ سجلّ الصادرات = 4 (متوقَّع 6)` |
| ② | عتبة العالق ← `AND TRUE` | `6.6 ★★ عتبة 48 ساعة أعادت 2 (متوقَّع 1) ⇒ العتبة صورية` |
| ③ | `LEFT JOIN inventory_carriers` ← `JOIN` | `7.12 ★★ حذف الناقل أضاع أحداثه: 2 (متوقَّع 3 — JOIN داخلي؟)` |
| ④ | `min(received_at)` ← `max(...)` | `8.4 ★ أقدم عالق = 0.2 ساعة (متوقَّع ≈30 لا ≈0.17 للأحدث)` |
| ⑤ | `w.tenant_id = v_tenant` ← `(… OR TRUE)` | `8.7 ★★ مجموع أحداث الملخّص = 4 (متوقَّع 3) ⇒ تسريب` |
| ⑥ | نافذة الملخّص ← `v_since - INTERVAL '9999 days'` | `5.8 ★ نافذة يوم واحد لم تُقصِ الصادرة العالقة منذ 30 ساعة` |

وبعد استرجاع الأصل في كل مرة: `78 تأكيداً — نجح`، والملف مطابق حرفياً
(`diff` = IDENTICAL).

### ★★ ثغرة في تغطيتي — اكتُشفت بالعكس وسُدَّت

**العكس ⑤ لم يُسقط الاختبار في المحاولة الأولى.** نجحت الـ76 تأكيداً
كلّها رغم تسريب صف من مستأجر آخر.

**السبب المُشخَّص:** التأكيد كان يعدّ **صفوف** `tech_webhook_summary`
ويتوقّع 2. حدث المستأجر ب يحمل `carrier_id = NULL`، والناقل المحذوف
كذلك `NULL` — فيندمجان في مجموعة `GROUP BY` واحدة ويبقى العدد 2.

**الإصلاح:** استُبدل عدّ الصفوف بـ`sum(out_total)` الذي يكشف التسريب
(`4 ≠ 3`)، وأُضيف نظيره لملخّص الصادرات. صار العدد **78** تأكيداً.
التصحيح موثّق في الملف نفسه عند التأكيد `8.7`.

---

## ★ تصحيح علني لتقرير سابق

`tools/dev/verify-tech-integrations-0331.sql` كان يحوي القسم ④ بستة
تأكيدات تقيس `tech_export_log(INTEGER,INTEGER)`:

```
4.1 صادرات الشركة = 3 (متوقَّع 3)   ✅ كان ينجح
```

كان ينجح فعلاً — لكنه **أثبت صحّة سلوك ناقص**: الدالة أعادت الصفوف
الثلاثة من `export_logs` بدقّة، بينما كانت تتجاهل أربعة جداول صادرات
كاملة. تأكيد صحيح على سؤال خاطئ.

القسم أُزيل واستُبدل بتأكيدين يحرسان انتقال المسؤولية:
- `4.1` — التوقيع القديم `(integer, integer)` اختفى فعلاً
- `4.2` — التوقيع الموحّد الجديد موجود

وأُثبت أن الحارس فعّال: أُعيد إنشاء التوقيع القديم يدوياً في القاعدة،
فسقط الملفان معاً (`1.1 دوال 0331 = 6 (متوقَّع 5)`)، ثم أُسقط فعادا.

**ملاحظة تقنية:** `pg_get_function_identity_arguments()` تُدرج **أسماء**
المعاملات لا أنواعها وحدها — أعادت `'p_limit integer, p_offset integer'`
لا `'integer, integer'`. أسقط هذا تأكيدي أول مرة وصُحّح.

---

## الصفحة الجديدة — `DataExportsPage`

`/app/tech-portal/data-exports` — ثلاثة تبويبات:

1. **سجلّ الصادرات** — بطاقات ملخّص قابلة للنقر كمرشّح · جدول بالمصدر
   والمرجع والصيغة والحالة المعرَّبة والطالب · سبب الفشل تحت المرجع
2. **المتعثّرة** — عتبة قابلة للتغيير (ساعة · 6 · يوم · 3 أيام) ·
   تمييز بصري بين `فشل` و`عالق` · الأقدم أولاً
3. **أحداث الناقلين** — ملخّص لكل ناقل بعمر أقدم عالق · جدول بحالة
   المعالجة ورقم التتبّع وعدد حقول الحمولة

**قرارات:**
- كل الأعمار محسوبة **في القاعدة** (`EXTRACT(EPOCH …)`) لا في المتصفح —
  ساعة العميل ليست مرجعاً
- الحمولة الفارغة (`0 حقل`) تُعرض بالأحمر: حدث ورد بلا محتوى عطل صامت
- لا `confirm`/`alert`/`prompt` · لا `as any` · لا لمس مباشر لـSupabase
- لا لفظ يوحي بنطاق المنصة — البوابة خاصة بالشركة المستأجِرة

### التسجيل في المواضع الستة

| # | الملف | ما أُضيف |
|---|---|---|
| ① | `src/router/AppRouter.tsx` | `lazy` + `<Route path="data-exports">` |
| ② | `src/shared/components/dashboard/Sidebar.tsx` | عنصر التنقل **و**`'tech-data-exports': 'tech_portal'` |
| ③ | `src/pages/hybridportal/hybridPagesCatalog.ts` | الكتالوج **و**قائمة `tech` |
| ④ | `src/core/constants/permissions.ts` | الدوران `it_admin` و`tech` |
| ⑤ | `src/core/constants/permissions.ts` | **`PERMISSION_KEYS`** — يُغفَل كثيراً و`tsc` يرفضه |
| ⑥ | `src/router/legacyRedirect.ts` | `VIEW_TO_PATH` — `Sidebar.tsx:1351` يعتمده لتحويل id→مسار |

الأيقونة `Download` لم تكن مستوردة في `Sidebar.tsx` ولا في
`hybridPagesCatalog.ts` — أُضيفت، وإلا رفضهما `tsc`.

### حارس `0329` أوقفني — للمرة الثالثة

```
FAIL src/test/legacyDeprecationContract.test.ts
AssertionError: expected 436 to be less than or equal to 435
```

الحلّ الصحيح: تسجيل `tech-data-exports` في قائمة `NEW_PAGE_IDS` داخل
الحارس نفسه (صفحة جديدة مشروعة)، **لا** رفع العتبة 435. التعليل المطلوب
(`Sidebar`) كان موجوداً أصلاً في `legacyRedirect.ts:143`.

---

## حالة الفحوص بعد الجولة

```
261 مايجريشن من الصفر · صفر فشل
39/40 ملف سلوكي · 664 تأكيداً مرقّماً   (78 جديداً في 0332)
6 سكربتات RLS حقيقي · 16/16 الجديد
2585 اختبار وحدة في 125 ملفاً · صفر فشل   (71 جديداً)
tsc EXIT=0
lint: 0 خطأ · 1322 تحذيراً (بلا زيادة)
build ✅ · db:contract-check PASS
sdk:boundary-check: 52 انتهاكاً موروثاً — صفر في الجديد
```

الملف الفاشل الوحيد يبقى `verify-procurement-0256-0269.sql`: أداة تشخيص
لسحابة Supabase تقرأ `supabase_migrations.schema_migrations` غير الموجود
محلياً. ليس اختباراً ولم يُلمَس.

---

## ما لم يُنجَز بعد

| البند | الحالة |
|---|---|
| `db push` لـ`0317`–`0332` | مؤجَّل بقرار المستخدم |
| اختبار المتصفح | لم يجرِ في أي جولة |
| معالج خلفي لتحرير الصادرات العالقة | الجولة تُظهر العالق ولا تُحرّره — يحتاج قراراً: إعادة محاولة تلقائية أم تدخّل يدوي؟ |
| معالجة `inventory_carrier_webhook_events` | العرض جاهز، لكن لا شيء يقلب `processed` إلى `true` — الفجوة في مسار الاستقبال لا في البوابة |
| تنبيه على الصادرة الفاشلة | `notify_critical_error` يغطّي `error_logs` وحده؛ الصادرة الفاشلة لا تُنشئ سجلّ خطأ |
| `biometric_devices_health` | جاهزة ومُختبَرة بلا واجهة |
| 50 سياسة PERMISSIVE بلا فلتر مستأجر | فُحصت عيّنة لا واحدةً واحدةً |
