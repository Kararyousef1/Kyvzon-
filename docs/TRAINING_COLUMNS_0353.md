# 0353 — الأعمدة الناقصة في منظومة التدريب

**التاريخ:** 2026-08-07 · بقرارك: «تابع العمل واضف الاعمده التي نحتاجها»

> **قاعدة هذا التوثيق:** لا يُذكر هنا أي SQL لم يُنفَّذ فعلياً على Postgres
> محلي. كل رقم ناتج تشغيل، لا تقدير.

---

## ما أُضيف

| الجدول | العمود | النوع | لماذا |
|---|---|---|---|
| `course_progress` | `score` | `NUMERIC(5,2)` **NULL-able** | «متوسط الدرجات» كان صفراً أبداً |
| `course_progress` | `time_spent` | `INTEGER NOT NULL DEFAULT 0` | «الوقت المستغرق» = «0ث» لكل مشارك |
| `course_progress` | `last_access_at` | `TIMESTAMPTZ` | «آخر وصول» لم يظهر في الجدول الزمني |
| `courses` | `rich_content` | `JSONB` بشكل محروس | تبويب «الصور والملفات» كان يحفظ في الفراغ |
| **`quiz_attempts`** | **جدول كامل** | — | انظر الاكتشاف أدناه |

### ★ ما لم أُضفه عمداً

**`progress_percent`** — اسمٌ مكرّر لعمود `progress` القائم. إضافته تُنشئ
**مصدرَي حقيقة متعارضين**، وهذا أسوأ من العطل الأصلي. الشيفرة عُدِّلت
لتقرأ `progress` وهو الصحيح.

---

## ★★★ اكتشاف هذه الجولة: منطق تحليل بلا جدول

`src/services/ai/quizAiService.ts` فيه منظومة كاملة:
`detectSuspiciousBehavior` و`analyzePerformance` تقرآن
`attempts[].score` و`suspiciousFlags` وتحسبان التحسّن والشذوذ…

**ولا جدول لحفظ المحاولات إطلاقاً.**

```
quizzes       ⇒ موجود (12 عموداً)
quiz_attempts ⇒ 0 صفوف في information_schema.tables
```

⇒ كل ذلك المنطق **ميّت**: لا شيء يُغذّيه. أُنشئ الجدول بقيوده وسياساته.

---

## ═══ المبدأ الحاكم: «لم يُختبَر» ≠ «حصل صفراً» ═══

هذا أهمّ قرار في المايجريشن كلّه.

جعل `score` بـ`DEFAULT 0` أو `NOT NULL` كان سيبدو «أنظف» — لكنه **يُعيد
بالضبط العطل الذي أصلحناه في 0351**: متوسط درجات محسوب على من لم
يخضعوا لاختبار أصلاً.

**الإثبات في الاختبار** (موظفان: علي 80 · سارة `NULL`):

```
avg_score = 80.0 · scored_count = 1     ✅ على المُختبَرين وحدهم
لو حُوّلت NULL صفراً ⇒ 40.0             ✖ رقم مضلِّل
```

`SENTINEL_B1` يحرس 80.0 و`SENTINEL_B2` يرفض 40.0 صراحةً.

والحراسة ممتدّة عبر الطبقات كلها:

| الطبقة | الحارس |
|---|---|
| القاعدة | `score` NULL-able بلا DEFAULT · `avg()` يتجاهل NULL |
| الدالة | `count(score)` لا `count(*)` · لا `COALESCE(agg.avg_score, 0)` |
| الخدمة | `nullableNum` لا `num` |
| الصفحة | «—» و«لم يُختبَر» لا صفر |
| التصدير | «لم يُختبَر» لا `0` — *الصفر في Excel يُقرأ رسوباً* |

★ والمتوسط الكلّي **موزون بعدد المُختبَرين** لا متوسط المتوسطات —
الأخير يظلم الدورة كثيرة المُختبَرين.

---

## القيود — كل عمود محروس

```sql
course_progress_score_range        CHECK (score IS NULL OR 0..100)
course_progress_time_spent_nonneg  CHECK (time_spent >= 0)
course_progress_progress_range     CHECK (progress 0..100)   ← لم يكن موجوداً
courses_rich_content_shape         CHECK (object AND blocks is array)
quiz_attempts_score_range · duration_nonneg · number_positive
quiz_attempts_submitted_has_score  ← محاولة مُسلَّمة بلا درجة سجلّ بلا معنى
quiz_attempts_time_order           ← التسليم لا يسبق البدء
quiz_attempts_unique_number        ← يمنع التكرار الصامت
```

---

## ★ لا عمود يتيم

> **العمود المُضاف بلا كاتب يبقى صفراً — والصفر يُعرَض كأنه قياس.**

لذلك كل عمود يُرافقه كاتب فعليّ:

| الدالة | تكتب |
|---|---|
| `training_progress_touch(course, secs, progress)` | `time_spent` · `last_access_at` · `progress` |
| `training_quiz_submit(quiz, score, answers, dur)` | `quiz_attempts` · `course_progress.score` |
| `training_quiz_attempts(quiz, employee)` | — تقرأ وتُغذّي `quizAiService` |

### قرارات سلوكية مُختبَرة

- **الوقت يتراكم** لا يُستبدل (`600 + 300 = 900`)
- **التقدّم لا يتراجع** — `GREATEST` يمنع نبضة متأخّرة من محو إنجاز
- **حدّ النبضة 3600 ثانية** — بلا حدّ يُفسد عميلٌ مُعطَّل كل متوسط
- **أفضل درجة لا آخرها** — من رسب ثم نجح يستحقّ نجاحه، ومن نجح ثم
  جرّب ثانيةً لا يُعاقَب (مُثبَت: 45 → 88 → 20 ⇒ الأفضل تبقى **88**)
- **رقم المحاولة يُحسب في القاعدة** لا في المتصفح — سباق التزامن

---

## الخصوصية — سجلّ اختبار الأفراد

`quiz_attempts` يحمل من رسب وكم مرة أعاد. لذلك:

- الموظف يرى **محاولاته وحده**؛ وتمرير معرّف زميله يُرفض صراحةً
- **لا سياسة UPDATE ولا DELETE** — سجلّ اختبار قابل للتعديل بلا قيمة
  تدقيقية. مُثبَت بدور `authenticated`: التعديل والحذف يمسّان **صفر صفّ**
- لا فرع `tenant_id IS NULL` (درس 0350)

---

## التحقق — كله مُنفَّذ فعلياً

| الأداة | النتيجة |
|---|---|
| `verify-training-columns-0353.sql` | **55 تأكيداً · صفر فشل** |
| `verify-training-columns-0353-rls.sh` | **17 تأكيداً · صفر فشل** (دور `authenticated`) |
| `_invert_0353.py` | **25/25 عكساً أسقط الاختبار** + 3 `EQUIVALENT` مُثبَتة |
| `src/test/trainingColumnsContract.test.ts` | **41 تأكيداً** |

★ العكوس البنيوية منفصلة: `ADD COLUMN` و`CREATE TABLE` بـ`IF NOT EXISTS`
**لا تُعكَس بإعادة تطبيق المايجريشن** (درس 0350).

### العكسان المُصنَّفان EQUIVALENT — بإثبات

`INV10` و`INV15` نجوَا. السبب حراسة مزدوجة **مُثبتة بالتشغيل**:

```
INSERT … time_spent = -5  ⇒ violates "course_progress_time_spent_nonneg"
INSERT … score = 150      ⇒ violates "quiz_attempts_score_range"
```

⇒ لا قيمة مستحيلة تمرّ في الحالتين. الحارسان في الدالة يبقيان لرسالة
عربية مفهومة، لكنهما **لا يُحتسبان تغطية أمنية** — والقيدان هما الحارس
الفعلي، وعكسهما (`INV21`/`INV25`) أسقط الاختبار فعلاً.

---

## ★ تصحيح معلن لحارس سابق

`trainingReportsContract` كان يمنع `.score` و`avgScore` و`time_spent`
لأنها **أعمدة معدومة حينها**. بعد إضافتها صار المنع يمنع قراءة عمود
حقيقي — فحُدِّث ليمنع ما لم يُضَف عمداً (`progress_percent` ·
`courses.active`)، وانتقل الحارس الأهمّ إلى الملف الجديد: **أن تبقى
`NULL` حيّة**.

★ وتصحيحان لأدوات قياسي: `NUMERIC(5,2)` يُطبَع `45.00` فصار التطبيع
بدل مقارنة نصّ حرفي هشّ · ومحاذاة `v_tenant` تختلف بين الدوال.

---

## الفحص الشامل (قاعدة نظيفة · RLS أولاً ثم SQL)

```
282 مايجريشن              · صفر فشل
22 سكربت RLS              · صفر فشل
60 ملف SQL                · صفر فشل
tsc EXIT=0
test:run 3829/3829 في 148 ملفاً
build ✅ 5.81s · contract PASS · lint 0 خطأ (1190 تحذيراً)
```

---

---

## ★★ التوصيلات الثلاث — أُنجزت في الجولة نفسها

> **عمودٌ بلا كاتب ولا قارئ = عمود يتيم.** إضافة الأعمدة وحدها لا تكفي.

### ① صفحة الموظف — عطلان جديدان مُثبتان

`TrainingPage.tsx` كانت تقرأ عمودين معدومين في سلسلة واحدة:

```js
Number(progress?.progress_percent ?? raw.progress ?? 0)   // :96
progress?.status === 'completed' || raw.status === 'completed'  // :97
```

- `course_progress.progress_percent` ⇒ **غير موجود** (الموجود `progress`)
- `courses.progress` ⇒ **غير موجود** أصلاً
- `course_progress.status` ⇒ **غير موجود** (الموجود `completed BOOLEAN`)
- و`raw.status` هو `courses.status` = `'active'` — حالة **الدورة** لا
  حالة الموظف فيها

**الأثر المُقاس** (موظف أتمّ الدورة: `progress=100 · completed=true`):

```
progressPercent ⇒ 0
status          ⇒ 'not_started'
```

⇒ **من أتمّ الدورة يظهر «لم يبدأ» بشريط 0%.**

أُنشئت `MyTrainingService` تقرأ الأعمدة الحقيقية وتُغلّف
`training_progress_touch` و`training_quiz_submit` و`training_quiz_attempts`.

★ وأُصلحت أعمدة معدومة أخرى في الصفحة نفسها: `modules_count` ·
`duration_minutes` · `is_mandatory` · `moduleList`.

### ② تبويب «الصور والملفات»

العمود أُضيف، لكن `training_course_upsert` (من 0352) لم تكن تعرفه ⇒
التبويب يبقى يحفظ في الفراغ. أُضيف `p_rich_content` بتوقيع أوسع.

★ **`NULL` تعني «لا تُغيّر» لا «امسح»** — وإلا محا زرُّ التفعيل/التعطيل
محتوى الوسائط. مُثبَت بـ`SENTINEL_R2`.

### ③ نبضة الوقت

`training_progress_touch` صارت متاحة من طبقة SDK عبر
`myTrainingService.touch()` — بحدّ 3600 ثانية للنبضة ورفض النبضة الصفرية.

---

## ما بقي

| البند | الحالة |
|---|---|
| **المتصفح** | لم يُختبَر — منطق قاعدة وفحص ثابت وRLS |
| نداء `touch()` من مُشغّل المحتوى | الخدمة جاهزة — يحتاج ربطاً بمشغّل الفيديو/القارئ عند بناء واجهة المشاهدة |
| واجهة أداء الاختبار | `submitQuiz()` جاهزة — لا شاشة تأدية اختبار للموظف بعد |
