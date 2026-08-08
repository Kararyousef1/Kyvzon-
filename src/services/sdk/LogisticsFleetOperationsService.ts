/**
 * LogisticsFleetOperationsService — عمليات الأسطول الكتابية
 *
 * ─────────────────────────────────────────────────────────────────────────
 * لماذا RPCs لا `BaseService.create()`؟
 *   قواعد الأعمال يجب أن تُفرَض في قاعدة البيانات لا في الواجهة:
 *     • لوحة مكرَّرة · سنة غير منطقية
 *     • عداد يتراجع (مؤشر تلاعب أو خطأ إدخال)
 *     • رخصة منتهية · وثيقة مركبة منتهية
 *     • صيانة مزدوجة · تغيير حالة بلا سبب
 *   الإدراج المباشر في الجداول يلتفّ على كل ذلك.
 *
 * كل دالة هنا تقابل RPC في المايجريشن 0283، وكلها محمية بـ
 * movement_require_role('logistics') ومسحوبة الصلاحية من anon.
 */
import { BaseService } from './BaseService';
import type {
  LogisticsVehicleRecord,
  LogisticsDriverRecord,
  LogisticsMaintenanceRecord,
} from '../../shared/types/logistics-fleet';

// ─── الأنواع ────────────────────────────────────────────────────

export type VehicleStatus = 'available' | 'on_trip' | 'maintenance' | 'out_of_service';
export type VehicleType = 'truck' | 'van' | 'pickup' | 'heavy_transport' | 'forklift' | 'car';
export type FuelType = 'diesel' | 'gasoline' | 'electric' | 'hybrid';
export type MaintenanceType = 'routine' | 'repair' | 'emergency' | 'inspection';

export interface CreateVehicleInput {
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  vehicleType?: VehicleType;
  fuelType?: FuelType;
  maxWeightKg?: number;
  maxVolumeCbm?: number;
  currentMileageKm?: number;
}

export interface CreateDriverInput {
  driverNameAr: string;
  licenseNumber: string;
  licenseClass: string;
  licenseExpiryDate: string;
  phone?: string;
  employeeId?: string;
}

/** نتيجة فحص الأهلية — قد تُرجع عدة عوائق دفعةً واحدة */
export interface AssignmentEligibilityRow {
  is_eligible: boolean;
  blocker_code: string;
  blocker_msg: string;
}

export interface LogisticsDashboardKpis {
  total_vehicles: number;
  available_vehicles: number;
  vehicles_on_trip: number;
  vehicles_in_maintenance: number;
  active_drivers: number;
  drivers_license_expiring: number;
  expired_vehicle_documents: number;
  open_maintenance_orders: number;
  fleet_readiness_percent: number;
}

export interface FleetAlertRecord {
  alert_kind: 'vehicle_document' | 'driver_license';
  entity_id: string;
  entity_code: string;
  detail: string;
  expiry_date: string;
  days_remaining: number;
  severity: 'expired' | 'critical' | 'urgent' | 'upcoming';
}

// ─── الخدمة ─────────────────────────────────────────────────────

class LogisticsFleetOperationsService extends BaseService<LogisticsVehicleRecord> {
  constructor() {
    super('logistics_vehicles');
  }

  /**
   * إنشاء مركبة.
   * أخطاء متوقَّعة: DUPLICATE_PLATE_NUMBER · INVALID_VEHICLE_YEAR ·
   * PLATE_NUMBER_REQUIRED · MAKE_AND_MODEL_REQUIRED · NEGATIVE_VALUE_NOT_ALLOWED
   */
  async createVehicle(input: CreateVehicleInput): Promise<string> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase.rpc('create_fleet_vehicle', {
      p_plate_number: input.plateNumber,
      p_make: input.make,
      p_model: input.model,
      p_year: input.year,
      p_vehicle_type: input.vehicleType ?? 'truck',
      p_fuel_type: input.fuelType ?? 'diesel',
      p_max_weight_kg: input.maxWeightKg ?? 0,
      p_max_volume_cbm: input.maxVolumeCbm ?? 0,
      p_current_mileage_km: input.currentMileageKm ?? 0,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  /** تغيير حالة المركبة — السبب إلزامي (≥ 5 أحرف) ويُسجَّل في التدقيق */
  async setVehicleStatus(
    vehicleId: string,
    status: VehicleStatus,
    reason: string,
  ): Promise<void> {
    const { supabase } = await import('../supabase/supabase');
    const { error } = await supabase.rpc('set_vehicle_status', {
      p_vehicle_id: vehicleId,
      p_status: status,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
  }

  /**
   * تحديث العداد. يُرجع المسافة المقطوعة منذ آخر قراءة.
   * يرفض التراجع: MILEAGE_CANNOT_DECREASE
   */
  async updateMileage(vehicleId: string, mileageKm: number): Promise<number> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase.rpc('update_vehicle_mileage', {
      p_vehicle_id: vehicleId,
      p_mileage_km: mileageKm,
    });
    if (error) throw new Error(error.message);
    return Number(data ?? 0);
  }

  /** إنشاء سائق — يرفض الرخصة المنتهية والرقم المكرَّر */
  async createDriver(input: CreateDriverInput): Promise<string> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase.rpc('create_fleet_driver', {
      p_driver_name_ar: input.driverNameAr,
      p_license_number: input.licenseNumber,
      p_license_class: input.licenseClass,
      p_license_expiry_date: input.licenseExpiryDate,
      p_phone: input.phone ?? null,
      p_employee_id: input.employeeId ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  /**
   * فحص أهلية إسناد مركبة + سائق.
   * يُرجع كل العوائق دفعةً واحدة لا أولها فقط — حتى يرى المُرسِل
   * الصورة الكاملة بدل إصلاح عائق واحد في كل محاولة.
   */
  async checkAssignmentEligibility(
    vehicleId: string,
    driverId: string,
  ): Promise<AssignmentEligibilityRow[]> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase.rpc('check_assignment_eligibility', {
      p_vehicle_id: vehicleId,
      p_driver_id: driverId,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as AssignmentEligibilityRow[];
  }

  /** هل الإسناد مسموح؟ (مختصر: لا عائق واحد بـ is_eligible=false) */
  async isAssignmentAllowed(vehicleId: string, driverId: string): Promise<boolean> {
    const rows = await this.checkAssignmentEligibility(vehicleId, driverId);
    return rows.length > 0 && rows.every((r) => r.is_eligible);
  }

  /** جدولة صيانة — الوصف إلزامي · صيانة اليوم تُخرج المركبة من الخدمة */
  async scheduleMaintenance(input: {
    vehicleId: string;
    maintenanceType: MaintenanceType;
    scheduledDate: string;
    description: string;
    estimatedCost?: number;
  }): Promise<string> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase.rpc('schedule_vehicle_maintenance', {
      p_vehicle_id: input.vehicleId,
      p_maintenance_type: input.maintenanceType,
      p_scheduled_date: input.scheduledDate,
      p_description: input.description,
      p_estimated_cost: input.estimatedCost ?? 0,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  /** إكمال الصيانة — تعيد المركبة للخدمة إن لم يبقَ أمر مفتوح */
  async completeMaintenance(
    maintenanceId: string,
    actualCost: number,
    notes?: string,
  ): Promise<void> {
    const { supabase } = await import('../supabase/supabase');
    const { error } = await supabase.rpc('complete_vehicle_maintenance', {
      p_maintenance_id: maintenanceId,
      p_actual_cost: actualCost,
      p_notes: notes ?? null,
    });
    if (error) throw new Error(error.message);
  }

  /** مؤشرات لوحة القيادة — تستبدل الأرقام الثابتة في الواجهة */
  async getDashboardKpis(): Promise<LogisticsDashboardKpis | null> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase
      .from('logistics_dashboard_kpis')
      .select('*')
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as LogisticsDashboardKpis) ?? null;
  }

  /** تنبيهات الوثائق والرخص المنتهية أو المقاربة */
  async findFleetAlerts(): Promise<FleetAlertRecord[]> {
    const { supabase } = await import('../supabase/supabase');
    const { data, error } = await supabase
      .from('logistics_fleet_alerts')
      .select('*')
      .order('days_remaining', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as FleetAlertRecord[];
  }
}

export const logisticsFleetOperationsService = new LogisticsFleetOperationsService();

export type {
  LogisticsVehicleRecord,
  LogisticsDriverRecord,
  LogisticsMaintenanceRecord,
};
