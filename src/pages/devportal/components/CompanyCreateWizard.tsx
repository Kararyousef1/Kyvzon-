/**
 * CompanyCreateWizard — معالج إنشاء شركة + حساب إداري أولي من 3 خطوات
 * يعالج مشكلة "شركة بلا حساب" التي أشار لها المستخدم
 */

import { useState } from 'react';
import { X, Building2, UserPlus, Check, Eye, Copy, RefreshCw, ArrowLeft, ArrowRight } from 'lucide-react';
import { useUIStore } from '../../../core/stores';
import { companiesApi } from '../services/api';
import type { Company } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function CompanyCreateWizard({ open, onClose, onCreated }: Props) {
  const { addToast } = useUIStore();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<any>(null);

  const [companyForm, setCompanyForm] = useState({
    name_ar: '',
    name_en: '',
    slug: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    subscription_plan: 'basic' as any,
    max_employees: 50,
    notes: '',
  });

  const [adminForm, setAdminForm] = useState({
    email: '',
    full_name: '',
    password: '',
    confirmPassword: '',
  });

  const updateCompany = (k: string, v: any) => setCompanyForm(f => ({ ...f, [k]: v }));
  const updateAdmin = (k: string, v: any) => setAdminForm(f => ({ ...f, [k]: v }));

  // توليد كلمة مرور عشوائية
  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let pwd = '';
    for (let i = 0; i < 12; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    updateAdmin('password', pwd);
    updateAdmin('confirmPassword', pwd);
  };

  const handleCreate = async () => {
    if (!companyForm.name_ar.trim() || !companyForm.slug.trim()) {
      addToast('يرجى إدخال اسم الشركة والمعرف', 'error');
      return;
    }
    if (!adminForm.email.trim() || !adminForm.full_name.trim() || adminForm.password.length < 8) {
      addToast('يرجى ملء بيانات الحساب الإداري وكلمة مرور 8 أحرف', 'error');
      return;
    }
    if (adminForm.password !== adminForm.confirmPassword) {
      addToast('كلمة المرور غير متطابقة', 'error');
      return;
    }

    setSaving(true);
    try {
      // استدعاء API الجديد الذي ينشئ شركة + admin ذرياً
      const res = await companiesApi.createWithInitialAdmin({
        name_ar: companyForm.name_ar,
        name_en: companyForm.name_en,
        slug: companyForm.slug.toLowerCase().replace(/\s+/g, '-'),
        contact_name: companyForm.contact_name,
        contact_email: companyForm.contact_email,
        contact_phone: companyForm.contact_phone,
        subscription_plan: companyForm.subscription_plan,
        max_employees: companyForm.max_employees,
        notes: companyForm.notes,
        admin_email: adminForm.email,
        admin_password: adminForm.password,
        admin_full_name: adminForm.full_name,
      } as any);

      setResult(res);
      setStep(3);
      addToast(`تم إنشاء الشركة ${companyForm.name_ar} مع حساب إداري ${adminForm.email}`, 'success');
    } catch (err: any) {
      addToast(`فشل: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const resetAndClose = () => {
    setStep(1);
    setCompanyForm({ name_ar: '', name_en: '', slug: '', contact_name: '', contact_email: '', contact_phone: '', subscription_plan: 'basic', max_employees: 50, notes: '' });
    setAdminForm({ email: '', full_name: '', password: '', confirmPassword: '' });
    setResult(null);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-gray-200 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header with steps */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <Building2 size={20} className="text-cyan-600" />
              {step === 1 && 'إضافة شركة جديدة — الخطوة 1: معلومات الشركة'}
              {step === 2 && 'إضافة شركة جديدة — الخطوة 2: الحساب الإداري الأولي'}
              {step === 3 && 'تم الإنشاء بنجاح — الخطوة 3: المراجعة'}
            </h3>
            <button onClick={resetAndClose} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center"><X size={16} /></button>
          </div>
          <div className="flex items-center gap-2 mt-4">
            {[1,2,3].map(s => (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${step >= s ? 'bg-cyan-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{s}</div>
                <div className={`flex-1 h-1 rounded-full ${step > s ? 'bg-cyan-600' : 'bg-slate-200'}`} />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 mt-2">
            <span>معلومات الشركة</span>
            <span>الحساب الإداري</span>
            <span>المراجعة</span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {step === 1 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">اسم الشركة بالعربية *</label>
                  <input value={companyForm.name_ar} onChange={e => updateCompany('name_ar', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm" placeholder="شركة التقنية" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">اسم الشركة بالإنجليزية</label>
                  <input value={companyForm.name_en} onChange={e => updateCompany('name_en', e.target.value)} className="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm text-left" dir="ltr" placeholder="Tech Company" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">المعرف (Slug) * — يستخدم في الرابط</label>
                <input value={companyForm.slug} onChange={e => updateCompany('slug', e.target.value.toLowerCase().replace(/\s+/g,'-'))} className="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm font-mono text-left" dir="ltr" placeholder="company-slug" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs font-bold text-slate-500 mb-1 block">جهة الاتصال</label><input value={companyForm.contact_name} onChange={e => updateCompany('contact_name', e.target.value)} className="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm" /></div>
                <div><label className="text-xs font-bold text-slate-500 mb-1 block">البريد</label><input type="email" value={companyForm.contact_email} onChange={e => updateCompany('contact_email', e.target.value)} className="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm text-left" dir="ltr" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs font-bold text-slate-500 mb-1 block">الهاتف</label><input value={companyForm.contact_phone} onChange={e => updateCompany('contact_phone', e.target.value)} className="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm text-left" dir="ltr" /></div>
                <div><label className="text-xs font-bold text-slate-500 mb-1 block">الخطة</label><select value={companyForm.subscription_plan} onChange={e => updateCompany('subscription_plan', e.target.value)} className="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm"><option value="basic">أساسي — 250$</option><option value="professional">احترافي — 750$</option><option value="enterprise">مؤسسي — 2000$</option><option value="custom">مخصص</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs font-bold text-slate-500 mb-1 block">حد الموظفين</label><input type="number" value={companyForm.max_employees} onChange={e => updateCompany('max_employees', Number(e.target.value))} className="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm" /></div>
                <div><label className="text-xs font-bold text-slate-500 mb-1 block">ملاحظات</label><input value={companyForm.notes} onChange={e => updateCompany('notes', e.target.value)} className="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm" placeholder="ملاحظات داخلية" /></div>
              </div>
              <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-3 text-xs text-cyan-800">
                سيتم إنشاء الشركة ذرياً عبر RPC 0142: tenant + subscription + legal_entity DEFAULT + audit — ثم في الخطوة التالية ننشئ الحساب الإداري الأولي
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <h4 className="font-black text-sm text-amber-900 flex items-center gap-2"><UserPlus size={16} />الحساب الإداري الأولي لهذه الشركة</h4>
                <p className="text-xs text-amber-700 mt-1 leading-relaxed">هذا الحساب سيكون admin للشركة الجديدة ويستطيع إضافة باقي المستخدمين من بوابة الإدارة /app/admin/employees وإنشاء حسابات مالية. بدون هذا الحساب، الشركة ستكون بلا دخول — هذه هي المشكلة التي أشرت لها.</p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">البريد الإلكتروني للإداري *</label>
                <input type="email" value={adminForm.email} onChange={e => updateAdmin('email', e.target.value)} className="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm text-left" dir="ltr" placeholder="admin@company.com" />
                <p className="text-[11px] text-slate-400 mt-1">يفضل أن يكون بريد الشركة الجديد، ليس بريدك الشخصي</p>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">الاسم الكامل للإداري *</label>
                <input value={adminForm.full_name} onChange={e => updateAdmin('full_name', e.target.value)} className="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm" placeholder="أحمد محمد — مدير النظام" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">كلمة المرور *</label>
                  <input type="password" value={adminForm.password} onChange={e => updateAdmin('password', e.target.value)} className="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm" placeholder="8 أحرف على الأقل" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">تأكيد كلمة المرور *</label>
                  <input type="password" value={adminForm.confirmPassword} onChange={e => updateAdmin('confirmPassword', e.target.value)} className="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm" />
                </div>
              </div>
              <button type="button" onClick={generatePassword} className="text-xs text-cyan-600 font-bold flex items-center gap-1"><RefreshCw size={12} />توليد كلمة مرور قوية تلقائياً</button>

              <div className="bg-slate-900 text-slate-100 rounded-xl p-3 font-mono text-xs">
                <p>سيتم استدعاء:</p>
                <p className="text-cyan-300">1) provision_tenant_atomic(name_ar, slug, admin_email) → tenant_id, legal_entity_id</p>
                <p className="text-emerald-300">2) admin-create-user(target_tenant_id: new tenant, email, password, role=admin) → user_id + entity_membership entity_admin</p>
              </div>
            </>
          )}

          {step === 3 && result && (
            <>
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
                <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-3"><Check size={28} className="text-white" /></div>
                <h3 className="font-black text-lg text-emerald-900">تم إنشاء الشركة + الحساب بنجاح ✅</h3>
                <p className="text-sm text-emerald-700 mt-1">الشركة الآن لديها حساب إداري أولي يستطيع تسجيل الدخول وإضافة المستخدمين</p>
              </div>

              <div className="space-y-3">
                <h4 className="font-black text-sm">المعرفات المهمة (مع نسخ)</h4>
                <div className="bg-slate-50 border rounded-xl p-3 space-y-2 font-mono text-xs">
                  <div className="flex justify-between items-center"><span>Company ID:</span><span className="flex items-center gap-2">{result.provision?.tenant_id?.slice(0,12)}... <button onClick={() => navigator.clipboard.writeText(result.provision?.tenant_id)} className="p-1 bg-white border rounded-lg"><Copy size={12} /></button></span></div>
                  <div className="flex justify-between items-center"><span>Slug:</span><span className="flex items-center gap-2">{result.provision?.slug} <button onClick={() => navigator.clipboard.writeText(result.provision?.slug)} className="p-1 bg-white border rounded-lg"><Copy size={12} /></button></span></div>
                  <div className="flex justify-between items-center"><span>Legal Entity DEFAULT ID:</span><span className="flex items-center gap-2">{result.provision?.legal_entity_id?.slice(0,12)}... <button onClick={() => navigator.clipboard.writeText(result.provision?.legal_entity_id)} className="p-1 bg-white border rounded-lg"><Copy size={12} /></button></span></div>
                  <div className="flex justify-between items-center"><span>Admin Email:</span><span className="flex items-center gap-2">{adminForm.email} <button onClick={() => navigator.clipboard.writeText(adminForm.email)} className="p-1 bg-white border rounded-lg"><Copy size={12} /></button></span></div>
                  <div className="flex justify-between items-center"><span>Login URL:</span><span className="text-[10px]">/login</span></div>
                </div>

                {result.warning && <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">{result.warning}</div>}

                <div className="bg-slate-900 text-slate-100 rounded-xl p-4 text-xs">
                  <p className="font-bold">الخطوة التالية للعميل:</p>
                  <p className="mt-2">1. يذهب إلى /login</p>
                  <p>2. يسجل دخول بـ {adminForm.email}</p>
                  <p>3. يذهب إلى /app/admin/employees لإضافة موظفين</p>
                  <p>4. في تبويب Finance Access يعين أدوار مالية (accountant, finance_manager...)</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-slate-50 flex gap-3">
          {step === 1 && (
            <>
              <button onClick={resetAndClose} className="flex-1 px-4 py-2.5 rounded-xl bg-white border text-sm font-bold">إلغاء</button>
              <button onClick={() => setStep(2)} disabled={!companyForm.name_ar.trim() || !companyForm.slug.trim()} className="flex-1 px-4 py-2.5 rounded-xl bg-cyan-600 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">التالي: الحساب الإداري <ArrowRight size={14} /></button>
            </>
          )}
          {step === 2 && (
            <>
              <button onClick={() => setStep(1)} className="flex-1 px-4 py-2.5 rounded-xl bg-white border text-sm font-bold flex items-center justify-center gap-2"><ArrowLeft size={14} />رجوع</button>
              <button onClick={handleCreate} disabled={saving} className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold text-sm disabled:opacity-50">{saving ? 'جاري الإنشاء...' : 'إنشاء الشركة + الحساب'}</button>
            </>
          )}
          {step === 3 && (
            <>
              <button onClick={resetAndClose} className="flex-1 px-4 py-2.5 rounded-xl bg-white border text-sm font-bold">إغلاق</button>
              <button onClick={() => { onCreated(); resetAndClose(); }} className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm">تم — تحديث القائمة</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
