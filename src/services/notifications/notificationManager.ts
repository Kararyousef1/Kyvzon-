/**
 * ════════════════════════════════════════════════════════════════
 *  NotificationManager - مدير الإشعارات المركزي (مُصلَح بالكامل)
 * ════════════════════════════════════════════════════════════════
 * 
 *  ✅ localStorage الآن cache فقط (Supabase هو المصدر الأساسي)
 *  ✅ دعم كامل لـ Realtime
 *  ✅ لا تكرار (groupKey + deduplication ذكي)
 *  ✅ إشعار الترحيب مرة واحدة مدى الحياة
 * ════════════════════════════════════════════════════════════════
 */
import type {
  AppNotification,
  NotificationType,
  NotificationStats,
  NotificationFilter,
} from '../../core/constants/notificationTypes';
const STORAGE_PREFIX = 'hr_notifications_cache_';
const MAX_NOTIFICATIONS = 100;
const EVENT_NAME = 'hr-notifications-changed';
// ════════════════════════════════════════════════════════════════
//  مفاتيح التخزين
// ════════════════════════════════════════════════════════════════
const WELCOME_SEEN_KEY = (userId: string) => `hr_welcome_seen_${userId}`;
function getStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}
// ════════════════════════════════════════════════════════════════
//  نظام الأحداث (Events)
// ════════════════════════════════════════════════════════════════
export type NotificationEventType =
  | 'added'
  | 'updated'
  | 'deleted'
  | 'cleared'
  | 'bulk_update'
  | 'synced';
export interface NotificationEvent {
  type: NotificationEventType;
  userId: string;
  notificationId?: string;
  timestamp: number;
}
const localListeners = new Set<(event: NotificationEvent) => void>();
function emitLocal(event: NotificationEvent): void {
  localListeners.forEach((listener) => {
    try {
      listener(event);
    } catch (err) {
      console.error('Notification listener error:', err);
    }
  });
}
function emit(event: NotificationEvent): void {
  emitLocal(event);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: event }));
  }
}
export function subscribeToUserNotifications(
  userId: string,
  listener: (event: NotificationEvent) => void
): () => void {
  const wrappedListener = (event: NotificationEvent) => {
    if (event.userId === userId) listener(event);
  };
  localListeners.add(wrappedListener);
  return () => {
    localListeners.delete(wrappedListener);
  };
}
export function subscribeToAllNotifications(
  listener: (event: NotificationEvent) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const ce = e as CustomEvent<NotificationEvent>;
    if (ce.detail) listener(ce.detail);
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
// ════════════════════════════════════════════════════════════════
//  إدارة إشعار الترحيب (مرة واحدة مدى الحياة)
// ════════════════════════════════════════════════════════════════
export function hasSeenWelcome(userId: string | null | undefined): boolean {
  if (!userId) return true;
  const permanent = localStorage.getItem(WELCOME_SEEN_KEY(userId));
  return permanent === 'true';
}
export function markWelcomeSeen(userId: string | null | undefined): void {
  if (!userId) return;
  localStorage.setItem(WELCOME_SEEN_KEY(userId), 'true');
  console.log('✅ Welcome notification marked as seen permanently');
}
export function resetWelcomeSeen(userId: string): void {
  localStorage.removeItem(WELCOME_SEEN_KEY(userId));
  console.log('🔄 Welcome flag reset (dev only)');
}
// ════════════════════════════════════════════════════════════════
//  دوال localStorage (للكاش فقط)
// ════════════════════════════════════════════════════════════════
function cleanExpired(notifications: AppNotification[]): AppNotification[] {
  const now = Date.now();
  return notifications.filter((n) => {
    if (!n.expiresAt) return true;
    return new Date(n.expiresAt).getTime() > now;
  });
}
/**
 * قراءة الإشعارات من localStorage (كاش فقط)
 * ملاحظة: استخدم fetchNotificationsFromServer() للحصول على البيانات الحقيقية
 */
export function getUserNotifications(
  userId: string | null | undefined
): AppNotification[] {
  if (!userId) return [];
  try {
    const stored = localStorage.getItem(getStorageKey(userId));
    if (!stored) return [];
    const parsed = JSON.parse(stored) as AppNotification[];
    return cleanExpired(parsed);
  } catch {
    return [];
  }
}
function saveUserNotifications(
  userId: string,
  notifications: AppNotification[]
): void {
  try {
    const cleaned = cleanExpired(notifications);
    localStorage.setItem(getStorageKey(userId), JSON.stringify(cleaned));
  } catch (err) {
    console.error('Failed to cache notifications:', err);
  }
}
/**
 * إضافة إشعار محلياً (للكاش فقط)
 * 
 * ⚠️ تحذير: هذه دالة داخلية للكاش فقط
 * للإرسال الفعلي استخدم notifyUser() من notificationService
 */
export function addNotification(
  userId: string | null | undefined,
  notification: Omit<
    AppNotification,
    'id' | 'createdAt' | 'read' | 'userId'
  >,
  options?: { forceDuplicate?: boolean }
): AppNotification | null {
  if (!userId) return null;
  const existing = getUserNotifications(userId);
  // منع التكرار: عند وجود إشعار غير مقروء بنفس groupKey → لا نُضيف (نُرجع null)
  if (!options?.forceDuplicate && notification.groupKey) {
    const duplicate = existing.find(
      (n) => n.groupKey === notification.groupKey && !n.read
    );
    if (duplicate) return null;
  }
  const newNotification: AppNotification = {
    ...notification,
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
    read: false,
    userId,
  };
  const updated = [newNotification, ...existing].slice(0, MAX_NOTIFICATIONS);
  saveUserNotifications(userId, updated);
  emit({
    type: 'added',
    userId,
    notificationId: newNotification.id,
    timestamp: Date.now(),
  });
  return newNotification;
}
/**
 * تحديد إشعار كمقروء محلياً
 */
export function markAsRead(
  userId: string | null | undefined,
  notificationId: string
): boolean {
  if (!userId) return false;
  const notifications = getUserNotifications(userId);
  const index = notifications.findIndex((n) => n.id === notificationId);
  if (index === -1) return false;
  if (notifications[index].read) return true;
  notifications[index] = {
    ...notifications[index],
    read: true,
    readAt: new Date().toISOString(),
  };
  saveUserNotifications(userId, notifications);
  emit({ type: 'updated', userId, notificationId, timestamp: Date.now() });
  return true;
}
/**
 * تحديد جميع الإشعارات كمقروءة محلياً
 */
export function markAllAsRead(userId: string | null | undefined): number {
  if (!userId) return 0;
  const notifications = getUserNotifications(userId);
  const hasUnread = notifications.some((n) => !n.read);
  if (!hasUnread) return 0;
  const now = new Date().toISOString();
  const updated = notifications.map((n) =>
    n.read ? n : { ...n, read: true, readAt: now }
  );
  saveUserNotifications(userId, updated);
  emit({ type: 'bulk_update', userId, timestamp: Date.now() });
  return updated.filter((n) => n.read).length;
}
/**
 * حذف إشعار محلياً
 */
export function deleteNotification(
  userId: string | null | undefined,
  notificationId: string
): boolean {
  if (!userId) return false;
  const notifications = getUserNotifications(userId);
  const updated = notifications.filter((n) => n.id !== notificationId);
  if (updated.length === notifications.length) return false;
  saveUserNotifications(userId, updated);
  emit({ type: 'deleted', userId, notificationId, timestamp: Date.now() });
  return true;
}
/**
 * مسح جميع الإشعارات المحلية
 */
export function clearAllNotifications(
  userId: string | null | undefined
): void {
  if (!userId) return;
  localStorage.removeItem(getStorageKey(userId));
  emit({ type: 'cleared', userId, timestamp: Date.now() });
}
// ════════════════════════════════════════════════════════════════
//  دوال مساعدة (Utilities)
// ════════════════════════════════════════════════════════════════
export function filterNotifications(
  notifications: AppNotification[],
  filter: NotificationFilter
): AppNotification[] {
  switch (filter) {
    case 'all':
      return notifications;
    case 'unread':
      return notifications.filter((n) => !n.read);
    default:
      return notifications.filter((n) => n.type === filter);
  }
}
export function calculateStats(
  notifications: AppNotification[]
): NotificationStats {
  const stats: NotificationStats = {
    total: notifications.length,
    unread: 0,
    byType: {} as Record<NotificationType, number>,
  };
  notifications.forEach((n) => {
    if (!n.read) stats.unread++;
    stats.byType[n.type] = (stats.byType[n.type] || 0) + 1;
  });
  return stats;
}
export function getUnreadCount(userId: string | null | undefined): number {
  if (!userId) return 0;
  return getUserNotifications(userId).filter((n) => !n.read).length;
}
/**
 * إنشاء إشعار ترحيب (مرة واحدة مدى الحياة)
 * 
 * ⚠️ هذه الدالة للكاش المحلي فقط
 * للإرسال الفعلي: استخدم notifyUser() من notificationService
 */
export function createWelcomeNotification(
  userId: string | null | undefined
): AppNotification | null {
  if (!userId) return null;
  const welcomeKey = WELCOME_SEEN_KEY(userId);
  // التحقق من العلامة
  const alreadySeen = localStorage.getItem(welcomeKey);
  if (alreadySeen === 'true') {
    console.log(`✅ Welcome already seen by ${userId}`);
    return null;
  }
  // تخزين العلامة فوراً
  localStorage.setItem(welcomeKey, 'true');
  console.log(`🔔 Creating welcome notification for ${userId}`);
  return addNotification(userId, {
    type: 'welcome',
    priority: 'normal',
    title: '👋 مرحباً بك في Kyvzon Platform',
    message:
      'نحن سعداء بانضمامك! يمكنك الآن تصفح لوحة التحكم ومتابعة حضورك.',
    groupKey: `welcome-${userId}`,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  });
}
/**
 * مسح جميع بيانات الإشعارات (للتطوير فقط)
 */
export function clearAllNotificationData(): void {
  Object.keys(localStorage)
    .filter(
      (key) =>
        key.startsWith(STORAGE_PREFIX) ||
        key.startsWith('hr_welcome_seen_') ||
        key.startsWith('hr_notifications_')
    )
    .forEach((key) => localStorage.removeItem(key));
  emit({ type: 'cleared', userId: '*', timestamp: Date.now() });
  console.log('🧹 All notification data cleared');
}
// ════════════════════════════════════════════════════════════════
//  دوال مزامنة مع Supabase (الجديدة)
// ════════════════════════════════════════════════════════════════
/**
 * مزامنة الإشعارات من Supabase → localStorage
 * 
 * الاستخدام:
 * ```typescript
 * import { syncNotificationsFromServer } from './lib/notificationManager';
 * import { fetchNotificationsFromServer } from './lib/notificationService';
 * 
 * const serverNotifs = await fetchNotificationsFromServer(userId);
 * syncNotificationsFromServer(userId, serverNotifs);
 * ```
 */
export function syncNotificationsFromServer(
  userId: string,
  serverNotifications: any[]
): void {
  // تحويل إشعارات السيرفر إلى صيغة AppNotification
  const serverNotifs: AppNotification[] = serverNotifications.map((n) => ({
    id: n.id?.toString() || `notif_${Date.now()}`,
    userId: n.user_id || userId,
    type: n.type,
    priority: n.priority || 'normal',
    title: n.title,
    message: n.message,
    actionUrl: n.action_url,
    groupKey: n.group_key,
    metadata: n.metadata || {},
    read: n.is_read || false,
    readAt: n.read_at,
    createdAt: n.created_at,
    expiresAt: n.expires_at,
  }));
  
  // دمج مع الإشعارات المحلية الموجودة (لا تفقدها!)
  const existingLocal = getUserNotifications(userId);
  const serverIds = new Set(serverNotifs.map(n => n.id));
  const uniqueLocal = existingLocal.filter(
    n => !serverIds.has(n.id) && n.id.startsWith('notif_')
  );
  
  const merged = [...serverNotifs, ...uniqueLocal].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  
  saveUserNotifications(userId, merged);
  emit({ type: 'synced', userId, timestamp: Date.now() });
  console.log(`✅ Synced ${merged.length} notifications (${serverNotifs.length} from server, ${uniqueLocal.length} local)`);
}
/**
 * إضافة إشعار من Realtime → localStorage
 */
export function addRealtimeNotification(
  userId: string,
  serverNotification: any
): void {
  const notification: AppNotification = {
    id: serverNotification.id?.toString() || `notif_${Date.now()}`,
    userId: serverNotification.user_id || userId,
    type: serverNotification.type,
    priority: serverNotification.priority || 'normal',
    title: serverNotification.title,
    message: serverNotification.message,
    actionUrl: serverNotification.action_url,
    groupKey: serverNotification.group_key,
    metadata: serverNotification.metadata || {},
    read: false,
    createdAt: serverNotification.created_at || new Date().toISOString(),
    expiresAt: serverNotification.expires_at,
  };
  const existing = getUserNotifications(userId);
  
  // منع التكرار
  if (existing.some((n) => n.id === notification.id)) {
    console.log('⚠️ Realtime notification already exists:', notification.id);
    return;
  }
  const updated = [notification, ...existing].slice(0, MAX_NOTIFICATIONS);
  saveUserNotifications(userId, updated);
  emit({
    type: 'added',
    userId,
    notificationId: notification.id,
    timestamp: Date.now(),
  });
  console.log('🔔 Realtime notification added to cache:', notification.title);
}