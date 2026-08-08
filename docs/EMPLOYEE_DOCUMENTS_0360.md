# 0360 — سلامة مستندات الموظفين

**المرحلة 4 · بوابة الموارد البشرية · الصفحة 15 من 26**
الصفحة: `src/pages/hr/DocumentsPage.tsx` (257 سطراً قبل · 470 بعد)

---

## ما جرى فعلاً — بالأرقام

| البند | العدد |
|---|---|
| أعطال مُثبتة تشغيلياً قبل الكتابة | **12** |
| تأكيدات SQL سلوكية | **73/73** |
| فحوص RLS بدور `authenticated` | **34/34** |
| أعكاس أسقطت الاختبار | **32/32** |
| تكافؤات مُثبتة (لا نقص تغطية) | **4** |
| اختبارات عقد | **85** |
| أخطائي المُصحَّحة علناً في هذه الجولة | **3** |

**الأدوات:**
```
supabase/migrations/0360_employee_documents_integrity.sql
tools/dev/verify-employee-documents-0360.sql
tools/dev/verify-employee-documents-0360-rls.sh
tools/dev/_invert_0360.py
src/services/sdk/EmployeeDocumentsService.ts   (employeeDocumentsSdk)
src/test/employeeDocumentsContract.test.ts
```
المسبار `tools/dev/_probe_0360.sql` أثبت كل عطل ثم **حُذف قبل الكوميت**
(وحارسٌ في اختبار العقد يمنع عودته).

---

## الأعطال الاثنا عشر — بنصّها التشغيليّ

### ① ★★★ `is_confidential` عمودٌ ميت — والموظف يقرأ ملفّه الطبّي

العمود موجود منذ `0006_hr_expansion.sql:459` بـ`DEFAULT false`. سياسة
القراءة القائمة، بنصّها الحرفيّ من `pg_policy`:

```sql
((tenant_id = current_user_tenant_id())
  AND (current_user_is_staff()
       OR (employee_id = current_user_employee_id())))
```

**لا تذكره إطلاقاً.**

```
PROBE_6: سياسات تذكر is_confidential = 0
         دوال  تذكر is_confidential = 0
```

⇒ التقرير الطبيّ الذي رفعته الموارد البشرية عن الموظف، وخطاب التوصية
السرّي، ومرفق الإجراء التأديبيّ — كلّها يقرؤها الموظف نفسه من بوابته.
العمود موجودٌ ليطمئن مَن يقرأ المخطط، ولا يفعل شيئاً. **والصفحة لا
تعرضه ولا تسمح بضبطه.**

**العلاج:** سياسة `SELECT` جديدة (`NOT is_confidential` للموظف) + الشرط
نفسه داخل `employee_documents_board` (دفاعٌ مزدوج) + محفّز يرفع الطبّي
وخطاب التوصية سرّيَّين **تلقائياً** + `document_set_confidential` لإدارته
مع قفلٍ لا يُنزع عن النوعين.

### ② ★★★ `document_type` بلا أيّ قيد

```
PROBE_1: INSERT … document_type = 'ThIsIsGaRbAgE'  ⇒  قُبِل
```

أثره في الواجهة مباشر: `DOCUMENT_TYPE_LABELS[doc.document_type]` يعطي
`undefined` فتظهر شارةٌ **فارغة**، و`typeColors[…] ||` يسقط إلى الرماديّ.

★ وتفاوتٌ قائم كذلك: النوع في TS **ثمانية**، وشريط الترشيح في الصفحة
كان يعرض **سبعة** — `recommendation` مفقود ⇒ خطاب التوصية لا يُرشَّح.
الآن الشريط والنموذج يُشتقّان من `DOCUMENT_TYPES` نفسها.

### ③/④ ★★★ `employee_id` بلا مفتاح أجنبيّ

`pg_constraint` على الجدول = مفتاحان فقط:
`employee_documents_pkey` · `employee_documents_tenant_id_fkey`.

```
PROBE_3: وثيقةٌ لموظف 'ffffffff-…' غير موجود           ⇒ قُبِلت
PROBE_4: tenant_id = ألف مع employee_id = موظفٍ في باء  ⇒ قُبِلت
```

الرابع هو الفخّ الحقيقيّ: عزل المستأجر يحرس عمود `tenant_id` وحده،
ولا شيء يربط الوثيقة بموظفٍ من المستأجر نفسه.

**العلاج:** FK **مركَّب** `(employee_id, tenant_id) → employees(id, tenant_id)`
بـ`ON DELETE RESTRICT` (لا CASCADE — الوثيقة دليل)، ويحتاج
`uq_employees_id_tenant`.

### ⑤ ★★ `tenant_id` يقبل NULL ⇒ صفٌّ يتيم

```
PROBE_2: INSERT … tenant_id = NULL  ⇒ قُبِل، ثم اختفى عن كل استعلام
```

`BaseService.injectTenantId` يرمي إن غاب المستأجر، لكن
`injectTenantIdOptional` تكتب `null` صراحةً — و`archive_employee_document`
لن تجد الصفّ فلا سبيل لأرشفته.

**العلاج:** علاج الصفوف القائمة من `employees` **أولاً**، ثم `SET NOT NULL`.

### ⑥ ★★ الأرشفة لا تُخفي شيئاً

`archive_employee_document` تضبط `is_archived`، لكن استعلام الصفحة
`employeeDocumentService.findAll({orderBy:'created_at'})` = `select *`
+ `eq('tenant_id', …)` **بلا أيّ فلتر**.

```
PROBE_7: بعد الأرشفة، الصفحة ما زالت ترى الوثيقة = 1
```

⇒ الزرّ يعرض «تمت الأرشفة» ثم `fetchDocs()` تُعيدها كما هي. المستخدم
يضغط فيتغيّر **لا شيء**.

### ⑦ ★★ الحذف النهائيّ ما زال ممكناً

```
PROBE_8: بدور authenticated حقيقيّ (هدى · hr)
         DELETE FROM employee_documents WHERE id = …  ⇒ الصفّ اختفى
PROBE_9: المحفّز الوحيد غير الداخليّ = update_employee_documents_updated_at
```

الصفحة أحسنت بالتخلّي عن الحذف، لكن الباب الخلفيّ مفتوح على مصراعيه.
**العلاج:** محفّز `BEFORE DELETE` برمز `DOCUMENT_DELETE_BLOCKED`.

### ⑧ ★★ `uploaded_by` لا يُكتب أبداً

```
PROBE_5: أربع وثائق ⇒ أربع بلا رافع
```

لا يُعرف مَن رفع العقد. وهذه وثائق قانونية.
**العلاج:** المحفّز يملؤه من `auth.uid()` **ويُجمّده** بعد الإنشاء (مع
`tenant_id` و`employee_id`) — الانتحال بالتحديث مُبطَل، مُثبَت في RLS.
والملخّص يعدّ الأثر القائم (`out_no_uploader`) وتعرضه الصفحة.

### ⑨ ★★ `file_size` و`mime_type` عمودان ميتان

الصفحة تملك `File` كاملاً في `handleFile` (فيه `.size` و`.type`) وترمي
كليهما. `PROBE_11: ثلاث وثائق ⇒ ثلاث بلا حجم.`

⇒ لا حدّ لحجم الرفع ولا تحقّق من نوع المحتوى.

### ⑩ ★★ `expires_at` بلا أثر في المنظومة

```
PROBE_10: دوال تذكر employee_documents و expires_at معاً = 0
```

الصفحة تطبع «ينتهي: …» بلون كهرمانيّ **حتى لو انتهى أمس**
(`{doc.expires_at && …}` لا يقارن بشيء).

**العلاج:** `out_expiry_state ∈ none · valid · expiring · expired`
و`out_days_left`، محسوبةً **بتوقيت بغداد** لا بمنطقة الخادم
(`Etc/UTC`). ونافذة «تقارب الانتهاء» = 30 يوماً، والحدّان 30/31 مُختبَران.

### ⑪ ★★★ bucket `'employee-documents'` غير موجود

مسحُ المستودع كلّه: النصّ `employee-documents` يظهر في **ملف واحد** هو
`DocumentsPage.tsx` — لا في أيّ مايجريشن ولا سكربت. و`0005` ينشئ bucket
واحداً اسمه `tawathul`.

⇒ **أوّل رفعٍ يرمي `Bucket not found`.**

★★ وأخطر: `uploadPublic` تعني رابطاً **عاماً بلا مصادقة** لتقارير
طبّية — خطأٌ بنيويّ حتى لو وُجد الـbucket.

**العلاج (في طبقة SDK — `storage.buckets` خارج مخطط pgtest):**
`DOCUMENTS_BUCKET = 'tawathul'` + `uploadPrivate` + `signedUrl` لساعة.

### ⑫ ★★ حلقة O(n) وترتيبٌ عشوائيّ

الصفحة تجلب **كل** الموظفين وتبني `Map` يدوياً لكل عرض، و
`orderBy:'full_name_ar'` على عمودٍ **NULL لكل موظف** (محفّز
`tg_ensure_employee_row` يكتب `first_name`/`last_name` فقط).

**العلاج:** `employee_documents_board()` استعلامٌ واحد، بترتيبٍ حتميّ
`ORDER BY d.created_at DESC, d.id DESC` (درس 0357) واحتياطيّ صريح للاسم.

---

## ★ أخطائي في هذه الجولة — مُصحَّحة علناً

### 1. ادّعيتُ «صفر سياسة RLS» — والحقيقة خمس

في أول استطلاع كتبتُ أن `employee_documents` بلا أيّ سياسة. كان ذلك
خطأً ناتجاً عن **فشل الاستعلام** لا عن غياب السياسات:

```
ERROR: operator is not unique: text || "char"
LINE 1: … end||' | '||polcmd||…
```

`polcmd` من نوع `"char"` ويحتاج `::text`. الحقيقة: **خمس سياسات**، منها
`hybrid_gate_employee_documents` **RESTRICTIVE** (صحيحة). صحّحتُ الادّعاء
فوراً قبل أن أبني عليه شيئاً.

### 2. تأكيد الترتيب 13.4 كان يقارن الاستعلام **بنفسه**

كتبتُ في النسخة الأولى:

```sql
SELECT bool_and(a.out_created_at >= b.out_created_at)
  FROM (SELECT out_created_at, row_number() OVER () rn FROM …board(…)) a
  JOIN (SELECT out_created_at, row_number() OVER () rn FROM …board(…)) b
    ON b.rn = a.rn + 1;
```

استدعاءان للدالة نفسها يُرتَّبان بالطريقة نفسها **أياً كانت** ⇒ التأكيد
يمرّ دائماً. كشفه العكس `INV24`: أسقطتُ `ORDER BY` كلّه و«نجح» الاختبار.

**التصحيح:** ترتيبٌ مرجعيّ **مستقلّ** محسوب من الجدول، مع تفريق
`created_at` صراحةً (كل الصفوف أُدرجت في معاملة واحدة و`DEFAULT now()`
= طابع المعاملة ⇒ **متساوية كلها** فالفرز كان يقع على `id` وحده)، وتأكيدٌ
إضافي 13.5 يُثبت التسوية على `id` عند تساوي الطابع.

### 3. صنّفتُ ثلاثة أعكاس على أنها «تحتاج RLS» ثم تبيّن أن أحدها تكافؤ

`INV28` (إسقاط `GRANT EXECUTE … TO authenticated`) نجا حتى بعد نقله إلى
فحص RLS. لم أكتفِ بذلك — أثبتُّ السبب بمسبار:

```
pg_default_acl:  f | postgres | anon=X/postgres authenticated=X/postgres service_role=X/postgres
```

`0268` نفّذ `ALTER DEFAULT PRIVILEGES … GRANT EXECUTE ON FUNCTIONS` ⇒
**كل دالة جديدة تُولَد ومعها EXECUTE لـauthenticated تلقائياً.** ودالةٌ
اختباريّة أُنشئت ثم `REVOKE ALL … FROM PUBLIC` و`FROM anon` بلا أيّ
GRANT أعطت `has_function_privilege('authenticated', …) = true`.

⇒ المنحة الصريحة **تحصيل حاصل** لا يمكن لاختبارٍ أن يُسقطه ⇒ `EQ04`.
★ أمّا `REVOKE … FROM anon` فليس كذلك: المسبار نفسه أعطى `anon = false`،
وعكسه (`INV29`) أسقط سكربت RLS فعلاً.

---

## ★★★ درس التغطية — المرة الرابعة والعشرون

> **شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.**

أول تشغيل لـ`_invert_0360.py` أعطى **27/34** — سبعة ناجين. تحليلها:

| الناجي | السبب الحقيقيّ | المصير |
|---|---|---|
| `INV14` | ملف SQL يستدعي `document_upload` بسياق **هدى (hr)** وهي staff فعلاً ⇒ الحارس لا يُلمَس | → `RLS_CHECK` |
| `INV29` · `DDL03` · `DDL04` | مُختبَرة بالكتابة المباشرة بدور `authenticated` وحدها | → `RLS_CHECK` / `DDL_RLS_CHECK` |
| `INV24` | **خطأ في تأكيدي** (أعلاه) | تأكيد جديد أقوى |
| `INV26` | لا وثيقة عابرة في العيّنة — **لأنّ FK يمنعها أصلاً** | → `EQ03` بإثبات |
| `INV28` | الصلاحية الافتراضية من 0268 | → `EQ04` بإثبات |

**النتيجة النهائية: 32/32 · 4 تكافؤات مُثبتة بالاستعلام لا بالتخمين.**

### التكافؤات الأربعة

| # | البند | الإثبات |
|---|---|---|
| `EQ01` | `uq_employees_id_tenant` وحده | Postgres يرفض حرفياً: `cannot drop index uq_employees_id_tenant because other objects depend on it · DETAIL: constraint employee_documents_employee_tenant_fkey … depends on index` ⇒ مغطًّى بـ`DDL01` |
| `EQ02` | الفهرسان الجزئيّان | أداءٌ محض · ولا `LIMIT` بلا `ORDER BY` (درس 0357) ⇒ لا قلبَ للنتيجة |
| `EQ03` | شرط المستأجر في `JOIN` الموظف | `employees_pkey` على `id` **وحده** ⇒ `e.id = d.employee_id` يحدّد صفّاً واحداً · و FK مركَّب `convalidated = true` يضمن الزوج ⇒ الشرط صحيحٌ حتماً. **يبقى دفاعاً عميقاً** |
| `EQ04` | `GRANT … TO authenticated` | `pg_default_acl` من 0268 (أعلاه) |

---

## ★ حادثةٌ لم أُشخّصها — أُوثّقها لا أُخفيها

في أول تشغيل شامل على قاعدة `D86`، فشل
`verify-bonus-lifecycle-0358-rls.sh` بفحصٍ **واحد** (`❌ 0358 RLS — 1 فشلاً`)
ولم يُلتقَط سطر الفشل نفسه في السجل.

ما فعلتُه للتحقّق:

| المحاولة | النتيجة |
|---|---|
| تشغيله منفرداً على `D86` مرّتين | ✅ صفر فشل |
| ثلاث جولات كاملة × 29 سكربتاً على `D86` | ✅ صفر فشل (87 تشغيلاً) |
| قاعدتان نظيفتان من الصفر (`D88` · `D89`) × 29 | ✅ صفر فشل |
| فحص عيّنة 0358 العالقة في `D86` | صفر صفّ — التنظيف سليم |

**المجموع: 145 تشغيلاً بلا تكرار.** لم أُشخّص السبب، ولا أدّعي أنّي
فعلت. الاحتمال الأرجح تداخلٌ زمنيّ بين سكربتين على القاعدة نفسها، لكن
**هذا فرضٌ لا إثبات**. البند مفتوح في `docs/REMAINING_WORK_2026-08-06.md`.

---

## الواجهة بعد إعادة الكتابة

| كان | صار |
|---|---|
| `findAll` + جلب كل الموظفين + `Map` في المتصفّح | `employeeDocumentsSdk.board()` — استعلامٌ واحد مرتَّب حتمياً |
| المؤرشف يظهر مع النشط | تبويبان: **النشطة** · **الأرشيف** |
| شريط ترشيح بسبعة أنواع | ثمانية، مُشتقّة من `DOCUMENT_TYPES` |
| «ينتهي: …» كهرمانيّ دائماً | شارة **سارية · تقارب · منتهية** + عدّاد الأيام |
| لا شيء عن السرّية | شارة 🔒 + زرّ ضبط + قفلٌ للطبّي والتوصية |
| `<a href={file_url}>` رابطٌ عامّ دائم | زرّ «فتح» برابطٍ موقَّت لساعة |
| لا بطاقات | خمس بطاقات + تنبيه «وثائق بلا رافع» |
| لا تفاصيل | نافذة تفاصيل: الحجم · النوع · الرافع · التاريخ |
| لا إشارة للحجم | حدّ 25MB مُتحقَّق في الواجهة والقاعدة معاً |

★ `DocumentsPage` انضمّت إلى الحارس المُوحَّد في `portalHygieneContract`
(`it.each` بأربع صفحات الآن) — استغنت عن `WithEmployee` كسابقاتها.

---

## حالة المشروع بعد 0360 (مُحقَّقة تشغيلياً)

```
289 مايجريشن · صفر فشل      (قاعدة نظيفة من الصفر)
69 ملف SQL   · صفر فشل
29 سكربت RLS · صفر فشل      (× 5 قواعد مستقلّة)
tsc EXIT=0 · test:run 4270/4270 في 155 ملفاً · build ✅ 5.58s
contract PASS · lint 0 خطأ (1178 تحذيراً)
sdk:boundary-check: انتهاكات موروثة (مالية/مخزون/تصنيع) — صفر في الجديد
allowlist ميّت: 3 (مالية)
```

**المرحلة 4: 15 من 26 · تبقّى 10 صفحات.**
التالية: `src/pages/hr/SuccessionPlanningPage.tsx` (231 سطراً).
