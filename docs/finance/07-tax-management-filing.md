# الوحدة 07 — إدارة الضرائب والتقديم الضريبي

> Finance Unit 07 — Tax Management & Filing

## 1. الغرض

هذه الوحدة تضبط الأكواد الضريبية، فترات التقديم، وملفات الضريبة الناتجة من الذمم المدينة والدائنة. لا يجوز أن تكون الضريبة مجرد رقم مفترض؛ يجب أن تكون configuration صريحة مرتبطة بكيان قانوني وفترة وسجل تدقيق.

## 2. نطاق الوحدة

- أكواد ضريبية لكل كيان قانوني.
- نسب وتواريخ سريان بدون افتراضات قانونية.
- توليد مسودة ملف ضريبي من فواتير AR/AP ذات `tax_amount`.
- فصل ضريبة المخرجات Output Tax عن ضريبة المدخلات Input Tax.
- دورة حياة ملف الضريبة: draft → submitted → approved/rejected → paid.
- سبب إلزامي لكل انتقال حالة أو تعطيل كود.
- Views للتقديم الضريبي والـ Dashboard.

## 3. قواعد العمل

- الكود الضريبي فريد داخل الكيان.
- لا حذف صلب للكود؛ تعطيل فقط بسبب.
- أي نسبة يجب أن تكون بين 0 و 1.
- ملف الضريبة يولد من فترة تاريخية محددة.
- الفواتير المعتمدة/المحصلة/المدفوعة فقط تدخل في المسودة.
- لا اعتماد أو رفض أو دفع بدون سبب.
- كل عملية تسجل في `finance_audit_events`.

## 4. كائنات قاعدة البيانات

### جداول

- `finance_tax_filing_lines`

### RPCs

- `upsert_finance_tax_code`
- `update_finance_tax_code_status`
- `generate_tax_filing_draft`
- `update_tax_filing_status`

### Views

- `finance_tax_code_board`
- `finance_tax_filing_board`
- `finance_tax_filing_line_board`
- `finance_tax_dashboard`

## 5. واجهة المستخدم

- `/app/finance/tax-management`

وتحتوي:

- `FinanceUnitNav unit="tax"`.
- اختيار الكيان القانوني.
- إدارة الأكواد الضريبية عبر RPC.
- توليد ملف ضريبي لفترة.
- عرض مسودات وملفات الضريبة.
- تحديث حالة الملف بسبب إلزامي.

## 6. حدود الجاهزية

- **Local/Static:** type-check/build/contract tests.
- **Supabase Runtime:** بعد `npx supabase db push` فقط.
- **Browser Runtime:** بعد تجربة إنشاء كود، توليد ملف، إرسال/اعتماد/دفع، ومراجعة Audit.
