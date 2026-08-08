/**
 * ════════════════════════════════════════════════════════════════
 *  SyncLogsPage — سجل عمليات المزامنة
 *
 *  الميزات:
 *  • جدول كامل بكل سجلات المزامنة مع pagination
 *  • بطاقات إحصائية (نجاح / فشل / جزئي / معدل النجاح)
 *  • تحليل الأخطاء المتكررة
 *  • فلترة بالحالة + البحث + النطاق الزمني
 *  • عرض تفاصيل السجل في drawer
 *  • تصدير CSV مع BOM عربي
 *  • مؤشر اتجاه المزامنة (Trend)
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, type FC } from 'react';
import {
  RefreshCw, Search, Download, CheckCircle2, XCircle,
  AlertCircle, Clock, Database, ChevronLeft, ChevronRight,
  X, Info, TrendingUp, TrendingDown, Filter, Eye, Calendar,
  BarChart2, Zap, AlertTriangle,
} from 'lucide-react';
import { syncLogService } from '../../../services/sdk/SyncLogService';
import { getErrorMessage }  from '../../../services/errors';
import { useUIStore }        from '../../../core/stores';
import type { SyncLog, SyncStats } from '../types';

// ════════════════════════════════════════════════════════════════
//  Constants
// ════════════════════════════════════════════════════════════════

const PAGE_SIZE = 20;

type StatusFilter = 'all' | 'success' | 'failed' | 'partial';
type RangeFilter  = '6h' | '24h' | '7d' | '30d' | 'all';

const RANGE_OPTIONS: { value: RangeFilter; label: string }[] = [
  { value: '6h',  label: 'آخر 6 ساعات'   },
  { value: '24h', label: 'آخر 24 ساعة'   },
  { value: '7d',  label: 'آخر 7 أيام'    },
  { value: '30d', label: 'آخر 30 يوم'    },
  { value: 'all', label: 'الكل'           },
];

function getRangeCutoff(range: RangeFilter): string | null {
  if (range === 'all') return null;
  const ms = { '6h': 6, '24h': 24, '7d': 24*7, '30d': 24*30 }[range] * 60 * 60 * 1000;
  return new Date(Date.now() - ms).toISOString();
}

// ════════════════════════════════════════════════════════════════
//  Sub-Components
// ════════════════════════════════════════════════════════════════

const StatusBadge: FC<{ status: string; size?: 'sm' | 'md' }> = ({ status, size = 'md' }) => {
  const map: Record<string, { cls: string; label: string; icon: FC<any> }> = {
    success: { cls: 'bg-emerald-900/40 border-emerald-700/50 text-emerald-300', label: 'ناجح',  icon: CheckCircle2 },
    failed:  { cls: 'bg-red-900/40    border-red-700/50    text-red-300',      label: 'فشل',   icon: XCircle      },
    partial: { cls: 'bg-amber-900/40  border-amber-700/50  text-amber-300',    label: 'جزئي',  icon: AlertCircle  },
  };
  const s = map[status] ?? map.failed;
  const Icon = s.icon;
  const px = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg border font-bold ${px} ${s.cls}`}>
      <Icon size={size === 'sm' ? 9 : 11} />
      {s.label}
    </span>
  );
};

/** Mini bar representing success rate */
const RateBar: FC<{ rate: number }> = ({ rate }) => (
  <div className="flex items-center gap-2">
    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ${
          rate >= 90 ? 'bg-emerald-500' : rate >= 70 ? 'bg-amber-500' : 'bg-red-500'
        }`}
        style={{ width: `${rate}%` }}
      />
    </div>
    <span className={`text-xs font-bold w-10 text-right ${
      rate >= 90 ? 'text-emerald-400' : rate >= 70 ? 'text-amber-400' : 'text-red-400'
    }`}>
      {rate}%
    </span>
  </div>
);

// ════════════════════════════════════════════════════════════════
//  Detail Drawer
// ════════════════════════════════════════════════════════════════

const LogDrawer: FC<{ log: SyncLog | null; onClose: () => void }> = ({ log, onClose }) => {
  if (!log) return null;

  return (
    <div className="fixed inset-0 z-50 flex" dir="rtl">
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-slate-900 border-r border-slate-700 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Info size={16} className="text-cyan-400" />
            <span className="text-sm font-bold text-white">تفاصيل سجل المزامنة</span>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-800 transition-all">
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex items-center justify-between">
            <StatusBadge status={log.status} size="md" />
            <span className="text-xs text-slate-600 font-mono" dir="ltr">
              {log.synced_at ? new Date(log.synced_at).toLocaleString('en-SA') : '—'}
            </span>
          </div>

          {[
            { label: 'المصدر / الجهاز',    value: log.device_name },
            { label: 'معرف الجهاز',        value: log.device_id ?? '—' },
            { label: 'عدد السجلات المتزامنة', value: log.records_synced.toLocaleString() },
            { label: 'معرف السجل',         value: log.id },
          ].map(r => (
            <div key={r.label} className="bg-slate-800/40 rounded-xl px-4 py-3">
              <p className="text-[10px] text-slate-600 mb-1 font-medium">{r.label}</p>
              <p className="text-sm text-slate-200 font-mono break-all">{r.value}</p>
            </div>
          ))}

          {log.error_message && (
            <div className="bg-red-900/20 border border-red-800/50 rounded-xl px-4 py-3">
              <p className="text-[10px] text-red-500 mb-1 font-bold flex items-center gap-1">
                <AlertTriangle size={10} /> رسالة الخطأ
              </p>
              <p className="text-sm text-red-300 break-all">{log.error_message}</p>
            </div>
          )}

          {log.details && Object.keys(log.details).length > 0 && (
            <div className="bg-slate-800/40 rounded-xl px-4 py-3">
              <p className="text-[10px] text-slate-600 mb-2 font-bold">بيانات إضافية</p>
              <pre className="text-xs text-slate-400 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
                {JSON.stringify(log.details, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
//  Error Analysis Panel
// ════════════════════════════════════════════════════════════════

const ErrorAnalysis: FC<{ logs: SyncLog[] }> = ({ logs }) => {
  const failed = logs.filter(l => l.status === 'failed' && l.error_message);
  if (failed.length === 0) return null;

  // Count by error pattern
  const counts: Record<string, number> = {};
  failed.forEach(l => {
    const key = (l.error_message ?? '').slice(0, 60);
    counts[key] = (counts[key] ?? 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="bg-red-900/10 border border-red-800/40 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle size={16} className="text-red-400" />
        <h3 className="text-sm font-bold text-red-300">تحليل الأخطاء المتكررة</h3>
        <span className="text-xs text-red-600">({failed.length} إخفاق)</span>
      </div>
      <div className="space-y-2">
        {sorted.map(([msg, count], i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="w-5 h-5 rounded-full bg-red-900/60 text-red-400 text-[10px] font-black flex items-center justify-center flex-shrink-0">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-400 truncate">{msg || 'خطأ غير محدد'}</p>
            </div>
            <span className="text-xs font-bold text-red-400 flex-shrink-0">{count}×</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
//  Main Page
// ════════════════════════════════════════════════════════════════

export default function SyncLogsPage() {
  const { addToast } = useUIStore();

  const [logs,    setLogs]    = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats,   setStats]   = useState<SyncStats>({ total: 0, success: 0, failed: 0, partial: 0, totalRecords: 0, successRate: 0 });

  const [search,     setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [range,      setRange]      = useState<RangeFilter>('24h');
  const [page,       setPage]       = useState(1);
  const [detailLog,  setDetailLog]  = useState<SyncLog | null>(null);

  // ─── Load ──────────────────────────────────────────────────
  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await syncLogService.findRecentLogs(500);
      const cutoff = getRangeCutoff(range);

      // ★ الحقول هي ما تقرؤه أسطر التحويل أدناه حرفياً — استخرجها tsc
      //   حين رفض النوع الناقص (sync_time · created_at بديلان لـsynced_at).
      type RawSyncRow = {
        id: string; device_id?: string | null; source?: string | null;
        status?: string | null; records_synced?: number | null;
        error_message?: string | null; synced_at?: string | null;
        sync_time?: string | null; created_at?: string | null;
        details?: Record<string, unknown> | null;
      };
      const mapped: SyncLog[] = (raw as unknown as RawSyncRow[]).map(r => ({
        id: r.id,
        // ★ SyncLog يستعمل `string | undefined` بينما القاعدة تعيد null.
        //   التطبيع صريح هنا — tsc رفض تمرير null ضمناً.
        device_id: r.device_id ?? undefined,
        device_name: r.device_id || r.source || 'غير محدد',
        source: r.source || '',
        status: (['success', 'failed', 'partial'].includes(r.status ?? '')
          ? r.status : 'failed') as SyncLog['status'],
        records_synced: Number(r.records_synced || 0),
        error_message: r.error_message ?? undefined,
        synced_at: r.sync_time || r.created_at || '',
        details: r.details ?? undefined,
      }));

      const filtered = mapped.filter(l => {
        if (cutoff && l.synced_at < cutoff) return false;
        return true;
      });

      setLogs(filtered);

      const success  = filtered.filter(l => l.status === 'success').length;
      const failed   = filtered.filter(l => l.status === 'failed').length;
      const partial  = filtered.filter(l => l.status === 'partial').length;
      const totalRec = filtered.reduce((s, l) => s + l.records_synced, 0);

      setStats({
        total: filtered.length,
        success,
        failed,
        partial,
        totalRecords: totalRec,
        successRate: filtered.length > 0 ? Math.round((success / filtered.length) * 100) : 0,
      });
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [range, addToast]);

  useEffect(() => { loadLogs(); setPage(1); }, [loadLogs]);

  // ─── Filter ─────────────────────────────────────────────────
  const filtered = logs.filter(l => {
    if (statusFilter !== 'all' && l.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!l.device_name.toLowerCase().includes(q) &&
          !(l.error_message ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ─── Export CSV ──────────────────────────────────────────────
  const exportCSV = () => {
    const BOM = '\uFEFF';
    const headers = ['المصدر', 'الحالة', 'السجلات المتزامنة', 'الوقت', 'رسالة الخطأ'];
    const rows = filtered.map(l => [
      l.device_name,
      l.status === 'success' ? 'ناجح' : l.status === 'failed' ? 'فشل' : 'جزئي',
      l.records_synced,
      l.synced_at ? new Date(l.synced_at).toLocaleString('ar-SA') : '—',
      l.error_message || '',
    ]);
    const csv = BOM + [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sync-logs-${Date.now()}.csv`;
    a.click();
    addToast('تم تصدير السجلات بنجاح', 'success');
  };

  return (
    <div className="space-y-5" dir="rtl">
      <LogDrawer log={detailLog} onClose={() => setDetailLog(null)} />

      {/* ─── Header ─── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            <RefreshCw size={20} className="text-purple-400" />
            سجل المزامنة
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">مراقبة عمليات مزامنة بيانات الحضور من أجهزة البصمة</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-sm font-medium transition-all">
            <Download size={14} />
            <span className="hidden sm:inline">تصدير CSV</span>
          </button>
          <button onClick={loadLogs} className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-700 text-slate-400 hover:text-white transition-all">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ─── KPIs ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'إجمالي العمليات',    value: stats.total,        cls: 'text-white',        icon: BarChart2   },
          { label: 'ناجحة',              value: stats.success,      cls: 'text-emerald-400',  icon: CheckCircle2},
          { label: 'فاشلة',              value: stats.failed,       cls: stats.failed > 0 ? 'text-red-400' : 'text-slate-500', icon: XCircle },
          { label: 'جزئية',              value: stats.partial,      cls: stats.partial > 0 ? 'text-amber-400' : 'text-slate-500', icon: AlertCircle },
          { label: 'إجمالي السجلات',    value: stats.totalRecords.toLocaleString(), cls: 'text-violet-400', icon: Database },
        ].map(k => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <Icon size={14} className="text-slate-600" />
              </div>
              <p className={`text-2xl font-black ${k.cls} leading-none`}>{k.value}</p>
              <p className="text-[11px] text-slate-600 mt-1.5">{k.label}</p>
            </div>
          );
        })}
      </div>

      {/* Success Rate Bar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-5 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
            <TrendingUp size={13} className="text-emerald-400" />
            معدل نجاح المزامنة
          </span>
          <span className="text-xs text-slate-600">النطاق الزمني: {RANGE_OPTIONS.find(r => r.value === range)?.label}</span>
        </div>
        <RateBar rate={stats.successRate} />
      </div>

      {/* Error Analysis */}
      {stats.failed > 0 && <ErrorAnalysis logs={logs} />}

      {/* ─── Filters ─── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="w-full pr-9 pl-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-700 transition-all"
            placeholder="بحث بالمصدر أو رسالة الخطأ..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
          {(['all', 'success', 'failed', 'partial'] as StatusFilter[]).map(f => (
            <button
              key={f}
              onClick={() => { setStatusFilter(f); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                statusFilter === f
                  ? 'bg-cyan-900/60 text-cyan-300 border border-cyan-700/50'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {f === 'all' ? 'الكل' : f === 'success' ? 'ناجح' : f === 'failed' ? 'فشل' : 'جزئي'}
            </button>
          ))}
        </div>

        {/* Range filter */}
        <select
          value={range}
          onChange={e => { setRange(e.target.value as RangeFilter); setPage(1); }}
          className="px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-300 focus:outline-none focus:border-cyan-700 transition-all"
        >
          {RANGE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      {/* ─── Table ─── */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="space-y-0">
            {[1,2,3,4,5].map(i => <div key={i} className="h-14 border-b border-slate-800/40 animate-pulse bg-slate-800/10" />)}
          </div>
        ) : paged.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <RefreshCw size={36} className="text-slate-700 mb-3" />
            <p className="text-slate-500 text-sm">لا توجد سجلات مطابقة</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="bg-slate-900/80 border-b border-slate-800">
                  <tr className="text-right">
                    {['المصدر', 'الحالة', 'السجلات', 'الوقت', 'الخطأ', ''].map(h => (
                      <th key={h} className="py-3 px-3 text-[11px] font-bold text-slate-600 first:pr-4 last:pl-4">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.map(log => (
                    <tr key={log.id} className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors group">
                      <td className="py-3.5 pr-4">
                        <span className="text-sm font-medium text-slate-300 max-w-[160px] block truncate">
                          {log.device_name}
                        </span>
                      </td>
                      <td className="py-3.5 px-3">
                        <StatusBadge status={log.status} />
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="text-sm font-mono text-slate-400">
                          {log.records_synced.toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-xs text-slate-600" dir="ltr">
                        {log.synced_at
                          ? new Date(log.synced_at).toLocaleString('en-SA', {
                              month: '2-digit', day: '2-digit',
                              hour: '2-digit', minute: '2-digit', second: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td className="py-3.5 px-3 max-w-[200px]">
                        {log.error_message ? (
                          <span className="text-[11px] text-red-400 truncate block" title={log.error_message}>
                            {log.error_message}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-700">—</span>
                        )}
                      </td>
                      <td className="py-3.5 pl-4">
                        <button
                          onClick={() => setDetailLog(log)}
                          className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-cyan-400 hover:bg-cyan-900/30 transition-all"
                          title="عرض التفاصيل"
                        >
                          <Eye size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-slate-800/60 flex items-center justify-between">
                <span className="text-xs text-slate-600">
                  {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} من {filtered.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-all"
                  >
                    <ChevronRight size={14} />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                          page === p
                            ? 'bg-cyan-900/60 text-cyan-300 border border-cyan-700/50'
                            : 'text-slate-500 hover:text-white hover:bg-slate-800'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-all"
                  >
                    <ChevronLeft size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
