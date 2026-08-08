# 0350 — عزل البوابة وتحليلات الحركة (`hr/HRMovementAnalyticsPage`)

**التاريخ:** 2026-08-06 · **المرحلة 4** — بوابة الموارد البشرية صفحة صفحة
**الملف الأصلي:** `src/pages/hr/HRMovementAnalyticsPage.tsx` (715 سطراً)

> **قاعدة هذا التوثيق:** لا يُذكر هنا أي SQL لم يُنفَّذ فعلياً على Postgres
> محلي. كل رقم ناتج تشغيل، لا تقدير.

---

## الخلاصة

هذه الجولة كشفت **خرق عزل بين المستأجرين** — أخطر ما وُجد في المراحل
كلها. ومعه ثمانية أعطال أخرى: مُرشِّح زمني يُمرَّر ويُهمَل، وتصدير
Excel أربعة أعمدة منه فارغة أبداً، وأرشيف وردية يُحمّل الحارس ما لم
يحدث في نوبته.

---

## ═══ العطل ① — ★★★ تسريب بيانات بين المستأجرين ═══

### الادعاء الذي بُني عليه كل شيء — وكان خاطئاً

ترويسة `GatekeeperService.ts` كانت تقول حرفياً:

> «جداول `gatekeeper_sessions` و`gatekeeper_visitor_logs` و
> `gatekeeper_visitors` **بدون عمود tenant_id** في قاعدة البيانات»
> … «الحماية في هذه الجداول تعتمد على RLS policies المبنية على
> `created_by` / `auth.uid()` بدلاً من tenant_id».

**كلا الجملتين غير صحيحة.** المُحقَّق على Postgres:

```
gatekeeper_sessions.tenant_id      uuid  → tenants(id) ON DELETE CASCADE
gatekeeper_visitor_logs.tenant_id  uuid  → tenants(id) ON DELETE CASCADE
gatekeeper_visitors.tenant_id      uuid
```

ولا سياسة واحدة على الجدولين تذكر `created_by` — كلها تُرشّح بـ`tenant_id`.

### كيف تحوّل الوهم إلى ثغرة

بناءً عليه عُرِّف `NoTenantBaseService`:

```ts
protected override addTenantFilter(query) { return query; }   // لا ترشيح
protected override injectTenantId(data) {
  const { tenant_id: _, ...cleanData } = data;                // ★ يحذفه
  return cleanData;
}
```

والسياسة القائمة كانت:

```sql
kyvzon_gk_vlogs_select :
  ((tenant_id IS NULL) OR (tenant_id = current_user_tenant_id()))
```

فالخدمة تكتب كل صفّ بـ`NULL` ⇒ **الفرع الأول يجعله مرئياً لكل المستأجرين**.

### الإثبات — بدور `authenticated` حقيقي لا بـ postgres

```sql
INSERT INTO gatekeeper_visitor_logs(visitor_name,check_in_time)
  VALUES ('زائر بلا مستأجر', now());        -- كما تفعل الخدمة بالضبط
SET request.jwt.claim.sub = '<مدير المستأجر ب>';
SET ROLE authenticated;
SELECT count(*) … WHERE visitor_name='زائر بلا مستأجر';
```

```
مدير المستأجر ب يرى زائر بلا مستأجر: 1
```

⇒ مدير موارد الشركة (ب) يقرأ **سجلّ زوّار الشركة (أ)**: الاسم والهاتف
ورقم الهوية والغرض ومن استضافه. وكذلك ورديات الحرّاس.

★ **الجدولان فارغان اليوم (0 صفّ مُحقَّق)** — فالإصلاح وقائيّ لا علاجيّ،
ولا بيانات مسرَّبة فعلياً حتى الآن.

★★ وتسريب ثانٍ في `countVisitorsSince`: استعلام مباشر بلا أي ترشيح
⇒ يعدّ زوّار **كل** الشركات في رقم واحد.

---

## بقية الأعطال — كلها مُثبتة تشغيلياً

### ② `fromDate` يُمرَّر ويُهمَل

```ts
async findVisitorLogs(options?: { sessionId?: string; fromDate?: string }) {
  const filters = {};
  if (options?.sessionId) filters.session_id = options.sessionId;
  // ★ ولا سطر واحد يمسّ fromDate
```

```
SERVICE-LOGIC (بلا مرشّح تاريخ) => 3 صفوف
CORRECT (فلتر اليوم)            => 1 صفّ
```

⇒ مُرشِّح «اليوم / 7 أيام / هذا الشهر» **بلا أثر على تبويب الزوّار**.

### ③ تصدير الزوّار — أربعة أعمدة فارغة أبداً

`:391` يقرأ `v.visitor?.name` · `v.visitor?.company` · `v.visitor?.purpose`
· `v.visitor?.location`. ولا استعلام في المشروع يجلب كائناً مُضمَّناً
باسم `visitor`، والجدول **مسطّح**.

مُثبَت: العمودان `company` و`location` **غير موجودين في المخطط** (⇒ 0).

⇒ أربعة أعمدة من سبعة في ملف Excel فارغة — **ومنها اسم الزائر نفسه**.

### ④ أرشيف الوردية يتجاوز نهايتها

`:441` `findMovements({ fromDate: session.started_at })` — حدّ أدنى بلا
حدّ أعلى، و`ended_at` مُهمَل.

```
PAGE-LOGIC (fromDate فقط)      => 2 حركة
CORRECT (بين البداية والنهاية) => 1 حركة
```

⇒ تقرير تسليم المناوبة يُحمّل الحارس حركات الورديات اللاحقة كلها.

### ⑤ `route_violation` مُهمَل لصالح تفتيش نصّ

`:379` `m.notes?.includes('[مخالفة مسار 🚨]')` — بينما العمود المنطقي
`route_violation BOOLEAN NOT NULL` موجود ويكتبه `recordReturn`.

⇒ الكشف يعتمد تطابق نصّ حرفي يشمل إيموجي. أي تعديل على الملاحظة يُخفي
المخالفة.

### ⑥ `customer_email` عمود غير موجود

مُثبَت: `customer_reviews` لا يحوي أي عمود فيه `email` (⇒ 0).

### ⑦ الصفحة تفتح قناة Realtime مباشرة

`supabase.channel('gatekeeper_alerts')` — اسم عالميّ ثابت، ومُرشِّح لا
يذكر `tenant_id`.

### ⑧ البحث في الأرشيف لا يُنفَّذ

`archiveSearch` يُقرأ من الحقل ولا يُرشِّح شيئاً.

### ⑨ ثلاثة أعمدة معدومة في الأرشيف

`session.session_name` · `gatekeeper_name` · `visitor_count` — مُثبَت:
**لا وجود لأيٍّ منها** في `gatekeeper_sessions` (⇒ 0).
و`session.session_name.includes(archiveSearch)` يرمي استثناءً على
`undefined` — أي أن تبويب الأرشيف **ينهار عند أول محاولة بحث**.

---

## ما يفعله المايجريشن

### (أ) سدّ العزل

1. ترحيل وقائي: أي سجلّ يتيم يرث مستأجر ورديته/حارسه.
2. `DEFAULT public.current_user_tenant_id()` على العمودين.
3. `SET NOT NULL` — **محروس**: إن بقي يتيم يُرفع خطأ صريح بعدده بدل
   ترك القاعدة نصف مُؤمَّنة صامتة.
4. إعادة كتابة السياسات الأربع بحذف الفرع `tenant_id IS NULL`، مع
   `WITH CHECK` على الكتابة (لم يكن موجوداً).

### (ب) أربع دوال تحليلية

| الدالة | الغرض |
|---|---|
| `gatekeeper_movement_analytics(from,to)` | حركة ضمن نطاق · المخالفة من العمود المنطقي |
| `gatekeeper_visitor_analytics(from,to)` | زوّار بأعمدة مسطّحة حقيقية · النطاق يُطبَّق فعلاً |
| `gatekeeper_session_archive(search)` | أرشيف ببحث يُنفَّذ · عدّ حركات محصور بالنهاية |
| `gatekeeper_shift_movements(session_id)` | حركات وردية بين بدايتها ونهايتها |

كلها `STABLE` · `SECURITY DEFINER` · `search_path=public` · تُرشّح
بالمستأجر وتشترط `current_user_is_staff()`.

★ التاريخ في البحث بـ`AT TIME ZONE 'Asia/Baghdad'` صراحةً — الخادم على
`Etc/UTC`، ودرسٌ سابق مُثبَت أن التوقيت الضمني يظهر في الإنتاج لا في
جهاز المطوّر.

★ المدة `NULL` لمن لم يعد — لا صفراً. *الصفر يعني «عاد فوراً».*

---

## طبقة SDK — تصحيح المصدر لا العَرَض

- **`NoTenantBaseService` أُزيل بالكامل.** الجداول الثلاثة تستعمل
  `BaseService` القياسي بحقن `tenant_id`.
- الترويسة الكاذبة استُبدلت بتوثيق الحقيقة المُحقَّقة.
- `findVisitorLogs` تستعمل `findWhere` بـ`gte`/`lte` (لأن `findAll`
  يحوّل كل مُرشِّح إلى `.eq()` فلا يدعم النطاقات).
- `countVisitorsSince` تُرشّح بالمستأجر — دفاع في العمق فوق RLS.
- `subscribeHandoverAlerts` جديدة: اسم القناة يحمل المستأجر، والمُرشِّح
  يُرشّح به، **ويُعاد التحقّق في المُستقبِل**.

---

## التحقق — كله مُنفَّذ فعلياً

| الأداة | النتيجة |
|---|---|
| `verify-gatekeeper-analytics-0350.sql` | **41 تأكيداً · صفر فشل** |
| `verify-gatekeeper-analytics-0350-rls.sh` | **15 تأكيداً · صفر فشل** (دور `authenticated`) |
| `_invert_0350.py` | **17/17 عكساً أسقط الاختبار** |
| `src/test/gatekeeperAnalyticsContract.test.ts` | **39 تأكيداً** |

### ★★ درس جديد: عكس DDL لا يعمل بإعادة تطبيق المايجريشن

`ALTER TABLE … SET NOT NULL` **يبقى** بعد إعادة التطبيق على قاعدة سبق أن
طُبِّق عليها. فعكسٌ نصّي على ملف المايجريشن لا يُرجع الحالة القديمة
وينتج `SURVIVED` كاذباً.

الحلّ: قسم `DDL_INVERSIONS` منفصل ينفّذ `DROP NOT NULL` وإعادة السياسة
المتساهلة بـSQL صريح، ثم يسترجع بأمر مضاد مؤكَّد بـ`assert`.

بهذا سقط `INV16` بـ`SENTINEL_S1` و`INV17` بـ`SENTINEL_S3` — أي أن سدّ
الثغرة **مُختبَر فعلاً** لا مُدَّعى.

### ★ تصحيحان لأدوات القياس نفسها

1. `/v\.visitor/` في اختبار العقد طابق `v.visitorName` المشروع وأسقط
   الاختبار على شيفرة سليمة. **الأداة كانت الخاطئة** — شُدِّد التعبير.
2. تأكيد `GRANT` لم يحسب أن عبارتين تلتفّان على سطرين.

---

## الفحص الشامل (قاعدة نظيفة · RLS أولاً ثم SQL)

```
279 مايجريشن              · صفر فشل
19 سكربت RLS              · صفر فشل
57 ملف SQL                · صفر فشل
tsc EXIT=0
test:run 3712/3712 في 145 ملفاً
build ✅ 8.66s · contract PASS · lint 0 خطأ (1189 تحذيراً)
boundary: HRMovementAnalyticsPage خرجت من قائمة المخالفات
```

---

## ما لم يُحسم

| البند | الحالة |
|---|---|
| **المتصفح** | لم يُختبَر — منطق قاعدة وفحص ثابت وRLS |
| `gatekeeper_visitors` | يحوي `tenant_id` أيضاً ولا صفحة تكتبه اليوم — يحتاج مراجعة عند بلوغ بوابة الحارس |
| `GatekeeperPage` و`AdminDashboard` | تكتبان الجدولين نفسيهما — تستفيدان من `DEFAULT` تلقائياً، لكن لم تُراجَعا صفحةً صفحة بعد |
| `movement_permits` | لا واجهة لإنشاء تصريح — العرض فقط |
