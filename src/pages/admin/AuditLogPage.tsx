import { Shield, Search, Loader, Filter, Download } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { auditLogService } from '../../services/sdk';
import Card from '../../shared/components/ui/Card';
import Badge from '../../shared/components/ui/Badge';
import Button from '../../shared/components/ui/Button';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { getErrorMessage } from '../../services/errors';

interface AuditLogView {
  id: string;
  action?: string;
  target?: string;
  table_name?: string;
  actor?: string;
  actorRole?: string;
  details?: string;
  timestamp?: string;
  created_at?: string;
}

const roleVariants: Record<string, 'danger' | 'success' | 'primary' | 'warning' | 'neutral'> = {
  admin: 'danger',
  hr: 'success',
  employee: 'primary',
  developer: 'warning',
  system: 'neutral',
};

const roleLabels: Record<string, string> = {
  admin: 'مشرف',
  hr: 'HR',
  employee: 'موظف',
  developer: 'مطور',
  system: 'نظام',
};

export default function AuditLogPage() {
  const [auditLogs, setAuditLogs] = useState<AuditLogView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await auditLogService.findAllWithProfiles({ limit: 300 });
        setAuditLogs((data || []).map((d: any) => ({
          ...d,
          actor: d.profiles ? (d.profiles.full_name || 'مستخدم بدون اسم') : 'نظام',
          actorRole: d.actor_role || d.role || 'system',
          target: d.target || d.table_name || 'النظام',
          details: typeof d.details === 'string' ? d.details : JSON.stringify(d.details || d.new_value || ''),
          timestamp: d.timestamp || d.created_at,
        })));
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  const filtered = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startWeek = startToday - 6 * 86400000;
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const q = search.trim().toLowerCase();
    return auditLogs.filter(log => {
      const role = log.actorRole || 'system';
      if (roleFilter !== 'all' && role !== roleFilter) return false;
      const ts = log.timestamp ? new Date(log.timestamp).getTime() : 0;
      if (dateFilter === 'today' && ts < startToday) return false;
      if (dateFilter === 'week' && ts < startWeek) return false;
      if (dateFilter === 'month' && ts < startMonth) return false;
      if (!q) return true;
      return [log.action, log.actor, log.target, log.details].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [auditLogs, dateFilter, roleFilter, search]);

  const exportCsv = () => {
    const headers = ['الإجراء', 'المستخدم', 'الدور', 'الهدف', 'التفاصيل', 'الوقت'];
    const rows = filtered.map(log => [log.action || '', log.actor || '', roleLabels[log.actorRole || 'system'] || '', log.target || '', log.details || '', log.timestamp || '']);
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headers.join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800">🛡️ سجل العمليات</h2>
          <p className="text-sm text-slate-500">تتبع جميع الأنشطة والعمليات في النظام مع فلاتر وتصدير</p>
        </div>
        <Button size="sm" variant="secondary" onClick={exportCsv} icon={<Download size={14} />} iconPosition="left">تصدير CSV</Button>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <div className="relative md:col-span-2">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في السجل..." className="w-full bg-white border border-slate-200 rounded-xl pr-10 pl-4 py-2.5 text-sm text-slate-700 outline-none focus:border-indigo-400" />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none">
          <option value="all">كل الأدوار</option>
          {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none">
          <option value="all">كل الفترات</option>
          <option value="today">اليوم</option>
          <option value="week">آخر 7 أيام</option>
          <option value="month">هذا الشهر</option>
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><p className="text-2xl font-extrabold text-slate-900">{auditLogs.length}</p><p className="text-xs text-slate-500">إجمالي السجلات</p></Card>
        <Card><p className="text-2xl font-extrabold text-indigo-600">{filtered.length}</p><p className="text-xs text-slate-500">نتائج الفلترة</p></Card>
        <Card><p className="text-2xl font-extrabold text-red-600">{auditLogs.filter(l => l.actorRole === 'admin').length}</p><p className="text-xs text-slate-500">إجراءات المشرفين</p></Card>
        <Card><p className="text-2xl font-extrabold text-emerald-600">{auditLogs.filter(l => l.actorRole === 'hr').length}</p><p className="text-xs text-slate-500">إجراءات HR</p></Card>
      </div>

      {error && <Card className="bg-red-50 border-red-100 text-red-700"><p>{error}</p></Card>}

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['الإجراء', 'المستخدم', 'الدور', 'الهدف', 'التفاصيل', 'الوقت'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className="text-center py-12 text-slate-500"><Loader className="animate-spin mx-auto mb-2" />جاري تحميل السجلات...</td></tr> : filtered.map((log, i) => (
                <tr key={log.id} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                  <td className="py-3 px-4"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center"><Shield size={12} className="text-orange-500" /></div><span className="font-semibold text-slate-800">{log.action}</span></div></td>
                  <td className="py-3 px-4 text-slate-600">{log.actor}</td>
                  <td className="py-3 px-4"><Badge variant={roleVariants[log.actorRole || 'system'] || 'neutral'} size="sm">{roleLabels[log.actorRole || 'system'] || log.actorRole}</Badge></td>
                  <td className="py-3 px-4 text-slate-600">{log.target}</td>
                  <td className="py-3 px-4 text-slate-500 text-xs max-w-xs truncate">{log.details}</td>
                  <td className="py-3 px-4 text-xs text-slate-400 whitespace-nowrap">{log.timestamp ? format(new Date(log.timestamp), 'dd MMM HH:mm', { locale: ar }) : 'غير محدد'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length === 0 && <div className="text-center py-12 text-slate-400"><Filter size={36} className="mx-auto mb-2 opacity-30" /><p>لا توجد نتائج</p></div>}
      </Card>
    </div>
  );
}
