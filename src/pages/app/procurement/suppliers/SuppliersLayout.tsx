import { Outlet } from 'react-router-dom';

export default function SuppliersLayout() {
  return (
    <div className="space-y-4">
      <Outlet />
    </div>
  );
}
