# الوحدة 12 — محاسبة المشاريع

> Finance Unit 12 — Project Accounting

## 1. الغرض

هذه الوحدة تضبط محاسبة المشاريع على مستوى الكيان القانوني، بحيث لا تكون المشاريع مجرد قائمة أسماء، بل مراكز تجميع للتكلفة والإيراد والموازنة والفعلي من دفتر الأستاذ.

## 2. نطاق الوحدة

- سجل مشاريع مالية لكل كيان قانوني.
- موازنات مشاريع حسب الحساب ومركز التكلفة والفترة.
- Actuals من سطور القيود المرتبطة بـ `project_id`.
- Snapshot لمؤشرات المشروع.
- إغلاق/أرشفة المشروع بسبب إلزامي.
- Dashboard وBoards للمشاريع والموازنات والفعلي.

## 3. قواعد العمل

- المشروع مرتبط بـ `legal_entity_id`.
- كود المشروع فريد داخل الكيان.
- لا حذف صلب للمشروع.
- لا يمكن إغلاق/أرشفة المشروع بدون سبب.
- سطور موازنة المشروع يجب أن ترتبط بحساب مالي في نفس الكيان.
- Actuals تقرأ من القيود المنشورة/المعكوسة فقط.
- كل عملية حاكمة تسجل في `finance_audit_events`.

## 4. كائنات قاعدة البيانات

### جداول

- `finance_project_budget_lines`
- `finance_project_actual_snapshots`

### RPCs

- `upsert_project_accounting_project`
- `upsert_project_budget_line`
- `generate_project_actuals_snapshot`
- `update_project_accounting_status`

### Views

- `finance_project_accounting_board`
- `finance_project_budget_line_board`
- `finance_project_actuals_board`
- `finance_project_accounting_dashboard`

## 5. واجهة المستخدم

- `/app/finance/project-accounting`

وتحتوي:

- `FinanceUnitNav unit="project"`.
- اختيار الكيان.
- إنشاء/تحديث مشروع عبر RPC.
- إضافة سطر موازنة مشروع.
- توليد Snapshot فعلي.
- تغيير حالة المشروع بسبب إلزامي.

## 6. حدود الجاهزية

- **Local/Static:** type-check/build/contract tests.
- **Supabase Runtime:** بعد `npx supabase db push` فقط.
- **Browser Runtime:** بعد إنشاء مشروع، إضافة موازنة، توليد actuals، وإغلاق مشروع.
