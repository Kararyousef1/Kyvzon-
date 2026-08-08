/**
 * ════════════════════════════════════════════════════════════════
 *  PayrollPage — نظام الرواتب (أُعيد توصيله في 0348)
 * ════════════════════════════════════════════════════════════════
 *
 *  ★★★ ما كان قبل 0348 — أعطال مُثبتة تشغيلياً على Postgres:
 *
 *  ① زرّ «فترة رواتب جديدة» يفشل **دائماً**: الصفحة ترسل
 *    `frequency` و`payment_date` والجدول لا يحويهما ⇒
 *      column "frequency" of relation "payroll_periods" does not exist
 *
 *  ② ومحفّز يُسند `NEW.updated_at` والعمود غير موجود ⇒ **كل**
 *    UPDATE على الفترة يفشل بـ record "new" has no field "updated_at"
 *    ⇒ «تشغيل الرواتب» و«الاعتماد» معطّلان تماماً.
 *
 *  ③ `basic_salary: emp.base_salary || emp.salary || 0` — و`employees`
 *    لا يحوي أياً من العمودين (مُقاس: 0). الراتب الحقيقي في
 *    `employee_contracts.salary_amount` و`profiles.salary`.
 *    ⇒ **كشف رواتب كامل بأصفار** يُعتمد ويُدفع.
 *
 *  ④ `working_days: 26 · present_days: 26 · absent_days: 0` مكتوبة
 *    يدوياً ⇒ لا غياب لأحد أبداً — رغم أن `attendance_summary` صار
 *    يُبنى من البصمات فعلياً بعد 0347.
 *
 *  ⑤ الإعدادات المالية كلها مُهمَلة (ضريبة · ضمان · أوفرتايم · خصم
 *    غياب)، وأقساط القروض لا تُخصم فلا يُسدَّد قرضٌ أبداً.
 *
 *  ⑥ `upsertRecords` هو `create` في حلقة بلا قيد فريد ⇒ ضغطتان على
 *    «تشغيل الرواتب» = **راتب مضاعف**.
 *
 *  ⑦ لا حراسة انتقال ولا أثر تدقيق: اعتماد مرّتين مسموح، والكتابة
 *    فوق فترة معتمَدة مسموحة، ولا يُعرف من وافق ومتى.
 *
 *  الحساب كلّه انتقل إلى `payroll_run` الذرّية.
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, Calendar, Plus, Loader2, FileText, CheckCircle,
  XCircle, Eye, Play, TrendingUp, Users,
} from 'lucide-react';
import { useUIStore } from '../../core/stores';
import { payrollPeriodService, payrollRecordService, payrollSettingService, employeeService } from '../../services/sdk';
import {
  payrollRunService, type PayrollSummary,
} from '../../services/sdk/PayrollRunService';
import { getErrorMessage } from '../../services/errors';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import type { PayrollPeriod, PayrollRecord, PayrollStatus } from '../../shared/types/payroll';
import {
  PAYROLL_STATUS_LABELS, PAYROLL_STATUS_COLORS, PAYROLL_FREQUENCY_LABELS,
  formatCurrency,
} from '../../utils/payrollUtils';

type Tab = 'periods' | 'records' | 'settings';

export default function PayrollPage() {
  const { addToast } = useUIStore();
  const [tab, setTab] = useState<Tab>('periods');
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [running, setRunning] = useState(false);
  // ★ نوافذ التأكيد — بديل confirm() المحظور بسياسة المنصة.
  //   إجراءا الرواتب هنا واسعا الأثر: تشغيل الرواتب يُنشئ سجلاً لكل
  //   موظف نشط، والاعتماد يُقفل الفترة كاملةً.
  const [confirmRun, setConfirmRun] = useState<PayrollPeriod | null>(null);
  const [confirmApprove, setConfirmApprove] = useState<PayrollPeriod | null>(null);
  // ★★ 0348: لم يكن للصفحة ملخّص مالي إطلاقاً
  const [summary, setSummary] = useState<PayrollSummary | null>(null);

  // نموذج إنشاء فترة جديدة
  const [formData, setFormData] = useState({
    name: '',
    frequency: 'monthly' as PayrollPeriod['frequency'],
    start_date: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'),
    end_date: format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), 'yyyy-MM-dd'),
    payment_date: format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 5), 'yyyy-MM-dd'),
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await payrollPeriodService.findAllPeriods();
      setPeriods((data || []) as PayrollPeriod[]);

      if ((data || []).length > 0 && !selectedPeriod) {
        setSelectedPeriod(data![0].id);
      }
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, selectedPeriod]);

  const fetchRecords = useCallback(async () => {
    if (!selectedPeriod) return;
    try {
      const data = await payrollRecordService.findByPeriod(selectedPeriod);
      const employees = await employeeService.findAll({ orderBy: 'full_name_ar' });
      const empMap = new Map((employees || []).map((e: any) => [e.id, e]));
      const enriched = (data || []).map((r: any) => ({ ...r, employees: empMap.get(r.employee_id) || null }));
      setRecords(enriched as unknown as PayrollRecord[]);
      setSummary(await payrollRunService.summary(selectedPeriod));
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  }, [selectedPeriod, addToast]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (tab === 'records') fetchRecords(); }, [tab, fetchRecords]);

  // إنشاء فترة رواتب جديدة
  const handleCreatePeriod = async () => {
    if (!formData.name || !formData.start_date || !formData.end_date) {
      addToast('يرجى ملء جميع الحقول المطلوبة', 'warning');
      return;
    }
    setRunning(true);
    try {
      await payrollPeriodService.createPeriod({ ...formData, status: 'draft' } as unknown as Record<string, unknown>);
      addToast('تم إنشاء فترة الرواتب بنجاح', 'success');
      setShowCreateModal(false);
      setFormData({
        name: '', frequency: 'monthly',
        start_date: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'),
        end_date: format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), 'yyyy-MM-dd'),
        payment_date: format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 5), 'yyyy-MM-dd'),
      });
      await fetchData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setRunning(false);
    }
  };

  /**
   * تشغيل الرواتب.
   *
   * ★★★ الحساب كلّه في القاعدة الآن: الراتب من العقد النافذ ثم الملف
   *   ثم الافتراضي · والحضور من `attendance_summary` الفعليّ · مع
   *   الضريبة والضمان والأوفرتايم وخصم الغياب وأقساط القروض.
   *   والدالة ترفض التشغيل على فترة معتمَدة، ولا تُضاعف السجلّات.
   */
  const handleRunPayroll = async (period: PayrollPeriod) => {
    setConfirmRun(null);
    setRunning(true);
    try {
      const res = await payrollRunService.run(period.id);
      addToast(
        `شُغّلت الرواتب لـ${res.employees} موظف · الصافي ${formatCurrency(res.net)}`,
        'success',
      );
      await fetchData();
      if (tab === 'records') await fetchRecords();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setRunning(false);
    }
  };

  /**
   * اعتماد الرواتب.
   *
   * ★★ الدالة تُسجّل `approved_by` و`approved_at` و`locked_at`، وترفض
   *   الاعتماد المكرّر وفترةً بلا سجلّات.
   */
  const handleApprovePeriod = async (period: PayrollPeriod) => {
    setConfirmApprove(null);
    setRunning(true);
    try {
      const n = await payrollRunService.approve(period.id);
      addToast(`اعتُمدت الرواتب — ${n} سجلّاً`, 'success');
      await fetchData();
      if (tab === 'records') await fetchRecords();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* الهيدر */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <DollarSign className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">نظام الرواتب</h1>
            <p className="text-sm text-slate-500">إدارة فترات وكشوف الرواتب</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold transition-colors shadow-sm"
        >
          <Plus size={18} /> فترة رواتب جديدة
        </button>
      </div>

      {/* التبويبات */}
      <div className="flex gap-2 mb-6 border-b border-slate-200">
        {([
          { key: 'periods', label: 'فترات الرواتب', icon: Calendar },
          { key: 'records', label: 'كشوف الرواتب', icon: FileText },
          { key: 'settings', label: 'الإعدادات', icon: TrendingUp },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-3 font-semibold transition-colors border-b-2 ${
              tab === key
                ? 'text-emerald-600 border-emerald-600'
                : 'text-slate-500 border-transparent hover:text-slate-700'
            }`}
          >
            <Icon size={18} /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="animate-spin text-emerald-500 mb-3" size={40} />
          <p className="text-slate-500">جاري التحميل...</p>
        </div>
      ) : tab === 'periods' ? (
        /* قائمة الفترات */
        <div className="grid gap-4">
          {periods.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="لا توجد فترات رواتب"
              subtitle="ابدأ بإنشاء فترة رواتب جديدة"
            />
          ) : (
            periods.map((period) => {
              const statusColor = PAYROLL_STATUS_COLORS[period.status] || PAYROLL_STATUS_COLORS.draft;
              return (
                <div key={period.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-slate-900">{period.name}</h3>
                        <span
                          className="px-2.5 py-1 rounded-full text-xs font-semibold"
                          style={{ background: statusColor.bg, color: statusColor.text }}
                        >
                          {PAYROLL_STATUS_LABELS[period.status]}
                        </span>
                        <span className="text-xs text-slate-400">
                          {PAYROLL_FREQUENCY_LABELS[period.frequency]}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
                        <span className="flex items-center gap-1">
                          <Calendar size={14} />
                          {format(new Date(period.start_date), 'd MMM yyyy', { locale: ar })}
                          {' ← '}
                          {format(new Date(period.end_date), 'd MMM yyyy', { locale: ar })}
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign size={14} />
                          صرف: {format(new Date(period.payment_date), 'd MMM yyyy', { locale: ar })}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {period.status === 'draft' && (
                        <button
                          onClick={() => setConfirmRun(period)}
                          disabled={running}
                          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-semibold hover:bg-emerald-100 transition-colors disabled:opacity-50"
                        >
                          <Play size={14} /> تشغيل
                        </button>
                      )}
                      {period.status === 'pending_approval' && (
                        <>
                          <button
                            onClick={() => { setSelectedPeriod(period.id); setTab('records'); }}
                            className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-100 transition-colors"
                          >
                            <Eye size={14} /> عرض
                          </button>
                          <button
                            onClick={() => setConfirmApprove(period)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors"
                          >
                            <CheckCircle size={14} /> اعتماد
                          </button>
                        </>
                      )}
                      {(period.status === 'approved' || period.status === 'paid') && (
                        <button
                          onClick={() => { setSelectedPeriod(period.id); setTab('records'); }}
                          className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-100 transition-colors"
                        >
                          <Eye size={14} /> عرض الكشف
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : tab === 'records' ? (
        /* كشوف الرواتب */
        <div>
          <div className="mb-4">
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="w-full sm:w-80 px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              <option value="">اختر الفترة...</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {records.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="لا توجد سجلات"
              subtitle={selectedPeriod ? 'لم يتم تشغيل الرواتب لهذه الفترة بعد' : 'اختر فترة لعرض سجلاتها'}
            />
          ) : (
            <>
              {/* ملخص الفترة
                  ★★ 0348: كانت البطاقات تُجمِّع `records` المحمَّلة في
                  المتصفح — فترشيحٌ أو صفحةٌ جزئية يُغيّران «إجمالي
                  الرواتب». الملخّص الآن محسوب في القاعدة على **كل**
                  سجلّات الفترة. */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                <StatCard label="عدد الموظفين"
                  value={String(summary?.records ?? records.length)}
                  icon={Users} color="#6366f1" />
                <StatCard label="إجمالي المستحقّ"
                  value={formatCurrency(summary?.gross ?? 0)}
                  icon={DollarSign} color="#0ea5e9" />
                {/* ★★★ الاستقطاعات: كانت صفراً أبداً (لا ضريبة ولا ضمان
                    ولا قروض) — بطاقة جديدة تكشفها */}
                <StatCard label="الاستقطاعات"
                  value={formatCurrency(summary?.deductions ?? 0)}
                  icon={XCircle} color="#ef4444" />
                <StatCard label="صافي الرواتب"
                  value={formatCurrency(summary?.net ?? 0)}
                  icon={CheckCircle} color="#10b981" />
                <StatCard label="متوسط الصافي"
                  value={formatCurrency(summary?.avgNet ?? 0)}
                  icon={TrendingUp} color="#f59e0b" />
                {/* ★★★ أيام الغياب: كانت 0 أبداً (absent_days مكتوبة
                    يدوياً) — الآن من attendance_summary الفعليّ */}
                <StatCard label="أيام غياب · ساعات إضافية"
                  value={`${summary?.absentDays ?? 0} · ${summary?.overtimeHours ?? 0}`}
                  icon={Calendar} color="#8b5cf6" />
              </div>

              {/* جدول السجلات */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-right">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase">الموظف</th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase">الأساسي</th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase">البدلات</th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase">الاستقطاعات</th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase">الإضافي</th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase">الجوائز</th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase">صافي الراتب</th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {records.map((r) => {
                        const emp = r as unknown as { employees?: { employee_code: string; full_name_ar: string } };
                        const statusColor = PAYROLL_STATUS_COLORS[r.status] || PAYROLL_STATUS_COLORS.draft;
                        return (
                          <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-900 text-sm">{emp.employees?.full_name_ar || '—'}</p>
                              <p className="text-xs text-slate-400">{emp.employees?.employee_code}</p>
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-700">{formatCurrency(r.basic_salary)}</td>
                            <td className="px-4 py-3 text-sm text-emerald-600">+{formatCurrency(r.total_allowances)}</td>
                            <td className="px-4 py-3 text-sm text-red-600">-{formatCurrency(r.total_deductions)}</td>
                            <td className="px-4 py-3 text-sm text-emerald-600">+{formatCurrency(r.overtime_pay)}</td>
                            <td className="px-4 py-3 text-sm text-emerald-600">+{formatCurrency(r.bonus_amount)}</td>
                            <td className="px-4 py-3 font-bold text-slate-900">{formatCurrency(r.net_salary)}</td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-1 rounded-full text-xs font-semibold"
                                style={{ background: statusColor.bg, color: statusColor.text }}>
                                {PAYROLL_STATUS_LABELS[r.status]}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        /* الإعدادات */
        <PayrollSettingsTab />
      )}

      {/* Modal: إنشاء فترة */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">فترة رواتب جديدة</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle size={20} />
              </button>
            </div>
            <div className="space-y-3">
              <Field label="اسم الفترة" required>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="مثال: رواتب يونيو 2026"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              </Field>
              <Field label="نوع الفترة">
                <select
                  value={formData.frequency}
                  onChange={(e) => setFormData({ ...formData, frequency: e.target.value as PayrollPeriod['frequency'] })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500"
                >
                  {Object.entries(PAYROLL_FREQUENCY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="من تاريخ" required>
                  <input type="date" value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500" />
                </Field>
                <Field label="إلى تاريخ" required>
                  <input type="date" value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500" />
                </Field>
              </div>
              <Field label="تاريخ الصرف" required>
                <input type="date" value={formData.payment_date}
                  onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500" />
              </Field>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 transition-colors">
                إلغاء
              </button>
              <button onClick={handleCreatePeriod} disabled={running}
                className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {running ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                إنشاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ★ تأكيد تشغيل الرواتب — Modal لا confirm() (سياسة المنصة) */}
      {confirmRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" dir="rtl">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-800">تشغيل الرواتب</h3>
            <p className="text-sm text-slate-700">
              تشغيل رواتب الفترة <b>«{confirmRun.name}»</b>؟
            </p>
            <p className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed">
              سيُنشأ سجل راتب لكل موظف نشط في هذه الفترة. الإجراء واسع الأثر.
            </p>
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setConfirmRun(null)} disabled={running}
                className="px-5 py-2.5 bg-white border rounded-xl font-bold text-sm disabled:opacity-50">
                تراجع
              </button>
              <button onClick={() => void handleRunPayroll(confirmRun)} disabled={running}
                className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center gap-2">
                {running && <Loader2 size={14} className="animate-spin" />}
                تشغيل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ★ تأكيد اعتماد الرواتب */}
      {confirmApprove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" dir="rtl">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-800">اعتماد الرواتب</h3>
            <p className="text-sm text-slate-700">
              اعتماد رواتب الفترة <b>«{confirmApprove.name}»</b>؟
            </p>
            <p className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed">
              ستُعتمد الفترة وكل سجلات الرواتب فيها.
            </p>
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setConfirmApprove(null)}
                className="px-5 py-2.5 bg-white border rounded-xl font-bold text-sm">
                تراجع
              </button>
              <button onClick={() => void handleApprovePeriod(confirmApprove)}
                className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm">
                اعتماد
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════ مكون الإعدادات ═══════════════════

function PayrollSettingsTab() {
  const { addToast } = useUIStore();
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await payrollSettingService.findSettings();
        // fallback آمن إن لم توجد إعدادات محفوظة بعد (يمنع قراءة خصائص من null)
        setSettings(data ?? {
          default_currency: 'IQD',
          working_days_per_month: 26,
          tax_rate: 0,
          social_security_rate: 0,
          overtime_rate: 1.5,
          late_penalty_per_minute: 0,
          absence_penalty_per_day: 0,
          max_loan_amount: 0,
          max_loan_months: 12,
        });
      } catch (err) {
        addToast(getErrorMessage(err), 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [addToast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await payrollSettingService.updateSettings('1', {
        default_currency: settings.default_currency,
        tax_rate: Number(settings.tax_rate),
        social_security_rate: Number(settings.social_security_rate),
        overtime_rate: Number(settings.overtime_rate),
        late_penalty_per_minute: Number(settings.late_penalty_per_minute),
        absence_penalty_per_day: Number(settings.absence_penalty_per_day),
        working_days_per_month: Number(settings.working_days_per_month),
        max_loan_amount: Number(settings.max_loan_amount),
        max_loan_months: Number(settings.max_loan_months),
      } as unknown as Record<string, unknown>);
      addToast('تم حفظ الإعدادات', 'success');
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-20"><Loader2 className="animate-spin mx-auto text-emerald-500" size={40} /></div>;

  // حارس أمان: إن تعذّر تحميل الإعدادات (خطأ شبكة) لا نُعطب الصفحة
  if (!settings) return <div className="text-center py-20 text-slate-400">تعذّر تحميل إعدادات الرواتب. حاول لاحقاً.</div>;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-2xl">
      <h3 className="text-lg font-bold text-slate-900 mb-4">إعدادات الرواتب</h3>
      <div className="grid grid-cols-2 gap-4">
        <Field label="العملة الافتراضية">
          <select value={settings.default_currency || 'IQD'}
            onChange={(e) => setSettings({ ...settings, default_currency: e.target.value })}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg">
            <option value="IQD">دينار عراقي (IQD)</option>
            <option value="USD">دولار أمريكي (USD)</option>
            <option value="SAR">ريال سعودي (SAR)</option>
          </select>
        </Field>
        <Field label="أيام العمل بالشهر">
          <input type="number" value={settings.working_days_per_month || 26}
            onChange={(e) => setSettings({ ...settings, working_days_per_month: e.target.value })}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
        </Field>
        <Field label="نسبة الضريبة (%)">
          <input type="number" step="0.01" value={settings.tax_rate || 0}
            onChange={(e) => setSettings({ ...settings, tax_rate: e.target.value })}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
        </Field>
        <Field label="نسبة التأمينات (%)">
          <input type="number" step="0.01" value={settings.social_security_rate || 0}
            onChange={(e) => setSettings({ ...settings, social_security_rate: e.target.value })}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
        </Field>
        <Field label="معامل الوقت الإضافية">
          <input type="number" step="0.1" value={settings.overtime_rate || 1.5}
            onChange={(e) => setSettings({ ...settings, overtime_rate: e.target.value })}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
        </Field>
        <Field label="غرامة التأخير/دقيقة">
          <input type="number" value={settings.late_penalty_per_minute || 0}
            onChange={(e) => setSettings({ ...settings, late_penalty_per_minute: e.target.value })}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
        </Field>
        <Field label="غرامة الغياب/يوم">
          <input type="number" value={settings.absence_penalty_per_day || 0}
            onChange={(e) => setSettings({ ...settings, absence_penalty_per_day: e.target.value })}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
        </Field>
        <Field label="أقصى مبلغ سلفة">
          <input type="number" value={settings.max_loan_amount || 0}
            onChange={(e) => setSettings({ ...settings, max_loan_amount: e.target.value })}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
        </Field>
      </div>
      <button onClick={handleSave} disabled={saving}
        className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 disabled:opacity-50">
        {saving ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle size={18} />}
        حفظ الإعدادات
      </button>
    </div>
  );
}

// ═══════════════════ مكونات مساعدة ═══════════════════

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${color}22` }}>
          <Icon size={18} color={color} />
        </div>
        <div>
          <p className="text-lg font-bold text-slate-900">{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function EmptyState({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
        <Icon size={28} className="text-slate-400" />
      </div>
      <p className="font-semibold text-slate-700">{title}</p>
      <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
    </div>
  );
}
