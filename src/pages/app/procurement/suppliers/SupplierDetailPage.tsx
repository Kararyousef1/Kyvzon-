import { useParams } from 'react-router-dom';
import Card from '../../../../shared/components/ui/Card';

export default function SupplierDetailPage() {
  const { id } = useParams();
  return (
    <Card>
      <h2 className="font-bold text-lg">تفاصيل المورد {id}</h2>
      <p className="text-sm text-slate-500 mt-2">سيتم تطوير 6 تبويب: معلومات, وثائق 90/30/0, جهات اتصال, مخاطر 5 أبعاد, زيارات ميدانية, إنفاق — حسب تقرير 03.</p>
    </Card>
  );
}
