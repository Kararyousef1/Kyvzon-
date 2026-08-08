/**
 * ════════════════════════════════════════════════════════════════
 *  HrProblemsInboxPage — صندوق بلاغات الموارد البشرية
 *
 *  ═══ لماذا انفصل عن شاشة الموظف في 0341 ════════════════════════
 *
 *  كان `ProblemsList` مكوّناً واحداً يخدم دورين عبر `isHR`، ويُسطّح
 *  بنيتَي بيانات مختلفتين في نوع واحد. النتيجة أن الحقول الإدارية
 *  (المُبلِّغ · القسم · عمر البلاغ · المُسنَد إليه) لم تُعرض قط، وأن
 *  أدوات إدارة الصندوق كانت مفقودة كلياً رغم وجودها في القاعدة.
 *
 *  ★★★ ما أُصلح هنا — كلّه مُقاس تشغيلياً:
 *   • **الإسناد**: `assign_incident` (0338) كاملة ومحميّة ولا زرّ
 *     يستدعيها. مُقاس: 6 بلاغات، **جميعها** `assigned_to IS NULL`.
 *   • **تغيير الحالة**: لا زرّ ولا دالة قاعدة. الآن `set_incident_status`
 *     بانتقالات محدَّدة.
 *   • **الأرشفة بدل الحذف**: الحذف كان متاحاً لأي `staff` (مُقاس: 1 صفّ
 *     محذوف) ومعه التعليقات بـ`ON DELETE CASCADE`.
 *   • **الترقيم والبحث**: كانت تطلب 200 صفّاً وترشّح في المتصفح، بينما
 *     `hr_incidents_inbox(p_status, p_severity, p_search, …)` تعمل.
 *     مُقاس: بحث 'شبكة' في القاعدة أعاد 'بطء الشبكة'.
 *   • **الإحصاءات**: `hr_incident_stats` تُعيد `unassigned=4`
 *     و`anonymous=2` — رقمان لم يكونا يُعرضان إطلاقاً.
 *
 *  ★ إخفاء هوية المُبلِّغ المجهول (0338) يعمل في القاعدة: هذه الشاشة
 *    تعرض ما تُعطيه الدالة، ولا تستطيع كشف الهوية حتى لو أخطأت.
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Search, Clock, TrendingUp, CheckCircle, FileText,
  Calendar, ChevronRight, Loader2, AlertTriangle, RefreshCw,
  Archive, UserPlus, EyeOff, Timer, Inbox,
} from 'lucide-react';
import { useUIStore } from '../../core/stores';
import { incidentService, incidentErrorMessage } from '../../services/sdk/IncidentService';
import type { HrIncident, HrIncidentStats } from '../../services/sdk/IncidentService';
import { employeeService } from '../../services/sdk';
import Card from '../../shared/components/ui/Card';
import Badge from '../../shared/components/ui/Badge';
import Button from '../../shared/components/ui/Button';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../../services/errors';
import {
  STATUS_META, SEVERITY_META, CATEGORY_META, STATUS_TRANSITIONS,
  type IncidentStatusKey,
} from '../employee/problemsMeta';

const PAGE_SIZE = 20;

interface EmployeeOption { id: string; name: string }

export default function HrProblemsInboxPage() {
  const { addToast } = useUIStore();
  const navigate = useNavigate();

  const [rows, setRows] = useState<HrIncident[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<HrIncidentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<'all' | IncidentStatusKey>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(0);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<HrIncident | null>(null);
  const [assignTarget, setAssignTarget] = useState<string>('');
  const [archiving, setArchiving] = useState<string | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  // ── الجلب: كل الترشيح في القاعدة ──────────────────────────────
  const fetchRows = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await incidentService.hrInbox({
        status: statusFilter === 'all' ? null : statusFilter,
        severity: severityFilter === 'all' ? null : severityFilter,
        search: search.trim() || null,
        includeArchived,
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
  }, [statusFilter, severityFilter, search, includeArchived, page]);

  const fetchStats = useCallback(async () => {
    try { setStats(await incidentService.hrStats(30)); }
    catch { /* الإحصاءات اختيارية للعرض */ }
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {
      const list = await employeeService.findAll({ limit: 300, orderBy: 'first_name' });
      setEmployees(list.map((e) => ({
        id: e.id,
        name: `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() || 'موظف',
      })));
    } catch { setEmployees([]); }
  }, []);

  useEffect(() => { void fetchRows(); }, [fetchRows]);
  useEffect(() => { void fetchStats(); void fetchEmployees(); }, [fetchStats, fetchEmployees]);
  useEffect(() => { setPage(0); }, [statusFilter, severityFilter, search, includeArchived]);

  // ── تغيير الحالة ──────────────────────────────────────────────
  const changeStatus = async (row: HrIncident, next: IncidentStatusKey) => {
    setBusyId(row.id);
    try {
      await incidentService.setStatus(row.id, next);
      addToast(`الحالة الآن: ${STATUS_META[next].label}`, 'success');
      await Promise.all([fetchRows(), fetchStats()]);
    } catch (err) {
      addToast(incidentErrorMessage(getErrorMessage(err)), 'error');
    } finally { setBusyId(null); }
  };

  // ── الإسناد ───────────────────────────────────────────────────
  const handleAssign = async () => {
    if (!assigning) return;
    setBusyId(assigning.id);
    try {
      await incidentService.assign(assigning.id, assignTarget || null);
      addToast(assignTarget ? 'أُسنِد البلاغ' : 'أُلغي الإسناد', 'success');
      setAssigning(null); setAssignTarget('');
      await Promise.all([fetchRows(), fetchStats()]);
    } catch (err) {
      addToast(incidentErrorMessage(getErrorMessage(err)), 'error');
    } finally { setBusyId(null); }
  };

  // ── الأرشفة (بديل الحذف) ─────────────────────────────────────
  const handleArchive = async () => {
    if (!archiving) return;
    setBusyId(archiving);
    try {
      await incidentService.archive(archiving, archiveReason.trim());
      addToast('أُرشِف البلاغ — يبقى وتعليقاته للتدقيق', 'success');
      setArchiving(null); setArchiveReason('');
      await Promise.all([fetchRows(), fetchStats()]);
    } catch (err) {
      addToast(incidentErrorMessage(getErrorMessage(err)), 'error');
    } finally { setBusyId(null); }
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-800">
            <Inbox size={22} className="inline ml-2" />صندوق البلاغات
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {total} بلاغ{pageCount > 1 && ` · صفحة ${page + 1} من ${pageCount}`}
          </p>
        </div>
        <Button variant="outline" onClick={() => { void fetchRows(); void fetchStats(); }} icon={<RefreshCw size={16} />}>
          تحديث
        </Button>
      </div>

      {/* ★ الإحصاءات من القاعدة — unassigned و anonymous لم يكونا يُعرضان */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'الإجمالي', value: stats.total, cls: 'bg-white text-slate-800', icon: FileText },
            { label: 'معلّقة', value: stats.pending, cls: 'bg-amber-50 text-amber-700', icon: Clock },
            { label: 'قيد المعالجة', value: stats.inProgress, cls: 'bg-blue-50 text-blue-700', icon: TrendingUp },
            { label: 'محلولة', value: stats.resolved, cls: 'bg-emerald-50 text-emerald-700', icon: CheckCircle },
            { label: 'حرجة', value: stats.critical, cls: 'bg-red-50 text-red-700', icon: AlertTriangle },
            { label: 'بلا مسؤول', value: stats.unassigned, cls: 'bg-orange-50 text-orange-700', icon: UserPlus },
            { label: 'مجهولة', value: stats.anonymous, cls: 'bg-violet-50 text-violet-700', icon: EyeOff },
          ].map((s) => (
            <div key={s.label} className={`rounded-2xl p-4 border ${s.cls}`}>
              <div className="flex items-center justify-between mb-1">
                <s.icon size={16} className="opacity-60" />
              </div>
              <p className="text-2xl font-extrabold">{s.value}</p>
              <p className="text-xs font-bold opacity-80">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {stats && stats.oldestHours > 48 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">
          <Timer size={16} className="inline ml-2" />
          أقدم بلاغ مفتوح مضى عليه {Math.round(stats.oldestHours)} ساعة
          ({Math.round(stats.oldestHours / 24)} يوماً)
        </div>
      )}

      {/* المرشّحات — كلها تُنفَّذ في القاعدة */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px] relative">
          <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="بحث في العنوان والوصف واسم المُبلِّغ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pr-10 pl-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | IncidentStatusKey)}
          className="px-4 py-2.5 border border-slate-200 rounded-xl outline-none bg-white"
          aria-label="ترشيح بالحالة"
        >
          <option value="all">جميع الحالات</option>
          {(Object.keys(STATUS_META) as IncidentStatusKey[]).map((k) => (
            <option key={k} value={k}>{STATUS_META[k].label}</option>
          ))}
        </select>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="px-4 py-2.5 border border-slate-200 rounded-xl outline-none bg-white"
          aria-label="ترشيح بالأولوية"
        >
          <option value="all">جميع الأولويات</option>
          <option value="critical">حرجة</option>
          <option value="high">عالية</option>
          <option value="medium">متوسطة</option>
          <option value="low">منخفضة</option>
        </select>

        <label className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl bg-white cursor-pointer">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm">إظهار المؤرشف{stats ? ` (${stats.archived})` : ''}</span>
        </label>
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
              <h3 className="text-lg font-bold text-slate-700 mb-2">تعذّر تحميل الصندوق</h3>
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
              <h3 className="text-lg font-bold text-slate-700 mb-2">لا بلاغات مطابقة</h3>
              <p className="text-sm text-slate-500">جرّب تغيير المرشّحات</p>
            </div>
          </Card>
        ) : (
          rows.map((row) => {
            const st = STATUS_META[row.status as IncidentStatusKey] ?? STATUS_META.pending;
            const sv = SEVERITY_META[row.severity] ?? SEVERITY_META.medium;
            const cat = CATEGORY_META[row.category];
            const nexts = STATUS_TRANSITIONS[row.status as IncidentStatusKey] ?? [];
            const locked = Boolean(row.archivedAt);

            return (
              <Card key={row.id} className={`transition-all group ${locked ? 'opacity-70' : 'hover:shadow-lg hover:border-indigo-200'}`}>
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    <div className={`w-1.5 h-16 rounded-full ${sv.bar} flex-shrink-0`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <button
                          type="button"
                          onClick={() => navigate(`/app/hr/problems/${row.id}`)}
                          className="flex-1 min-w-0 text-right"
                        >
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            {/* ★★★ الهوية مخفيّة في القاعدة — هذه الشاشة تعرض ما تُعطى */}
                            {row.isAnonymous && (
                              <Badge variant="neutral" size="sm">
                                <EyeOff size={11} className="inline ml-1" />مجهول
                              </Badge>
                            )}
                            {cat && (
                              <Badge variant="neutral" size="sm">
                                <span className="mr-1">{cat.icon}</span>{cat.label}
                              </Badge>
                            )}
                            {locked && (
                              <Badge variant="neutral" size="sm">
                                <Archive size={11} className="inline ml-1" />مؤرشف
                              </Badge>
                            )}
                            {!row.assignedTo && !locked && (
                              <Badge variant="warning" size="sm">بلا مسؤول</Badge>
                            )}
                          </div>
                          <h3 className="text-base font-bold text-slate-800 group-hover:text-indigo-600 transition-colors truncate">
                            {row.title}
                          </h3>
                          <p className="text-sm text-slate-500 mt-1 line-clamp-2">{row.description}</p>
                        </button>

                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          <Badge variant={st.variant} size="sm">{st.label}</Badge>
                          <Badge variant={sv.variant} size="sm">{sv.label}</Badge>
                        </div>
                      </div>

                      {/* الحقول الإدارية — لم تكن تُعرض قبل 0341 */}
                      <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap mb-3">
                        <span>المُبلِّغ: <span className="font-bold text-slate-700">{row.reporter}</span></span>
                        <span>القسم: {row.department}</span>
                        <span className="flex items-center gap-1">
                          <Calendar size={13} />
                          {format(new Date(row.createdAt), 'dd MMM yyyy', { locale: ar })}
                        </span>
                        <span className={`flex items-center gap-1 ${row.ageHours > 48 ? 'text-red-600 font-bold' : ''}`}>
                          <Timer size={13} />
                          {row.ageHours < 24
                            ? `${Math.round(row.ageHours)} ساعة`
                            : `${Math.round(row.ageHours / 24)} يوم`}
                        </span>
                        <span>المسؤول: {row.assignee}</span>
                      </div>

                      {/* الأدوات */}
                      {!locked && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* ★ الانتقالات المسموحة فقط — نسخة من جدول القاعدة */}
                          {nexts.map((next) => (
                            <button
                              key={next}
                              type="button"
                              onClick={() => changeStatus(row, next)}
                              disabled={busyId === row.id}
                              className="px-3 py-1.5 rounded-lg font-bold text-xs border border-slate-200 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                            >
                              → {STATUS_META[next].label}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => { setAssigning(row); setAssignTarget(row.assignedTo ?? ''); }}
                            disabled={busyId === row.id}
                            className="px-3 py-1.5 rounded-lg font-bold text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
                          >
                            <UserPlus size={13} className="inline ml-1" />إسناد
                          </button>
                          <button
                            type="button"
                            onClick={() => { setArchiving(row.id); setArchiveReason(''); }}
                            disabled={busyId === row.id}
                            className="px-3 py-1.5 rounded-lg font-bold text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 transition-colors"
                          >
                            <Archive size={13} className="inline ml-1" />أرشفة
                          </button>
                          <ChevronRight size={16} className="text-slate-300 mr-auto" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {!loading && !fetchError && pageCount > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
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

      {/* نافذة الإسناد */}
      {assigning && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setAssigning(null)}
          role="presentation"
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            <h3 className="text-lg font-extrabold mb-1">إسناد البلاغ</h3>
            <p className="text-sm text-slate-500 mb-3 truncate">{assigning.title}</p>
            <select
              value={assignTarget}
              onChange={(e) => setAssignTarget(e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5"
              aria-label="اختيار المسؤول"
            >
              <option value="">— بلا مسؤول (إلغاء الإسناد) —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => setAssigning(null)} className="px-4 py-2 bg-slate-100 rounded-xl">
                تراجع
              </button>
              <button
                type="button" onClick={handleAssign}
                disabled={busyId === assigning.id}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl disabled:opacity-50"
              >تأكيد</button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة الأرشفة — بديل الحذف النهائي */}
      {archiving && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setArchiving(null)}
          role="presentation"
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            <h3 className="text-lg font-extrabold mb-1">أرشفة البلاغ</h3>
            <p className="text-sm text-slate-500 mb-3">
              البلاغ وتعليقاته يبقيان للتدقيق. لا حذف نهائي.
            </p>
            <textarea
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              rows={3}
              className="w-full border rounded-xl px-3 py-2.5"
              placeholder="سبب الأرشفة (مطلوب)"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => setArchiving(null)} className="px-4 py-2 bg-slate-100 rounded-xl">
                تراجع
              </button>
              <button
                type="button" onClick={handleArchive}
                disabled={!archiveReason.trim() || busyId === archiving}
                className="px-4 py-2 bg-slate-800 text-white rounded-xl disabled:opacity-50"
              >تأكيد الأرشفة</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
