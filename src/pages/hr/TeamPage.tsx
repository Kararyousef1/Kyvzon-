/**
 * ════════════════════════════════════════════════════════════════
 *  TeamPage — دليل فريق العمل (HR) · أُعيدت كتابتها في المرحلة 4
 *
 *  ★★★ ما كان معطوباً — كلّه مقيس على Postgres قبل الكتابة
 *      (المسبار: tools/dev/_probe_0357.sql · التفاصيل في
 *       supabase/migrations/0357_team_directory_integrity.sql):
 *
 *  ① `mood_score` عمود معدوم ⇒ «صحة 0%» وشريط أحمر لكل موظف أبداً.
 *     (العمود الحقيقيّ `score`. و`?? 0` هو ما أخفى العطل.)
 *  ② `reported_by` يشير إلى `profiles` والصفحة تُطابقه بـ`employees.id`
 *     ⇒ «0 مشاكل» لكل موظف أبداً.
 *  ③ الاسم والبريد والهاتف والمسمّى — أربعة أعمدة NULL لكل موظف
 *     ⇒ «بدون اسم» والحرف الأول **U** للجميع وبحثٌ بالبريد بلا معنى.
 *  ④ `employees.role` غير مُدار ⇒ مديرٌ يظهر «موظف» أبداً.
 *  ⑤ `on_leave` مُعرَّفة ولا تُنتَج أبداً — شيفرة ميتة.
 *  ⑥ خمسة جداول كاملة + `filter` داخل `map`.
 *  ⑦ سياسة `employees` بلا تمييز دور.
 *  ⑧ البلاغ المؤرشف يُعدّ مفتوحاً.
 *  ⑨ `statusVariants: Record<string, any>`.
 *
 *  ★ الصفحة لا تلمس Supabase — كل شيء عبر `teamDirectoryService`.
 * ════════════════════════════════════════════════════════════════
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Search, Mail, Phone, Loader2, ServerCrash, RefreshCw,
  Users, HeartPulse, AlertTriangle, Award, LayoutGrid, List,
  Building2, BadgeCheck,
} from 'lucide-react';
import {
  teamDirectoryService,
  TEAM_STATUSES, TEAM_STATUS_AR, TEAM_STATUS_TONE,
  roleLabel, roleTone,
} from '../../services/sdk';
import type {
  TeamMember, TeamSummary, TeamDepartment, TeamStatus,
} from '../../services/sdk';
import { getErrorMessage } from '../../services/errors';
import Card from '../../shared/components/ui/Card';

/** لون الصحة — `null` ليست صفراً */
function wellnessTone(v: number | null): string {
  if (v === null) return 'bg-slate-300';
  if (v >= 75) return 'bg-emerald-500';
  if (v >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

/** الحرف الأول — بعد أن صار الاسم حقيقياً (كان «U» للجميع) */
function initial(name: string): string {
  const t = name.trim();
  return t ? t.charAt(0) : '؟';
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [summary, setSummary] = useState<TeamSummary | null>(null);
  const [departments, setDepartments] = useState<TeamDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | TeamStatus>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // ★ العطل ⑥: خمسة جداول كاملة صارت ثلاث دوال قاعدة محدودة.
      //   الترشيح والبحث والحساب كلّها هناك.
      const [rows, sum, deps] = await Promise.all([
        teamDirectoryService.members({
          search: search.trim() || null,
          departmentId: deptFilter === 'all' ? null : deptFilter,
          status: statusFilter === 'all' ? null : statusFilter,
          includeInactive: true,
          limit: 300,
        }),
        teamDirectoryService.summary(),
        teamDirectoryService.departments(),
      ]);
      setMembers(rows);
      setSummary(sum);
      setDepartments(deps);
    } catch (err) {
      setError(getErrorMessage(err));
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [search, deptFilter, statusFilter]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  return (
    <div className="space-y-5 animate-fade-in" dir="rtl">
      {/* ═══ الترويسة ═══ */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Users className="text-white" size={22} />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-slate-800">فريق العمل</h2>
            <p className="text-sm text-slate-500">
              {loading ? 'جاري التحميل…' : `${members.length} من ${summary?.total ?? 0} موظف`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void fetchAll()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            تحديث
          </button>
          <div className="flex bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => setView('grid')}
              title="عرض شبكيّ"
              className={`p-1.5 rounded-lg transition-colors ${
                view === 'grid' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setView('list')}
              title="عرض جدوليّ"
              className={`p-1.5 rounded-lg transition-colors ${
                view === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ═══ البطاقات — محسوبة في القاعدة ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Users size={15} />} tone="text-slate-900"
          value={summary ? String(summary.total) : '—'}
          label="إجمالي الفريق"
          hint={summary
            ? `${summary.active} نشط · ${summary.onLeave} في إجازة · ${summary.inactive} غير نشط`
            : ''}
        />
        {/* ★★★ NULL ≠ صفر (درس 0353) — كانت الشاشة تعرض 0% دائماً */}
        <StatCard
          icon={<HeartPulse size={15} />}
          tone={summary && summary.avgWellness !== null
            ? (summary.avgWellness >= 75 ? 'text-emerald-600'
               : summary.avgWellness >= 50 ? 'text-amber-600' : 'text-red-600')
            : 'text-slate-400'}
          value={summary
            ? (summary.avgWellness === null ? 'لا قياس' : `${summary.avgWellness}%`)
            : '—'}
          label="متوسّط الصحة"
          hint={summary ? `مقيس لـ${summary.measured} موظف` : ''}
        />
        <StatCard
          icon={<AlertTriangle size={15} />}
          tone={summary && summary.openIssues > 0 ? 'text-amber-600' : 'text-slate-900'}
          value={summary ? String(summary.openIssues) : '—'}
          label="بلاغات مفتوحة"
          hint="المؤرشفة والمغلقة خارج العدّ"
        />
        <StatCard
          icon={<Award size={15} />} tone="text-emerald-600"
          value={summary ? String(summary.certs) : '—'}
          label="الشهادات"
          hint={summary && summary.expiring > 0
            ? `${summary.expiring} تنتهي خلال 30 يوماً`
            : 'لا شهادة تنتهي قريباً'}
        />
      </div>

      {/* ═══ المرشّحات — كلها في القاعدة ═══ */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[220px] relative">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="بحث بالاسم أو البريد أو الهاتف أو المسمّى أو الرمز…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl pr-10 pl-4 py-2.5 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        {/* ★ الترشيح بالمعرّف لا بالاسم — والقسم بلا موظفين يظهر */}
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          aria-label="ترشيح بالقسم"
          className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-indigo-400 cursor-pointer"
        >
          <option value="all">جميع الأقسام</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name} ({d.members})</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | TeamStatus)}
          aria-label="ترشيح بالحالة"
          className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-indigo-400 cursor-pointer"
        >
          <option value="all">كل الحالات</option>
          {TEAM_STATUSES.map((s) => (
            <option key={s} value={s}>{TEAM_STATUS_AR[s]}</option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="flex justify-center items-center h-64">
          <div className="flex items-center gap-3 text-slate-500">
            <Loader2 className="animate-spin" size={22} />
            <span>جاري تحميل بيانات الفريق…</span>
          </div>
        </div>
      )}

      {error && !loading && (
        <Card className="bg-red-50 border-red-200 text-red-700">
          <div className="flex items-center gap-3">
            <ServerCrash size={20} />
            <p className="text-sm font-semibold">{error}</p>
          </div>
        </Card>
      )}

      {!loading && !error && members.length === 0 && (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <Users size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="font-semibold text-slate-700">لا موظفين مطابقين</p>
          <p className="text-sm text-slate-500 mt-1">جرّب تغيير المرشّحات</p>
        </div>
      )}

      {!loading && !error && members.length > 0 && (
        view === 'grid' ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {members.map((m) => <MemberCard key={m.id} m={m} />)}
          </div>
        ) : (
          <MemberTable members={members} />
        )
      )}
    </div>
  );
}

// ═══════════════ مكوّنات الصفحة ═══════════════

function StatCard({ icon, tone, value, label, hint }: {
  icon: React.ReactNode; tone: string; value: string;
  label: string; hint?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center gap-1.5 text-slate-400 mb-1.5">
        {icon}
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <p className={`text-xl font-bold ${tone} truncate`}>{value}</p>
      {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: TeamStatus }) {
  return (
    <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border whitespace-nowrap ${
      TEAM_STATUS_TONE[status]
    }`}>
      {TEAM_STATUS_AR[status]}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border whitespace-nowrap ${
      roleTone(role)
    }`}>
      {/* ★ العطل ④: كانت سلسلة `? :` تنتهي بـ«موظف» فتبتلع كل دور مجهول */}
      {roleLabel(role)}
    </span>
  );
}

function WellnessBar({ value }: { value: number | null }) {
  return (
    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${wellnessTone(value)}`}
        // ★★★ `null` ⇒ شريط فارغ لا شريط أحمر ممتلئ
        style={{ width: value === null ? '0%' : `${Math.min(Math.max(value, 0), 100)}%` }}
      />
    </div>
  );
}

function MemberCard({ m }: { m: TeamMember }) {
  return (
    <Card hover className="group">
      <div className="flex items-start gap-3">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0 ${
          m.status === 'active'   ? 'bg-gradient-to-br from-indigo-500 to-purple-600' :
          m.status === 'on_leave' ? 'bg-gradient-to-br from-amber-500 to-orange-500' :
                                    'bg-slate-300'
        }`}>
          {/* ★ العطل ③: كان «U» للجميع لأن الاسم فارغ */}
          {initial(m.fullName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-slate-800 text-sm truncate">{m.fullName}</h3>
            <StatusBadge status={m.status} />
          </div>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <RoleBadge role={m.role} />
            <span className="text-[11px] text-slate-400">{m.employeeCode}</span>
          </div>
          <p className="text-xs text-slate-500 truncate mt-1">
            {m.position || 'بلا مسمّى'}
          </p>
          <p className="text-xs text-indigo-600 font-medium mt-0.5 flex items-center gap-1">
            <Building2 size={11} /> {m.department}
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Mail size={11} className="flex-shrink-0" />
          <span className="truncate">{m.email || 'بلا بريد'}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Phone size={11} className="flex-shrink-0" />
          <span>{m.phone || 'بلا هاتف'}</span>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
          <HeartPulse size={12} className="text-rose-500" />
          {/* ★★★ «لا قياس» لا «0%» */}
          {m.wellness === null ? 'لا قياس صحّي' : `صحة: ${m.wellness}%`}
        </span>
        <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
          <BadgeCheck size={11} />
          {m.certsValid}/{m.certs} شهادة
        </span>
        {m.openIssues > 0 && (
          <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
            {m.openIssues} بلاغ مفتوح
          </span>
        )}
      </div>

      <div className="mt-2">
        <WellnessBar value={m.wellness} />
        {m.wellness !== null && (
          <p className="text-[10px] text-slate-400 mt-1">
            من {m.wellnessCount} تسجيل
          </p>
        )}
      </div>
    </Card>
  );
}

function MemberTable({ members }: { members: TeamMember[] }) {
  const headers = ['الموظف', 'الدور', 'القسم', 'المسمّى', 'الحالة',
                   'الشهادات', 'الصحة', 'البلاغات'];
  return (
    <Card padding="none">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {headers.map((h) => (
                <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((m, i) => (
              <tr
                key={m.id}
                className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${
                  i % 2 === 0 ? '' : 'bg-slate-50/30'
                }`}
              >
                <td className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs flex-shrink-0">
                      {initial(m.fullName)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{m.fullName}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {m.email || m.employeeCode}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4"><RoleBadge role={m.role} /></td>
                <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{m.department}</td>
                <td className="py-3 px-4 text-slate-600">{m.position || '—'}</td>
                <td className="py-3 px-4"><StatusBadge status={m.status} /></td>
                <td className="py-3 px-4 font-bold text-emerald-600 whitespace-nowrap">
                  {m.certsValid}/{m.certs}
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <div className="w-16 flex-shrink-0">
                      <WellnessBar value={m.wellness} />
                    </div>
                    <span className="text-xs font-bold text-slate-600 whitespace-nowrap">
                      {m.wellness === null ? '—' : `${m.wellness}%`}
                    </span>
                  </div>
                </td>
                <td className="py-3 px-4">
                  {m.openIssues > 0 ? (
                    <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                      {m.openIssues}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
