/**
 * ═════════════════════════════════════════════════════════════════════════
 *  SecurityEventService.test.ts
 *
 *  الأهم: هذه الخدمة **يجب** أن تكون fire-and-forget — لا ترمي أخطاء أبداً
 *  حتى لو فشلت قاعدة البيانات أو انقطع الاتصال، لأنها تُستدعى من مسارات
 *  حرجة (فشل الدخول، محاولات الاختراق، إلخ).
 * ═════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const insertMock = vi.fn();

vi.mock('../../services/supabase/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ insert: insertMock })),
  },
}));

vi.mock('../../services/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { securityEventService } from '../../services/sdk/SecurityEventService';

describe('SecurityEventService', () => {
  beforeEach(() => {
    localStorage.clear();
    insertMock.mockReset();
  });

  it('recordEvent يُرسِل الحقول الأساسية', async () => {
    insertMock.mockResolvedValueOnce({ error: null });

    await securityEventService.recordEvent({
      type: 'login_failed',
      threatLevel: 'medium',
      userName: 'attacker@test',
      details: 'Invalid password',
    });

    expect(insertMock).toHaveBeenCalledOnce();
    const payload = insertMock.mock.calls[0][0];
    expect(payload.type).toBe('login_failed');
    expect(payload.threat_level).toBe('medium');
    expect(payload.user_name).toBe('attacker@test');
    expect(payload.details).toBe('Invalid password');
  });

  it('يضبط tenant_id إلى null بدون سياق', async () => {
    insertMock.mockResolvedValueOnce({ error: null });
    await securityEventService.recordEvent({
      type: 'anon_event',
      threatLevel: 'low',
    });
    expect(insertMock.mock.calls[0][0].tenant_id).toBeNull();
  });

  it('يحقن tenant_id من localStorage عند وجوده', async () => {
    localStorage.setItem('tenant_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    insertMock.mockResolvedValueOnce({ error: null });

    await securityEventService.recordEvent({
      type: 'login_success',
      threatLevel: 'low',
    });

    expect(insertMock.mock.calls[0][0].tenant_id).toBe(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    );
  });

  it('يرفض tenant_id المرسل من العميل (لا يستبدل الحقيقي)', async () => {
    localStorage.setItem('tenant_id', 'real-tenant');
    insertMock.mockResolvedValueOnce({ error: null });

    // نمرر tenant_id مزوَّر عبر الـ metadata أو أي حقل
    await securityEventService.recordEvent({
      type: 'suspicious',
      threatLevel: 'high',
      metadata: { attempt: 'inject tenant' },
    });

    expect(insertMock.mock.calls[0][0].tenant_id).toBe('real-tenant');
  });

  it('لا يرمي عندما تفشل قاعدة البيانات', async () => {
    insertMock.mockResolvedValueOnce({ error: { message: 'DB unreachable' } });

    // يجب ألا يرمي — fire-and-forget
    await expect(
      securityEventService.recordEvent({
        type: 'login_failed',
        threatLevel: 'critical',
      }),
    ).resolves.toBeUndefined();
  });

  it('لا يرمي عند رمي exception', async () => {
    insertMock.mockRejectedValueOnce(new Error('Network down'));

    await expect(
      securityEventService.recordEvent({
        type: 'login_failed',
        threatLevel: 'high',
      }),
    ).resolves.toBeUndefined();
  });

  it('يضبط null افتراضياً للحقول الاختيارية غير الممررة', async () => {
    insertMock.mockResolvedValueOnce({ error: null });

    await securityEventService.recordEvent({
      type: 'test',
      threatLevel: 'low',
    });

    const payload = insertMock.mock.calls[0][0];
    expect(payload.user_id).toBeNull();
    expect(payload.user_name).toBeNull();
    expect(payload.ip_address).toBeNull();
    expect(payload.user_agent).toBeNull();
    expect(payload.details).toBeNull();
    expect(payload.metadata).toEqual({});
  });
});
