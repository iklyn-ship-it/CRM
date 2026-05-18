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
  hourlyRate: number;
  engineHours: number;
  status: "free" | "busy" | "repair";
}

export interface Operator {
  id: string;
  name: string;
  phone: string;
  skill: string;
  rate: number;
  hourlyRate: number;
  workStatus: OperatorWorkStatus;
}

export type OperatorWorkStatus = "active" | "sick_leave" | "dismissed";

export interface OperatorShift {
  id: string;
  operatorId: string;
  startDate: string;
  endDate: string;
  idleDates: string[];
}

export interface Order {
  id: string;
  clientId: string;
  equipmentId: string;
  operatorId: string;
  startDate: string;
  endDate: string;
  location: string;
  rate: number;
  equipmentHourlyRate: number;
  equipmentEngineHoursStart: number;
  equipmentEngineHoursEnd: number;
  standardWorkHours: number;
  additionalWorkHours: number;
  operatorAdditionalWorkHours: number;
  vatEnabled: boolean;
  discountEnabled: boolean;
  discountType: "percent" | "amount";
  discountValue: number;
  status: OrderStatus;
  notes: string;
  createdAt: string;
  equipmentIdleDates: string[];
  operatorIdleDates: string[];
  operatorShifts: OperatorShift[];
  logisticsEnabled: boolean;
  logisticsProvider: "own_trawl" | "third_party" | "self_drive";
  logisticsTrailerId: string;
  logisticsStartDate: string;
  logisticsEndDate: string;
  logisticsReturnProvider: "own_trawl" | "third_party" | "self_drive";
  logisticsReturnTrailerId: string;
  logisticsReturnStartDate: string;
  logisticsReturnEndDate: string;
  logisticsDistanceKm: number;
  logisticsPricePerKm: number;
  logisticsCost: number;
  logisticsPickupPricePerKm: number;
  logisticsDeliveryPricePerKm: number;
  logisticsPickupKm: number;
  logisticsDeliveryKm: number;
  logisticsPickupCost: number;
  logisticsDeliveryCost: number;
  logisticsReturnPickupPricePerKm: number;
  logisticsReturnDeliveryPricePerKm: number;
  logisticsReturnPickupKm: number;
  logisticsReturnDeliveryKm: number;
  logisticsReturnPickupCost: number;
  logisticsReturnDeliveryCost: number;
  assemblyEnabled: boolean;
  assemblyDisassemblyDate: string;
  assemblyAssemblyDate: string;
  assemblyDisassemblyCost: number;
  assemblyAssemblyCost: number;
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

export type OrderStatus =
  | "new"
  | "confirmed"
  | "active"
  | "completed"
  | "cancelled";
export type BreakdownStatus =
  | "reported"
  | "diagnostics"
  | "repair"
  | "resolved";
export type BreakdownFaultParty = "unknown" | "ours" | "client" | "operator";

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

export type RepairStatus = "planned" | "active" | "completed" | "cancelled";

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

export type TransportStatus = "new" | "active" | "completed" | "cancelled";

export interface Project {
  id: string;
  name: string;
  clientId: string;
  startDate: string;
  endDate: string;
  status: ProjectStatus;
  budget: number;
  location: string;
  notes: string;
  createdAt: string;
}

export type ProjectStatus =
  | "new"
  | "active"
  | "paused"
  | "completed"
  | "cancelled";

export interface FinanceOperation {
  id: string;
  date: string;
  type: "income" | "expense";
  category: string;
  amount: number;
  orderId: string;
  repairId: string;
  transportId: string;
  equipmentId: string;
  billClient: boolean;
  markup: number;
  paid: boolean;
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
  action: "create" | "update" | "delete";
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
  projects: Project[];
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
  type: "rent" | "repair";
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
