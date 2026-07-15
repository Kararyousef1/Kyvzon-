/**
 * ════════════════════════════════════════════════════════════════
 *  MyNotificationsPage - صفحة الإشعارات الشخصية (نسخة مُصلحة)
 * ════════════════════════════════════════════════════════════════
 *
 *  🔧 الإصلاحات المُطبّقة (حسب تقرير الحالة - المرحلة 2):
 *  ─────────────────────────────────────────────────────────────────
 *  ✅ مصدر واحد للحقيقة: Supabase (عبر fetchNotificationsFromServer)
 *  ✅ localStorage أصبح كاشاً فقط (عبر syncNotificationsFromServer)
 *  ✅ لا كتابة مزدوجة: العمليات تذهب للخادم فقط، ثم تُحدّث الحالة
 *  ✅ تحديثات تفاؤلية (Optimistic UI) مع استرجاع عند الفشل
 *  ✅ معالجة أخطاء محكمة + حالات Loading/Error/Empty
 *  ✅ إصلاح أخطاء الصياغة (template literals في التنقل)
 *  ✅ Fallback آمن للأنواع غير المعروفة في TYPE_META
 *  ✅ زر تحديث يدوي (Retry/Refresh)
 *  ✅ Realtime فقط كمصدر للتحديث الفوري (إزالة الازدواجية)
 *  ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Bell, CheckCheck, Trash2, Filter, Search, X, Inbox,
  AlertCircle, CheckCircle, Info, AlertTriangle, XCircle,
  Calendar, Layers, Sparkles, Shield, Clock, UserCheck,
  Users, DoorOpen, Gift, Star, Award, CreditCard,
  Database, Bug, BookOpen, MessageSquare, Heart,
  TrendingUp, Laptop, FileText, Zap, Settings2, RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useAuthStore, useUIStore } from '../../core/stores';

// ─── Hook الموحد للإشعارات (يدير الجلب + Realtime + العمليات) ────
import { useNotificationSubscription } from '../../shared/hooks/useNotificationSubscription';

// ─── دوال مساعدة نقية (Cache Manager) ─────────────────────────────
import {
  calculateStats,
  filterNotifications,
  syncNotificationsFromServer,
} from '../../services/notifications/notificationManager';

import type { AppNotification, NotificationType, NotificationFilter } from '../../core/constants/notificationTypes';
import Card from '../../shared/components/ui/Card';
import Button from '../../shared/components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { legacyViewToPath } from '../../router/legacyRedirect';

// ════════════════════════════════════════════════════════════════
//  ثوابت الأنواع والفلاتر
// ════════════════════════════════════════════════════════════════

type TypeMeta = { label: string; color: string; icon: React.ComponentType<any>; bg: string };

// أيقونات لكل نوع إشعار
const TYPE_META: Record<string, TypeMeta> = {
  // الأنواع الأساسية
  welcome:           { label: 'ترحيب',      color: 'text-indigo-700',  icon: Sparkles,      bg: 'bg-indigo-50' },
  login:             { label: 'تسجيل دخول',  color: 'text-blue-700',    icon: CheckCircle,  bg: 'bg-blue-50' },
  logout:            { label: 'تسجيل خروج',  color: 'text-slate-700',   icon: X,            bg: 'bg-slate-50' },
  profile_update:    { label: 'ملف شخصي',   color: 'text-cyan-700',    icon: Calendar,     bg: 'bg-cyan-50' },
  permission_update: { label: 'صلاحيات',    color: 'text-amber-700',   icon: Shield,       bg: 'bg-amber-50' },
  system:            { label: 'نظام',       color: 'text-violet-700',  icon: Bell,         bg: 'bg-violet-50' },
  info:              { label: 'معلومات',    color: 'text-blue-700',    icon: Info,         bg: 'bg-blue-50' },
  success:           { label: 'نجاح',       color: 'text-emerald-700', icon: CheckCircle,  bg: 'bg-emerald-50' },
  warning:           { label: 'تحذير',      color: 'text-amber-700',   icon: AlertTriangle,bg: 'bg-amber-50' },
  error:             { label: 'خطأ',        color: 'text-red-700',     icon: XCircle,      bg: 'bg-red-50' },
  // إشعارات المشاكل
  problem_created:   { label: 'مشكلة جديدة', color: 'text-rose-700',   icon: AlertCircle,  bg: 'bg-rose-50' },
  problem_updated:   { label: 'تحديث مشكلة', color: 'text-orange-700', icon: MessageSquare,bg: 'bg-orange-50' },
  problem_comment:   { label: 'تعليق مشكلة', color: 'text-amber-700',  icon: MessageSquare,bg: 'bg-amber-50' },
  problem_resolved:  { label: 'تم حل مشكلة', color: 'text-emerald-700',icon: CheckCircle,  bg: 'bg-emerald-50' },
  problem_reopened:  { label: 'إعادة فتح',   color: 'text-rose-700',   icon: AlertCircle,  bg: 'bg-rose-50' },
  problem_overdue:   { label: 'مشكلة متأخرة',color: 'text-red-700',    icon: XCircle,      bg: 'bg-red-50' },
  // إشعارات الإجازات
  leave_requested:   { label: 'طلب إجازة',  color: 'text-blue-700',    icon: Calendar,     bg: 'bg-blue-50' },
  leave_approved:    { label: 'تمت الموافقة',color: 'text-emerald-700', icon: CheckCircle,  bg: 'bg-emerald-50' },
  leave_rejected:    { label: 'مرفوض',      color: 'text-red-700',     icon: XCircle,      bg: 'bg-red-50' },
  leave_expiring:    { label: 'إجازة تنتهي',color: 'text-amber-700',   icon: Clock,        bg: 'bg-amber-50' },
  leave_balance_low: { label: 'رصيد منخفض', color: 'text-orange-700',  icon: AlertTriangle,bg: 'bg-orange-50' },
  // التعيينات
  assigned_to_you:     { label: 'تم تعيينك',   color: 'text-indigo-700', icon: UserCheck,  bg: 'bg-indigo-50' },
  unassigned_from_you: { label: 'إلغاء تعيين', color: 'text-slate-700',  icon: X,          bg: 'bg-slate-50' },
  // SOPs
  sop_created:  { label: 'SOP جديد',     color: 'text-cyan-700',    icon: BookOpen,     bg: 'bg-cyan-50' },
  sop_approved: { label: 'SOP معتمد',    color: 'text-emerald-700', icon: CheckCircle,  bg: 'bg-emerald-50' },
  sop_assigned: { label: 'SOP مخصص لك',  color: 'text-indigo-700',  icon: BookOpen,     bg: 'bg-indigo-50' },
  sop_rejected: { label: 'SOP مرفوض',    color: 'text-red-700',     icon: XCircle,      bg: 'bg-red-50' },
  sop_expiring: { label: 'SOP ينتهي',    color: 'text-amber-700',   icon: Clock,        bg: 'bg-amber-50' },
  // التدريب
  training_completed:   { label: 'تم التدريب',   color: 'text-emerald-700', icon: Award, bg: 'bg-emerald-50' },
  training_assigned:    { label: 'تدريب جديد',   color: 'text-purple-700',  icon: Award, bg: 'bg-purple-50' },
  training_due:         { label: 'تدريب مستحق',  color: 'text-amber-700',   icon: Clock, bg: 'bg-amber-50' },
  training_overdue:     { label: 'تدريب متأخر',  color: 'text-red-700',     icon: XCircle,bg: 'bg-red-50' },
  training_cert_ready:  { label: 'شهادة جاهزة',  color: 'text-emerald-700', icon: Award, bg: 'bg-emerald-50' },
  // الاستبيانات
  survey_published:      { label: 'استبيان جديد',  color: 'text-blue-700',   icon: MessageSquare, bg: 'bg-blue-50' },
  survey_reminder:       { label: 'تذكير باستبيان',color: 'text-amber-700',  icon: Bell,          bg: 'bg-amber-50' },
  survey_deadline_soon:  { label: 'استبيان ينتهي', color: 'text-orange-700', icon: Clock,         bg: 'bg-orange-50' },
  survey_results_ready:  { label: 'نتائج استبيان', color: 'text-green-700',  icon: TrendingUp,    bg: 'bg-green-50' },
  // العافية
  wellness_update:           { label: 'تحديث عافية', color: 'text-teal-700',   icon: Heart, bg: 'bg-teal-50' },
  wellness_alert:            { label: 'تنبيه عافية', color: 'text-rose-700',   icon: Heart, bg: 'bg-rose-50' },
  wellness_improvement:      { label: 'تحسن عافية',  color: 'text-emerald-700',icon: Heart, bg: 'bg-emerald-50' },
  wellness_checkin_reminder: { label: 'تذكير عافية', color: 'text-teal-700',   icon: Bell,  bg: 'bg-teal-50' },
  // الحضور
  attendance_recorded:  { label: 'تسجيل حضور', color: 'text-blue-700',   icon: Clock,          bg: 'bg-blue-50' },
  attendance_violation: { label: 'مخالفة حضور',color: 'text-red-700',    icon: AlertTriangle,  bg: 'bg-red-50' },
  attendance_late:      { label: 'تأخير',      color: 'text-amber-700',  icon: Clock,          bg: 'bg-amber-50' },
  attendance_absent:    { label: 'غياب',       color: 'text-red-700',    icon: XCircle,        bg: 'bg-red-50' },
  attendance_overtime:  { label: 'وقت إضافي',  color: 'text-emerald-700',icon: Clock,          bg: 'bg-emerald-50' },
  // الحارس
  gatekeeper_entry:     { label: 'دخول بوابة',  color: 'text-blue-700',   icon: DoorOpen,      bg: 'bg-blue-50' },
  gatekeeper_exit:      { label: 'خروج بوابة',  color: 'text-slate-700',  icon: DoorOpen,      bg: 'bg-slate-50' },
  gatekeeper_visitor:   { label: 'زائر',         color: 'text-cyan-700',   icon: Users,         bg: 'bg-cyan-50' },
  gatekeeper_suspicious:{ label: 'نشاط مشبوه',   color: 'text-red-700',    icon: AlertTriangle, bg: 'bg-red-50' },
  // الإعلانات
  announcement_published: { label: 'إعلان',      color: 'text-indigo-700', icon: Bell,           bg: 'bg-indigo-50' },
  announcement_urgent:    { label: 'إعلان عاجل', color: 'text-red-700',    icon: AlertTriangle, bg: 'bg-red-50' },
  announcement_birthday:  { label: 'عيد ميلاد',  color: 'text-pink-700',   icon: Gift,          bg: 'bg-pink-50' },
  announcement_ramadan:   { label: 'رمضان',      color: 'text-emerald-700',icon: Star,          bg: 'bg-emerald-50' },
  announcement_holiday:   { label: 'عطلة',       color: 'text-amber-700',  icon: Sparkles,      bg: 'bg-amber-50' },
  // الكشك
  kiosk_session:        { label: 'جلسة كشك',       color: 'text-cyan-700',  icon: Laptop,         bg: 'bg-cyan-50' },
  kiosk_alert:          { label: 'تنبيه كشك',      color: 'text-amber-700', icon: AlertTriangle,  bg: 'bg-amber-50' },
  kiosk_break_reminder: { label: 'تذكير استراحة',  color: 'text-blue-700',  icon: Clock,          bg: 'bg-blue-50' },
  // الموظفين
  employee_approved:    { label: 'تم الاعتماد', color: 'text-emerald-700', icon: UserCheck,  bg: 'bg-emerald-50' },
  employee_rejected:    { label: 'مرفوض',       color: 'text-red-700',     icon: XCircle,    bg: 'bg-red-50' },
  employee_onboarding:  { label: 'موظف جديد',   color: 'text-indigo-700',  icon: Sparkles,   bg: 'bg-indigo-50' },
  employee_anniversary: { label: 'ذكرى انضمام', color: 'text-amber-700',   icon: Award,      bg: 'bg-amber-50' },
  // اجتماعات
  meeting_scheduled:    { label: 'اجتماع',       color: 'text-purple-700', icon: Calendar, bg: 'bg-purple-50' },
  meeting_reminder:     { label: 'تذكير اجتماع', color: 'text-amber-700',  icon: Bell,     bg: 'bg-amber-50' },
  meeting_cancelled:    { label: 'إلغاء اجتماع', color: 'text-red-700',    icon: XCircle,  bg: 'bg-red-50' },
  meeting_rescheduled:  { label: 'تغيير موعد',   color: 'text-orange-700', icon: Calendar, bg: 'bg-orange-50' },
  meeting_minutes_ready:{ label: 'محضر اجتماع',  color: 'text-blue-700',   icon: BookOpen, bg: 'bg-blue-50' },
  // مهام
  task_assigned:  { label: 'مهمة جديدة',  color: 'text-indigo-700', icon: CheckCircle,  bg: 'bg-indigo-50' },
  task_overdue:   { label: 'مهمة متأخرة', color: 'text-red-700',    icon: XCircle,      bg: 'bg-red-50' },
  task_completed: { label: 'مهمة منجزة',  color: 'text-emerald-700',icon: CheckCircle,  bg: 'bg-emerald-50' },
  task_reminder:  { label: 'تذكير بمهمة', color: 'text-amber-700',  icon: Bell,         bg: 'bg-amber-50' },
  // النظام
  system_maintenance:       { label: 'صيانة',           color: 'text-amber-700',  icon: Settings2,     bg: 'bg-amber-50' },
  system_update:            { label: 'تحديث',           color: 'text-blue-700',   icon: Bell,          bg: 'bg-blue-50' },
  system_security_alert:    { label: 'تنبيه أمان',      color: 'text-red-700',    icon: Shield,        bg: 'bg-red-50' },
  system_backup_completed:  { label: 'نسخة احتياطية',   color: 'text-emerald-700',icon: Database,      bg: 'bg-emerald-50' },
  system_error:             { label: 'خطأ نظام',        color: 'text-red-700',    icon: XCircle,       bg: 'bg-red-50' },
  // التقييم
  evaluation_pending:   { label: 'تقييم قيد الانتظار', color: 'text-amber-700', icon: FileText,    bg: 'bg-amber-50' },
  evaluation_completed: { label: 'تم التقييم',         color: 'text-emerald-700',icon: CheckCircle, bg: 'bg-emerald-50' },
  evaluation_reminder:  { label: 'تذكير تقييم',        color: 'text-blue-700',   icon: Bell,        bg: 'bg-blue-50' },
  // الرواتب
  salary_paid:       { label: 'صرف راتب', color: 'text-emerald-700', icon: CreditCard, bg: 'bg-emerald-50' },
  salary_slip_ready: { label: 'كعب راتب', color: 'text-blue-700',    icon: CreditCard, bg: 'bg-blue-50' },
  salary_bonus:      { label: 'مكافأة',   color: 'text-amber-700',   icon: Award,      bg: 'bg-amber-50' },
  // خاص بالمطورين
  developer_deploy_ready: { label: 'جاهز للنشر', color: 'text-cyan-700', icon: Zap,      bg: 'bg-cyan-50' },
  developer_db_backup:    { label: 'نسخة DB',    color: 'text-blue-700', icon: Database, bg: 'bg-blue-50' },
  developer_api_error:    { label: 'خطأ API',    color: 'text-red-700',  icon: Bug,      bg: 'bg-red-50' },
};

// Fallback آمن عند وصول نوع غير معروف
const DEFAULT_META: TypeMeta = TYPE_META.info ?? {
  label: 'إشعار', color: 'text-blue-700', icon: Bell, bg: 'bg-blue-50',
};

const getTypeMeta = (type: string): TypeMeta => TYPE_META[type] ?? DEFAULT_META;

const FILTER_OPTIONS: { value: NotificationFilter; label: string; icon: React.ComponentType<any> }[] = [
  { value: 'all',      label: 'الكل',        icon: Layers },
  { value: 'unread',   label: 'غير مقروء',   icon: Bell },
  { value: 'info',     label: 'معلومات',     icon: Info },
  { value: 'success',  label: 'نجاح',        icon: CheckCircle },
  { value: 'warning',  label: 'تحذير',       icon: AlertTriangle },
  { value: 'error',    label: 'خطأ',         icon: AlertCircle },
  { value: 'system',   label: 'نظام',        icon: Bell },
  { value: 'welcome',  label: 'ترحيب',       icon: Sparkles },
];

// ════════════════════════════════════════════════════════════════
//  المكون الرئيسي
// ════════════════════════════════════════════════════════════════

export default function MyNotificationsPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  // ✅ Hook الموحد يدير: الجلب + Realtime + العمليات (تفاؤلية + استرجاع)
  const {
    notifications,
    loading,
    error,
    refresh,
    markAsRead,
    markAllRead,
    deleteNotification,
    clearAll,
  } = useNotificationSubscription(user?.id, { limit: 100, realtime: true, refetchOnFocus: true });

  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // ─── مزامنة localStorage كاش (غير حرج) ─────────────────────────
  useEffect(() => {
    if (!user?.id || notifications.length === 0) return;
    try {
      syncNotificationsFromServer(user.id, notifications);
    } catch {
      /* الكاش فشل = غير حرج */
    }
  }, [user?.id, notifications]);

  // ─── العمليات (مع actionLoading) ────────────────────────────────
  const handleMarkAsRead = useCallback(async (id: string) => {
    await markAsRead(id);
  }, [markAsRead]);

  const handleMarkAllRead = useCallback(async () => {
    setActionLoading(true);
    try {
      await markAllRead();
    } finally {
      setActionLoading(false);
    }
  }, [markAllRead]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteNotification(id);
  }, [deleteNotification]);

  const handleClearAll = useCallback(async () => {
    if (notifications.length === 0) return;
    if (!confirm('هل أنت متأكد من حذف جميع الإشعارات؟ لا يمكن التراجع.')) return;
    setActionLoading(true);
    try {
      await clearAll();
    } finally {
      setActionLoading(false);
    }
  }, [notifications.length, clearAll]);

  const handleRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  // ─── التوجيه عند الضغط على الإشعار ───────────────────────────
  const handleNotificationClick = useCallback((notif: AppNotification) => {
    // تحديد كمقروء أولاً
    if (!notif.read) {
      handleMarkAsRead(notif.id);
    }

    // التوجيه (actionUrl الأولوية، ثم metadata.problemId)
    // actionUrl قد يكون path حقيقي (يبدأ بـ /) أو view id قديم
    if (notif.actionUrl) {
      const target = notif.actionUrl.startsWith('/')
        ? notif.actionUrl
        : (legacyViewToPath(notif.actionUrl) ?? '/app/my-notifications');
      navigate(target);
    } else if (notif.metadata?.problemId) {
      navigate(`/app/employee/problems/${notif.metadata.problemId}`);
    }
  }, [handleMarkAsRead, navigate]);

  // ─── المشتقات (فلاتر + بحث + إحصائيات + تجميع) ────────────────
  const displayedNotifications = useMemo(() => {
    let result = filterNotifications(notifications, filter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (n) => n.title.toLowerCase().includes(q) || n.message.toLowerCase().includes(q)
      );
    }
    return result;
  }, [notifications, filter, searchQuery]);

  const stats = useMemo(() => calculateStats(notifications), [notifications]);

  const groupedNotifications = useMemo(() => {
    const groups: Record<string, AppNotification[]> = {};
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const weekMs = 7 * 24 * 60 * 60 * 1000;

    displayedNotifications.forEach((notif) => {
      const date = new Date(notif.createdAt);
      let key: string;
      if (date.toDateString() === today.toDateString()) key = 'اليوم';
      else if (date.toDateString() === yesterday.toDateString()) key = 'أمس';
      else if (today.getTime() - date.getTime() < weekMs) key = 'هذا الأسبوع';
      else key = 'أقدم';

      (groups[key] ??= []).push(notif);
    });
    return groups;
  }, [displayedNotifications]);

  // ════════════════════════════════════════════════════════════════
  //  العرض
  // ════════════════════════════════════════════════════════════════

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Bell size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">يجب تسجيل الدخول لعرض الإشعارات</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-10 animate-fade-in" dir="rtl">
      {/* ─── الرأس + الإحصائيات ─── */}
      <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 rounded-2xl p-5 sm:p-6 text-white shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Bell size={24} />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold">إشعاراتي</h2>
              <p className="text-white/70 text-sm">جميع إشعاراتك الشخصية في مكان واحد</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={handleRefresh}
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={16} className={loading ? 'animate-spin' : ''} />}
              disabled={loading}
            >
              تحديث
            </Button>
            {stats.unread > 0 && (
              <Button
                onClick={handleMarkAllRead}
                variant="secondary"
                size="sm"
                icon={<CheckCheck size={16} className={actionLoading ? 'animate-pulse' : ''} />}
                disabled={actionLoading}
              >
                تحديد الكل كمقروء ({stats.unread})
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                onClick={handleClearAll}
                variant="danger"
                size="sm"
                icon={<Trash2 size={16} />}
                disabled={actionLoading}
              >
                حذف الكل
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          {[
            { label: 'إجمالي', value: stats.total, color: 'from-white/20 to-white/10', highlight: false },
            { label: 'غير مقروء', value: stats.unread, color: 'from-amber-400/30 to-amber-500/20', highlight: true },
            { label: 'نجاح', value: stats.byType?.success || 0, color: 'from-emerald-400/30 to-emerald-500/20', highlight: false },
            { label: 'تحذيرات', value: (stats.byType?.warning || 0) + (stats.byType?.error || 0), color: 'from-rose-400/30 to-rose-500/20', highlight: false },
          ].map((s, i) => (
            <div
              key={i}
              className={`bg-gradient-to-br ${s.color} backdrop-blur-sm rounded-xl p-3 border border-white/20 ${
                s.highlight && s.value > 0 ? 'animate-pulse' : ''
              }`}
            >
              <p className="text-white/70 text-xs font-medium">{s.label}</p>
              <p className="text-2xl font-black mt-1">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ─── شريط البحث والفلاتر ─── */}
      <Card>
        <div className="space-y-3">
          <div className="relative">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث في إشعاراتك..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-10 pl-10 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Filter size={14} className="text-slate-400" />
            <span className="text-xs text-slate-500 font-medium">تصفية:</span>
            {FILTER_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isActive = filter === opt.value;
              const count =
                opt.value === 'all'
                  ? stats.total
                  : opt.value === 'unread'
                  ? stats.unread
                  : stats.byType?.[opt.value as NotificationType] || 0;
              return (
                <button
                  key={opt.value}
                  onClick={() => setFilter(opt.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    isActive ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Icon size={12} />
                  {opt.label}
                  {count > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      isActive ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-500'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* ─── شريط الخطأ ─── */}
      {error && (
        <Card>
          <div className="flex items-center justify-between gap-3 p-2">
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => { handleRefresh(); }}
              className="text-sm text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1"
            >
              <RefreshCw size={14} /> إعادة المحاولة
            </button>
          </div>
        </Card>
      )}

      {/* ─── محتوى القائمة ─── */}
      {loading ? (
        <div className="text-center py-20">
          <div className="w-10 h-10 mx-auto border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-slate-400 mt-3 text-sm">جاري تحميل الإشعارات...</p>
        </div>
      ) : displayedNotifications.length === 0 ? (
        <Card>
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <Inbox size={36} className="text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-600 mb-2">
              {searchQuery
                ? 'لا توجد نتائج للبحث'
                : filter !== 'all'
                ? 'لا توجد إشعارات بهذا التصنيف'
                : 'لا توجد إشعارات حالياً'}
            </h3>
            <p className="text-slate-400 text-sm">
              {searchQuery ? 'جرب كلمات بحث أخرى' : 'ستظهر إشعاراتك هنا عند ورودها'}
            </p>
            {(searchQuery || filter !== 'all') && (
              <button
                onClick={() => { setSearchQuery(''); setFilter('all'); }}
                className="mt-4 text-sm text-indigo-600 hover:text-indigo-700 font-semibold"
              >
                مسح الفلاتر
              </button>
            )}
          </div>
        </Card>
      ) : (
        <div className="space-y-5">
          {Object.entries(groupedNotifications).map(([group, items]) => (
            <div key={group}>
              <div className="flex items-center gap-2 mb-3 px-2">
                <Calendar size={14} className="text-slate-400" />
                <h3 className="text-sm font-bold text-slate-600">{group}</h3>
                <span className="text-xs text-slate-400">({items.length})</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              <div className="space-y-2">
                {items.map((notif) => {
                  const meta = getTypeMeta(notif.type);
                  const Icon = meta.icon;
                  return (
                    <div
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
                      className={`group relative bg-white rounded-2xl border transition-all cursor-pointer ${
                        notif.read ? 'border-slate-100 hover:border-slate-200' : 'border-indigo-200 shadow-sm hover:shadow-md'
                      }`}
                    >
                      <div className="p-4 flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl ${meta.bg} ${meta.color} flex items-center justify-center flex-shrink-0`}>
                          <Icon size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className={`text-sm leading-tight ${notif.read ? 'text-slate-600 font-medium' : 'text-slate-800 font-bold'}`}>
                                {notif.title}
                              </h4>
                              {!notif.read && <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />}
                              <span className={`text-[10px] px-2 py-0.5 rounded-full ${meta.bg} ${meta.color} font-bold`}>
                                {meta.label}
                              </span>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(notif.id); }}
                              className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-all flex-shrink-0"
                              title="حذف"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <p className={`text-sm leading-relaxed mb-2 ${notif.read ? 'text-slate-500' : 'text-slate-700'}`}>
                            {notif.message}
                          </p>
                          <div className="flex items-center gap-3 text-[11px] text-slate-400">
                            <span className="flex items-center gap-1">
                              <Calendar size={10} />
                              {format(new Date(notif.createdAt), 'dd MMMM yyyy', { locale: ar })}
                            </span>
                            <span className="flex items-center gap-1">
                              <Bell size={10} />
                              {format(new Date(notif.createdAt), 'HH:mm', { locale: ar })}
                            </span>
                            {notif.read && notif.readAt && (
                              <span className="flex items-center gap-1 text-emerald-600">
                                <CheckCheck size={10} />
                                تم القراءة: {format(new Date(notif.readAt), 'dd MMM', { locale: ar })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
