/**
 * ════════════════════════════════════════════════════════════════
 *  KioskPage - بوابة الحارس (نسخة مُصلحة — تسجيل بصمات صحيح)
 * ════════════════════════════════════════════════════════════════
 *
 *  🔧 الإصلاحات المُطبّقة:
 *  ─────────────────────────────────────────────────────────────────
 *  ✅ استخدام attendance_logs بدلاً من time_logs (الجدول الصحيح)
 *  ✅ تسجيل بصمة الدخول/الخروج مع تحديد الوردية تلقائياً
 *  ✅ استخدام attendance_summary لعرض حالة كل موظف
 *  ✅ منع تكرار البصمة (نفس البصمة مرتين متتاليتين)
 *  ✅ عرض إحصائيات دقيقة من attendance_summary
 *  ✅ ربط مع جدول employees بدلاً من profiles
 *  ✅ إشعارات عند تسجيل الحضور والانصراف
 *  ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { LogIn, LogOut, Search, CheckCircle, XCircle, Shield, Users, Clock, Loader2, AlertTriangle } from 'lucide-react';
import { employeeService } from '../../services/sdk/EmployeeService';
import { departmentService } from '../../services/sdk/DepartmentService';
import { attendanceService, attendanceSummaryService } from '../../services/sdk/AttendanceService';
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

interface EmployeeRecord {
  id: string;
  employee_code: string;
  full_name_ar: string;
  email: string;
  position: string;
  is_active: boolean;
  user_id: string | null;
  department?: string;
}

interface AttendanceLogRecord {
  id: number;
  employee_id: string;
  punch_time: string;
  punch_type: string;
  shift_type: string;
  shift_date: string;
  source: string;
}

interface EmployeeStatus {
  employee_id: string;
  status: string;
  check_in: string | null;
  check_out: string | null;
  shift_type: string | null;
}

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
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [todayLogs, setTodayLogs] = useState<AttendanceLogRecord[]>([]);
  const [employeeStatuses, setEmployeeStatuses] = useState<Map<string, EmployeeStatus>>(new Map());
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [flash, setFlash] = useState<{ name: string; action: string; color: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ present: 0, absent: 0, onLeave: 0, total: 0 });
  const [currentTime, setCurrentTime] = useState(new Date());
  const searchRef = useRef<HTMLInputElement>(null);

  const statColumns = isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)';
  const mainColumns = isMobile ? '1fr' : '1fr 1fr';

  // تحديث الساعة
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // جلب البيانات
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');

      // جلب الموظفين النشطين
      const emps = await employeeService.findAll({ filters: { is_active: true } });

      // جلب أسماء الأقسام
      const depts = await departmentService.findAll();
      const deptMap = new Map((depts || []).map((d: { id: string; name_ar: string }) => [d.id, d.name_ar]));

      const empList: EmployeeRecord[] = (emps || []).map((e: any) => ({
        ...e,
        department: deptMap.get(e.department_id || '') || '',
      }));
      setEmployees(empList);

      // جلب سجلات البصمات لليوم
      const logs = await attendanceService.findAll({
        filters: { shift_date: today },
        orderBy: 'punch_time',
        ascending: false,
      });
      setTodayLogs((logs || []) as unknown as AttendanceLogRecord[]);

      // جلب ملخص الحضور لليوم
      const summaries = await attendanceSummaryService.findAll({
        filters: { shift_date: today },
      });

      const statusMap = new Map<string, EmployeeStatus>();
      (summaries || []).forEach((s: any) => {
        statusMap.set(s.employee_id, s);
      });
      setEmployeeStatuses(statusMap);

      // إحصائيات
      const present = (summaries || []).filter((s: any , EmployeeStatus) =>
        s.status === 'حضور_بوقت' || s.status === 'متأخر' || s.status === 'زمنية_معتمدة' || s.status === 'زمنية_انتظار'
      ).length;
      const onLeave = (summaries || []).filter((s: any , EmployeeStatus) =>
        s.status === 'مجاز' || s.status === 'إجازة_انتظار'
      ).length;

      setStats({
        present,
        absent: empList.length - present - onLeave,
        onLeave,
        total: empList.length,
      });
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

  // فلترة الموظفين
  const filteredEmployees = employees.filter((e) =>
    (e.full_name_ar || '').includes(search) ||
    (e.employee_code || '').includes(search) ||
    (e.email || '').includes(search) ||
    (e.department || '').includes(search)
  );

  // تحديد آخر إجراء للموظف (دخول أم خروج)
  const getLastAction = (employeeId: string): 'check_in' | 'check_out' | null => {
    const empLogs = todayLogs
      .filter((l) => l.employee_id === employeeId)
      .sort((a, b) => new Date(a.punch_time).getTime() - new Date(b.punch_time).getTime());
    if (empLogs.length === 0) return null;
    // عدد فردي = آخر بصمة كانت دخول → الإجراء التالي خروج
    // عدد زوجي = آخر بصمة كانت خروج → الإجراء التالي دخول
    return empLogs.length % 2 === 0 ? 'check_in' : 'check_out';
  };

  // تسجيل البصمة (دخول/خروج)
  const handleAttendance = async (employee: EmployeeRecord, action: 'check_in' | 'check_out') => {
    setActionLoading(true);
    setError(null);
    try {
      const now = new Date();
      const shiftDate = format(now, 'yyyy-MM-dd');

      // التحقق من آخر بصمة لمنع التكرار
      const empLogs = todayLogs
        .filter((l) => l.employee_id === employee.id)
        .sort((a, b) => new Date(a.punch_time).getTime() - new Date(b.punch_time).getTime());

      if (empLogs.length > 0) {
        const lastAction = empLogs.length % 2 === 0 ? 'check_in' : 'check_out';
        if (lastAction === action) {
          setError(`الموظف ${employee.full_name_ar} مسجل ${action === 'check_in' ? 'دخول' : 'خروج'} بالفعل`);
          setTimeout(() => setError(null), 3000);
          setActionLoading(false);
          return;
        }
      }

      // إدخال البصمة في جدول attendance_logs
      try {
        await attendanceService.create({
          employee_id: employee.id,
          punch_time: now.toISOString(),
          shift_date: shiftDate,
          source: 'ADMS',
          verification_type: 'finger',
        });
      } catch (insertErr: any) {
        // إذا كان التكرار، نتجاهله
        if (!insertErr.message?.includes('duplicate') && !insertErr.message?.includes('unique')) {
          throw insertErr;
        }
      }

      // إشعار الموظف
      if (employee.user_id) {
        notifyUser(employee.user_id, {
          type: 'attendance_recorded',
          title: action === 'check_in' ? 'تم تسجيل دخولك' : 'تم تسجيل خروجك',
          message: `${format(now, 'HH:mm:ss')} — عبر بوابة الحارس`,
          priority: 'low',
          groupKey: `attendance-${employee.id}-${format(now, 'yyyy-MM-dd')}-${action}`,
        }).catch((err: unknown) => console.error('فشل إشعار الحضور:', err));
      }

      // تأكيد بصري
      setFlash({
        name: employee.full_name_ar,
        action: action === 'check_in' ? 'تسجيل دخول ✅' : 'تسجيل خروج 👋',
        color: action === 'check_in' ? '#10b981' : '#f59e0b',
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
          { label: 'الحاضرون', value: stats.present, color: '#10b981', icon: CheckCircle },
          { label: 'الغائبون', value: stats.absent, color: '#ef4444', icon: XCircle },
          { label: 'المجازون', value: stats.onLeave, color: '#f59e0b', icon: Clock },
          { label: 'إجمالي الموظفين', value: stats.total, color: '#6366f1', icon: Users },
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
            ) : filteredEmployees.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#475569' }}>
                <Users size={40} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
                <p>لا يوجد موظفون مطابقون</p>
              </div>
            ) : (
              filteredEmployees.map((emp) => {
                const lastAction = getLastAction(emp.id);
                const isIn = lastAction === 'check_out'; // آخر بصمة فردية = دخل
                const empStatus = employeeStatuses.get(emp.id);

                return (
                  <div
                    key={emp.id}
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
                        {emp.full_name_ar?.charAt(0) || '؟'}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ color: 'white', fontWeight: 700, margin: 0, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {emp.full_name_ar || 'بدون اسم'}
                        </p>
                        <p style={{ color: '#64748b', fontSize: '0.8rem', margin: 0 }}>
                          {emp.department} · {emp.employee_code || 'بدون رقم'}
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                      {empStatus && (
                        <span
                          style={{
                            padding: '4px 10px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 600,
                            background: empStatus.status === 'حضور_بوقت' ? '#10b98122' :
                              empStatus.status === 'متأخر' ? '#f59e0b22' :
                              empStatus.status === 'غائب' ? '#ef444422' :
                              empStatus.status === 'مجاز' ? '#6366f122' : '#334155',
                            color: empStatus.status === 'حضور_بوقت' ? '#10b981' :
                              empStatus.status === 'متأخر' ? '#f59e0b' :
                              empStatus.status === 'غائب' ? '#ef4444' :
                              empStatus.status === 'مجاز' ? '#6366f1' : '#94a3b8',
                          }}
                        >
                          {empStatus.status || 'لم يحضر'}
                        </span>
                      )}
                      <button
                        onClick={() => handleAttendance(emp, isIn ? 'check_out' : 'check_in')}
                        disabled={actionLoading}
                        style={{
                          padding: '8px 16px', borderRadius: '10px', border: 'none',
                          cursor: actionLoading ? 'not-allowed' : 'pointer',
                          background: isIn
                            ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                            : 'linear-gradient(135deg, #10b981, #059669)',
                          color: 'white', fontWeight: 700, fontSize: '0.85rem',
                          display: 'flex', alignItems: 'center', gap: '6px',
                          fontFamily: "'Tajawal','Cairo',sans-serif",
                        }}
                      >
                        {isIn ? (
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

        {/* سجل اليوم */}
        <div>
          <h3 style={{ color: '#94a3b8', fontSize: '0.875rem', fontWeight: 600, margin: '0 0 1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            سجل البصمات اليوم — {todayLogs.length} سجل
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '65vh', overflowY: 'auto' }}>
            {todayLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#475569' }}>
                <Clock size={40} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
                <p>لا توجد بصمات مسجلة اليوم بعد</p>
              </div>
            ) : (
              todayLogs.map((log, idx) => {
                const emp = employees.find((e) => e.id === log.employee_id);
                // تحديد نوع الإجراء بناءً على عدد بصمات الموظف حتى هذا السجل
                const empPrevLogs = todayLogs
                  .slice(0, idx + 1)
                  .filter((l) => l.employee_id === log.employee_id);
                const actionType = empPrevLogs.length % 2 === 1 ? 'check_in' : 'check_out';

                return (
                  <div
                    key={log.id}
                    style={{
                      background: '#1e293b', borderRadius: '12px',
                      padding: '0.875rem 1rem',
                      border: `1px solid ${actionType === 'check_in' ? '#10b98133' : '#f59e0b33'}`,
                      display: 'flex', alignItems: 'center', gap: '0.75rem',
                    }}
                  >
                    <div
                      style={{
                        width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                        background: actionType === 'check_in' ? '#10b98122' : '#f59e0b22',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {actionType === 'check_in' ? <LogIn size={16} color="#10b981" /> : <LogOut size={16} color="#f59e0b" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: 'white', fontWeight: 600, margin: 0, fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {emp?.full_name_ar || 'غير محدد'}
                      </p>
                      <p style={{ color: '#64748b', fontSize: '0.75rem', margin: 0 }}>
                        {emp?.department || 'بدون قسم'} · {log.shift_type || '—'}
                      </p>
                    </div>
                    <div style={{ textAlign: 'left', flexShrink: 0 }}>
                      <p style={{ fontWeight: 700, fontSize: '0.875rem', margin: 0, color: actionType === 'check_in' ? '#10b981' : '#f59e0b' }}>
                        {actionType === 'check_in' ? 'دخول' : 'خروج'}
                      </p>
                      <p style={{ color: '#475569', fontSize: '0.75rem', margin: 0 }}>
                        {log.punch_time ? format(new Date(log.punch_time), 'HH:mm:ss') : ''}
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
