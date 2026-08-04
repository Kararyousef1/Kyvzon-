import { Outlet } from 'react-router-dom';
import { ProcurementUnitNav } from '../shared/ProcurementUnitNav';

export default function SuppliersLayout() {
  return (
    <div className="space-y-4" dir="rtl">
      <ProcurementUnitNav unit="suppliers" />
      <Outlet />
    </div>
  );
}
