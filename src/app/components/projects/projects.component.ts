import { Component, computed, inject, signal } from "@angular/core";
import { NgClass, SlicePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { DbService } from "../../services/db.service";
import { StateService } from "../../services/state.service";
import { UtilsService } from "../../services/utils.service";
import { FinanceOperation, Order, OrderStatus } from "../../models/crm.models";

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
          locationMap.set(location, [...(locationMap.get(location) || []), order]);
        });
        const locations = [...locationMap.entries()]
          .map(([location, locationOrders]) =>
            this.buildLocationGroup(clientId, clientName, location, locationOrders),
          )
          .sort((a, b) => b.latestDate.localeCompare(a.latestDate));

        return {
          clientId,
          clientName,
          locations,
          ordersCount: orders.length,
          plan: orders.reduce((sum, order) => sum + this.state.orderPlan(order), 0),
          income: orders.reduce((sum, order) => sum + this.state.orderIncome(order.id), 0),
          expense: orders.reduce((sum, order) => sum + this.state.orderExpense(order.id), 0),
          profit: orders.reduce((sum, order) => sum + this.state.orderProfit(order.id), 0),
          latestDate: orders.reduce(
            (latest, order) => (order.startDate > latest ? order.startDate : latest),
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
  }

  closeLocation(): void {
    this.selectedLocationKey.set("");
    this.selectedOrderId.set("");
    this.creatingOrder.set(false);
    this.orderForm = this.emptyOrderForm();
    this.createForm = this.emptyCreateForm();
  }

  openCreateOrder(location?: LocationGroup): void {
    const today = this.utils.todayStr();
    this.selectedOrderId.set("");
    this.creatingOrder.set(true);
    this.createForm = {
      ...this.emptyCreateForm(),
      clientId: location?.clientId === "no-client" ? "" : location?.clientId || "",
      location: location?.location === "Без локации" ? "" : location?.location || "",
      startDate: today,
      endDate: today,
    };
  }

  cancelCreateOrder(): void {
    this.creatingOrder.set(false);
    this.createForm = this.emptyCreateForm();
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
    const days = this.utils.daysInclusive(
      this.createForm.startDate,
      this.createForm.endDate,
    );
    const plan = Number(this.createForm.plan || 0);
    try {
      await this.db.insert("orders", {
        id,
        clientId: this.createForm.clientId,
        equipmentId: this.createForm.equipmentId,
        operatorId: this.createForm.operatorId,
        startDate: this.createForm.startDate,
        endDate: this.createForm.endDate,
        location: this.createForm.location,
        rate: days ? plan / days : plan,
        equipmentHourlyRate: 0,
        standardWorkHours: 8,
        additionalWorkHours: 0,
        vatEnabled: false,
        discountEnabled: Boolean(this.createForm.discountEnabled),
        discountType: this.createForm.discountType,
        discountValue: Number(this.createForm.discountValue || 0),
        status: this.createForm.status,
        notes: this.createForm.notes,
        equipmentIdleDates: [],
        operatorIdleDates: [],
        operatorShifts: [],
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
        createdAt: new Date().toISOString(),
      });
      this.creatingOrder.set(false);
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
    this.selectedOrderId.set(order.id);
    this.orderForm = this.orderToForm(order);
    this.operationForm = this.emptyOperationForm(order);
  }

  closeOrder(): void {
    this.selectedOrderId.set("");
    this.orderForm = this.emptyOrderForm();
    const location = this.selectedLocation();
    this.operationForm = this.emptyOperationForm(location?.orders[0]);
  }

  async saveOrder(): Promise<void> {
    const order = this.selectedOrder();
    if (!order) return;
    const patch: Record<string, any> = {
      status: this.orderForm.status,
      equipmentId: this.orderForm.equipmentId,
      operatorId: this.orderForm.operatorId,
      discountEnabled: this.orderForm.discountEnabled,
      discountType: this.orderForm.discountType,
      discountValue: Number(this.orderForm.discountValue || 0),
      notes: this.orderForm.notes,
    };
    Object.assign(patch, this.planPatch(order, Number(this.orderForm.plan || 0), patch));
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
        comment: `${billClientPrefix}${this.operationForm.comment || ""}`.trim(),
      });
      this.operationForm = this.emptyOperationForm(order);
    } catch (error) {
      alert(`Не удалось добавить операцию: ${this.errorMessage(error)}`);
    }
  }

  setOperationType(type: "income" | "expense"): void {
    this.operationForm.type = type;
    this.operationForm.category =
      type === "income" ? "Оплата клиента" : "Прочее";
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
    const sorted = [...orders].sort((a, b) => b.startDate.localeCompare(a.startDate));
    return {
      key: `${clientId}::${location}`,
      clientId,
      clientName,
      location,
      orders: sorted,
      plan: sorted.reduce((sum, order) => sum + this.state.orderPlan(order), 0),
      income: sorted.reduce((sum, order) => sum + this.state.orderIncome(order.id), 0),
      expense: sorted.reduce((sum, order) => sum + this.state.orderExpense(order.id), 0),
      profit: sorted.reduce((sum, order) => sum + this.state.orderProfit(order.id), 0),
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
      plan: 0,
      discountEnabled: false,
      discountType: "percent" as "percent" | "amount",
      discountValue: 0,
      notes: "",
    };
  }

  private orderToForm(order: Order) {
    return {
      status: order.status || ("new" as OrderStatus),
      equipmentId: order.equipmentId || "",
      operatorId: order.operatorId || "",
      plan: Math.round(this.state.orderPlan(order)),
      discountEnabled: Boolean(order.discountEnabled),
      discountType: order.discountType || ("percent" as "percent" | "amount"),
      discountValue: Number(order.discountValue || 0),
      notes: order.notes || "",
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
      startDate: "",
      endDate: "",
      location: "",
      status: "new" as OrderStatus,
      plan: 0,
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
    if (!desiredPlan || Math.abs(desiredPlan - this.state.orderPlan(order)) < 1) {
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
    const targetEquipmentCharge = Math.max(0, subtotalTarget - logistics - assembly);
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
