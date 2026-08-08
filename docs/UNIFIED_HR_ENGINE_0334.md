# 0334 — توحيد محرّك الاعتماد (الخيار «أ»)

> **الحالة:** مكتوب ومُختبَر على Postgres 17 محلي.
> **لم يُدفع** — `0332` · `0333` · `0334` تنتظر `db push`.

---

## ★ تصحيح علني لتقرير المرحلة 0

قِستُ في المرحلة 0 أن سلسلة الاعتماد «تنقطع تماماً»:

```
hr_approval_steps      = 0
unified_approval_steps = 0
إشعارات               = 0
```

**القياس كان خاطئاً.** أدخلتُ الصفّ في `hr_approval_requests` يدوياً
بـ`INSERT` بدل استدعاء الدالة الرسمية `create_hr_approval()`.

القياس الصحيح باستدعاء الدالة:

```
hr_approval_steps      = 2   ✅  (مشرف ثم مدير)
إشعارات               = 1   ✅
my_approval_inbox      = 1   ✅  (يقرأ الجدولين — جسر قائم)
السلسلة تكتمل:  pending → approved
leaves.status = 'موافق'      ✅  (0323 يُزامنها)
```

**النظام القديم يعمل.** ومصدر السلسلة ليس `approval_rules` بل
`resolve_department_chain()` — مشرف القسم ومديره من جدول `departments`.
فالادّعاء بأن «`approval_rules` الفارغ يُجمّد كل الطلبات» **لا يصحّ على
طلبات الموارد البشرية**. أعتذر عن التقرير السابق.

**ما لا يعمل فعلاً** هو التكامل مع المحرّك الموحّد — وهذا ما يُصلحه
`0334`.

---

## الأعطال الحقيقية — مُثبَتة بنصّها

### ① سجل التتبّع أعمى تجاه طلبات الموارد البشرية

```
approval_steps_for('hr', <leave_id>)  =  0 خطوة
بينما hr_approval_steps الحقيقية      =  2
```

⇒ الموظف يفتح `ApprovalTrail` فيرى سلسلة فارغة، ولا يعرف عند من يقف
طلبه.

### ② المحرّك الموحّد يرفض البتّ في طلبات HR

```
unified_approval_decide('hr', <leave_id>, 'approved', …)
→  APPROVAL_NOT_FOUND_OR_DECIDED
```

**السبب:** `unified_approvals.source_id` لطلبات HR هو
`hr_approval_requests.id` لا `leaves.id`. الواجهة تملك أحياناً هذا
وأحياناً ذاك.

### ③ `unified_approval_steps` لطلبات HR = صفر دائماً

فكل ما يُبنى فوق المحرّك الموحّد (تتبّع · تقارير · تحليلات) يتجاهل نصف
الطلبات.

---

## الاستراتيجية: مرآة لا استبدال

الهجرة الكاملة **لا تعني كسر ما يعمل**. الجدول القديم يبقى مصدر الحقيقة
للشاشات القائمة، ومحفّز يعكس كل خطوة إلى الجدول الموحّد فوراً:

```
hr_approval_steps  ──[trg_mirror_hr_step]──▶  unified_approval_steps
   (مصدر الحقيقة)      AFTER INSERT OR UPDATE      (مرآة فورية)
```

**المكسب:**
- لا شاشة تنكسر اليوم
- المحرّك الموحّد يرى كل شيء فوراً
- الهجرة النهائية (حذف القديم) تصير تغييراً في الواجهة فقط

### ما بُني

| # | المكوّن | الدور |
|---|---|---|
| ① | `mirror_hr_step_to_unified(UUID)` | تنسخ خطوة إلى الموحّد · `ON CONFLICT DO UPDATE` |
| ② | `trg_mirror_hr_step` | `AFTER INSERT OR UPDATE` — لا يرفع استثناء |
| ③ | backfill | للخطوات القائمة قبل المحفّز |
| ④ | `resolve_hr_approval_source(UUID)` | يترجم معرّف المصدر ↔ معرّف الطلب |
| ⑤ | `approval_steps_for()` | أُعيدت بالترجمة مدمجة |
| ⑥ | `hr_approval_decide_any()` | بتّ بأيّ المعرّفين |
| ⑦ | أربعة فهارس | أحدها جزئي على الخطوة النشطة |

### قرارات تقنية

**`source_id = request_id` لا `related_id`** — ليطابق ما يعرضه
`unified_approvals`، وإلا صار مرجعان لطلب واحد.

**`source_module`:** `leave`/`permission` ⇒ `'hr'` · `expense`/`loan` ⇒
`'finance'`. قيد `CHECK` على `unified_approval_steps` يقبل تسع قيم فقط،
و`'employee_finance'` (اسم الوحدة في العرض) ليس منها.

**المحفّز لا يرفع استثناء أبداً** — فشل المرآة يجب ألّا يُسقط الاعتماد
نفسه. نفس نمط `0310` (`RAISE WARNING` لا `EXCEPTION`).

**`mirror_hr_step_to_unified` هي `SECURITY DEFINER`** — المحفّز يعمل
بسياق المُعتمِد الذي قد لا يملك `INSERT` على `unified_approval_steps`.

---

## ★★ عطل كدتُ أُدخله — واكتشفتُه قبل التطبيق

النسخة الأولى من `approval_steps_for` التي كتبتُها في هذه الجولة **حذفت
عمودين**:

```ts
// UnifiedApprovalService.findSteps() تقرؤهما:
isMine:    r.out_is_mine === true,
isCurrent: r.out_is_current === true,
```

وحوّلت الدالة من `SECURITY DEFINER` (كما عُرّفت في `0316` عن قصد) إلى
`INVOKER`.

**كان سيكسر `ApprovalTrail` صامتاً** — بلا رسالة خطأ واحدة: الحقول
تعود `undefined` فتصير `false`، وتختفي علامة «خطوتي» و«الخطوة الحالية».

**اكتشفتُه** بمقارنة التوقيع بـ`0316` قبل التطبيق. أعدتُ كتابة الدالة
محافظاً على **عشرة أعمدة** وعلى منطق حجب التعليقات كاملاً، وأضفتُ
الترجمة فقط. وأضفتُ حارساً يفحص الأعمدة العشرة واحداً واحداً.

---

## ★ تصحيح ذاتي ثانٍ: تأكيد `SECURITY DEFINER`

كتبتُ التأكيد `1.5` يطلب أن تكون `approval_steps_for` بـ`INVOKER`، فسقط.

**كان التأكيد هو الخطأ لا الدالة.** الدالة تقرأ `profiles` و
`unified_approvals` لحساب صلاحية الرؤية، وحارسها الحقيقي هو
`can_view_approval_trail()` لا RLS الجدول.

استُبدل بثلاثة تأكيدات أدقّ:
- `1.5a` — `approval_steps_for` **يجب** أن تبقى `DEFINER`
- `1.5b` — ولأنها كذلك، الحارس النصّي **إلزامي**
- `1.5c` — `resolve_hr_approval_source` **يجب** أن تبقى `INVOKER`

---

## الإثبات

### الاختبار السلوكي — 52 تأكيداً

`tools/dev/verify-unified-hr-engine-0334.sql` — يعمل بدور `postgres`
(`BYPASSRLS`) فيقيس منطق المرآة، ويتراجع بالكامل.

### RLS الحقيقي — 16/16

`tools/dev/verify-unified-hr-engine-0334-rls.sh` — **خمسة أدوار**:
مدير · مشرف · موظف · **زميل لا علاقة له** · مدير شركة أخرى.

```
✅ الموظف يرى خطوتَي طلبه
✅ الترجمة تعمل عبر RLS (بمعرّف الإجازة)
✅ الزميل لا يرى سلسلة غيره (0)
✅ لا تسريب عبر معرّف الطلب · ولا عبر معرّف الإجازة
✅ رُفض: ERROR: not authorized for this step
✅ رُفض: ERROR: HR_APPROVAL_NOT_FOUND
✅ المرآة تتبع القرار
✅ حالة الإجازة = موافق
```

### اختبار العقد — 56 اختباراً

`src/test/unifiedHrEngineContract.test.ts`

---

## ★ ثمانية أعكاس — كلها تُسقط الاختبار

| # | العكس | الخطأ الذي ظهر |
|---|---|---|
| ① | `AFTER INSERT` بدل `INSERT OR UPDATE` | `1.3 ★★ المحفّز ليس على INSERT وUPDATE معاً` |
| ② | `source_id ← related_id` | `2.2 ★★ المرآة = 0 (متوقَّع 2)` |
| ③ | إلغاء ترجمة المعرّف | `3.2 ★★ سجل التتبّع بـleave_id = 0` |
| ④ | `ON CONFLICT DO NOTHING` | `5.1 ★★ حالة الخطوة المعكوسة = 'active'` |
| ⑤ | `tenant_id … OR TRUE` | `9.1 ★★ موظف شركة ب ترجم معرّف شركة أ` |
| ⑥ | حذف `NOT EXISTS` | `3.1 ★★ سجل التتبّع = 4 (متوقَّع 2)` |
| ⑦ | **حذف `out_is_mine`** | `1.5d ★★ العمود out_is_mine اختفى` |
| ⑧ | إزالة `can_view_approval_trail` | `1.5b ★★ بلا حارس — مكشوفة` |

بعد كل عكس: استرجاع والملف مطابق حرفياً (`diff` = IDENTICAL) ثم
`52 تأكيداً`.

> **ملاحظة منهجية:** العكس ④ في محاولته الأولى سقط لسبب خاطئ (كسرتُ
> بناء SQL) فأعدتُه بصيغة صالحة نحوياً — عندها سقط للسبب الصحيح.

---

## الحالة بعد الجولة

```
263 مايجريشن من الصفر · صفر فشل
verify-unified-hr-engine-0334.sql      52 تأكيداً
verify-unified-hr-engine-0334-rls.sh   16/16 عبر RLS حقيقي
verify-cv-and-attendance-0333.sql      52 تأكيداً
verify-tech-exports-0332.sql           78 تأكيداً
2706/2706 اختباراً في 128 ملفاً
tsc EXIT=0 · build ✅ · contract-check PASS
lint: 0 خطأ · 1310 تحذيراً (بلا زيادة)
```

---

## ما تبقّى من الهجرة

هذه الجولة أنجزت **الجسر الكامل**. تبقّى:

| البند | الحالة |
|---|---|
| تحويل `HrApprovalInbox` إلى `my_approval_inbox` | ينتظر — الصندوق يقرأ الجدولين أصلاً |
| تحويل `LeaveRequestPage` إلى `decideHrAny` | ينتظر فصل الشاشات (المرحلة 3) |
| حذف `hr_approval_steps` نهائياً | **لا قبل** أن تنتقل كل الشاشات |
| الطلبات اليتيمة (العطل ④ في المرحلة 0) | لم يُعالَج بعد |
| `approval_rules` الفارغ | لا يمسّ طلبات HR — يمسّ الوحدات الأخرى |

---

## ملحق: ما ينتظر الدفع

```
supabase/migrations/0332_tech_unified_exports_and_webhooks.sql
supabase/migrations/0333_profiles_cv_data_and_attendance_scope.sql
supabase/migrations/0334_unify_hr_approval_engine.sql
```

`0333` هو ما يُصلح خطأَي المتصفح — بلا دفعه تبقى الشاشتان معطوبتين.
