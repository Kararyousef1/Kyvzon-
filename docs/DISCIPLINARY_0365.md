# الإجراءات التأديبية — المايجريشن 0365

> المرحلة 4 · بوابة الموارد البشرية · الصفحة العشرون من ست وعشرين
> `src/pages/hr/DisciplinaryPage.tsx` — من **210** سطراً إلى **710**

---

## الخلاصة بالأرقام

| البند | العدد |
|---|---|
| أعطالٌ مُثبتة تشغيلياً قبل كتابة سطر | **16** |
| صفوفٌ فاسدة قُبِلت في المسبار الأول | **13 من 13** |
| تأكيدات `verify-disciplinary-0365.sql` | **53** |
| تأكيدات `verify-disciplinary-0365-rls.sh` (دور `authenticated`) | **34** |
| أعكاسُ `_invert_0365.py` | **58/58** + مكافئان موثَّقان |
| تأكيدات `disciplinaryContract.test.ts` | **45** |
| دوالٌ جديدة | **8** |
| قيود CHECK جديدة | **12** |
| مفاتيح أجنبية مركَّبة | **2** |
| أعمدة دورة حياة جديدة | **10** |

---

## ★★★ الحقيقة الأولى: الجدول كان عارياً

`pg_constraint` كاملاً على `disciplinary_actions` قبل هذه المايجريشن
**سطران اثنان**:

```
disciplinary_actions_pkey            | p | PRIMARY KEY (id)
disciplinary_actions_tenant_id_fkey  | f | FOREIGN KEY (tenant_id) → tenants
```

صفر `CHECK` · صفر مفتاح أجنبيّ على الموظف أو المُصدِر · صفر دالة
(`pg_proc` حيث `prosrc ILIKE '%disciplinary%'` أعاد **دالةً واحدة** هي
`auto_create_triggers` وهي عامّةٌ لا تخصّ التأديب) · محفّزٌ واحدٌ عامّ
هو `update_updated_at_column`.

المسبار أدرج **ثلاثة عشر صفّاً فاسداً**. **قُبل كلُّ واحدٍ منها.**
لا صفَّ واحداً رفضته القاعدة.

---

## الأعطال الستة عشر

### ① `employee_id` بلا مفتاح أجنبيّ
```
PROBE_1 = قُبِل — إجراءٌ تأديبيٌّ لموظفٍ غير موجود.
          id=542dfaf7-e0b6-4519-b89e-097e773a6435
          employee_id = ffffffff-ffff-ffff-ffff-ffffffffffff
```
الصفحة تعرض القيمة الاحتياطية «موظف» لسجلٍّ عقابيٍّ لا صاحب له.

### ② `issued_by` بلا مفتاح أجنبيّ
```
PROBE_2 = قُبِل — issued_by يشير إلى لا أحد (eeeeeeee-…).
```
إجراءٌ تأديبيٌّ لا يُعرف من أصدره — والمساءلة تتطلّب مُصدِراً معلوماً.

**وعنوان `issued_by` هو `profiles` لا `employees`** — أُثبت على
العيّنة نفسها:
```
PROBE_17: يطابق_profiles = 12 · يطابق_employees = 0 · الإجمالي = 13
```
(الصفّ الثالث عشر هو المُصدِر المعدوم في PROBE_2.)

### ③ ★★★ العبور بين المستأجرين داخل الصفّ الواحد
```
PROBE_3 موظف باء = d5a6d508-5534-412d-8b7e-f06c9495099f
PROBE_3 = قُبِل — HR ألف يعاقب موظف باء.
```
الصفّ يقع داخل مستأجر ألف فتراه سياسة RLS سليماً تماماً.

**الحلّ FK مركَّب لا مفرد** — والعكس `DDL02` أثبته: استبدال المركَّب
بمفردٍ يُعيد العطل ويُسقط التأكيد 1.3.

### ④ ★★★ `tenant_id` قابلٌ للعدم
```
information_schema: tenant_id | uuid | YES | (بلا افتراضيّ)
PROBE_4 = قُبِل — صفٌّ يتيمٌ بلا مستأجر.
```
كلُّ سياسات RLS تبدأ بـ`tenant_id = current_user_tenant_id()`، و
`NULL = <أيّ شيء>` يُعطي `NULL` لا `TRUE` ⇒ **الصفّ يختفي عن الجميع
إلى الأبد**: لا HR تراه ولا الموظف، ولا سبيل إلى حذفه أو تصحيحه من
التطبيق. سجلٌّ عقابيٌّ مدفونٌ حيّاً.

### ⑤/⑥/⑦ `type`/`severity`/`status` بلا CHECK
```
PROBE_5 = قُبِل — type = 'execution'
PROBE_6 = قُبِل — severity = 'apocalyptic'
PROBE_7 = قُبِل — status = 'banana'
```
و`DISCIPLINARY_TYPE_LABELS` خمس مفردات فقط ⇒ السطر 134 في الصفحة
القديمة `{DISCIPLINARY_TYPE_LABELS[action.type]}` يُخرج `undefined`:
**شارةٌ فارغة** في الواجهة. والسطر 191 يطبع `severity` **خامّاً**
فيرى المستخدم العربيّ `apocalyptic`.

### ⑧ واقعةٌ في المستقبل
```
PROBE_8 = قُبِل — واقعةٌ لم تقع بعد (CURRENT_DATE + 730 = 2028-08-07).
```
**`CHECK` لا يصلح هنا**: `CURRENT_DATE` غير `IMMUTABLE` فتفشل
المايجريشن. الحارس محفّزٌ يستعمل `AT TIME ZONE 'Asia/Baghdad'`.

### ⑨ `valid_until` قبل `incident_date`
```
PROBE_9 = قُبِل — واقعةٌ 2026-08-08 وصلاحيةٌ تنتهي 2025-07-04.
```

### ⑩ `reason` ثلاث مسافات
```
PROBE_10 = قُبِل — فصلٌ من العمل (termination/critical) بسببٍ نصُّه '   '.
```
`NOT NULL` لا يمنع المسافات. الصفحة تعرضه سطراً فارغاً تحت اسم الموظف.

### ⑪ الموظف يُصدر إجراءً بحقّ نفسه
```
PROBE_11 = قُبِل — سالم أصدر إجراءً تأديبياً بحقّ سالم.
```
★★★ **المقارنة `employee_id <> issued_by` لا تكفي**: العنوانان
مختلفان (`employees.id` مقابل `profiles.id`) فتنجح دائماً. الحارس
يترجم المُصدِر إلى صفّ موظفه عبر `employees.user_id`.

### ⑫ `appeal_response` بلا تظلّم
```
PROBE_12 = قُبِل — «رُفض التظلّم» مكتوبٌ على إجراءٍ لم يُتظلَّم عليه.
```

### ⑬ ★★★ لا آليةَ تظلّمٍ إطلاقاً
```
PROBE_13: دوال_تأديب = 0 · أعمدة_دورة_الحياة = 0
```
العمودان `is_appealed` و`appeal_response` **يتيمان**: لا متى قُدِّم
التظلّم، ولا ما نصُّه، ولا من بتَّ فيه، ولا متى.

### ⑭ ★★★ لا انتهاءَ تلقائيّاً
```
PROBE_14 = 2 صفّاً حالته active وصلاحيته منتهية (أحدهما منذ 200 يوم).
           دوال التحديث = 0
```
إنذارٌ انقضت مدّته يظلّ محسوباً «نافذاً» إلى الأبد، ويظلّ في سجلّ
الموظف عند أيّ ترقيةٍ أو تقييم.

### ⑮ ★★★ الحذف النهائيّ مسموح — و HR تمارسه فعلاً
```
PROBE_15 (بدور postgres):        حُذف 1 صفّ نهائياً.
RLS_4    (بدور authenticated · هدى/HR):
         «HR محا 1 سجلَّ إيقافٍ نهائياً بلا أثر.»
```
لا محفّز منعٍ كـ`DOCUMENT_DELETE_BLOCKED` (0360) أو
`EXPENSE_DELETE_BLOCKED` (0363). يخالف قاعدة المشروع: لا حذف نهائيّ.

### ⑯ ★★★★ حقُّ التظلّم مكتوبٌ في الجدول وغيرُ قابلٍ للممارسة

**أخطر ما في الجولة، وكشفه المسبار الثاني بدورٍ حقيقيّ:**

```
RLS_1: سالم (موظف) يرى إجراءه.                 = 1 صفّ  ✔
RLS_2: سالم يُحدّث is_appealed = TRUE.         = 0 صفّ  ✘
```

السببُ نصُّ سياسة UPDATE حرفياً من `pg_policy`:
```sql
USING       ((tenant_id = current_user_tenant_id())
             AND current_user_is_staff())
WITH CHECK  (tenant_id = current_user_tenant_id())
```
و`current_user_is_staff()` = `admin`·`hr`·`developer`·`it_admin` **فقط**.

⇒ الموظف **يقرأ** عقوبته ولا يستطيع الاعتراض عليها بحرف. العمود
`is_appealed` موجودٌ منذ إنشاء الجدول ولم يكن قابلاً للضبط من صاحب
الشأن يوماً. والصفحة نفسها **لا تعرض زرَّ تظلّمٍ أصلاً** — فالعطل
مكتملُ الطبقات: **لا واجهة ولا خدمة ولا سياسة**.

★ ولا يجوز فتح سياسة UPDATE للموظف: سيُحرّر حينها `type` و`severity`
و`status` أيضاً. الحلُّ الوحيد السليم دالةُ `SECURITY DEFINER` تسمح
بحقلَي التظلّم **وحدهما** — وهو ما تفعله `disciplinary_appeal()`.

---

## الدوال الثماني

| الدالة | الأمان | الغرض |
|---|---|---|
| `disciplinary_board(search, status, type, limit)` | **INVOKER** | اللوح · `daysRemaining` بتوقيت بغداد · `can_appeal` |
| `disciplinary_summary()` | **INVOKER** | ثلاثة عشر عدّاداً منها `overdue_expiry` |
| `disciplinary_issue(...)` | DEFINER | الإصدار · `issued_by = auth.uid()` لا من المتصفّح |
| `disciplinary_acknowledge(id)` | DEFINER | إقرار الاطّلاع · مرّةً واحدة |
| **`disciplinary_appeal(id, reason)`** | DEFINER | **العطل ⑯** — حقُّ الموظف |
| `disciplinary_appeal_decide(id, decision, response)` | DEFINER | البتّ · التعليل إلزاميّ |
| `disciplinary_revoke(id, reason)` | DEFINER | **بديل الحذف** |
| `disciplinary_expire_due()` | DEFINER | **العطل ⑭** · معزولةٌ بالمستأجر · idempotent |

★ اللوح والملخّص **`SECURITY INVOKER`** عمداً: RLS تبقى سارية،
فالموظف يرى صفَّيه و HR ترى مستأجرها. `DEFINER` هنا يُسقط العزل.

★ `reduced` يُنزل الخطورة **فعلياً**: `critical→high · high→medium ·
وما دونهما→low`. أُثبت بالتأكيد 5.3 (`medium ← low`) وبالعكس `INV29`.

---

## ★★★★ عطلٌ في مايجريشني كشفه تأكيدي — الثغرة الثلاثية

أوّل صياغةٍ كتبتُها للقيد:
```sql
CHECK (status <> 'overturned' OR appeal_decision = 'overturned')
```
سقط التأكيد 5.6 بـ«حالة overturned مُلفَّقة قُبِلت». والسبب مُثبت:
```sql
SELECT (FALSE OR (NULL::text = 'overturned')) IS NULL;   ⇒  t
```
`appeal_decision` معدومٌ ⇒ المقارنة تُعطي `NULL` ⇒ `FALSE OR NULL`
= `NULL` ⇒ **و`CHECK` يقبل `NULL`**. الصواب:
```sql
CHECK (status <> 'overturned'
       OR appeal_decision IS NOT DISTINCT FROM 'overturned')
```
★ العكس `DDL13` يُعيد الصياغة الخاطئة ويُثبت أن التأكيد 5.6 يمسكها.

---

## ★★★ درس التغطية — تكرّر للمرة التاسعة والعشرين

> **شرطٌ لا تُوجَد بياناتٌ تخالفه = شرط غير مُختبَر.**

أوّل تشغيلٍ لـ`_invert_0365.py` أعطى **52/59**. سبعةٌ نجت:

| # | الحالة | التشخيص | العلاج |
|---|---|---|---|
| `INV24` | `NO_MATCH` | خمس مسافاتٍ بادئة والأصل أربع — **العكس كان وهمياً** | تصحيح النصّ |
| `INV30` | `SURVIVED` | **حارسٌ غير قابلٍ للوصول** | نُقل إلى المكافئات بسببٍ مُثبت |
| `INV32` | `SURVIVED` | ملف SQL بدور `postgres` لا يرى ترشيح المستأجر | نُقل إلى `RLS_CHECK` |
| `DDL10` | `SURVIVED` | كل المسارات عبر الدوال والدوال تُرضي القيد | **التأكيد 1.8** بكتابةٍ مباشرة |
| `DDL14` | `SURVIVED` | المِثل | **التأكيد 1.9** |
| `DDL15` | `SURVIVED` | المِثل | **التأكيد 1.10** |
| `DDL16` | `SURVIVED` | المِثل | **التأكيد 1.11** |

**النتيجة بعد العلاج: 58/58.**

### تفصيل `INV30` — الحارس الميت

الحارس الذي يسبقه يشترط `status = 'appealed'`، وقيدي
`chk_disciplinary_appealed_state` يشترط عندئذٍ `appeal_decision IS NULL`:
```sql
CHECK (status <> 'appealed'
       OR (is_appealed = true AND appealed_at IS NOT NULL
           AND appeal_decision IS NULL))
```
⇒ لا يمكن أن يجتمع `status='appealed'` مع `appeal_decision` غير معدوم،
فسطر `DISCIPLINARY_APPEAL_ALREADY_DECIDED` شيفرةٌ ميتة. تُرك دفاعاً في
العمق لا حارساً حيّاً، **وهو موثَّقٌ بذلك** لا مسكوتٌ عنه.

★ أثبته العكس نفسه: `INV31` (الحارس السابق) سقط برسالة
`ALREADY_DECIDED` — أي أن الحارسَين **متعاقبان لا متوازيان**.

---

## أخطائي في هذه الجولة — مُصحَّحةً علناً

1. **`request.jwt.claims` بدل `request.jwt.claim.sub`** — أعطى
   `RLS_1 = 0` فبدا عطلاً وهو **خطأٌ منّي**. الشيم
   (`pgtest-supabase-shim.sql:19`) يقرأ `request.jwt.claim.sub`.
   بعد التصحيح صار `RLS_1 = 1`.

2. **التأكيد 9.1 عدَّ تسعة والصواب عشرة** — نسيتُ أن اللوح
   `SECURITY INVOKER` يعمل في ملف SQL بدور **postgres وهو BYPASSRLS**
   فيرى صفَّ باء أيضاً. أُضيف تأكيدٌ للصفّ قبل الأخير كي لا يمرّ
   الترتيب صدفةً.

3. **التأكيد ⑪ عدَّ سبع دوال والصواب ثمانٍ** — أغفلتُ
   `disciplinary_expire_due` في العدّ.

4. **`fnBody` نهايتها `\n$$;` والصواب `$$;`** — أسقطت **أربعة عشر**
   تأكيداً دفعةً واحدة. نظيرُ درس 0355 حرفياً. أُضيف حارسٌ على الحارس:
   جسمٌ أقصر من 200 حرف = التقاطٌ خاطئ.

5. **تأكيدٌ أوسع من قصده** — `value=\{[a-zA-Z]+\.severity\}` أمسك
   `value={form.severity}` وهو **ربطُ عنصر `<select>` لا عرضٌ
   للمستخدم**. ضُيِّق على `<DetailRow …>` وحدها.

6. **`React.ComponentType<{ size?: number }>`** — سقط `tsc` بـTS2322:
   `propTypes.size` في `LucideProps` هو `string | number`. الصواب
   `LucideIcon` الرسميّ.

---

## ★ مواضع التسجيل السبعة

| # | الملف | الحالة |
|---|---|---|
| 1 | `AppRouter.tsx` — `lazy` + `<Route>` | كانت مسجَّلة |
| 2 | `Sidebar.tsx` — التنقل + خريطة الوحدة | كانت مسجَّلة |
| 3 | `hybridPagesCatalog.ts` | كانت مسجَّلة |
| 4 | `permissions.ts` — الأدوار | **★ أُضيف في 0365** |
| 5 | `permissions.ts` — `PERMISSION_KEYS` | **★★★ أُضيف في 0365** |
| 6 | `legacyRedirect.ts` — `VIEW_TO_PATH` | كانت مسجَّلة |
| 7 | `AdminEmployeesPage.tsx` — `PORTAL_PAGES` | كانت مسجَّلة |

★★★ **`hr-disciplinary` كان غائباً تماماً عن `permissions.ts`**:
الصفحة في الشريط الجانبي وفي التوجيه وفي الكتالوج و`VIEW_TO_PATH`
و`PORTAL_PAGES` — **ولا مفتاح صلاحيةٍ لها**. الموضع الخامس من السبعة،
وهو الذي يُغفَل كما تقول القاعدة. أُضيف في أربعة مواضع:
`PERMISSION_KEYS` · كتلة `hr` · كتلة `admin` · جدول التسميات.

---

## ★ تحسينٌ تراكميّ — الحارس المُوحَّد اكتمل

`DisciplinaryPage` كانت **آخر صفحة** على `WithEmployee`. بعد نقلها:

```
LoansPage(loanService.board(, employeeName)
PerformancePage(performanceReviewSdk.reviews(, reviewerName)
BonusesPage(bonusSdk.board(, approverName)
DocumentsPage(employeeDocumentsSdk.board(, uploaderName)
SuccessionPlanningPage(successionPlanningSdk.board(, incumbentName)
RecruitmentPage(recruitmentSdk.board(, appsTotal)
ExpensesPage(expenseSdk.board(, isStalled)
EmployeeContractsPage(contractSdk.board(, renewalCount)
DisciplinaryPage(disciplinarySdk.board(, canAppeal)   ← ★ جديدة
```

والحارس القديم `it.each(['DisciplinaryPage']) تستعمل WithEmployee`
صار فارغاً، فاستُبدل بحارسٍ أقوى **يمسح مجلد `src/pages/hr` كاملاً**
ويشترط **صفر صفحة** تستعمل الإثراء اليدويّ.

---

## الحالة بعد الجولة (مُحقَّقة على قاعدة نظيفة)

```
294 مايجريشن · صفر فشل
72 ملف SQL   · صفر فشل   (73 ناقص أداة السحابة المستثناة)
34 سكربت RLS · صفر فشل
tsc EXIT=0 · test:run 4720/4720 في 160 ملفاً · build ✓ 5.73s
contract PASS · lint 0 خطأ (1174 تحذيراً)
sdk:boundary-check: 15 ملفاً موروثاً (مالية/مخزون/تصنيع) — صفر في الجديد
```

---

## الملفات

```
supabase/migrations/0365_disciplinary_integrity.sql
tools/dev/verify-disciplinary-0365.sql       53 تأكيداً
tools/dev/verify-disciplinary-0365-rls.sh    34 تأكيداً
tools/dev/_invert_0365.py                    58/58 + مكافئان
src/services/sdk/DisciplinaryService.ts      disciplinarySdk
src/pages/hr/DisciplinaryPage.tsx            210 → 710
src/test/disciplinaryContract.test.ts        45 تأكيداً
src/core/constants/permissions.ts            ★ hr-disciplinary
src/test/portalHygieneContract.test.ts       الحارس المُوحَّد اكتمل
```

---

## ★ ملحق 0366 — إغلاق بندٍ معلَّقٍ منذ 0363

بعد إتمام 0365 عولج البند المعلَّق التالي من جرد ما تبقّى:

> ★★★ «`sync_hr_source_status` بلا سبب — فرع `loan`»
> «عالجتُ `expense` في 0363. **`employee_loans` قد يكون فيه العطل
> نفسه** (رفضٌ بلا تعليل) — **لم يُفحص لأن لا قيد يكشفه**.»

**«قد يكون» صارت مُثبتة.** المسبار على قاعدةٍ نظيفة:

```
PROBE_B: يذكر_السبب = f · يكتب_الجدول = t
         (فرع loan يكتب employee_loans ولا يذكر rejection_reason)
PROBE_C: قيود رفضٍ في القروض = 0     ← ولهذا لم يُكتشف العطل
PROBE_D: محفّزات مزامنة السبب = 0

PROBE_E: قرض ⇒ create_hr_approval('loan', …) ⇒ خطوة 1:active/manager
         ⇒ decide_hr_approval_step(…, 'rejected',
                                   'الراتب لا يحتمل هذا القسط')
         ⇒ status = rejected · rejection_reason = <NULL>
         والتعليل سليمٌ في hr_approval_steps.comments
```

**رُفض القرض والتعليل ضاع.** الموظف يرى «مرفوض» بلا سبب.

★★ **ولماذا بقي مستوراً؟** لأن `expense_requests` اكتسب في 0363 قيد
`expense_requests_rejection_chk` فانفجر فوراً وكشف نفسه، بينما
`employee_loans` **بلا قيد** فظلّ يبتلع الرفض الصامت. وجهٌ آخر لدرس
التغطية: **القيد لا يحرس فحسب، بل يكشف.**

### العلاج — نفس نمط 0363 حرفياً

| العنصر | الغرض |
|---|---|
| `loan_apply_rejection_reason(UUID)` | يستخرج السبب من آخر خطوةٍ رافضة |
| `tg_loan_sync_reason()` + `trg_loan_sync_reason` | يملأ السبب عند الرفض الصامت |
| `chk_employee_loans_rejection_reason` | القيد الذي كان غيابُه سببَ الاستتار |

★ لم نُغيّر توقيع `sync_hr_source_status(p_request_id, p_final)`:
توقيعٌ جديدٌ يكسر نداءاتها في **خمسة مواضع** مُحقَّقة من `pg_proc`
(`unified_approval_decide` · `tg_notify_approval_step` ·
`tg_guard_request_status_bypass` · `create_hr_approval`).

### ★★★ درس التغطية للمرة الثلاثين

أوّل تشغيلٍ لـ`_invert_0366.py` أعطى **5/10**. خمسةٌ نجت:

| # | التشخيص المُثبَت | العلاج |
|---|---|---|
| `INV04` | **التأكيد 2.2 كُتب له وكان فارغاً**: قرضُه بلا سلسلة اعتمادٍ ⇒ `v_req IS NULL` ⇒ المحفّز لا يكتب شيئاً حتى لو سقط الحارس | التأكيد 2.4 بقرضٍ **له سلسلة** |
| `INV02` | لا طلبَ من نوعٍ آخر في العيّنة | 2.5 — طلبُ إجازةٍ بالمعرّف نفسه وأحدثُ طابعاً |
| `INV03` | لا صفَّ أجنبيّ | 2.6 — طلبُ قرضٍ في مستأجرٍ آخر |
| `INV06` | كل الخطوات ذات تعليق | 2.7 — خطوةٌ رافضةٌ أحدثُ **بتعليقٍ معدوم** |
| `INV07` | كل الخطوات رافضة | 2.8 — خطوةٌ **موافِقة** أحدثُ بتعليقٍ مضلّل |

وبعد العلاج نجا `INV04` **مرّةً ثانية**. والسبب مُثبَتٌ من
`pg_get_triggerdef` لا مُخمَّن:

```
CREATE TRIGGER trg_loan_sync_reason
  BEFORE INSERT OR UPDATE **OF status** ON public.employee_loans
```

تحديثٌ يمسّ `rejection_reason` وحده **لا يُشغّل المحفّز**. صُحّح
التأكيد ليكتب `status` معه.

**النتيجة النهائية: 10/10 · 14 تأكيداً في ملف التحقق.**
