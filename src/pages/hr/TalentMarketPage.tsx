/**
 * ════════════════════════════════════════════════════════════════
 *  TalentMarketPage - سجل المؤهلات والكفاءات (نسخة مُصلحة)
 * ════════════════════════════════════════════════════════════════
 *
 *  🔧 الإصلاحات المُطبّقة:
 *  ─────────────────────────────────────────────────────────────────
 *  ✅ 12 استخدام any → 0 (أنواع CV صريحة)
 *  ✅ تنظيف جميع markdown artifacts (30+ موضع)
 *  ✅ إصلاح addToast(`...`) المكسور
 *  ✅ إصلاح جميع template literals في className
 *  ✅ استخراج أنواع CV من types/index.ts (CvExperience, CvEducation...)
 *  ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Search, Star, Award, MapPin, Briefcase, Download, Loader,
  Mail, Phone, User, GraduationCap, Languages, Smile, X,
  FileText, LayoutTemplate,
} from 'lucide-react';
import { userService } from '../../services/sdk';
import Card, { CardHeader, CardTitle } from '../../shared/components/ui/Card';
import Badge from '../../shared/components/ui/Badge';
import Button from '../../shared/components/ui/Button';
import { useUIStore } from '../../core/stores';
import { getErrorMessage } from '../../services/errors';

// ════════════════════════════════════════════════════
// أنواع بيانات السيرة الذاتية (تحلّ محل any)
// ════════════════════════════════════════════════════

interface CvExperience {
  company?: string;
  role?: string;
  period?: string;
  desc?: string;
}

interface CvEducation {
  degree?: string;
  institution?: string;
  period?: string;
}

interface CvSkill {
  name?: string;
  level?: string;
}

interface CvLanguage {
  name?: string;
  level?: string;
}

interface CvData {
  template?: string;
  summary?: string;
  age?: string;
  experience?: CvExperience[];
  education?: CvEducation[];
  skills?: CvSkill[];
  languages?: CvLanguage[];
  hobbies?: string[];
}

interface TalentProfile {
  id: string;
  full_name: string;
  email?: string;
  phone?: string | null;
  department?: string | null;
  position?: string | null;
  profile_image?: string | null;
  /**
   * ★★★ 0354: القائمة لم تعد تحمل السيرة — أسماء المهارات فقط.
   *   كانت `cv_data` الكاملة تُرسَل لكل صفّ بلا حارس دور ⇒ أيّ موظف
   *   يقرأ ملخّص زميله وتوقّعات راتبه. التفاصيل تُطلَب عند المعاينة.
   */
  skills?: string[];
  skillCount?: number;
  hasCv?: boolean;
  /** يُملأ عند المعاينة فقط — عبر `talentProfileDetail`. */
  cv_data?: CvData | null;
}

// ════════════════════════════════════════════════════
// دوال مساعدة
// ════════════════════════════════════════════════════

/** استخراج بيانات CV بأمان من سجل قد تكون حقوله ناقصة */
function extractCvData(raw: unknown): CvData {
  if (!raw || typeof raw !== 'object') return {};
  const data = raw as Record<string, unknown>;
  return {
    template: typeof data.template === 'string' ? data.template : undefined,
    summary: typeof data.summary === 'string' ? data.summary : undefined,
    age: typeof data.age === 'string' ? data.age : undefined,
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

export default function TalentMarketPage() {
  const { addToast } = useUIStore();
  const [talents, setTalents] = useState<TalentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [previewCv, setPreviewCv] = useState<TalentProfile | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [stats, setStats] = useState<{ kind: string; label: string; count: number }[]>([]);

  useEffect(() => {
    let alive = true;
    const fetchTalents = async () => {
      setLoading(true);
      try {
        // ★★★ إصلاح 0354: الدالة صارت محروسة بـcurrent_user_is_staff()
        //   ولا تُعيد cv_data. والبحث يُمرَّر إليها بدل الترشيح في الذاكرة.
        const [rows, st] = await Promise.all([
          // ★ البحث الحرّ يُمرَّر كنصّ عام؛ ولو أراد المستخدم مهارةً بعينها
          //   فالمُعامل `skill` مستقلّ (بحثٌ بالمهارة له دلالة أضيق).
          userService.talentProfiles({ text: search.trim() || null, limit: 500 }),
          userService.talentSkillStats(5),
        ]);
        if (!alive) return;
        setTalents(rows as unknown as TalentProfile[]);
        setStats(st);
      } catch (err) {
        if (alive) addToast('تعذّر تحميل سجل المؤهلات: ' + getErrorMessage(err), 'error');
      } finally {
        if (alive) setLoading(false);
      }
    };
    const t = setTimeout(fetchTalents, search ? 350 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [search, addToast]);

  /** ★ التفاصيل تُطلَب عند المعاينة فقط — لا تُحمَّل مع القائمة. */
  const openPreview = async (talent: TalentProfile) => {
    setPreviewCv(talent);
    setPreviewLoading(true);
    try {
      const detail = await userService.talentProfileDetail(talent.id);
      setPreviewCv({ ...talent, cv_data: (detail?.cv_data ?? {}) as CvData });
    } catch (err) {
      addToast('تعذّر تحميل السيرة: ' + getErrorMessage(err), 'error');
      setPreviewCv(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  // ★ العطل ②: البحث يُنفَّذ في القاعدة الآن — القائمة تصل مُرشَّحة
  //   ولا تُرشَّح مرّةً أخرى في الذاكرة.
  const filteredTalents = talents;

  // ★★★ العطل ②: الإحصاءات تُحسب في القاعدة — كانت الصفحة تجلب 500
  //   سيرة كاملة لتعدّها في المتصفح، وهو ما ضخّم أثر تسريب العطل ①.
  const { topSkills, topPositions, topLanguages, cvCount } = useMemo(() => {
    const pick = (kind: string): [string, number][] =>
      stats.filter((r) => r.kind === kind).map((r) => [r.label, r.count]);
    return {
      topSkills: pick('skill'),
      topPositions: pick('position'),
      topLanguages: pick('language'),
      cvCount: stats.find((r) => r.kind === 'cv_count')?.count ?? 0,
    };
  }, [stats]);

  const handlePrintCV = (talent: TalentProfile) => {
    addToast(`جاري تحضير السيرة الذاتية لـ ${talent.full_name}...`, 'info');
    setTimeout(() => window.print(), 500);
  };

  // ════════════════════════════════════════════════════
  // العرض
  // ════════════════════════════════════════════════════

  return (
    <div className="space-y-6 animate-fade-in print:bg-white print:p-0">
      {/* Header */}
      <div className="print:hidden">
        <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
          <Award className="text-indigo-600" /> سجل مؤهلات وكفاءات الموظفين
        </h2>
        <p className="text-sm text-slate-500 mt-1">تتبع وتحليل المهارات، الشهادات، واكتشاف المواهب داخل مؤسستك</p>
      </div>

      {/* Search */}
      <div className="relative print:hidden">
        <Search size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالاسم، المسمى الوظيفي، أو المهارة (مثال: تصميم، React، تسويق)..."
          className="w-full bg-white border border-slate-200 rounded-2xl pr-12 pl-4 py-3 text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 shadow-sm"
        />
      </div>

      {/* الإحصائيات التجميعية */}
      {!loading && talents.length > 0 && (
        <div className="grid md:grid-cols-3 gap-5 print:hidden">
          <Card className="bg-indigo-50/50 border-indigo-100">
            <CardHeader>
              <CardTitle className="text-indigo-800 text-sm flex items-center gap-2"><Briefcase size={16} /> التوزيع حسب المسمى الوظيفي</CardTitle>
            </CardHeader>
            <div className="space-y-3 mt-2">
              {topPositions.map(([pos, count]) => (
                <div key={pos} className="flex items-center gap-3">
                  <span className="text-sm font-bold text-slate-700 w-1/3 truncate">{pos}</span>
                  <div className="flex-1 h-2 bg-indigo-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(count / talents.length) * 100}%` }} />
                  </div>
                  <span className="text-xs font-black text-indigo-700 w-10 text-left">{count} موظف</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="bg-amber-50/50 border-amber-100">
            <CardHeader>
              <CardTitle className="text-amber-800 text-sm flex items-center gap-2"><Star size={16} /> أكثر المهارات توفراً بالشركة</CardTitle>
            </CardHeader>
            <div className="space-y-3 mt-2">
              {topSkills.map(([skill, count]) => (
                <div key={skill} className="flex items-center gap-3">
                  <span className="text-sm font-bold text-slate-700 w-1/3 truncate">{skill}</span>
                  <div className="flex-1 h-2 bg-amber-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(count / talents.length) * 100}%` }} />
                  </div>
                  <span className="text-xs font-black text-amber-700 w-10 text-left">{count} شخص</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="bg-emerald-50/50 border-emerald-100">
            <CardHeader>
              <CardTitle className="text-emerald-800 text-sm flex items-center gap-2"><FileText size={16} /> السير الذاتية واللغات</CardTitle>
            </CardHeader>
            <div className="space-y-3 mt-2">
              <div className="flex items-center justify-between mb-4 bg-white p-2.5 rounded-xl border border-emerald-100 shadow-sm">
                <span className="text-xs font-bold text-slate-600">موظفون أنشأوا السيرة الذكية:</span>
                <span className="text-sm font-black text-emerald-600 bg-emerald-100 px-3 py-1 rounded-lg">{cvCount} / {talents.length}</span>
              </div>
              {topLanguages.map(([lang, count]) => (
                <div key={lang} className="flex items-center gap-3">
                  <span className="text-sm font-bold text-slate-700 w-1/3 truncate">{lang}</span>
                  <div className="flex-1 h-2 bg-emerald-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(count / talents.length) * 100}%` }} />
                  </div>
                  <span className="text-xs font-black text-emerald-700 w-10 text-left">{count} شخص</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* قائمة الموظفين */}
      {loading ? (
        <div className="flex justify-center items-center h-48">
          <div className="flex items-center gap-3 text-slate-500"><Loader className="animate-spin" /><span>جاري تحميل بيانات المواهب...</span></div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-5 print:grid-cols-1 print:gap-8">
          {filteredTalents.map((talent) => {
            // ★★★ 0354: القائمة لا تحمل السيرة — `hasCv` و`skills`
            //   محسوبان في القاعدة. التفاصيل تُطلَب عند الضغط.
            const hasCv = Boolean(talent.hasCv);
            const skills = talent.skills ?? [];

            return (
              <Card key={talent.id} className="flex flex-col print:shadow-none print:border-slate-300 print:break-inside-avoid">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    {talent.profile_image ? (
                      <img src={talent.profile_image} alt={talent.full_name} className="w-14 h-14 rounded-2xl object-cover shadow-lg print:hidden" />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xl font-extrabold shadow-lg print:hidden">
                        {talent.full_name?.charAt(0) || 'U'}
                      </div>
                    )}
                    <div>
                      <h3 className="font-bold text-slate-800 text-lg">{talent.full_name}</h3>
                      <p className="text-indigo-600 font-medium text-sm flex items-center gap-1.5"><Briefcase size={14} /> {talent.position || 'غير محدد'}</p>
                      <p className="text-slate-500 text-xs flex items-center gap-1.5 mt-0.5"><MapPin size={12} /> {talent.department || 'القسم غير محدد'}</p>
                    </div>
                  </div>
                  <div className="print:hidden">
                    {hasCv ? (
                      <button onClick={() => openPreview(talent)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors">
                        <LayoutTemplate size={14} /> عرض السيرة الذكية
                      </button>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">لا يوجد سيرة</span>
                    )}
                  </div>
                </div>

                <div className="flex gap-4 text-xs text-slate-500 mb-4 pb-4 border-b border-slate-100">
                  <span className="flex items-center gap-1"><Mail size={12} /> {talent.email || '—'}</span>
                  {talent.phone && <span className="flex items-center gap-1"><Phone size={12} /> {talent.phone}</span>}
                </div>

                <div className="flex-1 space-y-4">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1"><Star size={12} /> أبرز المهارات</p>
                    <div className="flex flex-wrap gap-2">
                      {skills.length === 0 ? (
                        <span className="text-xs text-slate-400">لم يضف مهارات بعد</span>
                      ) : skills.map((name, idx) => (
                        <Badge key={idx} variant="primary" className="px-2.5 py-1">{name}</Badge>
                      ))}
                    </div>
                  </div>

                  {/* ★ التعليم والمؤهلات جزء من السيرة الكاملة — تُطلَب
                      عند المعاينة، ولا تُحمَّل مع القائمة كلها. */}
                  <p className="text-xs text-slate-400">
                    {hasCv
                      ? 'التعليم والمؤهلات في السيرة الكاملة — اضغط «عرض السيرة».'
                      : 'لا سيرة ذاتية مسجّلة.'}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* مودال عرض السيرة الذاتية */}
      {previewCv && (() => {
        const cv = extractCvData(previewCv.cv_data);
        void previewLoading;
        return (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white" onClick={() => setPreviewCv(null)}>
            <div className="bg-white w-full max-w-4xl min-h-[800px] rounded-3xl shadow-2xl relative my-8 print:my-0 print:shadow-none print:rounded-none animate-fade-in" onClick={(e) => e.stopPropagation()} dir="rtl">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center print:hidden bg-slate-50 rounded-t-3xl">
                <h3 className="font-black text-xl text-slate-800 flex items-center gap-2"><LayoutTemplate className="text-indigo-600" /> السيرة الذاتية - {previewCv.full_name}</h3>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handlePrintCV(previewCv)} icon={<Download size={14} />} className="shadow-sm hover:-translate-y-0.5">طباعة / حفظ PDF</Button>
                  <button onClick={() => setPreviewCv(null)} className="p-2 bg-white rounded-lg text-slate-500 shadow-sm border border-slate-200 hover:text-slate-800 transition-colors"><X size={16} /></button>
                </div>
              </div>

              <div className="p-8 sm:p-12 print:p-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 mb-10 border-b-2 border-slate-800 pb-8">
                  {previewCv.profile_image ? (
                    <img src={previewCv.profile_image} className="w-32 h-32 rounded-full object-cover border-4 border-slate-100 shadow-md" alt="profile" />
                  ) : (
                    <div className="w-32 h-32 rounded-full bg-slate-800 text-white flex items-center justify-center text-5xl font-black shadow-md">{previewCv.full_name?.charAt(0)}</div>
                  )}
                  <div className="flex-1 text-center sm:text-right mt-2 sm:mt-0">
                    <h1 className="text-4xl font-black text-slate-900 mb-2">{previewCv.full_name}</h1>
                    <h2 className="text-xl font-bold text-indigo-600 mb-4">{previewCv.position || 'موظف'}</h2>
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-5 text-sm text-slate-600 font-bold">
                      {previewCv.email && <span className="flex items-center gap-1.5"><Mail size={16} className="text-slate-400" /> {previewCv.email}</span>}
                      {previewCv.phone && <span className="flex items-center gap-1.5"><Phone size={16} className="text-slate-400" /> {previewCv.phone}</span>}
                      {cv.age && <span className="flex items-center gap-1.5"><User size={16} className="text-slate-400" /> العمر: {cv.age}</span>}
                    </div>
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-10">
                  {/* العمود الرئيسي */}
                  <div className="sm:col-span-2 space-y-10">
                    {cv.summary && (
                      <section>
                        <h3 className="text-xl font-black text-slate-800 mb-4 flex items-center gap-2"><User size={20} className="text-indigo-600" /> نبذة تعريفية</h3>
                        <p className="text-sm text-slate-700 leading-relaxed text-justify font-medium bg-slate-50 p-4 rounded-2xl border border-slate-100">{cv.summary}</p>
                      </section>
                    )}

                    {(cv.experience || []).length > 0 && (
                      <section>
                        <h3 className="text-xl font-black text-slate-800 mb-5 flex items-center gap-2"><Briefcase size={20} className="text-indigo-600" /> الخبرات العملية</h3>
                        <div className="space-y-6">
                          {cv.experience!.map((exp, i) => (
                            <div key={i} className="relative pl-4 border-r-2 border-indigo-200 pr-5">
                              <div className="absolute top-1.5 -right-[7px] w-3 h-3 rounded-full bg-indigo-500 shadow-sm" />
                              <h4 className="font-black text-slate-800 text-lg">{exp.role}</h4>
                              <div className="flex justify-between text-sm text-indigo-600 mb-2 font-bold mt-1">
                                <span>{exp.company}</span>
                                {exp.period && <span className="text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md text-xs">{exp.period}</span>}
                              </div>
                              {exp.desc && <p className="text-sm text-slate-600 leading-relaxed font-medium mt-2">{exp.desc}</p>}
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {(cv.education || []).length > 0 && (
                      <section>
                        <h3 className="text-xl font-black text-slate-800 mb-5 flex items-center gap-2"><GraduationCap size={20} className="text-indigo-600" /> التعليم والمؤهلات</h3>
                        <div className="space-y-5">
                          {cv.education!.map((edu, i) => (
                            <div key={i} className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                              <h4 className="font-black text-slate-800 text-base">{edu.degree}</h4>
                              <div className="flex justify-between text-sm text-slate-600 font-bold mt-1.5">
                                <span>{edu.institution}</span>
                                {edu.period && <span className="text-indigo-600">{edu.period}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>

                  {/* العمود الجانبي */}
                  <div className="space-y-10">
                    {(cv.skills || []).length > 0 && (
                      <section>
                        <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2"><Star size={20} className="text-indigo-600" /> المهارات</h3>
                        <div className="flex flex-col gap-2.5">
                          {cv.skills!.map((s, i) => (
                            <div key={i} className="bg-slate-50 border border-slate-200 text-slate-800 px-4 py-2.5 rounded-xl text-sm font-bold w-full flex justify-between items-center shadow-sm">
                              {s.name} {s.level && <span className="text-[10px] text-indigo-700 bg-indigo-100 px-2 py-1 rounded-lg">{s.level}</span>}
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {(cv.languages || []).length > 0 && (
                      <section>
                        <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2"><Languages size={20} className="text-indigo-600" /> اللغات</h3>
                        <ul className="space-y-3">
                          {cv.languages!.map((lang, i) => (
                            <li key={i} className="flex justify-between items-center text-sm font-bold text-slate-700 border-b border-slate-100 pb-3 last:border-0">
                              {lang.name} {lang.level && <span className="text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg text-[10px]">{lang.level}</span>}
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}

                    {(cv.hobbies || []).length > 0 && (
                      <section>
                        <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2"><Smile size={20} className="text-indigo-600" /> الاهتمامات</h3>
                        <div className="flex flex-wrap gap-2">
                          {cv.hobbies!.map((h, i) => (
                            <span key={i} className="bg-indigo-50 border border-indigo-100 text-indigo-800 px-4 py-2 rounded-full text-xs font-black shadow-sm">{h}</span>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
