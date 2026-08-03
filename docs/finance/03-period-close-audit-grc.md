# الوحدة 03 — إغلاق الفترات والتدقيق والحوكمة

> Finance Unit 03 — Period Close & Audit/GRC  
> الهدف: تحويل إغلاق الفترة وسجل التدقيق من أزرار حالة متفرقة إلى Control Plane مالي قابل للتدقيق.

## 1. الغرض

هذه الوحدة تضبط نهاية الفترة المحاسبية. لا يجوز إغلاق فترة مالية نهائياً إلا بعد التحقق من جاهزيتها: عدم وجود قيود مفتوحة، عدم وجود قيود غير متوازنة، وإنجاز أو تبرير مهام الإغلاق المطلوبة.

## 2. نطاق الوحدة

### داخل النطاق

- Readiness للفترات المحاسبية.
- Checklist إغلاق لكل فترة.
- إقفال مرن `soft_closed` بسبب إلزامي.
- إقفال نهائي `closed` بسبب إلزامي وبعد تحقق readiness.
- إعادة فتح بسبب إلزامي وبنفس قيود الصلاحيات الحالية.
- Audit Board مالي موحد من `finance_audit_events`.
- منع استخدام `prompt/confirm` في صفحة الفترات.
- عرض مهام الإغلاق وإكمالها أو تبرير تجاوزها.

### خارج النطاق

- تسويات البنوك التفصيلية: وحدة Cash/Bank.
- Tax filing النهائي: وحدة Tax.
- Consolidation close متعدد الشركات: وحدة Intercompany/Consolidation.
- محرك Workflow موافقات متعدد المستويات: لاحقاً، لكن هذه الوحدة تجهز الأساس.

## 3. قواعد العمل

### 3.1 إقفال مرن

- يغير الفترة إلى `soft_closed`.
- يمنع الترحيل لأن دوال الترحيل تقبل `open` فقط.
- يتطلب سبباً.
- يسجل Audit Event.

### 3.2 الإقفال النهائي

لا يسمح بالإقفال النهائي إذا:

- توجد قيود `draft/submitted/approved` داخل الفترة.
- توجد قيود غير متوازنة.
- توجد مهام إغلاق مطلوبة بحالة ليست `completed` أو `waived`.

### 3.3 مهام الإغلاق

المهام القياسية الأولية:

- GL_BALANCED — التحقق من توازن القيود.
- NO_OPEN_JOURNALS — عدم وجود قيود غير مرحلة.
- TRIAL_BALANCE_REVIEW — مراجعة ميزان المراجعة.
- AP_AR_REVIEW — مراجعة أرصدة الذمم.
- BANK_CASH_REVIEW — مراجعة النقد والبنوك.
- AUDIT_TRAIL_REVIEW — مراجعة سجل التدقيق.

المهام يمكن:

- إكمالها مع دليل/ملاحظة.
- تجاوزها `waived` بسبب إلزامي.

لا يوجد حذف صلب لمهام الإغلاق.

### 3.4 التدقيق/GRC

كل عملية حاكمة تسجل في `finance_audit_events`:

- توليد Checklist.
- إكمال مهمة.
- تجاوز مهمة.
- إقفال مرن.
- إقفال نهائي.
- إعادة فتح.

## 4. كائنات قاعدة البيانات المطلوبة

### جدول

- `finance_period_close_tasks`

### RPCs

- `generate_finance_period_close_checklist(uuid)`
- `complete_finance_close_task(uuid,text,text)`
- `waive_finance_close_task(uuid,text)`
- `close_accounting_period_controlled(uuid,text,text)`
- `reopen_accounting_period_controlled(uuid,text)`

### Views

- `finance_period_close_readiness`
- `finance_close_checklist_board`
- `finance_audit_event_board`
- `finance_grc_dashboard`

## 5. واجهات المستخدم

### `/app/finance/accounting-periods`

- اختيار الكيان والسنة.
- عرض readiness لكل فترة.
- توليد Checklist.
- إكمال/تجاوز مهام الإغلاق بسبب/دليل.
- إقفال مرن/نهائي/إعادة فتح عبر نافذة سبب.

### `/app/finance/system-notes`

- عرض Audit Events المالي الموحّد.
- فلترة حسب الكيان ونوع الحدث.
- عرض before/after summary.

## 6. حدود الجاهزية

- **Local/Static:** type-check/build/contract tests.
- **Supabase Runtime:** لا يثبت إلا بعد `npx supabase db push` وتشغيل post migration checks.
- **Browser Runtime:** لا يثبت إلا بتجربة توليد checklist، إكمال/تجاوز مهام، إغلاق نهائي، إعادة فتح، ومراجعة audit.
