import { Outlet } from 'react-router-dom';
import { ProcurementUnitNav } from '../shared/ProcurementUnitNav';

export default function SourcingLayout() {
  return (
    <div className="space-y-4" dir="rtl">
      <ProcurementUnitNav unit="sourcing" />
      <Outlet />
    </div>
  );
}
