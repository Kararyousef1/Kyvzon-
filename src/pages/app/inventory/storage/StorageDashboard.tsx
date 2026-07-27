import { StorageDashboard as StorageOverview } from './StorageShared';
import { InventoryUnitNav } from '../shared/InventoryUnitNav';
import { InventoryUnitActivity } from '../shared/InventoryUnitActivity';
export default function StorageDashboard(){return <><InventoryUnitNav unit="storage"/><InventoryUnitActivity unit="storage"/><StorageOverview/></>}
