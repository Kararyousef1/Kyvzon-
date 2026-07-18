# GeneralLedgerService
- الجدول: 'journal_entries'
- الدوال:   createJournal(data: Partial<JournalEntryRecord>): Promise<JournalEntryRecord>,  findByTenant(tenantId: string): Promise<JournalEntryRecord[]>   findByStatus(status: string): Promise<JournalEntryRecord[]>,  reverseEntry(id: string, reason?: string): Promise<JournalEntryRecord>

# ChartOfAccountService
- الجدول: 'chart_of_accounts'
- الدوال:   findByType(type: string): Promise<ChartOfAccountRecord[]>,  findActive(): Promise<ChartOfAccountRecord[]>

# AccountsPayableService
- الجدول: 'accounts_payable'
- الدوال: 

# AccountsReceivableService
- الجدول: 'accounts_receivable'
- الدوال: 

# CashManagementService
- الجدول: 'bank_accounts'
- الدوال:   getBalance() const all = await this.findAll(); return all.reduce((s,a:any)=>s+(a.balance||0),0); }

# TaxService
- الجدول: 'tax_codes'
- الدوال: 

# BudgetService
- الجدول: 'budgets'
- الدوال: 

# FinancialReportService
- الجدول: 
- الدوال:   generatePAndL(start: string, end: string),  generateBalanceSheet(date: string)

