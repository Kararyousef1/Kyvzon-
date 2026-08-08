/**
 * ════════════════════════════════════════════════════════════════
 *  ErrorLogsPage — سجلّ الأخطاء والمهام المجدولة
 *
 *  المسار: /app/tech-portal/error-logs
 *
 *  ★ الفجوة: `error_logs` كان بلا واجهة إطلاقاً رغم احتوائه
 *    `stack_trace` و`route` و`file_name` و`severity` — أي كل ما يلزم
 *    لتشخيص عطل. و`scheduled_job_runs` كذلك.
 *
 *  ★ المهام المجدولة تُعرض **مُجمَّعة**: اسم · آخر تشغيل · نجاح · مدّة.
 *    بلا `tenants_processed` ولا `details` — هذان يكشفان حجم العملاء
 *    الآخرين ونشاطهم (قرار عزل 0328).
 * ════════════════════════════════════════════════════════════════
 */
import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, RefreshCw, Loader2, Clock, CheckCircle2,
  XCircle, ChevronDown, ChevronUp, Bug,
} from 'lucide-react';
import {
  techAuditService,
  type TechError,
  type ErrorSeverityCount,
  type ScheduledJob,
} from '../../../services/sdk/TechAuditService';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';

const SEVERITY_LABEL: Record<string, string> = {
  critical: 'حرجة', high: 'عالية', medium: 'متوسطة', low: 'منخفضة',
};

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'bg-red-950/60 text-red-300 border-red-800',
  high:     'bg-orange-950/60 text-orange-300 border-orange-800',
  medium:   'bg-amber-950/60 text-amber-300 border-amber-800',
  low:      'bg-slate-800/60 text-slate-400 border-slate-700',
};

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ar', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export default function ErrorLogsPage() {
  const { addToast } = useUIStore();
  const [errors, setErrors] = useState<TechError[]>([]);
  const [summary, setSummary] = useState<ErrorSeverityCount[]>([]);
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [severity, setSeverity] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, sum, jb] = await Promise.all([
        techAuditService.errorLog({ severity, limit: 100 }),
        techAuditService.errorSummary(24),
        techAuditService.scheduledJobs(),
      ]);
      setErrors(rows);
      setSummary(sum);
      setJobs(jb);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [severity, addToast]);

  useEffect(() => { void load(); }, [load]);

  const unhealthyJobs = jobs.filter((j) => !j.isHealthy).length;

  return (
    <div dir="rtl" className="space-y-5">
      {/* الهيدر */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-950/60 border border-red-800 flex items-center justify-center">
            <Bug className="text-red-400" size={18} />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-100">الأخطاء والمهام المجدولة</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              تشخيص أعطال شركتك ومتابعة المهام الدورية
            </p>
          </div>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm font-bold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          تحديث
        </button>
      </div>

      {/* بطاقات الخطورة — كل مستوى يظهر ولو بصفر */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {summary.map((s) => (
          <button
            key={s.severity}
            onClick={() => setSeverity(severity === s.severity ? null : s.severity)}
            className={`rounded-2xl border p-4 text-right transition-all ${
              severity === s.severity
                ? SEVERITY_STYLE[s.severity] ?? SEVERITY_STYLE.low
                : 'bg-slate-900/60 border-slate-700 hover:border-slate-600'
            }`}
          >
            <p className={`text-2xl font-black ${
              s.count === 0 ? 'text-slate-600'
                : s.severity === 'critical' ? 'text-red-400'
                : s.severity === 'high' ? 'text-orange-400'
                : s.severity === 'medium' ? 'text-amber-400' : 'text-slate-300'
            }`}>
              {s.count}
            </p>
            <p className="text-xs text-slate-400 mt-1 font-bold">
              {SEVERITY_LABEL[s.severity] ?? s.severity}
            </p>
            <p className="text-[10px] text-slate-600 mt-0.5">آخر 24 ساعة</p>
          </button>
        ))}
      </div>

      {/* المهام المجدولة */}
      <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-100 flex items-center gap-2">
            <Clock size={16} className="text-slate-500" />
            المهام المجدولة
          </h3>
          {jobs.length > 0 && (
            <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
              unhealthyJobs === 0
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                : 'bg-red-950/60 text-red-300 border-red-800'
            }`}>
              {unhealthyJobs === 0 ? 'كلها سليمة' : `${unhealthyJobs} تحتاج مراجعة`}
            </span>
          )}
        </div>
        {jobs.length === 0 ? (
          <p className="text-xs text-slate-500 py-3">لا مهام مجدولة مُسجَّلة بعد.</p>
        ) : (
          <div className="space-y-2">
            {jobs.map((j) => (
              <div
                key={j.jobName}
                className="flex items-center justify-between gap-3 rounded-xl bg-slate-800/50 px-4 py-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {j.isHealthy
                    ? <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                    : <XCircle size={15} className="text-red-400 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-200 truncate">{j.jobName}</p>
                    <p className="text-[11px] text-slate-500">
                      آخر تشغيل {formatWhen(j.lastRun)}
                      {j.durationMs != null && ` · ${j.durationMs}ms`}
                    </p>
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <p className="text-xs text-slate-400">{j.runs24h} تشغيل / 24س</p>
                  {j.failures24h > 0 && (
                    <p className="text-[11px] text-red-400 font-bold">{j.failures24h} فشل</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* سجلّ الأخطاء */}
      <div className="rounded-2xl border border-slate-700 bg-slate-900/60 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h3 className="font-bold text-slate-100 flex items-center gap-2">
            <AlertTriangle size={16} className="text-slate-500" />
            سجلّ الأخطاء
            {severity && (
              <span className="text-xs font-normal text-slate-500">
                — {SEVERITY_LABEL[severity]} فقط
              </span>
            )}
          </h3>
          {severity && (
            <button
              onClick={() => setSeverity(null)}
              className="text-xs text-slate-400 hover:text-slate-200 font-bold"
            >
              عرض الكل
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="animate-spin text-red-500" size={26} />
          </div>
        ) : errors.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="mx-auto text-emerald-700 mb-3" size={30} />
            <p className="text-sm text-slate-300 font-bold">لا أخطاء مُسجَّلة</p>
            <p className="text-xs text-slate-600 mt-1">
              {severity ? 'لا أخطاء بهذه الخطورة' : 'سجلّ شركتك نظيف'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {errors.map((e) => (
              <div key={e.id} className="px-5 py-3">
                <button
                  onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                  className="w-full flex items-start justify-between gap-3 text-right"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 mt-0.5 ${
                      SEVERITY_STYLE[e.severity] ?? SEVERITY_STYLE.low
                    }`}>
                      {SEVERITY_LABEL[e.severity] ?? e.severity}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-slate-200 font-medium break-words">{e.message}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {e.route ?? '—'}
                        {e.category && ` · ${e.category}`}
                        {' · '}{formatWhen(e.createdAt)}
                      </p>
                    </div>
                  </div>
                  {(e.stack || e.file) && (
                    expanded === e.id
                      ? <ChevronUp size={15} className="text-slate-600 shrink-0" />
                      : <ChevronDown size={15} className="text-slate-600 shrink-0" />
                  )}
                </button>

                {expanded === e.id && (e.stack || e.file) && (
                  <div className="mt-3 rounded-xl bg-slate-950 border border-slate-800 p-3">
                    {e.file && (
                      <p className="text-[11px] text-slate-500 mb-2">
                        {e.file}{e.line != null && `:${e.line}`}
                      </p>
                    )}
                    {e.stack && (
                      <pre className="text-[11px] text-slate-400 overflow-x-auto whitespace-pre-wrap break-words" dir="ltr">
                        {e.stack}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
