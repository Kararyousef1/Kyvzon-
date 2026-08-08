/**
 * ════════════════════════════════════════════════════════════════
 *  MyProblemsPage — بلاغاتي (شاشة الموظف)
 *
 *  ═══ لماذا انقسمت الشاشة في 0341 ═══════════════════════════════
 *
 *  `ProblemsList` كانت مكوّناً واحداً يخدم دورين عبر `isHR` — يبدّل
 *  مصدر البيانات ونوعه والحقول المعروضة، ويُسطّح بنيتين مختلفتين في
 *  نوع `Problem` واحد:
 *     MyIncident : بلا employeeId · reporter · department · ageHours
 *     HrIncident : بها كلها
 *  فحُشيت الفروق بـ`user.full_name` و`''` من جانب الموظف — بيانات
 *  لا تأتي من القاعدة أصلاً.
 *
 *  هذه الشاشة تعرض ما يخصّ الموظف وحده، والصندوق الإداري في
 *  `HrProblemsInboxPage`.
 *
 *  ★★★ ما أُصلح هنا:
 *   • **سحب البلاغ**: قبل 0341 لم يكن صاحب البلاغ يستطيع تغيير حالته
 *     إطلاقاً — `kyvzon_incidents_update` تشترط `current_user_is_staff()`.
 *     مُقاس بعدّ الصفوف المتأثّرة: صاحب البلاغ → بلاغه ⇒ **0 صفوف**.
 *     الآن يسحبه ما دام معلّقاً، و`canWithdraw` من القاعدة فلا يظهر
 *     زرّ يفشل.
 *   • **الترقيم**: كانت تطلب 200 صفّاً ثابتاً وترشّح في المتصفح.
 *     الآن `out_total` من القاعدة والبحث فيها.
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus, Search, Clock, TrendingUp, CheckCircle, XCircle,
  FileText, Calendar, ChevronRight, Loader2, AlertTriangle,
  RefreshCw, Ban, Archive,
} from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import { incidentService, incidentErrorMessage } from '../../services/sdk/IncidentService';
import type { MyIncident } from '../../services/sdk/IncidentService';
import Card from '../../shared/components/ui/Card';
import Badge from '../../shared/components/ui/Badge';
import Button from '../../shared/components/ui/Button';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { usePagePermission } from '../../shared/hooks/usePagePermission';
import { getErrorMessage } from '../../services/errors';
import {
  STATUS_META, SEVERITY_META, CATEGORY_META,
  type IncidentStatusKey,
} from './problemsMeta';

const PAGE_SIZE = 20;

export default function MyProblemsPage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const navigate = useNavigate();
  // صلاحية نشر بلاغ — يتحكّم بها الـadmin من بوابة الإدارة (permKey: new-problem)
  const canCreateProblem = usePagePermission('new-problem');

  const [rows, setRows] = useState<MyIncident[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState<'all' | IncidentStatusKey>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [withdrawNote, setWithdrawNote] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // ── الجلب: الترشيح والبحث والترقيم كلها في القاعدة ────────────
  const fetchRows = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    setFetchError(null);
    try {
      const res = await incidentService.myIncidents({
        status: statusTab === 'all' ? null : statusTab,
        search: search.trim() || null,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setRows(res.rows);
      setTotal(res.total);
    } catch (err) {
      setFetchError(incidentErrorMessage(getErrorMessage(err)));
    } finally {
      setLoading(false);
    }
  }, [user?.id, statusTab, search, page]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);
  // تغيير المرشّح يُعيدنا للصفحة الأولى وإلا ظهرت صفحة فارغة
  useEffect(() => { setPage(0); }, [statusTab, search]);

  // ── سحب البلاغ ────────────────────────────────────────────────
  const handleWithdraw = async () => {
    if (!withdrawing) return;
    setBusyId(withdrawing);
    try {
      await incidentService.setStatus(withdrawing, 'closed', withdrawNote.trim() || undefined);
      addToast('سُحب البلاغ — يبقى في السجلّ للتدقيق', 'success');
      setWithdrawing(null); setWithdrawNote('');
      await fetchRows();
    } catch (err) {
      addToast(incidentErrorMessage(getErrorMessage(err)), 'error');
    } finally { setBusyId(null); }
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const tabs = useMemo(() => ([
    { key: 'all' as const, label: 'الكل', icon: FileText },
    { key: 'pending' as const, label: STATUS_META.pending.label, icon: Clock },
    { key: 'in_progress' as const, label: STATUS_META.in_progress.label, icon: TrendingUp },
    { key: 'resolved' as const, label: STATUS_META.resolved.label, icon: CheckCircle },
    { key: 'closed' as const, label: STATUS_META.closed.label, icon: XCircle },
  ]), []);

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-800">بلاغاتي</h2>
          <p className="text-sm text-slate-500 mt-1">
            {total} بلاغ
            {pageCount > 1 && ` · صفحة ${page + 1} من ${pageCount}`}
          </p>
        </div>
        {canCreateProblem && (
          <Button
            onClick={() => navigate('/app/employee/problems/new')}
            className="bg-gradient-to-br from-indigo-600 to-purple-700 hover:from-indigo-700 hover:to-purple-800"
            icon={<Plus size={18} />}
          >
            رفع بلاغ جديد
          </Button>
        )}
      </div>

      {/* التبويبات */}
      <div className="flex gap-2 bg-slate-50 border border-slate-100 rounded-2xl p-1.5 overflow-x-auto">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatusTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm whitespace-nowrap transition-all ${
              statusTab === key ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* البحث — يُنفَّذ في القاعدة */}
      <div className="relative">
        <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="بحث في العنوان والوصف..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pr-10 pl-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
        />
      </div>

      {/* القائمة */}
      <div className="space-y-3">
        {loading ? (
          <Card>
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Loader2 className="animate-spin mb-3" size={40} />
              <p className="text-sm font-medium">جاري التحميل...</p>
            </div>
          </Card>
        ) : fetchError ? (
          <Card>
            <div className="text-center py-16">
              <div className="w-20 h-20 mx-auto mb-4 bg-red-50 rounded-2xl flex items-center justify-center">
                <AlertTriangle size={40} className="text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-700 mb-2">تعذّر تحميل البلاغات</h3>
              <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">{fetchError}</p>
              <Button onClick={fetchRows} variant="outline" icon={<RefreshCw size={18} />}>
                إعادة المحاولة
              </Button>
            </div>
          </Card>
        ) : rows.length === 0 ? (
          <Card>
            <div className="text-center py-16">
              <div className="w-20 h-20 mx-auto mb-4 bg-slate-100 rounded-2xl flex items-center justify-center">
                <FileText size={40} className="text-slate-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-700 mb-2">
                {search ? 'لا نتائج للبحث' : 'لم ترفع بلاغاً بعد'}
              </h3>
              <p className="text-sm text-slate-500 mb-6">
                {search ? 'جرّب كلمة أخرى'
                  : (canCreateProblem ? 'ابدأ برفع بلاغ جديد' : 'لا توجد بلاغات لعرضها')}
              </p>
              {canCreateProblem && !search && (
                <Button onClick={() => navigate('/app/employee/problems/new')} variant="outline" icon={<Plus size={18} />}>
                  رفع بلاغ جديد
                </Button>
              )}
            </div>
          </Card>
        ) : (
          rows.map((row) => {
            const st = STATUS_META[row.status as IncidentStatusKey] ?? STATUS_META.pending;
            const sv = SEVERITY_META[row.severity] ?? SEVERITY_META.medium;
            const cat = CATEGORY_META[row.category];

            return (
              <Card
                key={row.id}
                className="hover:shadow-lg transition-all hover:border-indigo-200 group"
              >
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    <div className={`w-1.5 h-16 rounded-full ${sv.bar} flex-shrink-0`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <button
                          type="button"
                          onClick={() => navigate(`/app/employee/problems/${row.id}`)}
                          className="flex-1 min-w-0 text-right"
                        >
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            {row.isAnonymous && <Badge variant="neutral" size="sm">مجهول</Badge>}
                            {cat && (
                              <Badge variant="neutral" size="sm">
                                <span className="mr-1">{cat.icon}</span>{cat.label}
                              </Badge>
                            )}
                            {row.archivedAt && (
                              <Badge variant="neutral" size="sm">
                                <Archive size={11} className="inline ml-1" />مؤرشف
                              </Badge>
                            )}
                          </div>
                          <h3 className="text-base font-bold text-slate-800 group-hover:text-indigo-600 transition-colors truncate">
                            {row.title}
                          </h3>
                          <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                            {row.description}
                          </p>
                        </button>

                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          <Badge variant={st.variant} size="sm">{st.label}</Badge>
                          <Badge variant={sv.variant} size="sm">{sv.label}</Badge>
                        </div>
                      </div>

                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-4 text-xs text-slate-400">
                          <div className="flex items-center gap-1.5">
                            <Calendar size={14} />
                            <span>{format(new Date(row.createdAt), 'dd MMM yyyy', { locale: ar })}</span>
                          </div>
                          {row.assignedTo && (
                            <span>المسؤول: {row.assignee}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {/* ★★★ الزرّ من القاعدة: canWithdraw يطابق شرط
                              set_incident_status فلا يظهر زرّ يفشل */}
                          {row.canWithdraw && (
                            <button
                              type="button"
                              onClick={() => { setWithdrawing(row.id); setWithdrawNote(''); }}
                              disabled={busyId === row.id}
                              className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg font-bold text-xs disabled:opacity-50 hover:bg-slate-200 transition-colors"
                            >
                              <Ban size={13} className="inline ml-1" />سحب البلاغ
                            </button>
                          )}
                          <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-500 transition-colors" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* الترقيم */}
      {!loading && !fetchError && pageCount > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            السابق
          </Button>
          <span className="text-sm text-slate-500">{page + 1} / {pageCount}</span>
          <Button
            variant="outline"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1}
          >
            التالي
          </Button>
        </div>
      )}

      {/* نافذة السحب */}
      {withdrawing && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setWithdrawing(null)}
          role="presentation"
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            <h3 className="text-lg font-extrabold mb-1">سحب البلاغ</h3>
            <p className="text-sm text-slate-500 mb-3">
              يُغلق البلاغ ويبقى في السجلّ للتدقيق. لا يُحذف.
            </p>
            <textarea
              value={withdrawNote}
              onChange={(e) => setWithdrawNote(e.target.value)}
              rows={3}
              className="w-full border rounded-xl px-3 py-2.5"
              placeholder="سبب السحب (اختياري — يُسجَّل في تعليقات البلاغ)"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button" onClick={() => setWithdrawing(null)}
                className="px-4 py-2 bg-slate-100 rounded-xl"
              >تراجع</button>
              <button
                type="button" onClick={handleWithdraw}
                disabled={busyId === withdrawing}
                className="px-4 py-2 bg-slate-800 text-white rounded-xl disabled:opacity-50"
              >تأكيد السحب</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
