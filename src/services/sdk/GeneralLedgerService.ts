/**
 * ════════════════════════════════════════════════════════════════
 *  GeneralLedgerService — الدفتر العام (Financial Portal)
 *  ════════════════════════════════════════════════════════════════
 */
import { BaseService } from './BaseService';
import type { JournalEntryRecord, JournalEntryLineRecord } from '../../shared/types/sdk';

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

  async reverseEntry(id: string, reason?: string): Promise<JournalEntryRecord> {
    const entry = await this.findById(id);
    if (!entry) throw new Error('القيد غير موجود');
    if (entry.status !== 'posted') throw new Error('يمكن عكس القيود المنشورة فقط');

    const reversedData = {
      ...entry,
      entry_number: `REV-${entry.entry_number}`,
      entry_date: new Date().toISOString().slice(0, 10),
      description: `عكس: ${entry.description || ''} — ${reason || ''}`,
      total_debit: entry.total_credit,
      total_credit: entry.total_debit,
      status: 'posted' as const,
      reference: `reversal_of_${id}`,
    };
    return this.create(reversedData);
  }
}

export const generalLedgerService = new GeneralLedgerService();
