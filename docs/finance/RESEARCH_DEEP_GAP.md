═══════════════════════════════════════════════════════════════
         خطة تنفيذ ما ينقص بوابة المالية (أولوية عالية أولاً)
═══════════════════════════════════════════════════════════════

📋 الترتيب حسب الأولوية (من البحث العميق):
─────────────────────────────────────────────────────────────

🔴 أولوية عالية (الأسبوع القادم):
─────────────────────────────────────────────────

1. Audit Trail Table (audit_vault)
   - ملف SQL: 0106_audit_trail.sql
   - جدول: audit_vault (table_name, record_id, action, before_values, after_values, user_id, timestamp)
   - SDK: AuditTrailService (extends BaseService for audit records)
   - Trigger في PostgreSQL: يسجل تلقائياً عند INSERT/UPDATE/DELETE على journal_entries, chart_of_accounts, etc.
   - صفحة: /app/finance/audit-trail (عرض السجل مع فلترة حسب الجدول والتاريخ)

2. Workflow Approvals (approval_requests)
   - ملف SQL: 0107_approvals.sql
   - جدول: approval_requests (id, request_type, reference_id, requested_by, status, current_step, created_at)
   - جدول: approval_steps (id, request_id, step_order, approver_role, approver_id, status, comments, timestamp)
   - SDK: ApprovalService (handles approval flow for journal entries, invoices, expenses)
   - صفحات: /app/finance/approvals (قائمة الموافقات المعلقة) + Modal للموافقة/الرفض
   - تكامل مع Router: RequireRole للتحكم في من يمكنه الموافقة

3. Multi-Book Support (journal_books)
   - ملف SQL: 0108_multi_book.sql
   - جدول: journal_books (id, tenant_id, book_name, book_code, book_type, is_active)
   - تعديل journal_entries: إضافة book_id (يشير إلى journal_books)
   - SDK: MultiBookService (findByBook, createEntryInBook)
   - صفحة: /app/finance/books (إدارة الدفاتر المتعددة: IFRS, GAAP, Tax, Management)

4. System Notes (audit_notes — غير قابل للتعديل)
   - ملف SQL: 0109_system_notes.sql
   - جدول: system_notes (id, entity_type, entity_id, note_content, user_id, timestamp, is_immutable)
   - خاصية: لا يمكن التعديل أو الحذف — فقط INSERT (مثل Square Books)
   - SDK: SystemNoteService (createNote فقط — لا update ولا delete)
   - صفحة: مدمجة في كل صفحة (زر "إضافة ملاحظة" بجانب كل سجل)

🟡 أولوية متوسطة (الأسبوع التالي):
─────────────────────────────────────────────────

5. Bank Statement Auto-Import
   - ملف SQL: 0110_bank_statement_import.sql
   - جدول: bank_statement_imports (id, bank_account_id, import_date, file_path, status)
   - جدول: bank_statement_lines (id, import_id, transaction_date, description, amount, matched)
   - SDK: BankStatementImportService + AutoMatchAlgorithm
   - صفحة: /app/finance/bank-statements (رفع ملف CSV + عرض المطابقة التلقائية)

6. Advanced Budget Variance Reports
   - ملف SQL: 0111_variance_reports.sql (لا حاجة لجدول جديد — استخدام budgets + journal_entries)
   - SDK: BudgetVarianceService (compareBudgetToActual)
   - صفحة: /app/finance/budget-variance (تقرير المقارنة الفعلي مقابل المخطط)

7. Tax Filing Status Tracking
   - ملف SQL: 0112_tax_filing.sql
   - جدول: tax_filing_status (id, tax_period, filing_type, status, due_date, submitted_at)
   - SDK: TaxFilingService
   - صفحة: /app/finance/tax-filing

8. Cash Flow Forecast Automation
   - ملف SQL: 0113_cash_forecast.sql
   - جدول: cash_forecast_scenarios (id, scenario_name, start_date, end_date, projected_cash)
   - SDK: CashForecastService
   - صفحة: /app/finance/cash-forecast (تنبؤ التدفق النقدي حسب السيناريوهات)

🟢 أولوية منخفضة (الأسبوع الثالث):
─────────────────────────────────────────────────

9. Intercompany Module
10. Multi-Currency Real-Time
11. Revenue Recognition Module
12. Project Accounting
13. Multi-Entity Consolidation
14. Fixed Assets Automation
15. 150+ Financial Report Templates

📊 الترتيب الزمني المقترح:
─────────────────────────────────────────────────
الأسبوع 1: Audit Trail + Workflow Approvals + Multi-Book + System Notes
الأسبوع 2: Bank Statement Auto-Import + Budget Variance + Tax Filing + Cash Forecast
الأسبوع 3: Intercompany + Multi-Currency + Revenue Recognition + Project Accounting
الأسبوع 4: Multi-Entity Consolidation + Fixed Assets + 150+ Templates
