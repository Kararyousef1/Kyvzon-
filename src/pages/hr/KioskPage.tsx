/**
 * ════════════════════════════════════════════════════════════════
 *  KioskPage — بوابة الحارس (أُعيد توصيلها في 0347)
 * ════════════════════════════════════════════════════════════════
 *
 *  ★★★ ما كان قبل 0347 — أعطال مُثبتة تشغيلياً على Postgres:
 *
 *  ① الصفحة **الكاتب الوحيد** لـattendance_logs، وكانت تُدرج بلا
 *    `punch_type` ولا `shift_type`. والعمود `DEFAULT 'check-in'`
 *    ⇒ **بصمة الانصراف تُسجَّل «دخولاً»**. مُثبَت بعد بصمتَي 08:00
 *    و17:00: `SELECT DISTINCT punch_type` ⇒ «check-in» · بصمات
 *    الخروج = **0** · بصمات بلا shift_type = **2** (والسطر 584
 *    يعرض الوردية فيظهر «—» أبداً).
 *
 *    ★ وهذا هو العطل الذي وثّقه 0346: لوحة الحضور اليومي اضطرّت
 *      لاشتقاق الخروج من **ترتيب** البصمات لأن النوع لا يُكتب.
 *
 *  ② «حاضر: 0» مهما بصم الجميع. الإحصائيات تُقرأ من
 *    `attendance_summary` وحده — و**لا شيء في المنصّة يكتبه من
 *    البصمات**: محفّزات على attendance_logs = 0 · دالة
 *    refresh_attendance_summary = 0. الكاتب الوحيد للجدول هو
 *    اعتماد الإجازات، فيمتلئ بـ'مجاز' ولا يعرف الحضور الفعليّ.
 *
 *  ③ النوع كان يُستنتج من **عدّ** المصفوفة:
 *      empLogs.length % 2 === 0 ? 'check_in' : 'check_out'
 *    منطق تناوب ينقلب كلّه لو ضاعت بصمة واحدة (شبكة · تكرار
 *    مُبتلَع في catch). الآن من **نوع آخر بصمة** في القاعدة.
 *
 *  ④ `.filter((s: any , EmployeeStatus) => …)` — معاملٌ ثانٍ اسمه
 *    `EmployeeStatus` يُظلّل النوع المستورد ويستقبل الفهرس.
 *
 *  الكتابة الآن عبر `kiosk_punch` الذرّية، ومحفّز 0347 يبني
 *  `attendance_summary` تلقائياً بعد كل بصمة.
 *  ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { LogIn, LogOut, Search, CheckCircle, XCircle, Shield, Users, Clock, Loader2, AlertTriangle } from 'lucide-react';
import {
  kioskService,
  type KioskBoardRow,
  type KioskStats,
  type PunchType,
} from '../../services/sdk/KioskService';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useUIStore } from '../../core/stores';
import { notifyUser } from '../../services/notifications/notificationService';
import { getErrorMessage } from '../../services/errors';
import { useNavigate } from 'react-router-dom';
import { getDefaultPathForRole } from '../../router/constants';
import { useAuthStore } from '../../core/stores';

// ════════════════════════════════════════════════════════════════
//  أنواع البيانات
// ════════════════════════════════════════════════════════════════

/**
 * ★ الأنواع تأتي من الخدمة: `KioskBoardRow` يجمع الموظف وحالته
 *   وبصماته وإجراءه التالي في صفٍّ واحد محسوب في القاعدة، بدل ثلاث
 *   بنى محلّية تُجمَّع في المتصفح بأعمدة خاطئة.
 */

// ════════════════════════════════════════════════════════════════
//  Hook: كشف حجم الشاشة
// ════════════════════════════════════════════════════════════════

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [isTablet, setIsTablet] = useState(() => {
    if (typeof window === 'undefined') return false;
    const w = window.innerWidth;
    return w >= 768 && w < 1024;
  });

  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      setIsMobile(w < 768);
      setIsTablet(w >= 768 && w < 1024);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return { isMobile, isTablet };
}

// ════════════════════════════════════════════════════════════════
//  المكون الرئيسي
// ════════════════════════════════════════════════════════════════

export default function KioskPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const backPath = getDefaultPathForRole(user?.role);
  const { isMobile, isTablet } = useIsMobile();

  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<KioskBoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [flash, setFlash] = useState<{ name: string; action: string; color: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<KioskStats>({
    total: 0, present: 0, left: 0, onLeave: 0, absent: 0,
  });
  const [currentTime, setCurrentTime] = useState(new Date());
  const searchRef = useRef<HTMLInputElement>(null);

  const statColumns = isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)';
  const mainColumns = isMobile ? '1fr' : '1fr 1fr';

  // تحديث الساعة
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // جلب البيانات — استدعاءان بدل أربعة تجميعات في المتصفح
  const fetchData = useCallback(async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const [board, st] = await Promise.all([
        kioskService.board(q ?? null, 300),
        kioskService.stats(),
      ]);
      setRows(board);
      setStats(st);
    } catch (err) {
      console.error('[KioskPage] فشل جلب البيانات:', err);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    searchRef.current?.focus();
  }, [fetchData]);

  /**
   * ★★★ الترشيح محلّي للاستجابة الفورية (الحارس يكتب بسرعة)، لكن
   *   البحث الأصليّ في القاعدة متاح عبر `fetchData(q)` حين تتجاوز
   *   القائمة الحدّ. القاعدة تبحث في أربعة حقول لأن `full_name_ar`
   *   فارغ لكل موظف (درس 0346).
   */
  /** من بصم اليوم — الأحدث أولاً (اللوحة مرتّبة بآخر بصمة) */
  const punchedRows = rows.filter((r) => r.punchCount > 0);

  const filteredRows = rows.filter((r) => {
    const q = search.trim();
    if (!q) return true;
    return (
      r.fullName.includes(q) ||
      r.employeeCode.includes(q) ||
      r.department.includes(q)
    );
  });

  /**
   * تسجيل البصمة.
   *
   * ★★★ النوع **لا يُمرَّر من الواجهة**: تحدّده القاعدة من نوع آخر
   *   بصمة فعلية. الصفحة كانت تستنتجه من `length % 2` — منطق تناوب
   *   ينقلب كلّه لو ضاعت بصمة واحدة.
   *
   * ★★ ونافذة الارتداد (60 ثانية) في القاعدة أيضاً: القيد الفريد
   *   يمنع التطابق التامّ فقط، وإصبعٌ يلمس القارئ مرّتين يُنتج
   *   بصمتين بفارق ثانية.
   */
  const handlePunch = async (row: KioskBoardRow) => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await kioskService.punch(row.employeeId, 'finger', 'KIOSK');

      if (res.debounced) {
        setError(`${row.fullName}: بصمة مكرّرة خلال أقل من دقيقة — لم تُسجَّل`);
        setTimeout(() => setError(null), 3000);
        return;
      }

      const isIn = res.punchType === 'check-in';
      if (row.userId) {
        notifyUser(row.userId, {
          type: 'attendance_recorded',
          title: isIn ? 'تم تسجيل دخولك' : 'تم تسجيل خروجك',
          message: `${format(new Date(res.punchTime), 'HH:mm:ss')} — عبر بوابة الحارس`,
          priority: 'low',
          groupKey: `attendance-${row.employeeId}-${res.shiftDate}-${res.punchType}`,
        }).catch((err: unknown) => console.error('فشل إشعار الحضور:', err));
      }

      setFlash({
        name: row.fullName,
        action: isIn ? 'تسجيل دخول ✅' : 'تسجيل خروج 👋',
        color: isIn ? '#10b981' : '#f59e0b',
      });
      setTimeout(() => setFlash(null), 2500);

      setSearch('');
      searchRef.current?.focus();
      await fetchData();
    } catch (err) {
      console.error('[KioskPage] فشل التسجيل:', err);
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  // ════════════════════════════════════════════════════════════════
  //  Render
  // ════════════════════════════════════════════════════════════════

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0f172a',
        fontFamily: "'Tajawal','Cairo',sans-serif",
        direction: 'rtl',
        padding: isMobile ? '1rem' : '1.5rem',
      }}
    >
      {/* Flash تأكيد */}
      {flash && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            animation: 'kioskFadeIn 0.2s ease',
          }}
        >
          <div
            style={{
              background: flash.color, borderRadius: '24px',
              padding: isMobile ? '2rem 2.5rem' : '3rem 4rem', textAlign: 'center',
              boxShadow: `0 0 80px ${flash.color}66`,
            }}
          >
            <div style={{ fontSize: isMobile ? '3.5rem' : '5rem', marginBottom: '1rem' }}>
              {flash.action.includes('دخول') ? '✅' : '👋'}
            </div>
            <p style={{ color: 'white', fontSize: isMobile ? '1.5rem' : '2rem', fontWeight: 800 }}>{flash.name}</p>
            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '1.25rem', marginTop: '0.5rem' }}>{flash.action}</p>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1rem', marginTop: '0.5rem' }}>
              {format(new Date(), 'HH:mm:ss')}
            </p>
          </div>
        </div>
      )}

      {/* رسالة خطأ */}
      {error && (
        <div style={{
          background: '#ef444422', border: '1px solid #ef444444', borderRadius: '12px',
          padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex',
          alignItems: 'center', gap: '0.5rem', color: '#fca5a5', fontSize: '0.875rem',
        }}>
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* الهيدر */}
      <div
        style={{
          display: 'flex', flexWrap: isMobile ? 'wrap' : 'nowrap',
          alignItems: 'center', justifyContent: 'space-between',
          gap: '1rem', marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => navigate(backPath)}
            style={{
              background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '12px',
              width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'white', flexShrink: 0,
            }}
            title="العودة للوحة التحكم"
          >
            <LogOut size={18} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <div
            style={{
              width: '52px', height: '52px', borderRadius: '14px',
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Shield size={26} color="white" />
          </div>
          <div>
            <h1 style={{ color: 'white', fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 800, margin: 0 }}>
              بوابة الحارس
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>تسجيل الحضور والانصراف</p>
          </div>
        </div>

        {/* الساعة */}
        <div
          style={{
            background: '#1e293b', borderRadius: '16px',
            padding: '0.75rem 1.25rem', textAlign: 'center',
            border: '1px solid #334155',
          }}
        >
          <p style={{ color: '#4f46e5', fontSize: isMobile ? '1.5rem' : '2rem', fontWeight: 800, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
            {format(currentTime, 'HH:mm:ss')}
          </p>
          <p style={{ color: '#64748b', fontSize: '0.8rem', margin: 0 }}>
            {format(currentTime, 'EEEE، d MMMM yyyy', { locale: ar })}
          </p>
        </div>
      </div>

      {/* الإحصائيات */}
      <div style={{ display: 'grid', gridTemplateColumns: statColumns, gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          /* ★★★ 0347: «الحاضرون» كانت صفراً أبداً — تُقرأ من
             attendance_summary الذي لا يكتبه أحد من البصمات.
             و«المنصرفون» بطاقة جديدة: من غادر ليس حاضراً ولا غائباً. */
          { label: 'المداومون', value: stats.present, color: '#10b981', icon: CheckCircle },
          { label: 'المنصرفون', value: stats.left,    color: '#f59e0b', icon: LogOut },
          { label: 'الغائبون',  value: stats.absent,  color: '#ef4444', icon: XCircle },
          { label: 'المجازون',  value: stats.onLeave, color: '#6366f1', icon: Clock },
          { label: 'الإجمالي',  value: stats.total,   color: '#8b5cf6', icon: Users },
        ].map(({ label, value, color, icon: Icon }, i) => (
          <div
            key={i}
            style={{
              background: '#1e293b', borderRadius: '16px',
              padding: '1.25rem', border: `1px solid ${color}33`,
              display: 'flex', alignItems: 'center', gap: '1rem',
            }}
          >
            <div
              style={{
                width: '48px', height: '48px', borderRadius: '12px',
                background: `${color}22`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon size={22} color={color} />
            </div>
            <div>
              <p style={{ color, fontSize: '2rem', fontWeight: 800, margin: 0 }}>{value}</p>
              <p style={{ color: '#64748b', fontSize: '0.8rem', margin: 0 }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* المحتوى الرئيسي */}
      <div style={{ display: 'grid', gridTemplateColumns: mainColumns, gap: isMobile ? '1rem' : '1.5rem' }}>
        {/* البحث والتسجيل */}
        <div>
          <div style={{ position: 'relative', marginBottom: '1rem' }}>
            <Search size={18} color="#64748b" style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالاسم أو رقم الموظف أو القسم..."
              style={{
                width: '100%', padding: '1rem 3rem 1rem 1rem',
                background: '#1e293b', border: '2px solid #334155',
                borderRadius: '14px', color: 'white', fontSize: '1rem',
                outline: 'none', boxSizing: 'border-box',
                fontFamily: "'Tajawal','Cairo',sans-serif",
              }}
              onFocus={(e) => (e.target.style.borderColor = '#4f46e5')}
              onBlur={(e) => (e.target.style.borderColor = '#334155')}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '60vh', overflowY: 'auto' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#475569' }}>
                <Loader2 size={40} style={{ margin: '0 auto 1rem', opacity: 0.6, animation: 'spin 0.8s linear infinite' }} />
                <p>جاري التحميل...</p>
              </div>
            ) : filteredRows.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#475569' }}>
                <Users size={40} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
                <p>لا يوجد موظفون مطابقون</p>
              </div>
            ) : (
              filteredRows.map((emp) => {
                // ★★★ الإجراء التالي محسوب في القاعدة من **نوع** آخر
                //   بصمة. كان `getLastAction` يستنتجه من عدّ المصفوفة.
                const isOut = emp.nextAction === 'check-out';

                return (
                  <div
                    key={emp.employeeId}
                    style={{
                      background: '#1e293b', borderRadius: '14px',
                      padding: '1rem', border: '1px solid #334155',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          width: '44px', height: '44px', borderRadius: '12px',
                          background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'white', fontWeight: 700, fontSize: '1rem', flexShrink: 0,
                        }}
                      >
                        {emp.fullName.charAt(0) || '؟'}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ color: 'white', fontWeight: 700, margin: 0, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {emp.fullName}
                        </p>
                        <p style={{ color: '#64748b', fontSize: '0.8rem', margin: 0 }}>
                          {emp.department} · {emp.employeeCode || 'بدون رقم'}
                          {emp.shiftType ? ` · ${emp.shiftType}` : ''}
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                      {/* ★★ الحالة الآن من البصمات لا من ملخّص فارغ */}
                      <span
                        style={{
                          padding: '4px 10px', borderRadius: '20px',
                          fontSize: '0.7rem', fontWeight: 600,
                          background: emp.status === 'مداوم' ? '#10b98122' :
                            emp.status === 'منصرف' ? '#f59e0b22' : '#ef444422',
                          color: emp.status === 'مداوم' ? '#10b981' :
                            emp.status === 'منصرف' ? '#f59e0b' : '#ef4444',
                        }}
                      >
                        {emp.status}
                        {emp.punchCount > 0 ? ` (${emp.punchCount})` : ''}
                      </span>
                      <button
                        onClick={() => handlePunch(emp)}
                        disabled={actionLoading}
                        style={{
                          padding: '8px 16px', borderRadius: '10px', border: 'none',
                          cursor: actionLoading ? 'not-allowed' : 'pointer',
                          background: isOut
                            ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                            : 'linear-gradient(135deg, #10b981, #059669)',
                          color: 'white', fontWeight: 700, fontSize: '0.85rem',
                          display: 'flex', alignItems: 'center', gap: '6px',
                          fontFamily: "'Tajawal','Cairo',sans-serif",
                        }}
                      >
                        {isOut ? (
                          <><LogOut size={14} /> خروج</>
                        ) : (
                          <><LogIn size={14} /> دخول</>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* حركة اليوم */}
        <div>
          {/**
            * ★★★ 0347: كان هذا اللوح يعرض «سجل البصمات» ويستنتج نوع
            *   كل بصمة من موقعها في المصفوفة:
            *     empPrevLogs.length % 2 === 1 ? 'check_in' : 'check_out'
            *   منطقٌ يقلب **كل** السجلّ لو ضاعت بصمة واحدة، ويعرض
            *   `log.shift_type` وهو NULL أبداً فيظهر «—».
            *   صار يعرض حركة الموظفين الحقيقية من القاعدة.
            */}
          <h3 style={{ color: '#94a3b8', fontSize: '0.875rem', fontWeight: 600, margin: '0 0 1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            حركة اليوم — {punchedRows.length} موظف
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '65vh', overflowY: 'auto' }}>
            {punchedRows.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#475569' }}>
                <Clock size={40} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
                <p>لا توجد بصمات مسجلة اليوم بعد</p>
              </div>
            ) : (
              punchedRows.map((r) => {
                const isIn = r.status === 'مداوم';
                return (
                  <div
                    key={r.employeeId}
                    style={{
                      background: '#1e293b', borderRadius: '12px',
                      padding: '0.875rem 1rem',
                      border: `1px solid ${isIn ? '#10b98133' : '#f59e0b33'}`,
                      display: 'flex', alignItems: 'center', gap: '0.75rem',
                    }}
                  >
                    <div
                      style={{
                        width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                        background: isIn ? '#10b98122' : '#f59e0b22',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {isIn ? <LogIn size={16} color="#10b981" /> : <LogOut size={16} color="#f59e0b" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: 'white', fontWeight: 600, margin: 0, fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.fullName}
                      </p>
                      <p style={{ color: '#64748b', fontSize: '0.75rem', margin: 0 }}>
                        {r.department}
                        {r.shiftType ? ` · ${r.shiftType}` : ''}
                        {r.punchCount > 1 ? ` · ${r.punchCount} بصمات` : ''}
                      </p>
                    </div>
                    <div style={{ textAlign: 'left', flexShrink: 0 }}>
                      <p style={{ fontWeight: 700, fontSize: '0.875rem', margin: 0, color: isIn ? '#10b981' : '#f59e0b' }}>
                        {r.status}
                      </p>
                      <p style={{ color: '#475569', fontSize: '0.75rem', margin: 0 }}>
                        {r.checkIn ? format(new Date(r.checkIn), 'HH:mm') : '—'}
                        {r.checkOut ? ` ← ${format(new Date(r.checkOut), 'HH:mm')}` : ''}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes kioskFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
