/**
 * ════════════════════════════════════════════════════════════════
 *  GatekeeperPage - صفحة بوابة الحارس (نسخة مُصلحة - SDK)
 *  تم إزالة جميع استدعاءات supabase.from() المباشرة
 *  مع الإبقاء على supabase.channel() للـ Realtime (استثناء مقبول)
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase/supabase';
import {
  gatekeeperSessionService,
  gatekeeperVisitorLogService,
  movementLogService,
  employeeBreakService,
  employeeService,
  gatekeeperVisitorService,
} from '../../services/sdk';
import Card from '../../shared/components/ui/Card';
import Button from '../../shared/components/ui/Button';
import Input from '../../shared/components/ui/Input';
import { userService } from '../../services/sdk/UserService';
import { useUIStore, useAuthStore } from '../../core/stores';
import { differenceInSeconds } from 'date-fns';
import {
  UserPlus, Users, Clock, LogOut, Edit, Trash2, Search, RefreshCw,
  AlertTriangle, ArrowRightLeft, Sun, Moon, BellRing,
  Shield,
} from 'lucide-react';
import './gatekeeper.css';
import { getErrorMessage } from '../../services/errors';

import type {
  GatekeeperSession,
  GatekeeperVisitorLog,
  VisitorFormData,
  MovementLog,
  EmployeeBreak,
  MovementFormData,
} from '../../shared/types/gatekeeper';

// ════════════════════════════════════════════════════
// أنواع محلية (تحلّ محل any)
// ════════════════════════════════════════════════════

interface EmployeeBasic {
  id: string;
  full_name?: string;
  email?: string;
  department?: string;
  role?: string;
}

interface ArrivalData {
  id: string | number;
  employee_name?: string;
  destination: string;
  notes?: string;
}

type ToastType = 'success' | 'error' | 'info' | 'warning';

// ════════════════════════════════════════════════════
// المكون الرئيسي
// ════════════════════════════════════════════════════

export default function GatekeeperPage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();

  // ═════ حالة البيانات ═════
  const [currentSession, setCurrentSession] = useState<GatekeeperSession | null>(null);
  const [visitors, setVisitors] = useState<GatekeeperVisitorLog[]>([]);
  const [employees, setEmployees] = useState<EmployeeBasic[]>([]);
  const [movements, setMovements] = useState<MovementLog[]>([]);
  const [approvedBreaks, setApprovedBreaks] = useState<EmployeeBreak[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // ═════ حالة النماذج ═════
  const [showModal, setShowModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [showArrivalModal, setShowArrivalModal] = useState(false);
  const [editingVisitor, setEditingVisitor] = useState<GatekeeperVisitorLog | null>(null);
  const [arrivalData, setArrivalData] = useState<ArrivalData | null>(null);
  const [actualLocation, setActualLocation] = useState('عاد لمكان الخروج');

  // ═════ بيانات الوردية ═════
  const [gkName, setGkName] = useState('');
  const [gkPin, setGkPin] = useState('');
  const [takeoverName, setTakeoverName] = useState('');
  const [takeoverPin, setTakeoverPin] = useState('');

  // ═════ بيانات النماذج ═════
  const [formData, setFormData] = useState<VisitorFormData>({
    name: '', phone: '', company: '', purpose: '', notes: '', location: '',
  });

  const [movementForm, setMovementForm] = useState<MovementFormData>({
    employee_id: '', employee_name: '', department: 'الإنتاج',
    customDepartment: '', destination: 'الكافتيريا', customDestination: '', notes: '',
  });

  // ═════ منطق الورديات ═════
  const currentHour = new Date().getHours();
  const isMorningValid = currentHour >= 8 && currentHour < 16;
  const isEveningValid = currentHour >= 16 && currentHour <= 23;
  const isNightValid = currentHour >= 0 && currentHour < 8;

  const initialTab = user?.gatekeeper_type === 'employee_movement' ? 'employees' : 'visitors';
  const [activeTab, setActiveTab] = useState<'visitors' | 'employees'>(initialTab);

  // ═════ التهيئة ═════
  useEffect(() => {
    initializeSession();
    loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!currentSession) return;

    const channel = supabase
      .channel('gatekeeper-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gatekeeper_visitor_logs' },
        () => { if (currentSession.id) loadVisitors(currentSession.id); })
      .subscribe();

    const sessionChannel = supabase
      .channel('session-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'gatekeeper_sessions', filter: `id=eq.${currentSession.id}` },
        (payload) => {
          const newSession = payload.new as unknown as GatekeeperSession;
          if (!newSession.is_active) {
            setCurrentSession(null);
            showToast('تم إغلاق الوردية', 'info');
          } else {
            setCurrentSession(newSession);
          }
        })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(sessionChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSession?.id]);

  useEffect(() => {
    if (!currentSession?.is_active || !currentSession.expected_end_time) return;

    const checkAutoClose = async () => {
      if (new Date() >= new Date(currentSession.expected_end_time!)) {
        try {
          await gatekeeperSessionService.endSession(currentSession.id);
        } catch (e) {
          console.warn('Auto-close failed:', getErrorMessage(e));
        }
      }
    };

    const interval = setInterval(checkAutoClose, 60000);
    checkAutoClose();
    return () => clearInterval(interval);
  }, [currentSession?.id, currentSession?.expected_end_time, currentSession?.is_active]);

  // ═════ دوال التحميل ═════

  const initializeSession = async () => {
    try {
      setLoading(true);
      setDbError(null);

      const sessions = await gatekeeperSessionService.findAll({
        filters: { is_active: true },
        orderBy: 'started_at',
        ascending: false,
        limit: 1,
      });

      if (sessions && sessions.length > 0) {
        const session = sessions[0] as unknown as GatekeeperSession;
        setCurrentSession(session);
        await loadVisitors(session.id);
        await loadMovements(session.started_at);
        showToast('تم استعادة الجلسة النشطة', 'success');
        return;
      }

      setCurrentSession(null);
      setVisitors([]);
    } catch (err) {
      console.error('Error initializing session:', getErrorMessage(err));
      setDbError(getErrorMessage(err, 'خطأ في الاتصال بقاعدة البيانات'));
    } finally {
      setLoading(false);
    }
  };

  const loadEmployees = async () => {
    try {
      const users = await userService.findAllUsers();
      if (users) setEmployees(users as EmployeeBasic[]);
    } catch (err) {
      console.warn('Failed to load employees:', getErrorMessage(err));
    }
  };

  const loadVisitors = async (sessionId: string) => {
    try {
      const logs = await gatekeeperVisitorLogService.findVisitorLogs({ sessionId });
      if (logs) setVisitors(logs as unknown as GatekeeperVisitorLog[]);
    } catch (err) {
      console.error('Error loading visitors:', getErrorMessage(err));
      showToast('فشل في تحميل الزوار', 'error');
    }
  };

  const loadMovements = async (sessionStart?: string) => {
    if (!sessionStart) return;
    try {
      const logs = await movementLogService.findMovements({ fromDate: sessionStart });
      if (logs) setMovements(logs as unknown as MovementLog[]);
      await loadApprovedBreaks();
    } catch (err) {
      console.warn('Failed to load movements:', getErrorMessage(err));
    }
  };

  const loadApprovedBreaks = async () => {
    try {
      const breaks = await employeeBreakService.findActiveBreaks();
      if (breaks) setApprovedBreaks(breaks as unknown as EmployeeBreak[]);
    } catch (err) {
      console.warn('Failed to load approved breaks:', getErrorMessage(err));
    }
  };

  // ═════ دوال الوردية ═════

  const handleStartShift = async (shiftType: string, shiftLabel: string) => {
    if (shiftType === 'morning' && !isMorningValid) return showToast('لا يمكن فتح الوردية الصباحية الآن', 'error');
    if (shiftType === 'evening' && !isEveningValid) return showToast('لا يمكن فتح الوردية المسائية الآن', 'error');
    if (shiftType === 'night' && !isNightValid) return showToast('لا يمكن فتح الوردية الليلية الآن', 'error' as ToastType);

    if (!gkName.trim() || gkPin.length !== 3) {
      showToast('يجب إدخال الاسم والرمز السري من 3 أرقام', 'error');
      return;
    }
    if (user?.gatekeeper_pin && gkPin !== user.gatekeeper_pin) {
      showToast('❌ الرمز السري غير صحيح', 'error');
      return;
    }
    if (!user?.gatekeeper_pin) {
      showToast('⚠️ لا يوجد رمز حارس مسجل لحسابك، راجع الإدارة', 'error');
      return;
    }

    setLoading(true);
    try {
      const now = new Date();
      const endTime = new Date(now);

      if (shiftType === 'morning') {
        endTime.setHours(16, 0, 0, 0);
        if (now.getHours() >= 16) endTime.setDate(endTime.getDate() + 1);
      } else if (shiftType === 'evening') {
        endTime.setDate(endTime.getDate() + 1);
        endTime.setHours(0, 0, 0, 0);
      } else if (shiftType === 'night') {
        endTime.setHours(8, 0, 0, 0);
        if (now.getHours() >= 8) endTime.setDate(endTime.getDate() + 1);
      }

      const sessionName = `وردية ${shiftLabel} - ${new Date().toLocaleDateString('ar-SA')}`;

      const newSession = await gatekeeperSessionService.createSession({
        session_name: sessionName,
        shift_type: shiftType,
        gatekeeper_name: gkName.trim(),
        pin_code: gkPin,
        expected_end_time: endTime.toISOString(),
        is_active: true,
        visitor_count: 0,
        created_by: user?.id,
      } as any);
 
      setCurrentSession(newSession as unknown as GatekeeperSession);
      await loadMovements((newSession as unknown as GatekeeperSession).started_at);
      showToast(`تم بدء ${sessionName} بنجاح`, 'success');
    } catch (err) {
      console.error('Start shift error:', getErrorMessage(err));
      showToast('فشل في بدء الوردية: ' + getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEndShift = async () => {
    if (!currentSession) return;

    if (currentSession.expected_end_time && new Date() < new Date(currentSession.expected_end_time)) {
      if (!confirm('وقت الوردية لم ينتهِ بعد. هل تريد طلب إنهاء مبكر من الإدارة؟')) return;
      setLoading(true);
      try {
        await gatekeeperSessionService.updateHandoverStatus(currentSession.id, 'pending_end');
        setCurrentSession({ ...currentSession, handover_status: 'pending_end' });
        showToast('تم إرسال طلب الإنهاء المبكر للإدارة', 'success');
      } catch (err) {
        showToast('فشل في إرسال الطلب: ' + getErrorMessage(err), 'error');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!confirm('هل أنت متأكد من إنهاء هذه الوردية؟')) return;

    setLoading(true);
    try {
      await gatekeeperSessionService.endSession(currentSession.id);
      showToast('تم إغلاق الوردية بنجاح', 'success');
      setCurrentSession(null);
    } catch (err) {
      showToast('فشل في إنهاء الوردية: ' + getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestHandover = async () => {
    if (!currentSession) return;
    if (!confirm('هل تريد طلب بديل طارئ؟')) return;
    setLoading(true);
    try {
      await gatekeeperSessionService.updateHandoverStatus(currentSession.id, 'pending');
      setCurrentSession({ ...currentSession, handover_status: 'pending' });
      showToast('تم إرسال الطلب للموارد البشرية', 'success');
    } catch (err) {
      showToast('فشل إرسال الطلب: ' + getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleTakeover = async () => {
    if (!takeoverName.trim() || takeoverPin.length !== 3) return;
    if (!currentSession) return;
    if (takeoverPin !== currentSession.temp_pin) {
      showToast('الرمز المؤقت غير صحيح!', 'error');
      return;
    }

    setLoading(true);
    try {
      const updatedSession = await gatekeeperSessionService.createSession({
        gatekeeper_name: takeoverName.trim(),
        handover_status: 'completed',
        temp_pin: undefined,
        started_at: currentSession.started_at,
        shift_type: currentSession.shift_type,
        session_name: currentSession.session_name,
        pin_code: currentSession.pin_code,
        expected_end_time: currentSession.expected_end_time,
        is_active: true,
        visitor_count: currentSession.visitor_count,
        created_by: user?.id,
      } as any);
      setCurrentSession(updatedSession as unknown as GatekeeperSession);
      await loadMovements((updatedSession as unknown as GatekeeperSession).started_at);
      showToast('تم استلام الوردية بنجاح!', 'success');
    } catch (err) {
      showToast('حدث خطأ أثناء الاستلام: ' + getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  // ═════ دوال الزوار ═════

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSession) return;

    try {
      setLoading(true);

      if (editingVisitor) {
        await gatekeeperVisitorService.updateVisitor(editingVisitor.visitor_id, {
          name: formData.name,
          phone: formData.phone,
          company: formData.company,
          purpose: formData.purpose,
          notes: formData.notes,
          location: formData.location,
          updated_at: new Date().toISOString(),
        });
        showToast('تم تحديث بيانات الزائر بنجاح', 'success');
      } else {
        const visitor = await gatekeeperVisitorService.createVisitor({
          name: formData.name,
          phone: formData.phone,
          company: formData.company,
          purpose: formData.purpose,
          notes: formData.notes,
          location: formData.location,
        });

        await gatekeeperVisitorLogService.createVisitorLog({
          session_id: currentSession.id,
          visitor_id: (visitor as any).id,
          badge_number: `B${Date.now().toString().slice(-6)}`,
          status: 'checked_in',
        } as any);
        showToast('تم تسجيل الزائر بنجاح', 'success');
      }

      await loadVisitors(currentSession.id);
      resetForm();
    } catch (err) {
      console.error('Error saving visitor:', getErrorMessage(err));
      showToast(getErrorMessage(err, 'فشل في حفظ البيانات'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async (log: GatekeeperVisitorLog) => {
    if (!confirm('هل أنت متأكد من تسجيل خروج هذا الزائر؟')) return;
    try {
      await gatekeeperVisitorLogService.updateVisitorLogStatus(log.id, 'checked_out');
      if (currentSession) await loadVisitors(currentSession.id);
      showToast('تم تسجيل الخروج بنجاح', 'success');
    } catch (err) {
      showToast('فشل في تسجيل الخروج: ' + getErrorMessage(err), 'error');
    }
  };

  const handleEdit = (log: GatekeeperVisitorLog) => {
    setEditingVisitor(log);
    setFormData({
      name: log.visitor?.name || '', phone: log.visitor?.phone || '',
      company: log.visitor?.company || '', purpose: log.visitor?.purpose || '',
      notes: log.visitor?.notes || '', location: log.visitor?.location || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (log: GatekeeperVisitorLog) => {
    if (!confirm('هل أنت متأكد من حذف هذا السجل؟')) return;
    try {
      await gatekeeperVisitorLogService.deleteVisitorLog(log.id);
      if (currentSession) await loadVisitors(currentSession.id);
      showToast('تم حذف السجل بنجاح', 'success');
    } catch (err) {
      showToast('فشل في حذف السجل: ' + getErrorMessage(err), 'error');
    }
  };

  const resetForm = () => {
    setFormData({ name: '', phone: '', company: '', purpose: '', notes: '', location: '' });
    setEditingVisitor(null);
    setShowModal(false);
  };

  // ═════ دوال الحركة ═════

  const handleMovementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movementForm.employee_id) {
      showToast('يجب اختيار موظف مسجل في النظام', 'error');
      return;
    }

    try {
      setLoading(true);
      const finalDestination = movementForm.destination === 'مخصص' ? movementForm.customDestination : movementForm.destination;
      const finalDepartment = movementForm.department === 'مخصص' ? movementForm.customDepartment : movementForm.department;

      const approvedBreak = approvedBreaks.find((b) => b.employee_id === movementForm.employee_id && b.status === 'approved');

      const notes = approvedBreak
        ? `[تصريح من المشرف: ${approvedBreak.supervisor_name}] ${movementForm.notes}`
        : `[بدون تصريح خروج] ${movementForm.notes}`;

      await movementLogService.recordMovement({
        employee_id: movementForm.employee_id,
        employee_name: movementForm.employee_name,
        department: finalDepartment,
        destination: finalDestination,
        notes,
        logged_by_id: user?.id || '',
        departure_at: new Date().toISOString(),
      } as any);

      if (approvedBreak) {
        await employeeBreakService.updateBreakStatus(approvedBreak.id, 'out', new Date().toISOString());
      }

      showToast('تم تسجيل خروج الموظف بنجاح', 'success');
      setShowMovementModal(false);
      setMovementForm({ employee_id: '', employee_name: '', department: 'الإنتاج', customDepartment: '', destination: 'الكافتيريا', customDestination: '', notes: '' });
      await loadMovements(currentSession?.started_at);
    } catch (err) {
      showToast(getErrorMessage(err, 'فشل في تسجيل الحركة'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmArrival = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!arrivalData || !currentSession) return;

    setLoading(true);
    try {
      let notes = arrivalData.notes || '';
      let isViolation = false;

      if (actualLocation !== 'عاد لمكان الخروج' && actualLocation !== arrivalData.destination) {
        isViolation = true;
        notes = `${notes} | [مخالفة مسار 🚨] صرّح بـ(${arrivalData.destination}) ووصل إلى (${actualLocation})`;
      } else if (actualLocation !== 'عاد لمكان الخروج') {
        notes = `${notes} | [تأكيد وصول] وصل إلى (${actualLocation})`;
      }

      await movementLogService.recordReturn(arrivalData.id, notes);

      showToast(isViolation ? 'تم رصد مخالفة مسار وتسجيل الوصول' : 'تم تسجيل الوصول بنجاح', isViolation ? 'warning' : 'success');
      setShowArrivalModal(false);
      await loadMovements(currentSession.started_at);
    } catch (err) {
      showToast('فشل في تسجيل الوصول: ' + getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  // ═════ دوال مساعدة ═════

  const showToast = (message: string, type: ToastType) => {
    addToast(message, type);
  };

  const calculateDuration = (departure: string, returned: string | null) => {
    if (!returned) return 'في الخارج ⏳';
    const totalSeconds = differenceInSeconds(new Date(returned), new Date(departure));
    if (totalSeconds < 60) return `${totalSeconds} ثانية`;
    const totalMinutes = Math.floor(totalSeconds / 60);
    if (totalMinutes < 60) return `${totalMinutes} دقيقة`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours} ساعة${minutes > 0 ? ` و ${minutes} دقيقة` : ''}`;
  };

  const filteredVisitors = visitors.filter((log) =>
    log.visitor?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.visitor?.phone?.includes(searchTerm) ||
    log.visitor?.company?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredMovements = movements.filter((m) => {
    const emp = employees.find((e) => e.id === m.employee_id);
    const empName = emp?.full_name || m.employee_name || '';
    return empName.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // ═════ Loading State ═════
  if (loading && !currentSession) {
    return (
      <div className="page-container flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 animate-spin mx-auto mb-4 text-indigo-500" />
          <p className="text-gray-600">جاري تحميل النظام...</p>
        </div>
      </div>
    );
  }

  // ═════ Database Error ═════
  if (dbError && !currentSession) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <Card className="border-red-200 bg-red-50">
          <div className="text-center py-8">
            <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-red-700 mb-2">تعذر بدء جلسة البوابة</h3>
            <p className="text-red-600 mb-4">{dbError}</p>
            <Button onClick={initializeSession}><RefreshCw className="w-4 h-4 ml-2 inline-block" /> إعادة المحاولة</Button>
          </div>
        </Card>
      </div>
    );
  }

  // ═════ شاشة بدء الوردية ═════
  if (!currentSession && !dbError && !loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="max-w-2xl mx-auto mt-12 text-center animate-fade-in">
          <div className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100">
            <Shield className="w-20 h-20 text-indigo-500 mx-auto mb-6 opacity-20" />
            <h2 className="text-2xl font-extrabold text-slate-800 mb-2">تسجيل الدخول للوردية</h2>
            <p className="text-slate-500 mb-8">يجب بدء وردية جديدة للتمكن من تسجيل حركة الزوار والموظفين.</p>

            <div className="flex gap-4 max-w-sm mx-auto mb-8">
              <Input placeholder="اسم الحارس..." value={gkName} onChange={(e) => setGkName(e.target.value)} />
              <Input placeholder="الرمز (3 أرقام)" type="password" maxLength={3} value={gkPin} onChange={(e) => setGkPin(e.target.value.replace(/\D/g, ''))} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <button disabled={!isMorningValid} onClick={() => handleStartShift('morning', 'صباحي')}
                className={`group p-6 rounded-2xl border-2 transition-all text-center ${isMorningValid ? 'border-slate-100 hover:border-amber-400 hover:bg-amber-50 cursor-pointer' : 'border-slate-100 opacity-50 bg-slate-50 cursor-not-allowed'}`}>
                <Sun className={`w-10 h-10 mx-auto mb-3 ${isMorningValid ? 'text-amber-500' : 'text-slate-400'}`} />
                <h3 className="font-bold text-slate-800 mb-1">الوردية الصباحية</h3>
                <p className="text-xs text-slate-500">08:00 ص - 04:00 م</p>
              </button>
              <button disabled={!isEveningValid} onClick={() => handleStartShift('evening', 'مسائي')}
                className={`group p-6 rounded-2xl border-2 transition-all text-center ${isEveningValid ? 'border-slate-100 hover:border-indigo-400 hover:bg-indigo-50 cursor-pointer' : 'border-slate-100 opacity-50 bg-slate-50 cursor-not-allowed'}`}>
                <Clock className={`w-10 h-10 mx-auto mb-3 ${isEveningValid ? 'text-indigo-500' : 'text-slate-400'}`} />
                <h3 className="font-bold text-slate-800 mb-1">الوردية المسائية</h3>
                <p className="text-xs text-slate-500">04:00 م - 12:00 ص</p>
              </button>
              <button disabled={!isNightValid} onClick={() => handleStartShift('night', 'ليلي')}
                className={`group p-6 rounded-2xl border-2 transition-all text-center ${isNightValid ? 'border-slate-100 hover:border-slate-800 hover:bg-slate-900 cursor-pointer' : 'border-slate-100 opacity-50 bg-slate-50 cursor-not-allowed'}`}>
                <Moon className={`w-10 h-10 mx-auto mb-3 ${isNightValid ? 'text-slate-700' : 'text-slate-400'}`} />
                <h3 className={`font-bold mb-1 ${isNightValid ? 'text-slate-800' : 'text-slate-500'}`}>الوردية الليلية</h3>
                <p className="text-xs text-slate-500">12:00 ص - 08:00 ص</p>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═════ الواجهة الرئيسية ═════
  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-800">🚪 نظام إدارة البوابة</h1>
        <p className="text-slate-500 text-xs sm:text-sm mt-1">تتبع دخول وخروج الزوار والموظفين</p>
      </div>

      {/* Session Info */}
      {currentSession && (
        <Card className="mb-6 bg-gradient-to-br from-indigo-600 to-purple-700 text-white">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-3 rounded-xl"><Shield className="w-6 h-6" /></div>
              <div>
                <h3 className="font-bold text-lg">{currentSession.session_name}</h3>
                <p className="text-white/90 text-sm mt-1">الحارس: {currentSession.gatekeeper_name}</p>
                <p className="text-white/70 text-xs mt-0.5">
                  ينتهي الدوام: {currentSession.expected_end_time ? new Date(currentSession.expected_end_time).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : 'غير محدد'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-center">
                <div className="text-3xl font-bold">{currentSession.visitor_count}</div>
                <div className="text-sm text-white/80">زائر اليوم</div>
              </div>
              <div className="flex flex-col gap-2">
                <Button onClick={() => currentSession.id && loadVisitors(currentSession.id)} className="!bg-white/20 !text-white hover:!bg-white/30 !border-none">
                  <RefreshCw className="w-4 h-4 ml-1" /> تحديث
                </Button>
                <div className="flex gap-2">
                  <Button onClick={handleRequestHandover} className="!bg-amber-500 hover:!bg-amber-600 !text-white !border-none text-xs">
                    <ArrowRightLeft className="w-3 h-3 ml-1" /> بديل طارئ
                  </Button>
                  <Button onClick={handleEndShift} className="!bg-red-500 hover:!bg-red-600 !text-white !border-none text-xs">
                    <LogOut className="w-3 h-3 ml-1" />
                    {currentSession.expected_end_time && new Date() < new Date(currentSession.expected_end_time) ? 'طلب إنهاء' : 'إنهاء الوردية'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* شاشة انتظار التبديل */}
      {currentSession?.handover_status === 'pending' && (
        <div className="max-w-xl mx-auto mt-12 text-center animate-fade-in">
          <Card className="bg-amber-50 border-amber-200 py-12">
            <BellRing className="w-20 h-20 text-amber-500 mx-auto mb-6 animate-pulse" />
            <h2 className="text-2xl font-extrabold text-amber-800 mb-2">في انتظار موافقة الموارد البشرية</h2>
            <p className="text-amber-700">تم إرسال طلب استبدال طارئ. الشاشة مقفلة حتى يتم الموافقة.</p>
          </Card>
        </div>
      )}

      {/* شاشة استلام الوردية */}
      {currentSession?.handover_status === 'approved' && (
        <div className="max-w-xl mx-auto mt-12 text-center animate-fade-in">
          <Card className="bg-indigo-50 border-indigo-200 py-12">
            <ArrowRightLeft className="w-20 h-20 text-indigo-500 mx-auto mb-6" />
            <h2 className="text-2xl font-extrabold text-indigo-800 mb-2">استلام الوردية</h2>
            <p className="text-indigo-600 mb-8">أدخل اسمك والرمز المؤقت من الموارد البشرية.</p>
            <div className="flex gap-3 max-w-sm mx-auto mb-6">
              <Input placeholder="اسم الحارس البديل" value={takeoverName} onChange={(e) => setTakeoverName(e.target.value)} />
              <Input placeholder="الرمز المؤقت" type="password" maxLength={3} value={takeoverPin} onChange={(e) => setTakeoverPin(e.target.value.replace(/\D/g, ''))} />
            </div>
            <Button onClick={handleTakeover} disabled={loading}>تأكيد واستلام الوردية</Button>
          </Card>
        </div>
      )}

      {/* شاشة انتظار إنهاء الوردية */}
      {currentSession?.handover_status === 'pending_end' && (
        <div className="max-w-xl mx-auto mt-12 text-center animate-fade-in">
          <Card className="bg-red-50 border-red-200 py-12">
            <BellRing className="w-20 h-20 text-red-500 mx-auto mb-6 animate-pulse" />
            <h2 className="text-2xl font-extrabold text-red-800 mb-2">في انتظار موافقة الإدارة</h2>
            <p className="text-red-700">تم إرسال طلب إنهاء مبكر. سيتم الإغلاق تلقائياً عند الموافقة.</p>
          </Card>
        </div>
      )}

      {/* الواجهة الرئيسية */}
      {currentSession && currentSession.handover_status !== 'pending' && currentSession.handover_status !== 'approved' && currentSession.handover_status !== 'pending_end' && (
        <>
          {/* أزرار التبويب */}
          <div className="flex gap-2 sm:gap-4 mb-6 border-b border-gray-200 pb-4 overflow-x-auto hide-scrollbar">
            {(user?.gatekeeper_type === 'both' || !user?.gatekeeper_type || user?.gatekeeper_type === 'visitor_movement') && (
              <button onClick={() => setActiveTab('visitors')}
                className={`flex-1 sm:flex-none px-4 sm:px-6 py-2.5 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${activeTab === 'visitors' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-200'}`}>
                <Users className="w-5 h-5 inline-block ml-2" /> زوار البوابة
              </button>
            )}
            {(user?.gatekeeper_type === 'both' || !user?.gatekeeper_type || user?.gatekeeper_type === 'employee_movement') && (
              <button onClick={() => setActiveTab('employees')}
                className={`flex-1 sm:flex-none px-4 sm:px-6 py-2.5 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${activeTab === 'employees' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-200'}`}>
                <ArrowRightLeft className="w-5 h-5 inline-block ml-2" /> حركة الموظفين
              </button>
            )}
          </div>

          {/* قسم زوار البوابة */}
          {activeTab === 'visitors' && (
            <>
              <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
                <div className="relative flex-1 w-full sm:max-w-md">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input placeholder="بحث بالاسم أو الهاتف أو الشركة..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pr-10" />
                </div>
                <Button onClick={() => setShowModal(true)} className="btn-primary"><UserPlus className="w-5 h-5 ml-1" /> تسجيل زائر</Button>
              </div>

              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="table-header">#</th><th className="table-header">الاسم</th><th className="table-header">الهاتف</th>
                        <th className="table-header">الشركة</th><th className="table-header">الغرض</th><th className="table-header">الموقع</th>
                        <th className="table-header">وقت الدخول</th><th className="table-header">الحالة</th><th className="table-header">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVisitors.length === 0 ? (
                        <tr><td colSpan={9} className="text-center py-12"><Users className="w-16 h-16 mx-auto mb-4 text-gray-300" /><p className="text-gray-500">لا توجد سجلات حتى الآن</p></td></tr>
                      ) : (
                        filteredVisitors.map((log, index) => (
                          <tr key={log.id} className="table-row">
                            <td className="table-cell">{index + 1}</td>
                            <td className="table-cell font-medium">{log.visitor?.name}</td>
                            <td className="table-cell">{log.visitor?.phone}</td>
                            <td className="table-cell">{log.visitor?.company || '-'}</td>
                            <td className="table-cell">{log.visitor?.purpose || '-'}</td>
                            <td className="table-cell">{log.visitor?.location || '-'}</td>
                            <td className="table-cell"><div className="flex items-center gap-2"><Clock className="w-4 h-4 text-gray-400" />{new Date(log.check_in_time).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</div></td>
                            <td className="table-cell">{log.status === 'checked_in' ? <span className="badge-success">✓ داخل المبنى</span> : <span className="badge-gray">⊗ خرج</span>}</td>
                            <td className="table-cell">
                              <div className="flex items-center gap-2">
                                <button onClick={() => handleEdit(log)} className="p-2 hover:bg-blue-50 rounded-lg transition-colors" title="تعديل"><Edit className="w-4 h-4 text-blue-600" /></button>
                                {log.status === 'checked_in' && <button onClick={() => handleCheckout(log)} className="p-2 hover:bg-orange-50 rounded-lg transition-colors" title="تسجيل خروج"><LogOut className="w-4 h-4 text-orange-600" /></button>}
                                <button onClick={() => handleDelete(log)} className="p-2 hover:bg-red-50 rounded-lg transition-colors" title="حذف"><Trash2 className="w-4 h-4 text-red-600" /></button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {/* قسم حركة الموظفين */}
          {activeTab === 'employees' && (
            <>
              <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
                <div className="relative flex-1 w-full sm:max-w-md">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input placeholder="بحث باسم الموظف..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pr-10" />
                </div>
                <Button onClick={() => setShowMovementModal(true)} className="btn-primary"><UserPlus className="w-5 h-5 ml-1" /> تسجيل خروج موظف</Button>
              </div>

              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="table-header">#</th><th className="table-header">اسم الموظف</th><th className="table-header">القسم</th>
                        <th className="table-header">الوجهة</th><th className="table-header">التصريح</th><th className="table-header">وقت الخروج</th>
                        <th className="table-header">وقت العودة</th><th className="table-header">المدة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMovements.length === 0 ? (
                        <tr><td colSpan={8} className="text-center py-12"><ArrowRightLeft className="w-16 h-16 mx-auto mb-4 text-gray-300" /><p className="text-gray-500">لا توجد حركات خروج اليوم</p></td></tr>
                      ) : (
                        filteredMovements.map((log, index) => {
                          const emp = employees.find((e) => e.id === log.employee_id);
                          const isApproved = log.notes?.includes('[تصريح من المشرف:');
                          return (
                            <tr key={log.id} className="table-row">
                              <td className="table-cell">{index + 1}</td>
                              <td className="table-cell font-bold">{emp?.full_name || log.employee_name || 'غير معروف'}</td>
                              <td className="table-cell">{log.department || '-'}</td>
                              <td className="table-cell"><span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold">{log.destination}</span></td>
                              <td className="table-cell">{isApproved ? <span className="badge-success">✓ مصرح</span> : <span className="badge-gray">بدون تصريح</span>}</td>
                              <td className="table-cell">{new Date(log.departure_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</td>
                              <td className="table-cell">
                                {log.returned_at ? (
                                  <span className="text-emerald-600 font-bold">{new Date(log.returned_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>
                                ) : (
                                  <Button size="sm" variant="outline" onClick={() => { setArrivalData({ id: log.id, employee_name: (log as any).employee_name, destination: log.destination, notes: log.notes } as any); setActualLocation('عاد لمكان الخروج'); setShowArrivalModal(true); }} className="text-xs">تسجيل عودة</Button>
                                )}
                              </td>
                              <td className="table-cell font-bold">{calculateDuration(log.departure_at, log.returned_at ?? null)}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </>
      )}

      {/* Modal تسجيل زائر */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold mb-4">{editingVisitor ? '✏️ تعديل بيانات الزائر' : '➕ تسجيل زائر جديد'}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input required placeholder="الاسم الكامل" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              <Input required placeholder="رقم الهاتف" type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              <Input placeholder="الشركة / الجهة" value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} />
              <Input placeholder="الغرض من الزيارة" value={formData.purpose} onChange={(e) => setFormData({ ...formData, purpose: e.target.value })} />
              <Input placeholder="الموقع / الوجهة" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} />
              <textarea placeholder="ملاحظات إضافية" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="input-field min-h-[80px] resize-y w-full" />
              <div className="flex gap-3">
                <Button type="submit" disabled={loading} className="flex-1">{loading ? 'جاري الحفظ...' : editingVisitor ? '💾 حفظ التعديلات' : '✓ تسجيل الزائر'}</Button>
                <Button type="button" variant="secondary" onClick={resetForm} className="flex-1">إلغاء</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal تسجيل خروج موظف */}
      {showMovementModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold mb-4">🏃 تسجيل خروج موظف</h3>
            <form onSubmit={handleMovementSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">اسم الموظف *</label>
                <input type="text" required list="employees-list" placeholder="ابحث عن الموظف..." value={movementForm.employee_name}
                  onChange={(e) => {
                    const val = e.target.value;
                    const emp = employees.find((em) => em.full_name === val);
                    setMovementForm({ ...movementForm, employee_name: val, employee_id: emp ? emp.id : '', department: emp?.department || movementForm.department });
                  }}
                  className={`w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 transition-all ${movementForm.employee_name ? (movementForm.employee_id ? 'border-emerald-400 focus:ring-emerald-100' : 'border-red-400 focus:ring-red-100') : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-100'}`} />
                <datalist id="employees-list">
                  {employees.map((emp) => (<option key={emp.id} value={emp.full_name || ''} />))}
                </datalist>
                {movementForm.employee_name && (
                  <p className={`text-xs mt-1 font-semibold ${movementForm.employee_id ? 'text-emerald-600' : 'text-red-500'}`}>
                    {movementForm.employee_id ? '✓ تم التعرف على الموظف' : '⚠ الاسم غير مسجل في النظام'}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">القسم *</label>
                <select value={movementForm.department} onChange={(e) => setMovementForm({ ...movementForm, department: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400">
                  <option value="الإنتاج">الإنتاج</option><option value="الموارد البشرية (HR)">الموارد البشرية</option>
                  <option value="ضبط الجودة (QC)">ضبط الجودة</option><option value="المستودعات">المستودعات</option>
                  <option value="الصيانة">الصيانة</option><option value="تقنية المعلومات (IT)">تقنية المعلومات</option><option value="مخصص">مخصص (أخرى)</option>
                </select>
              </div>

              {movementForm.department === 'مخصص' && (<Input required placeholder="اكتب القسم..." value={movementForm.customDepartment} onChange={(e) => setMovementForm({ ...movementForm, customDepartment: e.target.value })} />)}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">الوجهة *</label>
                <select value={movementForm.destination} onChange={(e) => setMovementForm({ ...movementForm, destination: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400">
                  <option value="الكافتيريا">الكافتيريا</option><option value="العيادة">العيادة</option>
                  <option value="الموارد البشرية">الموارد البشرية</option><option value="البوابة الخارجية">البوابة الخارجية</option><option value="مخصص">مخصص (أخرى)</option>
                </select>
              </div>

              {movementForm.destination === 'مخصص' && (<Input required placeholder="حدد الوجهة..." value={movementForm.customDestination} onChange={(e) => setMovementForm({ ...movementForm, customDestination: e.target.value })} />)}

              <textarea placeholder="ملاحظات..." value={movementForm.notes} onChange={(e) => setMovementForm({ ...movementForm, notes: e.target.value })} className="w-full min-h-[80px] resize-y bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-400" />

              <div className="flex gap-3">
                <Button type="submit" disabled={loading} className="flex-1">{loading ? 'جاري التسجيل...' : '✓ تسجيل الخروج'}</Button>
                <Button type="button" variant="secondary" onClick={() => setShowMovementModal(false)} className="flex-1">إلغاء</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal تسجيل العودة */}
      {showArrivalModal && arrivalData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold mb-4">📍 تسجيل عودة موظف</h3>
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl mb-4">
              <p className="text-sm text-amber-800">
                الموظف: <strong>{arrivalData.employee_name || 'غير معروف'}</strong><br />
                صرّح بالذهاب إلى: <span className="text-lg font-black text-amber-600">{arrivalData.destination}</span>
              </p>
            </div>
            <form onSubmit={handleConfirmArrival} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">أين وصل الموظف فعلياً؟ *</label>
                <select required value={actualLocation} onChange={(e) => setActualLocation(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-400">
                  <option value="عاد لمكان الخروج">عاد لنفس مكان الخروج (رجوع طبيعي)</option>
                  <option value="الكافتيريا">وصل إلى الكافتيريا</option>
                  <option value="العيادة">وصل إلى العيادة</option>
                  <option value="الموارد البشرية">وصل إلى الموارد البشرية</option>
                  <option value="البوابة الخارجية">وصل إلى البوابة الخارجية</option>
                </select>
              </div>
              <div className="flex gap-3">
                <Button type="submit" disabled={loading} className="flex-1">{loading ? 'جاري التسجيل...' : '✓ تأكيد الوصول'}</Button>
                <Button type="button" variant="secondary" onClick={() => setShowArrivalModal(false)} className="flex-1">إلغاء</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}