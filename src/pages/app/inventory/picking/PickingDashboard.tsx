import { PickingPage } from './PickingShared';
import { InventoryUnitNav } from '../shared/InventoryUnitNav';
import { InventoryUnitActivity } from '../shared/InventoryUnitActivity';
export default function PickingDashboard(){return <><InventoryUnitNav unit="picking"/><InventoryUnitActivity unit="picking"/><PickingPage type="kpis"/></>}
