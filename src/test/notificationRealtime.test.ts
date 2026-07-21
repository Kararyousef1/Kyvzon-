/**
 * ═════════════════════════════════════════════════════════════════════════
 *  notificationRealtime.test.ts — اختبار العدّاد المرجعي لقناة Realtime
 *
 *  يحرس ضد الخطأ:
 *   "cannot add postgres_changes callbacks ... after subscribe()"
 *  الذي يحدث عند اشتراك مكوّنين لنفس المستخدم (Header + Sidebar/HybridSidebar).
 *
 *  السلوك المطلوب:
 *   - مشتركان لنفس userId → قناة واحدة فقط (channel() تُستدعى مرة).
 *   - القناة تُزال فقط عند انفصال آخر مشترك.
 *   - كل المشتركين يستقبلون الأحداث (fan-out).
 * ═════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// نلتقط أي دالة onEvent تُمرّر لـ .on() لنحاكي حدثاً لاحقاً
let channelOnHandlers: Array<(payload: unknown) => void> = [];
let channelCreateCount = 0;
let removeChannelCount = 0;

vi.mock('../services/supabase/supabase', () => {
  const makeChannel = () => {
    const chan: any = {
      on: (_evt: string, _cfg: unknown, cb: (p: unknown) => void) => {
        channelOnHandlers.push(cb);
        return chan;
      },
      subscribe: () => chan,
    };
    return chan;
  };
  return {
    supabase: {
      channel: () => { channelCreateCount++; return makeChannel(); },
      removeChannel: () => { removeChannelCount++; },
    },
  };
});

import { subscribeToRealtimeNotifications } from '../services/notifications/notificationService';

describe('subscribeToRealtimeNotifications — ref counting', () => {
  beforeEach(() => {
    channelOnHandlers = [];
    channelCreateCount = 0;
    removeChannelCount = 0;
  });

  it('مشتركان لنفس المستخدم → قناة واحدة فقط', () => {
    const u = 'user-1';
    const un1 = subscribeToRealtimeNotifications(u, vi.fn());
    const un2 = subscribeToRealtimeNotifications(u, vi.fn());
    expect(channelCreateCount).toBe(1); // لم تُنشأ قناة ثانية
    un1(); un2();
  });

  it('القناة تُزال فقط عند انفصال آخر مشترك', () => {
    const u = 'user-2';
    const un1 = subscribeToRealtimeNotifications(u, vi.fn());
    const un2 = subscribeToRealtimeNotifications(u, vi.fn());

    un1();
    expect(removeChannelCount).toBe(0); // لا يزال مشترك واحد

    un2();
    expect(removeChannelCount).toBe(1); // الآن أُزيلت
  });

  it('كل المشتركين يستقبلون الحدث (fan-out)', () => {
    const u = 'user-3';
    const h1 = vi.fn();
    const h2 = vi.fn();
    subscribeToRealtimeNotifications(u, h1);
    subscribeToRealtimeNotifications(u, h2);

    // نحاكي حدث INSERT عبر أول handler مُسجّل في .on()
    expect(channelOnHandlers.length).toBeGreaterThan(0);
    channelOnHandlers[0]({
      new: { id: 'n1', user_id: u, title: 't', message: 'm', type: 'system', created_at: new Date().toISOString() },
    });

    expect(h1).toHaveBeenCalled();
    expect(h2).toHaveBeenCalled();
  });

  it('userId فارغ → لا اشتراك', () => {
    const un = subscribeToRealtimeNotifications('', vi.fn());
    expect(channelCreateCount).toBe(0);
    un();
  });
});
