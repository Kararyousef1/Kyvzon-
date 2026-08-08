# 0344 — مفردات حالة الحضور · ربط الإجازة · طلبات التصحيح

**الحالة:** مُنفَّذ ومُختبَر على Postgres 17 محلي · لم يُدفَع بعد (بقرارك: عند اكتمال البوابتين).

---

## ★★★ أولاً: تصحيح علنيّ لخطأ ارتكبتُه في `0337`

في `0337_my_attendance_month.sql:57` كتبتُ:

```
-- ★ الحالات نصوص عربية: 'في الوقت' · 'متأخر' · 'غائب' · 'إجازة'
--   (لا CHECK يقيّدها — قيم حرّة، لذلك نطابق نصّاً)
```

**هذا خاطئ.** المفردات الفعلية **ثمانٍ** لا أربع، ولا واحدة منها `'في الوقت'` ولا `'حاضر'` ولا `'إجازة'`.

المصدر الوحيد للحقيقة هو `determineAttendanceStatus` في `src/utils/shiftCalculations.ts:261` — الدالة التي تُنتج كل قيمة تُكتب في العمود:

| # | المفردة | التصنيف |
|---|---|---|
| ① | `حضور_بوقت` | present |
| ② | `متأخر` | present |
| ③ | `زمنية_معتمدة` | present |
| ④ | `زمنية_انتظار` | present |
| ⑤ | `غائب` | absent |
| ⑥ | `مجاز` | leave |
| ⑦ | `إجازة_انتظار` | leave |
| ⑧ | `عطلة` | leave |

**ثمانية مصادر مستقلة** تؤكّدها — و`0337` قال غيرها:

| المصدر | الموضع |
|---|---|
| `determineAttendanceStatus` | `shiftCalculations.ts:261` |
| `type AttendanceStatus` | `shiftTypes.ts:15` |
| `STATUS_LABELS` / `STATUS_COLORS` | `shiftReports.ts:9,33` |
| `leaveAttendanceLink` | `:57` (`'مجاز'`) · `:123` (`'زمنية_معتمدة'`) |
| `KioskPage` | `:164` (أربع حالات) |
| `MyAttendancePage` | `:91` |
| `AIInsightsDashboard` | `:98` |
| `complete_demo.sql` | `:194` — `CASE` من **ثمانية** فروع |

### ولماذا لم يسقط اختبار العقد؟ — درس التغطية للمرة التاسعة

`src/test/myAttendanceContract.test.ts:87` كان يكتب:

```ts
expect(body).toMatch(
  /sum\(total_hours\) FILTER \(WHERE status IN \('في الوقت','متأخر','حاضر'\)\)/
);
```

هذا **ينسخ نصّ المايجريشن ويطالب بمطابقته** — أي يقارن الدالة بنفسها. لو كتبتُ `'أبجد'` لمرّ الاختبار بشرط كتابة `'أبجد'` في الاختبار أيضاً.

*نسخ المنطق بدل استدعائه.*

---

## الأعطال المُثبتة تشغيلياً (قبل أي إصلاح)

### ① الإحصاءات تكذب على الموظف

بيانات الإثبات — سبعة أيام بمفردات الشيفرة الحقيقية:

```
3/1 حضور_بوقت 8.00 · 3/2 حضور_بوقت 8.00 · 3/3 متأخر 7.00 (30د)
3/4 زمنية_معتمدة 6.00 (45د إضافي) · 3/5 غائب · 3/8 مجاز · 3/9 عطلة
```

| | ما تُرجعه `0337` | الحقيقة |
|---|---|---|
| `total` | 7 | 7 ✅ |
| `present` | **1** | **4** |
| `late` | 1 | 1 ✅ |
| `absent` | 1 | 1 ✅ |
| `leave` | **0** | **2** |
| `totalHours` | 29.00 | 29.00 ✅ |
| `avgHours` | **7.00** | **7.25** |

> **الموظف الذي حضر أربعة أيام يرى «حضور: 1».** و`مجاز` و`عطلة` يسقطان من كل خانة — لا حضوراً ولا إجازةً ولا غياباً: **يتبخّران**.
>
> ★★ ولاحظ أن `total=7` **صحيح** لأنه `count(*)` بلا ترشيح. لهذا بدت الشاشة «تعمل»: الرقم الإجمالي سليم والتفصيل كلّه خطأ.

### ② التتابع يعود 1 بدل 4

```
my_attendance_streak() ⇒ current=0  longest=1  lastAbsence=2026-03-05
الحقيقة              ⇒            longest=4  (1·2·3·4 مارس)
```

عادت `1` لأن `حضور_بوقت` و`زمنية_معتمدة` خارج قائمة `IN ('في الوقت','متأخر','حاضر','غائب')` — فلم يبقَ إلا `'متأخر'` (3/3) وحده.

### ③ رحلة الإجازة ↔ الحضور مقطوعة في ثلاثة مواضع

`src/services/integrations/leaveAttendanceLink.ts` يلمس Supabase مباشرة فلا يستفيد من حقن `tenant_id` في `BaseService`:

| # | الموضع | الإثبات الحرفي |
|---|---|---|
| ③-أ | `:52` upsert بلا `tenant_id` | `null value in column "tenant_id" of relation "attendance_summary" violates not-null constraint` |
| ③-ب | `:63` `onConflict: 'employee_id, shift_date'` | `there is no unique or exclusion constraint matching the ON CONFLICT specification` — القيد الحقيقي **ثلاثيّ**؛ فهارس فريدة على العمودين وحدهما = **0** |
| ③-ج | `:189` `rpc('refresh_attendance_summary')` | `SELECT count(*) FROM pg_proc WHERE proname='refresh_attendance_summary'` ⇒ **0** |

> **اعتماد أي إجازة لم يكن يُحدّث سجلّ الحضور إطلاقاً.** ورفضها كان يحذف الصفوف **حذفاً نهائياً** ثم يستدعي دالةً غير موجودة لإعادة بنائها ⇒ **فقدان بيانات صافٍ** — ومخالفة لقاعدة «لا حذف نهائي».
>
> تعريف `refresh_attendance_summary` الوحيد في `database/legacy-DO-NOT-USE/schema.sql:869` ولم يُنقَل قطّ. `grep -rln refresh_attendance_summary supabase/` ⇒ صفر مطابقة.

### ④ عطلة الأسبوع مقلوبة

```js
if (dayOfWeek === 6) continue; // جمعة   ← التعليق يقول الجمعة
```

`Date.getDay()`: `0`=الأحد … **`5`=الجمعة** … `6`=السبت. مُحقَّق بالتشغيل:

```
new Date('2026-05-01').getDay() === 5  ⇒ الجمعة
new Date('2026-05-02').getDay() === 6  ⇒ السبت
```

⇒ الكود كان **يتخطّى السبت** (يوم عمل) و**يعالج الجمعة** (عطلة).

### ⑤ العمود بلا أي قيد

```
قيود CHECK على attendance_summary = 0
```

أدرجتُ `status='قيمة عشوائية لا معنى لها'` بلا اعتراض. عمودٌ تقرأه ست شاشات بمطابقة نصّية — وهو ما سمح لخطأ `0337` بالمرور صامتاً.

### ⑥ طلب التصحيح يختفي بلا أثر

`MyAttendancePage` تُنشئ `hr_case` بـ`case_type='attendance_correction'` ثم **لا تعرضه أبداً**. الموظف يضغط «أرسل»، يرى رسالة نجاح، ولا يعرف بعدها شيئاً — لا رقم طلب ولا حالة ولا ردّ.

### ★ خطأ في تشخيصي صحّحتُه

ادّعيتُ أن `submitCorrectionRequest` يفشل بعطل `tenant_id` كما في `0342`. **خاطئ**: الصفحة تمرّ عبر `hrCaseService` → `BaseService.create` → `injectTenantId()` الذي يحقنه. الإثبات الأول كان بـSQL خام لا يمثّل مسار الصفحة. العطل الحقيقي هو ⑥ (لا عرض) لا الإرسال.

---

## ما يفعله المايجريشن

| # | العنصر |
|---|---|
| ① | `attendance_status_bucket(TEXT)` — تصنيف مركزيّ `IMMUTABLE`، مصدر حقيقة واحد |
| ② | `my_attendance_month_stats` — أُعيد إنشاؤها بالمفردات الصحيحة + `out_unknown` |
| ③ | `my_attendance_streak` — أُعيد إنشاؤها؛ الإجازة تُتخطّى ولا تكسر |
| ④ | `apply_leave_to_attendance` / `revert_leave_from_attendance` — `DEFINER`، بلا حذف نهائي |
| ⑤ | `my_attendance_corrections` — سجلّ طلبات التصحيح |
| ⑥ | `CHECK` على المفردات الثماني (`NOT VALID`) + فهرس جزئيّ |

### لماذا `SECURITY DEFINER` للدالتين الكاتبتين؟

سياسة `kyvzon_attendance_summary_insert` تشترط `current_user_is_staff()`، وهي — مُحقَّقة من `pg_get_functiondef` — تعني `admin·hr·developer·it_admin` **فقط**.

**المدير الذي يعتمد الإجازة ليس staff** ⇒ الإدراج كان ليُصدّ حتى بـ`tenant_id` صحيح. مُثبَت بـRLS:

```
new row violates row-level security policy for table "attendance_summary"
```

الدالة `DEFINER` تفحص الدور والمستأجر بنفسها صراحةً.

---

## التحقق

### قاعدة نظيفة من الصفر

```
مايجريشنات : 273  · فشل: 0
ملفات SQL  : 51   · فشل: 0  · 1354 تأكيداً
سكربتات RLS: 13   · فشل: 0
```

### هذه الجولة

| البند | العدد |
|---|---|
| `verify-attendance-vocabulary-0344.sql` | **91** تأكيداً |
| `verify-attendance-vocabulary-0344-rls.sh` | **26** تأكيداً |
| `attendanceVocabularyContract.test.ts` | **72** اختباراً |
| **عكس الإصلاحات** | **51/51** مُغطّى |

### الفحوص الثابتة

```
tsc --noEmit          EXIT=0
npm run test:run      3439/3439 في 139 ملفاً
npm run build         ✅ 5.41s
db:contract-check     PASS
npm run lint          0 خطأ (1216 تحذيراً موروثاً — كانت 1221)
sdk:boundary-check    52 انتهاكاً موروثاً (مالية/مخزون/تصنيع) · صفر في نطاقي
```

---

## ★ جولة العكس — 51/51

كل إصلاح عُكس منفرداً وأُثبت سقوط الاختبار، ثم استُرجع الأصل. عيّنة:

| العكس | ما سقط |
|---|---|
| `present` يعدّ الكلّ | `present = 7 (متوقَّع 4)` |
| `leave` يعود صفراً | `leave = 0 (متوقَّع 2)` |
| المتوسط على كل الأيام | `avgHours = 4.14 (متوقَّع 7.25)` |
| القيد الثنائي | `there is no unique or exclusion constraint…` |
| إسقاط `tenant_id` | `null value in column "tenant_id"…` |
| التراجع يحذف | `الصفوف بعد التراجع = 0 (متوقَّع 3 باقية)` |
| القيد يقبل مفردات 0337 | `«في الوقت» قُبلت — القيد لا يحرس` |

### ثغرات تغطية اكتشفتُها في اختباري نفسه وأصلحتُها

| # | الثغرة | الإصلاح |
|---|---|---|
| ① | القسم `②-د` كان **يُعيد بناء القيد الذي يفحصه** بنصّه الصحيح ⇒ ثلاثة عكوس مرّت | يلتقط `pg_get_constraintdef` ويستعيد **النصّ الذي وجده** |
| ② | `employee_id` UUID فريد عالمياً ⇒ ترشيحه يُقصي المستأجر الآخر ضمناً | صفٌّ بنفس `employee_id` في مستأجر آخر |
| ③ | `RAISE EXCEPTION '…نطاق معكوس قُبل'` ثم فحص `LIKE '%معكوس%'` — **رسالة الفشل نفسها تحوي الكلمة** | راية مميِّزة `SENTINEL_413` |
| ④ | يومَا الإجازة وُضعا حيث السلسلة مكسورة أصلاً | وُضعا **داخل** سلسلة متّصلة + ضدّ موجب (غياب ⇒ `longest=2`) |
| ⑤ | الشهر الفارغ يمرّ بالمسار العادي لا الفرع الحارس | شهر `13` · شهر `0` · سنة `1800` |

### عكس واحد مُصنَّف `EQUIVALENT`

`③.2` (الإجازة تكسر السلسلة) لم يُسقط الاختبار — وحقّقتُ السبب بدل افتراض ثغرة:

```
③.1+③.2 معاً ⇒ سقط عند «3.3 lastAbsence»
③.2 وحده     ⇒ مرّ (بلا أثر)
```

الحلقة **لا ترى** `'leave'` أصلاً لأن `WHERE` يُقصيه قبلها ⇒ حراسة مزدوجة لا ثغرة تغطية. الشرط مُغطّى فعلاً عبر `③.1` و`③.3` و`3.5c`.

---

## انحدارات كُشفت وأُصلحت

| # | الانحدار | الإصلاح |
|---|---|---|
| ① | القيد الجديد أسقط `verify-employee-dashboard-0335.sql` و`verify-my-attendance-0337.sql` — يستعملان المفردات المختلقة | استبدال دلاليّ 1:1 (`'حاضر'`→`'حضور_بوقت'` · `'في الوقت'`→`'حضور_بوقت'` · `'إجازة'`→`'مجاز'`). النتيجة: **38** و**39** تأكيداً ✅ |
| ② | `manager-flow.test.ts:687` كان يمرّ **بسبب العطل نفسه** — الموك يُرجع `{data:null,error:null}` لأي إدراج ⇒ `success=true` دائماً، بينما القاعدة الحقيقية ترفض | أربعة اختبارات صريحة: بلا سياق ⇒ فشل · بسياق ⇒ نجاح · الجمعة تُتخطّى · **السبت لا يُتخطّى** |
| ③ | الموك ينقصه `.limit()` و`.insert().select().single()` | أُكمل |
| ④ | `myAttendanceContract` كان يقرأ **0337** بينما 0344 أعاد إنشاء الدالتين | يقرأ 0344 لهما + **حارس** يسقط إن أعاد 0344 إنشاء دالة غير مُدرَجة |
| ⑤ | خمسة تأكيدات سقطت لأنها طابقت **تعليقات** توثيقية تقتبس العطل | `codeOnlyTs`/`codeOnlySql` + اختبار ذاتي للمُجرِّدَين |
| ⑥ | `leaveAttendanceLink` صار مدخل allowlist ميّتاً | أُزيل من `check-sdk-boundary.mjs` |

> ★ **درس ⑤ يستحق التسجيل:** حظرُ ذكر العطل في التعليقات يعني منعَ توثيقه — والتوثيق هو ما يمنع تكراره. الحارس يفحص الشيفرة، ويطالب التوثيق بذكر المفردة المختلقة صراحةً.

---

## الحارس الجديد ضدّ تكرار الخطأ

`attendanceVocabularyContract.test.ts` **لا يقارن الدالة بنفسها**. يستخرج قيم `AttendanceStatus` من `shiftTypes.ts` ويطالب بأن:

1. كل قيمة تُنتجها المنصّة **مُصنَّفة** في `attendance_status_bucket`
2. ولا قيمة في القاعدة **خارج** ما تُنتجه المنصّة
3. وكل حالة تُعاد من فرع `if (!hasPunch)` **ليست** `present`
4. ولا قائمة حالات مكتوبة يدوياً داخل `my_attendance_month_stats`

⇒ إضافة حالة تاسعة إلى الشيفرة بلا إضافتها إلى القاعدة **تُسقط الاختبار**.

---

## الملفات

```
supabase/migrations/0344_attendance_status_vocabulary.sql   جديد
tools/dev/verify-attendance-vocabulary-0344.sql            جديد · 91 تأكيداً
tools/dev/verify-attendance-vocabulary-0344-rls.sh         جديد · 26 تأكيداً
tools/dev/_invert_0344.py                                  جديد · 51 عكساً
src/test/attendanceVocabularyContract.test.ts              جديد · 72 اختباراً

src/services/sdk/AttendanceService.ts        + myCorrections · applyLeaveToAttendance
                                             · revertLeaveFromAttendance · unknown
src/services/integrations/leaveAttendanceLink.ts  لم يعد يلمس Supabase
src/pages/employee/MyAttendancePage.tsx      + 4 بطاقات · سجلّ التصحيح · 8 ألوان
src/test/myAttendanceContract.test.ts        يقرأ 0344 + حارس المرجع
src/test/manager-flow.test.ts                4 اختبارات بدل واحد وهميّ
tools/dev/verify-employee-dashboard-0335.sql مفردات مُصحَّحة
tools/dev/verify-my-attendance-0337.sql      مفردات مُصحَّحة
scripts/check-sdk-boundary.mjs               مدخل ميّت أُزيل
```

---

## ما لم يُنجَز بعد

- **المتصفح** — لم يُختبَر. كل ما سبق منطق قاعدة وفحص ثابت وRLS.
- **`db push` لـ`0332`–`0344`** — ثلاثة عشر مايجريشناً، بقرارك عند اكتمال البوابتين.
- `VALIDATE CONSTRAINT attendance_summary_status_vocab` — بعد تنظيف أي بيانات قديمة. اطّلع على `out_unknown` في شاشة الموظف أولاً.
- `permissionService` (جدول `permissions`) — لا شاشة تسجّل `actual_out_time`.
- `sop_compliance_overview` · `corrective_actions` · `biometric_devices_health` — جاهزة بلا واجهة.
