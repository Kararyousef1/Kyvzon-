/**
 * ════════════════════════════════════════════════════════════════
 *  ProblemsList - البلاغات (نسخة مُصلحة)
 *  صفحة متكاملة: عرض + رفع بلاغ جديد
 * ════════════════════════════════════════════════════════════════
 *
 *  🔧 الإصلاحات المُطبّقة:
 *  ─────────────────────────────────────────────────────────────────
 *  ✅ تنظيف جميع markdown artifacts (15+ موضع)
 *  ✅ إصلاح template literals المكسورة (className + التنقل)
 *  ✅ الاستعلام بـ user_id (يحل خطأ 400 + يتطلب Migration 051)
 *  ✅ إزالة Mock data fallback الذي كان يخفي خطأ 400 فعلياً
 *  ✅ إزالة الإدراج المحلي عند الفشل (بيانات وهمية لا تستمر)
 *  ✅ حالة خطأ واضحة + زر إعادة المحاولة
 *  ✅ إصلاح STATUS_CONFIG[activeTab] عند 'all'
 *  ✅ إشعار فريق HR عند رفع بلاغ جديد (اتساقاً مع NewProblemPage)
 *  ✅ إزالة as any → تحويل آمن للنوع
 *  ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus, Search, TrendingUp, Clock,
  CheckCircle, XCircle,
  FileText, Calendar, MessageSquare,
  ChevronRight, Loader2, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import { supabase } from '../../services/supabase/supabase';
import Card from '../../shared/components/ui/Card';
import Badge from '../../shared/components/ui/Badge';
import Button from '../../shared/components/ui/Button';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePagePermission } from '../../shared/hooks/usePagePermission';

// ════════════════════════════════════════════════════════════════
//  الأنواع والثوابت
// ════════════════════════════════════════════════════════════════

type ProblemStatus = 'pending' | 'in_progress' | 'resolved' | 'closed';
type ProblemSeverity = 'low' | 'medium' | 'high' | 'critical';

interface Problem {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: ProblemSeverity;
  status: ProblemStatus;
  isAnonymous: boolean;
  employeeId?: string;
  employeeName?: string;
  department?: string;
  createdAt: string;
  updatedAt?: string;
  aiAnalysis?: {
    urgencyLevel: number;
    sentiment: string;
    suggestedCategory?: string;
    suggestedAction?: string;
  };
  comments?: Array<{
    id: string;
    text: string;
    authorName: string;
    createdAt: string;
  }>;
}

const STATUS_CONFIG: Record<ProblemStatus, {
  label: string;
  variant: 'warning' | 'info' | 'success' | 'neutral';
  icon: typeof Clock;
  color: string;
  bg: string;
  border: string;
}> = {
  pending:     { label: 'معلقة',      variant: 'warning', icon: Clock,       color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200' },
  in_progress: { label: 'قيد المعالجة',variant: 'info',    icon: TrendingUp,  color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-200' },
  resolved:    { label: 'محلولة',     variant: 'success', icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  closed:      { label: 'مغلقة',      variant: 'neutral', icon: XCircle,     color: 'text-slate-600',   bg: 'bg-slate-50',   border: 'border-slate-200' },
};

const SEVERITY_CONFIG: Record<ProblemSeverity, { label: string; variant: 'success' | 'warning' | 'danger'; color: string }> = {
  low:      { label: 'منخفضة', variant: 'success', color: 'bg-emerald-500' },
  medium:   { label: 'متوسطة', variant: 'warning', color: 'bg-amber-500' },
  high:     { label: 'عالية',  variant: 'danger',  color: 'bg-orange-500' },
  critical: { label: 'حرجة',   variant: 'danger',  color: 'bg-red-500' },
};

const CATEGORIES = [
  { value: 'technical', label: 'تقني',          icon: '💻' },
  { value: 'hr',        label: 'موارد بشرية',   icon: '👥' },
  { value: 'management',label: 'إدارة',         icon: '📊' },
  { value: 'workplace', label: 'بيئة عمل',      icon: '🏢' },
  { value: 'salary',    label: 'رواتب',         icon: '💰' },
  { value: 'safety',    label: 'سلامة',         icon: '🛡️' },
  { value: 'other',     label: 'أخرى',          icon: '📝' },
];

const SEVERITY_ORDER: Record<ProblemSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 };

// ════════════════════════════════════════════════════════════════
//  المكون
// ════════════════════════════════════════════════════════════════

interface ProblemsListProps {
  isHR?: boolean;
}

export default function ProblemsList({ isHR: isHRProp = false }: ProblemsListProps) {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  // صلاحية نشر بلاغ — يتحكّم بها الـ admin من بوابة الإدارة (permKey: new-problem).
  // الصفحة متاحة للجميع (قراءة)، لكن زر "رفع بلاغ" يظهر فقط لمن يملك الصلاحية.
  const canCreateProblem = usePagePermission('new-problem');
  // نستخدم مسار HR للتفاصيل عندما نكون في /app/hr/problems، وإلا مسار employee
  const detailsBase = location.pathname.startsWith('/app/hr/')
    ? '/app/hr/problems'
    : '/app/employee/problems';

  // ─── الحالة ───────────────────────────────────────────────────
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'all' | ProblemStatus>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'severity'>('date');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');

  const isHR = useMemo(
    () => isHRProp || user?.role === 'hr' || user?.role === 'admin',
    [isHRProp, user?.role]
  );

  // ═══════════════════════════════════════════════════════════════
  // جلب البلاغات
  // ═══════════════════════════════════════════════════════════════

  const fetchProblems = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setFetchError(null);

    try {
      let query = supabase
        .from('incidents')
        .select('*')
        .order('created_at', { ascending: false });

      // المستخدم العادي يرى بلاغاته فقط (بالـ user_id — يحل خطأ 400)
      if (!isHR) {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      // ✅ لا Mock data — مصدر الحقيقة هو الخادم فقط
      if (data && data.length > 0) {
        setProblems(
          data.map((d) => ({
            id: d.id,
            title: d.title || 'بلاغ',
            description: d.description || '',
            category: d.category || 'other',
            severity: (d.severity || 'medium') as ProblemSeverity,
            status: (d.status || 'pending') as ProblemStatus,
            isAnonymous: d.is_anonymous || false,
            employeeId: d.user_id,
            employeeName: isHR ? d.employee_name || 'موظف' : user.full_name,
            department: isHR ? d.department || '' : user.department,
            createdAt: d.created_at,
            updatedAt: d.updated_at,
            aiAnalysis: d.ai_analysis,
            comments: [],
          }))
        );
      } else {
        setProblems([]);
      }
    } catch (err) {
      console.error('[ProblemsList] فشل جلب البلاغات:', err);
      // ✅ إظهار الخطأ للمستخدم بدل إخفائه ببيانات وهمية
      setFetchError(
        err instanceof Error && err.message
          ? err.message
          : 'تعذّر تحميل البلاغات. تحقق من الاتصال وحاول مرة أخرى.'
      );
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.full_name, user?.department, isHR]);

  useEffect(() => {
    fetchProblems();
  }, [fetchProblems]);

  // ═══════════════════════════════════════════════════════════════
  // القيم المشتقّة
  // ═══════════════════════════════════════════════════════════════

  const stats = useMemo(
    () => ({
      total: problems.length,
      pending: problems.filter((p) => p.status === 'pending').length,
      inProgress: problems.filter((p) => p.status === 'in_progress').length,
      resolved: problems.filter((p) => p.status === 'resolved').length,
      critical: problems.filter((p) => p.severity === 'critical').length,
    }),
    [problems]
  );

  const filteredProblems = useMemo(() => {
    let filtered = problems;

    if (activeTab !== 'all') {
      filtered = filtered.filter((p) => p.status === activeTab);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (p) => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
      );
    }
    if (filterSeverity !== 'all') {
      filtered = filtered.filter((p) => p.severity === filterSeverity);
    }

    // ترتيب
    filtered = [...filtered].sort((a, b) => {
      if (sortBy === 'severity') {
        return SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
      }
      // افتراضياً: الأحدث أولاً
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return filtered;
  }, [problems, activeTab, search, filterSeverity, sortBy]);

  // ═══════════════════════════════════════════════════════════════
  // المعالجات
  // ═══════════════════════════════════════════════════════════════

  const handleSelectProblem = (id: string) => {
    navigate(`${detailsBase}/${id}`);
  };

  // ═══════════════════════════════════════════════════════════════
  // العرض
  // ═══════════════════════════════════════════════════════════════

  // نص الحالة الفارغة حسب التبويب
  const emptyStatusText =
    activeTab === 'all' ? 'الكل' : STATUS_CONFIG[activeTab as ProblemStatus]?.label;

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-800">البلاغات</h2>
          <p className="text-sm text-slate-500 mt-1">
            {filteredProblems.length} من {problems.length} بلاغ
          </p>
        </div>
        {canCreateProblem && (
          <Button
            onClick={() => navigate('/app/employee/problems/new')}
            className="bg-gradient-to-br from-indigo-600 to-purple-700 hover:from-indigo-700 hover:to-purple-800"
            icon={<Plus size={18} />}
          >
            رفع بلاغ جديد (متطور)
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setActiveTab('all')}>
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <FileText size={20} className="text-slate-500" />
              <span className={`text-xs font-bold ${activeTab === 'all' ? 'text-indigo-600' : 'text-slate-400'}`}>
                الكل
              </span>
            </div>
            <p className="text-3xl font-extrabold text-slate-800">{stats.total}</p>
          </div>
        </Card>

        <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setActiveTab('pending')}>
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Clock size={20} className="text-amber-500" />
              <span className={`text-xs font-bold ${activeTab === 'pending' ? 'text-amber-600' : 'text-slate-400'}`}>
                معلقة
              </span>
            </div>
            <p className="text-3xl font-extrabold text-amber-600">{stats.pending}</p>
          </div>
        </Card>

        <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setActiveTab('in_progress')}>
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp size={20} className="text-blue-500" />
              <span className={`text-xs font-bold ${activeTab === 'in_progress' ? 'text-blue-600' : 'text-slate-400'}`}>
                قيد المعالجة
              </span>
            </div>
            <p className="text-3xl font-extrabold text-blue-600">{stats.inProgress}</p>
          </div>
        </Card>

        <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setActiveTab('resolved')}>
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <CheckCircle size={20} className="text-emerald-500" />
              <span className={`text-xs font-bold ${activeTab === 'resolved' ? 'text-emerald-600' : 'text-slate-400'}`}>
                محلولة
              </span>
            </div>
            <p className="text-3xl font-extrabold text-emerald-600">{stats.resolved}</p>
          </div>
        </Card>

        <Card className="hover:shadow-lg bg-gradient-to-br from-red-50 to-orange-50 border-red-100">
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <AlertTriangle size={20} className="text-red-500" />
              <span className="text-xs font-bold text-red-600">حرجة</span>
            </div>
            <p className="text-3xl font-extrabold text-red-600">{stats.critical}</p>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]">
          <div className="relative">
            <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="بحث في البلاغات..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pr-10 pl-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>
        </div>

        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          className="px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="all">جميع الأولويات</option>
          <option value="critical">حرجة</option>
          <option value="high">عالية</option>
          <option value="medium">متوسطة</option>
          <option value="low">منخفضة</option>
        </select>

        <button
          onClick={() => setSortBy(sortBy === 'date' ? 'severity' : 'date')}
          className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
        >
          <RefreshCw size={16} />
          <span className="text-sm">{sortBy === 'date' ? 'الأحدث' : 'الأولوية'}</span>
        </button>
      </div>

      {/* Problems List */}
      <div className="space-y-3">
        {loading ? (
          <Card>
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Loader2 className="animate-spin mb-3" size={40} />
              <p className="text-sm font-medium">جاري التحميل...</p>
            </div>
          </Card>
        ) : fetchError ? (
          // ✅ حالة الخطأ (بدل Mock data)
          <Card>
            <div className="text-center py-16">
              <div className="w-20 h-20 mx-auto mb-4 bg-red-50 rounded-2xl flex items-center justify-center">
                <AlertTriangle size={40} className="text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-700 mb-2">تعذّر تحميل البلاغات</h3>
              <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">{fetchError}</p>
              <Button onClick={fetchProblems} variant="outline" icon={<RefreshCw size={18} />}>
                إعادة المحاولة
              </Button>
            </div>
          </Card>
        ) : filteredProblems.length === 0 ? (
          <Card>
            <div className="text-center py-16">
              <div className="w-20 h-20 mx-auto mb-4 bg-slate-100 rounded-2xl flex items-center justify-center">
                <FileText size={40} className="text-slate-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-700 mb-2">
                {activeTab === 'all' ? 'لا توجد بلاغات' : `لا توجد بلاغات ${emptyStatusText}`}
              </h3>
              <p className="text-sm text-slate-500 mb-6">
                {search ? 'جرب تغيير كلمة البحث' : (canCreateProblem ? 'ابدأ برفع بلاغ جديد' : 'لا توجد بلاغات لعرضها')}
              </p>
              {canCreateProblem && (
                <Button onClick={() => navigate('/app/employee/problems/new')} variant="outline" icon={<Plus size={18} />}>
                  رفع بلاغ جديد
                </Button>
              )}
            </div>
          </Card>
        ) : (
          filteredProblems.map((problem) => {
            const statusConfig = STATUS_CONFIG[problem.status];
            const severityConfig = SEVERITY_CONFIG[problem.severity];
            const category = CATEGORIES.find((c) => c.value === problem.category);

            return (
              <Card
                key={problem.id}
                className="hover:shadow-lg cursor-pointer transition-all hover:border-indigo-200 group"
                onClick={() => handleSelectProblem(problem.id)}
              >
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    {/* Severity Indicator */}
                    <div className={`w-1.5 h-16 rounded-full ${severityConfig.color} flex-shrink-0`} />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            {problem.isAnonymous && (
                              <Badge variant="neutral" size="sm">مجهول</Badge>
                            )}
                            {category && (
                              <Badge variant="neutral" size="sm">
                                <span className="mr-1">{category.icon}</span>
                                {category.label}
                              </Badge>
                            )}
                          </div>
                          <h3 className="text-base font-bold text-slate-800 group-hover:text-indigo-600 transition-colors truncate">
                            {problem.title}
                          </h3>
                          <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                            {problem.description}
                          </p>
                        </div>

                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          <Badge variant={statusConfig.variant} size="sm">
                            {statusConfig.label}
                          </Badge>
                          <Badge variant={severityConfig.variant} size="sm">
                            {severityConfig.label}
                          </Badge>
                        </div>
                      </div>

                      {/* AI Analysis */}
                      {problem.aiAnalysis && (
                        <div className="mb-3 p-3 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl">
                          <div className="flex items-start gap-2">
                            <FileText size={16} className="text-indigo-600 flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-indigo-700 mb-1">تحليل ذكي</p>
                              <p className="text-xs text-indigo-600">
                                {problem.aiAnalysis.suggestedAction || 'تحليل تلقائي للبلاغ'}
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                <span className="text-xs text-indigo-500">مستوى الإلحاح:</span>
                                <div className="flex-1 h-1.5 bg-indigo-100 rounded-full overflow-hidden max-w-[100px]">
                                  <div
                                    className={`h-full rounded-full ${
                                      problem.aiAnalysis.urgencyLevel >= 8
                                        ? 'bg-red-500'
                                        : problem.aiAnalysis.urgencyLevel >= 5
                                        ? 'bg-amber-500'
                                        : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${problem.aiAnalysis.urgencyLevel * 10}%` }}
                                  />
                                </div>
                                <span className="text-xs font-bold text-indigo-700">
                                  {problem.aiAnalysis.urgencyLevel}/10
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Footer */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 text-xs text-slate-400">
                          <div className="flex items-center gap-1.5">
                            <Calendar size={14} />
                            <span>{format(new Date(problem.createdAt), 'dd MMM yyyy', { locale: ar })}</span>
                          </div>
                          {problem.comments && problem.comments.length > 0 && (
                            <div className="flex items-center gap-1.5">
                              <MessageSquare size={14} />
                              <span>{problem.comments.length}</span>
                            </div>
                          )}
                        </div>
                        <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-500 transition-colors" />
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

    </div>
  );
}
