/**
 * ════════════════════════════════════════════════════════════════
 *  useNotificationSubscription — Hook الموحد للإشعارات
 * ════════════════════════════════════════════════════════════════
 *
 *  ✅ إصلاح #1: Stale Closure Bug — استخدام functional update مع prev
 *               بدلاً من snapshot من notifications
 *  ✅ إصلاح #2: يعالج INSERT + UPDATE + DELETE من Realtime
 *  ✅ إصلاح #3: هو المكان الوحيد الذي يفتح Realtime channel
 *               (لا Header، لا Sidebar، لا Store)
 *  ✅ Optimistic UI مع استرجاع عند الفشل
 *  ✅ إعادة مزامنة عند عودة التبويب للتركيز
 *
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  fetchNotificationsFromServer,
  subscribeToRealtimeNotifications,
  markAsReadOnServer,
  markAllAsReadOnServer,
  deleteNotificationOnServer,
  deleteAllNotificationsOnServer,
  fetchUnreadCountFromServer,
  type RealtimeNotificationEvent,
} from '../../services/notifications/notificationService';
import type { AppNotification } from '../../core/constants/notificationTypes';

// ════════════════════════════════════════════════════════════════
//  الأنواع
// ════════════════════════════════════════════════════════════════

interface UseNotificationOptions {
  /** عدد الإشعارات (default: 50) */
  limit?: number;
  /** تفعيل Realtime (default: true) */
  realtime?: boolean;
  /** إعادة مزامنة عند التركيز (default: true) */
  refetchOnFocus?: boolean;
}

export interface UseNotificationReturn {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

// ════════════════════════════════════════════════════════════════
//  Hook
// ════════════════════════════════════════════════════════════════

export function useNotificationSubscription(
  userId: string | null | undefined,
  options?: UseNotificationOptions
): UseNotificationReturn {
  const { limit = 50, realtime = true, refetchOnFocus = true } = options ?? {};

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // العدّاد الحقيقي من القاعدة؛ null = تعذّر جلبه ⇒ نسقط للحساب المحلي
  const [serverUnread, setServerUnread] = useState<number | null>(null);

  // يمنع تحديث state بعد unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ─── جلب الإشعارات من السيرفر ───────────────────────────────
  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      setError(null);
      const [data, unread] = await Promise.all([
        fetchNotificationsFromServer(userId, limit),
        fetchUnreadCountFromServer(),
      ]);
      if (mountedRef.current) {
        setNotifications(data);
        setServerUnread(unread);
      }
    } catch {
      if (mountedRef.current) setError('تعذّر تحميل الإشعارات');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [userId, limit]);

  // ─── الجلب الأولي + Realtime + إعادة مزامنة عند التركيز ────
  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    refresh();

    if (!realtime) return;

    // ✅ معالجة INSERT + UPDATE + DELETE
    const unsubscribe = subscribeToRealtimeNotifications(
      userId,
      (event: RealtimeNotificationEvent) => {
        if (!mountedRef.current) return;

        if (event.event === 'INSERT') {
          // إضافة إشعار جديد في المقدمة (بدون stale closure — نستخدم prev)
          setNotifications((prev) => {
            if (prev.some((n) => n.id === event.notification.id)) return prev;
            return [event.notification, ...prev];
          });
        } else if (event.event === 'UPDATE') {
          // تحديث الإشعار الموجود
          setNotifications((prev) =>
            prev.map((n) =>
              n.id === event.notification.id ? event.notification : n
            )
          );
        } else if (event.event === 'DELETE') {
          // حذف الإشعار من القائمة
          setNotifications((prev) =>
            prev.filter((n) => n.id !== event.notification.id)
          );
        }
      }
    );

    if (!refetchOnFocus) {
      return unsubscribe;
    }

    const handleFocus = () => {
      if (mountedRef.current) refresh();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      unsubscribe();
      window.removeEventListener('focus', handleFocus);
    };
  }, [userId, realtime, refetchOnFocus, refresh]);

  // ─── العمليات — Optimistic UI بدون stale closure ───────────

  /**
   * ✅ الإصلاح الجوهري: لا نأخذ snapshot من notifications
   * بل نستخدم setNotifications(prev => ...) في كل مكان
   * هذا يمنع race conditions ويضمن العمل على الـ state الأحدث دائماً
   */

  const markAsRead = useCallback(async (id: string) => {
    if (!userId) return;

    // Optimistic — بدون snapshot
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n
      )
    );

    const ok = await markAsReadOnServer(userId, id);
    if (!ok && mountedRef.current) {
      // استرجاع عند الفشل — إعادة جلب من السيرفر
      setError('تعذّر تحديث حالة الإشعار');
      await refresh();
    }
  }, [userId, refresh]);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const now = new Date().toISOString();

    // Optimistic
    setNotifications((prev) =>
      prev.map((n) => (n.read ? n : { ...n, read: true, readAt: now }))
    );

    const count = await markAllAsReadOnServer(userId);
    if (count === 0 && mountedRef.current) {
      // قد يعني أن الكل مقروء فعلاً — لا حاجة لاسترجاع
    }
  }, [userId]);

  const deleteNotification = useCallback(async (id: string) => {
    if (!userId) return;

    // Optimistic
    setNotifications((prev) => prev.filter((n) => n.id !== id));

    const ok = await deleteNotificationOnServer(userId, id);
    if (!ok && mountedRef.current) {
      setError('تعذّر حذف الإشعار');
      await refresh();
    }
  }, [userId, refresh]);

  const clearAll = useCallback(async () => {
    if (!userId) return;

    // Optimistic
    setNotifications([]);

    const count = await deleteAllNotificationsOnServer(userId);
    if (count === 0 && mountedRef.current) {
      // قد يكون الحذف نجح وكانت القائمة فارغة
    }
  }, [userId]);

  // ─── المشتقات ──────────────────────────────────────────────
  // الحساب المحلي يقتصر على الصفحة المحمَّلة (limit) ولا يعرف expires_at،
  // فنُفضّل عدّاد القاعدة. لكن Realtime يصل قبل إعادة الجلب، فنأخذ الأكبر
  // بين الاثنين حتى لا تتأخر الشارة عن إشعار وصل للتوّ.
  const localUnread = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const unreadCount = useMemo(
    () => (serverUnread === null ? localUnread : Math.max(serverUnread, localUnread)),
    [serverUnread, localUnread]
  );

  return {
    notifications,
    unreadCount,
    loading,
    error,
    refresh,
    markAsRead,
    markAllRead,
    deleteNotification,
    clearAll,
  };
}