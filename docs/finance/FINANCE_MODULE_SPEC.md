# بوابة المالية — وثائق المواصفات

## الخدمات
- GeneralLedgerService: إدارة القيود
- ChartOfAccountService: مخطط الحسابات
- AccountsPayableService: الذمم الدائنة
- AccountsReceivableService: الذمم المدينة
- CashManagementService: النقدية
- TaxService: الضرائب
- BudgetService: الميزانيات
- FinancialReportService: التقارير

## قاعدة البيانات
- 0101: Core Schema (chart_of_accounts, journal_entries, journal_entry_lines)
- 0102: AP + AR
- 0103: Cash + Bank
- 0104: Tax + Budget
- 0105: RLS Policies

## الأمان
- Multi-Tenancy عبر tenant_id + RLS
- Audit Trail: قيود GL لا تُعدل (Immutability)
- Double-Entry Enforcement: total_debit = total_credit
