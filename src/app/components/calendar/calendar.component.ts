import { Component, computed, signal, inject } from "@angular/core";
import { NgClass, SlicePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { StateService } from "../../services/state.service";
import { DbService } from "../../services/db.service";
import { UtilsService } from "../../services/utils.service";
import { Order, OrderStatus, Transport } from "../../models/crm.models";

interface CalCell {
  date: Date;
  inMonth: boolean;
  ds: string;
  weekend: boolean;
  entries: {
    id: string;
    eq: string;
    cl: string;
    type: string;
    statusClass: string;
    equipmentId: string;
    blocksSchedule?: boolean;
    conflict: boolean;
  }[];
}

@Component({
  selector: "app-calendar",
  standalone: true,
  imports: [NgClass, FormsModule, SlicePipe],
  templateUrl: "./calendar.component.html",
  styleUrl: "./calendar.component.css",
})
export class CalendarComponent {
  readonly weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  state = inject(StateService);
  db = inject(DbService);
  utils = inject(UtilsService);

  // Local signal for calendar navigation (not persisted on every click)
  readonly viewDate = signal(new Date());
  readonly equipmentTypeFilter = signal("");
  formOpen = signal(false);
  selectedTransport = signal<Transport | null>(null);
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
  };

  readonly statuses: { value: OrderStatus; label: string }[] = [
    { value: "new", label: "Новая" },
    { value: "confirmed", label: "Подтверждена" },
    { value: "active", label: "В работе" },
    { value: "completed", label: "Завершена" },
    { value: "cancelled", label: "Отменена" },
  ];

  private normalizeType(value: string): string {
    return (value || "").trim();
  }

  readonly equipmentTypes = computed(() => {
    const types = this.state
      .equipment()
      .map((eq) => this.normalizeType(eq.type))
      .filter(Boolean);
    return Array.from(new Set(types)).sort((a, b) => a.localeCompare(b));
  });

  readonly filteredEquipment = computed(() => {
    const type = this.equipmentTypeFilter();
    return this.state
      .equipment()
      .filter((eq) => !type || this.normalizeType(eq.type) === type)
      .sort((a, b) => {
        const aIsTrawl = this.isTrawl(a.type);
        const bIsTrawl = this.isTrawl(b.type);
        if (aIsTrawl !== bIsTrawl) return aIsTrawl ? -1 : 1;
        return a.name.localeCompare(b.name, "ru");
      });
  });

  private isTrawl(type: string): boolean {
    return this.normalizeType(type).toLowerCase().includes("трал");
  }

  private isEquipmentTypeVisible(equipmentId: string): boolean {
    const type = this.equipmentTypeFilter();
    if (!type) return true;
    const equipment = this.state.byId(this.state.equipment(), equipmentId);
    return this.normalizeType(equipment?.type || "") === type;
  }

  get monthLabel(): string {
    const start = this.rangeStart();
    const end = this.rangeEnd();
    const startLabel = start.toLocaleDateString("ru-RU", {
      month: "long",
      year: "numeric",
    });
    const endLabel = end.toLocaleDateString("ru-RU", {
      month: "long",
      year: "numeric",
    });
    return `${startLabel} - ${endLabel}`;
  }

  prevMonth(): void {
    const d = this.viewDate();
    this.viewDate.set(new Date(d.getFullYear(), d.getMonth() - 3, 1));
  }
  nextMonth(): void {
    const d = this.viewDate();
    this.viewDate.set(new Date(d.getFullYear(), d.getMonth() + 3, 1));
  }
  currentMonth(): void {
    this.viewDate.set(new Date());
  }

  onModeChange(mode: string): void {
    this.db.saveUserSettings({ ...this.db.userSettings(), calendarMode: mode });
  }

  readonly calendarCells = computed((): CalCell[] => {
    const rangeStart = this.rangeStart();
    const rangeEnd = this.rangeEnd();
    const firstGridDay = new Date(rangeStart);
    firstGridDay.setDate(firstGridDay.getDate() - ((firstGridDay.getDay() + 6) % 7));
    const lastGridDay = new Date(rangeEnd);
    lastGridDay.setDate(lastGridDay.getDate() + (6 - ((lastGridDay.getDay() + 6) % 7)));
    const cells: CalCell[] = [];

    for (
      let cur = new Date(firstGridDay);
      cur <= lastGridDay;
      cur.setDate(cur.getDate() + 1)
    ) {
        const day = new Date(cur);
        const inMonth = day >= rangeStart && day <= rangeEnd;
        const ds = this.utils.dateKey(day);
        const weekend = [0, 6].includes(day.getDay());

        const rentEntries = this.state
          .orders()
          .filter(
            (o) =>
              this.state.orderWorksOnDate(o, "equipment", ds) &&
              this.isEquipmentTypeVisible(o.equipmentId) &&
              o.status !== "cancelled",
          )
          .map((o) => ({
            id: o.id,
            eq:
              this.state.byId(this.state.equipment(), o.equipmentId)?.name ||
              "Техника",
            cl:
              this.state.byId(this.state.clients(), o.clientId)?.name ||
              "Клиент",
            type: "rent",
            statusClass: "status-" + o.status,
            equipmentId: o.equipmentId,
            blocksSchedule: this.state.orderBlocksSchedule(o),
            conflict: false,
          }));

        const logisticsEntries = this.state
          .orders()
          .filter(
            (o) =>
              o.logisticsEnabled &&
              o.logisticsProvider === "own_trawl" &&
              o.logisticsTrailerId &&
              this.state.orderBlocksSchedule(o) &&
              this.isEquipmentTypeVisible(o.logisticsTrailerId) &&
              this.state.orderLogisticsStart(o) <= ds &&
              this.state.orderLogisticsEnd(o) >= ds,
          )
          .map((o) => ({
            id: o.id,
            eq:
              this.state.byId(this.state.equipment(), o.logisticsTrailerId)
                ?.name || "Трал",
            cl:
              this.state.byId(this.state.clients(), o.clientId)?.name ||
              "Логистика",
            type: "logistics",
            statusClass: "logistics",
            equipmentId: o.logisticsTrailerId,
            blocksSchedule: this.state.orderBlocksSchedule(o),
            conflict: false,
          }));

        const repairEntries = this.state
          .repairs()
          .filter(
            (r) =>
              r.status !== "cancelled" &&
              this.isEquipmentTypeVisible(r.equipmentId) &&
              r.startDate <= ds &&
              r.endDate >= ds,
          )
          .map((r) => ({
            id: r.id,
            eq:
              this.state.byId(this.state.equipment(), r.equipmentId)?.name ||
              "Техника",
            cl: r.tasks || "Ремонт",
            type: "repair",
            statusClass: "repair",
            equipmentId: r.equipmentId,
            conflict: false,
          }));

        const transportEntries = this.state
          .transports()
          .filter(
            (transport) =>
              transport.status !== "cancelled" &&
              this.isEquipmentTypeVisible(transport.equipmentId) &&
              transport.startDate <= ds &&
              transport.endDate >= ds,
          )
          .map((transport) => ({
            id: transport.id,
            eq:
              this.state.byId(this.state.equipment(), transport.equipmentId)
                ?.name || "Трал",
            cl: this.transportTitle(transport),
            type: "transport",
            statusClass: "transport",
            equipmentId: transport.equipmentId,
            blocksSchedule: true,
            conflict: false,
          }));

        const entries = [
          ...rentEntries,
          ...logisticsEntries,
          ...transportEntries,
          ...repairEntries,
        ];
        const cnt: Record<string, number> = {};
        entries.forEach((e) => {
          const shouldCount =
            e.type === "repair" || ("blocksSchedule" in e && e.blocksSchedule);
          if (shouldCount) {
            cnt[e.equipmentId] = (cnt[e.equipmentId] || 0) + 1;
          }
        });
        entries.forEach((e) => (e.conflict = cnt[e.equipmentId] > 1));
        cells.push({
          date: day,
          inMonth,
          ds,
          weekend,
          entries: entries.slice(0, 5),
        });
    }
    return cells;
  });

  readonly timelineEquipment = computed(() => {
    const days = this.timelineDays();
    const rangeStart = this.rangeStart();
    const rangeEnd = this.rangeEnd();

    return this.filteredEquipment().map((eq) => {
      const rangedEvents = [
        ...this.state
          .orders()
          .filter((o) => o.equipmentId === eq.id && o.status !== "cancelled")
          .flatMap((o) =>
            this.orderSegments(o, rangeStart, rangeEnd).map((segment) => ({
              id: o.id,
              type: "rent" as const,
              status: o.status,
              title:
                this.state.byId(this.state.clients(), o.clientId)?.name ||
                "Аренда",
              startDate: segment.startDate,
              endDate: segment.endDate,
              conflict: false,
            })),
          ),
        ...this.state
          .orders()
          .filter(
            (o) =>
              o.logisticsEnabled &&
              o.logisticsProvider === "own_trawl" &&
              o.logisticsTrailerId === eq.id &&
              o.status !== "cancelled",
          )
          .flatMap((o) =>
            this.orderLogisticsSegments(o, rangeStart, rangeEnd).map(
              (segment) => ({
                id: o.id,
                type: "logistics" as const,
                status: o.status,
                title:
                  this.state.byId(this.state.clients(), o.clientId)?.name ||
                  "Логистика",
                startDate: segment.startDate,
                endDate: segment.endDate,
                conflict: false,
              }),
            ),
          ),
        ...this.state
          .repairs()
          .filter((r) => r.equipmentId === eq.id && r.status !== "cancelled")
          .flatMap((r) => {
            const segment = this.rangeSegment(r.startDate, r.endDate, rangeStart, rangeEnd);
            return segment
              ? [
                  {
                    id: r.id,
                    type: "repair" as const,
                    status: r.status,
                    title: r.tasks || "Ремонт",
                    startDate: segment.startDate,
                    endDate: segment.endDate,
                    conflict: false,
                  },
                ]
              : [];
          }),
        ...this.state
          .transports()
          .filter(
            (transport) =>
              transport.equipmentId === eq.id && transport.status !== "cancelled",
          )
          .flatMap((transport) => {
            const segment = this.rangeSegment(
              transport.startDate,
              transport.endDate,
              rangeStart,
              rangeEnd,
            );
            return segment
              ? [
                  {
                    id: transport.id,
                    type: "transport" as const,
                    status: transport.status,
                    title: this.transportTitle(transport),
                    startDate: segment.startDate,
                    endDate: segment.endDate,
                    conflict: this.transportHasConflict(transport.id),
                  },
                ]
              : [];
          }),
      ];
      const events = rangedEvents.flatMap((ev) => {
        const startIndex = days.findIndex((day) => day.ds === ev.startDate);
        const endIndex = days.findIndex((day) => day.ds === ev.endDate);
        if (startIndex < 0 || endIndex < 0) return [];
        return [
          {
            ...ev,
            startIndex,
            span: endIndex - startIndex + 1,
          },
        ];
      });
      return { eq, events, dim: days.length };
    });
  });

  readonly timelineDays = computed(() => {
    const dates = this.utils.datesInclusive(
      this.utils.dateKey(this.rangeStart()),
      this.utils.dateKey(this.rangeEnd()),
    );
    return dates.map((ds) => {
      const date = new Date(ds + "T00:00:00");
      return {
        ds,
        day: date.getDate(),
        month: date.toLocaleDateString("ru-RU", { month: "short" }),
        inMonth: true,
        weekend: [0, 6].includes(date.getDay()),
        weekday: date.toLocaleDateString("ru-RU", { weekday: "short" }),
      };
    });
  });

  timelineGridColumns(): string {
    return `240px repeat(${this.timelineDays().length}, minmax(34px, 34px))`;
  }

  barLeft(index: number): number {
    return 240 + index * 34 + 2;
  }

  openOrder(orderId: string): void {
    const order = this.state.byId(this.state.orders(), orderId);
    if (!order) return;
    this.edit(order);
  }

  openTransport(transportId: string): void {
    const transport = this.state.byId(this.state.transports(), transportId);
    if (!transport) return;
    this.selectedTransport.set(transport);
  }

  closeTransport(): void {
    this.selectedTransport.set(null);
  }

  editingOrder(): Order | null {
    return this.state.byId(this.state.orders(), this.editingId) || null;
  }

  edit(order: Order): void {
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
    };
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.clearForm();
    this.formOpen.set(false);
  }

  onEquipmentChange(): void {
    const eq = this.state.byId(this.state.equipment(), this.form.equipmentId);
    if (eq && !this.form.rate) this.form.rate = eq.defaultRate || 0;
  }

  trawlEquipment() {
    return this.state.equipment().filter((eq) =>
      (eq.type || "").trim().toLowerCase().includes("трал"),
    );
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
    const rentalPlan = this.orderDates().length * Number(this.form.rate || 0);
    return rentalPlan + this.logisticsTotal();
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
    if (!this.editingId || !this.form.startDate || !this.form.endDate) return;
    if (!this.validateLogistics()) return;
    const transportEquipmentConflict = this.formTransportEquipmentConflict();
    if (transportEquipmentConflict) {
      alert(
        `Техника занята в перевозке: ${this.equipmentName(transportEquipmentConflict.equipmentId)}, ${this.utils.fmtDate(transportEquipmentConflict.startDate)} - ${this.utils.fmtDate(transportEquipmentConflict.endDate)}.`,
      );
      return;
    }
    const operatorConflict = this.formOperatorConflict();
    if (operatorConflict) {
      alert(
        `Оператор занят в другой заявке: ${this.clientName(operatorConflict.clientId)}, ${this.utils.fmtDate(operatorConflict.startDate)} - ${this.utils.fmtDate(operatorConflict.endDate)}.`,
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
      await this.db.update("orders", this.editingId, this.prepareForm());
    } catch (error) {
      alert(this.saveErrorMessage(error));
      return;
    }
    this.closeForm();
  }

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

  clientName(id: string): string {
    return this.state.byId(this.state.clients(), id)?.name || "—";
  }

  operatorName(id: string): string {
    return this.state.byId(this.state.operators(), id)?.name || "—";
  }

  equipmentName(id: string): string {
    return this.state.byId(this.state.equipment(), id)?.name || "—";
  }

  transportTotal(transport: Transport): number {
    return this.state.transportTotal(transport);
  }

  private clearForm(): void {
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
    };
  }

  private prepareForm(): Omit<Order, "id" | "createdAt"> {
    const inPeriod = new Set(this.orderDates());
    this.syncLogisticsTotals();
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
      equipmentIdleDates: this.form.equipmentIdleDates
        .filter((date) => inPeriod.has(date))
        .sort(),
      operatorIdleDates: this.form.operatorIdleDates
        .filter((date) => inPeriod.has(date))
        .sort(),
    };
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
    return message ? `Не удалось сохранить заявку: ${message}` : "Не удалось сохранить заявку.";
  }

  private formDraftOrder(): Order {
    return {
      id: this.editingId || "draft",
      createdAt: "",
      ...this.prepareForm(),
    };
  }

  private rangeStart(): Date {
    const d = this.viewDate();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  private rangeEnd(): Date {
    const d = this.viewDate();
    return new Date(d.getFullYear(), d.getMonth() + 3, 0);
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

  private transportTitle(transport: {
    shipperClientId: string;
    consigneeClientId: string;
    shipper: string;
    consignee: string;
    cargoName: string;
  }): string {
    const shipper =
      this.state.byId(this.state.clients(), transport.shipperClientId)?.name ||
      transport.shipper ||
      "Отправитель";
    const consignee =
      this.state.byId(this.state.clients(), transport.consigneeClientId)?.name ||
      transport.consignee ||
      "Получатель";
    return `${shipper} → ${consignee}${transport.cargoName ? ` • ${transport.cargoName}` : ""}`;
  }

  private transportHasConflict(transportId: string): boolean {
    return (
      this.state.orderTransportConflicts().some(([, id]) => id === transportId) ||
      this.state.transportConflicts().some(([a, b]) => a === transportId || b === transportId) ||
      this.state.orderTransportOperatorConflicts().some(([, id]) => id === transportId) ||
      this.state.transportOperatorConflicts().some(
        ([a, b]) => a === transportId || b === transportId,
      )
    );
  }

  private orderSegments(
    order: Order,
    rangeStart: Date,
    rangeEnd: Date,
  ): { startDate: string; endDate: string }[] {
    const from = new Date(Math.max(
      new Date(order.startDate + "T00:00:00").getTime(),
      rangeStart.getTime(),
    ));
    const to = new Date(Math.min(
      new Date(order.endDate + "T00:00:00").getTime(),
      rangeEnd.getTime(),
    ));
    if (from > to) return [];
    const dates = this.utils
      .datesInclusive(this.utils.dateKey(from), this.utils.dateKey(to))
      .filter((date) => this.state.orderWorksOnDate(order, "equipment", date));
    const segments: { startDate: string; endDate: string }[] = [];
    for (const date of dates) {
      const last = segments[segments.length - 1];
      const previous = last
        ? this.utils.dateOffset(new Date(last.endDate + "T00:00:00"), 1)
        : "";
      if (last && previous === date) last.endDate = date;
      else segments.push({ startDate: date, endDate: date });
    }
    return segments;
  }

  private rangeSegment(
    startDate: string,
    endDate: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): { startDate: string; endDate: string } | null {
    const from = new Date(Math.max(
      new Date(startDate + "T00:00:00").getTime(),
      rangeStart.getTime(),
    ));
    const to = new Date(Math.min(
      new Date(endDate + "T00:00:00").getTime(),
      rangeEnd.getTime(),
    ));
    if (from > to) return null;
    return {
      startDate: this.utils.dateKey(from),
      endDate: this.utils.dateKey(to),
    };
  }

  private orderLogisticsSegments(
    order: Order,
    rangeStart: Date,
    rangeEnd: Date,
  ): { startDate: string; endDate: string }[] {
    const from = new Date(Math.max(
      new Date(this.state.orderLogisticsStart(order) + "T00:00:00").getTime(),
      rangeStart.getTime(),
    ));
    const to = new Date(Math.min(
      new Date(this.state.orderLogisticsEnd(order) + "T00:00:00").getTime(),
      rangeEnd.getTime(),
    ));
    if (from > to) return [];
    return [
      {
        startDate: this.utils.dateKey(from),
        endDate: this.utils.dateKey(to),
      },
    ];
  }
}
