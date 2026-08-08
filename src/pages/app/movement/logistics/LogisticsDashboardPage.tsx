/**
 * L00 — برج المراقبة اللوجستي
 *
 * كانت هذه الصفحة تعرض أرقاماً ثابتة مكتوبة يدوياً (0 · 100% · 0 د.ع)
 * بلا أي استعلام. الآن تقرأ من:
 *   logistics_dashboard_kpis   — المؤشرات المحسوبة
 *   logistics_fleet_alerts     — الوثائق والرخص المنتهية
 */
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, BarChart3, CheckCircle2, Loader2, RefreshCw,
  ShieldCheck, Truck, Users, Wrench, Zap,
} from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { getErrorMessage } from '../../../../services/errors';
import {
  logisticsFleetOperationsService,
  type FleetAlertRecord,
  type LogisticsDashboardKpis,
} from '../../../../services/sdk/LogisticsFleetOperationsService';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { MovementUnitNav } from '../shared/MovementUnitNav';

const SEVERITY_STYLE: Record<string, { badge: string; label: string }> = {
  expired:  { badge: 'bg-rose-100 text-rose-700',       label: 'منتهية' },
  critical: { badge: 'bg-orange-100 text-orange-700',   label: 'خلال أسبوع' },
  urgent:   { badge: 'bg-amber-100 text-amber-700',     label: 'خلال شهر' },
  upcoming: { badge: 'bg-slate-100 text-slate-600',     label: 'قادمة' },
};

export default function LogisticsDashboardPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<LogisticsDashboardKpis | null>(null);
  const [alerts, setAlerts] = useState<FleetAlertRecord[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [k, a] = await Promise.all([
        logisticsFleetOperationsService.getDashboardKpis(),
        logisticsFleetOperationsService.findFleetAlerts(),
      ]);
      setKpis(k);
      setAlerts(a);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void loadData(); }, [loadData]);

  const readiness = Number(kpis?.fleet_readiness_percent ?? 0);
  const blocking = alerts.filter((a) => a.severity === 'expired');

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <MovementUnitNav unit="logistics_main" />

      <div className="bg-gradient-to-br from-indigo-700 to-slate-900 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Logistics Control • L00</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2">
            <Zap /> برج المراقبة اللوجستي
          </h2>
          <p className="text-white/75 mt-2 text-sm">
            متابعة الأسطول والسائقين والصيانة — البيانات محسوبة لحظياً.
          </p>
        </div>
        <Button
          onClick={() => void loadData()}
          className="!bg-white !text-indigo-900 hover:!bg-indigo-50 !border-none"
          icon={<RefreshCw size={16} />}
          iconPosition="left"
        >
          تحديث
        </Button>
      </div>

      {loading ? (
        <div className="py-20 flex items-center justify-center">
          <Loader2 className="animate-spin text-slate-400" size={32} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                  <Truck size={20} />
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-slate-900">{kpis?.total_vehicles ?? 0}</p>
                  <p className="text-xs text-slate-500">إجمالي المركبات</p>
                  <p className="text-[11px] text-slate-400">
                    {kpis?.vehicles_on_trip ?? 0} في رحلة · {kpis?.vehicles_in_maintenance ?? 0} صيانة
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  readiness >= 70 ? 'bg-emerald-50 text-emerald-700'
                  : readiness >= 40 ? 'bg-amber-50 text-amber-700'
                  : 'bg-rose-50 text-rose-700'}`}>
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-slate-900">{readiness}%</p>
                  <p className="text-xs text-slate-500">جاهزية الأسطول</p>
                  <p className="text-[11px] text-slate-400">
                    {kpis?.available_vehicles ?? 0} متاحة
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center">
                  <Users size={20} />
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-slate-900">{kpis?.active_drivers ?? 0}</p>
                  <p className="text-xs text-slate-500">السائقون النشطون</p>
                  {(kpis?.drivers_license_expiring ?? 0) > 0 && (
                    <p className="text-[11px] text-amber-600 font-bold">
                      {kpis?.drivers_license_expiring} رخصة تنتهي قريباً
                    </p>
                  )}
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                  <Wrench size={20} />
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-slate-900">{kpis?.open_maintenance_orders ?? 0}</p>
                  <p className="text-xs text-slate-500">أوامر صيانة مفتوحة</p>
                </div>
              </div>
            </Card>
          </div>

          {/* ما يمنع التشغيل فعلياً — يظهر أولاً */}
          {blocking.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="text-rose-600" size={18} />
                <h3 className="font-bold text-slate-900">
                  يمنع الإسناد الآن ({blocking.length})
                </h3>
              </div>
              <div className="space-y-2">
                {blocking.map((a) => (
                  <div
                    key={`${a.alert_kind}-${a.entity_id}-${a.detail}`}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-rose-200 bg-rose-50"
                  >
                    <div className="text-sm">
                      <span className="font-bold text-slate-900">{a.entity_code}</span>
                      <span className="text-slate-600"> — {a.detail}</span>
                    </div>
                    <span className="text-xs font-bold text-rose-700 whitespace-nowrap">
                      منتهية منذ {Math.abs(a.days_remaining)} يوماً
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 size={18} className="text-slate-500" />
              <h3 className="font-bold text-slate-900">تنبيهات الوثائق والرخص</h3>
            </div>
            {alerts.length === 0 ? (
              <div className="py-10 text-center text-slate-400">
                <CheckCircle2 className="mx-auto mb-2 text-emerald-500" size={28} />
                <p className="text-sm">لا تنبيهات — كل الوثائق والرخص سارية</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      {['النوع', 'الكيان', 'التفصيل', 'تاريخ الانتهاء', 'المتبقي', 'الحالة'].map((h) => (
                        <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((a) => {
                      const tone = SEVERITY_STYLE[a.severity] ?? SEVERITY_STYLE.upcoming;
                      return (
                        <tr
                          key={`${a.alert_kind}-${a.entity_id}-${a.detail}`}
                          className="border-b border-slate-50 hover:bg-slate-50/60"
                        >
                          <td className="py-3 px-4 text-slate-600">
                            {a.alert_kind === 'vehicle_document' ? 'وثيقة مركبة' : 'رخصة سائق'}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-900">{a.entity_code}</td>
                          <td className="py-3 px-4 text-slate-600">{a.detail}</td>
                          <td className="py-3 px-4 text-slate-500">{a.expiry_date}</td>
                          <td className="py-3 px-4 text-slate-600">
                            {a.days_remaining < 0
                              ? `منتهية منذ ${Math.abs(a.days_remaining)} يوماً`
                              : `${a.days_remaining} يوماً`}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`text-[11px] px-2 py-1 rounded-full font-bold ${tone.badge}`}>
                              {tone.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
