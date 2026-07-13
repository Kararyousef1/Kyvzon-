// ============================================================================
// Kyvzon Platform
// منطق الإجازات — 9 أنواع
// حساب أيام العمل الفعلية — استثناء الجمعة والعطل
// ============================================================================

/**
 * أنواع الإجازات التسعة
 */
export type LeaveType =
  | 'سنوية'
  | 'مرضية'
  | 'وفاة_أول'
  | 'وفاة_ثاني'
  | 'زواج'
  | 'امتحانات'
  | 'غير_مدفوعة'
  | 'حج'
  | 'تكليف';

/**
 * حالة الإجازة
 */
export type LeaveStatus = 'انتظار' | 'موافق' | 'مرفوض';

/**
 * إعدادات الإجازة لنوع معين
 */
export interface LeaveSetting {
  leaveType: LeaveType;
  daysAllowed: number;
  isPaid: boolean;
  requiresAttachment: boolean;
  oncePerService: boolean;
  description?: string;
}

/**
 * سجل الإجازة
 */
export interface Leave {
  id: string;
  employee_id: string;
  leave_type: LeaveType;
  date_from: string;    // YYYY-MM-DD
  date_to: string;      // YYYY-MM-DD
  working_days_count: number;
  status: LeaveStatus;
  approved_by?: string;
  reason?: string;
  attachment_url?: string;
  created_at: string;
  updated_at: string;
}

/**
 * رصيد الإجازات
 */
export interface LeaveBalance {
  employee_id: string;
  year: number;
  annual_total: number;
  annual_used: number;
  annual_pending: number;
  annual_remaining: number;
  sick_total: number;
  sick_used: number;
  sick_pending: number;
  sick_remaining: number;
  hajj_taken: boolean;
  updated_at: string;
}

// ============================================================================
// إعدادات الإجازات الافتراضية
// ============================================================================

export const DEFAULT_LEAVE_SETTINGS: LeaveSetting[] = [
  {
    leaveType: 'سنوية',
    daysAllowed: 21,
    isPaid: true,
    requiresAttachment: false,
    oncePerService: false,
    description: 'إجازة سنوية مدفوعة الأجر - رصيد يتراكم حسب مدة الخدمة'
  },
  {
    leaveType: 'مرضية',
    daysAllowed: 30,
    isPaid: true,
    requiresAttachment: true,
    oncePerService: false,
    description: 'إجازة مرضية مدفوعة الأجر - تحتاج تقرير طبي'
  },
  {
    leaveType: 'وفاة_أول',
    daysAllowed: 3,
    isPaid: true,
    requiresAttachment: false,
    oncePerService: false,
    description: 'إجازة وفاة عائلية (الدرجة الأولى): الأب، الأم، الزوج/ة، الأبناء'
  },
  {
    leaveType: 'وفاة_ثاني',
    daysAllowed: 2,
    isPaid: true,
    requiresAttachment: false,
    oncePerService: false,
    description: 'إجازة وفاة قريب: الأخ، الأخت، الجد، الجدة'
  },
  {
    leaveType: 'زواج',
    daysAllowed: 7,
    isPaid: true,
    requiresAttachment: false,
    oncePerService: true,
    description: 'إجازة زواج - مرة واحدة فقط في الخدمة'
  },
  {
    leaveType: 'امتحانات',
    daysAllowed: 15,
    isPaid: true,
    requiresAttachment: true,
    oncePerService: false,
    description: 'إجازة امتحانات - تحتاج جدول امتحانات'
  },
  {
    leaveType: 'غير_مدفوعة',
    daysAllowed: 0,
    isPaid: false,
    requiresAttachment: false,
    oncePerService: false,
    description: 'إجازة غير مدفوعة الأجر - تحتاج موافقة مدير النظام'
  },
  {
    leaveType: 'حج',
    daysAllowed: 15,
    isPaid: true,
    requiresAttachment: false,
    oncePerService: true,
    description: 'إجازة حج - مرة واحدة فقط في الخدمة'
  },
  {
    leaveType: 'تكليف',
    daysAllowed: 0,
    isPaid: true,
    requiresAttachment: false,
    oncePerService: false,
    description: 'إجازة تكليف - بأمر تكليف رسمي'
  },
];

// ============================================================================
// أيام العطل الأسبوعية (JavaScript getDay: 0=Sun, 1=Mon, 5=Fri, 6=Sat)
// ============================================================================
export const WEEKEND_DAYS = [5]; // 5 = Friday in JavaScript getDay()

// ============================================================================
// حساب أيام العمل الفعلية
// ============================================================================

/**
 * حساب عدد أيام العمل الفعلية بين تاريخين
 * يستثني:
 * - أيام الجمعة
 * - العطل الرسمية المسجلة
 *
 * @param dateFrom تاريخ البداية (YYYY-MM-DD)
 * @param dateTo تاريخ النهاية (YYYY-MM-DD)
 * @param holidays قائمة العطل الرسمية (اختياري)
 * @returns عدد أيام العمل الفعلية
 */
export function calculateWorkingDays(
  dateFrom: string,
  dateTo: string,
  holidays?: string[]
): number {
  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  let count = 0;

  const current = new Date(start);

  while (current <= end) {
    const dayOfWeek = current.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

    // استثناء الجمعة (5 في JS getDay)
    const isFriday = dayOfWeek === 5; // JS: 5 = Friday

    if (!isFriday) {
      // التحقق من العطل الرسمية
      const dateStr = current.toISOString().split('T')[0];
      const isHoliday = holidays?.includes(dateStr) ?? false;

      if (!isHoliday) {
        count++;
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return count;
}

/**
 * حساب أيام العمل بين تاريخين مع مراعاة العطل المسجلة في قاعدة البيانات
 */
export function calculateWorkingDaysWithHolidays(
  dateFrom: string,
  dateTo: string,
  holidays: Array<{ date: string }>
): number {
  const holidayDates = holidays.map(h => h.date);
  return calculateWorkingDays(dateFrom, dateTo, holidayDates);
}

// ============================================================================
// التحقق من صحة الإجازة
// ============================================================================

interface LeaveValidation {
  valid: boolean;
  message: string;
}

/**
 * التحقق من صحة طلب إجازة
 */
export function validateLeaveRequest(
  leaveType: LeaveType,
  dateFrom: string,
  dateTo: string,
  balance: LeaveBalance | null,
  settings: LeaveSetting[],
  employeeLeaves: Leave[]
): LeaveValidation {
  // 1. التحقق من تواريخ الإجازة
  if (new Date(dateFrom) > new Date(dateTo)) {
    return {
      valid: false,
      message: 'تاريخ البداية يجب أن يكون قبل أو يساوي تاريخ النهاية'
    };
  }

  // 2. التحقق من أن الإجازة في المستقبل
  if (new Date(dateFrom) < new Date(new Date().toISOString().split('T')[0])) {
    return {
      valid: false,
      message: 'لا يمكن التقديم على إجازة في الماضي'
    };
  }

  // 3. الحصول على إعدادات هذا النوع من الإجازة
  const setting = settings.find(s => s.leaveType === leaveType);
  if (!setting) {
    return {
      valid: false,
      message: `لا توجد إعدادات لنوع الإجازة: ${getLeaveTypeLabel(leaveType)}`
    };
  }

  // 4. التحقق من "مرة واحدة فقط في الخدمة"
  if (setting.oncePerService) {
    const previousLeaves = employeeLeaves.filter(
      l => l.leave_type === leaveType && l.status === 'موافق'
    );
    if (previousLeaves.length > 0) {
      return {
        valid: false,
        message: `لا يمكن التقديم على ${getLeaveTypeLabel(leaveType)} أكثر من مرة`
      };
    }
  }

  // 5. حساب أيام العمل الفعلية
  const workingDays = calculateWorkingDays(dateFrom, dateTo);

  // 6. التحقق من رصيد الإجازة السنوية
  if (leaveType === 'سنوية' && balance) {
    if (workingDays > balance.annual_remaining) {
      return {
        valid: false,
        message: `رصيد الإجازة السنوية غير كافٍ. المتبقي: ${balance.annual_remaining.toFixed(3)} يوم`
      };
    }
  }

  // 7. التحقق من رصيد الإجازة المرضية
  if (leaveType === 'مرضية' && balance) {
    if (workingDays > balance.sick_remaining) {
      return {
        valid: false,
        message: `رصيد الإجازة المرضية غير كافٍ. المتبقي: ${balance.sick_remaining.toFixed(1)} يوم`
      };
    }
  }

  // 8. التحقق من إجازة الحج
  if (leaveType === 'حج' && balance) {
    if (balance.hajj_taken) {
      return {
        valid: false,
        message: 'لقد حصلت على إجازة حج من قبل. لا يمكن التقديم مرة أخرى'
      };
    }
  }

  // 9. التحقق من عدم وجود إجازة متداخلة
  const overlappingLeave = employeeLeaves.find(l => {
    if (l.id === 'pending') return false; // تجاهل الإجازة الحالية
    if (l.status !== 'موافق' && l.status !== 'انتظار') return false;

    // التحقق من التداخل
    const leaveStart = new Date(l.date_from).getTime();
    const leaveEnd = new Date(l.date_to).getTime();
    const newStart = new Date(dateFrom).getTime();
    const newEnd = new Date(dateTo).getTime();

    return newStart <= leaveEnd && newEnd >= leaveStart;
  });

  if (overlappingLeave) {
    return {
      valid: false,
      message: 'يوجد إجازة أخرى في نفس الفترة'
    };
  }

  return {
    valid: true,
    message: 'الإجازة صالحة'
  };
}

// ============================================================================
// حساب رصيد الإجازة السنوية
// ============================================================================

/**
 * حساب رصيد الإجازة السنوية
 * المعادلة: (21 ÷ 365) × أيام الخدمة
 *
 * @param hireDate تاريخ التوظيف
 * @param year السنة المطلوب حساب الرصيد لها
 * @param annualDays الأيام السنوية الكاملة (افتراضي 21)
 * @returns الرصيد بالكسور العشرية
 */
export function calculateAnnualLeaveBalance(
  hireDate: string,
  year: number = new Date().getFullYear(),
  annualDays: number = 21
): number {
  const hire = new Date(hireDate);

  // حساب أيام الخدمة في هذه السنة
  const yearStart = new Date(year, 0, 1); // 1 يناير من السنة
  const yearEnd = new Date(year, 11, 31); // 31 ديسمبر من السنة

  let daysOfService: number;

  if (hire < yearStart) {
    // الموظف كان موجوداً قبل بداية السنة
    daysOfService = Math.round(
      (yearEnd.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;
  } else {
    // الموظف تم توظيفه خلال هذه السنة
    const today = new Date();
    const endDate = today < yearEnd ? today : yearEnd;

    if (hire > endDate) {
      return 0; // لم يبدأ العمل بعد
    }

    daysOfService = Math.round(
      (endDate.getTime() - hire.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;
  }

  // المعادلة: (الأيام السنوية ÷ 365) × أيام الخدمة
  const balance = (annualDays / 365) * daysOfService;

  // تقريب لـ 3 خانات عشرية
  return Math.round(balance * 1000) / 1000;
}

// ============================================================================
// تنسيق وعرض الإجازات
// ============================================================================

/**
 * الحصول على نص نوع الإجازة بالعربية
 */
export function getLeaveTypeLabel(type: LeaveType): string {
  const labels: Record<LeaveType, string> = {
    سنوية: 'إجازة سنوية',
    مرضية: 'إجازة مرضية',
    وفاة_أول: 'إجازة وفاة (الدرجة الأولى)',
    وفاة_ثاني: 'إجازة وفاة (الصنف الثاني)',
    زواج: 'إجازة زواج',
    امتحانات: 'إجازة امتحانات',
    غير_مدفوعة: 'إجازة غير مدفوعة الأجر',
    حج: 'إجازة حج',
    تكليف: 'إجازة تكليف',
  };
  return labels[type] || type;
}

/**
 * الحصول على لون نوع الإجازة
 */
export function getLeaveTypeColor(type: LeaveType): string {
  const colors: Record<LeaveType, string> = {
    سنوية: '#22C55E',      // أخضر
    مرضية: '#EF4444',       // أحمر
    وفاة_أول: '#6B7280',   // رمادي
    وفاة_ثاني: '#9CA3AF',  // رمادي فاتح
    زواج: '#EC4899',        // وردي
    امتحانات: '#3B82F6',   // أزرق
    غير_مدفوعة: '#F59E0B', // برتقالي
    حج: '#8B5CF6',          // بنفسجي
    تكليف: '#14B8A6',      // زمردي
  };
  return colors[type] || '#6B7280';
}

/**
 * الحصول على نص حالة الإجازة
 */
export function getLeaveStatusLabel(status: LeaveStatus): string {
  const labels: Record<LeaveStatus, string> = {
    انتظار: 'بانتظار الموافقة',
    موافق: 'تمت الموافقة',
    مرفوض: 'مرفوض',
  };
  return labels[status];
}

/**
 * الحصول على لون حالة الإجازة
 */
export function getLeaveStatusColor(status: LeaveStatus): string {
  const colors: Record<LeaveStatus, string> = {
    انتظار: '#EAB308',  // أصفر
    موافق: '#22C55E',   // أخضر
    مرفوض: '#EF4444',   // أحمر
  };
  return colors[status] || '#6B7280';
}

// ============================================================================
// التحقق من أهلية الحج
// ============================================================================

export interface HajjEligibility {
  eligible: boolean;
  message: string;
}

/**
 * التحقق من أهلية الموظف لإجازة الحج
 */
export function checkHajjEligibility(
  balance: LeaveBalance | null
): HajjEligibility {
  if (!balance) {
    return {
      eligible: true,
      message: 'يمكنك التقديم على إجازة حج'
    };
  }

  if (balance.hajj_taken) {
    return {
      eligible: false,
      message: 'لقد حصلت على إجازة حج من قبل. لا يمكن التقديم مرة أخرى'
    };
  }

  return {
    eligible: true,
    message: 'يمكنك التقديم على إجازة حج'
  };
}

// ============================================================================
// تنسيق تاريخ الإجازة
// ============================================================================

/**
 * تنسيق تاريخ الإجازة للعرض
 * مثال: "من 2026-01-15 إلى 2026-01-20 = 4 أيام عمل"
 */
export function formatLeavePeriod(
  dateFrom: string,
  dateTo: string,
  workingDays: number
): string {
  const formatDate = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString('ar-IQ', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return `من ${formatDate(dateFrom)} إلى ${formatDate(dateTo)} = ${workingDays} أيام عمل`;
}

/**
 * الحصول على نطاق تاريخي افتراضي للإجازة
 * مثلاً: الأسبوع القادم
 */
export function getDefaultLeaveRange(days: number = 7): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() + 1); // غداً

  const to = new Date(from);
  to.setDate(to.getDate() + days - 1);

  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

/**
 * التحقق من إمكانية إلغاء طلب الإجازة
 * يمكن الإلغاء فقط إذا كانت الحالة "انتظار"
 */
export function canCancelLeave(status: LeaveStatus): boolean {
  return status === 'انتظار';
}

/**
 * الحصول على أيام الإجازة المتبقية هذا الشهر
 */
export function getRemainingLeaveDaysThisYear(
  balance: LeaveBalance | null,
  leaveType: LeaveType
): number {
  if (!balance) return 0;

  switch (leaveType) {
    case 'سنوية':
      return balance.annual_remaining;
    case 'مرضية':
      return balance.sick_remaining;
    default:
      // أنواع الإجازات الأخرى ليس لها رصيد محدد
      return 999;
  }
}