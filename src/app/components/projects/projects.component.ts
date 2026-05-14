import { Component, computed, inject, signal } from "@angular/core";
import { NgClass, SlicePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { DbService } from "../../services/db.service";
import { StateService } from "../../services/state.service";
import { UtilsService } from "../../services/utils.service";
import {
  FinanceOperation,
  OperatorShift,
  Order,
  OrderStatus,
} from "../../models/crm.models";

interface LocationGroup {
  key: string;
  clientId: string;
  clientName: string;
  location: string;
  orders: Order[];
  plan: number;
  income: number;
  expense: number;
  profit: number;
  latestDate: string;
}

interface ClientGroup {
  clientId: string;
  clientName: string;
  locations: LocationGroup[];
  ordersCount: number;
  plan: number;
  income: number;
  expense: number;
  profit: number;
  latestDate: string;
}

@Component({
  selector: "app-projects",
  standalone: true,
  imports: [FormsModule, NgClass, SlicePipe],
  templateUrl: "./projects.component.html",
  styleUrl: "./projects.component.css",
})
export class ProjectsComponent {
  state = inject(StateService);
  db = inject(DbService);
  utils = inject(UtilsService);

  search = signal("");
  filterStatus = signal("");
  expandedClientIds = signal<string[]>([]);
  selectedLocationKey = signal("");
  selectedOrderId = signal("");
  creatingOrder = signal(false);
  costEditorOpen = signal(false);
  createCostEditorOpen = signal(false);
  operationEditorOpen = signal(false);

  orderForm = this.emptyOrderForm();
  operationForm = this.emptyOperationForm();
  createForm = this.emptyCreateForm();

  readonly statuses: { value: OrderStatus; label: string }[] = [
    { value: "new", label: "Новая" },
    { value: "confirmed", label: "Подтверждена" },
    { value: "active", label: "В работе" },
    { value: "completed", label: "Завершена" },
    { value: "cancelled", label: "Отменена" },
  ];

  readonly operationCategories = [
    "Оплата клиента",
    "Топливо",
    "Ремонт",
    "Логистика",
    "Запчасти",
    "Зарплата оператора",
    "Прочее",
  ];

  readonly filteredOrders = computed(() => {
    const q = this.search().trim().toLowerCase();
    const status = this.filterStatus();
    let rows = [...this.state.orders()];
    if (status) rows = rows.filter((order) => order.status === status);
    if (q) {
      rows = rows.filter((order) =>
        [
          order.id,
          this.clientName(order.clientId),
          this.equipmentName(order.equipmentId),
          this.operatorName(order.operatorId),
          order.location,
          order.notes,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    return rows.sort((a, b) => b.startDate.localeCompare(a.startDate));
  });

  readonly clientGroups = computed((): ClientGroup[] => {
    const clientMap = new Map<string, Order[]>();
    this.filteredOrders().forEach((order) => {
      const clientId = order.clientId || "no-client";
      clientMap.set(clientId, [...(clientMap.get(clientId) || []), order]);
    });

    return [...clientMap.entries()]
      .map(([clientId, orders]) => {
        const clientName = this.clientName(clientId);
        const locationMap = new Map<string, Order[]>();
        orders.forEach((order) => {
          const location = this.locationLabel(order.location);
          locationMap.set(location, [
            ...(locationMap.get(location) || []),
            order,
          ]);
        });
        const locations = [...locationMap.entries()]
          .map(([location, locationOrders]) =>
            this.buildLocationGroup(
              clientId,
              clientName,
              location,
              locationOrders,
            ),
          )
          .sort((a, b) => b.latestDate.localeCompare(a.latestDate));

        return {
          clientId,
          clientName,
          locations,
          ordersCount: orders.length,
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
          latestDate: orders.reduce(
            (latest, order) =>
              order.startDate > latest ? order.startDate : latest,
            "",
          ),
        };
      })
      .sort((a, b) => b.latestDate.localeCompare(a.latestDate));
  });

  readonly selectedLocation = computed(() =>
    this.clientGroups()
      .flatMap((group) => group.locations)
      .find((location) => location.key === this.selectedLocationKey()),
  );

  readonly selectedOrder = computed(() =>
    this.state.byId(this.state.orders(), this.selectedOrderId()),
  );

  readonly selectedOrderOps = computed(() => {
    const order = this.selectedOrder();
    if (!order) return [];
    return this.state
      .orderOps(order.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  });

  toggleClient(clientId: string): void {
    const expanded = this.expandedClientIds();
    this.expandedClientIds.set(
      expanded.includes(clientId)
        ? expanded.filter((id) => id !== clientId)
        : [...expanded, clientId],
    );
  }

  isClientExpanded(clientId: string): boolean {
    return this.expandedClientIds().includes(clientId);
  }

  openLocation(location: LocationGroup): void {
    this.selectedLocationKey.set(location.key);
    this.selectedOrderId.set("");
    this.costEditorOpen.set(false);
  }

  closeLocation(): void {
    this.selectedLocationKey.set("");
    this.selectedOrderId.set("");
    this.creatingOrder.set(false);
    this.costEditorOpen.set(false);
    this.createCostEditorOpen.set(false);
    this.operationEditorOpen.set(false);
    this.orderForm = this.emptyOrderForm();
    this.createForm = this.emptyCreateForm();
  }

  openCreateOrder(location?: LocationGroup): void {
    const today = this.utils.todayStr();
    this.selectedOrderId.set("");
    this.costEditorOpen.set(false);
    this.createCostEditorOpen.set(false);
    this.operationEditorOpen.set(false);
    this.creatingOrder.set(true);
    this.createForm = {
      ...this.emptyCreateForm(),
      clientId:
        location?.clientId === "no-client" ? "" : location?.clientId || "",
      location:
        location?.location === "Без локации" ? "" : location?.location || "",
      startDate: today,
      endDate: today,
    };
  }

  cancelCreateOrder(): void {
    this.creatingOrder.set(false);
    this.createCostEditorOpen.set(false);
    this.createForm = this.emptyCreateForm();
  }

  openCreateCostEditor(): void {
    this.createCostEditorOpen.set(true);
  }

  closeCreateCostEditor(): void {
    this.createCostEditorOpen.set(false);
  }

  async createOrder(): Promise<void> {
    if (!this.createForm.clientId) {
      alert("Выбери клиента.");
      return;
    }
    if (!this.createForm.equipmentId) {
      alert("Выбери технику.");
      return;
    }
    if (!this.createForm.startDate || !this.createForm.endDate) {
      alert("Укажи даты брони.");
      return;
    }
    if (this.createForm.startDate > this.createForm.endDate) {
      alert("Дата начала не может быть позже даты окончания.");
      return;
    }
    const id = this.utils.uid("ord");
    const draft = this.createDraftOrder(id);
    try {
      await this.db.insert("orders", {
        ...draft,
        id,
        createdAt: new Date().toISOString(),
      });
      this.creatingOrder.set(false);
      this.createCostEditorOpen.set(false);
      this.createForm = this.emptyCreateForm();
      const created = this.state.byId(this.state.orders(), id);
      if (created) {
        this.selectedLocationKey.set(
          `${created.clientId || "no-client"}::${this.locationLabel(created.location)}`,
        );
        this.openOrder(created);
      }
    } catch (error) {
      alert(`Не удалось создать заявку: ${this.errorMessage(error)}`);
    }
  }

  openOrder(order: Order): void {
    this.creatingOrder.set(false);
    this.costEditorOpen.set(false);
    this.operationEditorOpen.set(false);
    this.selectedOrderId.set(order.id);
    this.orderForm = this.orderToForm(order);
    this.operationForm = this.emptyOperationForm(order);
  }

  closeOrder(): void {
    this.selectedOrderId.set("");
    this.costEditorOpen.set(false);
    this.operationEditorOpen.set(false);
    this.orderForm = this.emptyOrderForm();
    const location = this.selectedLocation();
    this.operationForm = this.emptyOperationForm(location?.orders[0]);
  }

  openCostEditor(): void {
    this.costEditorOpen.set(true);
  }

  closeCostEditor(): void {
    this.costEditorOpen.set(false);
  }

  openOperationEditor(type: "income" | "expense" = "income"): void {
    this.setOperationType(type);
    this.operationEditorOpen.set(true);
  }

  closeOperationEditor(): void {
    this.operationEditorOpen.set(false);
  }

  stopModalClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  async saveOrder(): Promise<void> {
    const order = this.selectedOrder();
    if (!order) return;
    const idlePatch = this.breakdownIdlePatch(order);
    const patch: Record<string, any> = {
      status: this.orderForm.status,
      equipmentId: this.orderForm.equipmentId,
      operatorId: this.orderForm.operatorId,
      startDate: this.orderForm.startDate,
      endDate: this.orderForm.endDate,
      location: this.orderForm.location,
      rate: Number(this.orderForm.rate || 0),
      equipmentHourlyRate: Number(this.orderForm.equipmentHourlyRate || 0),
      standardWorkHours: Number(this.orderForm.standardWorkHours || 8),
      additionalWorkHours: Number(this.orderForm.additionalWorkHours || 0),
      vatEnabled: Boolean(this.orderForm.vatEnabled),
      operatorShifts: this.normalizeOperatorShifts(
        this.orderForm.operatorShifts,
        order,
        this.orderForm.primaryOperatorStartDate,
        this.orderForm.primaryOperatorEndDate,
      ),
      discountEnabled: this.orderForm.discountEnabled,
      discountType: this.orderForm.discountType,
      discountValue: Number(this.orderForm.discountValue || 0),
      notes: this.orderForm.notes,
      logisticsEnabled: Boolean(this.orderForm.logisticsEnabled),
      logisticsProvider: this.orderForm.logisticsEnabled
        ? this.orderForm.logisticsProvider
        : "own_trawl",
      logisticsTrailerId:
        this.orderForm.logisticsEnabled &&
        this.orderForm.logisticsProvider === "own_trawl"
          ? this.orderForm.logisticsTrailerId
          : "",
      logisticsStartDate: this.orderForm.logisticsEnabled
        ? this.orderForm.logisticsStartDate || order.startDate
        : "",
      logisticsEndDate: this.orderForm.logisticsEnabled
        ? this.orderForm.logisticsEndDate || order.endDate
        : "",
      logisticsDistanceKm: this.orderForm.logisticsEnabled
        ? Number(this.orderForm.logisticsPickupKm || 0) +
          Number(this.orderForm.logisticsDeliveryKm || 0)
        : 0,
      logisticsPricePerKm: this.orderForm.logisticsEnabled
        ? Number(this.orderForm.logisticsDeliveryPricePerKm || 0)
        : 0,
      logisticsCost: this.orderForm.logisticsEnabled
        ? this.logisticsSubtotal()
        : 0,
      logisticsPickupPricePerKm: this.orderForm.logisticsEnabled
        ? Number(this.orderForm.logisticsPickupPricePerKm || 0)
        : 50,
      logisticsDeliveryPricePerKm: this.orderForm.logisticsEnabled
        ? Number(this.orderForm.logisticsDeliveryPricePerKm || 0)
        : 250,
      logisticsPickupKm: this.orderForm.logisticsEnabled
        ? Number(this.orderForm.logisticsPickupKm || 0)
        : 0,
      logisticsDeliveryKm: this.orderForm.logisticsEnabled
        ? Number(this.orderForm.logisticsDeliveryKm || 0)
        : 0,
      logisticsPickupCost: this.orderForm.logisticsEnabled
        ? Number(this.orderForm.logisticsPickupCost || 0)
        : 0,
      logisticsDeliveryCost: this.orderForm.logisticsEnabled
        ? Number(this.orderForm.logisticsDeliveryCost || 0)
        : 0,
      assemblyEnabled: Boolean(this.orderForm.assemblyEnabled),
      assemblyDisassemblyDate: this.orderForm.assemblyEnabled
        ? this.orderForm.assemblyDisassemblyDate
        : "",
      assemblyAssemblyDate: this.orderForm.assemblyEnabled
        ? this.orderForm.assemblyAssemblyDate
        : "",
      assemblyDisassemblyCost: this.orderForm.assemblyEnabled
        ? Number(this.orderForm.assemblyDisassemblyCost || 0)
        : 0,
      assemblyAssemblyCost: this.orderForm.assemblyEnabled
        ? Number(this.orderForm.assemblyAssemblyCost || 0)
        : 0,
      breakdownEnabled: Boolean(this.orderForm.breakdownEnabled),
      breakdownDate: this.orderForm.breakdownEnabled
        ? this.orderForm.breakdownDate
        : "",
      breakdownEndDate: this.orderForm.breakdownEnabled
        ? this.orderForm.breakdownEndDate || this.orderForm.breakdownDate
        : "",
      breakdownStatus: this.orderForm.breakdownEnabled
        ? this.orderForm.breakdownStatus
        : "reported",
      breakdownDescription: this.orderForm.breakdownEnabled
        ? this.orderForm.breakdownDescription
        : "",
      breakdownReporter: this.orderForm.breakdownEnabled
        ? this.orderForm.breakdownReporter
        : "",
      breakdownResponsible: this.orderForm.breakdownEnabled
        ? this.orderForm.breakdownResponsible
        : "",
      breakdownFaultParty: this.orderForm.breakdownEnabled
        ? this.orderForm.breakdownFaultParty
        : "unknown",
      breakdownAffectsPayment: this.orderForm.breakdownEnabled
        ? this.orderForm.breakdownAffectsPayment
        : false,
      breakdownOperatorIdle: this.orderForm.breakdownEnabled
        ? this.orderForm.breakdownOperatorIdle
        : false,
      breakdownLaborCost: this.orderForm.breakdownEnabled
        ? Number(this.orderForm.breakdownLaborCost || 0)
        : 0,
      breakdownPartsCost: this.orderForm.breakdownEnabled
        ? Number(this.orderForm.breakdownPartsCost || 0)
        : 0,
      equipmentIdleDates: idlePatch.equipmentIdleDates,
      operatorIdleDates: idlePatch.operatorIdleDates,
    };
    try {
      await this.db.update("orders", order.id, patch);
      const updated = this.state.byId(this.state.orders(), order.id) || {
        ...order,
        ...patch,
      };
      this.orderForm = this.orderToForm(updated as Order);
    } catch (error) {
      alert(`Не удалось сохранить заявку: ${this.errorMessage(error)}`);
    }
  }

  async addOperation(): Promise<void> {
    const order = this.selectedOrder();
    if (!order) return;
    if (!this.operationForm.amount || Number(this.operationForm.amount) <= 0) {
      alert("Укажи сумму операции.");
      return;
    }
    const billClientPrefix =
      this.operationForm.type === "expense" && this.operationForm.billClient
        ? "[Выставить клиенту] "
        : "";
    try {
      await this.db.insert("operations", {
        id: this.utils.uid("op"),
        date: this.operationForm.date || this.utils.todayStr(),
        type: this.operationForm.type,
        category: this.operationForm.category,
        amount: Number(this.operationForm.amount || 0),
        orderId: order.id,
        repairId: "",
        transportId: "",
        equipmentId: order.equipmentId,
        comment:
          `${billClientPrefix}${this.operationForm.comment || ""}`.trim(),
      });
      this.operationForm = this.emptyOperationForm(order);
      this.operationEditorOpen.set(false);
    } catch (error) {
      alert(`Не удалось добавить операцию: ${this.errorMessage(error)}`);
    }
  }

  setOperationType(type: "income" | "expense"): void {
    this.operationForm.type = type;
    this.operationForm.category =
      type === "income" ? "Оплата клиента" : "Прочее";
  }

  createDraftPlan(): number {
    return this.state.orderPlan(this.createDraftOrder());
  }

  createDraftEquipmentCharge(): number {
    return this.state.orderEquipmentCharge(this.createDraftOrder());
  }

  createDraftOperatorCost(): number {
    return this.state.orderOperatorCost(this.createDraftOrder());
  }

  createDraftWorkDays(): number {
    return this.state.orderEquipmentWorkDays(this.createDraftOrder());
  }

  createDraftWorkHours(): number {
    return this.state.orderEquipmentWorkHours(this.createDraftOrder());
  }

  orderDraftPlan(order: Order): number {
    return this.state.orderPlan(this.draftOrder(order));
  }

  orderDraftEquipmentCharge(order: Order): number {
    return this.state.orderEquipmentCharge(this.draftOrder(order));
  }

  orderDraftWorkDays(order: Order): number {
    return this.state.orderEquipmentWorkDays(this.draftOrder(order));
  }

  orderDraftWorkHours(order: Order): number {
    return this.state.orderEquipmentWorkHours(this.draftOrder(order));
  }

  orderDraftOperatorCost(order: Order): number {
    return this.state.orderOperatorCost(this.draftOrder(order));
  }

  orderDraftExpense(order: Order): number {
    return (
      this.state.orderExpense(order.id) -
      this.state.orderOperatorCost(order) +
      this.state.orderOperatorCost(this.draftOrder(order))
    );
  }

  orderDraftProfit(order: Order): number {
    return this.state.orderIncome(order.id) - this.orderDraftExpense(order);
  }

  breakdownDatesCount(order: Order): number {
    return this.breakdownDatesFromForm(order).length;
  }

  breakdownPaymentDelta(order: Order): number {
    return Math.max(
      0,
      this.state.orderPlan(order) - this.orderDraftPlan(order),
    );
  }

  breakdownOperatorDelta(order: Order): number {
    return Math.max(
      0,
      this.state.orderOperatorCost(order) -
        this.state.orderOperatorCost(this.draftOrder(order)),
    );
  }

  onOrderEquipmentChange(): void {
    const equipment = this.state.byId(
      this.state.equipment(),
      this.orderForm.equipmentId,
    );
    if (!equipment) return;
    if (!this.orderForm.rate)
      this.orderForm.rate = Number(equipment.defaultRate || 0);
    if (!this.orderForm.equipmentHourlyRate) {
      this.orderForm.equipmentHourlyRate = Number(equipment.hourlyRate || 0);
    }
  }

  onCreateEquipmentChange(): void {
    const equipment = this.state.byId(
      this.state.equipment(),
      this.createForm.equipmentId,
    );
    if (!equipment) return;
    if (!this.createForm.rate) {
      this.createForm.rate = Number(equipment.defaultRate || 0);
    }
    if (!this.createForm.equipmentHourlyRate) {
      this.createForm.equipmentHourlyRate = Number(equipment.hourlyRate || 0);
    }
  }

  onCreateOperatorChange(): void {
    this.createForm.primaryOperatorStartDate ||= this.createForm.startDate;
    this.createForm.primaryOperatorEndDate ||= this.createForm.endDate;
  }

  recalcLogisticsCost(): void {
    this.orderForm.logisticsPickupCost =
      Number(this.orderForm.logisticsPickupKm || 0) *
      Number(this.orderForm.logisticsPickupPricePerKm || 0);
    this.orderForm.logisticsDeliveryCost =
      Number(this.orderForm.logisticsDeliveryKm || 0) *
      Number(this.orderForm.logisticsDeliveryPricePerKm || 0);
    this.syncLogisticsTotalField();
  }

  syncLogisticsTotalField(): void {
    this.orderForm.logisticsCost = this.logisticsSubtotal();
    this.orderForm.logisticsDistanceKm =
      Number(this.orderForm.logisticsPickupKm || 0) +
      Number(this.orderForm.logisticsDeliveryKm || 0);
    this.orderForm.logisticsPricePerKm = Number(
      this.orderForm.logisticsDeliveryPricePerKm || 0,
    );
  }

  logisticsSubtotal(): number {
    if (!this.orderForm.logisticsEnabled) return 0;
    return (
      Number(this.orderForm.logisticsPickupCost || 0) +
      Number(this.orderForm.logisticsDeliveryCost || 0)
    );
  }

  assemblyTotal(): number {
    if (!this.orderForm.assemblyEnabled) return 0;
    return (
      Number(this.orderForm.assemblyDisassemblyCost || 0) +
      Number(this.orderForm.assemblyAssemblyCost || 0)
    );
  }

  orderDates(order: Order): string[] {
    if (!order.startDate || !order.endDate) return [];
    return this.utils.datesInclusive(order.startDate, order.endDate);
  }

  orderDraftDates(order: Order): string[] {
    return this.orderDates(this.draftOrder(order));
  }

  isIdleDate(kind: "equipment" | "operator", date: string): boolean {
    const dates =
      kind === "equipment"
        ? this.orderForm.equipmentIdleDates
        : this.orderForm.operatorIdleDates;
    return dates.includes(date);
  }

  toggleIdleDate(kind: "equipment" | "operator", date: string): void {
    const key =
      kind === "equipment" ? "equipmentIdleDates" : "operatorIdleDates";
    const dates = new Set(this.orderForm[key]);
    if (dates.has(date)) dates.delete(date);
    else dates.add(date);
    this.orderForm[key] = [...dates].sort();
  }

  excludeWeekendDates(order: Order, kind: "equipment" | "operator"): void {
    const key =
      kind === "equipment" ? "equipmentIdleDates" : "operatorIdleDates";
    const dates = new Set(this.orderForm[key]);
    this.orderDraftDates(order)
      .filter((date) => {
        const day = new Date(`${date}T00:00:00`).getDay();
        return day === 0 || day === 6;
      })
      .forEach((date) => dates.add(date));
    this.orderForm[key] = [...dates].sort();
  }

  clearIdleDates(kind: "equipment" | "operator"): void {
    const key =
      kind === "equipment" ? "equipmentIdleDates" : "operatorIdleDates";
    this.orderForm[key] = [];
  }

  idleDatesCount(kind: "equipment" | "operator"): number {
    return kind === "equipment"
      ? this.orderForm.equipmentIdleDates.length
      : this.orderForm.operatorIdleDates.length;
  }

  addOperatorShift(form: "order" | "create"): void {
    const target = form === "order" ? this.orderForm : this.createForm;
    target.operatorShifts = [
      ...target.operatorShifts,
      {
        id: this.utils.uid("shift"),
        operatorId: target.operatorId || "",
        startDate: target.primaryOperatorStartDate || target.startDate,
        endDate: target.primaryOperatorEndDate || target.endDate,
        idleDates: [],
      },
    ];
  }

  removeOperatorShift(form: "order" | "create", index: number): void {
    const target = form === "order" ? this.orderForm : this.createForm;
    target.operatorShifts = target.operatorShifts.filter((_, i) => i !== index);
  }

  shiftDates(
    shift: OperatorShift,
    fallback: { startDate: string; endDate: string },
  ): string[] {
    const start = shift.startDate || fallback.startDate;
    const end = shift.endDate || shift.startDate || fallback.endDate;
    if (!start || !end || start > end) return [];
    return this.utils.datesInclusive(start, end);
  }

  shiftWorkDays(
    shift: OperatorShift,
    fallback: { startDate: string; endDate: string },
  ): number {
    const idle = new Set(shift.idleDates || []);
    return this.shiftDates(shift, fallback).filter((date) => !idle.has(date))
      .length;
  }

  shiftPayroll(
    shift: OperatorShift,
    fallback: { startDate: string; endDate: string; standardWorkHours: number },
  ): number {
    const operator = this.state.byId(this.state.operators(), shift.operatorId);
    if (operator?.hourlyRate) {
      return (
        this.shiftWorkDays(shift, fallback) *
        Number(fallback.standardWorkHours || 8) *
        Number(operator.hourlyRate || 0)
      );
    }
    return this.shiftWorkDays(shift, fallback) * Number(operator?.rate || 0);
  }

  primaryOperatorWorkDays(
    form: typeof this.orderForm | typeof this.createForm,
  ): number {
    if (!form.operatorId) return 0;
    const startDate = form.primaryOperatorStartDate || form.startDate;
    const endDate = form.primaryOperatorEndDate || form.endDate;
    if (!startDate || !endDate || startDate > endDate) return 0;
    const idle = new Set(form.operatorIdleDates || []);
    return this.utils
      .datesInclusive(startDate, endDate)
      .filter((date) => !idle.has(date)).length;
  }

  primaryOperatorPayroll(
    form: typeof this.orderForm | typeof this.createForm,
  ): number {
    const operator = this.state.byId(this.state.operators(), form.operatorId);
    if (operator?.hourlyRate) {
      return (
        this.primaryOperatorWorkDays(form) *
        Number(form.standardWorkHours || 8) *
        Number(operator.hourlyRate || 0)
      );
    }
    return this.primaryOperatorWorkDays(form) * Number(operator?.rate || 0);
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

  excludeShiftWeekends(
    shift: OperatorShift,
    fallback: { startDate: string; endDate: string },
  ): void {
    const dates = new Set(shift.idleDates || []);
    this.shiftDates(shift, fallback)
      .filter((date) => {
        const day = new Date(`${date}T00:00:00`).getDay();
        return day === 0 || day === 6;
      })
      .forEach((date) => dates.add(date));
    shift.idleDates = [...dates].sort();
  }

  clearShiftIdleDates(shift: OperatorShift): void {
    shift.idleDates = [];
  }

  clientName(id: string): string {
    if (id === "no-client") return "Без клиента";
    return this.state.byId(this.state.clients(), id)?.name || "—";
  }

  equipmentName(id: string): string {
    return this.state.byId(this.state.equipment(), id)?.name || "—";
  }

  operatorName(id: string): string {
    return this.state.byId(this.state.operators(), id)?.name || "—";
  }

  statusLabel(status: string): string {
    return (
      {
        new: "Новая",
        confirmed: "Подтверждена",
        active: "В работе",
        completed: "Завершена",
        cancelled: "Отменена",
      }[status] || status
    );
  }

  statusBadgeClass(status: string): string {
    return (
      {
        new: "new",
        confirmed: "confirmed",
        active: "active",
        completed: "completed",
        cancelled: "cancelled",
      }[status] || "new"
    );
  }

  opTypeLabel(type: string): string {
    return type === "income" ? "Приход" : "Расход";
  }

  private buildLocationGroup(
    clientId: string,
    clientName: string,
    location: string,
    orders: Order[],
  ): LocationGroup {
    const sorted = [...orders].sort((a, b) =>
      b.startDate.localeCompare(a.startDate),
    );
    return {
      key: `${clientId}::${location}`,
      clientId,
      clientName,
      location,
      orders: sorted,
      plan: sorted.reduce((sum, order) => sum + this.state.orderPlan(order), 0),
      income: sorted.reduce(
        (sum, order) => sum + this.state.orderIncome(order.id),
        0,
      ),
      expense: sorted.reduce(
        (sum, order) => sum + this.state.orderExpense(order.id),
        0,
      ),
      profit: sorted.reduce(
        (sum, order) => sum + this.state.orderProfit(order.id),
        0,
      ),
      latestDate: sorted[0]?.startDate || "",
    };
  }

  private locationLabel(location: string): string {
    return (location || "").trim() || "Без локации";
  }

  private emptyOrderForm() {
    return {
      status: "new" as OrderStatus,
      equipmentId: "",
      operatorId: "",
      startDate: "",
      endDate: "",
      location: "",
      primaryOperatorStartDate: "",
      primaryOperatorEndDate: "",
      plan: 0,
      rate: 0,
      equipmentHourlyRate: 0,
      standardWorkHours: 8,
      additionalWorkHours: 0,
      vatEnabled: false,
      equipmentIdleDates: [] as string[],
      operatorIdleDates: [] as string[],
      operatorShifts: [] as OperatorShift[],
      discountEnabled: false,
      discountType: "percent" as "percent" | "amount",
      discountValue: 0,
      notes: "",
      logisticsEnabled: false,
      logisticsProvider: "own_trawl" as
        | "own_trawl"
        | "third_party"
        | "self_drive",
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
      assemblyEnabled: false,
      assemblyDisassemblyDate: "",
      assemblyAssemblyDate: "",
      assemblyDisassemblyCost: 0,
      assemblyAssemblyCost: 0,
      breakdownEnabled: false,
      breakdownDate: "",
      breakdownEndDate: "",
      breakdownStatus: "reported" as
        | "reported"
        | "diagnostics"
        | "repair"
        | "resolved",
      breakdownDescription: "",
      breakdownReporter: "",
      breakdownResponsible: "",
      breakdownFaultParty: "unknown" as
        | "unknown"
        | "ours"
        | "client"
        | "operator",
      breakdownAffectsPayment: true,
      breakdownOperatorIdle: true,
      breakdownLaborCost: 0,
      breakdownPartsCost: 0,
    };
  }

  private orderToForm(order: Order) {
    return {
      status: order.status || ("new" as OrderStatus),
      equipmentId: order.equipmentId || "",
      operatorId: order.operatorId || "",
      startDate: order.startDate || "",
      endDate: order.endDate || "",
      location: order.location || "",
      primaryOperatorStartDate: this.primaryOperatorPeriod(order).startDate,
      primaryOperatorEndDate: this.primaryOperatorPeriod(order).endDate,
      plan: Math.round(this.state.orderPlan(order)),
      rate: Number(order.rate || 0),
      equipmentHourlyRate: Number(order.equipmentHourlyRate || 0),
      standardWorkHours: Number(order.standardWorkHours || 8),
      additionalWorkHours: Number(order.additionalWorkHours || 0),
      vatEnabled: Boolean(order.vatEnabled),
      equipmentIdleDates: [...(order.equipmentIdleDates || [])],
      operatorIdleDates: [...(order.operatorIdleDates || [])],
      operatorShifts: this.cloneOperatorShifts(order.operatorShifts || []),
      discountEnabled: Boolean(order.discountEnabled),
      discountType: order.discountType || ("percent" as "percent" | "amount"),
      discountValue: Number(order.discountValue || 0),
      notes: order.notes || "",
      logisticsEnabled: Boolean(order.logisticsEnabled),
      logisticsProvider: order.logisticsProvider || "own_trawl",
      logisticsTrailerId: order.logisticsTrailerId || "",
      logisticsStartDate: order.logisticsStartDate || order.startDate || "",
      logisticsEndDate: order.logisticsEndDate || order.endDate || "",
      logisticsDistanceKm: Number(order.logisticsDistanceKm || 0),
      logisticsPricePerKm: Number(order.logisticsPricePerKm || 0),
      logisticsCost: Number(order.logisticsCost || 0),
      logisticsPickupPricePerKm: Number(order.logisticsPickupPricePerKm || 50),
      logisticsDeliveryPricePerKm: Number(
        order.logisticsDeliveryPricePerKm || 250,
      ),
      logisticsPickupKm: Number(order.logisticsPickupKm || 0),
      logisticsDeliveryKm: Number(
        order.logisticsDeliveryKm || order.logisticsDistanceKm || 0,
      ),
      logisticsPickupCost: Number(order.logisticsPickupCost || 0),
      logisticsDeliveryCost: Number(
        order.logisticsDeliveryCost ||
          (order.logisticsPickupCost ? 0 : order.logisticsCost || 0),
      ),
      assemblyEnabled: Boolean(order.assemblyEnabled),
      assemblyDisassemblyDate: order.assemblyDisassemblyDate || "",
      assemblyAssemblyDate: order.assemblyAssemblyDate || "",
      assemblyDisassemblyCost: Number(order.assemblyDisassemblyCost || 0),
      assemblyAssemblyCost: Number(order.assemblyAssemblyCost || 0),
      breakdownEnabled: Boolean(order.breakdownEnabled),
      breakdownDate: order.breakdownDate || "",
      breakdownEndDate: order.breakdownEndDate || "",
      breakdownStatus:
        order.breakdownStatus ||
        ("reported" as "reported" | "diagnostics" | "repair" | "resolved"),
      breakdownDescription: order.breakdownDescription || "",
      breakdownReporter: order.breakdownReporter || "",
      breakdownResponsible: order.breakdownResponsible || "",
      breakdownFaultParty:
        order.breakdownFaultParty ||
        ("unknown" as "unknown" | "ours" | "client" | "operator"),
      breakdownAffectsPayment: Boolean(order.breakdownAffectsPayment),
      breakdownOperatorIdle: Boolean(order.breakdownOperatorIdle),
      breakdownLaborCost: Number(order.breakdownLaborCost || 0),
      breakdownPartsCost: Number(order.breakdownPartsCost || 0),
    };
  }

  private draftOrder(order: Order): Order {
    const idlePatch = this.breakdownIdlePatch(order);
    return {
      ...order,
      status: this.orderForm.status,
      equipmentId: this.orderForm.equipmentId,
      operatorId: this.orderForm.operatorId,
      startDate: this.orderForm.startDate,
      endDate: this.orderForm.endDate,
      location: this.orderForm.location,
      operatorShifts: this.normalizeOperatorShifts(
        this.orderForm.operatorShifts,
        order,
        this.orderForm.primaryOperatorStartDate,
        this.orderForm.primaryOperatorEndDate,
      ),
      rate: Number(this.orderForm.rate || 0),
      equipmentHourlyRate: Number(this.orderForm.equipmentHourlyRate || 0),
      standardWorkHours: Number(this.orderForm.standardWorkHours || 8),
      additionalWorkHours: Number(this.orderForm.additionalWorkHours || 0),
      vatEnabled: Boolean(this.orderForm.vatEnabled),
      discountEnabled: this.orderForm.discountEnabled,
      discountType: this.orderForm.discountType,
      discountValue: Number(this.orderForm.discountValue || 0),
      notes: this.orderForm.notes,
      logisticsEnabled: Boolean(this.orderForm.logisticsEnabled),
      logisticsProvider: this.orderForm.logisticsEnabled
        ? this.orderForm.logisticsProvider
        : "own_trawl",
      logisticsTrailerId:
        this.orderForm.logisticsEnabled &&
        this.orderForm.logisticsProvider === "own_trawl"
          ? this.orderForm.logisticsTrailerId
          : "",
      logisticsStartDate: this.orderForm.logisticsEnabled
        ? this.orderForm.logisticsStartDate || order.startDate
        : "",
      logisticsEndDate: this.orderForm.logisticsEnabled
        ? this.orderForm.logisticsEndDate || order.endDate
        : "",
      logisticsDistanceKm: this.orderForm.logisticsEnabled
        ? Number(this.orderForm.logisticsPickupKm || 0) +
          Number(this.orderForm.logisticsDeliveryKm || 0)
        : 0,
      logisticsPricePerKm: this.orderForm.logisticsEnabled
        ? Number(this.orderForm.logisticsDeliveryPricePerKm || 0)
        : 0,
      logisticsCost: this.orderForm.logisticsEnabled
        ? this.logisticsSubtotal()
        : 0,
      logisticsPickupPricePerKm: this.orderForm.logisticsEnabled
        ? Number(this.orderForm.logisticsPickupPricePerKm || 0)
        : 50,
      logisticsDeliveryPricePerKm: this.orderForm.logisticsEnabled
        ? Number(this.orderForm.logisticsDeliveryPricePerKm || 0)
        : 250,
      logisticsPickupKm: this.orderForm.logisticsEnabled
        ? Number(this.orderForm.logisticsPickupKm || 0)
        : 0,
      logisticsDeliveryKm: this.orderForm.logisticsEnabled
        ? Number(this.orderForm.logisticsDeliveryKm || 0)
        : 0,
      logisticsPickupCost: this.orderForm.logisticsEnabled
        ? Number(this.orderForm.logisticsPickupCost || 0)
        : 0,
      logisticsDeliveryCost: this.orderForm.logisticsEnabled
        ? Number(this.orderForm.logisticsDeliveryCost || 0)
        : 0,
      assemblyEnabled: Boolean(this.orderForm.assemblyEnabled),
      assemblyDisassemblyDate: this.orderForm.assemblyEnabled
        ? this.orderForm.assemblyDisassemblyDate
        : "",
      assemblyAssemblyDate: this.orderForm.assemblyEnabled
        ? this.orderForm.assemblyAssemblyDate
        : "",
      assemblyDisassemblyCost: this.orderForm.assemblyEnabled
        ? Number(this.orderForm.assemblyDisassemblyCost || 0)
        : 0,
      assemblyAssemblyCost: this.orderForm.assemblyEnabled
        ? Number(this.orderForm.assemblyAssemblyCost || 0)
        : 0,
      breakdownEnabled: Boolean(this.orderForm.breakdownEnabled),
      breakdownDate: this.orderForm.breakdownEnabled
        ? this.orderForm.breakdownDate
        : "",
      breakdownEndDate: this.orderForm.breakdownEnabled
        ? this.orderForm.breakdownEndDate || this.orderForm.breakdownDate
        : "",
      breakdownStatus: this.orderForm.breakdownEnabled
        ? this.orderForm.breakdownStatus
        : "reported",
      breakdownDescription: this.orderForm.breakdownEnabled
        ? this.orderForm.breakdownDescription
        : "",
      breakdownReporter: this.orderForm.breakdownEnabled
        ? this.orderForm.breakdownReporter
        : "",
      breakdownResponsible: this.orderForm.breakdownEnabled
        ? this.orderForm.breakdownResponsible
        : "",
      breakdownFaultParty: this.orderForm.breakdownEnabled
        ? this.orderForm.breakdownFaultParty
        : "unknown",
      breakdownAffectsPayment: this.orderForm.breakdownEnabled
        ? this.orderForm.breakdownAffectsPayment
        : false,
      breakdownOperatorIdle: this.orderForm.breakdownEnabled
        ? this.orderForm.breakdownOperatorIdle
        : false,
      breakdownLaborCost: this.orderForm.breakdownEnabled
        ? Number(this.orderForm.breakdownLaborCost || 0)
        : 0,
      breakdownPartsCost: this.orderForm.breakdownEnabled
        ? Number(this.orderForm.breakdownPartsCost || 0)
        : 0,
      equipmentIdleDates: idlePatch.equipmentIdleDates,
      operatorIdleDates: idlePatch.operatorIdleDates,
    };
  }

  private breakdownIdlePatch(order: Order): {
    equipmentIdleDates: string[];
    operatorIdleDates: string[];
  } {
    const previousBreakdownDates = new Set(this.breakdownDatesFromOrder(order));
    const currentBreakdownDates = this.breakdownDatesFromForm(order);
    const equipmentIdleDates = new Set(
      (this.orderForm.equipmentIdleDates || []).filter(
        (date) => !previousBreakdownDates.has(date),
      ),
    );
    const operatorIdleDates = new Set(
      (this.orderForm.operatorIdleDates || []).filter(
        (date) => !previousBreakdownDates.has(date),
      ),
    );

    if (
      this.orderForm.breakdownEnabled &&
      this.orderForm.breakdownAffectsPayment
    ) {
      currentBreakdownDates.forEach((date) => equipmentIdleDates.add(date));
      if (this.orderForm.breakdownOperatorIdle) {
        currentBreakdownDates.forEach((date) => operatorIdleDates.add(date));
      }
    }

    return {
      equipmentIdleDates: [...equipmentIdleDates]
        .filter((date) => date >= order.startDate && date <= order.endDate)
        .sort(),
      operatorIdleDates: [...operatorIdleDates]
        .filter((date) => date >= order.startDate && date <= order.endDate)
        .sort(),
    };
  }

  private breakdownDatesFromForm(order: Order): string[] {
    if (!this.orderForm.breakdownEnabled || !this.orderForm.breakdownDate)
      return [];
    const endDate =
      this.orderForm.breakdownEndDate || this.orderForm.breakdownDate;
    if (this.orderForm.breakdownDate > endDate) return [];
    return this.utils
      .datesInclusive(this.orderForm.breakdownDate, endDate)
      .filter((date) => date >= order.startDate && date <= order.endDate);
  }

  private breakdownDatesFromOrder(order: Order): string[] {
    if (!order.breakdownEnabled || !order.breakdownDate) return [];
    const endDate = order.breakdownEndDate || order.breakdownDate;
    if (order.breakdownDate > endDate) return [];
    return this.utils
      .datesInclusive(order.breakdownDate, endDate)
      .filter((date) => date >= order.startDate && date <= order.endDate);
  }

  private createDraftOrder(id = "draft"): Order {
    const baseOrder = {
      id,
      clientId: this.createForm.clientId,
      equipmentId: this.createForm.equipmentId,
      operatorId: this.createForm.operatorId,
      startDate: this.createForm.startDate,
      endDate: this.createForm.endDate,
      location: this.createForm.location,
      rate: Number(this.createForm.rate || 0),
      equipmentHourlyRate: Number(this.createForm.equipmentHourlyRate || 0),
      standardWorkHours: Number(this.createForm.standardWorkHours || 8),
      additionalWorkHours: Number(this.createForm.additionalWorkHours || 0),
      vatEnabled: Boolean(this.createForm.vatEnabled),
      discountEnabled: Boolean(this.createForm.discountEnabled),
      discountType: this.createForm.discountType,
      discountValue: Number(this.createForm.discountValue || 0),
      status: this.createForm.status,
      notes: this.createForm.notes,
      createdAt: "",
      equipmentIdleDates: [],
      operatorIdleDates: [...(this.createForm.operatorIdleDates || [])],
      operatorShifts: [],
      logisticsEnabled: false,
      logisticsProvider: "own_trawl" as const,
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
      assemblyEnabled: false,
      assemblyDisassemblyDate: "",
      assemblyAssemblyDate: "",
      assemblyDisassemblyCost: 0,
      assemblyAssemblyCost: 0,
      breakdownEnabled: false,
      breakdownDate: "",
      breakdownEndDate: "",
      breakdownStatus: "reported" as const,
      breakdownDescription: "",
      breakdownReporter: "",
      breakdownResponsible: "",
      breakdownFaultParty: "unknown" as const,
      breakdownAffectsPayment: false,
      breakdownOperatorIdle: false,
      breakdownLaborCost: 0,
      breakdownPartsCost: 0,
      breakdownCreateRepair: false,
      breakdownRepairId: "",
    } satisfies Order;
    return {
      ...baseOrder,
      operatorShifts: this.normalizeOperatorShifts(
        this.createForm.operatorShifts,
        baseOrder,
        this.createForm.primaryOperatorStartDate,
        this.createForm.primaryOperatorEndDate,
      ),
    };
  }

  private normalizeOperatorShifts(
    shifts: OperatorShift[],
    order: Pick<
      Order,
      "operatorId" | "startDate" | "endDate" | "operatorIdleDates"
    >,
    primaryStartDate = "",
    primaryEndDate = "",
  ): OperatorShift[] {
    if (!shifts.length && order.operatorId) {
      const startDate = primaryStartDate || order.startDate;
      const endDate = primaryEndDate || order.endDate;
      const usesCustomPeriod =
        startDate &&
        endDate &&
        (startDate !== order.startDate || endDate !== order.endDate);
      if (usesCustomPeriod) {
        const periodDates = new Set(
          this.utils.datesInclusive(startDate, endDate),
        );
        return [
          {
            id: this.utils.uid("shift"),
            operatorId: order.operatorId,
            startDate,
            endDate,
            idleDates: [...new Set(order.operatorIdleDates || [])]
              .filter((date) => periodDates.has(date))
              .sort(),
          },
        ];
      }
    }
    return shifts
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
            .filter((date) => dates.has(date))
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

  private emptyOperationForm(order?: Order) {
    return {
      date: this.utils.todayStr(),
      type: "expense" as "income" | "expense",
      category: "Прочее",
      amount: 0,
      billClient: false,
      comment: order ? `Заявка ${order.id.slice(-5)}` : "",
    };
  }

  private emptyCreateForm() {
    return {
      clientId: "",
      equipmentId: "",
      operatorId: "",
      primaryOperatorStartDate: "",
      primaryOperatorEndDate: "",
      startDate: "",
      endDate: "",
      location: "",
      status: "new" as OrderStatus,
      plan: 0,
      rate: 0,
      equipmentHourlyRate: 0,
      standardWorkHours: 8,
      additionalWorkHours: 0,
      vatEnabled: false,
      operatorIdleDates: [] as string[],
      operatorShifts: [] as OperatorShift[],
      discountEnabled: false,
      discountType: "percent" as "percent" | "amount",
      discountValue: 0,
      notes: "",
    };
  }

  private planPatch(
    order: Order,
    desiredPlan: number,
    basePatch: Record<string, any>,
  ): Record<string, any> {
    if (
      !desiredPlan ||
      Math.abs(desiredPlan - this.state.orderPlan(order)) < 1
    ) {
      return {};
    }
    const draft = { ...order, ...basePatch } as Order;
    const logistics = this.state.orderLogisticsCost(draft);
    const assembly = this.state.orderAssemblyCost(draft);
    const discountValue = Number(draft.discountValue || 0);
    let subtotalTarget = desiredPlan;
    if (draft.discountEnabled && discountValue > 0) {
      subtotalTarget =
        draft.discountType === "amount"
          ? desiredPlan + discountValue
          : desiredPlan / Math.max(0.01, 1 - discountValue / 100);
    }
    const targetEquipmentCharge = Math.max(
      0,
      subtotalTarget - logistics - assembly,
    );
    const targetEquipmentBase = draft.vatEnabled
      ? targetEquipmentCharge / 1.2
      : targetEquipmentCharge;

    if (Number(order.equipmentHourlyRate || 0) > 0) {
      return {
        equipmentHourlyRate:
          targetEquipmentBase /
          Math.max(1, this.state.orderEquipmentWorkHours(draft)),
      };
    }
    return {
      rate:
        targetEquipmentBase /
        Math.max(1, this.state.orderEquipmentWorkDays(draft)),
    };
  }

  private errorMessage(error: any): string {
    return error?.message || error?.details || String(error || "ошибка");
  }
}
