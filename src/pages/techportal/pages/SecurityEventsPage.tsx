/**
 * ════════════════════════════════════════════════════════════════
 *  SecurityEventsPage — مراقبة الأحداث الأمنية
 *
 *  الميزات:
 *  • جدول أحداث أمنية مع threat level مُلوَّن
 *  • فلترة بمستوى التهديد + البحث + النطاق الزمني
 *  • بطاقات إحصائية (critical / high / medium / low)
 *  • drawer تفاصيل الحدث
 *  • تحليل عناوين IP المتكررة
 *  • تحليل أنواع الأحداث المتكررة
 *  • Pagination كامل
 *  • تصدير CSV
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, type FC } from 'react';
import {
  Shield, RefreshCw, Search, Download, X, Eye,
  AlertTriangle, AlertCircle, Info, ChevronLeft,
  ChevronRight, Network, User, Clock, Filter,
  Zap, TrendingUp, BarChart2, MapPin,
} from 'lucide-react';
import { securityEventService } from '../../../services/sdk/SecurityEventService';
import { getErrorMessage }      from '../../../services/errors';
import { useUIStore }           from '../../../core/stores';
import type { SecurityEvent, ThreatLevel } from '../types';

// ════════════════════════════════════════════════════════════════
//  Constants
// ════════════════════════════════════════════════════════════════

const PAGE_SIZE = 25;

type LevelFilter = 'all' | ThreatLevel;

const LEVEL_CONFIG: Record<ThreatLevel, {
  label: string; cls: string; badgeBg: string; dotColor: string; priority: number;
}> = {
  critical: { label: 'حرج',    cls: 'text-red-300',    badgeBg: 'bg-red-900/50 border-red-600/60',       dotColor: 'bg-red-400 animate-pulse',   priority: 4 },
  high:     { label: 'عالي',   cls: 'text-orange-300', badgeBg: 'bg-orange-900/50 border-orange-600/60', dotColor: 'bg-orange-400',               priority: 3 },
  medium:   { label: 'متوسط',  cls: 'text-amber-300',  badgeBg: 'bg-amber-900/40 border-amber-700/50',   dotColor: 'bg-amber-400',                priority: 2 },
  low:      { label: 'منخفض',  cls: 'text-slate-400',  badgeBg: 'bg-slate-800/50 border-slate-700/50',   dotColor: 'bg-slate-500',                priority: 1 },
};

// ════════════════════════════════════════════════════════════════
//  Sub-Components
// ════════════════════════════════════════════════════════════════

const ThreatBadge: FC<{ level: ThreatLevel; size?: 'sm' | 'md' }> = ({ level, size = 'md' }) => {
  const c = LEVEL_CONFIG[level];
  const px = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border font-bold ${px} ${c.badgeBg} ${c.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dotColor}`} />
      {c.label}
    </span>
  );
};

// ════════════════════════════════════════════════════════════════
//  Detail Drawer
// ════════════════════════════════════════════════════════════════

const EventDrawer: FC<{ event: SecurityEvent | null; onClose: () => void }> = ({ event, onClose }) => {
  if (!event) return null;
  const cfg = LEVEL_CONFIG[event.threat_level];

  return (
    <div className="fixed inset-0 z-50 flex" dir="rtl">
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-slate-900 border-r border-slate-700 shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className={`px-5 py-4 border-b border-slate-800 ${event.threat_level === 'critical' ? 'bg-red-900/20' : ''}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield size={16} className={cfg.cls} />
              <span className="text-sm font-bold text-white">تفاصيل الحدث الأمني</span>
            </div>
            <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-800 transition-all">
              <X size={14} />
            </button>
          </div>
          <div className="mt-2">
            <ThreatBadge level={event.threat_level} />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {[
            { label: 'نوع الحدث',     value: event.type,                     icon: Zap     },
            { label: 'المستخدم',       value: event.user_name ?? 'غير معروف', icon: User    },
            { label: 'عنوان IP',       value: event.ip_address ?? '—',         icon: Network },
            { label: 'وقت الحدث',     value: event.created_at ? new Date(event.created_at).toLocaleString('ar-SA') : '—', icon: Clock },
          ].map(r => {
            const Icon = r.icon;
            return (
              <div key={r.label} className="bg-slate-800/40 rounded-xl px-4 py-3 flex items-start gap-3">
                <Icon size={14} className="text-slate-600 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-600 mb-0.5 font-medium">{r.label}</p>
                  <p className="text-sm text-slate-200 font-mono break-all">{r.value}</p>
                </div>
              </div>
            );
          })}

          {event.details && (
            <div className="bg-slate-800/40 rounded-xl px-4 py-3">
              <p className="text-[10px] text-slate-600 mb-2 font-bold">التفاصيل</p>
              <p className="text-sm text-slate-300 leading-relaxed">{event.details}</p>
            </div>
          )}

          {event.user_agent && (
            <div className="bg-slate-800/40 rounded-xl px-4 py-3">
              <p className="text-[10px] text-slate-600 mb-1.5 font-bold">User Agent</p>
              <p className="text-xs text-slate-500 font-mono break-all leading-relaxed">{event.user_agent}</p>
            </div>
          )}

          {event.metadata && Object.keys(event.metadata).length > 0 && (
            <div className="bg-slate-800/40 rounded-xl px-4 py-3">
              <p className="text-[10px] text-slate-600 mb-2 font-bold">بيانات إضافية</p>
              <pre className="text-xs text-slate-400 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
                {JSON.stringify(event.metadata, null, 2)}
              </pre>
            </div>
          )}

          <div className="bg-slate-800/20 rounded-xl px-4 py-3">
            <p className="text-[10px] text-slate-600 mb-1 font-bold">معرف الحدث</p>
            <p className="text-[11px] text-slate-600 font-mono break-all">{event.id}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
//  IP Analysis Panel
// ════════════════════════════════════════════════════════════════

const IpAnalysis: FC<{ events: SecurityEvent[] }> = ({ events }) => {
  const counts: Record<string, { count: number; level: ThreatLevel }> = {};
  events.forEach(e => {
    if (!e.ip_address) return;
    if (!counts[e.ip_address]) counts[e.ip_address] = { count: 0, level: e.threat_level };
    counts[e.ip_address].count++;
    const pri = LEVEL_CONFIG[e.threat_level].priority;
    if (pri > LEVEL_CONFIG[counts[e.ip_address].level].priority) {
      counts[e.ip_address].level = e.threat_level;
    }
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
  if (sorted.length === 0) return null;

  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Network size={16} className="text-blue-400" />
        <h3 className="text-sm font-bold text-slate-200">أبرز عناوين IP</h3>
      </div>
      <div className="space-y-2">
        {sorted.map(([ip, data]) => (
          <div key={ip} className="flex items-center gap-3">
            <ThreatBadge level={data.level} size="sm" />
            <span className="flex-1 text-xs font-mono text-slate-400" dir="ltr">{ip}</span>
            <span className="text-xs font-bold text-slate-500">{data.count} حدث</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
//  Event Type Analysis
// ════════════════════════════════════════════════════════════════

const TypeAnalysis: FC<{ events: SecurityEvent[] }> = ({ events }) => {
  const counts: Record<string, number> = {};
  events.forEach(e => { counts[e.type] = (counts[e.type] ?? 0) + 1; });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = sorted[0]?.[1] ?? 1;

  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart2 size={16} className="text-violet-400" />
        <h3 className="text-sm font-bold text-slate-200">أنواع الأحداث الأكثر شيوعاً</h3>
      </div>
      <div className="space-y-3">
        {sorted.map(([type, count]) => (
          <div key={type} className="flex items-center gap-3">
            <span className="text-xs text-slate-500 w-32 truncate flex-shrink-0">{type}</span>
            <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-600 rounded-full transition-all"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="text-xs font-bold text-slate-500 w-10 text-left">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
//  Main Page
// ════════════════════════════════════════════════════════════════

export default function SecurityEventsPage() {
  const { addToast } = useUIStore();

  const [events,  setEvents]  = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [page,    setPage]    = useState(1);
  const [detail,  setDetail]  = useState<SecurityEvent | null>(null);

  // ─── Load ──────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await securityEventService.findAll({
        orderBy: 'created_at',
        ascending: false,
        limit: 1000,
      });
      setEvents(raw as unknown as SecurityEvent[]);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  // ─── Counts ─────────────────────────────────────────────────
  const counts = {
    critical: events.filter(e => e.threat_level === 'critical').length,
    high:     events.filter(e => e.threat_level === 'high').length,
    medium:   events.filter(e => e.threat_level === 'medium').length,
    low:      events.filter(e => e.threat_level === 'low').length,
  };

  // ─── Filter ─────────────────────────────────────────────────
  const filtered = events.filter(e => {
    if (levelFilter !== 'all' && e.threat_level !== levelFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !e.type.toLowerCase().includes(q) &&
        !(e.user_name ?? '').toLowerCase().includes(q) &&
        !(e.ip_address ?? '').includes(q) &&
        !(e.details ?? '').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  }).sort((a, b) => {
    const pa = LEVEL_CONFIG[a.threat_level].priority;
    const pb = LEVEL_CONFIG[b.threat_level].priority;
    if (pb !== pa) return pb - pa;
    return (b.created_at ?? '').localeCompare(a.created_at ?? '');
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged      = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ─── Export ─────────────────────────────────────────────────
  const exportCSV = () => {
    const BOM = '\uFEFF';
    const headers = ['نوع الحدث', 'مستوى التهديد', 'المستخدم', 'IP', 'الوقت', 'التفاصيل'];
    const rows = filtered.map(e => [
      e.type,
      LEVEL_CONFIG[e.threat_level]?.label ?? e.threat_level,
      e.user_name ?? '',
      e.ip_address ?? '',
      e.created_at ? new Date(e.created_at).toLocaleString('ar-SA') : '',
      e.details ?? '',
    ]);
    const csv = BOM + [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `security-events-${Date.now()}.csv`;
    a.click();
    addToast('تم تصدير الأحداث الأمنية', 'success');
  };

  return (
    <div className="space-y-5" dir="rtl">
      <EventDrawer event={detail} onClose={() => setDetail(null)} />

      {/* ─── Header ─── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            <Shield size={20} className="text-red-400" />
            الأحداث الأمنية
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">مراقبة التهديدات والأنشطة الأمنية في شركتك</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-sm font-medium transition-all">
            <Download size={14} />
            <span className="hidden sm:inline">تصدير</span>
          </button>
          <button onClick={load} className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-700 text-slate-400 hover:text-white transition-all">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ─── KPIs ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(Object.entries(counts) as [ThreatLevel, number][]).map(([level, count]) => {
          const cfg = LEVEL_CONFIG[level];
          return (
            <button
              key={level}
              onClick={() => { setLevelFilter(levelFilter === level ? 'all' : level); setPage(1); }}
              className={`
                relative p-4 rounded-xl border text-right transition-all
                ${cfg.badgeBg}
                ${levelFilter === level ? 'ring-2 ring-offset-1 ring-offset-slate-950 ring-current' : 'hover:brightness-110'}
              `}
            >
              <div className={`flex items-center gap-1.5 mb-1 ${cfg.cls}`}>
                <span className={`w-2 h-2 rounded-full ${cfg.dotColor}`} />
                <span className="text-[10px] font-bold uppercase">{cfg.label}</span>
              </div>
              <p className={`text-3xl font-black ${cfg.cls}`}>{count}</p>
            </button>
          );
        })}
      </div>

      {/* ─── Analysis Row ─── */}
      <div className="grid lg:grid-cols-2 gap-5">
        <IpAnalysis events={events} />
        <TypeAnalysis events={events} />
      </div>

      {/* ─── Filters ─── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="w-full pr-9 pl-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-red-700 transition-all"
            placeholder="بحث بالنوع، المستخدم، IP..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
          {(['all', 'critical', 'high', 'medium', 'low'] as LevelFilter[]).map(f => (
            <button
              key={f}
              onClick={() => { setLevelFilter(f); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                levelFilter === f
                  ? 'bg-red-900/60 text-red-300 border border-red-700/50'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {f === 'all' ? 'الكل' : LEVEL_CONFIG[f as ThreatLevel]?.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Table ─── */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
        {loading ? (
          <div>{[1,2,3,4,5].map(i => <div key={i} className="h-14 border-b border-slate-800/40 animate-pulse" />)}</div>
        ) : paged.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Shield size={36} className="text-slate-700 mb-3" />
            <p className="text-slate-500 text-sm">
              {search || levelFilter !== 'all' ? 'لا توجد نتائج مطابقة' : 'لا توجد أحداث أمنية مسجلة'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="bg-slate-900/80 border-b border-slate-800">
                  <tr className="text-right">
                    {['التهديد', 'نوع الحدث', 'المستخدم', 'IP', 'الوقت', ''].map(h => (
                      <th key={h} className="py-3 px-3 text-[11px] font-bold text-slate-600 first:pr-4 last:pl-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.map(event => (
                    <tr
                      key={event.id}
                      className={`border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors group cursor-pointer
                        ${event.threat_level === 'critical' ? 'bg-red-900/5' : ''}
                      `}
                      onClick={() => setDetail(event)}
                    >
                      <td className="py-3 pr-4">
                        <ThreatBadge level={event.threat_level} />
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-sm font-medium text-slate-300 max-w-[160px] block truncate">
                          {event.type}
                        </span>
                      </td>
                      <td className="py-3 px-3 hidden sm:table-cell">
                        <div className="flex items-center gap-1.5">
                          <User size={11} className="text-slate-600" />
                          <span className="text-xs text-slate-500">{event.user_name ?? '—'}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 hidden md:table-cell">
                        <span className="text-xs font-mono text-slate-600" dir="ltr">
                          {event.ip_address ?? '—'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-600 hidden lg:table-cell" dir="ltr">
                        {event.created_at
                          ? new Date(event.created_at).toLocaleString('en-SA', {
                              month: '2-digit', day: '2-digit',
                              hour: '2-digit', minute: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td className="py-3 pl-4">
                        <Eye size={13} className="text-slate-600 group-hover:text-cyan-400 transition-colors ml-auto" />
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
                  {((page-1)*PAGE_SIZE)+1}–{Math.min(page*PAGE_SIZE, filtered.length)} من {filtered.length}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-all">
                    <ChevronRight size={14} />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const p = Math.max(1, Math.min(totalPages-4, page-2)) + i;
                    return (
                      <button key={p} onClick={() => setPage(p)}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                          page===p ? 'bg-red-900/60 text-red-300 border border-red-700/50' : 'text-slate-500 hover:text-white hover:bg-slate-800'
                        }`}>
                        {p}
                      </button>
                    );
                  })}
                  <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-all">
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
