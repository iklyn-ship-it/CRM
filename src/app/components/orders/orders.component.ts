import { Component, computed, signal, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { NgClass, SlicePipe } from "@angular/common";
import { StateService } from "../../services/state.service";
import { DbService } from "../../services/db.service";
import { UtilsService } from "../../services/utils.service";
import { Order, OrderStatus } from "../../models/crm.models";

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
  readonly pickupRatePerKm = 50;
  readonly deliveryRatePerKm = 250;

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
    logisticsProvider: "own_trawl" as "own_trawl" | "third_party",
    logisticsTrailerId: "",
    logisticsPickupKm: 0,
    logisticsDeliveryKm: 0,
    logisticsPickupCost: 0,
    logisticsDeliveryCost: 0,
  };

  readonly statuses: { value: OrderStatus; label: string }[] = [
    { value: "new", label: "Новая" },
    { value: "confirmed", label: "Подтверждена" },
    { value: "active", label: "В работе" },
    { value: "completed", label: "Завершена" },
    { value: "cancelled", label: "Отменена" },
  ];

  readonly filterStatuses = [{ value: "", label: "Все" }, ...this.statuses];

  readonly conflictSet = computed(() => {
    const conf = this.state.orderConflicts();
    return new Set(conf.flatMap((x) => [x[0], x[1]]));
  });

  readonly operatorConflictSet = computed(() => {
    const conf = this.state.operatorConflicts();
    return new Set(conf.flatMap((x) => [x[0], x[1]]));
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

  recalcLogisticsCost(kind: "pickup" | "delivery"): void {
    if (kind === "pickup") {
      this.form.logisticsPickupCost =
        Number(this.form.logisticsPickupKm || 0) * this.pickupRatePerKm;
    } else {
      this.form.logisticsDeliveryCost =
        Number(this.form.logisticsDeliveryKm || 0) * this.deliveryRatePerKm;
    }
  }

  logisticsTotal(): number {
    if (!this.form.logisticsEnabled) return 0;
    return (
      Number(this.form.logisticsPickupCost || 0) +
      Number(this.form.logisticsDeliveryCost || 0)
    );
  }

  async save(): Promise<void> {
    if (!this.form.startDate || !this.form.endDate) return;
    const operatorConflict = this.formOperatorConflict();
    if (operatorConflict) {
      const conflictEquipment =
        this.eqName(operatorConflict.equipmentId) || "другая техника";
      alert(
        `Оператор занят в другой заявке: ${conflictEquipment}, ${this.utils.fmtDate(operatorConflict.startDate)} - ${this.utils.fmtDate(operatorConflict.endDate)}.`,
      );
      return;
    }
    if (this.editingId) {
      await this.db.update("orders", this.editingId, this.prepareForm());
    } else {
      await this.db.insert("orders", {
        id: this.utils.uid("ord"),
        ...this.prepareForm(),
      });
    }
    this.clearForm();
    this.formOpen.set(false);
    this.selectedOrder.set(null);
  }

  edit(order: Order): void {
    this.selectedOrder.set(null);
    this.editingId = order.id;
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
      logisticsPickupKm: Number(order.logisticsPickupKm || 0),
      logisticsDeliveryKm: Number(order.logisticsDeliveryKm || 0),
      logisticsPickupCost: Number(order.logisticsPickupCost || 0),
      logisticsDeliveryCost: Number(order.logisticsDeliveryCost || 0),
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
      logisticsPickupKm: 0,
      logisticsDeliveryKm: 0,
      logisticsPickupCost: 0,
      logisticsDeliveryCost: 0,
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

  private formDraftOrder(): Order {
    return {
      id: this.editingId || "draft",
      createdAt: "",
      ...this.prepareForm(),
    };
  }

  private prepareForm(): Omit<Order, "id" | "createdAt"> {
    const inPeriod = new Set(this.orderDates());
    return {
      ...this.form,
      logisticsTrailerId:
        this.form.logisticsEnabled && this.form.logisticsProvider === "own_trawl"
          ? this.form.logisticsTrailerId
          : "",
      equipmentIdleDates: this.form.equipmentIdleDates
        .filter((date) => inPeriod.has(date))
        .sort(),
      operatorIdleDates: this.form.operatorIdleDates
        .filter((date) => inPeriod.has(date))
        .sort(),
    };
  }
}
