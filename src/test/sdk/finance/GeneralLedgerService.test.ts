import { describe, it, expect, vi } from 'vitest';

// mock supabase client before importing GeneralLedgerService
vi.mock('../../../services/supabase/supabase', () => {
  const chainable = () => {
    const c: any = {
      select: vi.fn(() => c),
      insert: vi.fn(() => c),
      update: vi.fn(() => c),
      delete: vi.fn(() => c),
      eq: vi.fn(() => c),
      order: vi.fn(() => c),
      limit: vi.fn(() => c),
      range: vi.fn(() => c),
      single: vi.fn(() => Promise.resolve({ data: { status: 'draft' }, error: null })),
      then: (onOk: any) => onOk({ data: [], error: null }),
    };
    return c;
  };
  return {
    supabase: {
      from: vi.fn(chainable),
    },
  };
});

// mock logger
vi.mock('../../../services/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { generalLedgerService } from '../../../services/sdk/GeneralLedgerService';

const TEST_TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('GeneralLedgerService', () => {
  it('يرفض قيداً غير متوازن', async () => {
    localStorage.setItem('tenant_id', TEST_TENANT);
    await expect(generalLedgerService.createJournal({ entry_number: 'TEST-001', entry_date: '2026-01-01', total_debit: 100, total_credit: 50, status: 'draft', tenant_id: 'test' } as any)).rejects.toThrow();
  });
  it('يقبل قيداً متوازناً', async () => {
    localStorage.setItem('tenant_id', TEST_TENANT);
    const entry = await generalLedgerService.createJournal({ entry_number: 'TEST-BAL', entry_date: '2026-01-01', description: 'اختبار', total_debit: 100, total_credit: 100, status: 'draft', tenant_id: TEST_TENANT } as any);
    expect(entry.status).toBe('draft');
  });
});
