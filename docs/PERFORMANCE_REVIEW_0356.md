# 0356 — سلامة تقييم الأداء

**المرحلة 4 · بوابة الموارد البشرية · صفحة `src/pages/hr/PerformancePage.tsx`**
التاريخ: 2026-08-07 · الجولة: `0356`

---

## خلاصة الجولة

| البند | الرقم |
|---|---|
| أعطال مُثبتة تشغيلياً | **11** |
| تأكيدات SQL سلوكية | **123** |
| فحوص RLS بدور `authenticated` | **35** |
| جولة العكس | **50/50** (+3 تكافؤات مُثبتة) |
| اختبار عقد | **68** |
| دوال جديدة | 8 + محفّزان + محفّز اشتقاق |

**الحالة بعد الجولة** (قاعدة نظيفة، مُحقَّقة تشغيلياً):
```
285 مايجريشن · صفر فشل
63 ملف SQL   · صفر فشل
25 سكربت RLS · صفر فشل
tsc EXIT=0
```

---

## الأعطال — كلٌّ منها مقيس قبل كتابة سطر واحد

المسبار: `tools/dev/_probe_0356.sql`

### ① ★★★ إنشاء أيّ تقييم يفشل دائماً

`handleCreateReview` ترسل ستّة أعمدة لا وجود لها في `performance_reviews`:

```
overall_score · strengths · improvements · completed_at · updated_at · goals_summary
```

**المقيس** (PROBE_1 — مسح `information_schema.columns`):
```
العمود «overall_score» ★ غير موجود
العمود «strengths»     ★ غير موجود
العمود «improvements»  ★ غير موجود
العمود «completed_at»  ★ غير موجود
العمود «updated_at»    ★ غير موجود
العمود «goals_summary» ★ غير موجود
```

PROBE_1B — الإدراج بالحقول التي ترسلها الصفحة حرفياً:
```
ERROR: column "overall_score" of relation "performance_reviews" does not exist
```

أعمدة الجدول الحقيقية **عشرة** (PROBE_10):
```
id · tenant_id · employee_id · reviewer_id · cycle_id
rating · comments · status · submitted_at · created_at
```

⇒ زرّ «تقييم جديد» **معطَّل تماماً** ويظهر خطأ خام للمستخدم.

### ② ★★★ وأيُّ تعديل يفشل أيضاً — حتى بلا أعمدة وهمية

محفّز `update_performance_reviews_updated_at` (من `0003`) يُنفّذ
`update_updated_at_column()` التي تكتب `NEW.updated_at`، والعمود غير موجود.

**المقيس** (PROBE_2A — تعديل `comments` وهو عمود **موجود**):
```
ERROR: record "new" has no field "updated_at"
CONTEXT: PL/pgSQL assignment "NEW.updated_at = NOW()"
```

⇒ عطلٌ أشدّ من ①: زرّ «إكمال» يفشل (PROBE_1C)، وكذلك **كل** `UPDATE`
مهما كان مصدره أو محتواه. الجدول للكتابة مرّة واحدة فقط بلا أن يعلم أحد.

> **عطلٌ نائمٌ منذ بداية المشروع**: المحفّز من `0003` والعمود لم يُضَف قط.

### ③ ★★★ سُلَّمان متناقضان

| | |
|---|---|
| القاعدة | `rating INTEGER CHECK (rating >= 1 AND rating <= 5)` |
| الصفحة | `overall_score` من 0 إلى 100 بحقل `min="0" max="100"` |

والعتبات في الصفحة: `>= 85` أخضر · `>= 70` أصفر · دون ذلك أحمر.

**المقيس** (PROBE_2B): الصفّ يحمل `rating = 4` والصفحة تعرض:
```
{review.overall_score}%  ⇒  «undefined%»
scoreColor من undefined >= 85 = false  ⇒  أحمر دائماً
```

⇒ **كل تقييم يظهر أحمر** مهما كانت درجته. موظفٌ بأعلى تقدير (5/5) يظهر أحمر.

### ④ ★★ `status` نصٌّ حرّ بلا CHECK

PROBE_3: أُدرج صفٌّ بحالة «حالة مخترعة تماماً» **ونجح**.
و`REVIEW_STATUS_LABELS[review.status]` ⇒ `undefined` فتظهر شارة فارغة.

### ⑤ ★★ `performance_cycles` بلا أيّ قيد سلامة

PROBE_4 — دورة واحدة تجمع **ثلاث** مخالفات نجحت كلّها:
```
start_date    = 2026-06-01
end_date      = 2026-01-01   ← النهاية قبل البداية
review_period = 'كل ثانية'   ← فترة مخترعة
status        = 'حالة وهمية'
```
الجدول لا يملك سوى PK و FK للمستأجر.

### ⑥ ★★ لا قيد فرادة

PROBE_5: `reviews_same_emp_same_cycle = 2` (بدرجتين 3 و 5). أيّهما المعتمَد؟
لا جواب. والصفحة تعرضهما صفَّين متطابقَي الاسم.

### ⑦ ★★ الموظف يُقيّم نفسه

PROBE_6: أُدرج تقييم `employee_id = reviewer_id` بدرجة 5/5 **ونجح**.
ونافذة الإنشاء فيها `EmployeePicker` **مرّتين متتاليتين** بلا أيّ تمييز
بصريّ ولا حارس.

### ⑧ ★★ `cycle_id` بلا مفتاح أجنبيّ

PROBE_7: أُدرج تقييم بـ`cycle_id = 'ffffffff-…'` ونجح ⇒ تقييمٌ يتيم،
و`cycle?.name || 'دورة تقييم'` يبتلع الخطأ ويعرض نصّاً عامّاً.

### ⑨ ★ الحذف النهائي متاح لأي staff

PROBE_9: `kyvzon_performance_reviews_delete` بشرط `current_user_is_staff()`
وحده، والمحفّز الوحيد على الجدول هو محفّز `updated_at` المعطوب (PROBE_9B).
تقييمٌ سنويّ يُمحى بضغطة.

### ⑩ ★ ثلاثة استعلامات بلا حدّ + خريطتان في المتصفّح
### ⑪ ★ `EmptyState({ icon }: { icon: any })` — `any` صريح

---

## ما بُني

### (أ) الأعمدة الناقصة + إصلاح المحفّز

```sql
ADD COLUMN IF NOT EXISTS score NUMERIC(5,2), strengths, improvements,
  completed_at, archived_at, archive_reason,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

★ **المحفّز المعطوب لا يُسقَط** — إضافة العمود تُصلحه. حارسٌ في اختبار
العقد يتحقّق أنه لم يُسقَط.

### (ب) القيود

| القيد | الغرض |
|---|---|
| `performance_reviews_status_chk` | المفردات الخمس |
| `performance_reviews_score_chk` | 0..100 |
| `performance_reviews_cycle_id_fkey` | `ON DELETE SET NULL` |
| `uq_review_per_employee_cycle` | فرادة (مستأجر، دورة، موظف) — **جزئيّ**: الملغاة والمؤرشفة خارجه |
| `performance_cycles_status_chk` · `_period_chk` · `_range_chk` | الدورة |

كل كتلة قيد تُطبِّع البيانات القائمة أولاً (`UPDATE … WHERE status NOT IN …`)
قبل فرض القيد — وإلا فشل المايجريشن على قاعدة فيها صفوف مخالفة.

### (جـ) `tg_perf_review_derive` — سُلَّم واحد

```
0–20 → 1 · 21–40 → 2 · 41–60 → 3 · 61–80 → 4 · 81–100 → 5
```

★★ `GREATEST(1, …)` ضروريّ: `score = 0` يعطي `ceil(0/20) = 0` ويخالف
`rating >= 1`. مُختبَر عند الحدود الستّة (0 · 20 · 21 · 60 · 61 · 100).

★★ ومنع التقييم الذاتيّ يمرّ عبر `employees.user_id` — `employees.id`
**≠** `profiles.id`، فالمقارنة المباشرة لا تكفي (وحارسٌ في اختبار العقد
يمنع عودتها).

### (د) الأرشفة بدل الحذف · (هـ) ثماني دوال قاعدة

---

## جولة العكس — 50/50

`PGPORT=<PORT> python3 tools/dev/_invert_0356.py`

**أربع ثغرات تغطية سُدَّت** بعد أن نجت من الجولة الأولى:

| العكس | لماذا نجا | السدّ |
|---|---|---|
| `INV31` | التأكيد 16.4 كان يمرّر **سالم نفسه**، فيمسكه حارس التقييم الذاتيّ قبل أن يصل إلى حارس الدور | تمرير **ناصر** + إلزام نصّ الرسالة + تحقّق أن لا صفّ دخل (16.4b/c) |
| `INV21` | لوحة الدورات لم تُختبر **عبر الحدود** إطلاقاً | دورة في المستأجر باء + قياس من ألف (15.10–15.12) |
| `INV22` | حدّ لوحة الدورات: العيّنة أصغر من الحدّ فلا فرق | حدّ 1 على دورتين (15.13) |
| `INV38` | انتقال حالة الدورة لم يُختبر عبر الحدود | دورة أجنبية `draft` — لا يمسكها إلا ترشيح المستأجر (15.14–15.16) |

> **الدرس المتكرّر للمرّة الثانية والعشرين:**
> **شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.**

### التكافؤات المُثبتة

- **`EQ01`** حارس `p_status` في `performance_review_set_status` مُكافئ
  لجدول الانتقالات: كل حالة خارج الخمس لا تُطابق فرعاً في `CASE` فيصير
  `v_ok = FALSE`. (`INV33` يسقط الاختبار فعلاً.)
- **`EQ02`** حارس `p_status` في `performance_cycle_set_status` مُكافئ
  لقيد `performance_cycles_status_chk` (`DDL10`).
- **`EQ03`** تطبيع البيانات القائمة: على قاعدة نظيفة لا صفوف تخالف
  القيود، فأثره غير قابل للقياس هنا.

### ★ فخّ `IF NOT EXISTS` — عشرة عكوس DDL

`ADD COLUMN IF NOT EXISTS` و`IF NOT EXISTS (SELECT 1 FROM pg_constraint …)`
لا يُنفَّذان ثانيةً على قاعدةٍ طُبِّق عليها المايجريشن. فحذف السطر من
النصّ **لا يُسقط** العمود ولا القيد. العكس الصحيح `DROP` صريح — وهي
`DDL01`–`DDL10`.

---

## أخطائي في هذه الجولة — مُصحَّحة علناً

1. **`AS t(s INTEGER, r INTEGER)`** — نحوٌ غير مسموح في `PL/pgSQL`؛
   الصواب `AS t(s, r)`.
2. **التأكيد 15.12**: كتبتُ «ثلاث دورات» فسقط بـ`got=«2»` — «دورة
   المسؤول» تُنشأ في القسم ⑯ **بعد** تلك النقطة.
3. **التأكيد 16.4c**: كتبتُ «لا صفّ بدرجة 100» فسقط بـ`got=«1»` — صفّ
   `score=100` موجود من فحص حدود السُّلَّم في القسم ③.
4. **حارس «كل استعلام يُرشِّح بالمستأجر»** كان مفرطاً: أسقط
   `performance_cycle_create` ظلماً — وهي **تُدرج** ولا تقرأ، فتكتب
   المستأجر بـ`VALUES (v_tenant, …)`. صحّحتُه ليحرس ما هو صحيح فعلاً:
   أنها تكتب `v_tenant` ولا تقبل `p_tenant` من المستخدم.

---

## الملفات

```
supabase/migrations/0356_performance_review_integrity.sql
tools/dev/verify-performance-review-0356.sql        123 تأكيداً
tools/dev/verify-performance-review-0356-rls.sh      35 فحصاً
tools/dev/_invert_0356.py                            50/50 + 3 EQ
src/services/sdk/PerformanceReviewService.ts         جديد
src/services/sdk/index.ts                            تصدير
src/pages/hr/PerformancePage.tsx                     أُعيدت كتابتها
src/test/performanceReviewContract.test.ts           68 تأكيداً
```

---

## ما لم يُحلّ بعد

| البند | الملاحظة |
|---|---|
| `src/shared/types/hrModules.ts` | `PerformanceReview` ما زال يُعرّف `overall_score`/`goals_summary`. النوع غير مستعمل في الصفحة الجديدة، لكن تنظيفه يمسّ ملفات أخرى: **جولة لاحقة**. |
| `PerformanceService.ts` القديمة | `performanceCycleService`/`performanceReviewService` باقيتان (بأعمدتهما الوهمية) — لم تعد الصفحة تستعملهما. تُحذفان بعد التحقّق من عدم وجود مستورِد آخر. |
| `employee_goals` · `goal_updates` | جدولان قائمان بلا أيّ واجهة — أهداف الأداء لم تُبنَ بعد. |
| المتصفّح | لم يُختبَر — كل ما سبق منطق قاعدة وRLS وفحص ثابت. |
