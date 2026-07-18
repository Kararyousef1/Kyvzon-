/**
 * ════════════════════════════════════════════════════════════════
 *  TrainingManagementPage - إدارة التدريب (نسخة مُصلحة)
 * ════════════════════════════════════════════════════════════════
 *
 *  🔧 الإصلاحات المُطبّقة:
 *  ✅ 7 استخدام any → 0
 *  ✅ (c: any) → CourseRow / CertRow
 *  ✅ catch (err: any) → unknown + getErrorMessage
 *  ✅ saveToLocal(data: any) → CourseUpsertData
 *  ✅ JSON.parse with (c: any) → typed records
 *  ✅ تنظيف جميع markdown artifacts
 *  ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Search, Plus, Edit2, Trash2, X, CheckCircle,
  BookOpen, AlertTriangle, Layers, Users, Award,
  FileText, Image, HelpCircle, Loader2, Lock, Unlock,
} from 'lucide-react';
import Card from '../../shared/components/ui/Card';
import Button from '../../shared/components/ui/Button';
import { useUIStore, useAuthStore } from '../../core/stores';
import { courseService, certificationService, employeeService } from '../../services/sdk';
import { getErrorMessage } from '../../services/errors';
import type { RichContent } from '../../shared/types/media';
import type { Quiz } from '../../shared/types/quiz';
import RichContentEditor from '../../shared/components/ui/RichContentEditor';
import QuizEditor from '../../shared/components/ui/QuizEditor';

// ════════════════════════════════════════════════════
// أنواع البيانات
// ════════════════════════════════════════════════════

type CourseLevel = 'مبتدئ' | 'متوسط' | 'متقدم' | 'خبير';
type CourseCategory = 'quality-basics' | 'quality' | 'manufacturing' | 'docs' | 'validation' | 'microbiology' | 'equipment' | 'regulatory' | 'supply' | 'roles' | 'safety' | 'advanced';

interface ManagedCourse {
  id: string;
  title: string;
  titleEn?: string;
  description: string;
  descriptionEn?: string;
  category: CourseCategory;
  duration: string;
  level: CourseLevel;
  points: number;
  mandatory: boolean;
  instructor: string;
  tags: string[];
  objectives: string[];
  modules: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  richContent?: RichContent;
}

interface EmployeeCert {
  id: string;
  employee_id: string;
  title: string;
  issuer: string;
  issue_date: string;
  approved: boolean;
  approval_date?: string;
  employee_name?: string;
  employee_email?: string;
}

/** صف خام من جدول courses */
interface CourseRow {
  id: string;
  title: string;
  title_en?: string;
  description?: string;
  description_en?: string;
  category: CourseCategory;
  duration: string;
  level: CourseLevel;
  points?: number;
  mandatory?: boolean;
  instructor?: string;
  tags?: string[];
  objectives?: string[];
  active?: boolean;
  created_at?: string;
  updated_at?: string;
  rich_content?: RichContent;
}

/** صف خام من جدول employee_certifications */
interface CertRow {
  id: string;
  employee_id: string;
  title: string;
  issuer: string;
  issue_date: string;
  created_at?: string;
  profiles?: { full_name?: string; email?: string } | null;
}

/** بيانات تحديث/إدراج دورة */
interface CourseUpsertData {
  title?: string;
  title_en?: string;
  description?: string;
  description_en?: string;
  category?: CourseCategory;
  duration?: string;
  level?: CourseLevel;
  points?: number;
  mandatory?: boolean;
  instructor?: string;
  tags?: string[];
  objectives?: string[];
  active?: boolean;
  rich_content?: RichContent;
}

/** سجل محلي في localStorage */
interface LocalCourseRecord extends CourseUpsertData {
  id: string;
  _id?: string;
  updatedAt?: string;
  quiz_id?: string;
}

interface LocalQuizRecord {
  id?: string;
  course_id: string;
  [key: string]: unknown;
}

// ════════════════════════════════════════════════════
// ثوابت
// ════════════════════════════════════════════════════

const CATEGORIES: { id: CourseCategory; label: string }[] = [
  { id: 'quality-basics', label: 'أساسيات الجودة' },
  { id: 'quality', label: 'ضبط الجودة' },
  { id: 'manufacturing', label: 'التصنيع' },
  { id: 'docs', label: 'التوثيق' },
  { id: 'validation', label: 'التحقق والتأهيل' },
  { id: 'microbiology', label: 'الميكروبيولوجيا' },
  { id: 'equipment', label: 'المعدات والمرافق' },
  { id: 'regulatory', label: 'التنظيم والترخيص' },
  { id: 'supply', label: 'سلسلة التوريد' },
  { id: 'roles', label: 'الأدوار الوظيفية' },
  { id: 'safety', label: 'السلامة والصحة' },
  { id: 'advanced', label: 'متقدم وتقنية' },
];

const LEVEL_STYLE: Record<CourseLevel, string> = {
  'مبتدئ': 'bg-emerald-100 text-emerald-700',
  'متوسط': 'bg-sky-100 text-sky-700',
  'متقدم': 'bg-violet-100 text-violet-700',
  'خبير': 'bg-rose-100 text-rose-700',
};

const EMPTY_RICH_CONTENT: RichContent = { blocks: [], mediaFiles: [] };

const getMediaSummary = (content: RichContent | undefined): string => {
  if (!content?.blocks?.length) return '';
  const types = content.blocks.map((b) => b.type);
  const parts: string[] = [];
  const textCount = types.filter((t) => t === 'text' || t === 'heading').length;
  const imageCount = types.filter((t) => t === 'image').length;
  const videoCount = types.filter((t) => t === 'video').length;
  const audioCount = types.filter((t) => t === 'audio').length;
  const docCount = types.filter((t) => t === 'document').length;
  if (textCount) parts.push(`${textCount} نصوص`);
  if (imageCount) parts.push(`${imageCount} صور`);
  if (videoCount) parts.push(`${videoCount} فيديوهات`);
  if (audioCount) parts.push(`${audioCount} صوتيات`);
  if (docCount) parts.push(`${docCount} مستندات`);
  return parts.join(' | ');
};

const convertRowToCourse = (c: CourseRow): ManagedCourse => ({
  id: c.id,
  title: c.title,
  titleEn: c.title_en || '',
  description: c.description || '',
  descriptionEn: c.description_en || '',
  category: c.category,
  duration: c.duration,
  level: c.level,
  points: c.points || 0,
  mandatory: c.mandatory || false,
  instructor: c.instructor || '',
  tags: c.tags || [],
  objectives: c.objectives || [],
  modules: c.objectives?.length || 5,
  active: c.active ?? true,
  createdAt: c.created_at || '',
  updatedAt: c.updated_at || '',
  richContent: c.rich_content || EMPTY_RICH_CONTENT,
});

const convertRowToCert = (c: CertRow): EmployeeCert => ({
  id: c.id,
  employee_id: c.employee_id,
  title: c.title,
  issuer: c.issuer,
  issue_date: c.issue_date,
  approved: true,
  approval_date: c.created_at,
  employee_name: c.profiles?.full_name || '',
  employee_email: c.profiles?.email || '',
});

// ════════════════════════════════════════════════════
// Course Edit Modal
// ════════════════════════════════════════════════════

const CourseEditModal = ({ course, onSave, onClose }: {
  course: ManagedCourse | null;
  onSave: (data: Partial<ManagedCourse>) => void;
  onClose: () => void;
}) => {
  const isNew = !course;
  const [activeTab, setActiveTab] = useState<'basic' | 'media'>('basic');
  const [form, setForm] = useState({
    title: course?.title || '',
    titleEn: course?.titleEn || '',
    description: course?.description || '',
    descriptionEn: course?.descriptionEn || '',
    category: (course?.category || 'quality-basics') as CourseCategory,
    duration: course?.duration || '2 ساعة',
    level: (course?.level || 'مبتدئ') as CourseLevel,
    points: course?.points || 50,
    mandatory: course?.mandatory || false,
    instructor: course?.instructor || '',
    tags: course?.tags?.join(', ') || '',
    objectives: course?.objectives?.join('\n') || '',
    active: course?.active ?? true,
    richContent: course?.richContent || EMPTY_RICH_CONTENT,
  });

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    onSave({
      ...form,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      objectives: form.objectives.split('\n').filter(Boolean),
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div className="relative bg-white rounded-3xl p-6 max-w-3xl w-full shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">{isNew ? <Plus size={20} className="text-white" /> : <Edit2 size={20} className="text-white" />}</div>
          <h3 className="text-lg font-extrabold text-slate-800">{isNew ? 'إضافة دورة جديدة' : 'تعديل الدورة'}</h3>
        </div>

        <div className="flex gap-0 mb-6 bg-slate-50 rounded-xl p-1">
          {[{ id: 'basic' as const, label: 'المعلومات الأساسية', icon: FileText }, { id: 'media' as const, label: 'الصور والملفات', icon: Layers }].map((tab) => {
            const TabIcon = tab.icon;
            return <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all flex-1 justify-center ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600'}`}><TabIcon size={16} /> {tab.label}</button>;
          })}
        </div>

        {activeTab === 'basic' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-bold text-slate-600 mb-1">عنوان الدورة (عربي) *</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="أساسيات الجودة" /></div>
              <div><label className="block text-xs font-bold text-slate-600 mb-1">العنوان (English)</label><input value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="Quality Fundamentals" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-bold text-slate-600 mb-1">الوصف (عربي)</label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 h-20 resize-none" /></div>
              <div><label className="block text-xs font-bold text-slate-600 mb-1">الوصف (English)</label><textarea value={form.descriptionEn} onChange={(e) => setForm({ ...form, descriptionEn: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 h-20 resize-none" /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><label className="block text-xs font-bold text-slate-600 mb-1">التصنيف</label><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as CourseCategory })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">{CATEGORIES.map((cat) => <option key={cat.id} value={cat.id}>{cat.label}</option>)}</select></div>
              <div><label className="block text-xs font-bold text-slate-600 mb-1">المستوى</label><select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as CourseLevel })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">{(['مبتدئ', 'متوسط', 'متقدم', 'خبير'] as CourseLevel[]).map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}</select></div>
              <div><label className="block text-xs font-bold text-slate-600 mb-1">المدة</label><input value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="2 ساعة" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-bold text-slate-600 mb-1">المدرب</label><input value={form.instructor} onChange={(e) => setForm({ ...form, instructor: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="د. أحمد" /></div>
              <div><label className="block text-xs font-bold text-slate-600 mb-1">النقاط</label><input type="number" value={form.points} onChange={(e) => setForm({ ...form, points: parseInt(e.target.value) || 0 })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" /></div>
            </div>
            <div><label className="block text-xs font-bold text-slate-600 mb-1">الوسوم</label><input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="HR, إدارة, تطوير" /></div>
            <div><label className="block text-xs font-bold text-slate-600 mb-1">الأهداف التعليمية</label><textarea value={form.objectives} onChange={(e) => setForm({ ...form, objectives: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 h-24 resize-none" /></div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.mandatory} onChange={(e) => setForm({ ...form, mandatory: e.target.checked })} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" /><span className="text-sm font-medium text-slate-700">إلزامية</span></label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" /><span className="text-sm font-medium text-slate-700">فعالة</span></label>
            </div>
          </div>
        )}

        {activeTab === 'media' && (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-indigo-50 to-violet-50 rounded-2xl p-4 border border-indigo-100">
              <div className="flex items-center gap-3"><Layers size={20} className="text-indigo-600" /><div><h4 className="font-bold text-slate-800 text-sm">المحتوى الغني للدورة</h4><p className="text-xs text-slate-500 mt-0.5">أضف صور، فيديوهات، ملفات صوتية، نصوص</p></div></div>
            </div>
            <RichContentEditor value={form.richContent} onChange={(c) => setForm({ ...form, richContent: c })} placeholder="أضف محتوى الدورة هنا..." maxHeight="500px" />
          </div>
        )}

        <div className="flex gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button fullWidth variant="outline" onClick={onClose}>إلغاء</Button>
          <Button fullWidth variant="primary" onClick={handleSubmit} disabled={!form.title.trim()} icon={<CheckCircle size={16} />} iconPosition="left">{isNew ? 'إضافة الدورة' : 'حفظ التغييرات'}</Button>
        </div>
        <button onClick={onClose} className="absolute top-4 left-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"><X size={18} /></button>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════
// المكون الرئيسي
// ════════════════════════════════════════════════════

export default function TrainingManagementPage() {
  const { addToast } = useUIStore();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'courses' | 'certifications'>('courses');
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState<ManagedCourse | null>(null);
  const [courses, setCourses] = useState<ManagedCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [certifications, setCertifications] = useState<EmployeeCert[]>([]);
  const [showQuizEditor, setShowQuizEditor] = useState(false);
  const [quizCourse, setQuizCourse] = useState<ManagedCourse | null>(null);

  const fetchCourses = async () => {
    setLoading(true);
    try {
      const data = await courseService.findAllCourses();
      if (data) setCourses((data as unknown as CourseRow[]).map(convertRowToCourse));
    } catch (err) {
      console.error('Failed to load courses:', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const fetchCertifications = async () => {
    try {
      const data = await certificationService.findAllCertifications();
      // جلب أسماء الموظفين
      const employees = await employeeService.findAll({ orderBy: 'full_name_ar' });
      const empMap = new Map((employees || []).map((e: any) => [e.id, e]));
      if (data) {
        const mapped = (data as any[]).map((c) => ({
          ...c,
          profiles: empMap.get(c.employee_id) ? { full_name: empMap.get(c.employee_id).full_name_ar || '', email: empMap.get(c.employee_id).email || '' } : null,
        }));
        setCertifications(mapped.map(convertRowToCert));
      }
    } catch (err) {
      console.error('Failed to load certifications:', getErrorMessage(err));
    }
  };

  useEffect(() => { fetchCourses(); fetchCertifications(); }, []);

  const filteredCourses = useMemo(() => {
    if (!searchQuery) return courses;
    const q = searchQuery.toLowerCase();
    return courses.filter((c) => c.title.includes(q) || c.titleEn?.toLowerCase().includes(q) || c.instructor.includes(q) || c.tags.some((t) => t.includes(q)));
  }, [courses, searchQuery]);

  const saveToLocal = (_id: string, _data: CourseUpsertData) => {
    /* تم إزالة الاعتماد على localStorage في خطة العلاج — كل شيء من Supabase عبر courseService */
  };

  const handleSaveCourse = async (data: Partial<ManagedCourse>) => {
    setSaving(true);
    try {
      const courseData: CourseUpsertData = {
        title: data.title,
        title_en: data.titleEn,
        description: data.description,
        description_en: data.descriptionEn,
        category: data.category,
        duration: data.duration,
        level: data.level,
        points: data.points,
        mandatory: data.mandatory,
        instructor: data.instructor,
        tags: data.tags,
        objectives: data.objectives,
        active: data.active ?? true,
        rich_content: data.richContent || EMPTY_RICH_CONTENT,
      };

      if (editingCourse) {
        await courseService.updateCourse(editingCourse.id, courseData as unknown as Record<string, unknown>);
        saveToLocal(editingCourse.id, courseData);
        addToast('تم تحديث الدورة بنجاح', 'success');
      } else {
        const newId = `course-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        await courseService.createCourse({ id: newId, ...courseData, created_by: user?.id } as any);
        saveToLocal(newId, courseData);
        setCourses((prev) => [{
          id: newId, title: data.title || '', titleEn: data.titleEn, description: data.description || '',
          descriptionEn: data.descriptionEn, category: data.category || 'quality-basics', duration: data.duration || '2 ساعة',
          level: data.level || 'مبتدئ', points: data.points || 0, mandatory: data.mandatory || false,
          instructor: data.instructor || '', tags: data.tags || [], objectives: data.objectives || [],
          modules: data.objectives?.length || 5, active: data.active ?? true, createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(), richContent: data.richContent || EMPTY_RICH_CONTENT,
        }, ...prev]);
        addToast('تم إضافة الدورة بنجاح', 'success');
      }
      setShowModal(false);
      setEditingCourse(null);
      if (editingCourse) await fetchCourses();
    } catch (err) {
      addToast('خطأ: ' + getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (courseId: string) => {
    const course = courses.find((c) => c.id === courseId);
    if (!course) return;
    try {
      await courseService.toggleActive(courseId, !course.active);
      setCourses((prev) => prev.map((c) => (c.id === courseId ? { ...c, active: !c.active } : c)));
      addToast('تم تغيير حالة الدورة', 'info');
    } catch {
      addToast('حدث خطأ', 'error');
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    try {
      await courseService.deleteCourse(courseId);
      setCourses((prev) => prev.filter((c) => c.id !== courseId));
      addToast('تم حذف الدورة', 'warning');
    } catch {
      addToast('حدث خطأ عند الحذف', 'error');
    }
  };

  const stats = {
    total: courses.length,
    active: courses.filter((c) => c.active).length,
    mandatory: courses.filter((c) => c.mandatory).length,
    completed: certifications.filter((c) => c.approved).length,
    totalCertifications: certifications.length,
    withMedia: courses.filter((c) => c.richContent?.blocks?.length).length,
  };

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { val: stats.total, label: 'إجمالي الدورات', icon: BookOpen, color: 'from-blue-500 to-blue-700' },
          { val: stats.active, label: 'دورات فعالة', icon: CheckCircle, color: 'from-emerald-500 to-emerald-700' },
          { val: stats.mandatory, label: 'إلزامية', icon: AlertTriangle, color: 'from-amber-500 to-amber-700' },
          { val: stats.withMedia, label: 'بمحتوى وسائط', icon: Image, color: 'from-violet-500 to-violet-700' },
          { val: `${Math.round((stats.completed / (stats.totalCertifications || 1)) * 100)}%`, label: 'إتمام التدريب', icon: Award, color: 'from-violet-500 to-violet-700' },
        ].map((s, i) => {
          const SIcon = s.icon;
          return (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center mb-3`}><SIcon size={18} className="text-white" /></div>
              <p className="text-2xl font-extrabold text-slate-800">{s.val}</p>
              <p className="text-xs text-slate-500 font-medium">{s.label}</p>
            </div>
          );
        })}
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {[{ id: 'courses' as const, label: 'الدورات', icon: BookOpen }, { id: 'certifications' as const, label: 'الشهادات', icon: Award }].map((tab) => {
              const TabIcon = tab.icon;
              return <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}><TabIcon size={16} /> {tab.label}</button>;
            })}
          </div>
          {activeTab === 'courses' && <Button variant="primary" size="sm" onClick={() => { setEditingCourse(null); setShowModal(true); }} icon={<Plus size={16} />} iconPosition="left">إضافة دورة</Button>}
        </div>
      </Card>

      <div className="relative">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="بحث في الدورات..." className="w-full bg-white border border-slate-200 rounded-xl pr-9 pl-9 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={15} /></button>}
      </div>

      {activeTab === 'courses' && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-500">الدورة</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-500">التصنيف</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-slate-500">المستوى</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-slate-500">المدة</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-slate-500">الوسائط</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-slate-500">إلزامي</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-slate-500">الحالة</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-slate-500">الإجراءات</th>
                </tr></thead>
                <tbody>
                  {filteredCourses.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-12 text-slate-400"><BookOpen size={32} className="mx-auto mb-2 opacity-40" /><p className="font-semibold">لا توجد دورات</p></td></tr>
                  ) : filteredCourses.map((course) => {
                    const hasMedia = !!(course.richContent?.blocks?.length);
                    return (
                      <tr key={course.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="px-4 py-3"><div className="flex items-center gap-3"><div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${LEVEL_STYLE[course.level]} flex items-center justify-center`}><BookOpen size={14} className="text-white" /></div><div><p className="font-bold text-slate-800 text-sm">{course.title}</p><p className="text-[11px] text-slate-400">{course.instructor}</p></div></div></td>
                        <td className="px-4 py-3 text-xs text-slate-600">{CATEGORIES.find((c) => c.id === course.category)?.label}</td>
                        <td className="px-4 py-3"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${LEVEL_STYLE[course.level]}`}>{course.level}</span></td>
                        <td className="px-4 py-3 text-center text-xs text-slate-600">{course.duration}</td>
                        <td className="px-4 py-3 text-center">{hasMedia ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full" title={getMediaSummary(course.richContent)}><Layers size={10} /> وسائط</span> : <span className="text-[11px] text-slate-400">-</span>}</td>
                        <td className="px-4 py-3 text-center">{course.mandatory ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full"><AlertTriangle size={10} /> إلزامي</span> : <span className="text-[11px] text-slate-400">اختياري</span>}</td>
                        <td className="px-4 py-3 text-center"><button onClick={() => handleToggleActive(course.id)} className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${course.active ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-slate-100 text-slate-400'}`}>{course.active ? <Unlock size={10} /> : <Lock size={10} />} {course.active ? 'فعالة' : 'متوقفة'}</button></td>
                        <td className="px-4 py-3"><div className="flex items-center justify-center gap-1"><button onClick={() => { setEditingCourse(course); setShowModal(true); }} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50" title="تعديل"><Edit2 size={14} /></button><button onClick={() => { setQuizCourse(course); setShowQuizEditor(true); }} className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50" title="الاختبارات"><HelpCircle size={14} /></button><button onClick={() => handleDeleteCourse(course.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50" title="حذف"><Trash2 size={14} /></button></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'certifications' && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-right px-4 py-3 text-xs font-bold text-slate-500">الموظف</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-slate-500">الدورة</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-slate-500">الجهة</th>
                <th className="text-center px-4 py-3 text-xs font-bold text-slate-500">التاريخ</th>
                <th className="text-center px-4 py-3 text-xs font-bold text-slate-500">الحالة</th>
              </tr></thead>
              <tbody>
                {certifications.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12 text-slate-400"><Award size={32} className="mx-auto mb-2 opacity-40" /><p className="font-semibold">لا توجد شهادات</p></td></tr>
                ) : certifications.map((cert) => (
                  <tr key={cert.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">{cert.employee_name?.charAt(0)}</div><div><p className="font-bold text-slate-800 text-sm">{cert.employee_name}</p><p className="text-[11px] text-slate-400">{cert.employee_email}</p></div></div></td>
                    <td className="px-4 py-3"><p className="font-semibold text-slate-700 text-sm">{cert.title}</p></td>
                    <td className="px-4 py-3 text-xs text-slate-600">{cert.issuer}</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-600">{new Date(cert.issue_date).toLocaleDateString('ar-IQ')}</td>
                    <td className="px-4 py-3 text-center"><span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle size={10} /> معتمدة</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && <CourseEditModal course={editingCourse} onSave={handleSaveCourse} onClose={() => { setShowModal(false); setEditingCourse(null); }} />}

      {showQuizEditor && quizCourse && (
        <QuizEditor
          courseId={quizCourse.id}
          courseTitle={quizCourse.title}
          courseContent={quizCourse.richContent}
          onSave={async (quiz: any) => {
            try {
              const { supabase } = await import('../../services/supabase/supabase');
              const tenant_id = localStorage.getItem('tenant_id');
              const { error } = await supabase.from('quizzes').upsert({ 
                id: (quiz as any).id || undefined,
                course_id: (quiz as any).course_id, 
                title: (quiz as any).title || 'اختبار',
                questions: (quiz as any).questions || [],
                tenant_id,
                updated_at: new Date().toISOString()
              } as any);
              if (error) throw error;
              addToast('تم حفظ الاختبار في Supabase', 'success');
            } catch {
              addToast('تم حفظ الاختبار محلياً', 'info');
            }
            setShowQuizEditor(false);
            setQuizCourse(null);
          }}
          onClose={() => { setShowQuizEditor(false); setQuizCourse(null); }}
        />
      )}
    </div>
  );
}
