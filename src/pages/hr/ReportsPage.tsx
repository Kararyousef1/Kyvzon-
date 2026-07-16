import { useState } from 'react';
import { Download, FileText, Calendar } from 'lucide-react';
import Card from '../../shared/components/ui/Card';
import Badge from '../../shared/components/ui/Badge';
import Button from '../../shared/components/ui/Button';
import { useUIStore } from '../../core/stores';
import { format } from 'date-fns';
import { incidentService } from '../../services/sdk/IncidentService';
import { wellnessEntryService } from '../../services/sdk/WellnessService';
import { workforceAnalyticsService } from '../../services/sdk/WorkforceAnalyticsService';
import { employeeContractService, criticalPositionService } from '../../services/sdk';

const reports = [
  { id: '1', title: 'تقرير المشاكل الشهري - ديسمبر 2024', type: 'problems', date: '2024-12-01', format: 'Excel' },
  { id: '2', title: 'تقرير الصحة النفسية الربعي', type: 'wellness', date: '2024-11-01', format: 'Excel' },
  { id: '3', title: 'تقرير رضا الموظفين السنوي 2024', type: 'satisfaction', date: '2024-10-01', format: 'Excel' },
  { id: '4', title: 'تقرير الأداء - الربع الثالث', type: 'performance', date: '2024-09-01', format: 'Excel' },
  { id: '5', title: 'تقرير التحليل الذكي للمشاعر', type: 'sentiment', date: '2024-08-01', format: 'Excel' },
  { id: '6', title: 'تقرير مؤشرات القوى العاملة', type: 'workforce', date: format(new Date(), 'yyyy-MM-dd'), format: 'CSV' },
  { id: '7', title: 'تقرير عقود الموظفين', type: 'contracts', date: format(new Date(), 'yyyy-MM-dd'), format: 'CSV' },
  { id: '8', title: 'تقرير تخطيط التعاقب', type: 'succession', date: format(new Date(), 'yyyy-MM-dd'), format: 'CSV' },
];

const typeColors: Record<string, string> = {
  problems: 'bg-red-50 text-red-600',
  wellness: 'bg-rose-50 text-rose-600',
  satisfaction: 'bg-indigo-50 text-indigo-600',
  performance: 'bg-emerald-50 text-emerald-600',
  sentiment: 'bg-purple-50 text-purple-600',
};

export default function ReportsPage() {
  const { addToast } = useUIStore();
  const [generating, setGenerating] = useState<string | null>(null);

  const handleGenerate = async (reportId: string, reportType: string) => {
    setGenerating(reportId);
    try {
      let headers: string[] = [];
      let rows: string[][] = [];

      if (reportType === 'problems') {
        const incidents = await incidentService.findAll({ orderBy: 'created_at', ascending: false });
        headers = ['العنوان', 'الحالة', 'التاريخ'];
        rows = (incidents || []).map((inc: any) => [
          inc.title || '',
          inc.status || '',
          inc.created_at ? format(new Date(inc.created_at), 'yyyy/MM/dd') : '',
        ]);
      } else if (reportType === 'wellness') {
        const entries = await wellnessEntryService.findAllEntries();
        headers = ['التاريخ', 'المزاج', 'الدرجة'];
        rows = (entries || []).map((e: any) => [
          e.date || '',
          e.mood || '',
          String(e.score || 0),
        ]);
      } else if (reportType === 'workforce') {
        const summary = await workforceAnalyticsService.getSummary();
        headers = ['المؤشر', 'القيمة', 'تاريخ التوليد'];
        rows = [
          ['إجمالي الموظفين', String(summary.totalEmployees), summary.generatedAt],
          ['الموظفون النشطون', String(summary.activeEmployees), summary.generatedAt],
          ['معدل الحضور', `${summary.attendanceRate}%`, summary.generatedAt],
          ['معدل الغياب', `${summary.absenteeismRate}%`, summary.generatedAt],
          ['معدل التأخير', `${summary.lateRate}%`, summary.generatedAt],
          ['البلاغات المفتوحة', String(summary.openIncidents), summary.generatedAt],
          ['عقود قريبة الانتهاء', String(summary.contractsExpiring30Days), summary.generatedAt],
          ['تغطية التعاقب', `${summary.successionCoverageRate}%`, summary.generatedAt],
        ];
      } else if (reportType === 'contracts') {
        const contracts = await employeeContractService.findAll({ orderBy: 'end_date', ascending: true });
        headers = ['رقم العقد', 'الموظف', 'النوع', 'البداية', 'النهاية', 'الحالة'];
        rows = (contracts || []).map((c: any) => [c.contract_number || '', c.employee_id || '', c.contract_type || '', c.start_date || '', c.end_date || '', c.status || '']);
      } else if (reportType === 'succession') {
        const positions = await criticalPositionService.findAll({ orderBy: 'created_at', ascending: false });
        headers = ['المنصب', 'مستوى الخطر', 'الشاغل الحالي', 'الحالة'];
        rows = (positions || []).map((p: any) => [p.title || '', p.risk_level || '', p.incumbent_employee_id || '', p.status || '']);
      } else {
        headers = ['الاسم', 'القيمة', 'التاريخ'];
        rows = [['بيانات تجريبية', '—', '—']];
      }

      const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;
      const csvContent = [headers.join(','), ...rows.map(r => r.map(escapeCsv).join(','))].join('\n');
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `تقرير_${reportType}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addToast('✅ تم إنشاء التقرير بنجاح', 'success');
    } catch (err) {
      console.error('Error generating report:', err);
      addToast('❌ فشل إنشاء التقرير', 'error');
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-800 flex items-center gap-2">
            <FileText className="text-indigo-600" /> التقارير
          </h2>
          <p className="text-slate-500 text-sm mt-1">إنشاء وتحميل تقارير النظام المختلفة</p>
        </div>
      </div>

      <div className="grid gap-4">
        {reports.map((report) => (
          <Card key={report.id} hover>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${typeColors[report.type] || 'bg-slate-100 text-slate-600'}`}>
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">{report.title}</h3>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Calendar size={12} /> {report.date}</span>
                    <Badge variant="primary" size="sm">{report.format}</Badge>
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => handleGenerate(report.id, report.type)}
                loading={generating === report.id}
                icon={<Download size={14} />}
                iconPosition="left"
              >
                تحميل
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}