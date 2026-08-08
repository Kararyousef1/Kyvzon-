# 0355 — دورة حياة السلف والقروض

**المرحلة 4 · بوابة الموارد البشرية · صفحة `src/pages/hr/LoansPage.tsx`**
التاريخ: 2026-08-07 · الجولة: `0355`

---

## خلاصة الجولة

| البند | الرقم |
|---|---|
| أعطال مُثبتة تشغيلياً | **9** (+ 3 اكتُشفت أثناء الإصلاح) |
| تأكيدات SQL سلوكية | **95** |
| فحوص RLS بدور `authenticated` | **30** |
| جولة العكس | **37/37** (+ 2 تكافؤ مُثبَت) |
| اختبار عقد | **68** |
| جدول جديد | `loan_repayments` |
| دوال جديدة/مُعاد تعريفها | 6 + `payroll_approve` |

**الحالة بعد الجولة** (على قاعدة نظيفة، مُحقَّقة تشغيلياً):
```
284 مايجريشن · صفر فشل
62 ملف SQL   · صفر فشل
24 سكربت RLS · صفر فشل
tsc EXIT=0
```

---

## الأعطال — كلٌّ منها مقيس قبل كتابة سطر واحد

المسابر: `tools/dev/_probe_0355.sql` · `_probe_0355b/c/d/e.sql`

### ① ★★★ مفردتان مختلَقتان: `active` و`completed`

`LoansPage.tsx:143` يُرشِّح بـ`l.status === 'active'` ويجمع منها «المتبقي
النشط»، و`:181` يعدّ `'completed'`. و`src/shared/types/payroll.ts:14`:

```ts
export type LoanStatus = 'pending'|'approved'|'active'|'completed'|'rejected'
```

القيد الحقيقيّ `employee_loans_status_chk` (مقروء من `pg_constraint`):

```
pending · approved · rejected · paid · cancelled
```

**المقيس:**
```
PROBE_1A: INSERT status='active'    ⇒ violates check constraint
PROBE_1B: INSERT status='completed' ⇒ violates check constraint
```

**الأثر:** بطاقة «المتبقي النشط» صفر **أبداً** · بطاقة «مكتملة» صفر أبداً ·
شريط التقدّم مشروط بـ`status === 'active'` فلا يظهر لأيّ سلفة على الإطلاق ·
زرّا الفلترة «ساري» و«مكتمل» يعرضان قائمة فارغة دائماً. وبالمقابل `paid`
و`cancelled` — وهما مفردتان **حقيقيتان** — بلا زرّ ولا تسمية:
`LOAN_STATUS_LABELS[loan.status]` = `undefined` فتظهر شارة فارغة.

**القرار:** القاعدة هي المرجع. نُبقي المفردات الخمس ونُصلح الواجهة.
توسيع القيد ليقبل `active` يعني حالتين بمعنى واحد — و«الساري» ليس حالة
بل **اشتقاق**: `approved` بمتبقٍّ موجب.

### ② ★★★ لا شيء في المنظومة كلّها كان يُسدّد قسطاً

مسحُ `pg_proc` لكل دوال `public` (`prokind='f'`):

```
دوال تكتب months_paid           →  صفر
دوال تُصدر UPDATE employee_loans →  record_financial_rejection_reason
                                    sync_hr_source_status
                                    (كلتاهما status/rejection_reason فقط)
```

**المقيس** (PROBE_2 — سلفة 1,200,000 على 12 شهراً، قسط 100,000، دور `hr`):

```
فبراير 2026 | total_deductions = 100000.00
مارس   2026 | total_deductions = 100000.00
القرض       | remaining_amount = 1200000.00 · months_paid = 0
```

**الأثر:** سلفة **أبدية** — تُخصم من راتب الموظف كل شهر إلى ما لا نهاية ولا
تُسدَّد أبداً. `payroll_run` يقرأ `remaining_amount` ولا يكتبه، وشرط
`AND COALESCE(l.remaining_amount,0) > 0` في 0348 لا يُنقذ لأن المتبقّي لا
ينقص فلا يبلغ الصفر. و`LoansPage:216` يعرض «المدفوع: 0/12 شهر» بعد سنتين
من الخصم، وشريط التقدّم `(amount − remaining)/amount` = 0%.

**PROBE_3:** جدول `loan_repayments` أو `loan_installments` → **0**
رغم أن `payroll.ts:104` يُعرّف `interface LoanRepayment` كاملاً. النوع
موجود في TypeScript والجدول غير موجود في القاعدة.

### ③ ★★ `setMonth` يتخطّى الشهر

`FinanceService.approveLoan`:
```js
const end = new Date(opts.startDate);
end.setMonth(end.getMonth() + opts.monthsCount);
```

**المقيس** (node مقابل PROBE_4):
```
JS  31 يناير 2026 + 1  شهر  →  2026-03-03   ← ثلاثة أيام في مارس
PG  31 يناير 2026 + 1  شهر  →  2026-02-28   ← الصحيح
JS  31 أغسطس 2026 + 6 أشهر  →  2027-03-03
```

فبراير لا يملك يوماً 31 فيفيض JS إلى مارس. و`sync_hr_source_status` (0325)
يحسبه في القاعدة صحيحاً — فالمساران يعطيان تاريخين مختلفين لنفس السلفة.

### ④ ★★★ زرّ «موافقة» يفشل لكل سلفة قادمة من بوابة الموظف

`MyLoansPage:143` تستدعي `createApproval('loan', …)` بعد الإنشاء فتُبنى
سلسلة اعتماد، والمحفّز `trg_guard_status_bypass` يمنع تغيير الحالة مباشرةً.

**المقيس** (PROBE_7E — بقسم ومدير وقاعدة مبلغ):
```
OPEN_STEPS = 1
PROBE_7E: مرفوض ← APPROVAL_CHAIN_BYPASS: للطلب سلسلة اعتماد مفتوحة
          (1 خطوة). استعمل صندوق الموافقات …
```

وزرّ «موافقة» يستدعي `approveLoan` وهو `UPDATE` مباشر ⇒ **يرمي دائماً**.
أمّا سلف HR نفسها فتمرّ (PROBE_7 بلا سلسلة: «التحديث المباشر نجح») —
فالسلوك يختلف باختلاف مصدر السلفة بلا أن يُنبَّه المستخدم.

### ⑤ ★★ `handleCreate` لا يبني سلسلة اعتماد أصلاً

`grep createApproval src/pages/hr/LoansPage.tsx` → **صفر مطابقة**.
سلفة يُنشئها HR بأيّ مبلغ تمرّ بلا اعتماد أحد، بينما سلفة الموظف بـ100 ألف
تمرّ بسلسلة كاملة. **باب خلفيّ للمبالغ الكبيرة.**

### ⑥ ★ `start_date` يُجمع في النموذج ويُهمَل

`:38` يُهيّئه في `formData` و`:82` يُعيد تهيئته بعد النجاح — ولا يُمرَّر في
`createLoan` (السطور 70–76). فيستعمل `FinanceService.createLoan:94`
تاريخ اليوم. ولا حقل إدخال له في النافذة رغم وجوده في الحالة.

### ⑦ ★ قسمة على صفر بلا حارس

`:68`: `const installment = formData.amount / formData.months_count;`
مقيس بـnode: `1200000 / 0` = **`Infinity`** ⇒ `JSON.stringify` يحوّله
`null` ⇒ `monthly_installment NOT NULL DEFAULT 0` تصبح 0. (`createLoan`
تحمي `months` بـ`|| 1` لكن ليس `installment` لأنه يُمرَّر صراحةً.)

### ⑧ ★ نقل الجدول إلى المتصفّح

`fetchLoans` تنفّذ استعلامين بلا حدّ (كل السلف + كل الموظفين) وتبني `Map`
في المتصفّح لتربطهما. و`getTotalOutstanding` تجلب كل صفوف `approved`
لتجمعها في JS.

### ⑨ ★★ لا سجلّ تدقيق لأي تسديد

لا يمكن الإجابة عن «متى سُدِّد القسط الثالث ومن أي فترة رواتب».

---

## ثلاثة أعطال اكتُشفت **أثناء** الإصلاح

هذه لم تكن في القائمة الأصلية — كشفتها التأكيدات نفسها.

### ⑩ ★★★ تجاوز `admin` يترك خطوة السلسلة مفتوحة أبداً

كشفه التأكيد **7.7** (`out_chain_open = 1` على سلفة مبتوتٍ فيها).
**الأثر:** الطلب يظهر «بانتظار الاعتماد» في صندوق الموافقات لأحدٍ لا قرار
له، وأيّ استعلام عن المعلَّقات يعدّه. **الحلّ:** إغلاق الخطوات بـ`skipped`
(مفردة موجودة في `hr_approval_steps_status_check`) مع أثر تدقيق نصّيّ —
لا محو.

### ⑪ ★★ سلفة مرفوضة تظهر «100% مسدَّدة»

كشفه التأكيد **7.9**. المرفوضة `remaining = 0` لأنها لم تُصرف، فالصيغة
`(amount − 0) / amount` تعطي 100% وشريطاً ممتلئاً على سلفة لم يُدفع منها
فلس. **الحلّ:** التقدّم لا معنى له إلا لسلفة صُرفت (`approved`/`paid`).

### ⑫ ★★★ ثغرة أمنية — بوابة الوحدة `PERMISSIVE`

كتبتُ `hybrid_gate_loan_repayments` بلا `AS RESTRICTIVE`. سياستان
`PERMISSIVE` تُدمجان بـ**OR** — فبوابة الوحدة (تعود TRUE لكل مشترك في `hr`)
تُلغي أثر سياسة المستأجر تماماً.

**المقيس قبل الإصلاح** (بدور `authenticated` حقيقيّ):
```
HR/شركة ب  →  SELECT count(*) FROM loan_repayments  =  3
              وهي كل الصفوف، منها صفّان يخصّان شركة أ
سالم       →  رأى تسديد زميله ناصر
المدير     →  رأى الجميع
```

نظيرتها في `employee_loans` من 0151 هي `RESTRICTIVE` (`polpermissive=f`)
وهو الصواب. **ملف الـSQL لا يستطيع كشف هذا** لأنه يعمل بدور `postgres`
وهو `BYPASSRLS` — كشفه سكربت RLS وحده.

### ⑬ ★★ منحة ضمنية من 0268

`ALTER DEFAULT PRIVILEGES IN SCHEMA public` يمنح `authenticated` كل
الصلاحيات على **كل جدول جديد**. المقيس قبل الإصلاح:
```
authenticated | INSERT · SELECT · UPDATE · DELETE
```
فمنحُ `SELECT` وحده لا يكفي — المنحة الضمنية سبقتنا. لولا `REVOKE ALL`
الصريح لأمكن للمتصفّح كتابة صفّ تسديد وتزوير سداد سلفة.

---

## ما بُني

### (أ) `loan_repayments` — سجلّ التسديد

| العمود | الملاحظة |
|---|---|
| `loan_id` · `employee_id` · `payroll_period_id` | FK · الأخير `SET NULL` |
| `amount` · `installment_no` · `remaining_after` | بقيود موجبية |
| `source` | `payroll` · `manual` · `settlement` |

**`uq_loan_repay_per_period (loan_id, payroll_period_id) WHERE … IS NOT NULL`**
— حاجز بنيويّ ضدّ الخصم المزدوج. جزئيّ لأن التسديد اليدويّ قد يتكرّر
بمشروعية.

**الحماية:** RLS مفعّلة · سياسة SELECT بالمستأجر والملكية · بوابة الوحدة
`RESTRICTIVE` · **لا سياسة INSERT/UPDATE/DELETE** (الكتابة عبر
`SECURITY DEFINER` وحدها) · `REVOKE ALL FROM authenticated` ثم
`GRANT SELECT` · محفّز `trg_block_loan_repayment_delete`.

### (ب) `loan_apply_repayment(loan, period, amount, source)`

تُنقص المتبقّي · تزيد `months_paid` · تُغلق بـ`paid` عند الصفر ·
**تقصّ آخر قسط عند المتبقّي** (`LEAST` — درس 0348) · بلا `ON CONFLICT`
(التكرار يجب أن يرمي لا أن يُبتلع).

### (جـ) `payroll_approve` — الربط

التسديد عند **الاعتماد** لا عند التشغيل: `payroll_run` قابل للإعادة ما
دامت الفترة `draft`/`pending_approval`، فربطُه بالتسديد يعني خصماً عند كل
إعادة تشغيل. `payroll_approve` يقع مرّة واحدة.

الشرط `EXISTS (payroll_records …)` جوهريّ: القسط لا يُسدَّد إلا إن خُصم
فعلاً من راتب هذا الموظف في هذه الفترة.

### (د) `loan_create(...)` · (هـ) `loan_summary()` · (و) `loan_board(status, limit)`
### (ز) `loan_decide(loan, decision, reason)` · (ح) `loan_repayment_history(loan)`

---

## جولة العكس — 37/37

`PGPORT=<PORT> python3 tools/dev/_invert_0355.py`

**سبع ثغرات تغطية سُدَّت** بعد أن نجت من الجولة الأولى:

| العكس | لماذا نجا | السدّ |
|---|---|---|
| `INV07` | السلفة الأجنبية في العيّنة `pending` فيمسكها حارس «التسديد يتطلّب approved» **قبل** ترشيح المستأجر | عيّنة أجنبية **معتمَدة بمتبقٍّ موجب** + فحص نصّ الرسالة (8.4b–e) |
| `INV10` | «مبلغ سالب يرمي» يمرّ حتى بلا الحارس — يرمي بمسار آخر | إلزام رمز `LOAN_BAD_AMOUNT` + تحقّق أن لا صفّ سالباً (2.6b/c) |
| `INV17` | بعد الإلغاء في 4.17 صارت «السارية» = 0، و`status='active'` يعطي 0 أيضاً | إضافة سلفة `approved` بمتبقٍّ موجب — هي وحدها تُفرّق (6.x) |
| `INV31` | «قرار paid يرمي» يمرّ لأن `'paid'` يرمي أيضاً حين يُقبَل | إلزام رمز `LOAN_BAD_DECISION` + تحقّق أن الحالة لم تتغيّر (3.9b–d) |
| `INV33` | الحارس كان يفحص الزميل (نفس المستأجر) فلا يلمس ترشيح المستأجر | سجلّ سلفة **أجنبية** (8.7/8.8) |
| `DDL03` | قيد موجبية المبلغ لم يكن مُختبَراً — لا بيانات تخالفه | إدراج مباشر بمبلغ سالب/صفر ومتبقٍّ سالب ومصدر مجهول (10.A–E) |
| `INV02` | **ليس ضعف تغطية**: فخّ `IF NOT EXISTS` في ثوب الصلاحيات — المنحة الضمنية تُطبَّق لحظة `CREATE TABLE` وحدها، والجدول موجود مسبقاً | نُقل إلى `DDL05` بـ`GRANT` صريح |

> **الدرس المتكرّر للمرّة الواحدة والعشرين:**
> **شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.**

### التكافؤات المُثبتة (لا تُعدّ ثغرات)

- **`EQ01`** حارس `p_source` مُكافئ لـ`loan_repayments_source_chk` — الفارق
  رسالة الخطأ فقط، والصفّ يُرفض في الحالتين.
- **`EQ02`** `RETURN 0` حين `remaining <= 0` مُكافئ عملياً لحارس
  `status='approved'` (INV06) الذي يسقط الاختبار فعلاً.

---

## أخطائي في هذه الجولة — مُصحَّحة علناً

1. **التأكيد 4.14**: توقّعتُ «الخصم = 0» بعد سداد السلفة فسقط بـ
   `got=«100000.00»`. السبب: لسالم **سلفتان** — المسدَّدة، و«سلفة بسلسلة»
   600,000/6 التي اعتمدها admin. **السلوك صحيح والتوقّع كان خاطئاً.**
   أضفتُ 4.17 يُلغي السارية ويُثبت الصفر فعلاً.
2. **`round(…, 2)` على `0` الحرفيّ** يعطي `«0»` لا `«0.00»` — `NUMERIC` بلا
   مقياس. نقلتُ `COALESCE` داخل `round`.
3. **`fnBody` في اختبار العقد** كان يعمل على النصّ الخام فيلتقط التعليقات:
   التأكيد «لا `ON CONFLICT`» سقط لأن **التعليق نفسه** يقول «لا ON CONFLICT».
4. **`status IN ('pending','active')`** في `loan_decide` يخصّ **خطوات
   الاعتماد** لا حالة السلفة، و`'active'` مفردة مشروعة هناك. ضيّقتُ الحارس
   إلى `l.status`.
5. **`hybrid_gate` PERMISSIVE** — ثغرة أمنية كتبتُها أنا (العطل ⑫ أعلاه).
6. **`set_config(…, TRUE)`** داخل `DO $$` لم يصل إلى المحفّز — لزم نطاق
   الجلسة (`FALSE`).
7. **مسابر بـUUIDات متطابقة في أول 8 حروف** — المحفّز `tg_ensure_employee_row`
   يبني `employee_code` من 8 حروف فقط، و`ON CONFLICT DO NOTHING` ابتلع
   التصادم صامتاً: 7 ملفات و**صفّان فقط** في `employees`.

---

## الملفات

```
supabase/migrations/0355_employee_loans_lifecycle.sql
tools/dev/verify-loans-lifecycle-0355.sql        95 تأكيداً
tools/dev/verify-loans-lifecycle-0355-rls.sh     30 فحصاً
tools/dev/_invert_0355.py                        37/37 + 2 EQ
src/services/sdk/LoanService.ts                  جديد
src/services/sdk/index.ts                        تصدير
src/pages/hr/LoansPage.tsx                       أُعيدت كتابتها
src/test/loansLifecycleContract.test.ts          68 تأكيداً
```

★ المكوّنات الخمسة (`Modal` · `FormField` · `ModalActions` ·
`EmployeePicker` · `DetailRow`) بقيت مُصدَّرة بتوقيعاتها — **تسع صفحات**
تستوردها من `LoansPage`، وحارسٌ في اختبار العقد يمسح `src/pages` كلها
ويتحقّق أن لا مستورِد فقد مكوّناً.

---

## ما لم يُحلّ بعد

| البند | الملاحظة |
|---|---|
| `src/shared/types/payroll.ts` | `LoanStatus` ما زال يُعرّف `active`/`completed` — يستعمله `MyLoansPage` و`payrollUtils`. توحيده يمسّ بوابة الموظف: **جولة لاحقة**. |
| `FinanceService.employeeLoanService` | `approveLoan`/`rejectLoan`/`getTotalOutstanding` باقية لأن `MyLoansPage` و`EmployeeDashboard` يستعملانها. تُهاجَر في جولة بوابة الموظف. |
| `MyLoansPage` | `normalizeLoanStatus` يترجم `paid` → `completed` — يعمل، لكنه يُبقي المفردة المختلَقة في الواجهة. |
| المتصفّح | لم يُختبَر — كل ما سبق منطق قاعدة وRLS وفحص ثابت. |
