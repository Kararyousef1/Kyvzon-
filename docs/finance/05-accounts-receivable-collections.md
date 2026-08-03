# الوحدة 05 — الذمم المدينة والتحصيل

> Finance Unit 05 — Accounts Receivable & Collections  
> الهدف: إدارة العملاء وفواتير العملاء والتحصيلات والأعمار كدورة مالية محكومة ومتكاملة مع دليل الحسابات والأبعاد.

## 1. الغرض

هذه الوحدة تمثل حقوق الشركة لدى العملاء. يجب أن تغطي:

- سجل عملاء لكل كيان قانوني.
- فواتير عملاء مع سطور إيراد/خدمة وأبعاد مالية.
- دورة حياة الفاتورة: `draft → submitted → approved → partially_received/paid` أو `voided`.
- تحصيلات العملاء وتخصيصها على الفواتير.
- أعمار الذمم المدينة.
- Audit لكل تغيير حالة أو تحصيل أو تعطيل عميل.

## 2. نطاق الوحدة

### داخل النطاق

- إنشاء/تحديث عميل عبر RPC.
- تعطيل/تفعيل عميل بسبب إلزامي.
- إنشاء فاتورة AR مع Line Builder.
- اختيار حسابات الإيراد/الترحيل من Lookup وليس UUID.
- اختيار مركز تكلفة ومشروع عند الحاجة.
- إرسال/اعتماد/إلغاء فاتورة بسبب إلزامي.
- إنشاء تحصيل عميل مع تخصيصات.
- ترحيل/إلغاء التحصيل بسبب إلزامي.
- AR Aging وDashboard.

### خارج النطاق

- Revenue recognition المتقدم: الوحدة 10.
- تكامل CRM/Sales order/Subscriptions: وحدات التكامل.
- بوابات دفع إلكتروني حية: Finance Integrations.

## 3. قواعد العمل

- العميل فريد بالكود داخل الكيان.
- لا حذف صلب للعميل؛ تعطيل فقط بسبب.
- لا يمكن إصدار فاتورة لعميل غير نشط.
- كل فاتورة يجب أن تحتوي سطراً واحداً على الأقل.
- مجموع السطور يمثل مبلغ الفاتورة.
- الحسابات يجب أن تكون صالحة للترحيل وليست رقابية.
- الأبعاد المطلوبة حسب سياسة الحساب إلزامية.
- التحصيل لا يرحل إلا إذا مجموع التخصيصات يساوي مبلغ التحصيل.
- لا يمكن تحصيل أكثر من المتبقي على الفاتورة.

## 4. كائنات قاعدة البيانات المطلوبة

### جداول

- `ar_invoice_lines`
- `customer_receipts`
- `customer_receipt_allocations`

### RPCs

- `upsert_finance_customer(...)`
- `update_finance_customer_status(uuid,boolean,text)`
- `create_ar_invoice_with_lines(...)`
- `set_ar_invoice_lifecycle_status(uuid,text,text)`
- `create_customer_receipt_draft(...)`
- `post_customer_receipt_with_reason(uuid,text)`
- `void_customer_receipt(uuid,text)`
- `get_ar_aging(uuid,date)`

### Views

- `finance_customer_lookup`
- `finance_ar_invoice_board`
- `finance_ar_invoice_line_board`
- `finance_ar_dashboard`
- `finance_customer_receipt_board`
- `finance_customer_receipt_allocation_board`

## 5. واجهة المستخدم

- `/app/finance/accounts-receivable`

يجب أن تحتوي:

- `FinanceUnitNav unit="ar"`.
- إدارة العملاء بدون UUID.
- إنشاء فاتورة بسطر/أبعاد.
- انتقالات حالة بسبب إلزامي.
- تحصيلات وتخصيصات.
- Aging Dashboard.

## 6. حدود الجاهزية

- **Local/Static:** type-check/build/contract tests.
- **Supabase Runtime:** بعد `npx supabase db push` فقط.
- **Browser Runtime:** بعد تجربة عميل/فاتورة/اعتماد/تحصيل/Aging/Audit على بيانات حقيقية.
