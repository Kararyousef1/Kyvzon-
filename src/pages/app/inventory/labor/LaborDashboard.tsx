import { LaborPage } from './LaborShared';
import { InventoryUnitNav } from '../shared/InventoryUnitNav';
import { InventoryUnitActivity } from '../shared/InventoryUnitActivity';
export default function LaborDashboard(){return <><InventoryUnitNav unit="labor"/><InventoryUnitActivity unit="labor"/><LaborPage type="dashboard"/></>}
