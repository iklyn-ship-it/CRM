import { Injectable, computed, inject } from "@angular/core";
import { DbService } from "./db.service";
import { UtilsService } from "./utils.service";
import {
  EquipmentAnalytics,
  Equipment,
  Order,
  FinanceOperation,
  Transport,
} from "../models/crm.models";

/**
 * Read-only computed state derived from DbService signals.
 * Components use this for display; mutations go through DbService directly.
 */
@Injectable({ providedIn: "root" })
export class StateService {
  private db = inject(DbService);
  private utils = inject(UtilsService);

  // Proxy signals from DbService for convenience
  readonly clients = this.db.clients;
  readonly equipment = this.db.equipment;
  readonly operators = this.db.operators;
  readonly orders = this.db.orders;
  readonly repairs = this.db.repairs;
  readonly transports = this.db.transports;
  readonly operations = this.db.operations;
  readonly auditLogs = this.db.auditLogs;
  readonly integrations = this.db.integrations;
  readonly userSettings = this.db.userSettings;
  readonly loading = this.db.loading;

  readonly calendarDate = computed(() => {
    const d = this.db.userSettings().calendarDate;
    return d ? new Date(d) : new Date();
  });

  readonly chartMode = computed(() => this.db.userSettings().chartMode);
  readonly calendarMode = computed(() => this.db.userSettings().calendarMode);

  readonly activeOrders = computed(() =>
    this.orders().filter((o) =>
      ["new", "confirmed", "active"].includes(o.status),
    ),
  );

  readonly activeRepairs = computed(() =>
    this.repairs().filter((r) => ["planned", "active"].includes(r.status)),
  );

  readonly totalIncome = computed(() =>
    this.operations()
      .filter((o) => o.type === "income")
      .reduce((s, o) => s + Number(o.amount || 0), 0),
  );

  readonly totalExpense = computed(() =>
    this.manualExpense() + this.operatorPayroll(),
  );

  readonly totalProfit = computed(
    () => this.totalIncome() - this.totalExpense(),
  );

  readonly manualExpense = computed(() =>
    this.operations()
      .filter((o) => o.type === "expense")
      .reduce((s, o) => s + Number(o.amount || 0), 0),
  );

  readonly operatorPayroll = computed(() =>
    this.orders().reduce((sum, order) => sum + this.orderOperatorCost(order), 0),
  );

  readonly avgUtilization = computed(() => {
    const eq = this.equipment();
    if (!eq.length) return 0;
    return Math.round(
      eq.reduce((s, e) => s + this.utilForEq(e.id, new Date()), 0) / eq.length,
    );
  });

  readonly orderConflicts = computed((): [string, string, string][] => {
    const list: [string, string, string][] = [];
    const orders = this.orders().filter((o) => this.orderBlocksSchedule(o));
    for (let i = 0; i < orders.length; i++) {
      for (let j = i + 1; j < orders.length; j++) {
        const a = orders[i],
          b = orders[j];
        for (const equipmentId of this.orderEquipmentReservationIds(a)) {
          if (
            this.orderEquipmentReservationIds(b).includes(equipmentId) &&
            this.ordersOverlapByEquipment(a, b, equipmentId)
          ) {
            list.push([a.id, b.id, equipmentId]);
          }
        }
      }
    }
    return list;
  });

  readonly operatorConflicts = computed((): [string, string, string][] => {
    const list: [string, string, string][] = [];
    const orders = this.orders().filter(
      (o) => this.orderBlocksSchedule(o) && o.operatorId,
    );
    for (let i = 0; i < orders.length; i++) {
      for (let j = i + 1; j < orders.length; j++) {
        const a = orders[i],
          b = orders[j];
        if (
          a.operatorId &&
          a.operatorId === b.operatorId &&
          this.ordersOverlapByWorkDays(a, b, "operator")
        ) {
          list.push([a.id, b.id, a.operatorId]);
        }
      }
    }
    return list;
  });

  readonly repairConflicts = computed((): [string, string, string][] => {
    const list: [string, string, string][] = [];
    this.repairs()
      .filter((r) => r.status !== "cancelled" && r.status !== "completed")
      .forEach((r) => {
        this.orders()
          .filter(
            (o) =>
              this.orderBlocksSchedule(o) &&
              this.orderEquipmentReservationIds(o).includes(r.equipmentId) &&
              this.utils.overlap(
                o.startDate,
                o.endDate,
                r.startDate,
                r.endDate,
              ) &&
              this.utils
                .datesInclusive(
                  o.startDate > r.startDate ? o.startDate : r.startDate,
                  o.endDate < r.endDate ? o.endDate : r.endDate,
                )
                .some((date) => this.orderUsesEquipmentOnDate(o, r.equipmentId, date)),
          )
          .forEach((o) => list.push([r.id, o.id, r.equipmentId]));
      });
    return list;
  });

  readonly orderTransportConflicts = computed((): [string, string, string][] => {
    const list: [string, string, string][] = [];
    const transports = this.transports().filter((t) => this.transportBlocksSchedule(t));
    this.orders()
      .filter((order) => this.orderBlocksSchedule(order))
      .forEach((order) => {
        transports.forEach((transport) => {
          for (const equipmentId of this.orderEquipmentReservationIds(order)) {
            if (
              transport.equipmentId === equipmentId &&
              this.orderTransportOverlapByEquipment(order, transport, equipmentId)
            ) {
              list.push([order.id, transport.id, equipmentId]);
            }
          }
        });
      });
    return list;
  });

  readonly transportConflicts = computed((): [string, string, string][] => {
    const list: [string, string, string][] = [];
    const transports = this.transports().filter(
      (t) => this.transportBlocksSchedule(t) && t.equipmentId,
    );
    for (let i = 0; i < transports.length; i++) {
      for (let j = i + 1; j < transports.length; j++) {
        const a = transports[i],
          b = transports[j];
        if (
          a.equipmentId === b.equipmentId &&
          this.transportsOverlap(a, b)
        ) {
          list.push([a.id, b.id, a.equipmentId]);
        }
      }
    }
    return list;
  });

  readonly orderTransportOperatorConflicts = computed(
    (): [string, string, string][] => {
      const list: [string, string, string][] = [];
      const transports = this.transports().filter(
        (t) => this.transportBlocksSchedule(t) && t.driverId,
      );
      this.orders()
        .filter((order) => this.orderBlocksSchedule(order) && order.operatorId)
        .forEach((order) => {
          transports.forEach((transport) => {
            if (
              order.operatorId === transport.driverId &&
              this.orderTransportOverlapByOperator(order, transport)
            ) {
              list.push([order.id, transport.id, order.operatorId]);
            }
          });
        });
      return list;
    },
  );

  readonly transportOperatorConflicts = computed((): [string, string, string][] => {
    const list: [string, string, string][] = [];
    const transports = this.transports().filter(
      (t) => this.transportBlocksSchedule(t) && t.driverId,
    );
    for (let i = 0; i < transports.length; i++) {
      for (let j = i + 1; j < transports.length; j++) {
        const a = transports[i],
          b = transports[j];
        if (a.driverId === b.driverId && this.transportsOverlap(a, b)) {
          list.push([a.id, b.id, a.driverId]);
        }
      }
    }
    return list;
  });

  readonly equipmentAnalytics = computed((): EquipmentAnalytics[] => {
    return this.equipment()
      .map((eq) => {
        const related = this.orders().filter((o) => o.equipmentId === eq.id);
        const repairRelated = this.repairs().filter(
          (r) => r.equipmentId === eq.id,
        );
        const income = related.reduce((s, o) => s + this.orderIncome(o.id), 0);
        const orderExp = related.reduce(
          (s, o) => s + this.orderExpense(o.id),
          0,
        );
        const repairExp = repairRelated.reduce(
          (s, r) => s + this.repairExpense(r.id),
          0,
        );
        return {
          name: eq.name,
          income,
          expense: orderExp + repairExp,
          profit: income - orderExp - repairExp,
        };
      })
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 8);
  });

  // --- Helpers ---

  byId<T extends { id: string }>(arr: T[], id: string): T | undefined {
    return arr.find((x) => x.id === id);
  }

  orderPlan(order: Order): number {
    const rentalPlan =
      this.orderEquipmentWorkDays(order) * Number(order.rate || 0);
    return rentalPlan + this.orderLogisticsCost(order);
  }

  orderOps(orderId: string): FinanceOperation[] {
    return this.operations().filter((o) => o.orderId === orderId);
  }

  orderIncome(orderId: string): number {
    return this.orderOps(orderId)
      .filter((o) => o.type === "income")
      .reduce((s, o) => s + Number(o.amount || 0), 0);
  }

  orderExpense(orderId: string): number {
    const order = this.byId(this.orders(), orderId);
    return (
      this.orderManualExpense(orderId) +
      (order ? this.orderOperatorCost(order) : 0)
    );
  }

  orderManualExpense(orderId: string): number {
    return this.orderOps(orderId)
      .filter((o) => o.type === "expense")
      .reduce((s, o) => s + Number(o.amount || 0), 0);
  }

  orderProfit(orderId: string): number {
    return this.orderIncome(orderId) - this.orderExpense(orderId);
  }

  orderOperatorCost(order: Order, fromDate = "", toDate = ""): number {
    if (!order.operatorId || order.status === "cancelled") return 0;
    const operator = this.byId(this.operators(), order.operatorId);
    if (!operator?.rate) return 0;

    const startDate =
      fromDate && fromDate > order.startDate ? fromDate : order.startDate;
    const endDate = toDate && toDate < order.endDate ? toDate : order.endDate;
    if (startDate > endDate) return 0;

    return this.orderOperatorWorkDays(order, startDate, endDate) * Number(operator.rate || 0);
  }

  orderLogisticsCost(order: Order): number {
    if (!order.logisticsEnabled) return 0;
    return Number(
      order.logisticsCost ||
        Number(order.logisticsPickupCost || 0) +
          Number(order.logisticsDeliveryCost || 0),
    );
  }

  transportTotal(transport: Transport): number {
    return Number(transport.pickupCost || 0) + Number(transport.deliveryCost || 0);
  }

  orderUsesEquipmentOnDate(order: Order, equipmentId: string, date: string): boolean {
    if (order.equipmentId === equipmentId) {
      return this.orderWorksOnDate(order, "equipment", date);
    }
    return (
      Boolean(order.logisticsEnabled) &&
      order.logisticsProvider === "own_trawl" &&
      order.logisticsTrailerId === equipmentId &&
      this.orderBlocksSchedule(order) &&
      date >= this.orderLogisticsStart(order) &&
      date <= this.orderLogisticsEnd(order)
    );
  }

  orderLogisticsStart(order: Order): string {
    return order.logisticsStartDate || order.startDate;
  }

  orderLogisticsEnd(order: Order): string {
    return order.logisticsEndDate || order.endDate;
  }

  transportBlocksSchedule(transport: Transport): boolean {
    return transport.status !== "cancelled" && transport.status !== "completed";
  }

  orderRemaining(order: Order): number {
    return Math.max(0, this.orderPlan(order) - this.orderIncome(order.id));
  }

  isCompletedAndPaid(order: Order): boolean {
    return order.status === "completed" && this.orderRemaining(order) <= 0;
  }

  orderBlocksSchedule(order: Order): boolean {
    return order.status !== "cancelled" && order.status !== "completed";
  }

  orderEquipmentWorkDays(order: Order, fromDate = "", toDate = ""): number {
    return this.orderWorkDates(order, "equipment", fromDate, toDate).length;
  }

  orderOperatorWorkDays(order: Order, fromDate = "", toDate = ""): number {
    return this.orderWorkDates(order, "operator", fromDate, toDate).length;
  }

  orderWorksOnDate(order: Order, kind: "equipment" | "operator", date: string): boolean {
    if (!this.orderBlocksSchedule(order)) return false;
    if (date < order.startDate || date > order.endDate) return false;
    const idle = kind === "equipment" ? order.equipmentIdleDates : order.operatorIdleDates;
    return !new Set(idle || []).has(date);
  }

  ordersOverlapByWorkDays(
    a: Order,
    b: Order,
    kind: "equipment" | "operator",
  ): boolean {
    if (!this.orderBlocksSchedule(a) || !this.orderBlocksSchedule(b)) {
      return false;
    }
    const from = a.startDate > b.startDate ? a.startDate : b.startDate;
    const to = a.endDate < b.endDate ? a.endDate : b.endDate;
    if (from > to) return false;
    return this.utils
      .datesInclusive(from, to)
      .some((date) => this.orderWorksOnDate(a, kind, date) && this.orderWorksOnDate(b, kind, date));
  }

  ordersOverlapByEquipment(a: Order, b: Order, equipmentId: string): boolean {
    if (!this.orderBlocksSchedule(a) || !this.orderBlocksSchedule(b)) {
      return false;
    }
    const from = a.startDate > b.startDate ? a.startDate : b.startDate;
    const to = a.endDate < b.endDate ? a.endDate : b.endDate;
    if (from > to) return false;
    return this.utils
      .datesInclusive(from, to)
      .some(
        (date) =>
          this.orderUsesEquipmentOnDate(a, equipmentId, date) &&
          this.orderUsesEquipmentOnDate(b, equipmentId, date),
      );
  }

  orderTransportOverlapByEquipment(
    order: Order,
    transport: Transport,
    equipmentId: string,
  ): boolean {
    if (!this.orderBlocksSchedule(order) || !this.transportBlocksSchedule(transport)) {
      return false;
    }
    const from = this.maxDate(
      this.minDateForOrderEquipment(order, equipmentId),
      transport.startDate,
    );
    const to = this.minDate(
      this.maxDateForOrderEquipment(order, equipmentId),
      transport.endDate,
    );
    if (from > to) return false;
    return this.utils
      .datesInclusive(from, to)
      .some((date) => this.orderUsesEquipmentOnDate(order, equipmentId, date));
  }

  orderTransportOverlapByOperator(order: Order, transport: Transport): boolean {
    if (!this.orderBlocksSchedule(order) || !this.transportBlocksSchedule(transport)) {
      return false;
    }
    const from = this.maxDate(order.startDate, transport.startDate);
    const to = this.minDate(order.endDate, transport.endDate);
    if (from > to) return false;
    return this.utils
      .datesInclusive(from, to)
      .some((date) => this.orderWorksOnDate(order, "operator", date));
  }

  transportsOverlap(a: Transport, b: Transport): boolean {
    if (!this.transportBlocksSchedule(a) || !this.transportBlocksSchedule(b)) {
      return false;
    }
    return this.utils.overlap(a.startDate, a.endDate, b.startDate, b.endDate);
  }

  orderEquipmentReservationIds(order: Order): string[] {
    return [
      order.equipmentId,
      order.logisticsEnabled &&
      order.logisticsProvider === "own_trawl" &&
      order.logisticsTrailerId
        ? order.logisticsTrailerId
        : "",
    ].filter((id): id is string => Boolean(id));
  }

  private orderWorkDates(
    order: Order,
    kind: "equipment" | "operator",
    fromDate = "",
    toDate = "",
  ): string[] {
    const startDate =
      fromDate && fromDate > order.startDate ? fromDate : order.startDate;
    const endDate = toDate && toDate < order.endDate ? toDate : order.endDate;
    if (!startDate || !endDate || startDate > endDate) return [];
    const idle = new Set(
      (kind === "equipment"
        ? order.equipmentIdleDates
        : order.operatorIdleDates) || [],
    );
    return this.utils.datesInclusive(startDate, endDate).filter((date) => !idle.has(date));
  }

  repairExpense(repairId: string): number {
    return this.operations()
      .filter((o) => o.repairId === repairId && o.type === "expense")
      .reduce((s, o) => s + Number(o.amount || 0), 0);
  }

  runtimeEqStatus(eq: Equipment): "free" | "busy" | "repair" {
    const now = this.utils.todayStr();
    const activeRepair = this.repairs().some(
      (r) =>
        r.equipmentId === eq.id &&
        r.status !== "cancelled" &&
        r.status !== "completed" &&
        r.startDate <= now &&
        r.endDate >= now,
    );
    if (activeRepair || eq.status === "repair") return "repair";
    const used =
      this.orders().some((o) => this.orderUsesEquipmentOnDate(o, eq.id, now)) ||
      this.transports().some(
        (t) =>
          this.transportBlocksSchedule(t) &&
          t.equipmentId === eq.id &&
          t.startDate <= now &&
          t.endDate >= now,
      );
    return used ? "busy" : "free";
  }

  runtimeOperatorStatus(operatorId: string): "free" | "busy" {
    const now = this.utils.todayStr();
    const busy =
      this.orders().some(
        (o) =>
          o.operatorId === operatorId &&
          this.orderWorksOnDate(o, "operator", now),
      ) ||
      this.transports().some(
        (t) =>
          this.transportBlocksSchedule(t) &&
          t.driverId === operatorId &&
          t.startDate <= now &&
          t.endDate >= now,
      );
    return busy ? "busy" : "free";
  }

  utilForEq(eqId: string, date: Date): number {
    const year = date.getFullYear(),
      month = date.getMonth();
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    const dim = monthEnd.getDate();
    const busyDays = new Set<string>();
    const orderPeriods = this.orders()
      .filter(
        (o) =>
          o.equipmentId === eqId ||
          (o.logisticsEnabled &&
            o.logisticsProvider === "own_trawl" &&
            o.logisticsTrailerId === eqId),
      )
      .flatMap((o) =>
        this.utils
          .datesInclusive(o.startDate, o.endDate)
          .filter((date) => this.orderUsesEquipmentOnDate(o, eqId, date))
          .map((date) => ({ s: date, e: date })),
      );
    const periods = [
      ...orderPeriods,
      ...this.transports()
        .filter(
          (transport) =>
            transport.equipmentId === eqId &&
            this.transportBlocksSchedule(transport),
        )
        .map((transport) => ({ s: transport.startDate, e: transport.endDate })),
      ...this.repairs()
        .filter((r) => r.equipmentId === eqId && r.status !== "cancelled")
        .map((r) => ({ s: r.startDate, e: r.endDate })),
    ];
    periods.forEach((p) => {
      const s = new Date(p.s + "T00:00:00"),
        e = new Date(p.e + "T00:00:00");
      const from = new Date(Math.max(s.getTime(), monthStart.getTime()));
      const to = new Date(Math.min(e.getTime(), monthEnd.getTime()));
      if (from <= to) {
        for (
          let day = new Date(from);
          day <= to;
          day.setDate(day.getDate() + 1)
        ) {
          busyDays.add(this.utils.dateKey(day));
        }
      }
    });
    return Math.round((busyDays.size / dim) * 100);
  }

  private maxDate(a: string, b: string): string {
    if (!a) return b;
    if (!b) return a;
    return a > b ? a : b;
  }

  private minDate(a: string, b: string): string {
    if (!a) return b;
    if (!b) return a;
    return a < b ? a : b;
  }

  private minDateForOrderEquipment(order: Order, equipmentId: string): string {
    if (order.equipmentId === equipmentId) return order.startDate;
    return this.orderLogisticsStart(order);
  }

  private maxDateForOrderEquipment(order: Order, equipmentId: string): string {
    if (order.equipmentId === equipmentId) return order.endDate;
    return this.orderLogisticsEnd(order);
  }
}
