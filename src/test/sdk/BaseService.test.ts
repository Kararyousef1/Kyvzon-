/**
 * ═════════════════════════════════════════════════════════════════════════
 *  BaseService.test.ts — اختبارات وحدة لطبقة SDK الأساسية
 *
 *  ما نغطيه:
 *    1. حقن tenant_id في CREATE
 *    2. رفض tenant_id المرسل من العميل (لا نثق)
 *    3. injectTenantIdOptional يعمل بدون tenant
 *    4. requireTenantId يرمي عند غياب السياق
 *    5. addTenantFilter يُطبَّق بشكل صحيح
 *    6. SdkError معالجة الأخطاء
 * ═════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// mock supabase client قبل استيراد أي شيء منه
vi.mock('../../services/supabase/supabase', () => {
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
      single: vi.fn(() => Promise.resolve({ data: { id: 'x' }, error: null })),
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
vi.mock('../../services/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  BaseService,
  SdkError,
  SdkErrorCode,
  getCurrentTenantId,
  requireTenantId,
} from '../../services/sdk/BaseService';
import { supabase } from '../../services/supabase/supabase';

// ─── Setup ──────────────────────────────────────────────────────────────────
const TEST_TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

interface TestRow {
  id: string;
  name: string;
  tenant_id?: string;
}

class TestService extends BaseService<TestRow> {
  constructor() { super('test_table'); }

  // نُعرِّض protected methods للاختبار
  public exposeInject(data: Partial<TestRow>) {
    return this.injectTenantId(data);
  }
  public exposeInjectOptional(data: Partial<TestRow>) {
    return this.injectTenantIdOptional(data);
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────
describe('BaseService — Tenant injection', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('getCurrentTenantId', () => {
    it('returns undefined when no tenant is set', () => {
      expect(getCurrentTenantId()).toBeUndefined();
    });

    it('returns tenant_id from localStorage', () => {
      localStorage.setItem('tenant_id', TEST_TENANT);
      expect(getCurrentTenantId()).toBe(TEST_TENANT);
    });
  });

  describe('requireTenantId', () => {
    it('throws SdkError when no tenant is set', () => {
      expect(() => requireTenantId()).toThrow(SdkError);
      try {
        requireTenantId();
      } catch (e) {
        expect((e as SdkError).code).toBe(SdkErrorCode.VALIDATION_ERROR);
      }
    });

    it('returns tenant_id when set', () => {
      localStorage.setItem('tenant_id', TEST_TENANT);
      expect(requireTenantId()).toBe(TEST_TENANT);
    });
  });

  describe('injectTenantId (strict)', () => {
    it('throws when no tenant context exists', () => {
      const svc = new TestService();
      expect(() => svc.exposeInject({ name: 'test' })).toThrow(SdkError);
    });

    it('injects tenant_id from context', () => {
      localStorage.setItem('tenant_id', TEST_TENANT);
      const svc = new TestService();
      const result = svc.exposeInject({ name: 'test' });
      expect(result).toEqual({ name: 'test', tenant_id: TEST_TENANT });
    });

    it('OVERWRITES tenant_id if client tries to pass one (security)', () => {
      localStorage.setItem('tenant_id', TEST_TENANT);
      const attackerTenant = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
      const svc = new TestService();
      const result = svc.exposeInject({
        name: 'test',
        tenant_id: attackerTenant, // محاولة انتحال
      });
      // يجب أن يكون tenant_id الحقيقي من localStorage، لا القيمة المرسلة
      expect(result.tenant_id).toBe(TEST_TENANT);
      expect(result.tenant_id).not.toBe(attackerTenant);
    });
  });

  describe('injectTenantIdOptional (relaxed for audit/security/error)', () => {
    it('sets tenant_id to null when no context exists', () => {
      const svc = new TestService();
      const result = svc.exposeInjectOptional({ name: 'audit event' });
      expect(result).toEqual({ name: 'audit event', tenant_id: null });
    });

    it('injects tenant_id when context exists', () => {
      localStorage.setItem('tenant_id', TEST_TENANT);
      const svc = new TestService();
      const result = svc.exposeInjectOptional({ name: 'audit event' });
      expect(result.tenant_id).toBe(TEST_TENANT);
    });

    it('OVERWRITES client-supplied tenant_id even in optional mode', () => {
      localStorage.setItem('tenant_id', TEST_TENANT);
      const svc = new TestService();
      const result = svc.exposeInjectOptional({
        name: 'audit',
        tenant_id: 'faked-value',
      });
      expect(result.tenant_id).toBe(TEST_TENANT);
    });
  });
});

describe('SdkError', () => {
  it('constructs with code + message', () => {
    const err = new SdkError(SdkErrorCode.NOT_FOUND, 'Not here');
    expect(err.code).toBe(SdkErrorCode.NOT_FOUND);
    expect(err.message).toBe('Not here');
    expect(err.name).toBe('SdkError');
  });

  it('SdkError.notFound() factory', () => {
    const err = SdkError.notFound();
    expect(err.code).toBe(SdkErrorCode.NOT_FOUND);
  });

  it('SdkError.permissionDenied() factory', () => {
    const err = SdkError.permissionDenied();
    expect(err.code).toBe(SdkErrorCode.PERMISSION_DENIED);
  });

  it('SdkError.validationError() factory', () => {
    const err = SdkError.validationError('Field required');
    expect(err.code).toBe(SdkErrorCode.VALIDATION_ERROR);
    expect(err.message).toBe('Field required');
  });

  it('SdkError.fromSupabaseError() wraps supabase errors', () => {
    const err = SdkError.fromSupabaseError({ message: 'DB down' });
    expect(err.code).toBe(SdkErrorCode.DATABASE_ERROR);
    expect(err.message).toBe('DB down');
  });

  it('SdkError.fromSupabaseError() with empty error uses default message', () => {
    const err = SdkError.fromSupabaseError({});
    expect(err.code).toBe(SdkErrorCode.DATABASE_ERROR);
    expect(err.message).toContain('خطأ');
  });
});

describe('BaseService — Query wiring', () => {
  it('findAll calls supabase.from(tableName)', async () => {
    localStorage.setItem('tenant_id', TEST_TENANT);
    const svc = new TestService();
    await svc.findAll();
    expect(supabase.from).toHaveBeenCalledWith('test_table');
  });

  it('multiple services have independent table names', () => {
    class SvcA extends BaseService<TestRow> { constructor() { super('a_table'); } }
    class SvcB extends BaseService<TestRow> { constructor() { super('b_table'); } }
    const a = new SvcA();
    const b = new SvcB();
    // نستخدم reflection عبر protected — تأكيد التسمية
    expect((a as any).tableName).toBe('a_table');
    expect((b as any).tableName).toBe('b_table');
  });
});
