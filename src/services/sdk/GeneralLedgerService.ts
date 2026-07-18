/**
 * ════════════════════════════════════════════════════════════════
 *  GeneralLedgerService — الدفتر العام (Financial Portal)
 *  ════════════════════════════════════════════════════════════════
 */
import { BaseService } from './BaseService';
import { supabase } from '../supabase/supabase';
import type { JournalEntryRecord, JournalEntryLineRecord } from '../../shared/types/sdk';

export interface JournalDraftLineInput {
  account_id: string;
  debit_amount: number;
  credit_amount: number;
  description?: string;
  cost_center_id?: string;
  project_id?: string;
}

export interface CreateJournalDraftInput {
  legal_entity_id: string;
  accounting_period_id: string;
  entry_date: string;
  description: string;
  reference?: string;
  transaction_currency_code: string;
  exchange_rate?: number;
  idempotency_key?: string;
  lines: JournalDraftLineInput[];
}

class GeneralLedgerService extends BaseService<JournalEntryRecord> {
  constructor() { super('journal_entries'); }

  async createJournal(data: Partial<JournalEntryRecord>): Promise<JournalEntryRecord> {
    if (Number(data.total_debit || 0) !== Number(data.total_credit || 0)) {
      throw new Error('القيد غير متوازن: المدين يجب أن يساوي الدائن');
    }
    return this.create(data as Partial<JournalEntryRecord>);
  }

  async findByTenant(tenantId: string): Promise<JournalEntryRecord[]> {
    return this.findAll({ filters: { tenant_id: tenantId }, orderBy: 'entry_date', ascending: false });
  }

  async findByStatus(status: string): Promise<JournalEntryRecord[]> {
    return this.findAll({ filters: { status: status as any }, orderBy: 'entry_date', ascending: false });
  }

  /** Creates entry header and all lines in one database transaction. */
  async createDraft(input: CreateJournalDraftInput): Promise<JournalEntryRecord> {
    const { data, error } = await supabase.rpc('create_journal_draft', {
      p_legal_entity_id: input.legal_entity_id,
      p_accounting_period_id: input.accounting_period_id,
      p_entry_date: input.entry_date,
      p_description: input.description,
      p_reference: input.reference || '',
      p_transaction_currency_code: input.transaction_currency_code,
      p_exchange_rate: input.exchange_rate ?? 1,
      p_lines: input.lines,
      p_idempotency_key: input.idempotency_key || null,
    });
    if (error) throw new Error(error.message);
    return data as JournalEntryRecord;
  }

  /** Posts an already-created draft through the database transaction. The RPC
   * validates period, entity membership, posting accounts and debit/credit balance. */
  async postJournalEntry(entryId: string): Promise<JournalEntryRecord> {
    const { data, error } = await supabase.rpc('post_journal_entry', { p_entry_id: entryId });
    if (error) throw new Error(error.message);
    return data as JournalEntryRecord;
  }

  /** Creates a separate opposite entry and marks the original as reversed. */
  async reverseEntry(input: {
    entryId: string;
    accountingPeriodId: string;
    reversalDate: string;
    reason: string;
    idempotencyKey?: string;
  }): Promise<JournalEntryRecord> {
    const { data, error } = await supabase.rpc('reverse_journal_entry', {
      p_entry_id: input.entryId,
      p_accounting_period_id: input.accountingPeriodId,
      p_reversal_date: input.reversalDate,
      p_reason: input.reason,
      p_idempotency_key: input.idempotencyKey || null,
    });
    if (error) throw new Error(error.message);
    return data as JournalEntryRecord;
  }
}

export const generalLedgerService = new GeneralLedgerService();
