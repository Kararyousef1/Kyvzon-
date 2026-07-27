import { CountingPage } from './CountingShared';
import { InventoryUnitNav } from '../shared/InventoryUnitNav';
import { InventoryUnitActivity } from '../shared/InventoryUnitActivity';
export default function CountingDashboard(){return <><InventoryUnitNav unit="counting"/><InventoryUnitActivity unit="counting"/><CountingPage type="dashboard"/></>}
