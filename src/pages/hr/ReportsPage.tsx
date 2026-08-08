/**
 * ReportsPage — تقارير الموارد البشرية (HR) · migration 0370
 *
 * ★ الصفحة القديمة (146 سطراً) لم تكن ناقصةً — كانت **تكذب**.
 *
 * ① ★★★★ **ثلاثةٌ من ثمانية تقاريرَ محتواها الحرفيّ: بيانات تجريبية.**
 *   الفرع `else` (السطر 79–82) كان يُخرج سطراً واحداً:
 *      rows = [['بيانات تجريبية', '—', '—']]
 *   ويسقط فيه: `satisfaction` · `performance` · `sentiment`.
 *   ثمّ السطر 96 يعرض «✅ تم إنشاء التقرير بنجاح».
 *   ⇒ المستخدم يُنزّل ملفاً زائفاً ويُطمْأَن إليه. وهذا أسوأ من زرٍّ
 *     معطَّل: الزرّ المعطَّل يُعلن عجزه.
 *
 * ② ★★★★ **تقرير البلاغات كان يفضح المُبلِّغ المجهول.**
 *   `incidentService.findAll()` يقرأ `incidents` خاماً، و`employee_name`
 *   مملوءٌ في القاعدة حتى حين `is_anonymous = TRUE`. المايجريشن 0338
 *   أصلح هذا في **الدوال**، وطريق التقارير يلتفّ حوله لأنّه لا يمرّ
 *   بدالة. الآن الإخفاء في القاعدة داخل `hr_report_execute`.
 *
 * ③ ★★★★ **تقرير الصحة النفسية كان ملفَّ مراقبة.**
 *   `findAllEntries()` = `SELECT *` بلا ترشيح ⇒ مزاجُ كلّ موظفٍ
 *   بمعرّفه وملاحظاته على قرصٍ شخصيّ. الآن تجميعٌ بالقسم مع حدٍّ
 *   أدنى k = 3 يمنع إعادة تعريف الفرد.
 *
 * ④ ★★★ **لا أثرَ لأيّ تصدير** — الآن `hr_report_runs` وتبويبٌ يعرضه.
 * ⑤ ★★★ **المدير كان يُصدِّر ملفّاً فارغاً صامتاً** (`manager` ليست
 *   staff) — الآن منعٌ مسموع، و`manager` رُفع من أدوار الصفحة.
 * ⑥ ★★ **تواريخُ 2024 مسمَّرة** — الآن الكتالوج من القاعدة.
 * ⑦ ★★★ **لا نطاقَ ولا حدَّ صفوف** — الآن نطاقٌ إلزاميّ وكشفُ اقتطاع.
 *
 * ★ الصفحة لا تلمس Supabase — كل شيء عبر `hrReportSdk`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CalendarRange, Download, Eye, FileBarChart, History,
  Loader2, Lock, RefreshCw, ShieldAlert, Table2,
} from 'lucide-react';
import { useUIStore } from '../../core/stores';
import { getErrorMessage } from '../../services/errors';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import {
  hrReportSdk, hrReportCategoryLabel, hrReportCategoryTone,
  hrReportToCsv, hrReportFileName,
} from '../../services/sdk';
import type {
  HrReportDefinitionRow, HrReportResult, HrReportRunRow,
} from '../../services/sdk';
import { Modal, DetailRow } from './LoansPage';

/** ★★★ اليوم بتوقيت بغداد — القاعدة تستعمل Asia/Baghdad صراحةً */
function todayBaghdad(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function daysAgoBaghdad(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

function fmtDateTime(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'd MMM yyyy · HH:mm', { locale: ar });
}

function fmtDate(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'd MMM yyyy', { locale: ar });
}

/** ★ الفرق بين «لم يُشغَّل قطّ» و«شُغِّل اليوم» — حالتان مختلفتان */
function lastRunLabel(v: string | null): string {
  if (!v) return 'لم يُشغَّل بعد';
  return fmtDateTime(v);
}

type TabKey = 'catalog' | 'audit';

export default function ReportsPage() {
  const { addToast } = useUIStore();

  const [tab, setTab] = useState<TabKey>('catalog');
  const [loading, setLoading] = useState(true);
  /** ★★★ الحرمان حالةٌ صريحةٌ تُعرض، لا ملفٌّ فارغٌ صامت (العطل ⑤) */
  const [forbidden, setForbidden] = useState(false);

  const [catalog, setCatalog] = useState<HrReportDefinitionRow[]>([]);
  const [runs, setRuns] = useState<HrReportRunRow[]>([]);

  const [from, setFrom] = useState(daysAgoBaghdad(90));
  const [to, setTo] = useState(todayBaghdad());
  const [limit, setLimit] = useState(2000);

  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [preview, setPreview] = useState<HrReportResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [defs, hist] = await Promise.all([
        hrReportSdk.catalog(),
        hrReportSdk.runs(50),
      ]);
      setCatalog(defs);
      setRuns(hist);
      setForbidden(false);
    } catch (err) {
      const msg = getErrorMessage(err);
      // ★★★ العطل ⑤: المنع يُعرض بنصّه لا يُبتلع
      if (msg.includes('HR_REPORT_FORBIDDEN')) {
        setForbidden(true);
        setCatalog([]);
        setRuns([]);
      } else {
        addToast(`تعذّر تحميل التقارير: ${msg}`, 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  /** ★ نطاقٌ معكوسٌ يُمنَع في الواجهة قبل أن ترفضه القاعدة */
  const rangeInvalid = useMemo(() => from > to, [from, to]);
  const rangeDays = useMemo(() => {
    const a = new Date(from).getTime();
    const b = new Date(to).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) return 0;
    return Math.round((b - a) / 86400000);
  }, [from, to]);
  const rangeTooWide = rangeDays > 366;

  const runReport = useCallback(async (
    def: HrReportDefinitionRow,
    mode: 'download' | 'preview',
  ) => {
    if (def.needsRange && (rangeInvalid || rangeTooWide)) {
      addToast(
        rangeInvalid
          ? 'تاريخ البداية بعد تاريخ النهاية'
          : `النطاق ${rangeDays} يوماً يتجاوز سنةً واحدة`,
        'error',
      );
      return;
    }
    setBusyCode(def.code);
    try {
      const result = await hrReportSdk.execute(
        def.code,
        def.needsRange ? from : null,
        def.needsRange ? to   : null,
        limit,
      );

      if (mode === 'preview') {
        setPreview(result);
      } else {
        const blob = new Blob([hrReportToCsv(result)],
          { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = hrReportFileName(result);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // ★★★ الصدق في الرسالة: العدد الحقيقيّ والاقتطاع مُعلَنان
        if (result.rows.length === 0) {
          addToast('التقرير خالٍ — لا صفوف ضمن النطاق المحدَّد', 'info');
        } else if (result.wasTruncated) {
          addToast(
            `نُزِّل ${result.rows.length} صفّاً من أصل ${result.totalRows}`
            + ' — التقرير مقتطع، وسّع الحدّ أو ضيّق النطاق',
            'info',
          );
        } else {
          addToast(`نُزِّل ${result.rows.length} صفّاً`, 'success');
        }
      }
      // ★ سجلّ التصديرات يُحدَّث فوراً فيرى المستخدم أثره
      setRuns(await hrReportSdk.runs(50));
    } catch (err) {
      addToast(`فشل التقرير: ${getErrorMessage(err)}`, 'error');
    } finally {
      setBusyCode(null);
    }
  }, [addToast, from, to, limit, rangeInvalid, rangeTooWide, rangeDays]);

  const sensitiveRuns30d = useMemo(
    () => catalog.filter((d) => d.isSensitive)
                 .reduce((s, d) => s + d.runs30d, 0),
    [catalog],
  );
  const totalRuns30d = useMemo(
    () => catalog.reduce((s, d) => s + d.runs30d, 0),
    [catalog],
  );

  // ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24" dir="rtl">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  // ★★★ العطل ⑤ معروضاً: الحرمان يُشرح، ولا يُصدَّر ملفٌّ فارغ
  if (forbidden) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center" dir="rtl">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600
                        flex items-center justify-center mx-auto mb-4">
          <Lock size={28} />
        </div>
        <h2 className="text-xl font-extrabold text-slate-800 mb-2">
          تقارير الموارد البشرية غير متاحة لدورك
        </h2>
        <p className="text-slate-500 text-sm leading-relaxed">
          هذه التقارير تمسّ بياناتٍ شخصيةً لكلّ الموظفين، فهي مقصورةٌ على
          الموارد البشرية والإدارة. سابقاً كان الزرّ يعمل ويُنزّل ملفّاً
          <span className="font-semibold text-slate-700"> فارغاً بلا تفسير</span>،
          وهو أسوأ من المنع: يوحي بأنّ المنشأة بلا بيانات.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      {/* الترويسة */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-800 flex items-center gap-2">
            <FileBarChart className="text-indigo-600" /> تقارير الموارد البشرية
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            {catalog.length} تقريراً — كلُّها منفَّذةٌ على بياناتٍ حقيقية،
            وكلُّ تصديرٍ يُسجَّل باسم صاحبه.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm
                     font-semibold hover:bg-slate-200 transition-colors
                     flex items-center gap-2"
        >
          <RefreshCw size={15} /> تحديث
        </button>
      </div>

      {/* البطاقات */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="التقارير المتاحة" value={catalog.length}
                  tone="bg-indigo-50 text-indigo-700" icon={FileBarChart} />
        <StatCard label="تصديرات آخر 30 يوماً" value={totalRuns30d}
                  tone="bg-sky-50 text-sky-700" icon={History} />
        <StatCard label="تصديراتٌ حسّاسة (30 يوماً)" value={sensitiveRuns30d}
                  tone="bg-rose-50 text-rose-700" icon={ShieldAlert} />
        <StatCard label="سجلّات التدقيق المعروضة" value={runs.length}
                  tone="bg-emerald-50 text-emerald-700" icon={Table2} />
      </div>

      {/* التبويبات */}
      <div className="flex gap-2 border-b border-slate-200">
        <TabButton active={tab === 'catalog'} onClick={() => setTab('catalog')}
                   icon={FileBarChart} label="التقارير" />
        <TabButton active={tab === 'audit'} onClick={() => setTab('audit')}
                   icon={History} label={`سجلّ التصديرات (${runs.length})`} />
      </div>

      {tab === 'catalog' && (
        <>
          {/* النطاق — العطل ⑦ */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <CalendarRange size={16} className="text-slate-500" />
              <span className="text-sm font-bold text-slate-700">
                النطاق الزمنيّ
              </span>
              <span className="text-xs text-slate-400">
                يُطبَّق على التقارير التي تحتاجه فقط
              </span>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  من
                </label>
                <input
                  type="date" value={from} max={to}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  إلى
                </label>
                <input
                  type="date" value={to} min={from} max={todayBaghdad()}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  الحدّ الأقصى للصفوف
                </label>
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                >
                  {[500, 1000, 2000, 5000].map((n) => (
                    <option key={n} value={n}>{n} صفّاً</option>
                  ))}
                </select>
              </div>
            </div>
            {(rangeInvalid || rangeTooWide) && (
              <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-red-600">
                <AlertTriangle size={14} />
                {rangeInvalid
                  ? 'تاريخ البداية بعد تاريخ النهاية'
                  : `النطاق ${rangeDays} يوماً يتجاوز سنةً واحدة`}
              </div>
            )}
          </div>

          {/* الكتالوج */}
          <div className="grid gap-3">
            {catalog.map((def) => (
              <div
                key={def.code}
                className="bg-white rounded-2xl border border-slate-200 p-4
                           hover:border-indigo-200 transition-colors"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className={`w-11 h-11 shrink-0 rounded-xl border flex items-center
                                     justify-center ${hrReportCategoryTone(def.category)}`}>
                      <FileBarChart size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-800">{def.nameAr}</h3>
                        <span className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold
                                          border ${hrReportCategoryTone(def.category)}`}>
                          {hrReportCategoryLabel(def.category)}
                        </span>
                        {def.isSensitive && (
                          <span className="px-2 py-0.5 rounded-lg text-[11px] font-semibold
                                           bg-rose-50 text-rose-700 border border-rose-200
                                           flex items-center gap-1">
                            <ShieldAlert size={11} /> حسّاس
                          </span>
                        )}
                        {def.needsRange && (
                          <span className="px-2 py-0.5 rounded-lg text-[11px] font-semibold
                                           bg-slate-100 text-slate-600 border border-slate-200">
                            بنطاق زمنيّ
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        {def.descriptionAr}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-slate-400">
                        <span>{def.columnsAr.length} أعمدة</span>
                        <span>آخر تشغيل: {lastRunLabel(def.lastRunAt)}</span>
                        <span>{def.runs30d} تصديراً خلال 30 يوماً</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => void runReport(def, 'preview')}
                      disabled={busyCode !== null}
                      className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs
                                 font-semibold hover:bg-slate-200 disabled:opacity-50
                                 transition-colors flex items-center gap-1.5"
                    >
                      {busyCode === def.code
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Eye size={13} />}
                      معاينة
                    </button>
                    <button
                      onClick={() => void runReport(def, 'download')}
                      disabled={busyCode !== null}
                      className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs
                                 font-semibold hover:bg-indigo-700 disabled:opacity-50
                                 transition-colors flex items-center gap-1.5"
                    >
                      {busyCode === def.code
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Download size={13} />}
                      تنزيل CSV
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'audit' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {runs.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              لا تصديراتٍ مسجَّلةً بعد.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <Th>التقرير</Th>
                    <Th>المُصدِّر</Th>
                    <Th>الوقت</Th>
                    <Th>النطاق</Th>
                    <Th>الصفوف</Th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">
                            {r.reportName}
                          </span>
                          {r.isSensitive && (
                            <ShieldAlert size={13} className="text-rose-500" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{r.actorName}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {fmtDateTime(r.executedAt)}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {r.dateFrom && r.dateTo
                          ? `${fmtDate(r.dateFrom)} — ${fmtDate(r.dateTo)}`
                          : 'كامل البيانات'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-slate-700 font-semibold">
                          {r.rowCount}
                        </span>
                        {r.wasTruncated && (
                          <span className="mr-1.5 px-2 py-0.5 rounded-lg text-[11px]
                                           font-semibold bg-amber-50 text-amber-700
                                           border border-amber-200">
                            مقتطع من {r.totalRows}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* المعاينة */}
      {preview && (
        <Modal title={`معاينة — ${preview.nameAr}`} onClose={() => setPreview(null)}>
          <DetailRow label="عدد الصفوف"
                     value={`${preview.rows.length} من ${preview.totalRows}`} />
          {preview.dateFrom && preview.dateTo && (
            <DetailRow label="النطاق"
                       value={`${fmtDate(preview.dateFrom)} — ${fmtDate(preview.dateTo)}`} />
          )}
          {preview.wasTruncated && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50
                            border border-amber-200 text-xs text-amber-800">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>
                التقرير مقتطع: تُعرض {preview.rows.length} صفّاً من أصل{' '}
                {preview.totalRows}. وسّع الحدّ الأقصى أو ضيّق النطاق.
              </span>
            </div>
          )}
          {preview.rows.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-sm">
              لا صفوف ضمن النطاق المحدَّد.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    {preview.headers.map((h) => (
                      <th key={h} className="px-2.5 py-2 text-right font-semibold
                                             whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 25).map((row, i) => (
                    <tr key={`${preview.code}-${i}`} className="border-t border-slate-100">
                      {row.map((cell, j) => (
                        <td key={`${preview.code}-${i}-${j}`}
                            className="px-2.5 py-1.5 text-slate-700 whitespace-nowrap">
                          {cell || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rows.length > 25 && (
                <div className="px-3 py-2 text-[11px] text-slate-400 bg-slate-50
                                border-t border-slate-100">
                  تُعرض 25 صفّاً من {preview.rows.length} — نزّل الملفّ لرؤية الباقي.
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  مكوّناتٌ صغيرة
// ═══════════════════════════════════════════════════════════════

function StatCard({ label, value, tone, icon: Icon }: {
  label: string;
  value: number;
  tone: string;
  icon: typeof FileBarChart;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="text-2xl font-extrabold text-slate-800 mt-1">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tone}`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: {
  active: boolean;
  onClick: () => void;
  icon: typeof FileBarChart;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px
                  transition-colors flex items-center gap-2 ${
        active
          ? 'border-indigo-600 text-indigo-700'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      <Icon size={15} /> {label}
    </button>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-right text-xs font-semibold whitespace-nowrap">
      {children}
    </th>
  );
}
