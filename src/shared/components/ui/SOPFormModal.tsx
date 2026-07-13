import { useState, useEffect } from 'react';
import {
  X, Save, Loader2, FileText, Info,
  Plus, Upload, Trash2, Layers, BookOpen
} from 'lucide-react';
import type { SOP, SOPStatus, SOPSection } from '../../../shared/types/sops';
import type { RichContent } from '../../../shared/types/media';
import { SOP_DEPARTMENTS, SOP_CATEGORIES } from '../../../shared/types/sops';
import RichContentEditor from './RichContentEditor';

// ── New SOP interface with rich content ──
interface SOPFormData {
  title: string;
  titleEn: string;
  code: string;
  description: string;
  descriptionEn: string;
  department: string;
  category: string;
  pdfUrl: string;
  version: string;
  status: SOPStatus;
  effectiveDate: string;
  reviewDate: string;
  tags: string;
  duration: string;
  isMandatory: boolean;
  content: RichContent;
  coverImageUrl: string;
  sections: SOPSection[];
}

interface SOPFormModalProps {
  isOpen: boolean;
  editingSop: SOP | null;
  onClose: () => void;
  onSave: (data: Partial<SOP>) => Promise<void>;
  saving: boolean;
}

const generateSectionId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

const EMPTY_CONTENT: RichContent = { blocks: [], mediaFiles: [] };

export default function SOPFormModal({
  isOpen,
  editingSop,
  onClose,
  onSave,
  saving,
}: SOPFormModalProps) {
  const [activeTab, setActiveTab] = useState<'basic' | 'content' | 'sections' | 'attachments'>('basic');
  const [formData, setFormData] = useState<SOPFormData>({
    title: '', titleEn: '', code: '', description: '', descriptionEn: '',
    department: 'general', category: '', pdfUrl: '', version: '1.0',
    status: 'active', effectiveDate: '', reviewDate: '',
    tags: '', duration: '30', isMandatory: true,
    content: EMPTY_CONTENT,
    coverImageUrl: '',
    sections: [],
  });

  useEffect(() => {
    if (editingSop) {
      const coverImageUrl = typeof editingSop.coverImage === 'string'
        ? editingSop.coverImage
        : editingSop.coverImage?.url || '';
      const content = typeof editingSop.content === 'string'
        ? { blocks: [], mediaFiles: [] }
        : editingSop.content || EMPTY_CONTENT;
      setFormData({
        title: editingSop.title,
        titleEn: editingSop.titleEn || '',
        code: editingSop.code,
        description: editingSop.description,
        descriptionEn: editingSop.descriptionEn || '',
        department: editingSop.department,
        category: editingSop.category,
        pdfUrl: editingSop.pdfUrl,
        version: editingSop.version,
        status: editingSop.status,
        effectiveDate: editingSop.effectiveDate,
        reviewDate: editingSop.reviewDate,
        tags: (editingSop.tags || []).join(', '),
        duration: editingSop.duration,
        isMandatory: editingSop.isMandatory,
        content: content,
        coverImageUrl: coverImageUrl,
        sections: editingSop.sections || [],
      });
    } else {
      setFormData({
        title: '', titleEn: '', code: '', description: '', descriptionEn: '',
        department: 'general', category: '', pdfUrl: '', version: '1.0',
        status: 'active', effectiveDate: '', reviewDate: '',
        tags: '', duration: '30', isMandatory: true,
        content: EMPTY_CONTENT,
        coverImageUrl: '',
        sections: [],
      });
    }
  }, [editingSop]);

  const updateField = <K extends keyof SOPFormData>(key: K, value: SOPFormData[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!formData.title || !formData.code) return;

    const tags = formData.tags.split(',').map(t => t.trim()).filter(Boolean);
    const effectiveDate = formData.effectiveDate || new Date().toISOString().split('T')[0];
    const reviewDate = formData.reviewDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const sopData: Partial<SOP> = {
      title: formData.title,
      titleEn: formData.titleEn,
      code: formData.code,
      description: formData.description,
      descriptionEn: formData.descriptionEn,
      department: formData.department,
      category: formData.category,
      pdfUrl: formData.pdfUrl,
      version: formData.version,
      status: formData.status,
      effectiveDate,
      reviewDate,
      tags,
      duration: formData.duration,
      isMandatory: formData.isMandatory,
      content: formData.content,
      coverImage: formData.coverImageUrl ? { url: formData.coverImageUrl } : undefined,
      sections: formData.sections,
    };

    await onSave(sopData);
  };

  const addSection = () => {
    const newSection: SOPSection = {
      id: generateSectionId(),
      title: `قسم جديد ${formData.sections.length + 1}`,
      order: formData.sections.length,
      content: EMPTY_CONTENT,
      duration: '10 دقائق',
      isRequired: true,
    };
    updateField('sections', [...formData.sections, newSection]);
  };

  const removeSection = (sectionId: string) => {
    updateField('sections', formData.sections.filter(s => s.id !== sectionId).map((s, i) => ({ ...s, order: i })));
  };

  const updateSection = (sectionId: string, data: Partial<SOPSection>) => {
    updateField('sections', formData.sections.map(s => s.id === sectionId ? { ...s, ...data } : s));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-start justify-center p-4 pt-8 overflow-y-auto">
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-l from-indigo-600 to-violet-700 p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
                <FileText size={24} className="text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold">{editingSop ? 'تعديل SOP' : 'إضافة SOP جديد'}</h3>
                <p className="text-indigo-200 text-sm mt-0.5">
                  {editingSop ? 'تحديث بيانات ومحتوى إجراء التشغيل القياسي' : 'إنشاء إجراء تشغيل قياسي بمحتوى غني'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 px-6 bg-slate-50 border-b border-slate-200 overflow-x-auto">
          {[
            { id: 'basic' as const, label: 'المعلومات الأساسية', icon: Info },
            { id: 'content' as const, label: 'المحتوى الغني', icon: Layers },
            { id: 'sections' as const, label: 'الأقسام', icon: BookOpen },
            { id: 'attachments' as const, label: 'المرفقات', icon: FileText },
          ].map(tab => {
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600 bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <TabIcon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="max-h-[65vh] overflow-y-auto p-6 space-y-6">
          {/* Basic Info Tab */}
          {activeTab === 'basic' && (
            <div className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="عنوان SOP (عربي)" required>
                  <Input value={formData.title} onChange={v => updateField('title', v)} placeholder="مثال: إجراءات تشغيل خط الإنتاج" />
                </Field>
                <Field label="عنوان SOP (English)">
                  <Input value={formData.titleEn} onChange={v => updateField('titleEn', v)} placeholder="Example: Production Line SOP" dir="ltr" />
                </Field>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="كود SOP" required>
                  <Input value={formData.code} onChange={v => updateField('code', v)} placeholder="مثال: SOP-MFG-001" dir="ltr" />
                </Field>
                <Field label="رقم الإصدار">
                  <Input value={formData.version} onChange={v => updateField('version', v)} placeholder="1.0" dir="ltr" />
                </Field>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="الوصف (عربي)">
                  <Textarea value={formData.description} onChange={v => updateField('description', v)} placeholder="وصف الإجراء..." />
                </Field>
                <Field label="الوصف (English)">
                  <Textarea value={formData.descriptionEn} onChange={v => updateField('descriptionEn', v)} placeholder="Procedure description..." dir="ltr" />
                </Field>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="القسم">
                  <Select
                    value={formData.department}
                    onChange={v => updateField('department', v)}
                    options={SOP_DEPARTMENTS.map(d => ({ value: d.key, label: d.nameAr }))}
                  />
                </Field>
                <Field label="التصنيف">
                  <Select
                    value={formData.category}
                    onChange={v => updateField('category', v)}
                    options={SOP_CATEGORIES.map(c => ({ value: c.nameAr, label: c.nameAr }))}
                    placeholder="اختر التصنيف..."
                  />
                </Field>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="رابط PDF (اختياري)">
                  <Input value={formData.pdfUrl} onChange={v => updateField('pdfUrl', v)} placeholder="https://..." dir="ltr" />
                </Field>
                <Field label="صورة الغلاف (رابط)">
                  <Input value={formData.coverImageUrl} onChange={v => updateField('coverImageUrl', v)} placeholder="https://..." dir="ltr" />
                </Field>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="تاريخ التفعيل">
                  <Input value={formData.effectiveDate} onChange={v => updateField('effectiveDate', v)} type="date" />
                </Field>
                <Field label="تاريخ المراجعة القادم">
                  <Input value={formData.reviewDate} onChange={v => updateField('reviewDate', v)} type="date" />
                </Field>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="المدة المقدرة (بالدقائق)">
                  <Input value={formData.duration} onChange={v => updateField('duration', v)} type="number" dir="ltr" />
                </Field>
                <Field label="الكلمات الدلالية">
                  <Input value={formData.tags} onChange={v => updateField('tags', v)} placeholder="HR, management, quality" dir="ltr" />
                </Field>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="الحالة">
                  <Select
                    value={formData.status}
                    onChange={v => updateField('status', v as SOPStatus)}
                    options={[
                      { value: 'active', label: 'نشط' },
                      { value: 'inactive', label: 'غير نشط' },
                      { value: 'draft', label: 'مسودة' },
                    ]}
                  />
                </Field>
                <div className="pt-6">
                  <Toggle
                    checked={formData.isMandatory}
                    onChange={v => updateField('isMandatory', v)}
                    label={formData.isMandatory ? 'إلزامي للموظفين' : 'اختياري'}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Content Tab */}
          {activeTab === 'content' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-indigo-50 to-violet-50 rounded-2xl p-4 border border-indigo-100">
                <div className="flex items-center gap-3">
                  <Layers size={20} className="text-indigo-600" />
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm">المحتوى الغني لـ SOP</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      أضف نصوص، صور، فيديوهات، ملفات صوتية، جداول، وقوائم
                    </p>
                  </div>
                </div>
              </div>
              <RichContentEditor
                value={formData.content}
                onChange={c => updateField('content', c)}
                placeholder="ابدأ بإضافة محتوى SOP هنا..."
                maxHeight="500px"
              />
            </div>
          )}

          {/* Sections Tab */}
          {activeTab === 'sections' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen size={18} className="text-indigo-600" />
                  <h4 className="font-bold text-slate-800">أقسام SOP ({formData.sections.length})</h4>
                </div>
                <button
                  onClick={addSection}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-xs font-bold hover:bg-indigo-600 transition-all"
                >
                  <Plus size={14} /> إضافة قسم
                </button>
              </div>

              {formData.sections.length === 0 && (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                  <BookOpen size={40} className="mx-auto mb-3 text-slate-300" />
                  <p className="text-slate-500 font-medium text-sm">لم يتم إضافة أقسام بعد</p>
                  <p className="text-slate-400 text-xs mt-1">الأقسام تسمح بتنظيم محتوى SOP في أجزاء منفصلة</p>
                </div>
              )}

              <div className="space-y-4">
                {formData.sections.map((section, index) => (
                  <div key={section.id} className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden hover:border-indigo-200 transition-all">
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
                      <div className="flex items-center gap-3">
                        <span className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">
                          {index + 1}
                        </span>
                        <input
                          value={section.title}
                          onChange={e => updateSection(section.id, { title: e.target.value })}
                          className="font-bold text-slate-700 text-sm bg-transparent border-none outline-none"
                          placeholder="عنوان القسم..."
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          value={section.duration || ''}
                          onChange={e => updateSection(section.id, { duration: e.target.value })}
                          className="w-20 px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg text-slate-600 outline-none"
                          placeholder="المدة"
                        />
                        <button
                          onClick={() => updateSection(section.id, { isRequired: !section.isRequired })}
                          className={`px-2 py-1 text-xs font-bold rounded-lg transition-all ${
                            section.isRequired
                              ? 'bg-rose-50 text-rose-600'
                              : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {section.isRequired ? 'إلزامي' : 'اختياري'}
                        </button>
                        <button
                          onClick={() => removeSection(section.id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    <div className="p-4">
                      <RichContentEditor
                        value={typeof section.content === 'string' ? EMPTY_CONTENT : section.content}
                        onChange={c => updateSection(section.id, { content: c })}
                        placeholder={`محتوى القسم: ${section.title}`}
                        maxHeight="300px"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Attachments Tab */}
          {activeTab === 'attachments' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-4 border border-amber-100">
                <div className="flex items-center gap-3">
                  <FileText size={20} className="text-amber-600" />
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm">المرفقات والملفات الإضافية</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      أضف ملفات PDF أو مستندات أو صور إضافية مرتبطة بـ SOP
                    </p>
                  </div>
                </div>
              </div>
              <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                <Upload size={40} className="mx-auto mb-3 text-slate-300" />
                <p className="text-slate-500 font-medium text-sm">اسحب وأفلت الملفات هنا أو اضغط للرفع</p>
                <p className="text-slate-400 text-xs mt-1">PDF, DOC, XLS, PPT, TXT - حد أقصى 50MB</p>
                <button className="mt-4 px-5 py-2 bg-indigo-500 text-white rounded-xl text-sm font-bold hover:bg-indigo-600 transition-all">
                  <Upload size={16} className="inline ml-1" /> رفع ملفات
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {formData.content.blocks.length > 0 && (
              <span>{formData.content.blocks.length} كتلة محتوى</span>
            )}
            {formData.sections.length > 0 && (
              <span className="mr-4">{formData.sections.length} قسم</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 border-2 border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-white transition-all"
            >
              إلغاء
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !formData.title || !formData.code}
              className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${
                saving || !formData.title || !formData.code
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-l from-indigo-600 to-indigo-500 text-white shadow-lg hover:-translate-y-0.5 hover:shadow-xl'
              }`}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? 'حفظ...' : editingSop ? 'تحديث SOP' : 'إضافة SOP'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helper Components ──
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
        {label}
        {required && <span className="text-red-400 text-xs">*</span>}
      </label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, dir = 'rtl', type = 'text', className = '' }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; dir?: 'rtl' | 'ltr'; type?: string; className?: string;
}) {
  return (
    <input
      type={type} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} dir={dir}
      className={`w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all placeholder:text-slate-300 ${className}`}
    />
  );
}

function Textarea({ value, onChange, placeholder, dir = 'rtl', rows = 3 }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; dir?: 'rtl' | 'ltr'; rows?: number;
}) {
  return (
    <textarea
      value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} dir={dir} rows={rows}
      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all placeholder:text-slate-300 resize-none"
    />
  );
}

function Select({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; placeholder?: string;
}) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)}
      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div onClick={() => onChange(!checked)}
      className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all select-none ${
        checked ? 'border-indigo-300 bg-indigo-50/60' : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <p className="font-bold text-slate-800 text-sm">{label}</p>
      <div className={`relative w-12 h-6 rounded-full transition-all duration-300 shrink-0 mr-4 ${checked ? 'bg-indigo-500' : 'bg-slate-200'}`}>
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300 ${checked ? 'right-1' : 'left-1'}`} />
      </div>
    </div>
  );
}