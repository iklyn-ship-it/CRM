import { Component, computed, signal, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { NgClass, SlicePipe } from "@angular/common";
import { StateService } from "../../services/state.service";
import { DbService } from "../../services/db.service";
import { UtilsService } from "../../services/utils.service";
import {
  BreakdownFaultParty,
  BreakdownStatus,
  Order,
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

  search = signal("");
  filterStatus = signal("");
  formOpen = signal(false);
  selectedOrder = signal<Order | null>(null);
  editingId = "";

  form = {
    clientId: "",
    equipmentId: "",
    operatorId: "",
    startDate: "",
    endDate: "",
    location: "",
    rate: 0,
    status: "new" as OrderStatus,
    notes: "",
    equipmentIdleDates: [] as string[],
    operatorIdleDates: [] as string[],
    logisticsEnabled: false,
    logisticsProvider: "own_trawl" as "own_trawl" | "third_party" | "self_drive",
    logisticsTrailerId: "",
    logisticsStartDate: "",
    logisticsEndDate: "",
    logisticsDistanceKm: 0,
    logisticsPricePerKm: 0,
    logisticsCost: 0,
    logisticsPickupPricePerKm: 50,
    logisticsDeliveryPricePerKm: 250,
    logisticsPickupKm: 0,
    logisticsDeliveryKm: 0,
    logisticsPickupCost: 0,
    logisticsDeliveryCost: 0,
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
  readonly breakdownFaultParties: { value: BreakdownFaultParty; label: string }[] = [
    { value: "unknown", label: "Не установлено" },
    { value: "ours", label: "Наша сторона" },
    { value: "client", label: "Клиент" },
    { value: "operator", label: "Оператор" },
  ];

  readonly conflictSet = computed(() => {
    const orderConflicts = this.state.orderConflicts().flatMap((x) => [
      x[0],
      x[1],
    ]);
    const transportConflicts = this.state
      .orderTransportConflicts()
      .map(([orderId]) => orderId);
    return new Set([...orderConflicts, ...transportConflicts]);
  });

  readonly operatorConflictSet = computed(() => {
    const orderConflicts = this.state.operatorConflicts().flatMap((x) => [
      x[0],
      x[1],
    ]);
    const transportConflicts = this.state
      .orderTransportOperatorConflicts()
      .map(([orderId]) => orderId);
    return new Set([...orderConflicts, ...transportConflicts]);
  });

  readonly repairConflictSet = computed(() => {
    return new Set(
      this.state.repairConflicts().map(([, orderId]) => orderId),
    );
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
    if (!this.form.operatorId || !this.form.startDate || !this.form.endDate) {
      return null;
    }
    return (
      this.state.orders().find(
        (order) =>
          order.id !== this.editingId &&
          this.state.orderBlocksSchedule(order) &&
          order.operatorId === this.form.operatorId &&
          this.state.ordersOverlapByWorkDays(
            this.formDraftOrder(),
            order,
            "operator",
          ),
      ) || null
    );
  }

  formTransportOperatorConflict(): Transport | null {
    if (!this.form.operatorId || !this.form.startDate || !this.form.endDate) {
      return null;
    }
    const draft = this.formDraftOrder();
    return (
      this.state.transports().find(
        (transport) =>
          this.state.transportBlocksSchedule(transport) &&
          transport.driverId === this.form.operatorId &&
          this.state.orderTransportOverlapByOperator(draft, transport),
      ) || null
    );
  }

  formTransportEquipmentConflict(): Transport | null {
    if (!this.form.startDate || !this.form.endDate) return null;
    const draft = this.formDraftOrder();
    return (
      this.state.transports().find((transport) => {
        if (!this.state.transportBlocksSchedule(transport)) return false;
        return this.state.orderEquipmentReservationIds(draft).some(
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

  clientName(id: string): string {
    return this.state.byId(this.state.clients(), id)?.name || "—";
  }
  eqName(id: string): string {
    return this.state.byId(this.state.equipment(), id)?.name || "—";
  }
  operatorName(id: string): string {
    return this.state.byId(this.state.operators(), id)?.name || "—";
  }
  trawlEquipment() {
    return this.state.equipment().filter((eq) =>
      (eq.type || "").trim().toLowerCase().includes("трал"),
    );
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
  }

  recalcLogisticsCost(): void {
    this.form.logisticsPickupCost =
      Number(this.form.logisticsPickupKm || 0) *
      Number(this.form.logisticsPickupPricePerKm || 0);
    this.form.logisticsDeliveryCost =
      Number(this.form.logisticsDeliveryKm || 0) *
      Number(this.form.logisticsDeliveryPricePerKm || 0);
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
    const rentalPlan =
      this.orderDates().filter((date) => !idleDates.has(date)).length *
      Number(this.form.rate || 0);
    return rentalPlan + this.logisticsTotal();
  }

  logisticsProviderLabel(order: Order): string {
    if (order.logisticsProvider === "own_trawl") return "Наш трал";
    if (order.logisticsProvider === "self_drive") return "Своим ходом";
    return "Сторонний перевозчик";
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
      startDate: order.startDate,
      endDate: order.endDate,
      location: order.location,
      rate: order.rate,
      status: order.status,
      notes: order.notes,
      equipmentIdleDates: [...(order.equipmentIdleDates || [])],
      operatorIdleDates: [...(order.operatorIdleDates || [])],
      logisticsEnabled: Boolean(order.logisticsEnabled),
      logisticsProvider: order.logisticsProvider || "own_trawl",
      logisticsTrailerId: order.logisticsTrailerId || "",
      logisticsStartDate: order.logisticsStartDate || order.startDate || "",
      logisticsEndDate: order.logisticsEndDate || order.endDate || "",
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
      startDate: "",
      endDate: "",
      location: "",
      rate: 0,
      status: "new",
      notes: "",
      equipmentIdleDates: [],
      operatorIdleDates: [],
      logisticsEnabled: false,
      logisticsProvider: "own_trawl",
      logisticsTrailerId: "",
      logisticsStartDate: "",
      logisticsEndDate: "",
      logisticsDistanceKm: 0,
      logisticsPricePerKm: 0,
      logisticsCost: 0,
      logisticsPickupPricePerKm: 50,
      logisticsDeliveryPricePerKm: 250,
      logisticsPickupKm: 0,
      logisticsDeliveryKm: 0,
      logisticsPickupCost: 0,
      logisticsDeliveryCost: 0,
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
    const key = kind === "equipment" ? "equipmentIdleDates" : "operatorIdleDates";
    const dates = new Set(this.form[key]);
    if (dates.has(date)) dates.delete(date);
    else dates.add(date);
    this.form[key] = [...dates].sort();
  }

  excludeWeekendDates(kind: "equipment" | "operator"): void {
    const key = kind === "equipment" ? "equipmentIdleDates" : "operatorIdleDates";
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
    const key = kind === "equipment" ? "equipmentIdleDates" : "operatorIdleDates";
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

  orderRepairNotice(order: Order): string {
    if (this.repairConflictSet().has(order.id)) {
      return "Техника в ремонте";
    }
    if (!order.breakdownEnabled) return "";
    const status = this.breakdownStatusLabel(order.breakdownStatus);
    const from = this.utils.fmtDate(order.breakdownDate);
    const to = this.utils.fmtDate(order.breakdownEndDate || order.breakdownDate);
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
    return {
      ...this.form,
      logisticsTrailerId:
        this.form.logisticsEnabled && this.form.logisticsProvider === "own_trawl"
          ? this.form.logisticsTrailerId
          : "",
      logisticsStartDate: this.form.logisticsEnabled
        ? this.form.logisticsStartDate || this.form.startDate
        : "",
      logisticsEndDate: this.form.logisticsEnabled
        ? this.form.logisticsEndDate || this.form.endDate
        : "",
      logisticsDistanceKm: this.form.logisticsEnabled
        ? Number(this.form.logisticsPickupKm || 0) +
          Number(this.form.logisticsDeliveryKm || 0)
        : 0,
      logisticsCost: this.form.logisticsEnabled ? this.logisticsSubtotal() : 0,
      logisticsPricePerKm: this.form.logisticsEnabled
        ? Number(this.form.logisticsDeliveryPricePerKm || 0)
        : 0,
      logisticsPickupPricePerKm: this.form.logisticsEnabled
        ? this.form.logisticsPickupPricePerKm
        : 50,
      logisticsDeliveryPricePerKm: this.form.logisticsEnabled
        ? this.form.logisticsDeliveryPricePerKm
        : 250,
      logisticsPickupKm: this.form.logisticsEnabled
        ? this.form.logisticsPickupKm
        : 0,
      logisticsDeliveryKm: this.form.logisticsEnabled
        ? this.form.logisticsDeliveryKm
        : 0,
      logisticsPickupCost: this.form.logisticsEnabled
        ? this.form.logisticsPickupCost
        : 0,
      logisticsDeliveryCost: this.form.logisticsEnabled
        ? this.form.logisticsDeliveryCost
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
    if (this.form.breakdownDate < this.form.startDate || endDate > this.form.endDate) {
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
        order.breakdownAffectsPayment ? "Влияет на оплату аренды" : "Не влияет на оплату аренды",
      ]
        .filter(Boolean)
        .join("\n"),
    };
    if (order.breakdownRepairId && this.state.byId(this.state.repairs(), repairId)) {
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
      Number(this.form.logisticsDeliveryCost || 0)
    );
  }

  private syncLogisticsTotals(): void {
    this.form.logisticsDistanceKm =
      Number(this.form.logisticsPickupKm || 0) +
      Number(this.form.logisticsDeliveryKm || 0);
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
    if (message.includes("logistics_")) {
      return "База Supabase еще не готова для сохранения логистики. Выполни SQL-файл supabase-order-logistics.sql в Supabase SQL Editor и попробуй снова.";
    }
    if (message.includes("breakdown_")) {
      return "База Supabase еще не готова для сохранения поломок. Выполни SQL-файл supabase-order-breakdowns.sql в Supabase SQL Editor и попробуй снова.";
    }
    return message ? `Не удалось сохранить заявку: ${message}` : "Не удалось сохранить заявку.";
  }
}
