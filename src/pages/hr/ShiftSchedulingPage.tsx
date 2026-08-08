/**
 * ShiftSchedulingPage — جدولة الورديات (HR) · migration 0368
 *
 * ★★★★ **العطل الأول: زرُّ «تعيين وردية» لم يعمل يوماً.**
 *
 *   `shift_assignments.schedule_id` هو **NOT NULL بلا افتراضيّ**،
 *   والصفحة القديمة لا ترسله إطلاقاً (السطر 60):
 *      upsertAssignment({ employee_id, shift_type, shift_date, notes })
 *
 *   PROBE_1 بمحاكاةٍ حرفية لهذا النداء:
 *      رُفض: null value in column "schedule_id" … violates not-null
 *
 *   ⇒ كلُّ ضغطةٍ على «تعيين» كانت تُخرج رسالة خطأ. لوحةُ عرضٍ لجدولٍ
 *     لا سبيل إلى ملئه. والعمود يشير إلى **جدولٍ غير موجود** أصلاً.
 *
 * ★★★★ **العطل الثاني: مفردات الصفحة غير موجودة في المنظومة.**
 *   كانت تُبرمج 'صباحي'·'مسائي'·'ليلي' بالنصّ وتكتب أوقاتها يدوياً
 *   («08:00 - 16:00»)، و`structure_shifts` تعرّف أربعاً بأسماءٍ
 *   وأكوادٍ **مختلفة**. PROBE_8: صفوفٌ باسم 'صباحي' = **صفر**.
 *   ⇒ «وردية مرنة» لا سبيل إلى إسنادها، ودالة `shift_catalog()`
 *     موجودةٌ منذ 0318 ولم تُستعمل.
 *
 * ★ وبقيّة الأعطال: صفر FK (وردية لموظفٍ معدوم أو من مستأجرٍ آخر) ·
 *   `tenant_id` قابلٌ للعدم · `shift_type` بلا CHECK ⇒
 *   `shiftConfig[shift]` = undefined · `assigned_by` بلا FK ولا ملء ·
 *   وردياتٌ في 2018 و2034 · ★★★★ **الجدولة تتجاهل الإجازات المعتمدة**
 *   (موظفٌ في إجازة مجدولٌ على وردية ⇒ يُسجَّل غائباً ويُخصم راتبه) ·
 *   ★★★ **لا حدَّ أدنى للراحة** (ليلي ثم صباحي = صفر ساعة) ·
 *   الحذف النهائيّ مسموح.
 *
 * ★ وأعطال الصفحة نفسها:
 *   · `useState<any[]>([])` مرّتين و`(a: any)` في المُرشِّح.
 *   · جلبُ **كل** الورديات ثم ترشيحها في المتصفّح بـ`.filter()`.
 *   · `orderBy: 'full_name_ar'` على عمودٍ معدومٍ لكل موظف.
 *   · `getShiftForDay` بحثٌ خطّيّ داخل حلقتين ⇒ O(موظفين×7×ورديات).
 *   · لا زرَّ حذفٍ ولا إلغاءٍ — إسنادٌ بلا تراجع.
 *   · جدولُ الموظفين يعرض **كل** موظفٍ ولو بلا وردية، بلا ترقيم.
 *
 * ★ الصفحة لا تلمس Supabase — كل شيء عبر `shiftScheduleSdk`.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CalendarClock, Plus, Loader2, Sun, Moon, Sunrise, Clock,
  AlertTriangle, Ban, Search, ChevronRight, ChevronLeft, Eye,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useUIStore } from '../../core/stores';
import { getErrorMessage } from '../../services/errors';
import { format, addDays, parseISO } from 'date-fns';
import { ar } from 'date-fns/locale';
import {
  shiftScheduleSdk, SHIFT_CODES,
  shiftCodeLabel, shiftStateLabel, shiftCodeTone, shiftStateTone,
  isShiftCancelled,
} from '../../services/sdk';
import type {
  ShiftRow, ShiftSummary, ShiftCode, ShiftConflict,
} from '../../services/sdk';
import { Modal, FormField, ModalActions, EmployeePicker, DetailRow } from './LoansPage';

/**
 * ★★★ اليوم بتوقيت بغداد — القاعدة تستعمل
 *   `AT TIME ZONE 'Asia/Baghdad'` في المحفّز وفي كل حساب.
 */
function todayBaghdad(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** ★ بداية الأسبوع (السبت) لتاريخٍ نصّيّ — بحسابٍ نصّيٍّ لا زمنيّ */
function weekStartOf(iso: string): string {
  const d = parseISO(iso);
  // getDay: الأحد=0 … السبت=6 ⇒ الإزاحة إلى السبت السابق
  const back = (d.getDay() + 1) % 7;
  return format(addDays(d, -back), 'yyyy-MM-dd');
}

function shiftDate(iso: string, n: number): string {
  return format(addDays(parseISO(iso), n), 'yyyy-MM-dd');
}

const SHIFT_ICON: Record<string, LucideIcon> = {
  morning: Sun, evening: Sunrise, night: Moon, flexible: Clock,
};

export default function ShiftSchedulingPage() {
  const { addToast } = useUIStore();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [conflicts, setConflicts] = useState<ShiftConflict[]>([]);

  const [weekStart, setWeekStart] = useState(() => weekStartOf(todayBaghdad()));
  const [search, setSearch] = useState('');

  const [showAssign, setShowAssign] = useState(false);
  const [form, setForm] = useState({
    employeeId: '',
    shiftType: 'morning' as ShiftCode,
    shiftDate: todayBaghdad(),
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [detail, setDetail] = useState<ShiftRow | null>(null);
  const [cancelling, setCancelling] = useState<ShiftRow | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // ★ العطل ⑭: استعلامان بحدود التاريخ بدل جلب كل شيء وترشيحه بالمتصفّح
      const [board, sum, conf] = await Promise.all([
        shiftScheduleSdk.board(weekStart, 7),
        shiftScheduleSdk.summary(weekStart, 7).catch(() => null),
        shiftScheduleSdk.leaveConflicts(weekStart, 7).catch(() => []),
      ]);
      setRows(board);
      setSummary(sum);
      setConflicts(conf);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, weekStart]);

  useEffect(() => { load(); }, [load]);

  const handleAssign = async () => {
    if (!form.employeeId) { addToast('اختر الموظف', 'warning'); return; }
    if (!form.shiftDate) { addToast('تاريخ الوردية مطلوب', 'warning'); return; }
    setSaving(true);
    try {
      await shiftScheduleSdk.assign({
        employeeId: form.employeeId,
        shiftType: form.shiftType,
        shiftDate: form.shiftDate,
        notes: form.notes.trim() || null,
      });
      addToast('تم تعيين الوردية', 'success');
      setShowAssign(false);
      setForm({
        employeeId: '', shiftType: 'morning',
        shiftDate: todayBaghdad(), notes: '',
      });
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  /** ★★ العطل ⑪: الإلغاء بديلاً عن الحذف */
  const handleCancel = async () => {
    if (!cancelling) return;
    if (!cancelReason.trim()) { addToast('سبب الإلغاء مطلوب', 'warning'); return; }
    setBusyId(cancelling.id);
    try {
      await shiftScheduleSdk.cancel(cancelling.id, cancelReason);
      addToast('أُلغيت الوردية — السجلّ محفوظ', 'success');
      setCancelling(null);
      setCancelReason('');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => shiftDate(weekStart, i)),
    [weekStart],
  );

  /**
   * ★ العطل ⑯: خريطةٌ واحدةٌ بمفتاح «موظف|يوم» بدل بحثٍ خطّيّ
   *   داخل حلقتين. تُبنى مرّةً لكل تحميل.
   */
  const grid = useMemo(() => {
    const m = new Map<string, ShiftRow>();
    for (const r of rows) m.set(`${r.employeeId}|${r.shiftDate}`, r);
    return m;
  }, [rows]);

  /** ★ الموظفون الظاهرون = من لهم وردية في النافذة (لا كلُّ الموظفين) */
  const employees = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; code: string }>();
    for (const r of rows) {
      if (!seen.has(r.employeeId)) {
        seen.set(r.employeeId, {
          id: r.employeeId, name: r.employeeName, code: r.employeeCode,
        });
      }
    }
    const q = search.trim().toLowerCase();
    const list = Array.from(seen.values());
    return q
      ? list.filter((e) => `${e.name} ${e.code}`.toLowerCase().includes(q))
      : list;
  }, [rows, search]);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto" dir="rtl">
      {/* ══════════ الترويسة ══════════ */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <CalendarClock className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">جدولة الورديات</h1>
            <p className="text-sm text-slate-500">
              توزيع الموظفين على الورديات الأسبوعية
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setWeekStart(shiftDate(weekStart, -7))}
            className="flex items-center gap-1 px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-slate-600 hover:bg-slate-50"
          >
            <ChevronRight size={16} /> السابق
          </button>
          <button
            onClick={() => setWeekStart(weekStartOf(todayBaghdad()))}
            className="px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-slate-600 hover:bg-slate-50"
          >
            هذا الأسبوع
          </button>
          <button
            onClick={() => setWeekStart(shiftDate(weekStart, 7))}
            className="flex items-center gap-1 px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-slate-600 hover:bg-slate-50"
          >
            التالي <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => {
              setForm({
                employeeId: '', shiftType: 'morning',
                shiftDate: weekStart, notes: '',
              });
              setShowAssign(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition-colors"
          >
            <Plus size={18} /> تعيين وردية
          </button>
        </div>
      </div>

      {/* ══════════ ★★★★ لافتة العطل ⑨ ══════════ */}
      {conflicts.length > 0 && (
        <div className="mb-4 p-4 rounded-2xl bg-red-50 border border-red-200">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm flex-1">
              <p className="font-bold text-red-900">
                {conflicts.length} وردية تتعارض مع إجازاتٍ معتمدة
              </p>
              <p className="text-red-700 mt-0.5">
                الموظف في إجازةٍ معتمدة ومجدولٌ على وردية — سيُسجَّل غائباً
                ويُخصم راتبه. ألغِ الوردية أو راجع الإجازة.
              </p>
              <ul className="mt-2 space-y-1">
                {conflicts.slice(0, 5).map((c) => (
                  <li key={c.assignmentId} className="text-xs text-red-800">
                    {c.employeeName} · {c.shiftDate} · {shiftCodeLabel(String(c.shiftType))}
                    {' '}(إجازة {c.leaveFrom} ← {c.leaveTo})
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {(summary?.unstaffed ?? 0) > 0 && (
        <div className="mb-4 flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
          <Clock size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold text-amber-900">
              {summary?.unstaffed} موظفاً نشطاً بلا أيّ وردية هذا الأسبوع
            </p>
            <p className="text-amber-700 mt-0.5">
              راجع التغطية قبل بداية الأسبوع.
            </p>
          </div>
        </div>
      )}

      {/* ══════════ البطاقات ══════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
        <StatBox label="مجدولة" value={summary?.scheduled ?? 0} tone="bg-emerald-50 text-emerald-700" icon={CalendarClock} />
        <StatBox label="صباحية" value={summary?.morning ?? 0} tone="bg-amber-50 text-amber-700" icon={Sun} />
        <StatBox label="مسائية" value={summary?.evening ?? 0} tone="bg-indigo-50 text-indigo-700" icon={Sunrise} />
        <StatBox label="ليلية" value={summary?.night ?? 0} tone="bg-slate-200 text-slate-800" icon={Moon} />
        <StatBox label="ملغاة" value={summary?.cancelled ?? 0} tone="bg-slate-100 text-slate-600" icon={Ban} />
        <StatBox label="تعارض إجازة" value={summary?.leaveConflict ?? 0} tone="bg-red-50 text-red-700" icon={AlertTriangle} />
      </div>

      {/* ══════════ شريط الأسبوع والبحث ══════════ */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-slate-500">
          أسبوع: {format(parseISO(weekStart), 'd MMM yyyy', { locale: ar })}
          {' ← '}
          {format(parseISO(shiftDate(weekStart, 6)), 'd MMM yyyy', { locale: ar })}
        </p>
        <div className="relative min-w-[220px]">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث باسم الموظف أو رقمه…"
            className="w-full pr-9 pl-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* ══════════ الجدول ══════════ */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="animate-spin text-indigo-500" size={40} />
        </div>
      ) : employees.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <CalendarClock size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">لا ورديات مُسندة في هذا الأسبوع</p>
          <p className="text-xs text-slate-400 mt-1">
            اضغط «تعيين وردية» لبدء الجدولة.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-right min-w-[860px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-3 text-xs font-semibold text-slate-600 sticky right-0 bg-slate-50">
                  الموظف
                </th>
                {days.map((d) => (
                  <th key={d} className="px-3 py-3 text-xs font-semibold text-slate-600 text-center">
                    <div>{format(parseISO(d), 'EEEE', { locale: ar })}</div>
                    <div className="text-slate-400 font-normal">
                      {format(parseISO(d), 'd/M')}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 sticky right-0 bg-white">
                    <p className="font-semibold text-slate-900 text-sm">{emp.name}</p>
                    <p className="text-xs text-slate-400">{emp.code}</p>
                  </td>
                  {days.map((d) => {
                    const cell = grid.get(`${emp.id}|${d}`);
                    if (!cell) {
                      return (
                        <td key={d} className="px-2 py-2 text-center">
                          <span className="text-slate-300 text-xs">—</span>
                        </td>
                      );
                    }
                    const Icon = SHIFT_ICON[String(cell.shiftType)] ?? Clock;
                    const cancelled = isShiftCancelled(String(cell.status));
                    return (
                      <td key={d} className="px-2 py-2 text-center">
                        <button
                          onClick={() => setDetail(cell)}
                          className={`inline-flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-opacity hover:opacity-80 ${
                            cancelled
                              ? 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                              : shiftCodeTone(String(cell.shiftType))
                          }`}
                          title={cell.notes ?? undefined}
                        >
                          <span className="inline-flex items-center gap-1">
                            <Icon size={12} />
                            {/* ★★★★ الاسم من structure_shifts لا من نصّ الواجهة */}
                            {cell.shiftNameAr}
                          </span>
                          {cell.startTime && cell.endTime && (
                            <span className="opacity-70">
                              {cell.startTime}–{cell.endTime}
                            </span>
                          )}
                          {cell.onLeave && (
                            <span className="text-red-600 font-bold">تعارض إجازة</span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ══════════ تعيين وردية ══════════ */}
      {showAssign && (
        <Modal title="تعيين وردية" onClose={() => setShowAssign(false)}>
          <EmployeePicker
            value={form.employeeId}
            onChange={(id) => setForm({ ...form, employeeId: id })}
          />
          <FormField label="الوردية" required>
            <select
              value={form.shiftType}
              onChange={(e) => setForm({ ...form, shiftType: e.target.value as ShiftCode })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              {/* ★★★★ الأكواد الأربعة من structure_shifts — كانت ثلاثةً مخترعة */}
              {SHIFT_CODES.map((c) => (
                <option key={c} value={c}>{shiftCodeLabel(c)}</option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              الأوقات معرَّفةٌ في إعدادات الورديات — لا تُكتب هنا.
            </p>
          </FormField>
          <FormField label="التاريخ" required>
            <input
              type="date"
              value={form.shiftDate}
              onChange={(e) => setForm({ ...form, shiftDate: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              لا تُجدول وردية على موظفٍ في إجازةٍ معتمدة، ولا صباحيةً بعد ليليةٍ مباشرةً.
            </p>
          </FormField>
          <FormField label="ملاحظات">
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            />
          </FormField>
          <ModalActions
            onClose={() => setShowAssign(false)}
            onSubmit={saving ? () => undefined : handleAssign}
            submitLabel={saving ? 'جارٍ الحفظ…' : 'تعيين'}
            color="blue"
          />
        </Modal>
      )}

      {/* ══════════ إلغاء الوردية ══════════ */}
      {cancelling && (
        <Modal title="إلغاء الوردية" onClose={() => setCancelling(null)}>
          <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 text-sm text-orange-800">
            الوردية المُسندة <strong>لا تُحذف</strong> — تُلغى مع حفظ سببها
            وفاعلها ولحظتها، ويبقى السجلّ للمراجعة.
          </div>
          <FormField label="سبب الإلغاء" required>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500"
            />
          </FormField>
          <ModalActions
            onClose={() => setCancelling(null)}
            onSubmit={busyId === cancelling.id ? () => undefined : handleCancel}
            submitLabel={busyId === cancelling.id ? 'جارٍ الإلغاء…' : 'إلغاء الوردية'}
            color="orange"
          />
        </Modal>
      )}

      {/* ══════════ تفاصيل الوردية ══════════ */}
      {detail && (
        <Modal title="تفاصيل الوردية" onClose={() => setDetail(null)}>
          <DetailRow label="الموظف" value={detail.employeeName} />
          <DetailRow label="الرقم الوظيفي" value={detail.employeeCode || '—'} />
          {/* ★★★★ الاسم والأوقات من القاعدة */}
          <DetailRow label="الوردية" value={detail.shiftNameAr} />
          <DetailRow
            label="التوقيت"
            value={detail.startTime && detail.endTime
              ? `${detail.startTime} ← ${detail.endTime}`
              : 'غير محدَّد (وردية مرنة)'}
          />
          <DetailRow
            label="التاريخ"
            value={format(parseISO(detail.shiftDate), 'EEEE d MMM yyyy', { locale: ar })}
          />
          <DetailRow label="الحالة" value={shiftStateLabel(String(detail.status))} />
          <DetailRow label="أسندها" value={detail.assignerName ?? '—'} />
          {detail.notes && <DetailRow label="ملاحظات" value={detail.notes} />}
          {detail.onLeave && (
            <div className="mt-2 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
              ⚠ الموظف في إجازةٍ معتمدة في هذا اليوم — راجع الجدولة.
            </div>
          )}
          {!isShiftCancelled(String(detail.status)) && !detail.isPast && (
            <button
              onClick={() => {
                setCancelling(detail); setCancelReason(''); setDetail(null);
              }}
              className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-50 text-orange-700 hover:bg-orange-100 rounded-xl font-semibold text-sm transition-colors"
            >
              <Ban size={16} /> إلغاء الوردية
            </button>
          )}
        </Modal>
      )}
    </div>
  );
}

/* ─────────────────────────── مكوّنات مساعدة ─────────────────────────── */

function StatBox({ label, value, tone, icon: Icon }: {
  label: string; value: number; tone: string; icon: LucideIcon;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${tone}`}>
        <Icon size={18} />
      </div>
      <p className="text-2xl font-extrabold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
