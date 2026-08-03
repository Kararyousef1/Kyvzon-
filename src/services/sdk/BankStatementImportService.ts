import { BaseService } from './BaseService';
import { supabase } from '../supabase/supabase';

export interface BankAccountRecord { id:string; tenant_id:string; legal_entity_id:string; account_name:string; account_number:string; bank_name:string; currency:string; balance:number; opening_balance?:number; account_type?:'bank'|'cash'|'wallet'; is_active:boolean; }
export interface BankAccountBoardRecord extends BankAccountRecord { entity_code?:string; entity_name?:string; import_count:number; reconciliation_count:number; }
export interface BankStatementLineInput { transaction_date:string; description?:string; amount:number; external_reference?:string; }
export interface BankStatementImportRecord { id:string; tenant_id:string; legal_entity_id:string; bank_account_id:string; import_date:string; file_path?:string|null; source_name?:string|null; status:'pending'|'processing'|'completed'|'failed'; total_imported:number; total_matched:number; created_at:string; }
export interface BankStatementLineRecord { id:string; import_id:string; tenant_id:string; legal_entity_id:string; bank_account_id:string; transaction_date:string; description?:string|null; amount:number; external_reference?:string|null; matched:boolean; matched_to_journal?:string|null; entry_number?:string|null; match_reason?:string|null; }
export interface BankReconciliationRecord { id:string; tenant_id:string; legal_entity_id:string; bank_account_id:string; reconciliation_date:string; period_start?:string|null; period_end?:string|null; statement_balance:number; book_balance:number; adjusted_balance:number; difference:number; status:'draft'|'pending'|'completed'|'voided'; notes?:string|null; }
export interface CashBankDashboardRecord { tenant_id:string; legal_entity_id:string; entity_code:string; entity_name:string; active_bank_accounts:number; total_cash_balance:number; pending_imports:number; unmatched_statement_lines:number; open_reconciliations:number; }

class BankAccountService extends BaseService<BankAccountRecord> {
  constructor(){ super('bank_accounts'); }
  async findBoard(legalEntityId?: string): Promise<BankAccountBoardRecord[]> { let q=supabase.from('finance_bank_account_board').select('*').order('bank_name'); if(legalEntityId) q=q.eq('legal_entity_id',legalEntityId); const {data,error}=await q; if(error) throw new Error(error.message); return (data||[]) as BankAccountBoardRecord[]; }
  async upsert(input:{legalEntityId:string; accountName:string; accountNumber:string; bankName:string; currency?:string; accountType?:string; openingBalance?:number}): Promise<BankAccountRecord>{ const {data,error}=await supabase.rpc('upsert_finance_bank_account',{p_legal_entity_id:input.legalEntityId,p_account_name:input.accountName,p_account_number:input.accountNumber,p_bank_name:input.bankName,p_currency:input.currency||'IQD',p_account_type:input.accountType||'bank',p_opening_balance:input.openingBalance||0}); if(error) throw new Error(error.message); return data as BankAccountRecord; }
  async updateStatus(id:string,isActive:boolean,reason:string): Promise<BankAccountRecord>{ const {data,error}=await supabase.rpc('update_finance_bank_account_status',{p_bank_account_id:id,p_is_active:isActive,p_reason:reason}); if(error) throw new Error(error.message); return data as BankAccountRecord; }
}

class BankStatementImportService extends BaseService<BankStatementImportRecord> {
  constructor(){ super('bank_statement_imports'); }
  async findForAccount(bankAccountId:string): Promise<BankStatementImportRecord[]> { const {data,error}=await supabase.from('finance_bank_statement_import_board').select('*').eq('bank_account_id',bankAccountId).order('import_date',{ascending:false}); if(error) throw new Error(error.message); return (data||[]) as BankStatementImportRecord[]; }
  async findLines(importId:string): Promise<BankStatementLineRecord[]> { const {data,error}=await supabase.from('finance_bank_statement_line_board').select('*').eq('import_id',importId).order('transaction_date',{ascending:false}); if(error) throw new Error(error.message); return (data||[]) as BankStatementLineRecord[]; }
  async importStatement(input:{bankAccountId:string; filePath:string; importDate:string; sourceName?:string; lines:BankStatementLineInput[]}): Promise<BankStatementImportRecord>{ const {data,error}=await supabase.rpc('create_bank_statement_import_with_lines',{p_bank_account_id:input.bankAccountId,p_file_path:input.filePath,p_import_date:input.importDate,p_source_name:input.sourceName||null,p_lines:input.lines}); if(error) throw new Error(error.message); return data as BankStatementImportRecord; }
  async matchLine(lineId:string,journalEntryId:string,reason:string): Promise<BankStatementLineRecord>{ const {data,error}=await supabase.rpc('match_bank_statement_line',{p_statement_line_id:lineId,p_journal_entry_id:journalEntryId,p_reason:reason}); if(error) throw new Error(error.message); return data as BankStatementLineRecord; }
}

class BankReconciliationService extends BaseService<BankReconciliationRecord> {
  constructor(){ super('bank_reconciliations'); }
  async findForAccount(bankAccountId:string): Promise<BankReconciliationRecord[]> { const {data,error}=await supabase.from('finance_bank_reconciliation_board').select('*').eq('bank_account_id',bankAccountId).order('reconciliation_date',{ascending:false}); if(error) throw new Error(error.message); return (data||[]) as BankReconciliationRecord[]; }
  async create(input:{bankAccountId:string; reconciliationDate:string; statementBalance:number; bookBalance:number; periodStart?:string; periodEnd?:string; notes?:string}): Promise<BankReconciliationRecord>{ const {data,error}=await supabase.rpc('create_bank_reconciliation_controlled',{p_bank_account_id:input.bankAccountId,p_reconciliation_date:input.reconciliationDate,p_statement_balance:input.statementBalance,p_book_balance:input.bookBalance,p_period_start:input.periodStart||null,p_period_end:input.periodEnd||null,p_notes:input.notes||null}); if(error) throw new Error(error.message); return data as BankReconciliationRecord; }
  async complete(id:string,reason:string): Promise<BankReconciliationRecord>{ const {data,error}=await supabase.rpc('complete_bank_reconciliation',{p_reconciliation_id:id,p_reason:reason}); if(error) throw new Error(error.message); return data as BankReconciliationRecord; }
  async void(id:string,reason:string): Promise<BankReconciliationRecord>{ const {data,error}=await supabase.rpc('void_bank_reconciliation',{p_reconciliation_id:id,p_reason:reason}); if(error) throw new Error(error.message); return data as BankReconciliationRecord; }
}

export const cashBankDashboardService={ async find(legalEntityId?:string): Promise<CashBankDashboardRecord[]> { let q=supabase.from('finance_cash_bank_dashboard').select('*').order('entity_code'); if(legalEntityId) q=q.eq('legal_entity_id',legalEntityId); const {data,error}=await q; if(error) throw new Error(error.message); return (data||[]) as CashBankDashboardRecord[]; } };
export const bankAccountService=new BankAccountService();
export const bankStatementImportService=new BankStatementImportService();
export const bankReconciliationService=new BankReconciliationService();
