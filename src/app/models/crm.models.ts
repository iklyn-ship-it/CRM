export interface Client {
  id: string;
  name: string;
  phone: string;
  source: string;
  type: string;
  notes: string;
}

export interface Equipment {
  id: string;
  name: string;
  type: string;
  code: string;
  defaultRate: number;
  status: 'free' | 'busy' | 'repair';
}

export interface Operator {
  id: string;
  name: string;
  phone: string;
  skill: string;
  rate: number;
  workStatus: OperatorWorkStatus;
}

export type OperatorWorkStatus = 'active' | 'sick_leave' | 'dismissed';

export interface Order {
  id: string;
  clientId: string;
  equipmentId: string;
  operatorId: string;
  startDate: string;
  endDate: string;
  location: string;
  rate: number;
  status: OrderStatus;
  notes: string;
  createdAt: string;
  equipmentIdleDates: string[];
  operatorIdleDates: string[];
  logisticsEnabled: boolean;
  logisticsProvider: 'own_trawl' | 'third_party' | 'self_drive';
  logisticsTrailerId: string;
  logisticsStartDate: string;
  logisticsEndDate: string;
  logisticsDistanceKm: number;
  logisticsPricePerKm: number;
  logisticsCost: number;
  logisticsPickupPricePerKm: number;
  logisticsDeliveryPricePerKm: number;
  logisticsPickupKm: number;
  logisticsDeliveryKm: number;
  logisticsPickupCost: number;
  logisticsDeliveryCost: number;
  breakdownEnabled: boolean;
  breakdownDate: string;
  breakdownEndDate: string;
  breakdownStatus: BreakdownStatus;
  breakdownDescription: string;
  breakdownReporter: string;
  breakdownResponsible: string;
  breakdownFaultParty: BreakdownFaultParty;
  breakdownAffectsPayment: boolean;
  breakdownOperatorIdle: boolean;
  breakdownLaborCost: number;
  breakdownPartsCost: number;
  breakdownCreateRepair: boolean;
  breakdownRepairId: string;
}

export type OrderStatus = 'new' | 'confirmed' | 'active' | 'completed' | 'cancelled';
export type BreakdownStatus = 'reported' | 'diagnostics' | 'repair' | 'resolved';
export type BreakdownFaultParty = 'unknown' | 'ours' | 'client' | 'operator';

export interface Repair {
  id: string;
  equipmentId: string;
  startDate: string;
  endDate: string;
  status: RepairStatus;
  laborCost: number;
  partsCost: number;
  responsible: string;
  tasks: string;
  notes: string;
}

export type RepairStatus = 'planned' | 'active' | 'completed' | 'cancelled';

export interface Transport {
  id: string;
  shipperClientId: string;
  consigneeClientId: string;
  shipper: string;
  consignee: string;
  startDate: string;
  endDate: string;
  loadingPoint: string;
  unloadingPoint: string;
  equipmentId: string;
  driverId: string;
  cargoName: string;
  notes: string;
  status: TransportStatus;
  pickupPricePerKm: number;
  deliveryPricePerKm: number;
  pickupKm: number;
  deliveryKm: number;
  pickupCost: number;
  deliveryCost: number;
  createdAt: string;
}

export type TransportStatus = 'new' | 'active' | 'completed' | 'cancelled';

export interface FinanceOperation {
  id: string;
  date: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  orderId: string;
  repairId: string;
  comment: string;
}

export interface AuditLogChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorEmail: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  action: 'create' | 'update' | 'delete';
  summary: string;
  changes: AuditLogChange[];
  createdAt: string;
}

export interface Integrations {
  googleFormsUrl: string;
  autoSync: boolean;
  importedResponseIds: string[];
  lastSyncAt: string;
  lastSyncStatus: string;
}

export interface CrmState {
  clients: Client[];
  equipment: Equipment[];
  operators: Operator[];
  orders: Order[];
  transports: Transport[];
  operations: FinanceOperation[];
  repairs: Repair[];
  calendarDate: string;
  chartMode: string;
  calendarMode: string;
  integrations: Integrations;
}

export interface GoogleFormResponse {
  responseId: string;
  submittedAt: string;
  clientName: string;
  clientPhone: string;
  clientSource: string;
  clientNotes: string;
  equipmentName: string;
  equipmentCode: string;
  operatorName: string;
  startDate: string;
  endDate: string;
  location: string;
  rate: number;
  notes: string;
  sourceLabel: string;
}

export interface EquipmentAnalytics {
  name: string;
  income: number;
  expense: number;
  profit: number;
}

export interface CalendarEvent {
  id: string;
  type: 'rent' | 'repair';
  status?: string;
  title: string;
  equipmentId: string;
  equipmentName: string;
  startDate: string;
  endDate: string;
  conflict: boolean;
}

export interface LocalBackup {
  id: string;
  reason: string;
  createdAt: string;
  data: CrmState;
}
