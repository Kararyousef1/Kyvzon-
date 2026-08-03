# الوحدة 13 — التقارير المالية والتحليلات

> Finance Unit 13 — Financial Reporting & Analytics

## 1. الغرض

هذه الوحدة تضبط مركز التقارير المالية والتحليلات التنفيذية. لا تكون التقارير مجرد جداول في الواجهة، بل Report Runs قابلة للتدقيق، مبنية من GL والوحدات المالية، وقابلة للتصدير.

## 2. نطاق الوحدة

- ميزان المراجعة.
- قائمة الربح والخسارة.
- ملخص المركز المالي.
- تقارير وحدات: AP/AR/Cash/Tax/Budget/Assets/Revenue/Projects/Intercompany.
- Report Runs محفوظة بمدخلات وفترة وPayload.
- طلبات تصدير مرتبطة بتقرير.
- Dashboard مالي تنفيذي.

## 3. قواعد العمل

- كل تقرير مرتبط بكيان قانوني.
- كل تقرير يولد عبر RPC ويخزن payload.
- لا يعتمد على قيم ثابتة في الواجهة.
- التصدير طلب مستقل يسجل من طلبه وحالته.
- لا حذف صلب للتقارير؛ يمكن إلغاء report run بسبب.
- Audit Event لكل توليد/إلغاء/طلب تصدير.

## 4. كائنات قاعدة البيانات

### جداول

- `finance_report_runs`
- `finance_report_exports`

### RPCs

- `generate_finance_report_run`
- `request_finance_report_export`
- `cancel_finance_report_run`

### Views

- `finance_report_run_board`
- `finance_report_export_board`
- `finance_executive_kpi_dashboard`

## 5. واجهة المستخدم

- `/app/finance/reports`
- `/app/finance/trial-balance`

وتحتوي:

- `FinanceUnitNav unit="reporting"`.
- توليد Report Run.
- طلب تصدير.
- عرض KPIs مالية تنفيذية.

## 6. حدود الجاهزية

- **Local/Static:** type-check/build/contract tests.
- **Supabase Runtime:** بعد `npx supabase db push` فقط.
- **Browser Runtime:** بعد توليد تقارير وتصديرها على بيانات حقيقية.
