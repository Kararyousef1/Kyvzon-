import { AnalyticsPage } from './AnalyticsShared';
import { InventoryUnitNav } from '../shared/InventoryUnitNav';
import { InventoryUnitActivity } from '../shared/InventoryUnitActivity';
export default function WarehouseAnalyticsDashboard(){return <><InventoryUnitNav unit="analytics"/><InventoryUnitActivity unit="analytics"/><AnalyticsPage type="executive"/></>}
