/**
 * CompanyDetailDrawer — تفاصيل شركة احترافية مع 7 Tabs و IDs مع نسخ
 * يعالج مشكلة "تفاصيل الشركة ناقصة" التي أشار لها المستخدم
 */

import { useState, useEffect, useCallback } from 'react';
import { X, Copy, Check, Building2, Users, Landmark, CreditCard, Layers, FileText, Shield, Clock, Mail, Phone, Globe, Calendar, Hash, Key, UserPlus, Building, Ban, Unlock, Eye } from 'lucide-react';
import type { Company } from '../types';
import { companiesApi, subscriptionsApi, auditApi, statsApi } from '../services/api';
import { tenantService } from '../../../services/sdk/TenantService';
import { useUIStore } from '../../../core/stores';
import { getErrorMessage } from '../../../services/errors';

interface Props {
  company: Company | null;
  onClose: () => void;
  onEdit: (c: Company) => void;
  onCreateAdmin: (c: Company) => void;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-mono transition"
      title="نسخ"
    >
      {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
      {copied ? 'تم النسخ' : 'نسخ'}
    </button>
  );
}

function Detail({ label, value, copyValue }: { label: string; value: React.ReactNode; copyValue?: string }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-slate-900 font-medium truncate">{value}</div>
        {copyValue && <CopyButton value={copyValue} />}
      </div>
    </div>
  );
}

export default function CompanyDetailDrawer({ company: c, onClose, onEdit, onCreateAdmin }: Props) {
  const { addToast } = useUIStore();
  const [activeTab, setActiveTab] = useState<'overview'|'users'|'legal'|'subs'|'modules'|'audit'|'actions'>('overview');
  const [users, setUsers] = useState<any[]>([]);
  const [legalEntities, setLegalEntities] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [modules, setModules] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadDetails = useCallback(async () => {
    if (!c?.id) return;
    setLoading(true);
    try {
      const [usersRes, entitiesRes, subsRes, auditRes, statsRes] = await Promise.all([
        tenantService.getCompanyUsers(c.id),
        tenantService.getCompanyLegalEntities(c.id),
        subscriptionsApi.getByCompany(c.id).catch(() => []),
        tenantService.getCompanyAuditLogs(c.id),
        companiesApi.getStats(c.id).catch(() => null),
      ]);
      setUsers(usersRes);
      setLegalEntities(entitiesRes);
      setSubscriptions(subsRes as any[] || []);
      setAuditLogs(auditRes);
      setStats(statsRes);
    } catch (err) {
      console.warn('Failed to load company details:', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [c?.id]);

  useEffect(() => { void loadDetails(); }, [loadDetails]);

  if (!c) return null;

  const tabs = [
    { key: 'overview', label: 'نظرة عامة', icon: Building2 },
    { key: 'users', label: `المستخدمون (${users.length})`, icon: Users },
    { key: 'legal', label: `الكيانات (${legalEntities.length})`, icon: Landmark },
    { key: 'subs', label: `الاشتراكات (${subscriptions.length})`, icon: CreditCard },
    { key: 'modules', label: 'البوابات', icon: Layers },
    { key: 'audit', label: `التدقيق (${auditLogs.length})`, icon: FileText },
    { key: 'actions', label: 'إجراءات', icon: Shield },
  ] as const;

  return (
    <div className="fixed inset-0 z-[250] flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-[700px] h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-black text-xl shadow-lg">
              {c.name_ar?.charAt(0) || 'K'}
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">{c.name_ar}</h2>
              <p className="text-sm text-slate-500 font-mono flex items-center gap-2">{c.slug} <CopyButton value={c.slug} /></p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { onClose(); onEdit(c); }} className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50">تعديل</button>
            <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center"><X size={18} /></button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-2 bg-slate-50 border-b border-slate-200 overflow-x-auto">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key as any)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${activeTab===t.key ? 'bg-white shadow-sm border border-slate-200 text-cyan-600' : 'text-slate-500 hover:text-slate-700 hover:bg-white'}`}
              >
                <Icon size={14} />{t.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'overview' && (
            <>
              {/* IDs with copy */}
              <div className="space-y-3">
                <h3 className="font-black text-slate-900 flex items-center gap-2"><Hash size={16} /> المعرفات الفريدة (مهمة للدعم الفني) <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-1 rounded-full">IDs مع نسخ</span></h3>
                <div className="grid grid-cols-1 gap-3">
                  <Detail label="Company ID (tenants.id) — المعرف الأساسي" value={<span className="font-mono text-xs break-all">{c.id}</span>} copyValue={c.id} />
                  <Detail label="Slug (المعرف النصي)" value={<span className="font-mono">{c.slug}</span>} copyValue={c.slug} />
                  <Detail label="Default Legal Entity ID" value={<span className="font-mono text-xs">{(c as any).default_legal_entity_id || legalEntities.find(e=>e.code==='DEFAULT')?.id || '— لم ينشأ بعد — سيُنشأ عند أول تموين ذري'}</span>} copyValue={legalEntities.find(e=>e.code==='DEFAULT')?.id || ''} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Detail label="الحالة" value={<span className={`px-2 py-1 rounded-full text-xs font-bold border ${c.status==='active' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200'}`}>{c.status}</span>} />
                <Detail label="الخطة" value={c.subscription_plan} />
                <Detail label="البريد" value={c.contact_email || '—'} copyValue={c.contact_email} />
                <Detail label="الهاتف" value={c.contact_phone || '—'} copyValue={c.contact_phone} />
                <Detail label="جهة الاتصال" value={c.contact_name || '—'} />
                <Detail label="الحد الأقصى موظفين" value={`${c.max_employees} موظف`} />
                <Detail label="تاريخ الإنشاء" value={c.created_at ? new Date(c.created_at).toLocaleString('ar-EG') : '—'} />
                <Detail label="انتهاء الاشتراك" value={c.subscription_end_date ? new Date(c.subscription_end_date).toLocaleDateString('ar-EG') : '—'} />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gradient-to-br from-cyan-50 to-blue-50 border border-cyan-200 rounded-2xl p-4"><Users size={20} className="text-cyan-600 mb-2" /><p className="text-2xl font-black">{users.length}</p><p className="text-xs text-slate-500">مستخدم</p></div>
                <div className="bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-200 rounded-2xl p-4"><Landmark size={20} className="text-violet-600 mb-2" /><p className="text-2xl font-black">{legalEntities.length}</p><p className="text-xs text-slate-500">كيان قانوني</p></div>
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-4"><FileText size={20} className="text-emerald-600 mb-2" /><p className="text-2xl font-black">{stats?.total_users || users.length}</p><p className="text-xs text-slate-500">إجمالي</p></div>
              </div>

              {c.notes && <div className="bg-slate-50 border border-slate-200 rounded-xl p-4"><p className="text-xs font-bold text-slate-500 mb-1">ملاحظات</p><p className="text-sm text-slate-700">{c.notes}</p></div>}
            </>
          )}

          {activeTab === 'users' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center"><h3 className="font-black">المستخدمون (أول 10)</h3><button onClick={() => onCreateAdmin(c)} className="px-3 py-2 bg-cyan-600 text-white rounded-xl text-xs font-bold flex items-center gap-1"><UserPlus size={14} />إنشاء حساب إداري أولي</button></div>
              {users.length===0 ? <div className="text-center py-12 text-slate-400">لا يوجد مستخدمون — هذه هي مشكلة "شركة بلا حساب" — اضغط إنشاء حساب إداري أولي</div> : (
                <div className="space-y-2">
                  {users.map((u:any) => (
                    <div key={u.id} className="flex items-center justify-between p-3 bg-white border rounded-xl">
                      <div><p className="font-bold text-sm">{u.full_name}</p><p className="text-xs text-slate-500 font-mono">{u.email} • {u.role}</p></div>
                      <span className={`text-xs px-2 py-1 rounded-full border ${u.status==='active' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-100'}`}>{u.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'legal' && (
            <div className="space-y-3">
              <h3 className="font-black flex items-center gap-2"><Landmark size={16} /> الكيانات القانونية</h3>
              {legalEntities.length===0 ? <div className="text-center py-12 text-slate-400">لا توجد كيانات — سيُنشأ DEFAULT عند أول تموين ذري (0142)</div> : (
                <div className="space-y-2">
                  {legalEntities.map((e:any) => (
                    <div key={e.id} className="p-4 bg-white border rounded-xl flex justify-between items-center">
                      <div><p className="font-mono font-bold text-sm">{e.code}</p><p className="font-bold">{e.name_ar}</p><p className="text-xs text-slate-500">{e.base_currency_code} • {e.status}</p></div>
                      <CopyButton value={e.id} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'subs' && (
            <div className="space-y-3">
              <h3 className="font-black">الاشتراكات</h3>
              <div className="space-y-2">
                {subscriptions.map((s:any) => (
                  <div key={s.id} className="p-4 bg-white border rounded-xl">
                    <div className="flex justify-between"><span className="font-bold">{s.plan}</span><span className={`text-xs px-2 py-1 rounded-full border ${s.status==='active' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50'}`}>{s.status}</span></div>
                    <p className="text-xs text-slate-500 mt-2">من {s.start_date} إلى {s.end_date} • {s.amount} {s.currency}</p>
                    <p className="text-xs font-mono mt-1">ID: {s.id.slice(0,8)}... <CopyButton value={s.id} /></p>
                  </div>
                ))}
                {!subscriptions.length && <p className="text-center text-slate-400 py-8">لا توجد اشتراكات إضافية</p>}
              </div>
            </div>
          )}

          {activeTab === 'modules' && (
            <div className="space-y-3">
              <h3 className="font-black flex items-center gap-2"><Layers size={16} /> البوابات المفعلة</h3>
              <p className="text-xs text-slate-500">هذه البوابات مأخوذة من tenant_modules — المصدر الحقيقي لـ RequireModule guard</p>
              <div className="text-center py-12 text-slate-400">سيتم تحميلها من ModulesPage — استخدم زر إدارة البوابات</div>
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="space-y-3">
              <h3 className="font-black flex items-center gap-2"><Clock size={16} /> سجل التدقيق للشركة</h3>
              <div className="space-y-2">
                {auditLogs.map((log:any) => (
                  <div key={log.id} className="p-3 bg-slate-50 border rounded-xl">
                    <p className="font-bold text-sm">{log.action}</p>
                    <p className="text-xs text-slate-500">{log.actor_name || 'النظام'} • {log.created_at ? new Date(log.created_at).toLocaleString('ar-EG') : ''}</p>
                    <p className="text-xs text-slate-600 mt-1">{log.description || ''}</p>
                  </div>
                ))}
                {!auditLogs.length && <p className="text-center text-slate-400 py-8">لا توجد سجلات تدقيق</p>}
              </div>
            </div>
          )}

          {activeTab === 'actions' && (
            <div className="space-y-3">
              <h3 className="font-black flex items-center gap-2"><Shield size={16} /> إجراءات احترافية</h3>
              <div className="grid gap-3">
                <button onClick={() => onCreateAdmin(c)} className="w-full p-4 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2"><UserPlus size={16} />إنشاء حساب إداري أولي (يحل مشكلة شركة بلا حساب)</button>
                <button className="w-full p-4 bg-white border border-slate-200 rounded-xl font-bold text-sm flex items-center justify-center gap-2"><Users size={16} />إنشاء حساب مالي (accountant / finance_manager)</button>
                <button className="w-full p-4 bg-white border border-amber-200 text-amber-700 rounded-xl font-bold text-sm flex items-center justify-center gap-2"><Ban size={16} />تعليق الشركة</button>
                <button className="w-full p-4 bg-white border border-emerald-200 text-emerald-700 rounded-xl font-bold text-sm flex items-center justify-center gap-2"><Eye size={16} />فتح في Supabase Dashboard (نسخ ID)</button>
              </div>
              <div className="bg-slate-900 text-slate-100 rounded-xl p-4 font-mono text-xs space-y-2">
                <p>Company ID: {c.id}</p>
                <p>Slug: {c.slug}</p>
                <p>Legal Entity DEFAULT ID: {legalEntities.find(e=>e.code==='DEFAULT')?.id || '—'}</p>
                <p className="text-[10px] text-slate-400">انسخ هذه المعرفات للدعم الفني أو للـ Edge Function target_tenant_id</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-sm">إغلاق</button>
          <button onClick={() => { onClose(); onEdit(c); }} className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold text-sm">تعديل</button>
        </div>
      </div>
    </div>
  );
}
