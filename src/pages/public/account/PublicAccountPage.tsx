import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, LogOut, ShieldCheck, Trash2, User, XCircle } from 'lucide-react';
import { authService, publicSignupService } from '../../../services/sdk';
import '../landing/styles.css';

interface AccountInfo { id: string; email: string; metadata: Record<string, unknown>; emailConfirmedAt?: string }

export default function PublicAccountPage() {
  const navigate = useNavigate();
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    authService.getCurrentUserDetails()
      .then((u) => { if (!u) navigate('/signup', { replace: true }); else setAccount(u); })
      .finally(() => setLoading(false));
  }, [navigate]);

  const requestDeletion = async () => {
    if (!account) return;
    await publicSignupService.createRequest({
      email: account.email,
      full_name: String(account.metadata.full_name || account.email),
      phone: String(account.metadata.phone || ''),
      country: String(account.metadata.country || ''),
      governorate: String(account.metadata.governorate || ''),
      intent_type: 'general',
      metadata: { account_action: 'delete_account_requested' },
    });
    setMessage('تم تسجيل طلب حذف الحساب. سيتواصل معك فريق KYVZON لإكمال الإجراء بأمان.');
  };

  const logout = async () => { await authService.logout(); navigate('/', { replace: true }); };

  if (loading) return <div className="kv-root min-h-screen flex items-center justify-center text-white">جاري التحميل...</div>;
  if (!account) return null;

  return (
    <div className="kv-root min-h-screen hero-grid p-4 md:p-8" dir="rtl">
      <div className="max-w-5xl mx-auto pt-20">
        <div className="flex items-center justify-between gap-4 mb-8">
          <button onClick={() => navigate('/')} className="btn-outline py-2 px-4">العودة للرئيسية</button>
          <button onClick={logout} className="btn-outline py-2 px-4"><LogOut size={15}/> تسجيل الخروج</button>
        </div>

        <div className="glass-dark rounded-3xl p-6 md:p-8 border border-white/10">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-200"><User size={30}/></div>
            <div>
              <h1 className="text-2xl font-black text-white">بروفايل حسابك</h1>
              <p className="text-white/55 text-sm">حساب زائر / عميل محتمل في موقع KYVZON</p>
            </div>
          </div>

          {message && <div className="mb-6 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div>}

          <div className="grid md:grid-cols-2 gap-5">
            <Info label="الاسم" value={String(account.metadata.full_name || '—')} />
            <Info label="البريد" value={account.email} />
            <Info label="الهاتف" value={String(account.metadata.phone || '—')} />
            <Info label="الدولة" value={String(account.metadata.country || '—')} />
            <Info label="المحافظة" value={String(account.metadata.governorate || '—')} />
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
              <div className="text-xs text-white/45 mb-2">توثيق الحساب</div>
              {account.emailConfirmedAt ? <div className="flex items-center gap-2 text-emerald-300 font-bold"><CheckCircle size={17}/> البريد موثق</div> : <div className="flex items-center gap-2 text-amber-300 font-bold"><XCircle size={17}/> البريد غير موثق</div>}
            </div>
          </div>

          <div className="mt-8 grid md:grid-cols-2 gap-4">
            <button onClick={() => navigate('/signup?intent=review')} className="btn-primary justify-center"><ShieldCheck size={16}/> إضافة تقييم أو طلب جديد</button>
            <button onClick={requestDeletion} className="btn-outline justify-center border-red-400/30 text-red-200 hover:bg-red-500/10"><Trash2 size={16}/> طلب حذف الحساب</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4"><div className="text-xs text-white/45 mb-2">{label}</div><div className="text-white font-bold">{value}</div></div>;
}
