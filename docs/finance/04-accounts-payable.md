# الوحدة 04 — الذمم الدائنة والموردون

> Finance Unit 04 — Accounts Payable  
> الهدف: إدارة الموردين وفواتير الموردين والمدفوعات والأعمار كدورة تشغيل مالية محكومة لا تعتمد على إدخال UUID أو تحديثات مباشرة.

## 1. الغرض

الوحدة 04 تمثل التزامات الشركة تجاه الموردين. يجب أن تغطي:

- سجل موردين لكل كيان قانوني.
- فواتير موردين مع سطور مصروف/تكلفة وأبعاد مالية.
- دورة حياة الفاتورة: draft → submitted → approved → partially_paid/paid أو voided.
- دفعات الموردين مع تخصيصات على الفواتير.
- أعمار الذمم الدائنة.
- Audit لكل تغيير حالة أو أرشفة أو دفع.

## 2. نطاق الوحدة

### داخل النطاق

- إنشاء/تحديث مورد عبر RPC.
- تعطيل/إعادة تفعيل المورد بسبب إلزامي.
- إنشاء فاتورة مورد مع Line Builder.
- اختيار حسابات مصروف/ترحيل من Lookup، وليس UUID.
- اختيار مركز تكلفة ومشروع من Lookup.
- منع اعتماد فاتورة بدون سطور أو بمجموع غير مطابق.
- إرسال/اعتماد/إلغاء فاتورة بسبب إلزامي.
- إنشاء دفعة مورد مع تخصيصات.
- ترحيل/إلغاء دفعة بسبب إلزامي.
- Aging Board وDashboard.

### خارج النطاق

- 3-way match مع المشتريات والاستلام: Finance Integrations / Procurement Integration.
- OCR وقراءة PDF: Finance Integrations.
- Posting Profiles التلقائية للدفتر العام: وحدة تكامل لاحقة، لكن السطور تجهز الحسابات والأبعاد.

## 3. قواعد العمل

### المورد

- المورد فريد بالكود داخل الكيان.
- لا حذف صلب للمورد؛ تعطيل فقط بسبب.
- لا يمكن استخدام مورد غير نشط في فاتورة جديدة.

### الفاتورة

- الفاتورة مرتبطة بمورد وكيان قانوني.
- رقم الفاتورة فريد للمورد داخل الكيان.
- كل سطر له حساب مصروف/ترحيل نشط.
- مجموع السطور يجب أن يساوي مبلغ الفاتورة.
- كل انتقال حالة يتطلب سبباً.
- لا يمكن إلغاء فاتورة مدفوعة.

### الدفع

- الدفعة تبدأ draft.
- تخصيصات الدفعة يجب أن تساوي مبلغ الدفعة.
- لا يمكن تخصيص مبلغ أكبر من المتبقي في الفاتورة.
- الترحيل يتطلب سبباً ويسجل Audit.

## 4. كائنات قاعدة البيانات المطلوبة

### جداول

- `ap_invoice_lines`

### RPCs

- `upsert_finance_vendor(...)`
- `update_finance_vendor_status(uuid,boolean,text)`
- `create_ap_invoice_with_lines(...)`
- `set_ap_invoice_lifecycle_status(uuid,text,text)`
- `post_vendor_payment_with_reason(uuid,text)`
- `void_vendor_payment(uuid,text)`

### Views

- `finance_vendor_lookup`
- `finance_ap_invoice_board`
- `finance_ap_invoice_line_board`
- `finance_ap_dashboard`
- `finance_vendor_payment_board`
- `finance_vendor_payment_allocation_board`

## 5. واجهات المستخدم

- `/app/finance/vendors`
- `/app/finance/accounts-payable`
- `/app/finance/vendor-payments`
- `/app/finance/accounts-payable/aging`

كل الصفحات يجب أن تحتوي `FinanceUnitNav unit="ap"` وتستخدم Lookups وسبب إلزامي للعمليات الحساسة.

## 6. حدود الجاهزية

- **Local/Static:** type-check/build/contract tests.
- **Supabase Runtime:** بعد `npx supabase db push` فقط.
- **Browser Runtime:** بعد تجربة إنشاء مورد، إنشاء فاتورة بسطر، إرسال/اعتماد/إلغاء، إنشاء دفعة وترحيلها، ومراجعة Aging/Audit.
