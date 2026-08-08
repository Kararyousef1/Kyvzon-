/**
 * MovementSafetyComplianceService — امتثال السلامة (0296)
 *
 * يغطي ثلاثة أنظمة مترابطة:
 *   • HOS  — ساعات القيادة والخدمة (11/14/70×8أيام)
 *   • DVIR — فحص المركبة، والعيب الحرج يوقفها تلقائياً
 *   • أعلام احتيال الوقود، منها تجاوز سعة الخزان
 *
 * الثلاثة مربوطة بـ check_assignment_eligibility: تجاوز أي حد يمنع
 * إسناد رحلة جديدة على مستوى الخادم — لا اعتماد على انضباط الواجهة.
 */
import { supabase } from '../supabase/supabase';

/* ─── HOS ─────────────────────────────────────────────────── */

export type DutyStatus = 'off_duty' | 'sleeper' | 'driving' | 'on_duty';

export const DUTY_STATUS_LABELS: Record<DutyStatus, string> = {
  off_duty: 'خارج الخدمة',
  sleeper: 'راحة في المقصورة',
  driving: 'قيادة',
  on_duty: 'على رأس العمل',
};

/** الحدود المطبَّقة في الخادم — معلنة هنا للعرض فقط */
export const HOS_LIMITS = {
  drivingMinutesPerDay: 660,   // 11 ساعة
  dutyMinutesPerDay: 840,      // 14 ساعة
  drivingMinutesPer8Days: 4200, // 70 ساعة
  minRestMinutes: 600,         // 10 ساعات
  warningThresholdMinutes: 600, // تحذير عند 10 ساعات قيادة
} as const;

export interface DriverHosSummary {
  driving_minutes_today: number;
  on_duty_minutes_today: number;
  driving_minutes_8days: number;
  last_rest_minutes: number;
  open_period_status: DutyStatus | null;
  open_period_minutes: number;
  driving_limit_exceeded: boolean;
  duty_limit_exceeded: boolean;
  cycle_limit_exceeded: boolean;
  rest_insufficient: boolean;
}

export type ComplianceStatus =
  | 'compliant' | 'hos_warning' | 'hos_violation'
  | 'license_expiring' | 'license_expired';

export const COMPLIANCE_LABELS: Record<ComplianceStatus, string> = {
  compliant: 'ملتزم',
  hos_warning: 'يقترب من الحد',
  hos_violation: 'تجاوز ساعات القيادة',
  license_expiring: 'رخصة توشك على الانتهاء',
  license_expired: 'رخصة منتهية',
};

export interface DriverCompliance {
  driver_id: string;
  tenant_id: string;
  driver_name_ar: string;
  driver_status: string;
  license_expiry_date: string;
  license_days_left: number;
  driving_minutes_today: number;
  on_duty_minutes_today: number;
  driving_minutes_8days: number;
  open_period_status: DutyStatus | null;
  open_period_minutes: number;
  hos_driving_exceeded: boolean;
  hos_duty_exceeded: boolean;
  hos_cycle_exceeded: boolean;
  compliance_status: ComplianceStatus;
}

/* ─── DVIR ────────────────────────────────────────────────── */

export type DefectSeverity = 'minor' | 'major' | 'critical';

export const SEVERITY_LABELS: Record<DefectSeverity, string> = {
  minor: 'بسيط',
  major: 'جوهري',
  critical: 'حرج — يوقف المركبة',
};

export type InspectionType = 'pre_trip' | 'post_trip' | 'periodic';

export const INSPECTION_TYPE_LABELS: Record<InspectionType, string> = {
  pre_trip: 'فحص ما قبل الرحلة',
  post_trip: 'فحص ما بعد الرحلة',
  periodic: 'فحص دوري',
};

/** بنود الفحص القياسية — مرجع موحَّد للواجهة */
export const DVIR_CHECKLIST: Array<{ code: string; label: string }> = [
  { code: 'BRAKES', label: 'الفرامل' },
  { code: 'TIRES', label: 'الإطارات' },
  { code: 'LIGHTS', label: 'الإنارة والإشارات' },
  { code: 'STEERING', label: 'المقود' },
  { code: 'MIRRORS', label: 'المرايا' },
  { code: 'WIPERS', label: 'المساحات' },
  { code: 'HORN', label: 'المنبّه' },
  { code: 'SEATBELT', label: 'أحزمة الأمان' },
  { code: 'FIRE_EXT', label: 'طفاية الحريق' },
  { code: 'FLUID_LEAK', label: 'تسرّب سوائل' },
  { code: 'COUPLING', label: 'وصلة المقطورة' },
  { code: 'CARGO_SECURE', label: 'تثبيت الحمولة' },
];

export interface VehicleDefect {
  code: string;
  severity: DefectSeverity;
  note?: string;
}

export interface InspectionResult {
  inspection_id: string;
  has_critical: boolean;
  /** true يعني أن المركبة نُقلت إلى out_of_service تلقائياً */
  vehicle_grounded: boolean;
}

export interface VehicleInspection {
  id: string;
  tenant_id: string;
  vehicle_id: string;
  driver_id: string | null;
  dispatch_id: string | null;
  inspection_type: InspectionType;
  odometer_km: number | null;
  defects: VehicleDefect[];
  has_critical: boolean;
  is_safe_to_operate: boolean;
  signature_name: string | null;
  notes: string | null;
  inspected_at: string;
}

export type VehicleSafetyStatus =
  | 'compliant' | 'grounded_defect' | 'document_expired'
  | 'never_inspected' | 'inspection_overdue';

export const VEHICLE_SAFETY_LABELS: Record<VehicleSafetyStatus, string> = {
  compliant: 'سليمة',
  grounded_defect: 'موقوفة — عيب حرج',
  document_expired: 'وثيقة منتهية',
  never_inspected: 'لم تُفحص قط',
  inspection_overdue: 'الفحص متأخر',
};

export interface VehicleSafety {
  vehicle_id: string;
  tenant_id: string;
  vehicle_code: string;
  plate_number: string;
  vehicle_status: string;
  fuel_tank_capacity_l: number | null;
  last_inspection_id: string | null;
  last_inspected_at: string | null;
  last_inspection_type: InspectionType | null;
  has_critical_defect: boolean;
  defect_count: number;
  expired_documents: number;
  safety_status: VehicleSafetyStatus;
}

/* ─── أعلام الوقود ────────────────────────────────────────── */

export const FUEL_FLAG_LABELS: Record<string, string> = {
  RAPID_REFUEL: 'تزوّدان خلال ساعة',
  ABNORMAL_CONSUMPTION: 'استهلاك شاذ',
  NO_DISTANCE_SINCE_LAST_REFUEL: 'لا مسافة منذ آخر تزوّد',
  EXCESSIVE_QUANTITY: 'كمية مفرطة',
  FUEL_FOR_ELECTRIC_VEHICLE: 'وقود لمركبة كهربائية',
  TANK_CAPACITY_EXCEEDED: 'تجاوز سعة الخزان',
};

export class MovementSafetyComplianceService {
  /* ─── HOS ─── */

  async getDriverHosSummary(driverId: string, date?: string): Promise<DriverHosSummary | null> {
    const { data, error } = await supabase.rpc('get_driver_hos_summary', {
      p_driver_id: driverId,
      p_date: date ?? new Date().toISOString().slice(0, 10),
    });
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data[0] : data) as DriverHosSummary | null;
  }

  /**
   * بدء فترة خدمة.
   *
   * تُرجع تحذيراً عند بلوغ الحدود لكنها **لا تمنع** — المنع مكانه
   * الصحيح هو الإسناد لا تسجيل الوقت. سائق تجاوز حدّه قد يحتاج
   * تسجيل فترة راحة، ومنعُه من ذلك يُفسد السجل.
   */
  async startDutyPeriod(input: {
    driverId: string;
    dutyStatus: DutyStatus;
    dispatchId?: string | null;
    notes?: string | null;
  }): Promise<{ logId: string; warning: string | null }> {
    const { data, error } = await supabase.rpc('start_driver_duty_period', {
      p_driver_id: input.driverId,
      p_duty_status: input.dutyStatus,
      p_dispatch_id: input.dispatchId ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as
      { log_id: string; hos_warning: string | null } | null;
    return { logId: row?.log_id ?? '', warning: row?.hos_warning ?? null };
  }

  /** يُرجع مدة الفترة بالدقائق */
  async endDutyPeriod(driverId: string, notes?: string | null): Promise<number> {
    const { data, error } = await supabase.rpc('end_driver_duty_period', {
      p_driver_id: driverId,
      p_notes: notes ?? null,
    });
    if (error) throw new Error(error.message);
    return Number(data ?? 0);
  }

  async findDriverCompliance(): Promise<DriverCompliance[]> {
    const { data, error } = await supabase
      .from('logistics_safety_compliance')
      .select('*')
      .order('driver_name_ar', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as DriverCompliance[];
  }

  /* ─── DVIR ─── */

  async recordInspection(input: {
    vehicleId: string;
    inspectionType: InspectionType;
    defects?: VehicleDefect[];
    odometerKm?: number | null;
    driverId?: string | null;
    dispatchId?: string | null;
    signatureName?: string | null;
    notes?: string | null;
  }): Promise<InspectionResult> {
    const { data, error } = await supabase.rpc('record_vehicle_inspection', {
      p_vehicle_id: input.vehicleId,
      p_inspection_type: input.inspectionType,
      p_defects: input.defects ?? [],
      p_odometer_km: input.odometerKm ?? null,
      p_driver_id: input.driverId ?? null,
      p_dispatch_id: input.dispatchId ?? null,
      p_signature_name: input.signatureName ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as InspectionResult | null;
    return {
      inspection_id: row?.inspection_id ?? '',
      has_critical: Boolean(row?.has_critical),
      vehicle_grounded: Boolean(row?.vehicle_grounded),
    };
  }

  /** رفع الإيقاف بفحص نظيف جديد — السجل الأصلي لا يُعدَّل */
  async clearDefects(vehicleId: string, notes: string): Promise<string> {
    const { data, error } = await supabase.rpc('clear_vehicle_defects', {
      p_vehicle_id: vehicleId,
      p_notes: notes,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async findInspections(vehicleId: string, limit = 20): Promise<VehicleInspection[]> {
    const { data, error } = await supabase
      .from('fleet_vehicle_inspections')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('inspected_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as VehicleInspection[];
  }

  async findVehicleSafety(): Promise<VehicleSafety[]> {
    const { data, error } = await supabase
      .from('logistics_vehicle_safety_status')
      .select('*')
      .order('vehicle_code', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as VehicleSafety[];
  }
}

export const movementSafetyComplianceService = new MovementSafetyComplianceService();
