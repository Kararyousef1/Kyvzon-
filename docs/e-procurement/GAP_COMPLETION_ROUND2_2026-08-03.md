# استكمال النواقص — الجولة الثانية

**التاريخ:** 2026-08-03 · **الفرع:** `remediation/p0-security-and-build-health`
**النطاق:** بوابة المشتريات — البنود المتبقية بعد `0265`–`0267`

---

## 0) تصحيح ادعاءات غير دقيقة في التقارير السابقة

قبل تنفيذ أي عمل، دُقِّقت النواقص المسجَّلة بالفحص المباشر للملفات.
**ثلاثة بنود كانت مسجَّلة كنواقص وهي منفَّذة فعلاً.** الصدق هنا أهم من
اتساق التقارير السابقة:

### ❌ ادعاء خاطئ 1: «بوابة المورد الخارجية غائبة كلياً — لا واجهة»

مكتوب في `PROCUREMENT_PORTAL_COMPLETION_2026-08-03.md:114` و
`GAP_REMEDIATION_2026-08-03.md:148`.

**الواقع المُثبَت:** البوابة موجودة وكاملة — **4 صفحات عامة + 6 دوال حدّية**:

| المسار | الصفحة | الأسطر | الوظيفة |
|---|---|---|---|
| `/supplier-portal/:token` | `SupplierPortalPage.tsx` | 224 | تسجيل ذاتي + رفع وثائق + جهات اتصال |
| `/supplier-rfx/:token` | `SupplierRfxPortalPage.tsx` | 100 | تقديم عروض RFx + أسئلة |
| `/supplier-invoice/:token` | `SupplierInvoicePortalPage.tsx` | 23 | رفع فواتير + باني سطور |
| `/supplier-dock/:token` | `SupplierDockPortalPage.tsx` | 54 | حجز موعد رصيف |

الدوال الحدّية: `procurement-supplier-portal` (290 سطراً) ·
`procurement-supplier-rfx` · `procurement-supplier-invoice` ·
`procurement-supplier-invite` (176 سطراً) · `procurement-send-rfq` ·
`inventory-supplier-dock-portal`.

جميعها بمصادقة capability-token (SHA-256) + `APP_ORIGIN` allowlist +
انتهاء صلاحية. أي أن «إرسال PO بالبريد» و«تقديم عروض RFx» و«التسجيل
الذاتي» **ليست محجوبة**.

### ❌ ادعاء خاطئ 2: «ثغرة `RequireModule` في مسار CRM»

مُسجَّلة كثغرة أمنية معروفة غير معالَجة.

**الواقع المُثبَت بتحليل شجرة المسارات:**

```
Route(648) <Route element={<RequireModule />}>  →  يُغلق عند 1275
Route(734) <Route path="crm" ...>               →  يُغلق عند 788
```

مسار CRM (734–788) **داخل** نطاق `RequireModule` (648–1275). وعند غياب
`moduleKey` يشتقه الحارس من `ROUTE_MODULE_MAP`:

```ts
{ pathPrefix: '/app/crm', moduleKey: 'crm', label: 'بوابة CRM' }
```

⇒ **لا ثغرة.** تعطيل CRM من Developer Portal يمنع الوصول فعلاً. نفس
الشيء ينطبق على marketing و hr و admin وبقية المسارات.

### ❌ ادعاء خاطئ 3: «OCR للفواتير يحتاج مزوّداً خارجياً»

**الواقع:** `procurement-invoice-ocr` (118 سطراً) منفَّذة بـ AI Vision
حقيقي عبر OpenRouter/Groq مع BYOK، وترفض العمل بلا مفتاح برسالة صريحة
بدل محاكاة وهمية. ما يلزم إعداد مفتاح فقط، لا بناء.

---

## 1) البيئة والتحقق

أُعيد بناء Postgres 17.10 محلي (بلا صلاحيات root) للتحقق الفعلي:

```
مايجريشنات طُبِّقت من الصفر: 198 ملفاً → 0 فشل
جداول: 586 · Views: 294
دوال RETURNS TABLE فُحصت: 71 → 0 مشكلة
Views نُفِّذت فعلياً: 294 → 0 معطوب
دوال STABLE/IMMUTABLE تكتب: لا يوجد
```

> **ملاحظة منهجية:** الفحص الثابت وحده لم يكن ليكشف أياً من الأخطاء
> الثلاثة أدناه. كلها ظهرت عند التنفيذ الحقيقي فقط.

---

## 2) النقص الأول: الجدولة التلقائية كانت **مستحيلة تقنياً**

### الاكتشاف

```sql
SET ROLE service_role;
SELECT * FROM public.run_procurement_daily_notifications();
-- ERROR: permission denied for function run_procurement_daily_notifications
```

سببان مستقلان، كلٌّ منهما كافٍ لمنع الجدولة:

1. **الصلاحية:** دوال `0266` مُنحت لـ `authenticated` فقط. مُشغِّل cron
   يعمل بـ `service_role`.
2. **الأعمق:** كل الدوال تبدأ بـ `current_user_tenant_id()` وترفع
   `NO_TENANT`، و`procurement_require_roles()` ترفع `NO_AUTH` عند
   `auth.uid() IS NULL`. cron لا جلسة له. وحتى لو نجحت، كانت ستخدم
   **مستأجراً واحداً** لا كل المستأجرين.

⇒ دوال `0266` كانت صالحة للاستدعاء اليدوي فقط. الغرض الأصلي منها
(الجدولة) لم يكن قابلاً للتحقق إطلاقاً.

### الحل — `0268_procurement_cron_multitenant_dispatch.sql`

| الكائن | الدور |
|---|---|
| `notify_procurement_roles_for_tenant()` | إشعار بلا اعتماد على الجلسة |
| `dispatch_contract_renewal_notifications_for_tenant()` | تجديد العقود |
| `dispatch_pr_approval_reminders_for_tenant()` | تذكير الموافقات |
| `dispatch_supplier_document_expiry_for_tenant()` | وثائق الموردين |
| `dispatch_po_otif_alerts_for_tenant()` | **تنبيهات OTIF — نقص لم يُنفَّذ في 0266** |
| `run_procurement_daily_notifications_cron()` | المُشغِّل، `service_role` فقط |
| `procurement_notification_dispatch_status` | View لكشف توقّف cron بصمت |

إضافة: `Edge Function: procurement-daily-notifications` بمقارنة
`CRON_SECRET` ثابتة الزمن.

### إثبات التشغيل

```
── الدالة القديمة كـ service_role ──
ERROR: permission denied

── الجديدة كـ service_role ──
 job                  | entities | notifications
----------------------+----------+---------------
 contract_renewal     |        2 |             4
 pr_approval_reminder |        0 |             0
 supplier_doc_expiry  |        0 |             0
 po_otif_alert        |        0 |             0

── تشغيل ثانٍ نفس اليوم (منع التكرار) ──
كل القيم 0

── عزل المستأجرين ──
بيتا (المشتريات معطّلة): 0 إشعار  ✓
── العقد المنتهي CTR-003 ──
0 إشعار (يُستبعد صحيحاً)          ✓
── الأولوية ──
عقد 5 أيام → high · عقد 20 يوماً → normal  ✓
```

### إصلاح ضمني اكتُشف أثناء العمل

`contract_renewal_alerts` تشمل `end_date < CURRENT_DATE` بمستوى
`expired`. نسخة cron تستبعدها (`end_date >= CURRENT_DATE`) لأن عقداً
منتهياً ليس «تجديداً قادماً» — وإلا لتكرّر الإزعاج يومياً بلا فائدة.

---

## 3) النقص الثاني: نوعان من ثلاثة أنواع مزادات **معطّلان**

المسجَّل سابقاً: «أنواع Japanese/Dutch مدعومة لكن اختُبر British فقط».
**الواقع أسوأ:** لم تكن مدعومة أصلاً.

### الاكتشاف (أ) — سقف السعر غير مفروض إطلاقاً

```sql
-- مزاد عكسي، starting_price = 50,000
SELECT * FROM place_auction_bid(<british>, <supplier>, 55000);
 is_new_best | current_best | extended
-------------+--------------+----------
 t           |        55000 | f          ← قُبل عرض أعلى من السقف!
```

`starting_price` كان يُخزَّن ولا يُقرأ. النتيجة: وفورات سالبة وترسية
على سعر يتجاوز السقف المعلن. في SAP Ariba هذا هو *price ceiling* ولا
يجوز تجاوزه.

### الاكتشاف (ب) — منطق British مفروض على الجميع

```sql
-- مزاد japanese، مورد ثانٍ يقبل نفس المستوى 48,000
ERROR: BID_MUST_BE_LOWER_THAN_CURRENT (current=48000.00)
```

في المزاد الياباني عدة موردين **يجب** أن يقبلوا نفس المستوى. الدالة
تجاهلت `auction_type` رغم وجود `CHECK` عليه.

### الحل — `0269_procurement_auction_type_rules.sql`

القواعد المطبَّقة (مرجع: SAP Ariba Sourcing · Wikipedia *Reverse auction*):

| النوع | القاعدة |
|---|---|
| `british` | أقل من الأفضل الحالي، ضمن السقف |
| `japanese` | قبول مستوى؛ نفس السعر مسموح، الأعلى مرفوض؛ انسحاب نهائي |
| `dutch` | أول قبول يفوز ويُنهي المزاد فوراً |

مضاف: جدول `auction_participant_status` (بـ RLS) ·
`withdraw_from_auction()` بسبب إلزامي · View `auction_live_status`.

### خطأ في عملي كشفه التشغيل

كتبت `status = 'closed'` فرفعت قاعدة البيانات:

```
ERROR: new row violates check constraint "procurement_auctions_status_check"
```

القيم المسموحة: `scheduled` · `live` · `ended` · `cancelled`. صُحِّحت إلى
`'ended'`. **هذا بالضبط سبب قاعدة: لا يُوثَّق بأي SQL لم يُنفَّذ فعلياً.**

### إثبات التشغيل بعد الإصلاح

```
── السقف ──
عرض 55,000 وسعر البداية 50,000
→ ERROR: BID_ABOVE_CEILING (ceiling=50000.00, bid=55000)   ✓

── British ──
48,000 ✓  →  45,000 ✓  →  46,000 → BID_MUST_BE_LOWER_THAN_CURRENT  ✓

── Japanese ──
مورد1 يقبل 48,000 → is_new_best = t
مورد2 يقبل 48,000 → is_new_best = f   (نفس المستوى مسموح)  ✓
مورد3 يقبل 48,000 → is_new_best = f                        ✓
مستوى أدنى 45,000 → مقبول                                   ✓
الرجوع لـ 47,000 → JAPANESE_CANNOT_ACCEPT_HIGHER_LEVEL      ✓
انسحاب بلا سبب  → WITHDRAWAL_REASON_REQUIRED                ✓
انسحاب مورد2 → المزاد مستمر (false)
المنسحب يعود → SUPPLIER_WITHDRAWN_FROM_AUCTION              ✓
انسحاب مورد3 → أُغلق (true) · الحالة ended · الفائز 48,000  ✓

── Dutch ──
أول قبول 47,000 → auction_closed = t · الحالة ended         ✓
محاولة ثانية    → AUCTION_NOT_LIVE                          ✓
```

---

## 4) النقص الثالث: التصدير — غائب وغير آمن

التوثيق `07` يطلب صراحةً «تصدير التقارير: Excel وPDF»، والتوثيق `05`
يطلب «أرشيف الفواتير … مع إمكانية التصدير».

### الواقع

- **صفر** صفحة مشتريات تستورد أداة تصدير.
- التصدير الوحيد (`SpendAnalyticsPage`) كُتب يدوياً وفيه عيبان:

**أ) العربية مشوّهة:**
```ts
new Blob([csv], { type: 'text/csv;charset=utf-8' })   // بلا BOM
```
Excel على ويندوز يفترض windows-1256 بلا `\uFEFF` → كل النص العربي رموز.

**ب) ثغرة CSV / Formula Injection:**
خلية تبدأ بـ `=` أو `+` أو `-` أو `@` يفسّرها Excel كصيغة. اسم مورد مثل
`=HYPERLINK("http://evil","انقر")` أو `=cmd|'/c calc'!A1` يصبح هجوماً على
جهاز من يفتح الملف. **وهذه البيانات يدخلها الموردون أنفسهم عبر البوابة
الخارجية — مُدخلات غير موثوقة بالتعريف.**

### الحل — `src/utils/dataExport.ts`

`sanitizeCell` (تحييد OWASP) · `buildCsv` (BOM + RFC 4180) ·
`exportToCsv` · `exportToExcelHtml`.

طُبِّق على: `SpendAnalyticsPage` (إصلاح القائم) و`InvoicesPage`
(تصدير الأرشيف — 13 عموداً بحالات مترجمة).

> **إفصاح صريح:** `exportToExcelHtml` يُنتج جدول HTML يفتحه Excel، وليس
> XLSX ثنائياً حقيقياً. توليد XLSX يتطلب SheetJS/ExcelJS وهي غير مثبَّتة.
> CSV هو المسار الموصى به والافتراضي. **PDF لم يُنفَّذ** — يتطلب مكتبة.

### اختبارات (15، كلها نجحت)

تشمل: `=1+1` · `=HYPERLINK` · `=cmd|'/c calc'!A1` · `+`/`-`/`@`/TAB/CR ·
BOM · اقتباس مضاعف · فاصلة داخل قيمة · CRLF · قائمة فارغة.

---

## 4.5) حادثة `0268` عند التطبيق الفعلي — وثغرة أمنية كشفها الحارس

### ما حدث

عند تشغيل المستخدم `supabase db push` فشلت `0268`:

```
ERROR: 0268 failed: anon must not execute the cron dispatcher (SQLSTATE P0001)
```

### لماذا لم يكشفه مختبري المحلي

مختبر Postgres 17 المحلي لم يكن يحاكي إعداداً جوهرياً في Supabase:

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
```

أُضيف السطر إلى `shim.sql` **فأُعيد إنتاج الخطأ حرفياً**.

### السبب الجذري

`REVOKE ALL ON FUNCTION ... FROM PUBLIC` يسحب منحة `PUBLIC` **الضمنية**
فقط. أما منحة Supabase التلقائية فهي **صريحة** لدور `anon`:

```
proacl = {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
                                 ^^^^^^^^^^^^^^^ منحة صريحة لا يمسّها REVOKE FROM PUBLIC
```

### الأخطر: الحارس منع ثغرة حقيقية

دوال `0268` **لا تفحص `auth.uid()`** — بالتصميم، لأنها تعمل تحت cron بلا
جلسة. أي أن **الصلاحية هي خط دفاعها الوحيد**. مع منحة `anon` التلقائية
كان الاستغلال ناجحاً فعلياً:

```
── قبل الإصلاح ──
إشعارات قبل: 0
SET ROLE anon;
SELECT * FROM dispatch_contract_renewal_notifications_for_tenant('<tenant-غير-مملوك>');
 contracts_notified | notifications_created
--------------------+-----------------------
                  1 |                     1
إشعارات بعد: 1        ← زائر غير مسجَّل كتب في مستأجر لا يملكه
```

> لولا الحارس لَمرَّت المايجريشن بصمت وفُتحت الثغرة في الإنتاج.
> **فشل المايجريشن كان السلوك الصحيح.**

### الإصلاح

1. سحب صريح على الدوال الست:
   `REVOKE ALL ON FUNCTION ... FROM anon, authenticated;`
2. توسيع الحارس ليفحص **الدوال الست** لكلا الدورين، لا المُشغِّل وحده.
3. `0269` — سحب `anon` من `place_auction_bid` و`withdraw_from_auction`
   (دفاع بالعمق فوق `NO_AUTH`) مع إبقاء `authenticated` كي لا تتعطل الواجهة.

### التحقق بعد الإصلاح

```
proacl = {postgres=X/postgres,service_role=X/postgres}     ✓

anon          → dispatch_*_for_tenant : permission denied  ✓
anon          → cron dispatcher       : permission denied  ✓
authenticated → cron dispatcher       : permission denied  ✓
service_role  → cron dispatcher       : 4 مهام تعمل         ✓
تشغيل ثانٍ نفس اليوم                   : كل القيم 0          ✓

place_auction_bid     : anon=false · authenticated=true    ✓
withdraw_from_auction : anon=false · authenticated=true    ✓

198 مايجريشن بمحاكاة Supabase الكاملة → 0 فشل               ✓
```

### الدرس المنهجي

المختبر المحلي يجب أن يحاكي **صلاحيات** المنصة لا مخططها فقط. أُضيف
`ALTER DEFAULT PRIVILEGES` إلى `shim.sql` نهائياً.

---

## 5) الملفات

### مايجريشنات جديدة
```
supabase/migrations/0268_procurement_cron_multitenant_dispatch.sql
supabase/migrations/0269_procurement_auction_type_rules.sql
```

### دالة حدّية جديدة
```
supabase/functions/procurement-daily-notifications/index.ts
```

### كود جديد
```
src/utils/dataExport.ts
src/test/dataExportSecurity.test.ts              (15 اختباراً)
src/test/procurementCronAndAuctionContract.test.ts (36 اختباراً)
```

### كود مُعدَّل
```
src/services/sdk/Procurement/ProcurementIntegrationService.ts  (حالة الجدولة)
src/services/sdk/Procurement/SourcingService.ts                (أنواع المزاد + إزالة as any)
src/pages/app/procurement/foundation/IntegrationHealthPage.tsx (لوحة الجدولة)
src/pages/app/procurement/sourcing/AuctionLivePage.tsx         (قواعد حسب النوع + انسحاب)
src/pages/app/procurement/analytics/SpendAnalyticsPage.tsx     (تصدير آمن)
src/pages/app/procurement/invoices/InvoicesPage.tsx            (تصدير الأرشيف)
```

---

## 6) نتائج الفحوصات

| الفحص | النتيجة |
|---|---|
| `npm run type-check` | ✅ 0 أخطاء |
| `npm run build` | ✅ نجح (تحذير chunk معروف) |
| `npm run test:run` | ✅ **764 اختبار / 85 ملفاً** (كان 711/83) |
| `npm run db:contract-check` | ✅ PASS — 586 جدولاً · 294 view |
| `npm run db:procurement-sql-check` | ✅ PASS — 67 دالة |
| `eslint` (المشتريات) | ✅ 0 أخطاء · 185 تحذيراً (كان 202) |
| Postgres 17 من الصفر | ✅ 198 مايجريشن · 0 فشل (بمحاكاة صلاحيات Supabase) |
| مسح 71 دالة RETURNS TABLE | ✅ 0 مشكلة |
| مسح 294 view بالتنفيذ | ✅ 0 معطوب |

---

## 7) ما تبقّى — بصراحة

### يحتاج إعداداً تشغيلياً (لا كوداً)

| البند | المطلوب |
|---|---|
| جدولة cron | ضبط `CRON_SECRET` + جدولة `procurement-daily-notifications` يومياً في Supabase |
| OCR | مفتاح OpenRouter/Groq (الدالة جاهزة) |
| البريد | مفتاح Resend أو BYOK للمستأجر |
| DocuSign | حساب واشتراك |

### لم يُنفَّذ فعلاً

- **تصدير PDF** — يتطلب مكتبة غير مثبَّتة. CSV متاح.
- **XLSX ثنائي حقيقي** — يتطلب SheetJS/ExcelJS.
- **استلام بريد/EDI** — يتطلب صندوق بريد ومعالجاً.
- التصنيف «بـ AI» مُنفَّذ كقواعد مطابقة، لا نموذج تعلّم.
- استخراج التزامات العقد من النص يدوي.
- `RequisitionListPage` (391 سطراً) و`SupplierDetailPage` يستحقان تقسيماً.

### التحقق الإلزامي غير المُنجز

- ❌ **`npx supabase db push` لم يُنفَّذ** لـ `0256`–`0269`.
- ❌ **لم يُفتح متصفح حقيقي** إطلاقاً.
- ❌ **لا commit/push** منذ `e22839c5`.

> **مكتمل محلياً ≠ جاهز للإنتاج.** كل ما سبق مُثبَت على Postgres محلي
> ومحاكاة الأدوار. التدفقات في متصفح حقيقي مقابل Supabase الفعلي
> لم تُختبر بعد.
