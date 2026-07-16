import { useState, useMemo, useEffect } from 'react';
import {
  BookOpen, CheckCircle, Clock, Star,
  Search, Filter, X, Microscope, FlaskConical,
  Shield, FileText, Cpu, Truck, Users, TrendingUp,
  Lock, AlertTriangle, Settings,
  GraduationCap, Target, Flame, Layers,
} from 'lucide-react';
import Card from '../../shared/components/ui/Card';
import { useAuthStore } from '../../core/stores';
import { courseProgressService, courseService, employeeGoalService, employeeService, employeeSkillService } from '../../services/sdk';
import { getErrorMessage } from '../../services/errors';

// ── Types ──
type CourseStatus = 'completed' | 'in_progress' | 'not_started' | 'locked';
type CourseLevel  = 'مبتدئ' | 'متوسط' | 'متقدم' | 'خبير';
type Language = 'ar' | 'en';

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

interface CourseModule {
  id: string;
  title: string;
  duration: string;
  type: 'video' | 'reading' | 'quiz' | 'practical';
  content: string;
  keyPoints: string[];
  completed: boolean;
  quiz?: QuizQuestion[];
}

interface Course {
  id: string;
  title: string;
  titleEn?: string;
  description: string;
  descriptionEn?: string;
  category: string;
  duration: string;
  level: CourseLevel;
  progress: number;
  status: CourseStatus;
  modules: number;
  points: number;
  tags: string[];
  mandatory: boolean;
  instructor: string;
  objectives: string[];
  moduleList: CourseModule[];
  /** صورة مصغّرة للدورة (رابط URL) */
  thumbnail?: string;
}

// ── Categories ──
const CATEGORIES = [
  { id: 'all',          label: 'الكل',               icon: Layers,       color: 'from-slate-500 to-slate-700' },
  { id: 'gmp-basics',   label: 'أساسيات الجودة',         icon: BookOpen,     color: 'from-indigo-500 to-indigo-700' },
  { id: 'quality',      label: 'ضبط الجودة',          icon: Shield,       color: 'from-emerald-500 to-emerald-700' },
  { id: 'manufacturing',label: 'التصنيع',              icon: FlaskConical, color: 'from-blue-500 to-blue-700' },
  { id: 'docs',         label: 'التوثيق',             icon: FileText,     color: 'from-amber-500 to-amber-700' },
  { id: 'validation',   label: 'التحقق والتأهيل',     icon: CheckCircle,  color: 'from-violet-500 to-violet-700' },
  { id: 'microbiology', label: 'الميكروبيولوجيا',     icon: Microscope,   color: 'from-pink-500 to-pink-700' },
  { id: 'equipment',    label: 'المعدات والمرافق',    icon: Settings,     color: 'from-cyan-500 to-cyan-700' },
  { id: 'regulatory',   label: 'التنظيم والترخيص',   icon: Lock,         color: 'from-red-500 to-red-700' },
  { id: 'supply',       label: 'سلسلة التوريد',       icon: Truck,        color: 'from-orange-500 to-orange-700' },
  { id: 'roles',        label: 'الأدوار الوظيفية',    icon: Users,        color: 'from-teal-500 to-teal-700' },
  { id: 'safety',       label: 'السلامة والصحة',      icon: AlertTriangle,color: 'from-rose-500 to-rose-700' },
  { id: 'advanced',     label: 'متقدم وتقنية',        icon: Cpu,          color: 'from-fuchsia-500 to-fuchsia-700' },
];


// ── Main Component ──
export default function TrainingPage() {
  const { user } = useAuthStore();
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<CourseLevel | 'all'>('all');
  const [lang, setLang] = useState<Language>('ar');

  // Courses data through SDK boundary
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<string[]>([]);

  // Fetch courses through SDK + enrich with employee progress/goals/skills
  useEffect(() => {
    const normalizeCourse = (raw: any, progressByCourse: Map<string, any>): Course => {
      const progress = progressByCourse.get(raw.id);
      const progressPercent = Number(progress?.progress_percent ?? raw.progress ?? 0);
      const status: CourseStatus = progress?.status === 'completed' || raw.status === 'completed'
        ? 'completed'
        : progressPercent > 0
          ? 'in_progress'
          : raw.status === 'locked'
            ? 'locked'
            : 'not_started';
      return {
        id: raw.id,
        title: raw.title || 'دورة تدريبية',
        titleEn: raw.title_en,
        description: raw.description || 'لا يوجد وصف متاح لهذه الدورة حالياً.',
        descriptionEn: raw.description_en,
        category: raw.category || 'roles',
        duration: raw.duration || `${raw.duration_minutes || 0} دقيقة`,
        level: (raw.level as CourseLevel) || 'متوسط',
        progress: progressPercent,
        status,
        modules: Number(raw.modules_count || raw.modules || 0),
        points: Number(raw.points || (status === 'completed' ? 10 : 0)),
        tags: Array.isArray(raw.tags) ? raw.tags : [raw.category, raw.title].filter(Boolean),
        mandatory: Boolean(raw.is_mandatory ?? raw.mandatory),
        instructor: raw.instructor || 'إدارة التدريب',
        objectives: Array.isArray(raw.objectives) ? raw.objectives : [],
        moduleList: Array.isArray(raw.moduleList) ? raw.moduleList : [],
        thumbnail: raw.thumbnail,
      };
    };

    const fetchCourses = async () => {
      try {
        setCoursesLoading(true);
        setCoursesError(null);
        const [courseRows, employees] = await Promise.all([
          courseService.findAllCourses(),
          user?.id ? employeeService.findAll({ filters: { user_id: user.id }, limit: 1 }) : Promise.resolve([]),
        ]);
        const employeeId = employees[0]?.id;
        const [progressRows, skillRows, goalRows] = employeeId ? await Promise.all([
          courseProgressService.findByEmployee(employeeId).catch(() => []),
          employeeSkillService.findByEmployee(employeeId).catch(() => []),
          employeeGoalService.findByEmployee(employeeId).catch(() => []),
        ]) : [[], [], []];

        const progressByCourse = new Map<string, any>((progressRows || []).map((p: any) => [String(p.course_id), p] as [string, any]));
        const normalized = (courseRows || []).map((course: any) => normalizeCourse(course, progressByCourse));
        setCourses(normalized);

        const skillNames = (skillRows || []).map((s: any) => String(s.skill_name || '').toLowerCase()).filter(Boolean);
        const learningGoals = (goalRows || []).filter((g: any) => g.category === 'learning' || g.category === 'career');
        const recommended = normalized
          .filter(course => course.status !== 'completed')
          .filter(course => {
            const haystack = [course.title, course.description, course.category, ...course.tags].join(' ').toLowerCase();
            return skillNames.some(skill => haystack.includes(skill)) || learningGoals.some((goal: any) => haystack.includes(String(goal.title || '').toLowerCase().split(' ')[0] || '')) || course.mandatory;
          })
          .slice(0, 4)
          .map(course => course.id);
        setRecommendations(recommended);
      } catch (err) {
        const message = getErrorMessage(err, 'فشل تحميل الدورات التدريبية');
        console.error('Error fetching courses:', message);
        setCoursesError(message);
        setCourses([]);
      } finally {
        setCoursesLoading(false);
      }
    };

    fetchCourses();
  }, [user?.id]);

  const totalCourses    = courses.length;
  const completedCount  = courses.filter(c => c.status === 'completed').length;
  const totalPoints     = courses.filter(c => c.status === 'completed').reduce((a, c) => a + c.points, 0);
  const mandatoryTotal  = courses.filter(c => c.mandatory).length;
  const mandatoryDone   = courses.filter(c => c.mandatory && c.status === 'completed').length;
  const overallPct      = totalCourses > 0 ? Math.round((completedCount / totalCourses) * 100) : 0;

  const filteredCourses = useMemo(() => {
    return courses.filter(c => {
      const matchCat    = activeCategory === 'all' || c.category === activeCategory;
      const matchLevel  = levelFilter === 'all' || c.level === levelFilter;
      const matchSearch = !searchQuery
        || c.title.includes(searchQuery)
        || c.description.includes(searchQuery)
        || c.tags.some(t => t.includes(searchQuery));
      return matchCat && matchLevel && matchSearch;
    });
  }, [courses, activeCategory, searchQuery, levelFilter]);

  // Catalog Mode
  return (
    <div className="space-y-5 animate-fade-in" dir="rtl">
      {/* ── Hero ── */}
      <div className="relative bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 overflow-hidden">
        <div className="absolute -top-10 -right-10 w-64 h-64 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-violet-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.05)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                  <GraduationCap size={24} className="text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold text-white">مركز التدريب الدوائي</h2>
                  <p className="text-indigo-300 text-xs font-medium">Kyvzon Training Academy</p>
                </div>
              </div>
              <p className="text-slate-300 text-sm leading-relaxed max-w-xl mb-4">
                منصة التدريب والتطوير المستمر. الدورات التدريبية ستظهر هنا عند إضافتها من قبل إدارة التدريب.
              </p>
              <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 flex items-start gap-3">
                <Star size={14} className="text-amber-400 flex-shrink-0 mt-0.5 fill-amber-400" />
                <div>
                  <p className="text-white/80 text-xs font-medium leading-relaxed">"التدريب المستمر هو مفتاح التميز في عالم الأعمال"</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 flex-shrink-0">
              {[
                { val: totalCourses,     label: 'دورة تدريبية',  icon: BookOpen,    color: 'from-blue-500 to-blue-700' },
                { val: completedCount,   label: 'مكتملة',         icon: CheckCircle, color: 'from-emerald-500 to-emerald-700' },
                { val: totalPoints,      label: 'نقطة تطوير',    icon: Star,        color: 'from-amber-500 to-amber-700' },
                { val: `${overallPct}%`, label: 'إجمالي التقدم', icon: TrendingUp,  color: 'from-violet-500 to-violet-700' },
              ].map((s, i) => {
                const SIcon = s.icon;
                return (
                  <div key={i} className="bg-white/10 border border-white/15 rounded-2xl p-3 text-center min-w-[100px]">
                    <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center mx-auto mb-1.5 shadow-md`}>
                      <SIcon size={15} className="text-white" />
                    </div>
                    <p className="text-white font-extrabold text-xl leading-none">{s.val}</p>
                    <p className="text-white/50 text-[10px] mt-0.5 font-medium">{s.label}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {mandatoryTotal > 0 && (
            <div className="mt-5 bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-white/70 text-xs flex items-center gap-1.5">
                  <AlertTriangle size={12} className="text-amber-400" />
                  الدورات الإلزامية
                </span>
                <span className="text-white font-bold text-sm">{mandatoryDone} / {mandatoryTotal}</span>
              </div>
              <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-1000"
                  style={{ width: `${(mandatoryDone / mandatoryTotal) * 100}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Filters ── */}
      <Card>
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="ابحث في الدورات..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-9 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={15} />
              </button>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {CATEGORIES.map(cat => {
              const CatIcon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex-shrink-0 transition-all
                    ${isActive ? `bg-gradient-to-r ${cat.color} text-white shadow-md` : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  <CatIcon size={13} />
                  {cat.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500 flex items-center gap-1"><Filter size={12} /> المستوى:</span>
            {(['all', 'مبتدئ', 'متوسط', 'متقدم', 'خبير'] as const).map(lvl => (
              <button
                key={lvl}
                onClick={() => setLevelFilter(lvl)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all
                  ${levelFilter === lvl ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              >
                {lvl === 'all' ? 'الكل' : lvl}
              </button>
            ))}
            <span className="mr-auto text-xs text-slate-400 font-semibold">{filteredCourses.length} دورة</span>
          </div>
        </div>
      </Card>

      {/* ── Loading State ── */}
      {coursesLoading && (
        <div className="text-center py-20">
          <div className="inline-block w-8 h-8 border-3 border-slate-200 border-t-indigo-500 rounded-full animate-spin mb-3" />
          <p className="text-slate-400 text-sm">جارٍ تحميل الدورات التدريبية...</p>
        </div>
      )}

      {/* ── Error State ── */}
      {!coursesLoading && coursesError && (
        <div className="text-center py-20">
          <AlertTriangle size={60} className="mx-auto text-amber-300 mb-4" />
          <h3 className="text-xl font-bold text-slate-600 mb-2">تعذّر تحميل الدورات</h3>
          <p className="text-slate-400 text-sm">{coursesError}</p>
        </div>
      )}

      {/* ── Empty State ── */}
      {!coursesLoading && !coursesError && courses.length === 0 && (
        <div className="text-center py-20">
          <BookOpen size={60} className="mx-auto text-slate-200 mb-4" />
          <h3 className="text-xl font-bold text-slate-600 mb-2">لا توجد دورات تدريبية بعد</h3>
          <p className="text-slate-400 text-sm">ستظهر الدورات هنا عند إضافتها من قبل إدارة التدريب</p>
        </div>
      )}

      {/* ── Courses (In Progress + Grid) ── */}
      {!coursesLoading && !coursesError && courses.length > 0 && (
        <>
          {/* ── Recommended ── */}
          {recommendations.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <Target size={16} className="text-emerald-500" />
                دورات مقترحة بناءً على أهدافك ومهاراتك
              </h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {courses.filter(c => recommendations.includes(c.id)).map(course => (
                  <div key={course.id} className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl p-4 hover:shadow-lg transition-all">
                    <span className="text-[10px] font-bold text-emerald-700 bg-white border border-emerald-100 rounded-full px-2 py-1">مقترح لك</span>
                    <h3 className="font-bold text-slate-800 text-sm mt-3 mb-1">{course.title}</h3>
                    <p className="text-xs text-slate-500 line-clamp-2">{course.description}</p>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-emerald-700 font-bold">{course.level}</span>
                      {course.mandatory && <span className="text-xs text-amber-700 font-bold">إلزامية</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── In Progress ── */}
          {courses.filter(c => c.status === 'in_progress').length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <Flame size={16} className="text-orange-500" />
                دوراتك الجارية — أكمل ما بدأت
              </h3>
              <div className="grid sm:grid-cols-2 gap-4">
                {courses.filter(c => c.status === 'in_progress').map(course => (
                  <div
                    key={course.id}
                    className="bg-white border border-slate-100 rounded-2xl p-4 hover:shadow-xl transition-all cursor-pointer hover:border-indigo-300"
                  >
                    {course.thumbnail && (
                      <img
                        src={course.thumbnail}
                        alt={course.title}
                        className="w-full h-32 object-cover rounded-xl mb-3"
                      />
                    )}
                    <h3 className="font-bold text-slate-800 text-sm mb-2">{course.title}</h3>
                    {course.progress !== undefined && (
                      <div className="w-full bg-slate-100 rounded-full h-2 mt-2">
                        <div
                          className="bg-gradient-to-r from-indigo-500 to-purple-600 h-2 rounded-full transition-all"
                          style={{ width: `${course.progress}%` }}
                        />
                      </div>
                    )}
                    <p className="text-xs text-slate-500 mt-2">{course.progress || 0}% مكتملة</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Course Grid ── */}
          <div>
            <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
              <Target size={16} className="text-indigo-500" />
              {activeCategory === 'all' ? 'جميع الدورات' : CATEGORIES.find(c => c.id === activeCategory)?.label}
              {searchQuery && <span className="text-slate-400 font-normal">— نتائج "{searchQuery}"</span>}
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredCourses.map(course => (
                <div
                  key={course.id}
                  className="bg-white border border-slate-100 rounded-2xl p-4 hover:shadow-xl transition-all cursor-pointer hover:border-indigo-300 group"
                >
                  {course.thumbnail && (
                    <img
                      src={course.thumbnail}
                      alt={course.title}
                      className="w-full h-32 object-cover rounded-xl mb-3 group-hover:brightness-110 transition-all"
                    />
                  )}
                  <h3 className="font-bold text-slate-800 text-sm mb-1">{course.title}</h3>
                  <p className="text-xs text-slate-500 mb-3 line-clamp-2">{course.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium px-2 py-1 bg-slate-100 text-slate-700 rounded">{course.level}</span>
                    {course.status === 'completed' && <CheckCircle size={16} className="text-emerald-500" />}
                    {course.status === 'in_progress' && <Clock size={16} className="text-amber-500" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Language Toggle ── */}
      <div className="fixed bottom-6 left-6 z-40">
        <button
          onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
          className="flex items-center gap-2 bg-white border border-slate-200 shadow-lg rounded-full px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all"
        >
          <span className="text-lg">{lang === 'ar' ? '🇬🇧' : '🇸🇦'}</span>
          <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
        </button>
      </div>
    </div>
  );
}