# الوحدة 10 — الاعتراف بالإيرادات

> Finance Unit 10 — Revenue Recognition / IFRS 15

## 1. الغرض

هذه الوحدة تضبط عقود الإيراد وجداول الاعتراف بالإيراد وفق منهجية IFRS 15 على مستوى الكيان القانوني والعميل. لا يتم الاعتراف بالإيراد كرقم حر؛ بل من عقد وجدول اعتراف وحالة قابلة للتدقيق.

## 2. نطاق الوحدة

- عقود إيراد لكل كيان قانوني.
- ربط اختياري بعميل من AR.
- طرق الاعتراف: straight_line / milestone / usage_based.
- توليد جدول اعتراف شهري.
- تشغيل الاعتراف لسطر جدول بسبب إلزامي.
- إكمال/إلغاء العقد بسبب إلزامي.
- Dashboard وBoards للعقود والجداول.

## 3. قواعد العمل

- رقم العقد فريد داخل الكيان.
- لا حذف صلب للعقود.
- لا توليد جدول لعقد غير نشط.
- لا اعتراف بسطر تم الاعتراف به مسبقاً.
- إجمالي الجدول لا يتجاوز مبلغ العقد.
- كل تشغيل اعتراف أو تغيير حالة يسجل في `finance_audit_events`.

## 4. كائنات قاعدة البيانات

### RPCs

- `upsert_finance_revenue_contract`
- `generate_revenue_recognition_schedule`
- `recognize_revenue_schedule_line`
- `update_revenue_contract_status`

### Views

- `finance_revenue_contract_board`
- `finance_revenue_schedule_board`
- `finance_revenue_dashboard`

## 5. واجهة المستخدم

- `/app/finance/revenue-recognition`

وتحتوي:

- `FinanceUnitNav unit="revenue"`.
- اختيار الكيان.
- إنشاء عقد عبر RPC.
- توليد جدول الاعتراف.
- تشغيل الاعتراف بسبب إلزامي.
- إكمال/إلغاء العقد بسبب إلزامي.

## 6. حدود الجاهزية

- **Local/Static:** type-check/build/contract tests.
- **Supabase Runtime:** بعد `npx supabase db push` فقط.
- **Browser Runtime:** بعد إنشاء عقد، توليد جدول، تشغيل اعتراف، وإكمال عقد.
