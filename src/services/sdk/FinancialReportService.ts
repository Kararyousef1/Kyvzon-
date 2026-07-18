import { generalLedgerService } from './GeneralLedgerService';
export class FinancialReportService {
  async generatePAndL(start: string, end: string) {
    const entries = await generalLedgerService.findAll({ filters: { entry_date: { gte: start, lte: end } } });
    return { revenue: 0, expenses: 0, net: 0, entries };
  }
  async generateBalanceSheet(date: string) {
    return { assets: 0, liabilities: 0, equity: 0, date };
  }
}
export const financialReportService = new FinancialReportService();
