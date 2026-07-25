import { useParams } from 'react-router-dom';
import Card from '../../../../shared/components/ui/Card';

export default function RequisitionDetailPage() {
  const { id } = useParams();
  return (
    <Card>
      <h2 className="font-bold text-lg">تفاصيل طلب الشراء {id}</h2>
      <p className="text-sm text-slate-500 mt-2">سيعرض: بنود + مرفقات + سير موافقة من الهيكل التنظيمي + تتبع حالة + سجل تدقيق + إشعارات — حسب تقرير 01.</p>
    </Card>
  );
}
