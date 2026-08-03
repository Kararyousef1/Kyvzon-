# Checklist — الوحدة 01: دليل الحسابات والأبعاد المالية

> لا نغادر الوحدة 01 حتى تكون كل البنود إما منجزة أو موسومة كمؤجلة بقرار واضح.

## A. التوثيق

- [x] إنشاء `docs/finance/01-chart-of-accounts-dimensions.md`.
- [x] توضيح نطاق الوحدة وحدودها.
- [x] توثيق قواعد الشجرة والترحيل والأرشفة والأبعاد.
- [x] توثيق معايير القبول وحدود الجاهزية.

## B. قاعدة البيانات

- [x] إنشاء migration للوحدة: `0241_finance_chart_of_accounts_dimensions.sql`.
- [x] إضافة جدول `finance_account_dimension_policies`.
- [x] تفعيل RLS على جدول سياسات الأبعاد.
- [x] منع DELETE عبر عدم إنشاء سياسة حذف.
- [x] إضافة `upsert_finance_chart_account`.
- [x] إضافة `archive_finance_chart_account`.
- [x] إضافة `update_finance_account_posting`.
- [x] إضافة `upsert_finance_account_dimension_policy`.
- [x] إضافة `validate_finance_account_hierarchy`.
- [x] إضافة `finance_validate_journal_line_dimensions` Trigger Function.
- [x] إضافة Trigger على `journal_entry_lines` للتحقق من الأبعاد.
- [x] إضافة View `finance_chart_of_accounts_tree`.
- [x] إضافة View `finance_posting_account_lookup`.
- [x] إضافة View `finance_account_usage_summary`.
- [x] إضافة View `finance_account_dimension_policy_board`.
- [x] إضافة View `finance_dimensions_dashboard`.
- [x] تسجيل Audit Events لعمليات الحسابات والسياسات.

## C. SDK

- [x] تحديث `ChartOfAccountService.ts` ليستخدم RPCs للوحدة 01.
- [x] إضافة أنواع قراءة للشجرة والاستخدام والسياسات.
- [x] إضافة `findTree`.
- [x] إضافة `findPostingLookup`.
- [x] إضافة `findUsageSummary`.
- [x] إضافة `upsertAccount`.
- [x] إضافة `archiveAccount`.
- [x] إضافة `updatePosting`.
- [x] إضافة `upsertDimensionPolicy`.
- [x] إضافة `validateHierarchy`.

## D. واجهة المستخدم

- [x] تحديث صفحة `ChartOfAccountsPage.tsx` لتكون وحدة نظامية.
- [x] إضافة `FinanceUnitNav` للوحدة 01.
- [x] اختيار الكيان القانوني عبر قائمة وليس UUID.
- [x] إنشاء/تعديل الحساب عبر Modal منضبط.
- [x] اختيار الحساب الأب عبر قائمة.
- [x] ضبط `normal_balance`, `allow_posting`, `is_control_account`.
- [x] ضبط سياسة الأبعاد من نفس النموذج.
- [x] الأرشفة عبر نافذة سبب، بدون `confirm`.
- [x] تغيير الترحيل عبر نافذة سبب.
- [x] عرض Usage Summary.
- [x] عرض نتائج تحقق الشجرة.

## E. Router / Navigation

- [x] route موجود: `/app/finance/chart-of-accounts`.
- [x] إضافة `FinanceUnitNav` نوع `coa`.
- [x] إبقاء Sidebar على مستوى الوحدات الرئيسية فقط.

## F. الاختبارات والفحوص

- [x] إضافة `src/test/financeChartOfAccountsContract.test.ts`.
- [x] تحديث `scripts/tests/99_post_migration_checks.sql` للوحدة 01.
- [x] تشغيل `npm run type-check` — PASS محلياً.
- [x] تشغيل `npm run db:contract-check` — PASS محلياً.
- [x] تشغيل `npm run db:procurement-sql-check` — PASS محلياً.
- [x] تشغيل `npm run test:run -- src/test/financeChartOfAccountsContract.test.ts` — PASS محلياً.
- [x] تشغيل `npm run build` — PASS محلياً مع تحذير chunk-size المعروف.
- [x] تشغيل `npm run lint` — PASS بدون errors، مع 1500 warnings قديمة/عامة خارج نطاق الوحدة.

## G. Runtime بعد التطبيق

- [ ] تطبيق migration عبر `npx supabase db push` — لم يتم محلياً من المساعد.
- [ ] تشغيل Post-Migration Checks على Supabase Runtime.
- [ ] تجربة الصفحة في المتصفح بكيان فعلي.
- [ ] إنشاء حساب جذري.
- [ ] إنشاء حساب ابن.
- [ ] منع parent posting عند وجود أبناء.
- [ ] ضبط سياسة أبعاد.
- [ ] تجربة Lookup في القيود.
- [ ] أرشفة حساب بسبب ورؤية Audit Event.
