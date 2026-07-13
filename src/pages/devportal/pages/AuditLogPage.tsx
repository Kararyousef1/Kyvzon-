/**
 * ════════════════════════════════════════════════════════════════
 *  Kyvzon Dev Portal — Audit Log Page
 *  سجل العمليات: مراقبة وتدقيق نشاطات المنصة
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, type FC } from 'react';
import {
  ScrollText, RefreshCw, Search, Filter,
  Shield, Building2, CreditCard, Settings, AlertTriangle,
  User, Clock, ChevronDown, X,
} from 'lucide-react';
import { PageHeader, Badge, EmptyState } from '../components/shared';
import { auditApi } from '../services/api';
import type { AuditEntry, IconType } from '../types';
import { useUIStore } from '../../../core/stores';

// ════════════════════════════════════════════════════════════════
//  Category Config
// ════════════════════════════════════════════════════════════════

const CATEGORY_CONFIG: Record<string, { icon: IconType; label: string; bg: string; text: string }> = {
  company:      { icon: Building2,    label: 'شركة',      bg: 'bg-cyan-50',   text: 'text-cyan-700' },
  subscription: { icon: CreditCard,   label: 'اشتراك',    bg: 'bg-violet-50', text: 'text-violet-700' },
  security:     { icon: Shield,       label: 'أمان',      bg: 'bg-red-50',    text: 'text-red-700' },
  system:       { icon: Settings,     label: 'نظام',      bg: 'bg-amber-50',  text: 'text-amber-700' },
  general:      { icon: ScrollText,   label: 'عام',       bg: 'bg-gray-100',  text: 'text-gray-600' },
};

const CATEGORIES = ['all', 'company', 'subscription', 'security', 'system', 'general'];

// ════════════════════════════════════════════════════════════════
//  Audit Entry Row
// ════════════════════════════════════════════════════════════════

const AuditEntryRow: FC<{ entry: AuditEntry }> = ({ entry }) => {
  const config = CATEGORY_CONFIG[entry.category] ?? CATEGORY_CONFIG.general;
  const Icon = config.icon;

  return (
    <div className="flex items-start gap-4 p-4 bg-white hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0 group">
      <div className={`w-10 h-10 rounded-xl ${config.bg} flex items-center justify-center flex-shrink-0`}>
        <Icon size={18} className={config.text} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-gray-900">{entry.action}</span>
          <Badge variant={entry.category}>{config.label}</Badge>
          {entry.target_name && (
            <span className="text-xs text-gray-500">
              على <span className="text-cyan-600 font-bold">{entry.target_name}</span>
            </span>
          )}
        </div>
        {entry.description && (
          <p className="text-xs text-gray-500 mt-1">{entry.description}</p>
        )}
        <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
          {entry.actor_name && (
            <span className="flex items-center gap-1">
              <User size={10} /> {entry.actor_name}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock size={10} /> {new Date(entry.created_at).toLocaleString('ar-SA')}
          </span>
          {entry.ip_address && (
            <span className="font-mono">{entry.ip_address}</span>
          )}
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
//  Audit Log Page
// ════════════════════════════════════════════════════════════════

export default function AuditLogPage() {
  const { addToast } = useUIStore();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [catFilter, setCatFilter] = useState('all');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await auditApi.getLogs(150);
      setEntries(data);
    } catch (err: any) {
      addToast('فشل تحميل سجل العمليات', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const filtered = entries.filter((e) => {
    const matchCat = catFilter === 'all' || e.category === catFilter;
    const matchSearch = !search.trim() ||
      e.action?.toLowerCase().includes(search.toLowerCase()) ||
      e.target_name?.toLowerCase().includes(search.toLowerCase()) ||
      e.description?.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="سجل العمليات"
        description={`${entries.length} عملية مسجلة في المنصة`}
        action={
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 font-bold text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            تحديث
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث في العمليات..."
            className="w-full bg-white border border-gray-200 rounded-xl pr-12 pl-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10 transition-all shadow-sm"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCatFilter(cat)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                catFilter === cat
                  ? 'bg-cyan-600 text-white shadow-md'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {cat === 'all' ? 'الكل' : CATEGORY_CONFIG[cat]?.label ?? cat}
            </button>
          ))}
        </div>
      </div>

      {/* Logs */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="animate-spin text-gray-400" size={32} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={entries.length === 0 ? 'لا توجد عمليات مسجلة' : 'لا توجد نتائج للتصفية'}
            description={entries.length === 0 ? 'ستظهر العمليات هنا عند حدوثها' : 'جرب تغيير معايير البحث'}
          />
        ) : (
          <div className="max-h-[600px] overflow-y-auto">
            {filtered.map((entry) => (
              <AuditEntryRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
