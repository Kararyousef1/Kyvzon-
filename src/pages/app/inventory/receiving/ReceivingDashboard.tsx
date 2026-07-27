import { ReceivingDashboard as ReceivingOverview } from './ReceivingShared';
import { InventoryUnitNav } from '../shared/InventoryUnitNav';
import { InventoryUnitActivity } from '../shared/InventoryUnitActivity';
export default function ReceivingDashboard(){return <><InventoryUnitNav unit="receiving"/><InventoryUnitActivity unit="receiving"/><ReceivingOverview/></>}
