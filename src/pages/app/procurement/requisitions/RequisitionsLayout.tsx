import { Outlet } from 'react-router-dom';
import { ProcurementUnitNav } from '../shared/ProcurementUnitNav';

export default function RequisitionsLayout() {
  return (
    <div className="space-y-4" dir="rtl">
      <ProcurementUnitNav unit="requisitions" />
      <Outlet />
    </div>
  );
}
