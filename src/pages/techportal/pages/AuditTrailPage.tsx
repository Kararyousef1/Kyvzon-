/**
 * ════════════════════════════════════════════════════════════════
 *  AuditTrailPage — سجلّ التدقيق الموحّد
 *
 *  المسار: /app/tech-portal/audit-trail
 *
 *  ★ الفجوة التي تسدّها: سجلّ التدقيق كان مُبعثَراً على 16 جدولاً بلا
 *    أي عرض موحّد. مسؤول التقنية الذي يسأل «من غيّر هذا السجلّ؟» كان
 *    عليه أن يعرف الوحدة أولاً ثم يفتح جدولها.
 *
 *  ★ `platform_audit_log` مُستثنى عمداً — بيانات منصة لا تخصّ الشركة
 *    (قرار عزل 0328).
 * ════════════════════════════════════════════════════════════════
 */
import { useState, useEffect, useCallback } from 'react';
import { ScrollText, RefreshCw, Search, Loader2, Filter, User } from 'lucide-react';
import {
  techAuditService,
  type AuditEvent,
  type AuditModule,
} from '../../../services/sdk/TechAuditService';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';

const PAGE_SIZE = 50;

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ar', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function AuditTrailPage() {
  const { addToast } = useUIStore();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [modules, setModules] = useState<AuditModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [module, setModule] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, mods] = await Promise.all([
        techAuditService.auditTrail({
          module,
          search: applied || null,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        }),
        techAuditService.auditModules(),
      ]);
      setEvents(rows);
      setModules(mods);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [module, applied, page, addToast]);

  useEffect(() => { void load(); }, [load]);

  const totalEvents = modules.reduce((s, m) => s + m.events, 0);

  return (
    <div dir="rtl" className="space-y-5">
      {/* الهيدر */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/60 border border-cyan-800 flex items-center justify-center">
            <ScrollText className="text-cyan-400" size={18} />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-100">سجلّ التدقيق الموحّد</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              كل التغييرات عبر وحدات شركتك في مكان واحد
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

      {/* بطاقات الوحدات */}
      {modules.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setModule(null); setPage(0); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
              module === null
                ? 'bg-cyan-950/60 text-cyan-300 border-cyan-700'
                : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
          >
            الكل ({totalEvents})
          </button>
          {modules.map((m) => (
            <button
              key={m.module}
              onClick={() => { setModule(m.module); setPage(0); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                module === m.module
                  ? 'bg-cyan-950/60 text-cyan-300 border-cyan-700'
                  : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              {m.module} ({m.events})
            </button>
          ))}
        </div>
      )}

      {/* البحث */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setApplied(search); setPage(0); } }}
            placeholder="ابحث في الإجراء أو الكيان أو اسم المستخدم…"
            className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2.5 pr-10 pl-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-800"
          />
        </div>
        <button
          onClick={() => { setApplied(search); setPage(0); }}
          className="px-5 py-2.5 bg-cyan-700 text-white rounded-xl text-sm font-bold hover:bg-cyan-600"
        >
          بحث
        </button>
        {(applied || module) && (
          <button
            onClick={() => { setSearch(''); setApplied(''); setModule(null); setPage(0); }}
            className="px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm font-bold text-slate-300"
          >
            مسح
          </button>
        )}
      </div>

      {/* الجدول */}
      <div className="rounded-2xl border border-slate-700 bg-slate-900/60 overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="animate-spin text-cyan-500" size={26} />
          </div>
        ) : events.length === 0 ? (
          <div className="p-12 text-center">
            <Filter className="mx-auto text-slate-700 mb-3" size={30} />
            <p className="text-sm text-slate-400 font-bold">لا أحداث مطابقة</p>
            <p className="text-xs text-slate-600 mt-1">
              {applied || module
                ? 'جرّب توسيع البحث أو اختيار «الكل»'
                : 'لم تُسجَّل أحداث تدقيق في شركتك بعد'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr className="text-slate-400 text-xs">
                  <th className="text-right px-4 py-3 font-semibold">الوحدة</th>
                  <th className="text-right px-4 py-3 font-semibold">الإجراء</th>
                  <th className="text-right px-4 py-3 font-semibold">الكيان</th>
                  <th className="text-right px-4 py-3 font-semibold">المستخدم</th>
                  <th className="text-right px-4 py-3 font-semibold">الوقت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {events.map((e, i) => (
                  <tr key={`${e.module}-${e.occurredAt}-${i}`} className="hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <span className="text-xs font-bold px-2 py-1 rounded-lg bg-slate-800 text-cyan-300 border border-slate-700">
                        {e.module}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-200 font-medium">{e.action}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{e.entity ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-slate-300 text-xs">
                        <User size={12} className="text-slate-600" />
                        {e.actorName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {formatWhen(e.occurredAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* الترقيم */}
      {(page > 0 || events.length === PAGE_SIZE) && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm font-bold text-slate-300 disabled:opacity-40"
          >
            السابق
          </button>
          <span className="text-xs text-slate-500">صفحة {page + 1}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={events.length < PAGE_SIZE || loading}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm font-bold text-slate-300 disabled:opacity-40"
          >
            التالي
          </button>
        </div>
      )}
    </div>
  );
}
