import { Component, computed, signal, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { NgClass, SlicePipe } from "@angular/common";
import {
  CommercialProposalDraft,
  CommercialProposalService,
  CrmDocumentType,
  ProposalRow,
} from "../../services/commercial-proposal.service";
import { StateService } from "../../services/state.service";
import { DbService } from "../../services/db.service";
import { UtilsService } from "../../services/utils.service";
import {
  BreakdownFaultParty,
  BreakdownStatus,
  Order,
  OperatorShift,
  OrderStatus,
  Transport,
} from "../../models/crm.models";

@Component({
  selector: "app-orders",
  standalone: true,
  imports: [FormsModule, NgClass, SlicePipe],
  templateUrl: "./orders.component.html",
  styleUrl: "./orders.component.css",
})
export class OrdersComponent {
  state = inject(StateService);
  db = inject(DbService);
  utils = inject(UtilsService);
  proposal = inject(CommercialProposalService);

  search = signal("");
  filterStatus = signal("");
  formOpen = signal(false);
  selectedOrder = signal<Order | null>(null);
  proposalEditorOpen = signal(false);
  expandedClientIds = signal<string[]>([]);
  editingId = "";
  proposalDraft: CommercialProposalDraft | null = null;
  readonly documentTypes = this.proposal.documentTypes;

  form = {
    clientId: "",
    equipmentId: "",
    operatorId: "",
    primaryOperatorStartDate: "",
    primaryOperatorEndDate: "",
    startDate: "",
    endDate: "",
    location: "",
    rate: 0,
    equipmentHourlyRate: 0,
    standardWorkHours: 8,
    additionalWorkHours: 0,
    vatEnabled: false,
    discountEnabled: false,
    discountType: "percent" as "percent" | "amount",
    discountValue: 0,
    status: "new" as OrderStatus,
    notes: "",
    equipmentIdleDates: [] as string[],
    operatorIdleDates: [] as string[],
    operatorShifts: [] as OperatorShift[],
    logisticsEnabled: false,
    logisticsProvider: "own_trawl" as
      | "own_trawl"
      | "third_party"
      | "self_drive",
    logisticsTrailerId: "",
    logisticsStartDate: "",
    logisticsEndDate: "",
    logisticsReturnProvider: "own_trawl" as
      | "own_trawl"
      | "third_party"
      | "self_drive",
    logisticsReturnTrailerId: "",
    logisticsReturnStartDate: "",
    logisticsReturnEndDate: "",
    logisticsDistanceKm: 0,
    logisticsPricePerKm: 0,
    logisticsCost: 0,
    logisticsPickupPricePerKm: 50,
    logisticsDeliveryPricePerKm: 250,
    logisticsPickupKm: 0,
    logisticsDeliveryKm: 0,
    logisticsPickupCost: 0,
    logisticsDeliveryCost: 0,
    logisticsReturnPickupPricePerKm: 50,
    logisticsReturnDeliveryPricePerKm: 250,
    logisticsReturnPickupKm: 0,
    logisticsReturnDeliveryKm: 0,
    logisticsReturnPickupCost: 0,
    logisticsReturnDeliveryCost: 0,
    assemblyEnabled: false,
    assemblyDisassemblyDate: "",
    assemblyAssemblyDate: "",
    assemblyDisassemblyCost: 0,
    assemblyAssemblyCost: 0,
    breakdownEnabled: false,
    breakdownDate: "",
    breakdownEndDate: "",
    breakdownStatus: "reported" as BreakdownStatus,
    breakdownDescription: "",
    breakdownReporter: "",
    breakdownResponsible: "",
    breakdownFaultParty: "unknown" as BreakdownFaultParty,
    breakdownAffectsPayment: true,
    breakdownOperatorIdle: true,
    breakdownLaborCost: 0,
    breakdownPartsCost: 0,
    breakdownCreateRepair: false,
    breakdownRepairId: "",
  };

  readonly statuses: { value: OrderStatus; label: string }[] = [
    { value: "new", label: "Новая" },
    { value: "confirmed", label: "Подтверждена" },
    { value: "active", label: "В работе" },
    { value: "completed", label: "Завершена" },
    { value: "cancelled", label: "Отменена" },
  ];

  readonly filterStatuses = [{ value: "", label: "Все" }, ...this.statuses];
  readonly breakdownStatuses: { value: BreakdownStatus; label: string }[] = [
    { value: "reported", label: "Зафиксирована" },
    { value: "diagnostics", label: "Диагностика" },
    { value: "repair", label: "Ремонт" },
    { value: "resolved", label: "Устранена" },
  ];
  readonly breakdownFaultParties: {
    value: BreakdownFaultParty;
    label: string;
  }[] = [
    { value: "unknown", label: "Не установлено" },
    { value: "ours", label: "Наша сторона" },
    { value: "client", label: "Клиент" },
    { value: "operator", label: "Оператор" },
  ];

  readonly conflictSet = computed(() => {
    const orderConflicts = this.state
      .orderConflicts()
      .flatMap((x) => [x[0], x[1]]);
    const transportConflicts = this.state
      .orderTransportConflicts()
      .map(([orderId]) => orderId);
    return new Set([...orderConflicts, ...transportConflicts]);
  });

  readonly operatorConflictSet = computed(() => {
    const orderConflicts = this.state
      .operatorConflicts()
      .flatMap((x) => [x[0], x[1]]);
    const transportConflicts = this.state
      .orderTransportOperatorConflicts()
      .map(([orderId]) => orderId);
    return new Set([...orderConflicts, ...transportConflicts]);
  });

  readonly repairConflictSet = computed(() => {
    return new Set(this.state.repairConflicts().map(([, orderId]) => orderId));
  });

  readonly completedUnpaidSet = computed(() => {
    return new Set(
      this.state
        .orders()
        .filter(
          (order) =>
            order.status === "completed" &&
            this.state.orderRemaining(order) > 0,
        )
        .map((order) => order.id),
    );
  });

  formOperatorConflict(): Order | null {
    const draft = this.formDraftOrder();
    const operatorIds = this.state.orderOperatorIds(draft);
    if (!operatorIds.length || !this.form.startDate || !this.form.endDate) {
      return null;
    }
    return (
      this.state.orders().find((order) => {
        if (
          order.id === this.editingId ||
          !this.state.orderBlocksSchedule(order)
        ) {
          return false;
        }
        return operatorIds.some(
          (operatorId) =>
            this.state.orderOperatorIds(order).includes(operatorId) &&
            this.state.ordersOverlapByOperator(draft, order, operatorId),
        );
      }) || null
    );
  }

  formTransportOperatorConflict(): Transport | null {
    const draft = this.formDraftOrder();
    const operatorIds = this.state.orderOperatorIds(draft);
    if (!operatorIds.length || !this.form.startDate || !this.form.endDate) {
      return null;
    }
    return (
      this.state
        .transports()
        .find(
          (transport) =>
            this.state.transportBlocksSchedule(transport) &&
            operatorIds.includes(transport.driverId) &&
            this.state.orderTransportOverlapByOperator(
              draft,
              transport,
              transport.driverId,
            ),
        ) || null
    );
  }

  formTransportEquipmentConflict(): Transport | null {
    if (!this.form.startDate || !this.form.endDate) return null;
    const draft = this.formDraftOrder();
    return (
      this.state.transports().find((transport) => {
        if (!this.state.transportBlocksSchedule(transport)) return false;
        return this.state
          .orderEquipmentReservationIds(draft)
          .some(
            (equipmentId) =>
              equipmentId === transport.equipmentId &&
              this.state.orderTransportOverlapByEquipment(
                draft,
                transport,
                equipmentId,
              ),
          );
      }) || null
    );
  }

  readonly filteredOrders = computed(() => {
    const q = this.search().toLowerCase();
    const fs = this.filterStatus();
    let list = [...this.state.orders()];
    if (fs) list = list.filter((o) => o.status === fs);
    if (q) {
      list = list.filter((o) => {
        const cl = (
          this.state.byId(this.state.clients(), o.clientId)?.name || ""
        ).toLowerCase();
        const eq = (
          this.state.byId(this.state.equipment(), o.equipmentId)?.name || ""
        ).toLowerCase();
        const loc = (o.location || "").toLowerCase();
        return (
          cl.includes(q) ||
          eq.includes(q) ||
          loc.includes(q) ||
          o.id.toLowerCase().includes(q)
        );
      });
    }
    return list.sort((a, b) => b.startDate.localeCompare(a.startDate));
  });

  readonly groupedOrders = computed(() => {
    const groups = new Map<string, Order[]>();
    this.filteredOrders().forEach((order) => {
      const key = order.clientId || "no-client";
      groups.set(key, [...(groups.get(key) || []), order]);
    });
    return [...groups.entries()]
      .map(([clientId, orders]) => ({
        clientId,
        clientName: this.clientName(clientId),
        orders,
        plan: orders.reduce(
          (sum, order) => sum + this.state.orderPlan(order),
          0,
        ),
        income: orders.reduce(
          (sum, order) => sum + this.state.orderIncome(order.id),
          0,
        ),
        expense: orders.reduce(
          (sum, order) => sum + this.state.orderExpense(order.id),
          0,
        ),
        profit: orders.reduce(
          (sum, order) => sum + this.state.orderProfit(order.id),
          0,
        ),
        remaining: orders.reduce(
          (sum, order) => sum + this.state.orderRemaining(order),
          0,
        ),
        endingSoon: orders.filter(
          (order) => this.orderEndingKind(order) === "soon",
        ).length,
        endingToday: orders.filter(
          (order) => this.orderEndingKind(order) === "today",
        ).length,
        overdue: orders.filter(
          (order) => this.orderEndingKind(order) === "overdue",
        ).length,
        latestDate: orders.reduce(
          (latest, order) =>
            order.startDate > latest ? order.startDate : latest,
          "",
        ),
      }))
      .sort((a, b) => b.latestDate.localeCompare(a.latestDate));
  });

  clientName(id: string): string {
    return this.state.byId(this.state.clients(), id)?.name || "—";
  }

  isClientExpanded(clientId: string): boolean {
    return this.expandedClientIds().includes(clientId);
  }

  toggleClientGroup(clientId: string): void {
    const ids = new Set(this.expandedClientIds());
    if (ids.has(clientId)) ids.delete(clientId);
    else ids.add(clientId);
    this.expandedClientIds.set([...ids]);
  }
  eqName(id: string): string {
    return this.state.byId(this.state.equipment(), id)?.name || "—";
  }
  operatorName(id: string): string {
    return this.state.byId(this.state.operators(), id)?.name || "—";
  }
  trawlEquipment() {
    return this.state
      .equipment()
      .filter((eq) => (eq.type || "").trim().toLowerCase().includes("трал"));
  }
  statusLabel(s: string): string {
    const labels: Record<string, string> = {
      new: "Новое",
      confirmed: "Подтверждена",
      active: "В работе",
      completed: "Завершена",
      cancelled: "Отменена",
    };
    return labels[s] || s;
  }

  orderEndingDaysLeft(order: Order): number {
    if (!order.endDate) return 9999;
    const today = new Date(this.utils.todayStr() + "T00:00:00").getTime();
    const end = new Date(order.endDate + "T00:00:00").getTime();
    return Math.ceil((end - today) / 86400000);
  }

  orderEndingKind(order: Order): "soon" | "today" | "overdue" | "" {
    if (order.status === "completed" || order.status === "cancelled") return "";
    const daysLeft = this.orderEndingDaysLeft(order);
    if (daysLeft < 0) return "overdue";
    if (daysLeft === 0) return "today";
    if (daysLeft <= 1) return "soon";
    return "";
  }

  orderEndingLabel(order: Order): string {
    const daysLeft = this.orderEndingDaysLeft(order);
    if (daysLeft < 0) return `Резерв просрочен на ${Math.abs(daysLeft)} дн.`;
    if (daysLeft === 0) return "Резерв заканчивается сегодня";
    return `До окончания резерва ${daysLeft} дн.`;
  }

  openCreate(): void {
    this.clearForm();
    this.selectedOrder.set(null);
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.clearForm();
    this.formOpen.set(false);
  }

  viewOrder(order: Order): void {
    this.selectedOrder.set(order);
  }

  closeDetails(): void {
    this.selectedOrder.set(null);
  }

  onEquipmentChange(): void {
    const eq = this.state.byId(this.state.equipment(), this.form.equipmentId);
    if (eq && !this.form.rate) this.form.rate = eq.defaultRate || 0;
    if (eq && !this.form.equipmentHourlyRate) {
      this.form.equipmentHourlyRate = eq.hourlyRate || 0;
    }
  }

  recalcLogisticsCost(): void {
    this.form.logisticsPickupCost =
      Number(this.form.logisticsPickupKm || 0) *
      Number(this.form.logisticsPickupPricePerKm || 0);
    this.form.logisticsDeliveryCost =
      Number(this.form.logisticsDeliveryKm || 0) *
      Number(this.form.logisticsDeliveryPricePerKm || 0);
    this.form.logisticsReturnPickupCost =
      Number(this.form.logisticsReturnPickupKm || 0) *
      Number(this.form.logisticsReturnPickupPricePerKm || 0);
    this.form.logisticsReturnDeliveryCost =
      Number(this.form.logisticsReturnDeliveryKm || 0) *
      Number(this.form.logisticsReturnDeliveryPricePerKm || 0);
    this.syncLogisticsTotals();
  }

  logisticsTotal(): number {
    if (!this.form.logisticsEnabled) return 0;
    return this.logisticsSubtotal();
  }

  orderDraftTotal(): number {
    const idleDates = new Set([
      ...this.form.equipmentIdleDates,
      ...(this.form.breakdownAffectsPayment ? this.breakdownDates() : []),
    ]);
    const workDays = this.orderDates().filter(
      (date) => !idleDates.has(date),
    ).length;
    const equipmentBase = Number(this.form.equipmentHourlyRate || 0)
      ? (workDays * Number(this.form.standardWorkHours || 8) +
          Number(this.form.additionalWorkHours || 0)) *
        Number(this.form.equipmentHourlyRate || 0)
      : workDays * Number(this.form.rate || 0);
    const equipmentTotal =
      equipmentBase + (this.form.vatEnabled ? equipmentBase * 0.2 : 0);
    const subtotal =
      equipmentTotal + this.logisticsTotal() + this.assemblyTotal();
    return Math.max(0, subtotal - this.orderDraftDiscountAmount(subtotal));
  }

  orderDraftDiscountAmount(subtotal = 0): number {
    if (!this.form.discountEnabled) return 0;
    const base = subtotal || this.orderDraftSubtotalBeforeDiscount();
    const value = Number(this.form.discountValue || 0);
    if (value <= 0) return 0;
    const discount =
      this.form.discountType === "amount" ? value : base * (value / 100);
    return Math.min(base, discount);
  }

  orderDraftSubtotalBeforeDiscount(): number {
    const idleDates = new Set([
      ...this.form.equipmentIdleDates,
      ...(this.form.breakdownAffectsPayment ? this.breakdownDates() : []),
    ]);
    const workDays = this.orderDates().filter(
      (date) => !idleDates.has(date),
    ).length;
    const equipmentBase = Number(this.form.equipmentHourlyRate || 0)
      ? (workDays * Number(this.form.standardWorkHours || 8) +
          Number(this.form.additionalWorkHours || 0)) *
        Number(this.form.equipmentHourlyRate || 0)
      : workDays * Number(this.form.rate || 0);
    return (
      equipmentBase +
      (this.form.vatEnabled ? equipmentBase * 0.2 : 0) +
      this.logisticsTotal() +
      this.assemblyTotal()
    );
  }

  orderDraftWorkHours(): number {
    const idleDates = new Set([
      ...this.form.equipmentIdleDates,
      ...(this.form.breakdownAffectsPayment ? this.breakdownDates() : []),
    ]);
    const workDays = this.orderDates().filter(
      (date) => !idleDates.has(date),
    ).length;
    return (
      workDays * Number(this.form.standardWorkHours || 8) +
      Number(this.form.additionalWorkHours || 0)
    );
  }

  logisticsProviderLabel(order: Order): string {
    if (order.logisticsProvider === "own_trawl") return "Наш трал";
    if (order.logisticsProvider === "self_drive") return "Своим ходом";
    return "Сторонний перевозчик";
  }

  assemblyTotal(): number {
    if (!this.form.assemblyEnabled) return 0;
    return (
      Number(this.form.assemblyDisassemblyCost || 0) +
      Number(this.form.assemblyAssemblyCost || 0)
    );
  }

  validateLogistics(): boolean {
    if (!this.form.logisticsEnabled) return true;
    const start = this.form.logisticsStartDate || this.form.startDate;
    const end = this.form.logisticsEndDate || this.form.endDate;
    if (start > end) {
      alert("Дата начала логистики не может быть позже даты окончания.");
      return false;
    }
    if (
      this.form.logisticsProvider === "own_trawl" &&
      !this.form.logisticsTrailerId
    ) {
      alert("Выбери наш трал для резерва в календаре.");
      return false;
    }
    return true;
  }

  async save(): Promise<void> {
    if (!this.form.startDate || !this.form.endDate) return;
    if (!this.validateLogistics()) return;
    if (!this.validateBreakdown()) return;
    if (!this.validatePrimaryOperatorPeriod()) return;
    if (!this.validateOperatorShifts()) return;
    const transportEquipmentConflict = this.formTransportEquipmentConflict();
    if (transportEquipmentConflict) {
      alert(
        `Техника занята в перевозке: ${this.eqName(transportEquipmentConflict.equipmentId)}, ${this.utils.fmtDate(transportEquipmentConflict.startDate)} - ${this.utils.fmtDate(transportEquipmentConflict.endDate)}.`,
      );
      return;
    }
    const operatorConflict = this.formOperatorConflict();
    if (operatorConflict) {
      const conflictEquipment =
        this.eqName(operatorConflict.equipmentId) || "другая техника";
      alert(
        `Оператор занят в другой заявке: ${conflictEquipment}, ${this.utils.fmtDate(operatorConflict.startDate)} - ${this.utils.fmtDate(operatorConflict.endDate)}.`,
      );
      return;
    }
    const transportOperatorConflict = this.formTransportOperatorConflict();
    if (transportOperatorConflict) {
      alert(
        `Оператор занят в перевозке: ${this.utils.fmtDate(transportOperatorConflict.startDate)} - ${this.utils.fmtDate(transportOperatorConflict.endDate)}.`,
      );
      return;
    }
    try {
      if (this.editingId) {
        const orderPatch = this.prepareForm();
        await this.db.update("orders", this.editingId, orderPatch);
        await this.syncBreakdownRepair(this.editingId, orderPatch);
      } else {
        const orderId = this.utils.uid("ord");
        const orderPatch = this.prepareForm();
        await this.db.insert("orders", {
          id: orderId,
          ...orderPatch,
        });
        await this.syncBreakdownRepair(orderId, orderPatch);
      }
    } catch (error) {
      alert(this.saveErrorMessage(error));
      return;
    }
    this.clearForm();
    this.formOpen.set(false);
    this.selectedOrder.set(null);
  }

  edit(order: Order): void {
    this.selectedOrder.set(null);
    this.editingId = order.id;
    const logisticsDistanceKm = Number(
      order.logisticsDistanceKm || order.logisticsDeliveryKm || 0,
    );
    const logisticsCost = Number(
      order.logisticsCost ||
        Number(order.logisticsPickupCost || 0) +
          Number(order.logisticsDeliveryCost || 0),
    );
    const pickupCost = Number(order.logisticsPickupCost || 0);
    const deliveryCost = Number(
      order.logisticsDeliveryCost || (pickupCost ? 0 : logisticsCost),
    );
    this.form = {
      clientId: order.clientId,
      equipmentId: order.equipmentId,
      operatorId: order.operatorId,
      primaryOperatorStartDate: this.primaryOperatorPeriod(order).startDate,
      primaryOperatorEndDate: this.primaryOperatorPeriod(order).endDate,
      startDate: order.startDate,
      endDate: order.endDate,
      location: order.location,
      rate: order.rate,
      equipmentHourlyRate: order.equipmentHourlyRate || 0,
      standardWorkHours: order.standardWorkHours || 8,
      additionalWorkHours: order.additionalWorkHours || 0,
      vatEnabled: Boolean(order.vatEnabled),
      discountEnabled: Boolean(order.discountEnabled),
      discountType: order.discountType || "percent",
      discountValue: Number(order.discountValue || 0),
      status: order.status,
      notes: order.notes,
      equipmentIdleDates: [...(order.equipmentIdleDates || [])],
      operatorIdleDates: [...(order.operatorIdleDates || [])],
      operatorShifts: this.cloneOperatorShifts(order.operatorShifts || []),
      logisticsEnabled: Boolean(order.logisticsEnabled),
      logisticsProvider: order.logisticsProvider || "own_trawl",
      logisticsTrailerId: order.logisticsTrailerId || "",
      logisticsStartDate: order.logisticsStartDate || order.startDate || "",
      logisticsEndDate: order.logisticsEndDate || order.endDate || "",
      logisticsReturnProvider:
        order.logisticsReturnProvider || order.logisticsProvider || "own_trawl",
      logisticsReturnTrailerId:
        order.logisticsReturnTrailerId || order.logisticsTrailerId || "",
      logisticsReturnStartDate:
        order.logisticsReturnStartDate ||
        order.logisticsEndDate ||
        order.endDate ||
        "",
      logisticsReturnEndDate:
        order.logisticsReturnEndDate ||
        order.logisticsEndDate ||
        order.endDate ||
        "",
      logisticsDistanceKm,
      logisticsPricePerKm: Number(
        order.logisticsPricePerKm ||
          (logisticsDistanceKm ? logisticsCost / logisticsDistanceKm : 0),
      ),
      logisticsCost,
      logisticsPickupPricePerKm: Number(
        order.logisticsPickupPricePerKm ||
          (order.logisticsPickupKm
            ? pickupCost / Number(order.logisticsPickupKm || 1)
            : 50),
      ),
      logisticsDeliveryPricePerKm: Number(
        order.logisticsDeliveryPricePerKm ||
          (order.logisticsDeliveryKm
            ? deliveryCost / Number(order.logisticsDeliveryKm || 1)
            : 250),
      ),
      logisticsPickupKm: Number(order.logisticsPickupKm || 0),
      logisticsDeliveryKm: Number(
        order.logisticsDeliveryKm || logisticsDistanceKm,
      ),
      logisticsPickupCost: pickupCost,
      logisticsDeliveryCost: deliveryCost,
      logisticsReturnPickupPricePerKm: Number(
        order.logisticsReturnPickupPricePerKm || 50,
      ),
      logisticsReturnDeliveryPricePerKm: Number(
        order.logisticsReturnDeliveryPricePerKm || 250,
      ),
      logisticsReturnPickupKm: Number(order.logisticsReturnPickupKm || 0),
      logisticsReturnDeliveryKm: Number(order.logisticsReturnDeliveryKm || 0),
      logisticsReturnPickupCost: Number(order.logisticsReturnPickupCost || 0),
      logisticsReturnDeliveryCost: Number(
        order.logisticsReturnDeliveryCost || 0,
      ),
      assemblyEnabled: Boolean(order.assemblyEnabled),
      assemblyDisassemblyDate: order.assemblyDisassemblyDate || "",
      assemblyAssemblyDate: order.assemblyAssemblyDate || "",
      assemblyDisassemblyCost: Number(order.assemblyDisassemblyCost || 0),
      assemblyAssemblyCost: Number(order.assemblyAssemblyCost || 0),
      breakdownEnabled: Boolean(order.breakdownEnabled),
      breakdownDate: order.breakdownDate || "",
      breakdownEndDate: order.breakdownEndDate || "",
      breakdownStatus: order.breakdownStatus || "reported",
      breakdownDescription: order.breakdownDescription || "",
      breakdownReporter: order.breakdownReporter || "",
      breakdownResponsible: order.breakdownResponsible || "",
      breakdownFaultParty: order.breakdownFaultParty || "unknown",
      breakdownAffectsPayment: Boolean(order.breakdownAffectsPayment),
      breakdownOperatorIdle: Boolean(order.breakdownOperatorIdle),
      breakdownLaborCost: Number(order.breakdownLaborCost || 0),
      breakdownPartsCost: Number(order.breakdownPartsCost || 0),
      breakdownCreateRepair: Boolean(order.breakdownCreateRepair),
      breakdownRepairId: order.breakdownRepairId || "",
    };
    this.formOpen.set(true);
  }

  async remove(id: string): Promise<void> {
    if (!confirm("Удалить заявку?")) return;
    // Unlink operations
    const ops = this.state.operations().filter((op) => op.orderId === id);
    for (const op of ops) {
      await this.db.update("operations", op.id, { orderId: "" });
    }
    await this.db.remove("orders", id);
    this.clearForm();
  }

  clearForm(): void {
    this.editingId = "";
    this.form = {
      clientId: "",
      equipmentId: "",
      operatorId: "",
      primaryOperatorStartDate: "",
      primaryOperatorEndDate: "",
      startDate: "",
      endDate: "",
      location: "",
      rate: 0,
      equipmentHourlyRate: 0,
      standardWorkHours: 8,
      additionalWorkHours: 0,
      vatEnabled: false,
      discountEnabled: false,
      discountType: "percent",
      discountValue: 0,
      status: "new",
      notes: "",
      equipmentIdleDates: [],
      operatorIdleDates: [],
      operatorShifts: [],
      logisticsEnabled: false,
      logisticsProvider: "own_trawl",
      logisticsTrailerId: "",
      logisticsStartDate: "",
      logisticsEndDate: "",
      logisticsReturnProvider: "own_trawl",
      logisticsReturnTrailerId: "",
      logisticsReturnStartDate: "",
      logisticsReturnEndDate: "",
      logisticsDistanceKm: 0,
      logisticsPricePerKm: 0,
      logisticsCost: 0,
      logisticsPickupPricePerKm: 50,
      logisticsDeliveryPricePerKm: 250,
      logisticsPickupKm: 0,
      logisticsDeliveryKm: 0,
      logisticsPickupCost: 0,
      logisticsDeliveryCost: 0,
      logisticsReturnPickupPricePerKm: 50,
      logisticsReturnDeliveryPricePerKm: 250,
      logisticsReturnPickupKm: 0,
      logisticsReturnDeliveryKm: 0,
      logisticsReturnPickupCost: 0,
      logisticsReturnDeliveryCost: 0,
      assemblyEnabled: false,
      assemblyDisassemblyDate: "",
      assemblyAssemblyDate: "",
      assemblyDisassemblyCost: 0,
      assemblyAssemblyCost: 0,
      breakdownEnabled: false,
      breakdownDate: "",
      breakdownEndDate: "",
      breakdownStatus: "reported",
      breakdownDescription: "",
      breakdownReporter: "",
      breakdownResponsible: "",
      breakdownFaultParty: "unknown",
      breakdownAffectsPayment: true,
      breakdownOperatorIdle: true,
      breakdownLaborCost: 0,
      breakdownPartsCost: 0,
      breakdownCreateRepair: false,
      breakdownRepairId: "",
    };
  }

  editSelected(order: Order): void {
    this.edit(order);
  }

  async generateCommercialProposal(order: Order): Promise<void> {
    this.openDocumentEditor(order, "proposal");
  }

  openDocumentEditor(order: Order, type: CrmDocumentType): void {
    this.proposalDraft = this.proposal.createDraft(order, type);
    this.proposalEditorOpen.set(true);
  }

  closeProposalEditor(): void {
    this.proposalEditorOpen.set(false);
    this.proposalDraft = null;
  }

  addProposalRow(): void {
    this.proposalDraft?.rows.push({
      title: "Додаткова позиція",
      details: "",
      amount: 0,
    });
  }

  removeProposalRow(index: number): void {
    this.proposalDraft?.rows.splice(index, 1);
  }

  addProposalTerm(): void {
    this.proposalDraft?.terms.push("");
  }

  removeProposalTerm(index: number): void {
    this.proposalDraft?.terms.splice(index, 1);
  }

  proposalTotal(draft: CommercialProposalDraft): number {
    return this.proposal.total(draft);
  }

  async downloadProposalDraft(draft: CommercialProposalDraft): Promise<void> {
    await this.proposal.downloadDraft(draft);
  }

  trackProposalRow(index: number, row: ProposalRow): string {
    return `${index}-${row.title}`;
  }

  orderDates(): string[] {
    return this.utils.datesInclusive(this.form.startDate, this.form.endDate);
  }

  isIdleDate(kind: "equipment" | "operator", date: string): boolean {
    const dates =
      kind === "equipment"
        ? this.form.equipmentIdleDates
        : this.form.operatorIdleDates;
    return dates.includes(date);
  }

  toggleIdleDate(kind: "equipment" | "operator", date: string): void {
    const key =
      kind === "equipment" ? "equipmentIdleDates" : "operatorIdleDates";
    const dates = new Set(this.form[key]);
    if (dates.has(date)) dates.delete(date);
    else dates.add(date);
    this.form[key] = [...dates].sort();
  }

  excludeWeekendDates(kind: "equipment" | "operator"): void {
    const key =
      kind === "equipment" ? "equipmentIdleDates" : "operatorIdleDates";
    const dates = new Set(this.form[key]);
    this.orderDates()
      .filter((date) => {
        const day = new Date(date + "T00:00:00").getDay();
        return day === 0 || day === 6;
      })
      .forEach((date) => dates.add(date));
    this.form[key] = [...dates].sort();
  }

  clearIdleDates(kind: "equipment" | "operator"): void {
    const key =
      kind === "equipment" ? "equipmentIdleDates" : "operatorIdleDates";
    this.form[key] = [];
  }

  idleDatesCount(kind: "equipment" | "operator"): number {
    return kind === "equipment"
      ? this.form.equipmentIdleDates.length
      : this.form.operatorIdleDates.length;
  }

  idleDatesLabel(dates: string[]): string {
    return dates.length
      ? dates.map((date) => this.utils.fmtDate(date)).join(", ")
      : "нет";
  }

  addOperatorShift(): void {
    this.form.operatorShifts = [
      ...this.form.operatorShifts,
      {
        id: this.utils.uid("shift"),
        operatorId: this.form.operatorId || "",
        startDate: this.primaryOperatorStartDate(),
        endDate: this.primaryOperatorEndDate(),
        idleDates: [],
      },
    ];
  }

  removeOperatorShift(index: number): void {
    this.form.operatorShifts = this.form.operatorShifts.filter(
      (_, i) => i !== index,
    );
  }

  shiftDates(shift: OperatorShift): string[] {
    const start = shift.startDate || this.form.startDate;
    const end = shift.endDate || shift.startDate || this.form.endDate;
    return this.utils.datesInclusive(start, end);
  }

  isShiftIdleDate(shift: OperatorShift, date: string): boolean {
    return (shift.idleDates || []).includes(date);
  }

  toggleShiftIdleDate(shift: OperatorShift, date: string): void {
    const dates = new Set(shift.idleDates || []);
    if (dates.has(date)) dates.delete(date);
    else dates.add(date);
    shift.idleDates = [...dates].sort();
  }

  excludeShiftWeekends(shift: OperatorShift): void {
    const dates = new Set(shift.idleDates || []);
    this.shiftDates(shift)
      .filter((date) => {
        const day = new Date(date + "T00:00:00").getDay();
        return day === 0 || day === 6;
      })
      .forEach((date) => dates.add(date));
    shift.idleDates = [...dates].sort();
  }

  clearShiftIdleDates(shift: OperatorShift): void {
    shift.idleDates = [];
  }

  shiftWorkDays(shift: OperatorShift): number {
    const idle = new Set(shift.idleDates || []);
    return this.shiftDates(shift).filter((date) => !idle.has(date)).length;
  }

  shiftPayroll(shift: OperatorShift): number {
    const operator = this.state.byId(this.state.operators(), shift.operatorId);
    if (operator?.hourlyRate) {
      return (
        this.shiftWorkDays(shift) *
        Number(this.form.standardWorkHours || 8) *
        Number(operator.hourlyRate || 0)
      );
    }
    return this.shiftWorkDays(shift) * Number(operator?.rate || 0);
  }

  formOperatorPayroll(): number {
    return this.state.orderOperatorCost(this.formDraftOrder());
  }

  primaryOperatorStartDate(): string {
    return this.form.primaryOperatorStartDate || this.form.startDate;
  }

  primaryOperatorEndDate(): string {
    return this.form.primaryOperatorEndDate || this.form.endDate;
  }

  primaryOperatorWorkDays(): number {
    if (!this.form.operatorId) return 0;
    const idle = new Set(this.form.operatorIdleDates || []);
    return this.utils
      .datesInclusive(
        this.primaryOperatorStartDate(),
        this.primaryOperatorEndDate(),
      )
      .filter((date) => !idle.has(date)).length;
  }

  primaryOperatorPayroll(): number {
    const operator = this.state.byId(
      this.state.operators(),
      this.form.operatorId,
    );
    if (operator?.hourlyRate) {
      return (
        this.primaryOperatorWorkDays() *
        Number(this.form.standardWorkHours || 8) *
        Number(operator.hourlyRate || 0)
      );
    }
    return this.primaryOperatorWorkDays() * Number(operator?.rate || 0);
  }

  orderRepairNotice(order: Order): string {
    if (this.repairConflictSet().has(order.id)) {
      return "Техника в ремонте";
    }
    if (!order.breakdownEnabled) return "";
    const status = this.breakdownStatusLabel(order.breakdownStatus);
    const from = this.utils.fmtDate(order.breakdownDate);
    const to = this.utils.fmtDate(
      order.breakdownEndDate || order.breakdownDate,
    );
    return `Техника в ремонте: ${status}, ${from} - ${to}`;
  }

  breakdownStatusLabel(status: string): string {
    return (
      this.breakdownStatuses.find((item) => item.value === status)?.label ||
      "Зафиксирована"
    );
  }

  breakdownFaultPartyLabel(value: string): string {
    return (
      this.breakdownFaultParties.find((item) => item.value === value)?.label ||
      "Не установлено"
    );
  }

  breakdownDates(): string[] {
    if (!this.form.breakdownEnabled || !this.form.breakdownDate) return [];
    return this.utils.datesInclusive(
      this.form.breakdownDate,
      this.form.breakdownEndDate || this.form.breakdownDate,
    );
  }

  private formDraftOrder(): Order {
    return {
      id: this.editingId || "draft",
      createdAt: "",
      ...this.prepareForm(),
    };
  }

  private prepareForm(): Omit<Order, "id" | "createdAt"> {
    const inPeriod = new Set(this.orderDates());
    this.syncLogisticsTotals();
    const breakdownIdleDates = this.form.breakdownAffectsPayment
      ? this.breakdownDates().filter((date) => inPeriod.has(date))
      : [];
    const equipmentIdleDates = new Set([
      ...this.form.equipmentIdleDates,
      ...breakdownIdleDates,
    ]);
    const operatorIdleDates = new Set([
      ...this.form.operatorIdleDates,
      ...(this.form.breakdownOperatorIdle ? breakdownIdleDates : []),
    ]);
    const operatorShifts = this.normalizeOperatorShifts(inPeriod);
    const { primaryOperatorStartDate, primaryOperatorEndDate, ...form } =
      this.form;
    return {
      ...form,
      rate: Number(this.form.rate || 0),
      equipmentHourlyRate: Number(this.form.equipmentHourlyRate || 0),
      standardWorkHours: Number(this.form.standardWorkHours || 8),
      additionalWorkHours: Number(this.form.additionalWorkHours || 0),
      discountValue: Number(this.form.discountValue || 0),
      logisticsTrailerId:
        this.form.logisticsEnabled &&
        this.form.logisticsProvider === "own_trawl"
          ? this.form.logisticsTrailerId
          : "",
      logisticsStartDate: this.form.logisticsEnabled
        ? this.form.logisticsStartDate || this.form.startDate
        : "",
      logisticsEndDate: this.form.logisticsEnabled
        ? this.form.logisticsEndDate || this.form.endDate
        : "",
      logisticsReturnProvider: this.form.logisticsEnabled
        ? this.form.logisticsReturnProvider
        : "own_trawl",
      logisticsReturnTrailerId:
        this.form.logisticsEnabled &&
        this.form.logisticsReturnProvider === "own_trawl"
          ? this.form.logisticsReturnTrailerId
          : "",
      logisticsReturnStartDate: this.form.logisticsEnabled
        ? this.form.logisticsReturnStartDate ||
          this.form.logisticsEndDate ||
          this.form.endDate
        : "",
      logisticsReturnEndDate: this.form.logisticsEnabled
        ? this.form.logisticsReturnEndDate ||
          this.form.logisticsEndDate ||
          this.form.endDate
        : "",
      logisticsDistanceKm: this.form.logisticsEnabled
        ? Number(this.form.logisticsPickupKm || 0) +
          Number(this.form.logisticsDeliveryKm || 0) +
          Number(this.form.logisticsReturnPickupKm || 0) +
          Number(this.form.logisticsReturnDeliveryKm || 0)
        : 0,
      logisticsCost: this.form.logisticsEnabled ? this.logisticsSubtotal() : 0,
      logisticsPricePerKm: this.form.logisticsEnabled
        ? Number(this.form.logisticsDeliveryPricePerKm || 0)
        : 0,
      logisticsPickupPricePerKm: this.form.logisticsEnabled
        ? Number(this.form.logisticsPickupPricePerKm || 0)
        : 50,
      logisticsDeliveryPricePerKm: this.form.logisticsEnabled
        ? Number(this.form.logisticsDeliveryPricePerKm || 0)
        : 250,
      logisticsPickupKm: this.form.logisticsEnabled
        ? Number(this.form.logisticsPickupKm || 0)
        : 0,
      logisticsDeliveryKm: this.form.logisticsEnabled
        ? Number(this.form.logisticsDeliveryKm || 0)
        : 0,
      logisticsPickupCost: this.form.logisticsEnabled
        ? Number(this.form.logisticsPickupCost || 0)
        : 0,
      logisticsDeliveryCost: this.form.logisticsEnabled
        ? Number(this.form.logisticsDeliveryCost || 0)
        : 0,
      logisticsReturnPickupPricePerKm: this.form.logisticsEnabled
        ? Number(this.form.logisticsReturnPickupPricePerKm || 0)
        : 50,
      logisticsReturnDeliveryPricePerKm: this.form.logisticsEnabled
        ? Number(this.form.logisticsReturnDeliveryPricePerKm || 0)
        : 250,
      logisticsReturnPickupKm: this.form.logisticsEnabled
        ? Number(this.form.logisticsReturnPickupKm || 0)
        : 0,
      logisticsReturnDeliveryKm: this.form.logisticsEnabled
        ? Number(this.form.logisticsReturnDeliveryKm || 0)
        : 0,
      logisticsReturnPickupCost: this.form.logisticsEnabled
        ? Number(this.form.logisticsReturnPickupCost || 0)
        : 0,
      logisticsReturnDeliveryCost: this.form.logisticsEnabled
        ? Number(this.form.logisticsReturnDeliveryCost || 0)
        : 0,
      assemblyDisassemblyDate: this.form.assemblyEnabled
        ? this.form.assemblyDisassemblyDate
        : "",
      assemblyAssemblyDate: this.form.assemblyEnabled
        ? this.form.assemblyAssemblyDate
        : "",
      assemblyDisassemblyCost: this.form.assemblyEnabled
        ? Number(this.form.assemblyDisassemblyCost || 0)
        : 0,
      assemblyAssemblyCost: this.form.assemblyEnabled
        ? Number(this.form.assemblyAssemblyCost || 0)
        : 0,
      breakdownDate: this.form.breakdownEnabled ? this.form.breakdownDate : "",
      breakdownEndDate: this.form.breakdownEnabled
        ? this.form.breakdownEndDate || this.form.breakdownDate
        : "",
      breakdownStatus: this.form.breakdownEnabled
        ? this.form.breakdownStatus
        : "reported",
      breakdownDescription: this.form.breakdownEnabled
        ? this.form.breakdownDescription
        : "",
      breakdownReporter: this.form.breakdownEnabled
        ? this.form.breakdownReporter
        : "",
      breakdownResponsible: this.form.breakdownEnabled
        ? this.form.breakdownResponsible
        : "",
      breakdownFaultParty: this.form.breakdownEnabled
        ? this.form.breakdownFaultParty
        : "unknown",
      breakdownAffectsPayment: this.form.breakdownEnabled
        ? this.form.breakdownAffectsPayment
        : false,
      breakdownOperatorIdle: this.form.breakdownEnabled
        ? this.form.breakdownOperatorIdle
        : false,
      breakdownLaborCost: this.form.breakdownEnabled
        ? Number(this.form.breakdownLaborCost || 0)
        : 0,
      breakdownPartsCost: this.form.breakdownEnabled
        ? Number(this.form.breakdownPartsCost || 0)
        : 0,
      breakdownCreateRepair: this.form.breakdownEnabled
        ? this.form.breakdownCreateRepair
        : false,
      breakdownRepairId: this.form.breakdownEnabled
        ? this.form.breakdownRepairId
        : "",
      equipmentIdleDates: [...equipmentIdleDates]
        .filter((date) => inPeriod.has(date))
        .sort(),
      operatorIdleDates: [...operatorIdleDates]
        .filter((date) => inPeriod.has(date))
        .sort(),
      operatorShifts,
    };
  }

  private validateOperatorShifts(): boolean {
    if (!this.form.operatorShifts.length) return true;
    if (!this.form.startDate || !this.form.endDate) {
      alert("Сначала укажи период заявки, потом добавляй смены операторов.");
      return false;
    }
    for (const shift of this.form.operatorShifts) {
      if (!shift.operatorId) {
        alert("В каждой смене нужно выбрать оператора.");
        return false;
      }
      if (!shift.startDate || !shift.endDate) {
        alert("В каждой смене нужно указать даты начала и окончания.");
        return false;
      }
      if (shift.startDate > shift.endDate) {
        alert("Дата начала смены не может быть позже даты окончания.");
        return false;
      }
      if (
        shift.startDate < this.form.startDate ||
        shift.endDate > this.form.endDate
      ) {
        alert("Смены операторов должны быть внутри периода заявки.");
        return false;
      }
    }
    for (let i = 0; i < this.form.operatorShifts.length; i++) {
      for (let j = i + 1; j < this.form.operatorShifts.length; j++) {
        const a = this.form.operatorShifts[i];
        const b = this.form.operatorShifts[j];
        if (
          a.operatorId &&
          a.operatorId === b.operatorId &&
          this.utils.overlap(a.startDate, a.endDate, b.startDate, b.endDate)
        ) {
          alert(
            "У одного оператора не должно быть пересекающихся смен в одной заявке.",
          );
          return false;
        }
      }
    }
    return true;
  }

  private validatePrimaryOperatorPeriod(): boolean {
    if (!this.form.operatorId || this.form.operatorShifts.length) return true;
    const startDate = this.primaryOperatorStartDate();
    const endDate = this.primaryOperatorEndDate();
    if (!startDate || !endDate) return true;
    if (startDate > endDate) {
      alert(
        "Дата начала работы основного оператора не может быть позже даты окончания.",
      );
      return false;
    }
    if (startDate < this.form.startDate || endDate > this.form.endDate) {
      alert(
        "Период работы основного оператора должен быть внутри периода заявки.",
      );
      return false;
    }
    return true;
  }

  private normalizeOperatorShifts(inPeriod: Set<string>): OperatorShift[] {
    if (!this.form.operatorShifts.length && this.form.operatorId) {
      const startDate = this.primaryOperatorStartDate();
      const endDate = this.primaryOperatorEndDate();
      const usesCustomPeriod =
        startDate &&
        endDate &&
        (startDate !== this.form.startDate || endDate !== this.form.endDate);
      if (usesCustomPeriod) {
        const dates = new Set(this.utils.datesInclusive(startDate, endDate));
        return [
          {
            id: this.utils.uid("shift"),
            operatorId: this.form.operatorId,
            startDate,
            endDate,
            idleDates: [...new Set(this.form.operatorIdleDates || [])]
              .filter((date) => inPeriod.has(date) && dates.has(date))
              .sort(),
          },
        ];
      }
    }
    return this.form.operatorShifts
      .filter((shift) => shift.operatorId && shift.startDate && shift.endDate)
      .map((shift) => {
        const dates = new Set(
          this.utils.datesInclusive(shift.startDate, shift.endDate),
        );
        return {
          id: shift.id || this.utils.uid("shift"),
          operatorId: shift.operatorId,
          startDate: shift.startDate,
          endDate: shift.endDate,
          idleDates: [...new Set(shift.idleDates || [])]
            .filter((date) => inPeriod.has(date) && dates.has(date))
            .sort(),
        };
      });
  }

  private cloneOperatorShifts(shifts: OperatorShift[]): OperatorShift[] {
    return shifts.map((shift) => ({
      id: shift.id || this.utils.uid("shift"),
      operatorId: shift.operatorId || "",
      startDate: shift.startDate || "",
      endDate: shift.endDate || "",
      idleDates: [...(shift.idleDates || [])],
    }));
  }

  private primaryOperatorPeriod(order: Order): {
    startDate: string;
    endDate: string;
  } {
    const shift =
      (order.operatorShifts || []).length === 1 &&
      order.operatorShifts[0].operatorId === order.operatorId
        ? order.operatorShifts[0]
        : null;
    return {
      startDate: shift?.startDate || order.startDate,
      endDate: shift?.endDate || order.endDate,
    };
  }

  private validateBreakdown(): boolean {
    if (!this.form.breakdownEnabled) return true;
    if (!this.form.breakdownDate) {
      alert("Укажи дату поломки.");
      return false;
    }
    const endDate = this.form.breakdownEndDate || this.form.breakdownDate;
    if (this.form.breakdownDate > endDate) {
      alert("Дата устранения поломки не может быть раньше даты поломки.");
      return false;
    }
    if (
      this.form.breakdownDate < this.form.startDate ||
      endDate > this.form.endDate
    ) {
      alert("Даты поломки должны быть внутри периода заявки.");
      return false;
    }
    return true;
  }

  private async syncBreakdownRepair(
    orderId: string,
    order: Omit<Order, "id" | "createdAt">,
  ): Promise<void> {
    if (!order.breakdownEnabled || !order.breakdownCreateRepair) return;
    const repairId = order.breakdownRepairId || this.utils.uid("rep");
    const repair = {
      equipmentId: order.equipmentId,
      startDate: order.breakdownDate,
      endDate: order.breakdownEndDate || order.breakdownDate,
      status:
        order.breakdownStatus === "resolved"
          ? ("completed" as const)
          : order.breakdownStatus === "reported"
            ? ("planned" as const)
            : ("active" as const),
      laborCost: Number(order.breakdownLaborCost || 0),
      partsCost: Number(order.breakdownPartsCost || 0),
      responsible: order.breakdownResponsible,
      tasks: `Поломка по заявке ${orderId.slice(-5)}: ${order.breakdownDescription || "без описания"}`,
      notes: [
        order.breakdownReporter ? `Сообщил: ${order.breakdownReporter}` : "",
        `Ответственность: ${this.breakdownFaultPartyLabel(order.breakdownFaultParty)}`,
        order.breakdownAffectsPayment
          ? "Влияет на оплату аренды"
          : "Не влияет на оплату аренды",
      ]
        .filter(Boolean)
        .join("\n"),
    };
    if (
      order.breakdownRepairId &&
      this.state.byId(this.state.repairs(), repairId)
    ) {
      await this.db.update("repairs", repairId, repair);
    } else {
      await this.db.insert("repairs", { id: repairId, ...repair });
      this.form.breakdownRepairId = repairId;
      await this.db.update("orders", orderId, { breakdownRepairId: repairId });
    }
  }

  private logisticsSubtotal(): number {
    return (
      Number(this.form.logisticsPickupCost || 0) +
      Number(this.form.logisticsDeliveryCost || 0) +
      Number(this.form.logisticsReturnPickupCost || 0) +
      Number(this.form.logisticsReturnDeliveryCost || 0)
    );
  }

  private syncLogisticsTotals(): void {
    this.form.logisticsDistanceKm =
      Number(this.form.logisticsPickupKm || 0) +
      Number(this.form.logisticsDeliveryKm || 0) +
      Number(this.form.logisticsReturnPickupKm || 0) +
      Number(this.form.logisticsReturnDeliveryKm || 0);
    this.form.logisticsCost = this.logisticsSubtotal();
  }

  private saveErrorMessage(error: unknown): string {
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message || "")
        : "";
    if (
      message.includes("equipment_idle_dates") ||
      message.includes("operator_idle_dates")
    ) {
      return "База Supabase еще не готова для сохранения дней простоя. Выполни SQL-файл supabase-order-idle-dates.sql в Supabase SQL Editor и попробуй снова.";
    }
    if (message.includes("operator_shifts")) {
      return "База Supabase еще не готова для сохранения смен операторов. Выполни SQL-файл supabase-order-operator-shifts.sql в Supabase SQL Editor и попробуй снова.";
    }
    if (message.includes("logistics_")) {
      return "База Supabase еще не готова для сохранения логистики. Выполни SQL-файл supabase-order-logistics.sql в Supabase SQL Editor и попробуй снова.";
    }
    if (message.includes("assembly_")) {
      return "База Supabase еще не готова для сохранения сборки/разборки. Выполни SQL-файл supabase-order-assembly.sql в Supabase SQL Editor и попробуй снова.";
    }
    if (message.includes("breakdown_")) {
      return "База Supabase еще не готова для сохранения поломок. Выполни SQL-файл supabase-order-breakdowns.sql в Supabase SQL Editor и попробуй снова.";
    }
    if (
      message.includes("equipment_hourly_rate") ||
      message.includes("standard_work_hours") ||
      message.includes("additional_work_hours")
    ) {
      return "База Supabase еще не готова для часовых ставок в заявках. Выполни SQL-файл supabase-hourly-rates-and-operation-equipment.sql в Supabase SQL Editor и попробуй снова.";
    }
    if (
      message.includes("vat_enabled") ||
      message.includes("discount_enabled") ||
      message.includes("discount_type") ||
      message.includes("discount_value")
    ) {
      return "База Supabase еще не готова для НДС и скидок. Выполни SQL-файл supabase-order-vat-discount.sql в Supabase SQL Editor и попробуй снова.";
    }
    return message
      ? `Не удалось сохранить заявку: ${message}`
      : "Не удалось сохранить заявку.";
  }
}
