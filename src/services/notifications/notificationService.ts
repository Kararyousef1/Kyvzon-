/**
 * ════════════════════════════════════════════════════════════════
 *  NotificationService - خدمة الإشعارات المركزية
 * ════════════════════════════════════════════════════════════════
 *
 *  ✅ إصلاح #1: Realtime يستمع لـ INSERT + UPDATE + DELETE
 *  ✅ إصلاح #2: Channel Manager يمنع الـ Channels المتكررة
 *  ✅ إصلاح #3: لا singleton مشترك — كل subscriber يحصل على channel مستقل
 *  ✅ دعم 90+ نوع إشعار
 *  ✅ RPC الآمن (create_notification_safe)
 *  ✅ تحويل مركزي snake_case → camelCase عبر transformServerNotification
 *
 * ════════════════════════════════════════════════════════════════
 */

import { supabase } from '../../services/supabase/supabase';
import {
  notificationGatewayService,
  type NotificationGatewayRow,
} from '../sdk/NotificationGatewayService';
import type { AppNotification, NotificationType } from '../../core/constants/notificationTypes';
import type { UserRole } from '../../shared/types/index';

// ════════════════════════════════════════════════════════════════
//  أنواع داخلية
// ════════════════════════════════════════════════════════════════

/** الشكل الخام للإشعار كما يأتي من طبقة SDK */
type RawServerNotification = NotificationGatewayRow;

export interface RealtimeNotificationEvent {
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  notification: AppNotification;
}

export type RealtimeHandler = (event: RealtimeNotificationEvent) => void;

// ════════════════════════════════════════════════════════════════
//  تحويل مركزي: snake_case → camelCase
// ════════════════════════════════════════════════════════════════

/**
 * المصدر الوحيد للتحويل من صيغة السيرفر إلى AppNotification.
 * يجب استخدامها في كل مكان — لا تحويل يدوي خارجها.
 */
export function transformServerNotification(raw: RawServerNotification): AppNotification {
  return {
    id: String(raw.id),
    userId: raw.user_id || '',
    type: raw.type as NotificationType,
    priority: (raw.priority as AppNotification['priority']) || 'normal',
    title: raw.title,
    message: raw.message,
    read: raw.is_read ?? false,
    readAt: raw.read_at,
    createdAt: raw.created_at,
    actionUrl: raw.action_url,
    groupKey: raw.group_key,
    metadata: raw.metadata ?? {},
    expiresAt: raw.expires_at,
  };
}

// ════════════════════════════════════════════════════════════════
//  Channel Manager — يمنع تعدد الـ Channels لنفس المستخدم
// ════════════════════════════════════════════════════════════════

/**
 * سجل القنوات النشطة مع عدّاد مرجعي (reference-counting).
 *
 * لماذا؟ عدة مكوّنات قد تشترك لنفس المستخدم في آنٍ واحد
 * (Header/NotificationBell + Sidebar/HybridSidebar). التصميم السابق كان
 * يزيل القناة القائمة وينشئ أخرى، ما يسبب سباقاً وخطأ:
 *   "cannot add postgres_changes callbacks ... after subscribe()".
 *
 * الحل: قناة واحدة لكل مستخدم + مجموعة handlers (fan-out). القناة تُنشأ
 * وتُشترك مرة واحدة فقط، وتُزال فقط عند انفصال آخر مشترك.
 */
interface ChannelEntry {
  channel: ReturnType<typeof supabase.channel>;
  handlers: Set<RealtimeHandler>;
}
const activeChannels = new Map<string, ChannelEntry>();

/**
 * الاشتراك في Realtime للمستخدم.
 *
 * الإصلاحات:
 * - يستمع لـ INSERT + UPDATE + DELETE (بدل INSERT فقط)
 * - يمنع فتح channel مكرر لنفس المستخدم
 * - كل unsubscribe يُنظّف نفسه بشكل مستقل
 *
 * الاستخدام الصحيح: استدعه فقط في useNotificationSubscription Hook.
 * لا تستدعيه في Header أو Sidebar أو Store.
 */
export function subscribeToRealtimeNotifications(
  userId: string,
  onEvent: RealtimeHandler
): () => void {
  if (!userId) return () => {};

  // إن وُجدت قناة نشطة لهذا المستخدم → أضِف الـ handler فقط (fan-out)
  // دون إنشاء/إعادة اشتراك قناة ثانية (يمنع الخطأ ويوفّر الاتصالات).
  const existing = activeChannels.get(userId);
  if (existing) {
    existing.handlers.add(onEvent);
    return () => {
      existing.handlers.delete(onEvent);
      // أزل القناة فقط عند انفصال آخر مشترك
      if (existing.handlers.size === 0) {
        try { supabase.removeChannel(existing.channel); } catch { /* ignore */ }
        activeChannels.delete(userId);
      }
    };
  }

  // أول مشترك لهذا المستخدم → أنشئ القناة مرة واحدة
  const handlers = new Set<RealtimeHandler>([onEvent]);
  const fanOut: RealtimeHandler = (event) => {
    handlers.forEach((h) => {
      try { h(event); } catch { /* handler واحد لا يُسقط البقية */ }
    });
  };

  // اسم قناة ثابت لتجنب تراكم القنوات
  const channelName = `notifications-${userId}`;

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        if (payload.new) {
          fanOut({
            event: 'INSERT',
            notification: transformServerNotification(
              payload.new as unknown as RawServerNotification
            ),
          });
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        if (payload.new) {
          fanOut({
            event: 'UPDATE',
            notification: transformServerNotification(
              payload.new as unknown as RawServerNotification
            ),
          });
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        if (payload.old) {
          // عند الحذف نُعيد بناء كائن AppNotification جزئي
          fanOut({
            event: 'DELETE',
            notification: {
              id: String((payload.old as { id: string }).id),
              userId,
              type: 'system',
              priority: 'normal',
              title: '',
              message: '',
              read: true,
              createdAt: new Date().toISOString(),
            } satisfies AppNotification,
          });
        }
      }
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        console.error(
          `❌ [Realtime] خطأ في channel "${channelName}" — تأكد من إضافة جدول notifications في Supabase Realtime publication`
        );
      }
    });

  const entry: ChannelEntry = { channel, handlers };
  activeChannels.set(userId, entry);

  return () => {
    handlers.delete(onEvent);
    if (handlers.size === 0) {
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
      activeChannels.delete(userId);
    }
  };
}

// ════════════════════════════════════════════════════════════════
//  دوال جلب المستخدمين (داخلية)
// ════════════════════════════════════════════════════════════════

/** جلب user_ids من خدمة SDK المتخصصة حسب الدور */
async function getUserIdsByRole(roles: UserRole[]): Promise<string[]> {
  try {
    return await notificationGatewayService.findUserIdsByRoles(roles);
  } catch (err) {
    console.error('❌ getUserIdsByRole failed:', err);
    return [];
  }
}

/** جلب user_id للمدير المباشر لموظف */
async function getManagerId(employeeIdOrUserId: string): Promise<string | null> {
  try {
    return await notificationGatewayService.findManagerUserId(employeeIdOrUserId);
  } catch (err) {
    console.error('❌ getManagerId failed:', err);
    return null;
  }
}

/** جلب جميع المشرفين (مدير مباشر + HR + Admin) */
async function getSupervisorIds(employeeIdOrUserId: string): Promise<string[]> {
  try {
    return await notificationGatewayService.findSupervisorIds(employeeIdOrUserId);
  } catch (err) {
    console.error('❌ getSupervisorIds failed:', err);
    return [];
  }
}

// ════════════════════════════════════════════════════════════════
//  أنواع الإشعارات (للإرسال)
// ════════════════════════════════════════════════════════════════

export type SystemNotificationType = NotificationType;

export interface SystemNotification {
  type: SystemNotificationType;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  title: string;
  message: string;
  actionUrl?: string;
  groupKey?: string;
  metadata?: Record<string, unknown>;
  expiresAt?: string;
}

// ════════════════════════════════════════════════════════════════
//  دوال الإرسال الرئيسية
// ════════════════════════════════════════════════════════════════

/**
 * إرسال إشعار لمستخدم واحد عبر RPC الآمن.
 * يقبل employee_id أو user_id — يحوّل تلقائياً.
 */
export async function notifyUser(
  targetUserId: string,
  notification: SystemNotification
): Promise<string | null> {
  if (!targetUserId) {
    console.warn('⚠️ notifyUser: targetUserId فارغ');
    return null;
  }

  try {
    return await notificationGatewayService.create(targetUserId, notification);
  } catch (err) {
    console.error('❌ notifyUser exception:', err);
    return null;
  }
}

/** إرسال إشعار لمجموعة من الأدوار بالتوازي */
export async function notifyRole(
  roles: UserRole[],
  notification: SystemNotification
): Promise<string[]> {
  try {
    const userIds = await getUserIdsByRole(roles);
    if (userIds.length === 0) {
      console.warn('⚠️ notifyRole: لا مستخدمين لأدوار:', roles);
      return [];
    }

    const results: string[] = [];
    await Promise.allSettled(
      userIds.map(async (userId) => {
        const id = await notifyUser(userId, notification);
        if (id) results.push(id);
      })
    );

    return results;
  } catch (err) {
    console.error('❌ notifyRole فشل:', err);
    return [];
  }
}

/** إرسال إشعار للمدير المباشر — Fallback: HR إذا لا يوجد مدير */
export async function notifyManager(
  employeeIdOrUserId: string,
  notification: SystemNotification
): Promise<string | null> {
  try {
    const managerId = await getManagerId(employeeIdOrUserId);

    if (!managerId) {
      console.warn('⚠️ لا مدير مباشر — إرسال لـ HR');
      const hrResults = await notifyRole(['hr', 'admin'], {
        ...notification,
        title: `[بدون مشرف] ${notification.title}`,
      });
      return hrResults[0] ?? null;
    }

    return await notifyUser(managerId, notification);
  } catch (err) {
    console.error('❌ notifyManager فشل:', err);
    return null;
  }
}

/** إرسال إشعار لجميع المشرفين (مدير مباشر + HR + Admin) */
export async function notifySupervisors(
  employeeIdOrUserId: string,
  notification: SystemNotification
): Promise<string[]> {
  try {
    const supervisorIds = await getSupervisorIds(employeeIdOrUserId);
    if (supervisorIds.length === 0) {
      console.warn('⚠️ notifySupervisors: لا مشرفين');
      return [];
    }

    const results: string[] = [];
    await Promise.allSettled(
      supervisorIds.map(async (supId) => {
        const id = await notifyUser(supId, notification);
        if (id) results.push(id);
      })
    );

    return results;
  } catch (err) {
    console.error('❌ notifySupervisors فشل:', err);
    return [];
  }
}

// ════════════════════════════════════════════════════════════════
//  دوال إدارة الإشعارات (CRUD)
// ════════════════════════════════════════════════════════════════

/**
 * العدد الحقيقي للإشعارات غير المقروءة — من القاعدة لا من الصفحة المحمَّلة.
 *
 * ★ قبل 0323 كان الجرس يعرض `notifications.filter(n => !n.read).length`
 *   محسوباً على أول 20 صفاً فقط (limit الافتراضي للقائمة المنسدلة).
 *   موظف عنده 60 إشعاراً غير مقروء كان يرى «20». والإشعارات المنتهية
 *   (expires_at في الماضي) كانت تُحسب أيضاً.
 *
 *   الدالة `my_unread_notification_count` تُطبّق الشرطين في القاعدة.
 */
export async function fetchUnreadCountFromServer(): Promise<number | null> {
  try {
    return await notificationGatewayService.unreadCount();
  } catch (err) {
    console.error('❌ fetchUnreadCountFromServer فشل:', err);
    // null ≠ 0 — لا نُخفي الشارة لمجرد فشل الشبكة؛ المُنادي يسقط للحساب المحلي
    return null;
  }
}

/** جلب إشعارات المستخدم من Supabase مع تحويل مركزي */
export async function fetchNotificationsFromServer(
  userId: string,
  limit = 50,
  unreadOnly = false
): Promise<AppNotification[]> {
  try {
    const notifications = await notificationGatewayService.findForUser(userId, limit, unreadOnly);
    return notifications.map(transformServerNotification);
  } catch (err) {
    console.error('❌ fetchNotificationsFromServer فشل:', err);
    return [];
  }
}

/** تحديد إشعار واحد كمقروء */
export async function markAsReadOnServer(
  userId: string,
  notificationId: string | number
): Promise<boolean> {
  try {
    await notificationGatewayService.markRead(userId, notificationId);
    return true;
  } catch (err) {
    console.error('❌ markAsReadOnServer فشل:', err);
    return false;
  }
}

/** تحديد جميع إشعارات المستخدم كمقروءة دفعةً واحدة */
export async function markAllAsReadOnServer(userId: string): Promise<number> {
  try {
    return await notificationGatewayService.markAllRead(userId);
  } catch (err) {
    console.error('❌ markAllAsReadOnServer فشل:', err);
    return 0;
  }
}

/** حذف إشعار واحد */
export async function deleteNotificationOnServer(
  userId: string,
  notificationId: string | number
): Promise<boolean> {
  try {
    await notificationGatewayService.remove(userId, notificationId);
    return true;
  } catch (err) {
    console.error('❌ deleteNotificationOnServer فشل:', err);
    return false;
  }
}

/** حذف جميع إشعارات المستخدم */
export async function deleteAllNotificationsOnServer(userId: string): Promise<number> {
  try {
    return await notificationGatewayService.removeAll(userId);
  } catch (err) {
    console.error('❌ deleteAllNotificationsOnServer فشل:', err);
    return 0;
  }
}

/** تنظيف الإشعارات المنتهية الصلاحية عبر RPC */
export async function cleanOldNotifications(_daysOld = 90): Promise<number> {
  try {
    return await notificationGatewayService.cleanupExpired();
  } catch (err) {
    console.error('❌ cleanOldNotifications فشل:', err);
    return 0;
  }
}

// ════════════════════════════════════════════════════════════════
//  دالة اختبار (للتطوير فقط)
// ════════════════════════════════════════════════════════════════

/**
 * اختبار سريع في Console:
 * import { testNotificationSystem } from './lib/notificationService';
 * testNotificationSystem('user-id-here');
 */
export async function testNotificationSystem(testUserId: string): Promise<void> {
  console.log('🧪 بدء اختبار نظام الإشعارات...');
  try {
    console.log('📝 Test 1: إرسال إشعار');
    const id = await notifyUser(testUserId, {
      type: 'system',
      priority: 'normal',
      title: '🧪 اختبار النظام',
      message: 'إذا ظهر هذا بدون تكرار، فالنظام سليم',
      groupKey: `test-${Date.now()}`,
    });
    console.log(id ? `✅ نجح (ID: ${id})` : '❌ فشل');

    console.log('📥 Test 2: جلب الإشعارات');
    const notifications = await fetchNotificationsFromServer(testUserId, 5);
    console.log(`✅ جُلب ${notifications.length} إشعار`);

    if (id) {
      console.log('👁️ Test 3: تحديد كمقروء');
      const ok = await markAsReadOnServer(testUserId, id);
      console.log(ok ? '✅ نجح' : '❌ فشل');
    }

    console.log('🎉 انتهى الاختبار');
  } catch (err) {
    console.error('❌ فشل الاختبار:', err);
  }
}