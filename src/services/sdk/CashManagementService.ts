import { bankAccountService, cashBankDashboardService } from './BankStatementImportService';

export const cashManagementService = {
  async getBalance(legalEntityId?: string): Promise<number> {
    const rows = await cashBankDashboardService.find(legalEntityId);
    return rows.reduce((sum, row) => sum + Number(row.total_cash_balance || 0), 0);
  },
  findBankAccounts: bankAccountService.findBoard.bind(bankAccountService),
};
