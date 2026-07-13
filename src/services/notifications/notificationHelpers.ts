/**
 * ════════════════════════════════════════════════════════════════
 *  NotificationHelpers - دوال مساعدة للإشعارات لكل جزء من النظام
 * ════════════════════════════════════════════════════════════════
 *  هذه الدوال توفر واجهة موحدة لإرسال الإشعارات من أي صفحة
 *  مع رسائل مترجمة ومنسقة مسبقاً
 * ════════════════════════════════════════════════════════════════
 */

import { notifyUser, notifyRole, notifyManager, notifySupervisors } from './notificationService';
import { addNotification } from './notificationManager';
import type { NotificationType, NotificationPriority } from '../../core/constants/notificationTypes';
import type { UserRole } from '../../shared/types';

// ════════════════════════════════════════════════════════════════
//  دوال مساعدة مشتركة
// ════════════════════════════════════════════════════════════════

/** إنشاء groupKey موحد لتجنب تكرار الإشعارات */
function makeGroupKey(prefix: string, id: string): string {
  return `${prefix}-${id}`;
}

/** إنشاء groupKey يومي (مرة واحدة في اليوم) */
function makeDailyGroupKey(prefix: string, userId: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `${prefix}-${userId}-${today}`;
}

/** إنشاء groupKey شهري */
function makeMonthlyGroupKey(prefix: string, userId: string): string {
  const month = new Date().toISOString().slice(0, 7);
  return `${prefix}-${userId}-${month}`;
}

// ════════════════════════════════════════════════════════════════
//  1. إشعارات SOPs
// ════════════════════════════════════════════════════════════════

/** إرسال إشعار عند نشر SOP جديد */
export async function notifySOPCreated(
  sopTitle: string,
  targetDepartments?: string[]
) {
  await notifyRole(['hr', 'admin'], {
    type: 'sop_created',
    priority: 'normal',
    title: '📄 إجراء تشغيلي جديد',
    message: `تم نشر إجراء تشغيلي جديد: "${sopTitle}"`,
    groupKey: makeGroupKey('sop', sopTitle),
    actionUrl: '/sops',
  });
}

/** إرسال إشعار عند اعتماد SOP */
export async function notifySOPApproved(
  userId: string,
  sopTitle: string
) {
  await notifyUser(userId, {
    type: 'sop_approved',
    priority: 'normal',
    title: '✅ تم اعتماد SOP',
    message: `تم اعتماد إجراء التشغيل القياسي: "${sopTitle}" بنجاح`,
    groupKey: makeGroupKey('sop-approve', `${userId}-${sopTitle}`),
    actionUrl: '/sops',
  });
}

/** إرسال إشعار عند تعيين SOP لموظف */
export async function notifySOPAssigned(
  userId: string,
  sopTitle: string
) {
  await notifyUser(userId, {
    type: 'sop_assigned',
    priority: 'high',
    title: '📋 SOP جديد للقراءة',
    message: `تم تعيين إجراء تشغيلي لك: "${sopTitle}"، يرجى قراءته واعتماده`,
    groupKey: makeGroupKey('sop-assign', `${userId}-${sopTitle}`),
    actionUrl: '/sops',
  });
}

/** إرسال إشعار عند رفض SOP */
export async function notifySOPRejected(
  userId: string,
  sopTitle: string,
  reason?: string
) {
  const message = reason
    ? `تم رفض إجراء "${sopTitle}". السبب: ${reason}`
    : `تم رفض إجراء "${sopTitle}". يرجى مراجعة التعديلات المطلوبة`;

  await notifyUser(userId, {
    type: 'sop_rejected',
    priority: 'high',
    title: '❌ تم رفض SOP',
    message,
    groupKey: makeGroupKey('sop-reject', `${userId}-${sopTitle}`),
    actionUrl: '/sops',
    metadata: { sopTitle, reason },
  });
}

/** إرسال إشعار عند انتهاء صلاحية SOP */
export async function notifySOPExpiring(
  userId: string,
  sopTitle: string,
  daysLeft: number
) {
  await notifyUser(userId, {
    type: 'sop_expiring',
    priority: daysLeft <= 7 ? 'urgent' : 'high',
    title: '⏰ SOP على وشك الانتهاء',
    message: `SOP "${sopTitle}" سينتهي بعد ${daysLeft} يوماً، يرجى مراجعته`,
    groupKey: makeGroupKey('sop-expire', `${userId}-${sopTitle}`),
    actionUrl: '/sops',
    metadata: { sopTitle, daysLeft },
  });
}

// ════════════════════════════════════════════════════════════════
//  2. إشعارات التدريب (Training)
// ════════════════════════════════════════════════════════════════

/** إرسال إشعار عند إتمام دورة تدريبية */
export async function notifyTrainingCompleted(
  userId: string,
  courseTitle: string
) {
  await notifyUser(userId, {
    type: 'training_completed',
    priority: 'normal',
    title: '🎓 تم إتمام الدورة التدريبية',
    message: `تهانينا! لقد أكملت بنجاح دورة "${courseTitle}"`,
    groupKey: makeGroupKey('training-complete', `${userId}-${courseTitle}`),
    actionUrl: '/training',
    metadata: { courseTitle },
  });

  // إشعار HR لإدارة التدريب
  await notifyRole(['hr', 'admin'], {
    type: 'training_completed',
    priority: 'low',
    title: '📊 إتمام دورة تدريبية',
    message: `أكمل موظف دورة "${courseTitle}" بنجاح`,
    metadata: { courseTitle },
  });
}

/** إرسال إشعار عند تعيين دورة تدريبية لموظف */
export async function notifyTrainingAssigned(
  userId: string,
  courseTitle: string,
  deadline?: string
) {
  const message = deadline
    ? `تم تعيين دورة "${courseTitle}" لك، يرجى إكمالها قبل ${deadline}`
    : `تم تعيين دورة "${courseTitle}" لك، يرجى البدء بها`;

  await notifyUser(userId, {
    type: 'training_assigned',
    priority: 'high',
    title: '📚 دورة تدريبية جديدة',
    message,
    groupKey: makeGroupKey('training-assign', `${userId}-${courseTitle}`),
    actionUrl: '/training',
    metadata: { courseTitle, deadline },
  });
}

/** إرسال إشعار تذكير بدورة تدريبية */
export async function notifyTrainingDue(
  userId: string,
  courseTitle: string,
  daysLeft: number
) {
  await notifyUser(userId, {
    type: 'training_due',
    priority: daysLeft <= 1 ? 'urgent' : 'high',
    title: '⏰ تذكير بدورة تدريبية',
    message: `لم يتبق سوى ${daysLeft} أيام لإكمال دورة "${courseTitle}"`,
    groupKey: makeGroupKey('training-due', `${userId}-${courseTitle}`),
    actionUrl: '/training',
    metadata: { courseTitle, daysLeft },
  });
}

/** إرسال إشعار عند تجاوز موعد الدورة التدريبية */
export async function notifyTrainingOverdue(
  userId: string,
  courseTitle: string
) {
  await notifyUser(userId, {
    type: 'training_overdue',
    priority: 'urgent',
    title: '🚨 تجاوز موعد الدورة التدريبية',
    message: `لقد تجاوزت الموعد النهائي لإكمال دورة "${courseTitle}"، يرجى التواصل مع HR`,
    groupKey: makeGroupKey('training-overdue', `${userId}-${courseTitle}`),
    actionUrl: '/training',
    metadata: { courseTitle },
  });
}

/** إرسال إشعار عند جاهزية شهادة تدريب */
export async function notifyTrainingCertReady(
  userId: string,
  courseTitle: string
) {
  await notifyUser(userId, {
    type: 'training_cert_ready',
    priority: 'normal',
    title: '📜 شهادتك جاهزة',
    message: `شهادة إتمام دورة "${courseTitle}" جاهزة للتحميل`,
    groupKey: makeGroupKey('training-cert', `${userId}-${courseTitle}`),
    actionUrl: '/training',
    metadata: { courseTitle },
  });
}

// ════════════════════════════════════════════════════════════════
//  3. إشعارات الاستبيانات (Surveys)
// ════════════════════════════════════════════════════════════════

/** إرسال إشعار عند نشر استبيان جديد */
export async function notifySurveyPublished(
  surveyTitle: string,
  targetRoles?: UserRole[]
) {
  const roles = targetRoles || ['employee', 'supervisor', 'manager'];
  await notifyRole(roles, {
    type: 'survey_published',
    priority: 'normal',
    title: '📝 استبيان جديد',
    message: `تم نشر استبيان: "${surveyTitle}"، يرجى المشاركة`,
    groupKey: makeGroupKey('survey', surveyTitle),
    actionUrl: '/survey',
  });
}

/** إرسال إشعار تذكير باستبيان */
export async function notifySurveyReminder(
  userId: string,
  surveyTitle: string
) {
  await notifyUser(userId, {
    type: 'survey_reminder',
    priority: 'normal',
    title: '🔔 تذكير باستبيان',
    message: `لم تقم بالمشاركة في استبيان "${surveyTitle}" بعد`,
    groupKey: makeGroupKey('survey-reminder', `${userId}-${surveyTitle}`),
    actionUrl: '/survey',
  });
}

/** إرسال إشعار باقتراب موعد انتهاء الاستبيان */
export async function notifySurveyDeadlineSoon(
  userId: string,
  surveyTitle: string,
  daysLeft: number
) {
  await notifyUser(userId, {
    type: 'survey_deadline_soon',
    priority: 'high',
    title: '⏰ استبيان على وشك الانتهاء',
    message: `لم يتبق سوى ${daysLeft} أيام للمشاركة في "${surveyTitle}"`,
    groupKey: makeGroupKey('survey-deadline', `${userId}-${surveyTitle}`),
    actionUrl: '/survey',
    metadata: { surveyTitle, daysLeft },
  });
}

/** إرسال إشعار بنتائج الاستبيان */
export async function notifySurveyResultsReady(
  surveyTitle: string
) {
  await notifyRole(['hr', 'admin'], {
    type: 'survey_results_ready',
    priority: 'normal',
    title: '📊 نتائج الاستبيان جاهزة',
    message: `نتائج استبيان "${surveyTitle}" جاهزة للعرض`,
    groupKey: makeGroupKey('survey-results', surveyTitle),
    actionUrl: '/survey',
  });
}

// ════════════════════════════════════════════════════════════════
//  4. إشعارات العافية (Wellness)
// ════════════════════════════════════════════════════════════════

/** إرسال إشعار عند تحديث حالة العافية */
export async function notifyWellnessUpdate(
  userId: string,
  score: number
) {
  await notifyUser(userId, {
    type: 'wellness_update',
    priority: 'low',
    title: '🌱 تم تحديث حالة العافية',
    message: `تم تسجيل حالة العافية الخاصة بك. درجتك الحالية: ${score}/100`,
    groupKey: makeMonthlyGroupKey('wellness', userId),
    actionUrl: '/wellness',
    metadata: { score },
  });
}

/** إرسال تنبيه عافية (إذا كانت الدرجة منخفضة) */
export async function notifyWellnessAlert(
  userId: string,
  score: number
) {
  await notifyUser(userId, {
    type: 'wellness_alert',
    priority: 'high',
    title: '⚠️ تنبيه العافية',
    message: `درجة العافية الخاصة بك منخفضة (${score}/100). يُنصح بالتواصل مع قسم الموارد البشرية`,
    groupKey: makeGroupKey('wellness-alert', userId),
    actionUrl: '/wellness',
    metadata: { score },
  });

  // إشعار HR بحالة الموظف
  await notifyRole(['hr', 'admin'], {
    type: 'wellness_alert',
    priority: 'normal',
    title: '👤 تنبيه عافية موظف',
    message: `أحد الموظفين سجل درجة عافية منخفضة`,
    metadata: { userId, score },
  });
}

/** إرسال إشعار بتحسن العافية */
export async function notifyWellnessImprovement(
  userId: string,
  oldScore: number,
  newScore: number
) {
  await notifyUser(userId, {
    type: 'wellness_improvement',
    priority: 'low',
    title: '🌟 تحسن في العافية',
    message: `رائع! درجة العافية لديك ارتفعت من ${oldScore} إلى ${newScore}. استمر!`,
    groupKey: makeMonthlyGroupKey('wellness-imp', userId),
    actionUrl: '/wellness',
    metadata: { oldScore, newScore },
  });
}

/** تذكير بتسجيل حالة العافية اليومية */
export async function notifyWellnessCheckinReminder(
  userId: string
) {
  await notifyUser(userId, {
    type: 'wellness_checkin_reminder',
    priority: 'low',
    title: '💚 ذكرني بتسجيل العافية',
    message: `لم تقم بتسجيل حالة العافية اليوم. خذ دقيقة لتفقد حالتك النفسية`,
    groupKey: makeDailyGroupKey('wellness-check', userId),
    actionUrl: '/wellness',
  });
}

// ════════════════════════════════════════════════════════════════
//  5. إشعارات الحضور والانصراف
// ════════════════════════════════════════════════════════════════

/** إرسال إشعار عند تسجيل الحضور */
export async function notifyAttendanceRecorded(
  userId: string,
  type: 'check_in' | 'check_out',
  time: string
) {
  const title = type === 'check_in' ? '✅ تسجيل حضور' : '🔴 تسجيل انصراف';
  const message = type === 'check_in'
    ? `تم تسجيل حضورك في ${time}`
    : `تم تسجيل انصرافك في ${time}`;

  await notifyUser(userId, {
    type: 'attendance_recorded',
    priority: 'low',
    title,
    message,
    groupKey: makeDailyGroupKey('attendance', userId),
    metadata: { type, time },
  });
}

/** إرسال إشعار عند مخالفة حضور */
export async function notifyAttendanceViolation(
  userId: string,
  reason: string
) {
  await notifyUser(userId, {
    type: 'attendance_violation',
    priority: 'high',
    title: '⚠️ مخالفة حضور',
    message: `تم تسجيل مخالفة: ${reason}`,
    groupKey: makeMonthlyGroupKey('attendance-violation', userId),
    actionUrl: '/my-attendance',
    metadata: { reason },
  });

  // إشعار للمشرفين
  await notifySupervisors(userId, {
    type: 'attendance_violation',
    priority: 'normal',
    title: '📋 مخالفة حضور لموظف',
    message: `تم تسجيل مخالفة حضور لأحد الموظفين: ${reason}`,
    metadata: { userId, reason },
  });
}

/** إرسال إشعار عند التأخير */
export async function notifyAttendanceLate(
  userId: string,
  minutesLate: number
) {
  await notifyUser(userId, {
    type: 'attendance_late',
    priority: 'normal',
    title: '⏰ تأخير عن الدوام',
    message: `تم تسجيل دخولك متأخراً ${minutesLate} دقيقة`,
    groupKey: makeDailyGroupKey('attendance-late', userId),
    actionUrl: '/my-attendance',
    metadata: { minutesLate },
  });
}

/** إرسال إشعار عند الغياب */
export async function notifyAttendanceAbsent(
  userId: string,
  date: string
) {
  await notifyUser(userId, {
    type: 'attendance_absent',
    priority: 'high',
    title: '❌ غياب غير مبرر',
    message: `تم تسجيل غيابك في ${date}. يرجى تقديم عذر`,
    groupKey: makeDailyGroupKey('attendance-absent', userId),
    actionUrl: '/my-attendance',
    metadata: { date },
  });

  // إشعار المشرف
  await notifySupervisors(userId, {
    type: 'attendance_absent',
    priority: 'normal',
    title: '📋 غياب موظف',
    message: `تم تسجيل غياب لأحد الموظفين في ${date}`,
    metadata: { userId, date },
  });
}

/** إرسال إشعار عند تسجيل وقت إضافي */
export async function notifyAttendanceOvertime(
  userId: string,
  hours: number
) {
  await notifyUser(userId, {
    type: 'attendance_overtime',
    priority: 'low',
    title: '⏱️ تم تسجيل وقت إضافي',
    message: `تم تسجيل ${hours} ساعات عمل إضافية اليوم`,
    groupKey: makeDailyGroupKey('attendance-overtime', userId),
    actionUrl: '/my-attendance',
    metadata: { hours },
  });
}

// ════════════════════════════════════════════════════════════════
//  6. إشعارات الحارس (Gatekeeper)
// ════════════════════════════════════════════════════════════════

/** إرسال إشعار عند تسجيل دخول/خروج عبر بوابة الحارس */
export async function notifyGatekeeperEntry(
  userId: string,
  type: 'entry' | 'exit'
) {
  const title = type === 'entry' ? '🚪 تسجيل دخول' : '🚪 تسجيل خروج';
  const message = type === 'entry'
    ? 'تم تسجيل دخولك عبر بوابة الحارس'
    : 'تم تسجيل خروجك عبر بوابة الحارس';

  await notifyUser(userId, {
    type: type === 'entry' ? 'gatekeeper_entry' : 'gatekeeper_exit',
    priority: 'low',
    title,
    message,
    groupKey: makeDailyGroupKey('gatekeeper', userId),
    metadata: { type, timestamp: new Date().toISOString() },
  });
}

/** إرسال إشعار عند زيارة زائر */
export async function notifyGatekeeperVisitor(
  gatekeeperId: string,
  visitorName: string,
  purpose: string
) {
  await notifyUser(gatekeeperId, {
    type: 'gatekeeper_visitor',
    priority: 'normal',
    title: '🚶 زائر جديد',
    message: `الزائر "${visitorName}" - الغرض: ${purpose}`,
    groupKey: makeDailyGroupKey('visitor', gatekeeperId),
    metadata: { visitorName, purpose },
  });
}

/** إشعار نشاط مشبوه للحارس */
export async function notifyGatekeeperSuspicious(
  gatekeeperId: string,
  detail: string
) {
  await notifyUser(gatekeeperId, {
    type: 'gatekeeper_suspicious',
    priority: 'urgent',
    title: '🚨 نشاط مشبوه',
    message: detail,
    groupKey: makeDailyGroupKey('suspicious', gatekeeperId),
    actionUrl: '/gatekeeper',
    metadata: { detail },
  });

  // إشعار Admin أيضاً
  await notifyRole(['admin'], {
    type: 'gatekeeper_suspicious',
    priority: 'urgent',
    title: '🚨 تنبيه أمني - نشاط مشبوه',
    message: detail,
    metadata: { gatekeeperId, detail },
  });
}

// ════════════════════════════════════════════════════════════════
//  7. إشعارات الإعلانات والتبليغات
// ════════════════════════════════════════════════════════════════

/** إرسال إشعار عند نشر إعلان جديد */
export async function notifyAnnouncementPublished(
  title: string,
  message: string,
  isUrgent?: boolean,
  targetRoles?: UserRole[]
) {
  const roles = targetRoles || ['employee', 'supervisor', 'manager', 'hr', 'admin'];
  const type = isUrgent ? 'announcement_urgent' : 'announcement_published';
  const priority = isUrgent ? 'urgent' : 'high';
  const prefix = isUrgent ? '🔴🔴' : '📢';

  await notifyRole(roles, {
    type,
    priority,
    title: `${prefix} ${title}`,
    message,
    groupKey: makeGroupKey('announcement', title),
    actionUrl: '/communication',
    metadata: { isUrgent, title, message },
  });
}

/** إرسال إشعار بعيد ميلاد موظف */
export async function notifyAnnouncementBirthday(
  employeeName: string,
  userIds: string[]
) {
  for (const userId of userIds) {
    await notifyUser(userId, {
      type: 'announcement_birthday',
      priority: 'low',
      title: '🎂 عيد ميلاد سعيد!',
      message: `اليوم عيد ميلاد زميلنا ${employeeName} 🎉`,
      groupKey: makeDailyGroupKey('birthday', userId),
      metadata: { employeeName },
    });
  }
}

/** إرسال إشعار بمناسبة رمضان */
export async function notifyAnnouncementRamadan(
  userIds: string[]
) {
  for (const userId of userIds) {
    await notifyUser(userId, {
      type: 'announcement_ramadan',
      priority: 'normal',
      title: '🌙 رمضان مبارك',
      message: 'كل عام وأنتم بخير بمناسبة شهر رمضان المبارك',
      groupKey: makeGroupKey('ramadan', new Date().getFullYear().toString()),
      metadata: { year: new Date().getFullYear() },
    });
  }
}

/** إرسال إشعار بمناسبة عطلة رسمية */
export async function notifyAnnouncementHoliday(
  holidayName: string,
  date: string
) {
  await notifyRole(['employee', 'supervisor', 'manager', 'hr', 'admin', 'gatekeeper'], {
    type: 'announcement_holiday',
    priority: 'high',
    title: '🎉 عطلة رسمية',
    message: `بمناسبة "${holidayName}"، العطلة الرسمية يوم ${date}`,
    groupKey: makeGroupKey('holiday', holidayName + date),
    metadata: { holidayName, date },
  });
}

// ════════════════════════════════════════════════════════════════
//  8. إشعارات الملف الشخصي
// ════════════════════════════════════════════════════════════════

/** إرسال إشعار عند تحديث الملف الشخصي */
export async function notifyProfileUpdated(
  userId: string,
  changedFields: string[]
) {
  const fieldsList = changedFields.join('، ');
  await notifyUser(userId, {
    type: 'profile_update',
    priority: 'low',
    title: '👤 تم تحديث الملف الشخصي',
    message: `تم تحديث: ${fieldsList}`,
    groupKey: makeGroupKey('profile', userId),
    actionUrl: '/profile',
    metadata: { changedFields },
  });
}

// ════════════════════════════════════════════════════════════════
//  9. إشعارات الموظفين (لـ HR/Admin)
// ════════════════════════════════════════════════════════════════

/** إرسال إشعار عند اعتماد طلب موظف جديد */
export async function notifyEmployeeApproved(
  userId: string,
  employeeName: string
) {
  await notifyUser(userId, {
    type: 'employee_approved',
    priority: 'normal',
    title: '✅ تم اعتمادك في النظام',
    message: `مرحباً ${employeeName}، تم اعتماد حسابك في Kyvzon Platform`,
    groupKey: makeGroupKey('employee-approve', userId),
    actionUrl: '/dashboard',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 يوم
  });
}

/** إرسال إشعار عند رفض طلب موظف */
export async function notifyEmployeeRejected(
  userId: string,
  reason?: string
) {
  const message = reason
    ? `عذراً، لم يتم اعتماد طلبك. السبب: ${reason}`
    : 'عذراً، لم يتم اعتماد طلبك. يرجى التواصل مع قسم الموارد البشرية';

  await notifyUser(userId, {
    type: 'employee_rejected',
    priority: 'high',
    title: '❌ لم يتم الاعتماد',
    message,
    metadata: { reason },
  });
}

/** إرسال إشعار ترحيبي لموظف جديد */
export async function notifyEmployeeOnboarding(
  userId: string,
  employeeName: string
) {
  await notifyUser(userId, {
    type: 'employee_onboarding',
    priority: 'normal',
    title: '👋 مرحباً بك في الفريق!',
    message: `${employeeName}، نرحب بك في Kyvzon. يرجى استكمال بيانات ملفك الشخصي`,
    groupKey: makeGroupKey('onboarding', userId),
    actionUrl: '/profile',
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: { employeeName },
  });
}

/** إرسال إشعار بمناسبة مرور سنة على انضمام الموظف */
export async function notifyEmployeeAnniversary(
  userId: string,
  years: number
) {
  await notifyUser(userId, {
    type: 'employee_anniversary',
    priority: 'low',
    title: '🎊 سنة تأسيسية سعيدة!',
    message: `مرت ${years} سنوات على انضمامك لفريق Kyvzon. شكراً لجهودك!`,
    groupKey: makeGroupKey('anniversary', `${userId}-${new Date().getFullYear()}`),
    actionUrl: '/profile',
    metadata: { years },
  });
}

// ════════════════════════════════════════════════════════════════
//  10. إشعارات النظام
// ════════════════════════════════════════════════════════════════

/** إرسال إشعار صيانة النظام */
export async function notifySystemMaintenance(
  startTime: string,
  duration: string
) {
  await notifyRole(['employee', 'supervisor', 'manager', 'hr', 'admin', 'gatekeeper', 'developer'], {
    type: 'system_maintenance',
    priority: 'urgent',
    title: '🔧 صيانة النظام',
    message: `سيتم إجراء صيانة للنظام يوم ${startTime} لمدة ${duration}. قد يكون النظام غير متاح مؤقتاً`,
    groupKey: makeGroupKey('maintenance', startTime),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // أسبوع
    metadata: { startTime, duration },
  });
}

/** إرسال إشعار تحديث النظام */
export async function notifySystemUpdate(
  version: string,
  changes: string[]
) {
  await notifyRole(['employee', 'supervisor', 'manager', 'hr', 'admin', 'gatekeeper', 'developer'], {
    type: 'system_update',
    priority: 'normal',
    title: '🆕 تحديث النظام',
    message: `تم تحديث النظام إلى الإصدار ${version}\nأبرز التغييرات: ${changes.join('، ')}`,
    groupKey: makeGroupKey('update', version),
    metadata: { version, changes },
  });
}

/** إرسال إشعار أمان */
export async function notifySecurityAlert(
  userId: string,
  detail: string
) {
  await notifyUser(userId, {
    type: 'system_security_alert',
    priority: 'urgent',
    title: '🔒 تنبيه أمان',
    message: detail,
    groupKey: makeGroupKey('security', userId),
    actionUrl: '/profile',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: { detail },
  });
}

/** إرسال إشعار إكمال نسخة احتياطية */
export async function notifyBackupCompleted(
  backupSize: string
) {
  await notifyRole(['admin', 'developer'], {
    type: 'system_backup_completed',
    priority: 'low',
    title: '💾 تم إكمال النسخة الاحتياطية',
    message: `تم إنشاء نسخة احتياطية جديدة. الحجم: ${backupSize}`,
    groupKey: makeDailyGroupKey('backup', 'system'),
    metadata: { backupSize },
  });
}

/** إرسال إشعار خطأ في النظام */
export async function notifySystemError(
  errorMessage: string,
  component: string
) {
  await notifyRole(['admin', 'developer'], {
    type: 'system_error',
    priority: 'urgent',
    title: '🚨 خطأ في النظام',
    message: `حدث خطأ في ${component}: ${errorMessage}`,
    groupKey: makeGroupKey('error', `${component}-${Date.now()}`),
    metadata: { errorMessage, component },
  });
}

// ════════════════════════════════════════════════════════════════
//  11. إشعارات الصلاحيات
// ════════════════════════════════════════════════════════════════

/** إرسال إشعار عند تغيير صلاحيات مستخدم */
export async function notifyPermissionChanged(
  userId: string,
  changes: string[]
) {
  await notifyUser(userId, {
    type: 'permission_update',
    priority: 'high',
    title: '🔑 تم تحديث الصلاحيات',
    message: `تم تحديث صلاحياتك في النظام: ${changes.join('، ')}`,
    groupKey: makeGroupKey('permission', userId),
    actionUrl: '/dashboard',
    metadata: { changes },
  });
}

// ════════════════════════════════════════════════════════════════
//  12. إشعارات اجتماعات
// ════════════════════════════════════════════════════════════════

/** إرسال إشعار عند جدولة اجتماع */
export async function notifyMeetingScheduled(
  userId: string,
  meetingTitle: string,
  meetingTime: string
) {
  await notifyUser(userId, {
    type: 'meeting_scheduled',
    priority: 'normal',
    title: '📅 اجتماع جديد',
    message: `تمت دعوتك لاجتماع: "${meetingTitle}" في ${meetingTime}`,
    groupKey: makeGroupKey('meeting', `${userId}-${meetingTitle}`),
    actionUrl: '/calendar',
    metadata: { meetingTitle, meetingTime },
  });
}

/** إرسال تذكير باجتماع */
export async function notifyMeetingReminder(
  userId: string,
  meetingTitle: string,
  minutesLeft: number
) {
  await notifyUser(userId, {
    type: 'meeting_reminder',
    priority: 'urgent',
    title: '⏰ تذكير باجتماع',
    message: `تبقى ${minutesLeft} دقيقة على اجتماع "${meetingTitle}"`,
    groupKey: makeGroupKey('meeting-reminder', `${userId}-${meetingTitle}`),
    actionUrl: '/calendar',
    metadata: { meetingTitle, minutesLeft },
  });
}

/** إرسال إشعار بإلغاء اجتماع */
export async function notifyMeetingCancelled(
  userId: string,
  meetingTitle: string
) {
  await notifyUser(userId, {
    type: 'meeting_cancelled',
    priority: 'high',
    title: '❌ تم إلغاء الاجتماع',
    message: `تم إلغاء اجتماع "${meetingTitle}"`,
    groupKey: makeGroupKey('meeting-cancel', `${userId}-${meetingTitle}`),
    metadata: { meetingTitle },
  });
}

/** إرسال إشعار بإعادة جدولة اجتماع */
export async function notifyMeetingRescheduled(
  userId: string,
  meetingTitle: string,
  newTime: string
) {
  await notifyUser(userId, {
    type: 'meeting_rescheduled',
    priority: 'normal',
    title: '🔄 تم إعادة جدولة الاجتماع',
    message: `تم تغيير موعد اجتماع "${meetingTitle}" إلى ${newTime}`,
    groupKey: makeGroupKey('meeting-reschedule', `${userId}-${meetingTitle}`),
    actionUrl: '/calendar',
    metadata: { meetingTitle, newTime },
  });
}

/** إرسال إشعار بتوفر محضر الاجتماع */
export async function notifyMeetingMinutesReady(
  userId: string,
  meetingTitle: string
) {
  await notifyUser(userId, {
    type: 'meeting_minutes_ready',
    priority: 'low',
    title: '📝 محضر الاجتماع متاح',
    message: `محضر اجتماع "${meetingTitle}" جاهز للمراجعة`,
    groupKey: makeGroupKey('meeting-minutes', `${userId}-${meetingTitle}`),
    actionUrl: '/calendar',
    metadata: { meetingTitle },
  });
}

// ════════════════════════════════════════════════════════════════
//  13. إشعارات الإجازات (Leave)
// ════════════════════════════════════════════════════════════════

/** إشعار بإجازة على وشك الانتهاء */
export async function notifyLeaveExpiring(
  userId: string,
  daysLeft: number
) {
  await notifyUser(userId, {
    type: 'leave_expiring',
    priority: 'high',
    title: '⏰ إجازتك على وشك الانتهاء',
    message: `لديك ${daysLeft} أيام متبقية من إجازتك الحالية`,
    groupKey: makeGroupKey('leave-expiring', userId),
    actionUrl: '/my-leave-requests',
    metadata: { daysLeft },
  });
}

/** إشعار بانخفاض رصيد الإجازات */
export async function notifyLeaveBalanceLow(
  userId: string,
  remainingDays: number
) {
  await notifyUser(userId, {
    type: 'leave_balance_low',
    priority: 'normal',
    title: '📊 رصيد إجازات منخفض',
    message: `رصيد الإجازات المتبقي لديك: ${remainingDays} أيام فقط`,
    groupKey: makeGroupKey('leave-balance', userId),
    actionUrl: '/my-leave-requests',
    metadata: { remainingDays },
  });
}

// ════════════════════════════════════════════════════════════════
//  14. إشعارات التقييم (Evaluation)
// ════════════════════════════════════════════════════════════════

/** إشعار بتقييم قيد الانتظار */
export async function notifyEvaluationPending(
  userId: string,
  period: string
) {
  await notifyUser(userId, {
    type: 'evaluation_pending',
    priority: 'high',
    title: '📋 تقييم الأداء قيد الانتظار',
    message: `تقييم الأداء لفترة "${period}" بانتظارك`,
    groupKey: makeGroupKey('evaluation-pending', `${userId}-${period}`),
    actionUrl: '/dashboard',
    metadata: { period },
  });
}

/** إشعار بإكمال التقييم */
export async function notifyEvaluationCompleted(
  userId: string,
  period: string
) {
  await notifyUser(userId, {
    type: 'evaluation_completed',
    priority: 'normal',
    title: '✅ تم إكمال تقييم الأداء',
    message: `تم إكمال تقييم أدائك لفترة "${period}". يمكنك مراجعة النتائج`,
    groupKey: makeGroupKey('evaluation-done', `${userId}-${period}`),
    actionUrl: '/dashboard',
    metadata: { period },
  });
}

/** تذكير بالتقييم */
export async function notifyEvaluationReminder(
  userId: string,
  daysLeft: number
) {
  await notifyUser(userId, {
    type: 'evaluation_reminder',
    priority: 'normal',
    title: '⏰ تذكير بتقييم الأداء',
    message: `لم يتبق سوى ${daysLeft} أيام لتقديم تقييم الأداء`,
    groupKey: makeGroupKey('evaluation-reminder', userId),
    actionUrl: '/dashboard',
    metadata: { daysLeft },
  });
}

// ════════════════════════════════════════════════════════════════
//  15. إشعارات الرواتب (Salary)
// ════════════════════════════════════════════════════════════════

/** إشعار بدفع الراتب */
export async function notifySalaryPaid(
  userId: string,
  amount: string,
  month: string
) {
  await notifyUser(userId, {
    type: 'salary_paid',
    priority: 'normal',
    title: '💰 تم صرف الراتب',
    message: `تم صرف راتب شهر ${month} بقيمة ${amount}`,
    groupKey: makeMonthlyGroupKey('salary', userId),
    actionUrl: '/profile',
    metadata: { amount, month },
  });
}

/** إشعار بجاهزية كعب الراتب */
export async function notifySalarySlipReady(
  userId: string,
  month: string
) {
  await notifyUser(userId, {
    type: 'salary_slip_ready',
    priority: 'low',
    title: '📄 كعب الراتب جاهز',
    message: `كعب راتب شهر ${month} متاح للتحميل`,
    groupKey: makeMonthlyGroupKey('salary-slip', userId),
    actionUrl: '/profile',
    metadata: { month },
  });
}

/** إشعار بمكافأة */
export async function notifySalaryBonus(
  userId: string,
  amount: string,
  reason: string
) {
  await notifyUser(userId, {
    type: 'salary_bonus',
    priority: 'normal',
    title: '🎉 مكافأة!',
    message: `تم إضافة مكافأة بقيمة ${amount} ${reason ? `بسبب: ${reason}` : ''}`,
    groupKey: makeGroupKey('bonus', userId),
    actionUrl: '/profile',
    metadata: { amount, reason },
  });
}

// ════════════════════════════════════════════════════════════════
//  16. إشعارات خاصة بالمطورين (Developer)
// ════════════════════════════════════════════════════════════════

/** إشعار بجاهزية النشر */
export async function notifyDeveloperDeployReady(
  userId: string,
  version: string
) {
  await notifyUser(userId, {
    type: 'developer_deploy_ready',
    priority: 'normal',
    title: '🚀 جاهز للنشر',
    message: `الإصدار ${version} جاهز للنشر على البيئة الإنتاجية`,
    groupKey: makeGroupKey('deploy', version),
    actionUrl: '/developer-dashboard',
    metadata: { version },
  });
}

/** إشعار بنسخة احتياطية قاعدة البيانات */
export async function notifyDeveloperDbBackup(
  userId: string,
  status: 'success' | 'failed',
  size?: string
) {
  const title = status === 'success' ? '✅ نسخة احتياطية DB' : '❌ فشل النسخة الاحتياطية DB';
  const message = status === 'success'
    ? `تم إنشاء نسخة احتياطية لقاعدة البيانات. الحجم: ${size || 'غير معروف'}`
    : 'فشلت عملية إنشاء النسخة الاحتياطية لقاعدة البيانات';

  await notifyUser(userId, {
    type: 'developer_db_backup',
    priority: status === 'failed' ? 'urgent' : 'low',
    title,
    message,
    groupKey: makeDailyGroupKey('db-backup', userId),
    actionUrl: '/developer-logs',
    metadata: { status, size },
  });
}

/** إشعار بخطأ API */
export async function notifyDeveloperApiError(
  userId: string,
  endpoint: string,
  errorMessage: string
) {
  await notifyUser(userId, {
    type: 'developer_api_error',
    priority: 'high',
    title: '🌐 خطأ API',
    message: `خطأ في ${endpoint}: ${errorMessage}`,
    groupKey: makeGroupKey('api-error', `${endpoint}-${Date.now()}`),
    actionUrl: '/developer-dashboard',
    metadata: { endpoint, errorMessage },
  });
}

// ════════════════════════════════════════════════════════════════
//  17. إشعارات المشاكل (Problems) - إضافية
// ════════════════════════════════════════════════════════════════

/** إشعار بحل مشكلة */
export async function notifyProblemResolved(
  userId: string,
  problemTitle: string
) {
  await notifyUser(userId, {
    type: 'problem_resolved',
    priority: 'normal',
    title: '✅ تم حل المشكلة',
    message: `تم حل مشكلتك: "${problemTitle}"`,
    groupKey: makeGroupKey('problem-resolved', `${userId}-${problemTitle}`),
    actionUrl: '/problems',
    metadata: { problemTitle },
  });
}

/** إشعار بإعادة فتح مشكلة */
export async function notifyProblemReopened(
  userId: string,
  problemTitle: string
) {
  await notifyUser(userId, {
    type: 'problem_reopened',
    priority: 'high',
    title: '🔄 إعادة فتح مشكلة',
    message: `تم إعادة فتح مشكلة: "${problemTitle}"`,
    groupKey: makeGroupKey('problem-reopened', `${userId}-${problemTitle}`),
    actionUrl: '/problems',
    metadata: { problemTitle },
  });
}

/** إشعار بتجاوز مدة المشكلة */
export async function notifyProblemOverdue(
  userId: string,
  problemTitle: string,
  daysOverdue: number
) {
  await notifyUser(userId, {
    type: 'problem_overdue',
    priority: 'urgent',
    title: '🚨 مشكلة متجاوزة المدة',
    message: `مشكلة "${problemTitle}" متجاوزة الموعد المحدد بـ ${daysOverdue} يوم`,
    groupKey: makeGroupKey('problem-overdue', `${userId}-${problemTitle}`),
    actionUrl: '/problems',
    metadata: { problemTitle, daysOverdue },
  });
}

// ════════════════════════════════════════════════════════════════
//  18. دوال محلية (localStorage فقط - بدون Supabase)
// ════════════════════════════════════════════════════════════════

/** إضافة إشعار محلي (بدون اتصال بقاعدة البيانات) */
export function addLocalNotification(
  userId: string | null | undefined,
  type: NotificationType,
  priority: NotificationPriority,
  title: string,
  message: string,
  actionUrl?: string,
  groupKey?: string,
  metadata?: Record<string, unknown>
) {
  return addNotification(userId, {
    type,
    priority,
    title,
    message,
    actionUrl,
    groupKey,
    metadata,
  });
}