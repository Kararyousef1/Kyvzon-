import { BaseService } from './BaseService';
import { supabase } from '../supabase/supabase';

export interface TaxCodeRecord {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  rate: number;
  is_active: boolean;
  created_at: string;
}

class TaxService extends BaseService<TaxCodeRecord> {
  constructor() { super('tax_codes'); }

  async findActive(): Promise<TaxCodeRecord[]> {
    const { data, error } = await supabase.from('tax_codes').select('*').eq('is_active', true).order('code');
    if (error) throw new Error(error.message);
    return (data as TaxCodeRecord[]) || [];
  }

  async createWithValidation(input: Partial<TaxCodeRecord>): Promise<TaxCodeRecord> {
    if (!input.code || !input.name) throw new Error('الكود والاسم مطلوبان');
    if (Number(input.rate) < 0 || Number(input.rate) > 1) throw new Error('النسبة يجب أن تكون بين 0 و 1 (مثال 0.15 = 15%)');
    return this.create(input as any);
  }
}

export const taxService = new TaxService();
