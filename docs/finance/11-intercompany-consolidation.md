# الوحدة 11 — المعاملات البينية والتوحيد

> Finance Unit 11 — Intercompany & Consolidation

## 1. الغرض

هذه الوحدة تضبط المعاملات بين الكيانات القانونية داخل نفس الشركة/المستأجر، وتنتج قيود إلغاء/توحيد قابلة للتدقيق. لا يجوز أن تكون معاملات Due-to/Due-from مجرد سجلات حرة بلا مصدر وسبب.

## 2. نطاق الوحدة

- إنشاء معاملة بين كيان مصدر وكيان مقابل.
- مطابقة المعاملة البينية بسبب إلزامي.
- إلغاء/Eliminate المعاملة وإنشاء قيد توحيد.
- إبطال معاملة غير منتهية بسبب إلزامي.
- Dashboard للمعاملات والتوحيد.
- Views للمعاملات وقيود التوحيد.

## 3. قواعد العمل

- المصدر والهدف كيانان قانونيان مختلفان داخل نفس tenant.
- المبلغ أكبر من صفر.
- العملة مطلوبة.
- لا يمكن إلغاء معاملة eliminated.
- لا يمكن عمل elimination إلا بعد matched أو pending حسب صلاحية المدير المالي.
- كل انتقال حالة يسجل في `finance_audit_events`.

## 4. كائنات قاعدة البيانات

### RPCs

- `create_intercompany_transaction_controlled`
- `match_intercompany_transaction`
- `eliminate_intercompany_transaction`
- `void_intercompany_transaction`

### Views

- `finance_intercompany_transaction_board`
- `finance_consolidation_entry_board`
- `finance_intercompany_dashboard`

## 5. واجهة المستخدم

- `/app/finance/intercompany`

وتحتوي:

- `FinanceUnitNav unit="intercompany"`.
- اختيار كيان مصدر وكيان مقابل.
- إنشاء معاملة بينية عبر RPC.
- مطابقة/إلغاء/Eliminate بسبب إلزامي.
- عرض قيود التوحيد.

## 6. حدود الجاهزية

- **Local/Static:** type-check/build/contract tests.
- **Supabase Runtime:** بعد `npx supabase db push` فقط.
- **Browser Runtime:** بعد إنشاء معاملة، مطابقتها، إلغائها، وتوليد قيد توحيد.
