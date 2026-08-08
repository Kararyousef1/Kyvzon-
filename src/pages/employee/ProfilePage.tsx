/**
 * ════════════════════════════════════════════════════════════════
 *  ProfilePage - الملف الشخصي (نسخة مُصلحة)
 * ════════════════════════════════════════════════════════════════
 *
 *  🔧 الإصلاحات المُطبّقة:
 *  ─────────────────────────────────────────────────────────────────
 *  ✅ 14 استخدام any → 0 (أنواع CV صريحة)
 *  ✅ تنظيف جميع markdown artifacts
 *  ✅ updateUser(... as any) → Partial<User>
 *  ✅ (user as any).profile_image → user.profile_image (موجود أصلاً)
 *  ✅ catch blocks → getErrorMessage
 *  ✅ إصلاح storage.upload(...) المكسور (قوس ناقص)
 *  ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useRef } from 'react';
import {
  User, Mail, Phone, Building, Calendar, Edit3, Save, X, Star,
  Plus, Trash2, Loader, Camera, LayoutTemplate, Briefcase,
  GraduationCap, Languages, Smile, FileText, Target, Award,
  Archive,
} from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import { userService } from '../../services/sdk/UserService';
import { employeeService, certificationService, employeeGoalService, employeeSkillService } from '../../services/sdk';
import { storageService } from '../../services/sdk/StorageService';
import Card, { CardHeader, CardTitle } from '../../shared/components/ui/Card';
import Button from '../../shared/components/ui/Button';
import Badge from '../../shared/components/ui/Badge';
import Input from '../../shared/components/ui/Input';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { isLocalUser } from '../../services/utils';
import { getErrorMessage } from '../../services/errors';
import type { CvArchiveInfo } from '../../services/sdk';
import type { User as UserType } from '../../shared/types';

// ════════════════════════════════════════════════════
// أنواع بيانات السيرة الذاتية (CV) — تحلّ محل any
// ════════════════════════════════════════════════════

type CvTemplate = 'modern' | 'classic' | 'minimal';

interface CvExperience {
  company: string;
  role: string;
  period: string;
  desc: string;
}

interface CvEducation {
  degree: string;
  institution: string;
  period: string;
}

interface CvSkill {
  name: string;
  level: string;
}

interface CvLanguage {
  name: string;
  level: string;
}

interface CvFormData {
  template: CvTemplate;
  summary: string;
  age: string;
  experience: CvExperience[];
  education: CvEducation[];
  skills: CvSkill[];
  languages: CvLanguage[];
  hobbies: string[];
}

const EMPTY_CV: CvFormData = {
  template: 'modern',
  summary: '',
  age: '',
  experience: [],
  education: [],
  skills: [],
  languages: [],
  hobbies: [],
};

/** تحويل آمن من بيانات DB إلى CvFormData */
function normalizeCvData(raw: unknown): CvFormData {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_CV };
  const data = raw as Record<string, unknown>;
  return {
    template: (data.template as CvTemplate) || 'modern',
    summary: (data.summary as string) || '',
    age: (data.age as string) || '',
    experience: Array.isArray(data.experience) ? (data.experience as CvExperience[]) : [],
    education: Array.isArray(data.education) ? (data.education as CvEducation[]) : [],
    skills: Array.isArray(data.skills) ? (data.skills as CvSkill[]) : [],
    languages: Array.isArray(data.languages) ? (data.languages as CvLanguage[]) : [],
    hobbies: Array.isArray(data.hobbies) ? (data.hobbies as string[]) : [],
  };
}

// ════════════════════════════════════════════════════
// المكون الرئيسي
// ════════════════════════════════════════════════════

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore();
  const { addToast } = useUIStore();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: user?.name || user?.full_name || '', phone: user?.phone || '' });
  const [saving, setSaving] = useState(false);

  const [profileImage, setProfileImage] = useState<string>(user?.profile_image || '');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // السيرة الذاتية
  const [cvData, setCvData] = useState<CvFormData>({ ...EMPTY_CV });
  const [showCvBuilder, setShowCvBuilder] = useState(false);
  // ★★ 0336: الحذف كان فورياً من زرّ سلّة بلا تأكيد — نقرة واحدة
  //   تمسح ساعات عمل بلا رجعة. الآن تأكيد داخل الصفحة ثم أرشفة.
  //   (ممنوع confirm() — قاعدة المشروع)
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [cvArchive, setCvArchive] = useState<CvArchiveInfo>({
    hasArchive: false, archivedAt: null, skillCount: 0,
  });
  const [employeeRecordId, setEmployeeRecordId] = useState('');
  const [profileSkills, setProfileSkills] = useState<{ id: string; skill_name: string; level: string; category?: string }[]>([]);
  const [profileGoals, setProfileGoals] = useState<{ id: string; title: string; progress_percent: number; status: string }[]>([]);
  const [profileCertifications, setProfileCertifications] = useState<{ id: string; certification_name?: string; name?: string; issued_by?: string; issuer?: string; expiry_date?: string }[]>([]);

  // ملاحظة: لا يجوز الرجوع (return) قبل استدعاء كل الـ hooks —
  // حارس القيمة الفارغة يوضع قبل JSX فقط (Rules of Hooks).

  // ── حفظ الملف الشخصي ─────────────────────────────────────────
  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      if (isLocalUser(user.id)) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const updates: Partial<UserType> = { full_name: form.name, phone: form.phone };
        updateUser(updates);
        setEditing(false);
        addToast('تم تحديث الملف الشخصي', 'success');
        return;
      }

      await userService.updateUser(user.id, { full_name: form.name, phone: form.phone });

      updateUser({ full_name: form.name, phone: form.phone });
      setEditing(false);
      addToast('تم تحديث الملف الشخصي', 'success');
    } catch (err) {
      console.error('خطأ في الحفظ:', getErrorMessage(err));
      addToast('حدث خطأ أثناء حفظ البيانات', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── جلب البيانات الإضافية ─────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const fetchExtras = async () => {
      if (isLocalUser(user.id)) {
        setProfileImage('');
        setCvData({ ...EMPTY_CV });
        return;
      }

      try {
        const userProfile = await userService.findUserById(user.id);

        if (userProfile) {
          if (userProfile.profile_image) {
            setProfileImage(userProfile.profile_image);
            updateUser({ profile_image: userProfile.profile_image });
          }
          setCvData(normalizeCvData((userProfile as unknown as Record<string, unknown>).cv_data));
        }

        const employees = await employeeService.findAll({ filters: { user_id: user.id }, limit: 1 });
        const employeeId = employees[0]?.id;
        if (employeeId) {
          setEmployeeRecordId(employeeId);
          const [skills, goals, certifications] = await Promise.all([
            employeeSkillService.findByEmployee(employeeId).catch(() => []),
            employeeGoalService.findByEmployee(employeeId).catch(() => []),
            certificationService.findByEmployee(employeeId).catch(() => []),
          ]);
          // ★ المرحلة 1: نوع الحالة معرّف أعلاه — نمرّ عبر unknown لا any
          setProfileSkills((skills ?? []) as unknown as Parameters<typeof setProfileSkills>[0]);
          setProfileGoals(
            ((goals ?? []) as unknown as { status?: string }[])
              .filter((goal) => goal.status !== 'cancelled')
              .slice(0, 5) as unknown as Parameters<typeof setProfileGoals>[0],
          );
          setProfileCertifications(
            (certifications ?? []).slice(0, 5) as unknown as Parameters<typeof setProfileCertifications>[0],
          );

        // ★ 0336: حالة الأرشيف — لعرض شريط الاسترجاع
        if (!isLocalUser(user.id)) {
          setCvArchive(await userService.myCvArchiveInfo());
        }
        }
      } catch (err) {
        console.error('فشل جلب البيانات الإضافية:', getErrorMessage(err));
      }
    };

    if (user.id) fetchExtras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── رفع الصورة ────────────────────────────────────────────────
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      if (isLocalUser(user.id)) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const mockUrl = URL.createObjectURL(file);
        setProfileImage(mockUrl);
        updateUser({ profile_image: mockUrl });
        addToast('تم رفع الصورة بنجاح (وضع تجريبي)', 'success');
        return;
      }

      const url = await storageService.uploadPublic(
        'public-assets',
        'profiles',
        file,
        { fileName: `${user.id}-${Date.now()}` },
      );
      setProfileImage(url);

      await userService.updateUser(user.id, { profile_image: url });

      updateUser({ profile_image: url });
      addToast('تم رفع الصورة بنجاح', 'success');
    } catch (err) {
      addToast('فشل رفع الصورة (' + getErrorMessage(err, 'تحقق من دلو public-assets') + ')', 'error');
    } finally {
      setUploading(false);
    }
  };

  // ── حفظ السيرة الذاتية ────────────────────────────────────────
  const handleSaveCvBuilder = async () => {
    if (!user) return;
    setSaving(true);
    try {
      if (isLocalUser(user.id)) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        addToast('تم حفظ السيرة الذاتية بنجاح (وضع تجريبي)', 'success');
        setShowCvBuilder(false);
        return;
      }

      await userService.updateUser(user.id, { cv_data: cvData as unknown as Record<string, unknown> });
      addToast('تم حفظ السيرة الذاتية بنجاح وتحديثها في سجل الإدارة', 'success');
      setShowCvBuilder(false);
    } catch (err) {
      addToast('فشل حفظ السيرة الذاتية: ' + getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── أرشفة السيرة الذاتية (0336) ───────────────────────────────
  //
  //   ★★ كانت `handleDeleteCv` تكتب `cv_data = {}` مباشرةً — حذف
  //     نهائي بلا تأكيد ولا نسخة. الآن أرشفة قابلة للاسترجاع.
  const handleArchiveCv = async () => {
    if (!user) return;
    setConfirmArchive(false);
    if (isLocalUser(user.id)) {
      setCvData({ ...EMPTY_CV });
      addToast('تمت الأرشفة (وضع تجريبي)', 'success');
      return;
    }
    try {
      const ok = await userService.archiveMyCv();
      if (!ok) {
        addToast('لا توجد سيرة ذاتية لأرشفتها', 'info');
        return;
      }
      setCvData({ ...EMPTY_CV });
      setCvArchive(await userService.myCvArchiveInfo());
      addToast('أُرشفت السيرة الذاتية — يمكنك استرجاعها', 'success');
    } catch (err) {
      addToast('فشلت الأرشفة: ' + getErrorMessage(err), 'error');
    }
  };

  // ── استرجاع السيرة المؤرشفة ───────────────────────────────────
  const handleRestoreCv = async () => {
    if (!user || isLocalUser(user.id)) return;
    try {
      const ok = await userService.restoreMyCv();
      if (!ok) {
        addToast('لا توجد نسخة مؤرشفة', 'info');
        return;
      }
      const profile = await userService.findUserById(user.id);
      setCvData(normalizeCvData(
        (profile as unknown as Record<string, unknown>)?.cv_data,
      ));
      setCvArchive(await userService.myCvArchiveInfo());
      addToast('استُرجعت السيرة الذاتية', 'success');
    } catch (err) {
      addToast('فشل الاسترجاع: ' + getErrorMessage(err), 'error');
    }
  };

  // ─── دوال مساعدة لتحديث عناصر CV ─────────────────────────────
  const updateExperience = (idx: number, field: keyof CvExperience, value: string) => {
    setCvData((prev) => {
      const newArr = [...prev.experience];
      newArr[idx] = { ...newArr[idx], [field]: value };
      return { ...prev, experience: newArr };
    });
  };

  const updateEducation = (idx: number, field: keyof CvEducation, value: string) => {
    setCvData((prev) => {
      const newArr = [...prev.education];
      newArr[idx] = { ...newArr[idx], [field]: value };
      return { ...prev, education: newArr };
    });
  };

  const updateSkill = (idx: number, field: keyof CvSkill, value: string) => {
    setCvData((prev) => {
      const newArr = [...prev.skills];
      newArr[idx] = { ...newArr[idx], [field]: value };
      return { ...prev, skills: newArr };
    });
  };

  const updateLanguage = (idx: number, field: keyof CvLanguage, value: string) => {
    setCvData((prev) => {
      const newArr = [...prev.languages];
      newArr[idx] = { ...newArr[idx], [field]: value };
      return { ...prev, languages: newArr };
    });
  };

  const updateHobby = (idx: number, value: string) => {
    setCvData((prev) => {
      const newArr = [...prev.hobbies];
      newArr[idx] = value;
      return { ...prev, hobbies: newArr };
    });
  };

  const removeByIndex = <T,>(arr: T[], idx: number): T[] => arr.filter((_, i) => i !== idx);

  // حارس القيمة الفارغة — بعد كل الـ hooks وقبل أي وصول إلى user (Rules of Hooks)
  if (!user) return null;

  // ─── مشتقّات ──────────────────────────────────────────────────
  const roleLabel = user.role === 'admin' ? 'مشرف النظام' : user.role === 'hr' ? 'موارد بشرية' : 'موظف';
  const roleVariant = user.role === 'admin' ? 'danger' : user.role === 'hr' ? 'success' : 'primary';

  // ════════════════════════════════════════════════════
  // العرض
  // ════════════════════════════════════════════════════

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-fade-in">
      {/* Avatar */}
      <Card>
        <div className="flex items-center gap-5">
          <div className="relative group">
            {profileImage ? (
              <img src={profileImage} alt="Profile" className="w-20 h-20 rounded-2xl object-cover shadow-lg border border-slate-100" />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-3xl font-extrabold shadow-lg">
                {(user?.name || user?.full_name || 'U').charAt(0)}
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-2 -right-2 p-2 bg-white hover:bg-slate-50 text-indigo-600 rounded-full shadow-md border border-slate-100 transition-all"
            >
              {uploading ? <Loader size={14} className="animate-spin" /> : <Camera size={14} />}
            </button>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl font-extrabold text-slate-800">{user?.name || user?.full_name}</h2>
              <Badge variant={roleVariant}>{roleLabel}</Badge>
            </div>
            <p className="text-slate-500">{user.position}</p>
            <p className="text-sm text-slate-400">{user.department} · {user.employeeId}</p>
          </div>
          <Button
            variant={editing ? 'danger' : 'secondary'}
            size="sm"
            icon={editing ? <X size={14} /> : <Edit3 size={14} />}
            iconPosition="left"
            onClick={() => { setEditing(!editing); setForm({ name: user?.name || user?.full_name || '', phone: user?.phone || '' }); }}
          >
            {editing ? 'إلغاء' : 'تعديل'}
          </Button>
        </div>
      </Card>

      {/* Info */}
      <Card>
        <CardHeader>
          <CardTitle>📋 المعلومات الشخصية</CardTitle>
        </CardHeader>
        {editing ? (
          <div className="space-y-4">
            <Input label="الاسم الكامل" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            <Input label="رقم الهاتف" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
            <Button fullWidth onClick={handleSave} loading={saving} icon={<Save size={14} />} iconPosition="left">
              حفظ التغييرات
            </Button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { icon: User, label: 'الاسم الكامل', value: user?.name || user?.full_name },
              { icon: Mail, label: 'البريد الإلكتروني', value: user.email },
              { icon: Phone, label: 'رقم الهاتف', value: user.phone || 'غير محدد' },
              { icon: Building, label: 'القسم', value: user.department },
              { icon: User, label: 'المسمى الوظيفي', value: user.position },
              { icon: Calendar, label: 'تاريخ الالتحاق', value: user.joinDate ? format(new Date(user.joinDate), 'dd MMMM yyyy', { locale: ar }) : 'غير محدد' },
              { icon: User, label: 'المشرف المباشر', value: user.manager || 'غير محدد' },
              { icon: User, label: 'رقم الموظف', value: user.employeeId },
            ].map((info, i) => {
              const Icon = info.icon;
              return (
                <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0">
                    <Icon size={14} className="text-slate-500" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">{info.label}</p>
                    <p className="text-sm font-semibold text-slate-700">{info.value}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Professional Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Award size={16} className="text-amber-500" /> الملف المهني والتطوير</CardTitle>
        </CardHeader>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="rounded-2xl bg-indigo-50 border border-indigo-100 p-4">
            <div className="flex items-center gap-2 mb-3"><Star size={16} className="text-indigo-600" /><p className="text-sm font-bold text-indigo-800">المهارات</p></div>
            {profileSkills.length === 0 ? <p className="text-xs text-indigo-500">لم تُسجل مهارات بعد</p> : (
              <div className="flex flex-wrap gap-2">
                {profileSkills.slice(0, 6).map(skill => <span key={skill.id} className="text-xs font-bold bg-white text-indigo-700 border border-indigo-100 rounded-full px-2 py-1">{skill.skill_name} • {skill.level}</span>)}
              </div>
            )}
          </div>
          <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4">
            <div className="flex items-center gap-2 mb-3"><Target size={16} className="text-emerald-600" /><p className="text-sm font-bold text-emerald-800">الأهداف</p></div>
            {profileGoals.length === 0 ? <p className="text-xs text-emerald-500">لا توجد أهداف نشطة</p> : (
              <div className="space-y-2">
                {profileGoals.slice(0, 3).map(goal => (
                  <div key={goal.id}>
                    <div className="flex justify-between text-xs font-bold text-emerald-700 mb-1"><span className="truncate">{goal.title}</span><span>{goal.progress_percent || 0}%</span></div>
                    <div className="h-1.5 bg-white rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${Math.min(goal.progress_percent || 0, 100)}%` }} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-2xl bg-purple-50 border border-purple-100 p-4">
            <div className="flex items-center gap-2 mb-3"><GraduationCap size={16} className="text-purple-600" /><p className="text-sm font-bold text-purple-800">الشهادات</p></div>
            {profileCertifications.length === 0 ? <p className="text-xs text-purple-500">لا توجد شهادات مسجلة</p> : (
              <div className="space-y-2">
                {profileCertifications.slice(0, 3).map(cert => <p key={cert.id} className="text-xs font-bold text-purple-700 bg-white rounded-lg px-2 py-1">{cert.certification_name || cert.name}</p>)}
              </div>
            )}
          </div>
        </div>
        {employeeRecordId && <p className="text-[11px] text-slate-400 mt-3">يتم تحديث هذه البيانات من صفحات الأهداف والمهارات والتدريب والشهادات.</p>}
      </Card>

      {/* CV Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText size={16} className="text-blue-500" /> السيرة الذاتية (CV)</CardTitle>
        </CardHeader>
        <div className="space-y-4">
          {cvData && cvData.summary ? (
            <div className="flex items-center justify-between p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
              <div className="flex items-center gap-3">
                <LayoutTemplate size={24} className="text-indigo-600" />
                <div>
                  <p className="text-sm font-bold text-indigo-800">تم توليد سيرة ذاتية ذكية</p>
                  <p className="text-xs text-indigo-600 mt-0.5">ستظهر للإدارة في سجل المؤهلات والكفاءات</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowCvBuilder(true)} className="!bg-white !border-indigo-200 !text-indigo-700 hover:!bg-indigo-100">تعديل السيرة</Button>
                <button
                  onClick={() => setConfirmArchive(true)}
                  title="أرشفة السيرة الذاتية"
                  className="p-2.5 text-amber-600 bg-white hover:bg-amber-50 border border-amber-200 rounded-xl shadow-sm transition-all"
                ><Archive size={16} /></button>
              </div>
            </div>
          ) : (
            <div className="grid sm:grid-cols-1 gap-4">
{/* ★★ 0336: تأكيد الأرشفة داخل الصفحة — ممنوع confirm() */}
{confirmArchive && (
  <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
    <p className="text-sm font-bold text-amber-900 mb-1">أرشفة السيرة الذاتية؟</p>
    <p className="text-xs text-amber-700 leading-relaxed mb-3">
      لن تُحذف — ستُحفظ نسخة يمكنك استرجاعها متى شئت، لكنها ستختفي
      من سجلّ المؤهلات لدى الموارد البشرية.
    </p>
    <div className="flex gap-2">
      <Button size="sm" onClick={handleArchiveCv} className="!bg-amber-600 hover:!bg-amber-700">
        نعم، أرشِف
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setConfirmArchive(false)}>
        إلغاء
      </Button>
    </div>
  </div>
)}

{/* ★ شريط الاسترجاع — يظهر فقط حين توجد نسخة مؤرشفة */}
{cvArchive.hasArchive && (
  <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 flex items-center gap-3 flex-wrap">
    <Archive size={18} className="text-slate-400 shrink-0" />
    <div className="min-w-0 flex-1">
      <p className="text-sm font-bold text-slate-700">لديك سيرة ذاتية مؤرشفة</p>
      <p className="text-xs text-slate-500 mt-0.5">
        {cvArchive.skillCount} مهارة
        {cvArchive.archivedAt
          ? ` · أُرشفت ${new Date(cvArchive.archivedAt).toLocaleDateString('ar')}`
          : ''}
      </p>
    </div>
    <Button size="sm" variant="outline" onClick={handleRestoreCv}>استرجاع</Button>
  </div>
)}

              <div onClick={() => setShowCvBuilder(true)} className="border-2 border-dashed border-slate-200 rounded-2xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-all text-slate-500 hover:text-purple-600 group">
                <LayoutTemplate size={28} className="group-hover:-translate-y-1 transition-transform" />
                <p className="font-bold text-sm">إنشاء سيرة ذاتية</p>
                <p className="text-xs opacity-70 text-center">أضف مهاراتك، خبراتك، وتعليمك ليتم تحليلها بدقة في سجل المؤهلات</p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* CV Builder Modal */}
      {showCvBuilder && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-fade-in">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-black text-xl text-slate-800 flex items-center gap-2"><LayoutTemplate className="text-indigo-600" /> صانع السيرة الذاتية الذكي</h3>
              <button onClick={() => setShowCvBuilder(false)} className="p-2 bg-white rounded-lg text-slate-500 hover:text-slate-800 shadow-sm border border-slate-200 transition-colors"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50/50">
              {/* النبذة والعمر */}
              <div className="grid md:grid-cols-3 gap-5">
                <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-bold text-slate-700">النبذة التعريفية (الهدف المهني)</label>
                  <textarea value={cvData.summary} onChange={(e) => setCvData({ ...cvData, summary: e.target.value })} rows={4} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-indigo-500 text-sm shadow-sm resize-none" placeholder="نبذة قصيرة عن طموحك وخبراتك تبرز أهم نقاط قوتك..." />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">العمر / المواليد</label>
                  <input type="text" value={cvData.age} onChange={(e) => setCvData({ ...cvData, age: e.target.value })} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-indigo-500 text-sm shadow-sm" placeholder="مثال: 28 سنة" />
                </div>
              </div>

              {/* الخبرات */}
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-2">
                  <h4 className="font-black text-slate-800 text-base flex items-center gap-2"><Briefcase size={18} className="text-blue-500" /> الخبرات العملية</h4>
                  <button onClick={() => setCvData({ ...cvData, experience: [...cvData.experience, { company: '', role: '', period: '', desc: '' }] })} className="text-xs font-bold text-blue-700 bg-blue-100 hover:bg-blue-200 transition-colors px-3 py-1.5 rounded-lg flex items-center gap-1"><Plus size={14} /> إضافة خبرة</button>
                </div>
                <div className="space-y-4">
                  {cvData.experience.map((exp, i) => (
                    <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative group">
                      <button onClick={() => setCvData({ ...cvData, experience: removeByIndex(cvData.experience, i) })} className="absolute top-3 right-3 p-1.5 text-red-400 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16} /></button>
                      <div className="grid sm:grid-cols-3 gap-4 mb-4 pr-8">
                        <input placeholder="الشركة / الجهة" value={exp.company} onChange={(e) => updateExperience(i, 'company', e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500" />
                        <input placeholder="المسمى الوظيفي" value={exp.role} onChange={(e) => updateExperience(i, 'role', e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500" />
                        <input placeholder="الفترة (مثال: 2020 - 2023)" value={exp.period} onChange={(e) => updateExperience(i, 'period', e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500" />
                      </div>
                      <textarea placeholder="وصف المهام والإنجازات..." value={exp.desc} onChange={(e) => updateExperience(i, 'desc', e.target.value)} rows={2} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none" />
                    </div>
                  ))}
                  {cvData.experience.length === 0 && <p className="text-center text-sm font-semibold text-slate-400 py-6 border-2 border-dashed border-slate-200 rounded-2xl">لم تقم بإضافة خبرات مهنية بعد</p>}
                </div>
              </div>

              {/* التعليم */}
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-2">
                  <h4 className="font-black text-slate-800 text-base flex items-center gap-2"><GraduationCap size={18} className="text-emerald-500" /> التعليم والمؤهلات الأكاديمية</h4>
                  <button onClick={() => setCvData({ ...cvData, education: [...cvData.education, { degree: '', institution: '', period: '' }] })} className="text-xs font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 transition-colors px-3 py-1.5 rounded-lg flex items-center gap-1"><Plus size={14} /> إضافة مؤهل</button>
                </div>
                <div className="space-y-4">
                  {cvData.education.map((edu, i) => (
                    <div key={i} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm relative flex flex-col sm:flex-row gap-3">
                      <input placeholder="المؤهل (مثال: بكالوريوس إدارة أعمال)" value={edu.degree} onChange={(e) => updateEducation(i, 'degree', e.target.value)} className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-500" />
                      <input placeholder="الجامعة / المعهد" value={edu.institution} onChange={(e) => updateEducation(i, 'institution', e.target.value)} className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-500" />
                      <input placeholder="سنة التخرج" value={edu.period} onChange={(e) => updateEducation(i, 'period', e.target.value)} className="w-full sm:w-32 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-500" />
                      <button onClick={() => setCvData({ ...cvData, education: removeByIndex(cvData.education, i) })} className="p-2.5 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-xl border border-transparent hover:border-red-100 transition-all flex items-center justify-center"><Trash2 size={16} /></button>
                    </div>
                  ))}
                  {cvData.education.length === 0 && <p className="text-center text-sm font-semibold text-slate-400 py-6 border-2 border-dashed border-slate-200 rounded-2xl">لم تقم بإضافة مؤهلات علمية بعد</p>}
                </div>
              </div>

              {/* المهارات */}
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-2">
                  <h4 className="font-black text-slate-800 text-base flex items-center gap-2"><Star size={18} className="text-amber-500" /> المهارات المهنية والفنية</h4>
                  <button onClick={() => setCvData({ ...cvData, skills: [...cvData.skills, { name: '', level: 'متوسط' }] })} className="text-xs font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 transition-colors px-3 py-1.5 rounded-lg flex items-center gap-1"><Plus size={14} /> إضافة مهارة</button>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {cvData.skills.map((skill, i) => (
                    <div key={i} className="flex gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm relative group">
                      <input placeholder="اسم المهارة" value={skill.name} onChange={(e) => updateSkill(i, 'name', e.target.value)} className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-amber-500" />
                      <select value={skill.level} onChange={(e) => updateSkill(i, 'level', e.target.value)} className="w-24 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-amber-500 font-bold">
                        <option value="مبتدئ">مبتدئ</option><option value="متوسط">متوسط</option><option value="متقدم">متقدم</option><option value="خبير">خبير</option>
                      </select>
                      <button onClick={() => setCvData({ ...cvData, skills: removeByIndex(cvData.skills, i) })} className="p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors flex items-center justify-center"><Trash2 size={16} /></button>
                    </div>
                  ))}
                  {cvData.skills.length === 0 && <p className="text-center text-sm font-semibold text-slate-400 py-4 border-2 border-dashed border-slate-200 rounded-xl sm:col-span-2">لم تقم بإضافة مهارات بعد</p>}
                </div>
              </div>

              {/* اللغات والهوايات */}
              <div className="grid sm:grid-cols-2 gap-8">
                <div>
                  <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-2">
                    <h4 className="font-black text-slate-800 text-base flex items-center gap-2"><Languages size={18} className="text-amber-500" /> اللغات</h4>
                    <button onClick={() => setCvData({ ...cvData, languages: [...cvData.languages, { name: '', level: 'ممتاز' }] })} className="text-xs font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg flex items-center gap-1"><Plus size={14} /> لغة</button>
                  </div>
                  <div className="space-y-3">
                    {cvData.languages.map((lang, i) => (
                      <div key={i} className="flex gap-2">
                        <input placeholder="اسم اللغة" value={lang.name} onChange={(e) => updateLanguage(i, 'name', e.target.value)} className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-500" />
                        <select value={lang.level} onChange={(e) => updateLanguage(i, 'level', e.target.value)} className="w-28 bg-white border border-slate-200 rounded-xl px-2 py-2 text-sm outline-none focus:border-amber-500 font-bold">
                          <option value="مبتدئ">مبتدئ</option><option value="جيد">جيد</option><option value="ممتاز">ممتاز</option><option value="اللغة الأم">اللغة الأم</option>
                        </select>
                        <button onClick={() => setCvData({ ...cvData, languages: removeByIndex(cvData.languages, i) })} className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-xl transition-colors flex items-center justify-center"><Trash2 size={16} /></button>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-2">
                    <h4 className="font-black text-slate-800 text-base flex items-center gap-2"><Smile size={18} className="text-purple-500" /> الهوايات والاهتمامات</h4>
                    <button onClick={() => setCvData({ ...cvData, hobbies: [...cvData.hobbies, ''] })} className="text-xs font-bold text-purple-700 bg-purple-100 hover:bg-purple-200 px-3 py-1.5 rounded-lg flex items-center gap-1"><Plus size={14} /> هواية</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {cvData.hobbies.map((hobby, i) => (
                      <div key={i} className="flex items-center bg-white border border-slate-200 shadow-sm rounded-full px-1.5 py-1">
                        <input value={hobby} onChange={(e) => updateHobby(i, e.target.value)} placeholder="اكتب..." className="w-24 bg-transparent text-sm font-bold px-2 outline-none text-slate-700" />
                        <button onClick={() => setCvData({ ...cvData, hobbies: removeByIndex(cvData.hobbies, i) })} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 bg-white flex justify-end gap-3 shrink-0 shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
              <Button variant="secondary" onClick={() => setShowCvBuilder(false)} className="px-6">إلغاء</Button>
              <Button onClick={handleSaveCvBuilder} loading={saving} icon={<Save size={16} />} iconPosition="left" className="px-8 shadow-md hover:-translate-y-0.5">اعتماد وحفظ السيرة الذاتية</Button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'مشاكل مرفوعة', value: '2', color: 'bg-indigo-50 text-indigo-700' },
          { label: 'تم حلها', value: '3', color: 'bg-emerald-50 text-emerald-700' },
          { label: 'استبيانات مكتملة', value: '8', color: 'bg-purple-50 text-purple-700' },
        ].map((stat, i) => (
          <div key={i} className={`${stat.color} rounded-xl p-4 text-center`}>
            <p className="text-2xl font-extrabold">{stat.value}</p>
            <p className="text-xs font-medium mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
