import { BaseService } from './BaseService';
class BankStatementImportService extends BaseService<any> {
  constructor() { super('bank_statement_imports'); }
  async importStatement(data: Partial<any>) { return this.create(data); }
  async completeImport(id: string) { return this.update(id, { status: 'completed', updated_at: new Date().toISOString() } as any); }
}
export const bankStatementImportService = new BankStatementImportService();
