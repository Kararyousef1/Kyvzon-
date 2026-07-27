import { ReturnsPage } from './ReturnsShared';
import { InventoryUnitNav } from '../shared/InventoryUnitNav';
import { InventoryUnitActivity } from '../shared/InventoryUnitActivity';
export default function ReturnsDashboard(){return <><InventoryUnitNav unit="returns"/><InventoryUnitActivity unit="returns"/><ReturnsPage type="rmas"/></>}
