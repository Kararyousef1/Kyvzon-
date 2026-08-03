# الوحدة 08 — الموازنات والتنبؤات

> Finance Unit 08 — Budgeting & Forecasting

## 1. الغرض

هذه الوحدة تضبط الموازنات والتوقعات المالية على مستوى الكيان القانوني، الحساب، مركز التكلفة، والمشروع. الهدف ليس مجرد إدخال رقم موازنة، بل دورة حياة محكومة: إنشاء، إرسال، اعتماد، إغلاق، قياس فعلي مقابل مخطط، وتوليد تباينات قابلة للتدقيق.

## 2. نطاق الوحدة

- موازنات لكل كيان قانوني وسنة/فترة.
- سطور موازنة مرتبطة بحسابات وأبعاد مالية.
- دورة حياة الموازنة: `draft → submitted → approved → closed/voided`.
- توليد تقرير Budget vs Actual من قيود GL المنشورة.
- سيناريوهات Forecast مالية مرتبطة بالكيان.
- أسباب إلزامية لتغيير الحالة.
- Audit لكل عملية حاكمة.

## 3. قواعد العمل

- لا موازنة بدون كيان قانوني.
- لا سطر موازنة بدون حساب مالي.
- الحساب ومركز التكلفة والمشروع يجب أن ينتموا لنفس الكيان.
- لا اعتماد موازنة بدون سطر واحد على الأقل.
- لا تعديل حالة بدون سبب.
- التباين يحسب من القيود المنشورة/المعكوسة فقط.
- لا حذف صلب للموازنات؛ `voided/closed` فقط.

## 4. كائنات قاعدة البيانات

### RPCs

- `upsert_finance_budget`
- `upsert_finance_budget_line`
- `update_finance_budget_status`
- `generate_budget_variance_report`
- `upsert_finance_forecast_scenario`
- `update_finance_forecast_status`

### Views

- `finance_budget_board`
- `finance_budget_line_board`
- `finance_budget_variance_board`
- `finance_budget_dashboard`
- `finance_forecast_scenario_board`

## 5. واجهات المستخدم

- `/app/finance/budget`
- `/app/finance/budget-variance`
- `/app/finance/cash-forecast`

ويجب أن تحتوي الصفحات على `FinanceUnitNav unit="budget"`.

## 6. حدود الجاهزية

- **Local/Static:** type-check/build/contract tests.
- **Supabase Runtime:** بعد `npx supabase db push` فقط.
- **Browser Runtime:** بعد إنشاء موازنة، إضافة سطور، اعتمادها، توليد التباين، وإنشاء Forecast فعلي.
