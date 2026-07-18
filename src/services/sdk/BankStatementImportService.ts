import { BaseService } from './BaseService';
import { supabase } from '../supabase/supabase';

export interface BankAccountRecord {
  id: string;
  tenant_id: string;
  account_name: string;
  account_number: string;
  bank_name: string;
  currency: string;
  balance: number;
  is_active: boolean;
}

export interface BankStatementImportRecord {
  id: string;
  tenant_id: string;
  bank_account_id: string;
  import_date: string;
  file_path?: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_imported: number;
  total_matched: number;
  created_at: string;
}

class BankAccountService extends BaseService<BankAccountRecord> {
  constructor() { super('bank_accounts'); }
}

class BankStatementImportService extends BaseService<BankStatementImportRecord> {
  constructor() { super('bank_statement_imports'); }

  async findForAccount(bankAccountId: string): Promise<BankStatementImportRecord[]> {
    const { data, error } = await supabase.from('bank_statement_imports').select('*').eq('bank_account_id', bankAccountId).order('import_date', { ascending: false });
    if (error) throw new Error(error.message);
    return (data as any) || [];
  }

  async importStatement(data: Partial<BankStatementImportRecord>) {
    // Idempotency: check file_path hash if exists
    if (data.file_path) {
      const { data: existing } = await supabase.from('bank_statement_imports').select('id').eq('file_path', data.file_path).limit(1).maybeSingle();
      if (existing) throw new Error('هذا الملف تم استيراده مسبقاً — idempotent check');
    }
    return this.create(data as any);
  }

  async completeImport(id: string) {
    return this.update(id, { status: 'completed' } as any);
  }
}

export const bankAccountService = new BankAccountService();
export const bankStatementImportService = new BankStatementImportService();
