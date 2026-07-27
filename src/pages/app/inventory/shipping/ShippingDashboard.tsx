import { ShippingPage } from './ShippingShared';
import { InventoryUnitNav } from '../shared/InventoryUnitNav';
import { InventoryUnitActivity } from '../shared/InventoryUnitActivity';
export default function ShippingDashboard(){return <><InventoryUnitNav unit="shipping"/><InventoryUnitActivity unit="shipping"/><ShippingPage type="dashboard"/></>}
