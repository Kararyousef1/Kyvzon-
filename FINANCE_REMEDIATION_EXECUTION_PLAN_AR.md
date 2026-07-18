# خطة التنفيذ العلاجية الشاملة — بوابة Kyvzon المالية

**الإصدار:** 1.0  
**التاريخ:** 18 يوليو 2026  
**القرار المعتمد:** العراق + IFRS، دعم متعدد العملات، و**عدة كيانات قانونية داخل Tenant واحد**، مع تنفيذ جميع الوحدات قبل إطلاقها للعملاء.  

> لا تُعد أي شاشة مالية مكتملة إلا إذا حققت: عقد بيانات، migration/RLS، SDK typed، واجهة CRUD حقيقية، سجل تدقيق، اختبارات وحدة/تكامل/E2E، واختبار صلاحيات متعدد الشركات.

---

## 1) الهدف والنطاق

تحويل البوابة المالية الحالية من صفحات عرض جزئية إلى نظام مالي SaaS قابل للتدقيق، متعدد الكيانات والعملات، متوافق تصميمياً مع IFRS وقابل لتطبيق المتطلبات العراقية بعد اعتمادها من محاسب/مستشار ضريبي محلي.

### داخل النطاق

- دليل الحسابات متعدد الكيانات والفروع ومراكز التكلفة.
- دفتر أستاذ عام بالقيد المزدوج، حالات اعتماد، عكس، أقفال فترات، وعدم تعديل بعد النشر.
- AP/AR: موردون، عملاء، فواتير، دفعات، أعمار الديون، تسويات.
- البنوك، النقد، التسوية المصرفية، الاستيراد، والتنبؤ النقدي.
- الميزانيات، السطور، الاعتمادات، التباين الفعلي مقابل الميزانية.
- الضرائب العراقية بصيغة configuration قابلة للاعتماد قانونياً، لا بحسابات مفترضة.
- الأصول الثابتة، الإهلاك، التخلص والنقل.
- العملات، أسعار الصرف، إعادة تقييم العملة، متعدد الكتب عند الحاجة.
- الكيانات الداخلية، المعاملات البينية، التوحيد وelimination entries.
- approvals مالية منفصلة عن موافقات HR، تقارير، قوالب، export، audit، وretention.

### خارج النطاق حتى قرار مكتوب

- الإقرار الضريبي العراقي أو الربط الحكومي المباشر.
- التكامل المصرفي الحقيقي أو SWIFT/Open Banking.
- إرسال الفواتير الإلكترونية الحكومية.
- احتساب رواتب قانوني كامل أو محرك ضرائب مفترض.

هذه البنود لا تُعرض كمنجزة قبل توقيع المتطلبات القانونية، عينات البيانات، وبيئة التكامل من الجهة المعنية.

---

## 2) قواعد هندسية غير قابلة للتفاوض

1. **لا قيم مالية ثابتة ولا `setTimeout` محاكي ولا localStorage كمصدر بيانات.**
2. **لا تعديل ولا حذف للقيد المنشور.** التصحيح يتم بعكس/قيد جديد فقط.
3. **كل سطر مالي ينتمي إلى `tenant_id` + `legal_entity_id` + `book_id` + عملة.**
4. **RLS هو الحد الأمني النهائي؛** tenant أو entity من المتصفح ليس دليلاً على التفويض.
5. **كل انتقال حالة مالي يدور في RPC/Edge Function ذرية** وليس سلسلة عمليات من المتصفح.
6. **كل عملية تغير مالياً تسجل actor، timestamp، before/after، correlation id، والمصدر.**
7. **البيانات المالية تستخدم `NUMERIC` في قاعدة البيانات، لا float/JS Number للحساب النهائي.**
8. **لا تفعيل customer-facing لأي وحدة قبل اجتياز Definition of Done.**

---

## 3) تصميم البيانات المستهدف

### طبقة التنظيم

```text
tenant
 ├─ legal_entities                الكيانات القانونية
 │   ├─ branches
 │   ├─ fiscal_years / accounting_periods
 │   ├─ chart_of_accounts
 │   ├─ journal_books
 │   └─ base_currency (IQD افتراضياً)
 ├─ cost_centers / projects
 └─ finance_roles / approval_matrix
```

### نواة الدفتر العام

```text
journal_entries
journal_entry_lines
journal_entry_approvals
journal_entry_reversals
posting_batches
accounting_period_locks
exchange_rates
currencies
financial_audit_events
```

### Subledgers

```text
vendors / vendor_invoices / vendor_payments      AP
customers / customer_invoices / customer_receipts AR
bank_accounts / bank_transactions / reconciliations
budgets / budget_versions / budget_lines
fixed_assets / asset_categories / depreciation_runs
intercompany_transactions / consolidation_runs / elimination_entries
```

### قواعد القيد

- مجموع المدين = مجموع الدائن لكل قيد وفي كل عملة دفتر.
- يمنع POST إذا كان period مقفلاً، أو إذا لم يكن الحساب نشطاً/قابلاً للترحيل.
- يمنع إدخال `tenant_id`, `legal_entity_id` أو actor من طلب العميل بلا تحقق خادمي.
- يحتفظ القيد بسعر الصرف الأصلي، المبلغ بالعملة المعاملة، ومبلغ العملة الأساسية.
- كل رقم مستند فريد داخل `(tenant, entity, book, fiscal_year)`.

---

## 4) خارطة التنفيذ — موجات العمل

## الموجة 0: تثبيت الواقع ومنع التضليل

**الهدف:** عدم إظهار صفحة غير منجزة كوظيفة مالية حقيقية.

- [ ] استبدال الصفحات المالية غير الموصولة بحالة `planned` صريحة أو إزالتها من المسارات المنشورة مؤقتاً.
- [ ] حذف الصفوف الثابتة مثل `JE-001` والقيم مثل `0.00 SAR` ما لم تكن محسوبة بالفعل.
- [ ] إلغاء نصوص “SAP/Oracle/متصل بـSDK” عندما لا يوجد عقد فعلي.
- [ ] إنشاء `feature_status` مركزي: `planned | in_build | beta | production`.
- [ ] تطبيق migration الحالية واختبارات DB/RLS في staging أولاً.

**مخرج القبول:** لا يمكن للمستخدم الضغط على CRUD لا يعمل، ولا توجد رسالة نجاح غير مثبتة.

## الموجة 1: الأساس المالي متعدد الكيانات

- [ ] migrations: `legal_entities`, `entity_memberships`, `currencies`, `exchange_rates`, `fiscal_years`, `accounting_periods`, `cost_centers`, `projects`.
- [ ] RLS لكل جدول؛ developer platform owner وإداري كيان مفوض فقط.
- [ ] SDK typed بالكامل، بلا `any`.
- [ ] واجهات إدارة الكيان القانوني والسنة والفترات ومراكز التكلفة.
- [ ] seed demo مفصول عن الإنتاج.

**اختبارات القبول:** tenant A لا يرى entity في tenant B؛ مستخدم entity-1 لا يرحّل في entity-2 إلا بتفويض.

## الموجة 2: دليل الحسابات + دفتر الأستاذ العام

- [ ] شجرة حسابات IFRS قابلة للاستيراد والتخصيص.
- [ ] منع حذف حساب مستخدم؛ archive فقط.
- [ ] UI دليل الحسابات الحقيقي: بحث، إنشاء، تعديل، archive، hierarchy.
- [ ] composer للقيد يدعم عدة سطور، validation لحظي، attachment/reference، draft.
- [ ] RPC/Edge Function `post_journal_entry` ذرية.
- [ ] approval matrix، posting batch، reversal، period lock.
- [ ] Trial Balance وGeneral Ledger وAccount Activity.

**اختبارات القبول:** 100% توازن، محاولات تعديل posted تفشل، عكس صحيح، RLS، parallel posting، idempotency key.

## الموجة 3: العملات والكتب والكيانات البينية

- [ ] currency master وأسعار صرف مع مصدر/تاريخ/اعتماد.
- [ ] transaction currency + functional currency + reporting currency.
- [ ] revaluation workflows المعتمدة.
- [ ] books وbook mappings عند الحاجة.
- [ ] intercompany due-to/due-from، matching، eliminations.
- [ ] consolidation snapshot وتقارير متعددة الكيانات.

## الموجة 4: AP وAR

- [ ] vendor/customer masters مع تدقيق وتفعيل.
- [ ] invoice lifecycle: draft → submitted → approved → posted → paid/void.
- [ ] payment allocation، credit note، aging، overdue، recurring schedules.
- [ ] auto-posting إلى GL عبر posting rules قابلة للاختبار.
- [ ] منع duplicate invoice باستخدام vendor + number + entity.

## الموجة 5: البنوك والنقد

- [ ] bank/cash accounts وتفويضات التوقيع.
- [ ] CSV import مدقق وقابل للمعاينة وidempotent.
- [ ] matching rules، reconciliation، فرق تسوية، closing workflow.
- [ ] cash position وforecast مبنيان على بيانات حقيقية فقط.

## الموجة 6: الموازنة والضرائب والأصول

- [ ] budget versions، workflow اعتماد، allocations، variance.
- [ ] tax configuration حسب النصوص القانونية المعتمدة لا افتراضات؛ effective dates وjurisdiction.
- [ ] asset categories، acquisition، depreciation schedules، disposal، impairment.

## الموجة 7: التقارير والاعتمادات النهائية

- [ ] P&L، Balance Sheet، Cash Flow، TB، AP/AR aging، budget variance، tax summaries.
- [ ] reporting snapshots، report templates، export CSV/XLSX/PDF مع audit.
- [ ] dashboard من read models محسوبة لا من قيم ثابتة.
- [ ] performance/load testing، backup/restore، reconciliation، pen-test RLS.

---

## 5) خطة العلاج للمشروع ككل بالتوازي

| المسار | العمل | الأولوية |
|---|---|---|
| SOPs | نقل من localStorage وmock إلى Supabase/RLS/audit | P1 |
| Developer Settings | ربط أو تحويل إلى read-only صريح | P1 |
| Platform Health | إزالة الأرقام الثابتة وربطها بـCI artifact/health endpoint | P1 |
| Biometric | منع success fallback عند فشل الاتصال الحقيقي | P1 |
| Company provisioning | Edge/RPC ذرية بدلاً من سلسلة عمليات من client | P1 |
| E2E | Playwright: tenant, admin-user, developer modules, finance posting | P1 |
| Feature catalog | حالة تنفيذ واضحة لكل بوابة | P2 |

---

## 6) Definition of Done لكل وحدة مالية

لا تنقل الوحدة إلى production إلا عند تحقق جميع ما يلي:

```text
[ ] UX مكتمل (empty/loading/error/success/access denied)
[ ] typed SDK وvalidation للمدخلات
[ ] migration قابلة لإعادة التشغيل
[ ] RLS policies واختبارات cross-tenant/entity
[ ] RPC/Edge Function للحركة الذرية عند وجود أثر مالي
[ ] audit event غير قابل للتلاعب
[ ] unit + integration + E2E tests
[ ] idempotency وconcurrency tests عند الاستيراد/الترحيل
[ ] تقرير أو reconciliation يثبت النتيجة
[ ] توثيق API/runbook/rollback
[ ] review من محاسب IFRS ومستشار عراقي عند الضرائب/القانون
```

---

## 7) ترتيب العمل الفعلي الذي سيبدأ الآن

1. **إجراء جرد نهائي لمسارات المالية وإزالة أي ادعاء غير حقيقي من البيئة المنشورة.**
2. **تصميم وتنفيذ الموجة 1**: legal entities + fiscal periods + currencies + RLS + اختبارات.
3. **تنفيذ الموجة 2**: Chart of Accounts وJournal Entries، ثم ربط Financial Dashboard ببيانات محسوبة حقيقية.
4. لا يتم فتح AP/AR أو Bank أو Tax أو Consolidation للعملاء قبل اكتمال نواة GL ونجاح تدقيقها.

---

## 7.1) تقدم التنفيذ في هذه الجلسة

تم بدء **الموجة 1** فعلياً بالمخرجات التالية:

- `supabase/migrations/0126_finance_multi_entity_foundation.sql`
  - `legal_entities`, `entity_memberships`, `fiscal_years`, `accounting_periods`.
  - `currencies`, `exchange_rates`, `cost_centers`, `finance_projects`.
  - Default entity آمن لكل Tenant قائم، وتهيئة عضوية admin/hr/manager للكيان الافتراضي فقط.
  - دوال تفويض entity وRLS على مستوى الكيان القانوني.
- `src/services/sdk/FinanceFoundationService.ts`
  - SDK typed للوحدات الأساسية أعلاه.
- تحديث post-migration checks للتحقق من الجداول المالية الأساسية.

**تحقق ساكن بعد التنفيذ:** TypeScript وDB contract وSDK boundary نجحت.  
**متبقي قبل دمج هذه الموجة:** تشغيل clean PostgreSQL/RLS test على CI أو staging؛ لا يتوفر PostgreSQL محلي في بيئة العمل الحالية.

---

## 8) معلومات مطلوبة من صاحب المنتج قبل بناء الضرائب والإطلاق

- قائمة الكيانات القانونية الفعلية، الفروع، والعملات لكل Tenant.
- شجرة حسابات حالية أو نموذج حسابات معتمد.
- السنة المالية، قواعد إقفال الفترات، وحدود التفويض.
- نماذج فواتير/دفعات/كشوف بنكية واقعية مع بيانات منزوعة الهوية.
- القوانين والتعليمات الضريبية العراقية المعتمدة وتاريخ سريانها.
- سياسة الاحتفاظ، الموافقات، التوقيع، وسجل التدقيق.
- تعريف RPO/RTO وسياسات النسخ الاحتياطي.
