/**
 * ════════════════════════════════════════════════════════════════
 *  NotificationBell - جرس الإشعارات (نسخة مُصلحة بالكامل)
 * ════════════════════════════════════════════════════════════════
 *
 *  🔧 الإصلاحات:
 *  ✅ يستخدم useNotificationSubscription Hook الموحد (لا تكرار منطق)
 *  ✅ البيانات من Realtime محوّلة عبر transformServerNotification
 *  ✅ لا حاجة لإدارة state يدوياً أو Realtime منفصل
 *  ✅ إدارة أخطاء موحدة + استرجاع عند الفشل
 *  ✅ إغلاق القائمة عند النقر خارجها
 *  ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, CheckCheck, Trash2, ChevronLeft, RefreshCw, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useUIStore, useAuthStore } from '../../../core/stores';
import { useNotificationSubscription } from '../../hooks/useNotificationSubscription';

import type { AppNotification } from '../../../core/constants/notificationTypes';
import { useNavigate } from 'react-router-dom';
import { legacyViewToPath } from '../../../router/legacyRedirect';

// ════════════════════════════════════════════════════════════════
//  الأنواع والثوابت
// ════════════════════════════════════════════════════════════════

interface NotificationBellProps {
  userId?: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  showBadge?: boolean;
  maxDisplay?: number;
}

const PRIORITY_LABELS: Record<string, { label: string; cls: string }> = {
  urgent: { label: 'عاجل',  cls: 'bg-red-100 text-red-600' },
  high:   { label: 'مهم',   cls: 'bg-orange-100 text-orange-600' },
  low:    { label: 'منخفض', cls: 'bg-blue-100 text-blue-600' },
};

// ════════════════════════════════════════════════════════════════
//  المكون
// ════════════════════════════════════════════════════════════════

export default function NotificationBell({
  userId: propUserId,
  size = 'md',
  showBadge = true,
  maxDisplay = 5,
}: NotificationBellProps) {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ✅ استخدام userId من props أو user الحالي
  const currentUserId = propUserId || user?.id;

  // ✅ Hook الموحد يدير: الجلب + Realtime + العمليات
  const {
    notifications,
    unreadCount,
    loading,
    error,
    refresh,
    markAsRead,
    markAllRead,
    deleteNotification,
  } = useNotificationSubscription(currentUserId, { limit: 20, realtime: true });

  // ─── إغلاق القائمة عند النقر خارجها ───────────────────────────
  useEffect(() => {
    if (!open) return;

    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  // ─── العمليات ──────────────────────────────────────────────────

  const handleNotificationClick = useCallback(
    async (notif: AppNotification) => {
      if (!currentUserId) return;

      // notif.actionUrl قد يكون:
      //  - path حقيقي يبدأ بـ / → نستخدمه كما هو
      //  - view id قديم (e.g. 'hr-attendance') → نحوّله عبر legacyViewToPath
      //  - undefined → نذهب لصفحة الإشعارات
      const raw = notif.actionUrl;
      let target = '/app/my-notifications';
      if (raw) {
        if (raw.startsWith('/')) target = raw;
        else target = legacyViewToPath(raw) ?? '/app/my-notifications';
      }

      // تحديد كمقروء (Hook يتعامل مع التفاؤلية)
      if (!notif.read) {
        await markAsRead(notif.id);
      }

      setOpen(false);
      navigate(target);
    },
    [currentUserId, markAsRead, navigate]
  );

  const handleMarkAllRead = useCallback(async () => {
    if (unreadCount === 0) return;
    setActionLoading(true);
    try {
      await markAllRead();
    } finally {
      setActionLoading(false);
    }
  }, [unreadCount, markAllRead]);

  const handleDelete = useCallback(
    async (e: React.MouseEvent, notifId: string) => {
      e.stopPropagation();
      await deleteNotification(notifId);
    },
    [deleteNotification]
  );

  const handleRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const goToNotificationsPage = useCallback(() => {
    setOpen(false);
    navigate('/app/my-notifications');
  }, [navigate]);

  // ─── المتغيرات المشتقة ────────────────────────────────────────
  const displayedNotifications = notifications.slice(0, maxDisplay);
  const iconSize = size === 'sm' ? 16 : size === 'md' ? 18 : 20;
  const bellTitle = unreadCount > 0 ? `الإشعارات (${unreadCount} غير مقروء)` : 'الإشعارات';

  // ─── التحقق من المتطلبات ───────────────────────────────────────
  if (!currentUserId) {
    return null;
  }

  // ════════════════════════════════════════════════════════════════
  //  العرض
  // ════════════════════════════════════════════════════════════════

  return (
    <div className="relative" ref={dropdownRef}>
      {/* زر الجرس */}
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={loading}
        aria-label={bellTitle}
        title={bellTitle}
        className={`relative p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors ${
          loading ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        {loading ? (
          <RefreshCw size={iconSize} className="animate-spin" />
        ) : (
          <Bell size={iconSize} />
        )}

        {/* عداد الإشعارات غير المقروءة */}
        {showBadge && unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 border-2 border-white shadow-sm animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* القائمة المنسدلة */}
      {open && (
        <div className="absolute left-0 top-12 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50 animate-in slide-in-from-top-5 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-slate-500" />
              <span className="font-bold text-slate-800 text-sm">الإشعارات</span>
              {unreadCount > 0 && (
                <span className="text-xs bg-red-100 text-red-600 font-bold px-2 py-0.5 rounded-full">
                  {unreadCount} جديد
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {/* زر التحديث */}
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="text-xs text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100 transition-colors disabled:opacity-50"
                title="إعادة تحميل"
              >
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              </button>

              {/* تحديد الكل كمقروء */}
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  disabled={actionLoading}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-50"
                >
                  <CheckCheck size={12} />
                  تحديد الكل
                </button>
              )}
            </div>
          </div>

          {/* شريط الخطأ */}
          {error && (
            <div className="flex items-center justify-between gap-2 px-4 py-2 bg-red-50 border-b border-red-100">
              <div className="flex items-center gap-1.5 text-red-600 text-xs">
                <AlertCircle size={12} className="flex-shrink-0" />
                <span>{error}</span>
              </div>
              <button
                onClick={() => { refresh(); }}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold"
              >
                إعادة
              </button>
            </div>
          )}

          {/* قائمة الإشعارات */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
            {displayedNotifications.length === 0 ? (
              <div className="text-center py-10 px-4">
                <Bell size={32} className="mx-auto text-slate-200 mb-2" />
                <p className="text-sm text-slate-400 font-medium">
                  {loading ? 'جاري التحميل...' : 'لا توجد إشعارات'}
                </p>
              </div>
            ) : (
              displayedNotifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`p-3 cursor-pointer hover:bg-slate-50 transition-colors group relative ${
                    !notif.read ? 'bg-indigo-50/30 border-r-2 border-indigo-400' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* نقطة الحالة */}
                    <div
                      className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${
                        notif.read ? 'bg-slate-300' : 'bg-indigo-500 animate-pulse'
                      }`}
                    />

                    {/* محتوى الإشعار */}
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm leading-tight ${
                          notif.read ? 'text-slate-600 font-medium' : 'text-slate-800 font-bold'
                        }`}
                      >
                        {notif.title}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                        {notif.message}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-2">
                        <span>
                          {format(new Date(notif.createdAt), 'dd MMM، HH:mm', { locale: ar })}
                        </span>
                        {notif.priority && PRIORITY_LABELS[notif.priority] && (
                          <span className={`px-1 py-0.5 rounded text-[8px] font-bold uppercase ${PRIORITY_LABELS[notif.priority].cls}`}>
                            {PRIORITY_LABELS[notif.priority].label}
                          </span>
                        )}
                      </p>
                    </div>

                    {/* زر الحذف */}
                    <button
                      onClick={(e) => handleDelete(e, notif.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all flex-shrink-0 p-1 hover:bg-red-50 rounded"
                      title="حذف الإشعار"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {displayedNotifications.length > 0 && (
            <div className="p-3 border-t border-slate-100 bg-slate-50">
              <button
                onClick={goToNotificationsPage}
                className="w-full text-center text-xs text-indigo-600 hover:text-indigo-700 font-bold py-2 flex items-center justify-center gap-1 hover:bg-indigo-50 rounded-lg transition-colors"
              >
                عرض كل الإشعارات
                {notifications.length > maxDisplay && (
                  <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded text-[10px]">
                    +{notifications.length - maxDisplay}
                  </span>
                )}
                <ChevronLeft size={14} className="rotate-180" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
