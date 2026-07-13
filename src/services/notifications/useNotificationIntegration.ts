/**
 * ════════════════════════════════════════════════════════════════
 *  useNotificationIntegration - Hook مركزي لربط الإشعارات بكل الصفحات
 * ════════════════════════════════════════════════════════════════
 *  هذا الـ Hook يوفر دوال جاهزة يمكن استدعاؤها من أي صفحة
 *  لإرسال الإشعارات المناسبة تلقائياً
 * ════════════════════════════════════════════════════════════════
 */

import { useCallback } from 'react';
import { useAuthStore } from '../../core/stores';
import { addNotification } from './notificationManager';
import {
  notifySOPCreated,
  notifySOPApproved,
  notifySOPAssigned,
  notifyTrainingCompleted,
  notifyTrainingAssigned,
  notifyTrainingDue,
  notifySurveyPublished,
  notifySurveyReminder,
  notifyWellnessUpdate,
  notifyWellnessAlert,
  notifyAttendanceRecorded,
  notifyAttendanceViolation,
  notifyGatekeeperEntry,
  notifyAnnouncementPublished,
  notifyProfileUpdated,
  notifyPermissionChanged,
  notifyEmployeeApproved,
  notifyEmployeeRejected,
  notifyMeetingScheduled,
  notifyMeetingReminder,
  addLocalNotification,
} from './notificationHelpers';

export {
  addLocalNotification,
  notifySOPCreated,
  notifySOPApproved,
  notifySOPAssigned,
  notifyTrainingCompleted,
  notifyTrainingAssigned,
  notifyTrainingDue,
  notifySurveyPublished,
  notifySurveyReminder,
  notifyWellnessUpdate,
  notifyWellnessAlert,
  notifyAttendanceRecorded,
  notifyAttendanceViolation,
  notifyGatekeeperEntry,
  notifyAnnouncementPublished,
  notifyProfileUpdated,
  notifyPermissionChanged,
  notifyEmployeeApproved,
  notifyEmployeeRejected,
  notifyMeetingScheduled,
  notifyMeetingReminder,
};

/**
 * هوك مخصص يضيف دوال الإشعارات مع ربط المستخدم تلقائياً
 */
export function useNotifications() {
  const user = useAuthStore((state) => state.user);

  /** إضافة إشعار محلي سريع (بدون API) */
  const sendLocal = useCallback(
    (
      type: import('../../core/constants/notificationTypes').NotificationType,
      title: string,
      message: string,
      actionUrl?: string,
      groupKey?: string
    ) => {
      return addNotification(user?.id, {
        type,
        priority: 'normal',
        title,
        message,
        actionUrl,
        groupKey,
      });
    },
    [user?.id]
  );

  /** إشعار ترحيبي - يتم استدعاؤه عند تسجيل الدخول */
  const sendWelcomeNotification = useCallback(() => {
    if (!user?.id) return null;
    // التحقق مما إذا كان قد استلم الترحيب من قبل
    const existing = addNotification(user.id, {
      type: 'welcome',
      priority: 'low',
      title: '👋 مرحباً بعودتك',
      message: `أهلاً ${user.full_name || 'بك'}، يسعدنا وجودك في Kyvzon Platform`,
      groupKey: `welcome-${user.id}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 ساعة
    });
    return existing;
  }, [user]);

  /** تحديث حالة العافية مع إشعار ذكي */
  const sendWellnessUpdate = useCallback(
    (score: number) => {
      if (!user?.id) return;
      notifyWellnessUpdate(user.id, score);
      if (score < 40) {
        notifyWellnessAlert(user.id, score);
      }
    },
    [user?.id]
  );

  /** إتمام تدريب مع إشعار */
  const sendTrainingCompleted = useCallback(
    (courseTitle: string) => {
      if (!user?.id) return;
      notifyTrainingCompleted(user.id, courseTitle);
    },
    [user?.id]
  );

  /** اعتماد SOP مع إشعار */
  const sendSOPApproved = useCallback(
    (sopTitle: string) => {
      if (!user?.id) return;
      notifySOPApproved(user.id, sopTitle);
    },
    [user?.id]
  );

  /** إشعار حضور/انصراف */
  const sendAttendance = useCallback(
    (type: 'check_in' | 'check_out', time: string) => {
      if (!user?.id) return;
      notifyAttendanceRecorded(user.id, type, time);
    },
    [user?.id]
  );

  /** إشعار عند تسجيل الخروج عبر بوابة الحارس */
  const sendGatekeeperUpdate = useCallback(
    (type: 'entry' | 'exit') => {
      if (!user?.id) return;
      notifyGatekeeperEntry(user.id, type);
    },
    [user?.id]
  );

  /** إشعار تحديث الملف الشخصي */
  const sendProfileUpdate = useCallback(
    (changedFields: string[]) => {
      if (!user?.id) return;
      notifyProfileUpdated(user.id, changedFields);
    },
    [user?.id]
  );

  return {
    user,
    sendLocal,
    sendWelcomeNotification,
    sendWellnessUpdate,
    sendTrainingCompleted,
    sendSOPApproved,
    sendAttendance,
    sendGatekeeperUpdate,
    sendProfileUpdate,
  };
}