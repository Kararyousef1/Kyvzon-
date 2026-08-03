# خطة إعادة هندسة بوابة المالية — Kyvzon Finance Portal

**التاريخ:** 2026-07-28  
**الهدف:** تحويل بوابة المالية من نواة GL/AP جيدة إلى بوابة مالية مؤسسية متكاملة، بنفس منهجية بوابة المخزون والتصنيع.

---

## 1) لماذا نعيد التفكير في بوابة المالية؟

بوابة المالية هي مركز الحقيقة في ERP. كل البوابات الأخرى تنتهي مالياً هنا:

```text
Procurement → AP / Accruals / Payments
Inventory → Valuation / COGS / Stock Adjustments
MRP → WIP / FG / Variances / Manufacturing Costing
CRM → AR / Revenue / Contracts / Collections
HR → Payroll / Expenses / Loans / Bonuses
```

الوضع الحالي جيد كنواة، لكنه غير كافٍ كبوابة مالية كاملة للشركات المتوسطة والكبيرة. لذلك يجب إعادة بنائها على وحدات واضحة، مع توثيق وتشغيل واختبارات.

---

## 2) مبدأ العمل

نفس منهجية Inventory وMRP:

```text
لا نخرج من وحدة حتى تغطي التوثيق + DB/RPC/RLS/Views + SDK + UI + Routes + Sidebar + Admin + Hybrid + Tests + Runtime notes
```

كل وحدة تحتاج:

- Official documentation.
- Technical checklist.
- Migration/RPC/RLS/Views.
- SDK.
- UI pages.
- Routes/Legacy redirects.
- Sidebar / UnitNav.
- AdminEmployeesPage catalog.
- HybridPagesCatalog.
- Post migration checks.
- Contract tests.

---

## 3) الوحدات المقترحة لبوابة المالية

| الوحدة | الاسم | الهدف |
|---|---|---|
| 00 | Finance Foundation & Control Plane | الكيانات القانونية، العملات، السنوات، الفترات، الأبعاد، الصلاحيات، UnitNav |
| 01 | Chart of Accounts & Dimensions | دليل الحسابات، مراكز التكلفة، المشاريع، الأبعاد التحليلية |
| 02 | General Ledger & Journal Lifecycle | مسودات القيود، الاعتماد، الترحيل، العكس، immutability |
| 03 | Period Close & Audit/GRC | إغلاق الفترات، audit trail، system notes، approvals، controls |
| 04 | Accounts Payable | الموردون، فواتير الموردين، المطابقة، الاعتماد، الدفعات، aging |
| 05 | Accounts Receivable & Collections | العملاء، فواتير العملاء، التحصيل، aging، credit control، dunning |
| 06 | Cash & Bank Reconciliation | الحسابات البنكية، استيراد كشوف، المطابقة البنكية، cash position |
| 07 | Tax Management & Filing | ضريبة VAT/GST، الإقرارات، tax periods، tax reports |
| 08 | Budgeting & Forecasting | الموازنات، actual vs budget، scenarios، cash forecast |
| 09 | Fixed Assets | الأصل، الاستهلاك، الإهلاك، التخلص، revaluation |
| 10 | Revenue Recognition | ASC606/IFRS15، deferred revenue، schedules، SaaS contracts |
| 11 | Intercompany & Consolidation | معاملات بين الشركات، eliminations، group reporting |
| 12 | Project Accounting | تكاليف المشاريع، WIP project، profitability، billing |
| 13 | Financial Reporting & Analytics | P&L، Balance Sheet، Cash Flow، board pack، exports |
| 14 | Finance Integrations | تكامل المالية مع Procurement/Inventory/MRP/CRM/HR |

---

## 4) الأولويات التنفيذية

## P0 — تثبيت الأساس المالي

1. Unit 00 — Finance Foundation & Control Plane.
2. Unit 01 — Chart of Accounts & Dimensions.
3. Unit 02 — General Ledger & Journal Lifecycle.
4. Unit 03 — Period Close & Audit/GRC.

هذه الوحدات يجب أن تكون صلبة قبل أي توسع.

## P1 — العمليات المالية اليومية

5. Unit 04 — AP.
6. Unit 05 — AR.
7. Unit 06 — Cash/Bank.
8. Unit 07 — Tax.

## P2 — إدارة مالية متقدمة

9. Budgeting.
10. Fixed Assets.
11. Revenue Recognition.
12. Intercompany/Consolidation.
13. Project Accounting.

## P3 — التقارير والتكامل النهائي

14. Financial Reporting & Analytics.
15. Finance Integrations.

---

## 5) القرارات المعمارية الأولية

### 5.1 المسار

المسار الحالي صحيح:

```text
/app/finance
```

### 5.2 Module

المفتاح الحالي صحيح:

```text
finance
```

### 5.3 الأدوار

الأدوار الحالية المتعلقة بالمالية:

```text
finance
finance_manager
accountant
entity_admin
admin
manager
```

لكن يجب ضبطها بدقة حسب الوحدة:

- Viewer.
- Accountant.
- Approver.
- Finance Manager.
- Entity Admin.

### 5.4 Legal Entity Scope

بوابة المالية لا يكفي فيها tenant_id فقط. يجب احترام:

```text
legal_entity_id
```

لأن الشركة الواحدة قد تحتوي عدة كيانات قانونية.

### 5.5 Immutability

أي سجل مالي منشور يجب ألا يُعدل مباشرة:

- Posted journal entries.
- Posted payments.
- Closed periods.
- Posted tax filings.
- Posted depreciation.

التعديل يكون عبر:

```text
reversal
adjustment
new correction entry
```

---

## 6) فلسفة UX المالية

الموظف المالي لا يجب أن ينسخ UUID. يجب استخدام Lookups:

- Legal Entity Lookup.
- Account Lookup.
- Period Lookup.
- Vendor Lookup.
- Customer Lookup.
- Invoice Lookup.
- Bank Account Lookup.
- Cost Center / Project Lookup.

كل عملية حساسة تحتاج سبب:

- Void invoice.
- Reverse journal.
- Close period.
- Reopen period.
- Cancel payment.
- Archive account.
- Cancel report.

---

## 7) صفحات Finance المقترحة بعد إعادة التنظيم

### Sidebar الرئيسي

يعرض الوحدات الرئيسية فقط:

```text
Finance Dashboard
Foundation
Chart of Accounts
General Ledger
Period Close & Audit
Accounts Payable
Accounts Receivable
Cash & Bank
Tax
Budgeting
Fixed Assets
Revenue Recognition
Intercompany
Project Accounting
Reports & Analytics
Integrations
```

### داخل كل وحدة

تظهر بطاقات خطوات مثل Inventory/MRP عبر:

```text
FinanceUnitNav
```

---

## 8) معالجة الصفحات الحالية

الصفحات الحالية تنقسم إلى:

### مربوطة في الراوتر وتعمل جزئياً/كلياً

```text
FinancialDashboard
FinanceSetup
AccountingPeriods
ChartOfAccounts
JournalEntries
TrialBalance
GeneralLedger
FinancialReports
Vendors
AccountsPayable
APAging
VendorPayments
```

### موجودة وغير مربوطة أو تحتاج تحقق

```text
AccountsReceivable
CashManagement
TaxManagement
Budget
FixedAssets
BankStatementImport
AdvancedVariance
CashForecast
Intercompany
MultiEntity
ProjectAccounting
RevenueRecognition
Approvals
SystemNotes
```

المنهجية: لا نحذفها. نراجع كل صفحة ونقرر:

- ربطها بعد إكمال backend.
- أو توسيمها beta.
- أو إعادة بنائها ضمن الوحدة المناسبة.

---

## 9) مخرجات كل وحدة

لكل وحدة سننشئ:

```text
docs/finance/XX-<unit>.md
docs/finance/XX-<unit>-technical-checklist.md
supabase/migrations/024X_finance_<unit>.sql
src/services/sdk/<FinanceUnitService>.ts
src/pages/app/finance/<unit>/...
src/test/finance/<unit>Contract.test.ts
```

إذا كان التعديل على جداول موجودة سنستخدم migrations آمنة:

```sql
ALTER TABLE ... ADD COLUMN IF NOT EXISTS
CREATE OR REPLACE FUNCTION
CREATE OR REPLACE VIEW
```

لا نكسر بيانات حالية.

---

## 10) علاقة المالية بالبوابات الأخرى

### Procurement

- PR budget check.
- PO commitments.
- GR accruals.
- AP invoice.
- Vendor payments.

### Inventory

- Stock valuation.
- Inventory adjustments.
- COGS.
- Returns.

### MRP

- WIP.
- Finished goods valuation.
- Cost variances.
- Cost posting drafts.

### CRM

- Closed won → customer.
- Quote/contract → AR invoice.
- Revenue recognition.

### HR

- Payroll.
- Loans.
- Bonuses.
- Expenses.

---

## 11) الفحوصات

بعد كل وحدة:

```bash
npm run type-check
npm run db:contract-check
npm run db:procurement-sql-check
npm run test:run -- src/test/finance/<unit>Contract.test.ts
npm run build
```

وعند اكتمال أكثر من وحدة:

```bash
npm run test:run
npm run lint
```

---

## 12) معيار الجاهزية النهائي

لا نقول بوابة المالية جاهزة حتى:

- كل وحدة موثقة.
- كل صفحة تعمل.
- كل زر حساس عبر RPC.
- كل سجل مالي منشور immutable.
- كل إغلاق/إلغاء/عكس بسبب.
- كل تقارير رئيسية تعمل.
- كل تكاملات P0 تعمل.
- تم اختبار Runtime على Supabase.

---

## 13) البداية المقترحة الآن

نبدأ بـ:

```text
Unit 00 — Finance Foundation & Control Plane
```

لأنها ستنظم:

- البنية الحالية.
- الراوتر.
- FinanceUnitNav.
- Legal entities.
- Fiscal years.
- Accounting periods.
- Entity memberships.
- Currencies/exchange rates.
- ربط الصفحات الحالية.
- Admin/Hybrid catalogs.
- Post-migration checks.

بعدها ننتقل إلى Unit 01.
