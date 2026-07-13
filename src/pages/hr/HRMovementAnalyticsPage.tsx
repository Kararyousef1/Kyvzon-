/**
 * ════════════════════════════════════════════════════════════════
 *  HRMovementAnalyticsPage - تحليلات البوابة (نسخة مُصلحة)
 * ════════════════════════════════════════════════════════════════
 *
 *  🔧 الإصلاحات المُطبّقة:
 *  ─────────────────────────────────────────────────────────────────
 *  ✅ 14 استخدام any → 0 (أنواع سجلات صريحة لـ 5 جداول)
 *  ✅ إصلاح addToast(`...`) المكسور (3 مواضع)
 *  ✅ إصلاح exportToStyledExcel(...) المكسور (3 مواضع)
 *  ✅ إصلاح [audio.play](http://...) و [payload.new](http://...) artifacts
 *  ✅ (session: any) → GatekeeperSession
 *  ✅ catch blocks → getErrorMessage
 *  ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase/supabase';
import { userService } from '../../services/sdk/UserService';
import { gatekeeperSessionService, gatekeeperVisitorLogService, movementLogService } from '../../services/sdk/GatekeeperService';
import { reviewService } from '../../services/sdk/ReviewService';
import Card, { CardHeader, CardTitle } from '../../shared/components/ui/Card';
import Button from '../../shared/components/ui/Button';
import {
  Download, Users, ArrowRightLeft, Calendar, BarChart3, Clock,
  Loader, Archive, Search, BellRing, Key, Star, MessageSquare,
} from 'lucide-react';
import { format, subDays, startOfMonth, startOfYear, differenceInSeconds } from 'date-fns';
import { ar } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useUIStore } from '../../core/stores';
import { getErrorMessage } from '../../services/errors';

// ════════════════════════════════════════════════════
// أنواع السجلات (تحلّ محل any)
// ════════════════════════════════════════════════════

/** سجل من جدول movements_log */
interface MovementRecord {
  id: string | number;
  employee_id: string;
  employee_name?: string;
  department?: string;
  destination: string;
  departure_at: string;
  returned_at: string | null;
  notes?: string;
}

/** زائر من gatekeeper_visitors (مضمّن في VisitorLogRecord) */
interface VisitorInfo {
  name?: string;
  company?: string;
  purpose?: string;
  location?: string;
}

/** سجل من gatekeeper_visitor_logs */
interface VisitorLogRecord {
  id: string | number;
  session_id?: string;
  check_in_time: string;
  check_out_time?: string | null;
  visitor?: VisitorInfo;
}

/** سجل من gatekeeper_sessions */
interface GatekeeperSession {
  id: string | number;
  session_name: string;
  gatekeeper_name?: string;
  started_at: string;
  ended_at?: string | null;
  is_active?: boolean;
  handover_status?: string;
  temp_pin?: string;
  visitor_count?: number;
}

/** سجل من customer_reviews */
interface CustomerReview {
  id: string | number;
  customer_name?: string;
  customer_email?: string;
  product_name?: string;
  rating: number;
  review_text?: string;
  created_at: string;
}

/** موظف أساسي من profiles */
interface EmployeeBasic {
  id: string;
  full_name?: string;
  department?: string;
}

/** نقطة بيانات للرسم البياني */
interface ChartDataPoint {
  date: string;
  count: number;
}

type TimeFilter = 'today' | '7days' | '10days' | 'month' | 'year';

const VIOLATION_FLAG = '[مخالفة مسار 🚨]';
const ALERT_SOUND_URL = 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg';

// ════════════════════════════════════════════════════
// المكون الرئيسي
// ════════════════════════════════════════════════════

export default function HRMovementAnalyticsPage() {
  const { addToast } = useUIStore();
  const [activeTab, setActiveTab] = useState<'movements' | 'visitors' | 'archive_visitors' | 'archive_movements' | 'reviews'>('movements');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');
  const [loading, setLoading] = useState(true);
  const [archiveSearch, setArchiveSearch] = useState('');

  const [movementsData, setMovementsData] = useState<MovementRecord[]>([]);
  const [visitorsData, setVisitorsData] = useState<VisitorLogRecord[]>([]);
  const [reviewsData, setReviewsData] = useState<CustomerReview[]>([]);
  const [employees, setEmployees] = useState<EmployeeBasic[]>([]);
  const [archivedSessions, setArchivedSessions] = useState<GatekeeperSession[]>([]);
  const [pendingHandovers, setPendingHandovers] = useState<GatekeeperSession[]>([]);
  const [pendingEndRequests, setPendingEndRequests] = useState<GatekeeperSession[]>([]);

  // ── جلب البيانات + Realtime ───────────────────────────────────
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const now = new Date();
        let startDate = new Date();
        switch (timeFilter) {
          case 'today': startDate.setHours(0, 0, 0, 0); break;
          case '7days': startDate = subDays(now, 7); break;
          case '10days': startDate = subDays(now, 10); break;
          case 'month': startDate = startOfMonth(now); break;
          case 'year': startDate = startOfYear(now); break;
        }
        const dateStr = startDate.toISOString();

        const [emps, movs, vis, arch, handovers, endRequests, reviews] = await Promise.all([
          userService.findAllUsers(),
          movementLogService.findMovements({ fromDate: dateStr }),
          gatekeeperVisitorLogService.findVisitorLogs({ fromDate: dateStr }),
          gatekeeperSessionService.findEndedSessions(),
          gatekeeperSessionService.findAll({ filters: { is_active: true, handover_status: 'pending' } }),
          gatekeeperSessionService.findAll({ filters: { is_active: true, handover_status: 'pending_end' } }),
          reviewService.findLatest(100),
        ]);

        setEmployees((emps || []) as EmployeeBasic[]);
        setMovementsData((movs || []) as MovementRecord[]);
        setVisitorsData((vis || []) as VisitorLogRecord[]);
        setArchivedSessions((arch || []) as GatekeeperSession[]);
        setPendingHandovers((handovers || []) as GatekeeperSession[]);
        setPendingEndRequests((endRequests || []) as GatekeeperSession[]);
        setReviewsData((reviews || []) as CustomerReview[]);
      } catch (error) {
        console.error('Data load error:', getErrorMessage(error));
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // استماع لحظي لطلبات التبديل الطارئة
    const playAlert = () => {
      const audio = new Audio(ALERT_SOUND_URL);
      audio.play().catch(() => console.log('Audio play prevented by browser'));
    };

    const channel = supabase
      .channel('gatekeeper_alerts')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'gatekeeper_sessions', filter: 'handover_status=eq.pending' }, (payload) => {
        const newSession = payload.new as GatekeeperSession;
        setPendingHandovers((prev) => [...prev, newSession]);
        playAlert();
        addToast('🚨 طلب تبديل طارئ من البوابة!', 'warning');
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'gatekeeper_sessions', filter: 'handover_status=eq.pending_end' }, (payload) => {
        const newSession = payload.new as GatekeeperSession;
        setPendingEndRequests((prev) => [...prev, newSession]);
        playAlert();
        addToast('🚨 طلب إنهاء وردية مبكر من البوابة!', 'warning');
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [timeFilter, addToast]);

  // ── الموافقة على تبديل الحارس ─────────────────────────────────
  const handleApproveHandover = async (session: GatekeeperSession) => {
    const tempPin = Math.floor(100 + Math.random() * 900).toString();
    try {
      await gatekeeperSessionService.updateHandoverStatus(session.id.toString(), 'approved', tempPin);
      setPendingHandovers((prev) => prev.filter((s) => s.id !== session.id));
      addToast(`تمت الموافقة! الرمز المؤقت للحارس البديل: [ ${tempPin} ] — أخبره فوراً`, 'success');
    } catch (err) {
      addToast('فشل في الموافقة على الطلب: ' + getErrorMessage(err), 'error');
    }
  };

  // ── الموافقة على إنهاء الوردية ─────────────────────────────────
  const handleApproveEndShift = async (session: GatekeeperSession) => {
    try {
      await gatekeeperSessionService.endSession(session.id.toString());
      setPendingEndRequests((prev) => prev.filter((s) => s.id !== session.id));
      addToast('تم الموافقة على إنهاء الوردية', 'success');
    } catch (err) {
      addToast('فشل في الموافقة على الطلب: ' + getErrorMessage(err), 'error');
    }
  };

  // ── حساب المدة ────────────────────────────────────────────────
  const calculateDuration = (departure: string, returned: string | null): string => {
    if (!returned) return 'في الخارج ⏳';
    const totalSeconds = differenceInSeconds(new Date(returned), new Date(departure));
    if (totalSeconds < 1) return 'أقل من ثانية';
    if (totalSeconds < 60) return `${totalSeconds} ثانية`;

    const totalMinutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (totalMinutes < 60) {
      let result = `${totalMinutes} دقيقة`;
      if (seconds > 0) result += ` و ${seconds} ثانية`;
      return result;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    let result = `${hours} ساعة`;
    if (minutes > 0) result += ` و ${minutes} دقيقة`;
    return result;
  };

  // ── تصدير Excel المنسّق ───────────────────────────────────────
  const exportToStyledExcel = (filename: string, headers: string[], data: (string | number)[][]) => {
    const escapeXml = (unsafe: unknown): string => {
      if (unsafe === null || unsafe === undefined) return '';
      return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    };

    const getColumnWidth = (header: string): number => {
      if (header === '#') return 35;
      if (header.includes('هاتف') || header.includes('رقم')) return 130;
      if (header.includes('وقت') || header.includes('تاريخ')) return 160;
      if (header.includes('المدة') || header.includes('المستغرق')) return 140;
      if (header.includes('الاسم') || header.includes('الموظف') || header.includes('الزائر')) return 170;
      if (header.includes('ملاحظات') || header.includes('الغرض')) return 200;
      if (header.includes('الشركة') || header.includes('الوجهة') || header.includes('القسم')) return 160;
      if (header.includes('مخالفة')) return 150;
      if (header.includes('الحالة')) return 110;
      return 120;
    };

    const COLORS = {
      headerBg: '#1E1B4B', headerFont: '#FFFFFF', accentBorder: '#4F46E5',
      rowEvenBg: '#EEF2FF', rowOddBg: '#FFFFFF', rowFont: '#1E293B', rowSubFont: '#475569',
    };

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40">
  <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
    <Title>${escapeXml(filename)}</Title><Author>نظام الموارد البشرية</Author><Created>${new Date().toISOString()}</Created>
  </DocumentProperties>
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center" ss:Horizontal="Right" ss:ReadingOrder="RightToLeft"/><Font ss:FontName="Tahoma" ss:Size="10" ss:Color="${COLORS.rowFont}"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/></Borders></Style>
    <Style ss:ID="Header"><Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:ReadingOrder="RightToLeft" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="${COLORS.accentBorder}"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="${COLORS.accentBorder}"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="${COLORS.accentBorder}"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="${COLORS.accentBorder}"/></Borders><Font ss:FontName="Tahoma" ss:Size="12" ss:Color="${COLORS.headerFont}" ss:Bold="1"/><Interior ss:Color="${COLORS.headerBg}" ss:Pattern="Solid"/></Style>
    <Style ss:ID="RowEven"><Alignment ss:Vertical="Center" ss:Horizontal="Right" ss:ReadingOrder="RightToLeft" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/></Borders><Font ss:FontName="Tahoma" ss:Size="10" ss:Color="${COLORS.rowFont}"/><Interior ss:Color="${COLORS.rowEvenBg}" ss:Pattern="Solid"/></Style>
    <Style ss:ID="RowOdd"><Alignment ss:Vertical="Center" ss:Horizontal="Right" ss:ReadingOrder="RightToLeft" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/></Borders><Font ss:FontName="Tahoma" ss:Size="10" ss:Color="${COLORS.rowFont}"/><Interior ss:Color="${COLORS.rowOddBg}" ss:Pattern="Solid"/></Style>
    <Style ss:ID="NumberEven"><Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:ReadingOrder="RightToLeft"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/></Borders><Font ss:FontName="Tahoma" ss:Size="10" ss:Color="${COLORS.rowSubFont}" ss:Bold="1"/><Interior ss:Color="${COLORS.rowEvenBg}" ss:Pattern="Solid"/></Style>
    <Style ss:ID="NumberOdd"><Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:ReadingOrder="RightToLeft"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/></Borders><Font ss:FontName="Tahoma" ss:Size="10" ss:Color="${COLORS.rowSubFont}" ss:Bold="1"/><Interior ss:Color="${COLORS.rowOddBg}" ss:Pattern="Solid"/></Style>
  </Styles>
  <Worksheet ss:Name="البيانات">
    <Table ss:DefaultRowHeight="22" ss:DefaultColumnWidth="100">
      ${headers.map((h) => `<Column ss:Width="${getColumnWidth(h)}" ss:AutoFitWidth="0"/>`).join('\n      ')}
      <Row ss:Height="32">
        ${headers.map((h) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join('\n        ')}
      </Row>
      ${data.map((row, rowIndex) => {
        const isEven = rowIndex % 2 === 0;
        const rowStyle = isEven ? 'RowEven' : 'RowOdd';
        const numStyle = isEven ? 'NumberEven' : 'NumberOdd';
        const cells = row.map((cell, colIndex) => `<Cell ss:StyleID="${colIndex === 0 ? numStyle : rowStyle}"><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`).join('\n        ');
        return `<Row ss:AutoFitHeight="1">\n        ${cells}\n      </Row>`;
      }).join('\n      ')}
    </Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <DisplayRightToLeft/><RightToLeft>1</RightToLeft><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane>
      <Panes><Pane><Number>3</Number></Pane><Pane><Number>2</Number><ActiveRow>1</ActiveRow></Pane></Panes>
    </WorksheetOptions>
  </Worksheet>
</Workbook>`;

    const blob = new Blob(['\uFEFF' + xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.xls`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { document.body.removeChild(link); URL.revokeObjectURL(url); }, 100);
    addToast('تم تصدير الملف بنجاح', 'success');
  };

  // ── تصدير التبويب الحالي ──────────────────────────────────────
  const handleExport = () => {
    if (activeTab === 'movements') {
      const headers = ['#', 'الموظف', 'القسم / الصفة', 'الوجهة', 'وقت الخروج', 'وقت العودة', 'الوقت المستغرق', 'مخالفة مسار', 'ملاحظات'];
      const data: (string | number)[][] = movementsData.map((m, i) => {
        const emp = employees.find((e) => e.id === m.employee_id);
        const duration = calculateDuration(m.departure_at, m.returned_at);
        const hasViolation = m.notes?.includes(VIOLATION_FLAG);
        return [
          String(i + 1), emp?.full_name || m.employee_name || 'غير معروف', m.department || emp?.department || '-',
          m.destination, format(new Date(m.departure_at), 'yyyy/MM/dd hh:mm:ss a'),
          m.returned_at ? format(new Date(m.returned_at), 'yyyy/MM/dd hh:mm:ss a') : 'في الخارج',
          duration, hasViolation ? 'يوجد تلاعب بالمسار' : 'ملتزم',
          m.notes?.replace(VIOLATION_FLAG, '') || '',
        ];
      });
      exportToStyledExcel(`تحليل_حركة_الموظفين_${timeFilter}`, headers, data);
    } else if (activeTab === 'visitors') {
      const headers = ['#', 'الزائر', 'الشركة', 'الغرض', 'الموقع/الوجهة', 'تاريخ الدخول', 'تاريخ الخروج'];
      const data: (string | number)[][] = visitorsData.map((v, i) => [
        String(i + 1), v.visitor?.name || '', v.visitor?.company || '', v.visitor?.purpose || '', v.visitor?.location || '',
        format(new Date(v.check_in_time), 'yyyy/MM/dd hh:mm:ss a'),
        v.check_out_time ? format(new Date(v.check_out_time), 'yyyy/MM/dd hh:mm:ss a') : 'لم يخرج',
      ]);
      exportToStyledExcel(`تحليل_سجل_الزوار_${timeFilter}`, headers, data);
    } else if (activeTab === 'reviews') {
      const headers = ['#', 'العميل', 'البريد الإلكتروني', 'المنتج', 'التقييم', 'نص المراجعة', 'التاريخ'];
      const data: (string | number)[][] = reviewsData.map((r, i) => [
        String(i + 1), r.customer_name || '', r.customer_email || '', r.product_name || '',
        `${r.rating} نجوم`, r.review_text || '', format(new Date(r.created_at), 'yyyy/MM/dd hh:mm a'),
      ]);
      exportToStyledExcel(`مراجعات_العملاء_${timeFilter}`, headers, data);
    }
  };

  // ── تصدير أرشيف زوّار وردية ───────────────────────────────────
  const handleExportArchivedVisitors = async (session: GatekeeperSession) => {
    addToast(`جاري استخراج سجل الزوار لـ ${session.session_name}...`, 'info');
    try {
      const visData = await gatekeeperVisitorLogService.findVisitorLogs({ sessionId: session.id.toString() });
      const visRecords = (visData as VisitorLogRecord[] | null) || [];
      if (visRecords.length === 0) { addToast('لا يوجد زوار في هذه الوردية', 'warning'); return; }

      const vHeaders = ['#', 'الزائر', 'الشركة', 'الغرض', 'الموقع/الوجهة', 'تاريخ الدخول', 'تاريخ الخروج'];
      const vRows: (string | number)[][] = visRecords.map((v, i) => [
        String(i + 1), v.visitor?.name || '', v.visitor?.company || '', v.visitor?.purpose || '', v.visitor?.location || '',
        format(new Date(v.check_in_time), 'yyyy/MM/dd hh:mm:ss a'),
        v.check_out_time ? format(new Date(v.check_out_time), 'yyyy/MM/dd hh:mm:ss a') : 'لم يخرج',
      ]);
      exportToStyledExcel(`زوار_${session.session_name}`, vHeaders, vRows);
      addToast('تم تحميل أرشيف الزوار بنجاح', 'success');
    } catch (err) {
      console.error(getErrorMessage(err));
      addToast('فشل في تصدير الأرشيف', 'error');
    }
  };

  // ── تصدير أرشيف حركة موظفي وردية ──────────────────────────────
  const handleExportArchivedMovements = async (session: GatekeeperSession) => {
    addToast(`جاري استخراج حركة الموظفين لـ ${session.session_name}...`, 'info');
    try {
      const movData = await movementLogService.findMovements({ fromDate: session.started_at });
      const movRecords = (movData as MovementRecord[] | null) || [];
      if (movRecords.length === 0) { addToast('لا توجد حركات موظفين في هذه الوردية', 'warning'); return; }

      const mHeaders = ['#', 'الموظف', 'الوجهة', 'وقت الخروج', 'وقت العودة', 'مخالفة مسار'];
      const mRows: (string | number)[][] = movRecords.map((m, i) => {
        const emp = employees.find((e) => e.id === m.employee_id);
        const hasViolation = m.notes?.includes(VIOLATION_FLAG);
        return [
          String(i + 1), emp?.full_name || m.employee_name || 'غير معروف', m.destination,
          format(new Date(m.departure_at), 'yyyy/MM/dd hh:mm:ss a'),
          m.returned_at ? format(new Date(m.returned_at), 'yyyy/MM/dd hh:mm:ss a') : 'في الخارج',
          hasViolation ? 'يوجد تلاعب' : 'ملتزم',
        ];
      });
      exportToStyledExcel(`حركة_موظفين_${session.session_name}`, mHeaders, mRows);
      addToast('تم تحميل أرشيف حركة الموظفين بنجاح', 'success');
    } catch (err) {
      console.error(getErrorMessage(err));
      addToast('فشل في تصدير الأرشيف', 'error');
    }
  };

  // ── بيانات الرسم البياني ─────────────────────────────────────
  const getChartDataset = (): (MovementRecord | VisitorLogRecord)[] => {
    if (activeTab === 'movements') return movementsData;
    if (activeTab === 'visitors') return visitorsData;
    return [];
  };

  const chartData: ChartDataPoint[] = getChartDataset().reduce((acc: ChartDataPoint[], curr) => {
    const record = curr as MovementRecord & VisitorLogRecord;
    const dateStr = activeTab === 'movements' ? record.departure_at : record.check_in_time;
    if (!dateStr) return acc;
    const date = format(new Date(dateStr), 'dd MMM', { locale: ar });
    const existing = acc.find((item) => item.date === date);
    if (existing) existing.count += 1;
    else acc.push({ date, count: 1 });
    return acc;
  }, []).reverse();

  // ════════════════════════════════════════════════════
  // العرض
  // ════════════════════════════════════════════════════

  const tabButtonClass = (isActive: boolean, dark = false) =>
    `px-4 sm:px-5 py-2 rounded-xl font-bold text-sm sm:text-base transition-all flex items-center gap-2 ${isActive ? (dark ? 'bg-slate-800 text-white shadow-md' : 'bg-indigo-600 text-white shadow-md') : 'bg-white text-slate-500 hover:bg-slate-50'}`;

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {pendingEndRequests.length > 0 && (
          <div className="w-full bg-red-50 border-2 border-red-500 rounded-2xl p-4 mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-pulse">
            <div className="flex items-center gap-3">
              <Clock className="text-red-600 w-8 h-8" />
              <div>
                <h3 className="font-extrabold text-red-700">طلب إنهاء وردية مبكر!</h3>
                <p className="text-red-600 text-sm">الحارس {pendingEndRequests[0].gatekeeper_name} يطلب إنهاء ورديته قبل انتهاء الوقت.</p>
              </div>
            </div>
            <Button onClick={() => handleApproveEndShift(pendingEndRequests[0])} variant="danger" icon={<Clock size={16} />} iconPosition="left">موافقة وإغلاق الوردية</Button>
          </div>
        )}
        {pendingHandovers.length > 0 && (
          <div className="w-full bg-red-50 border-2 border-red-500 rounded-2xl p-4 mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-pulse">
            <div className="flex items-center gap-3">
              <BellRing className="text-red-600 w-8 h-8" />
              <div>
                <h3 className="font-extrabold text-red-700">طلب استبدال طارئ!</h3>
                <p className="text-red-600 text-sm">الحارس {pendingHandovers[0].gatekeeper_name} يطلب بديلاً للوردية.</p>
              </div>
            </div>
            <Button onClick={() => handleApproveHandover(pendingHandovers[0])} variant="danger" icon={<Key size={16} />} iconPosition="left">موافقة وتوليد رمز للبديل</Button>
          </div>
        )}
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2"><BarChart3 className="text-indigo-600" /> تحليلات البوابة وحركة الموظفين</h2>
          <p className="text-sm text-slate-500 mt-1">تصدير وتحليل البيانات الإحصائية للموارد البشرية</p>
        </div>

        {!activeTab.startsWith('archive') && (
          <div className="flex items-center gap-2">
            <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value as TimeFilter)} className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-indigo-400">
              <option value="today">اليوم</option>
              <option value="7days">آخر 7 أيام</option>
              <option value="10days">آخر 10 أيام</option>
              <option value="month">هذا الشهر</option>
              <option value="year">هذا العام</option>
            </select>
            <Button onClick={handleExport} variant="primary" icon={<Download size={16} />} iconPosition="left">تصدير Excel</Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-3 border-b border-slate-200 pb-4 flex-wrap">
        <button onClick={() => setActiveTab('movements')} className={tabButtonClass(activeTab === 'movements')}><ArrowRightLeft size={16} /> حركة الموظفين</button>
        <button onClick={() => setActiveTab('visitors')} className={tabButtonClass(activeTab === 'visitors')}><Users size={16} /> سجل الزوار</button>
        <button onClick={() => setActiveTab('archive_movements')} className={tabButtonClass(activeTab === 'archive_movements', true)}><Archive size={16} /> أرشيف الموظفين</button>
        <button onClick={() => setActiveTab('archive_visitors')} className={tabButtonClass(activeTab === 'archive_visitors', true)}><Archive size={16} /> أرشيف الزوار</button>
        <button onClick={() => setActiveTab('reviews')} className={tabButtonClass(activeTab === 'reviews')}><Star size={16} /> مراجعات العملاء</button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20 text-slate-500 gap-3"><Loader className="animate-spin" /> جاري تحليل البيانات...</div>
      ) : (activeTab === 'archive_visitors' || activeTab === 'archive_movements') ? (
        <Card>
          <CardHeader><CardTitle>📦 {activeTab === 'archive_visitors' ? 'أرشيف زوار البوابة' : 'أرشيف حركة الموظفين'}</CardTitle></CardHeader>
          <div className="relative mb-4">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="ابحث بالتاريخ أو اسم الوردية..." value={archiveSearch} onChange={(e) => setArchiveSearch(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-10 pl-4 py-2.5 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right whitespace-nowrap">
              <thead className="bg-slate-800 text-white">
                <tr>
                  <th className="p-3 font-bold rounded-tr-xl">اسم الوردية</th>
                  <th className="p-3 font-bold">وقت البداية</th>
                  <th className="p-3 font-bold">وقت الإغلاق</th>
                  {activeTab === 'archive_visitors' && <th className="p-3 font-bold">الزوار</th>}
                  <th className="p-3 font-bold rounded-tl-xl">تصدير للإكسل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {archivedSessions.filter((s) => s.session_name.includes(archiveSearch) || s.started_at.includes(archiveSearch)).map((session) => (
                  <tr key={session.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-bold text-slate-700">{session.session_name}</td>
                    <td className="p-3 text-slate-500 font-mono">{format(new Date(session.started_at), 'yyyy/MM/dd hh:mm a')}</td>
                    <td className="p-3 text-slate-500 font-mono">{session.ended_at ? format(new Date(session.ended_at), 'yyyy/MM/dd hh:mm a') : 'غير محدد'}</td>
                    {activeTab === 'archive_visitors' && <td className="p-3 font-bold text-indigo-600">{session.visitor_count}</td>}
                    <td className="p-3">
                      <Button size="xs" variant="outline" icon={<Download size={14} />} onClick={() => activeTab === 'archive_visitors' ? handleExportArchivedVisitors(session) : handleExportArchivedMovements(session)}>تحميل السجل</Button>
                    </td>
                  </tr>
                ))}
                {archivedSessions.length === 0 && <tr><td colSpan={activeTab === 'archive_visitors' ? 5 : 4} className="p-8 text-center text-slate-400">لا يوجد ورديات مغلقة في الأرشيف</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      ) : activeTab === 'reviews' ? (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><MessageSquare size={18} className="text-indigo-600" /> سجل مراجعات وتقييمات العملاء</CardTitle></CardHeader>
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm text-right whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500">
                <tr><th className="p-3 font-bold">العميل</th><th className="p-3 font-bold">المنتج</th><th className="p-3 font-bold">التقييم</th><th className="p-3 font-bold">المراجعة</th><th className="p-3 font-bold">التاريخ</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reviewsData.map((review) => (
                  <tr key={review.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3"><p className="font-semibold text-slate-700">{review.customer_name}</p><p className="text-xs text-slate-400">{review.customer_email}</p></td>
                    <td className="p-3 text-slate-600 font-medium">{review.product_name}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (<Star key={i} size={12} className={i < review.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'} />))}
                      </div>
                    </td>
                    <td className="p-3 text-slate-500 max-w-xs truncate" title={review.review_text}>{review.review_text}</td>
                    <td className="p-3 text-slate-400 font-mono text-xs">{format(new Date(review.created_at), 'yyyy/MM/dd hh:mm a')}</td>
                  </tr>
                ))}
                {reviewsData.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">لا توجد مراجعات مسجلة لهذه الفترة</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <>
          {/* ملخص الأرقام */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-200">
              <div className="flex items-center gap-3 mb-2"><div className="p-2 bg-indigo-200 rounded-lg text-indigo-700"><Calendar size={18} /></div><h3 className="font-bold text-indigo-900 text-sm">إجمالي السجلات</h3></div>
              <p className="text-3xl font-extrabold text-indigo-700">{activeTab === 'movements' ? movementsData.length : (activeTab === 'visitors' ? visitorsData.length : 0)}</p>
            </Card>
            {activeTab === 'movements' && (
              <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
                <div className="flex items-center gap-3 mb-2"><div className="p-2 bg-amber-200 rounded-lg text-amber-700"><Clock size={18} /></div><h3 className="font-bold text-amber-900 text-sm">لم يعودوا حتى الآن</h3></div>
                <p className="text-3xl font-extrabold text-amber-700">{movementsData.filter((m) => !m.returned_at).length}</p>
              </Card>
            )}
          </div>

          {/* الرسم البياني */}
          <Card>
            <CardHeader><CardTitle>📈 معدل الحركة حسب الأيام</CardTitle></CardHeader>
            <div className="h-64 w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px' }} />
                  <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} name="العدد" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* جدول المعاينة */}
          <Card>
            <CardHeader><CardTitle>📋 معاينة أحدث السجلات</CardTitle></CardHeader>
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm text-right whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="p-3 font-bold">الاسم</th>
                    {activeTab === 'movements' ? <th className="p-3 font-bold">الوجهة</th> : <th className="p-3 font-bold">الشركة</th>}
                    {activeTab === 'visitors' && <th className="p-3 font-bold">الموقع/الوجهة</th>}
                    <th className="p-3 font-bold">تاريخ الحركة</th>
                    {activeTab === 'movements' && <th className="p-3 font-bold">ملاحظات النظام</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(activeTab === 'movements' ? movementsData : visitorsData).slice(0, 10).map((row) => {
                    const r = row as MovementRecord & VisitorLogRecord;
                    const hasViolation = activeTab === 'movements' && r.notes?.includes(VIOLATION_FLAG);
                    return (
                      <tr key={r.id} className={`transition-colors ${hasViolation ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-slate-50'}`}>
                        <td className="p-3 font-semibold text-slate-700">
                          {activeTab === 'movements' ? (employees.find((e) => e.id === r.employee_id)?.full_name || r.employee_name || 'غير معروف') : r.visitor?.name}
                        </td>
                        <td className="p-3 text-slate-600">{activeTab === 'movements' ? r.destination : (r.visitor?.company || '-')}</td>
                        {activeTab === 'visitors' && <td className="p-3 text-slate-600">{r.visitor?.location || '-'}</td>}
                        <td className="p-3 text-slate-500 font-mono">{format(new Date(activeTab === 'movements' ? r.departure_at : r.check_in_time), 'yyyy/MM/dd hh:mm a')}</td>
                        {activeTab === 'movements' && (
                          <td className="p-3">
                            {hasViolation ? <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-1 rounded-md">🚨 مخالفة مسار</span> : <span className="text-xs text-slate-400">-</span>}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {(activeTab === 'movements' ? movementsData.length : visitorsData.length) === 0 && (
                    <tr><td colSpan={activeTab === 'movements' ? 4 : 3} className="p-6 text-center text-slate-400">لا توجد بيانات لهذه الفترة</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
