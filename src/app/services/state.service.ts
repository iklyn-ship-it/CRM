import { Injectable, computed, inject } from "@angular/core";
import { DbService } from "./db.service";
import { UtilsService } from "./utils.service";
import {
  EquipmentAnalytics,
  Equipment,
  Order,
  FinanceOperation,
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
  readonly operations = this.db.operations;
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
    const orders = this.orders().filter((o) => o.status !== "cancelled");
    for (let i = 0; i < orders.length; i++) {
      for (let j = i + 1; j < orders.length; j++) {
        const a = orders[i],
          b = orders[j];
        if (
          a.equipmentId &&
          a.equipmentId === b.equipmentId &&
          this.utils.overlap(a.startDate, a.endDate, b.startDate, b.endDate)
        ) {
          list.push([a.id, b.id, a.equipmentId]);
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
              o.status !== "cancelled" &&
              o.equipmentId === r.equipmentId &&
              this.utils.overlap(
                o.startDate,
                o.endDate,
                r.startDate,
                r.endDate,
              ),
          )
          .forEach((o) => list.push([r.id, o.id, r.equipmentId]));
      });
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
    return (
      this.utils.daysInclusive(order.startDate, order.endDate) *
      Number(order.rate || 0)
    );
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

    return (
      this.utils.daysInclusive(startDate, endDate) * Number(operator.rate || 0)
    );
  }

  orderRemaining(order: Order): number {
    return Math.max(0, this.orderPlan(order) - this.orderIncome(order.id));
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
    const used = this.orders().some(
      (o) =>
        o.equipmentId === eq.id &&
        o.status !== "cancelled" &&
        o.startDate <= now &&
        o.endDate >= now,
    );
    return used ? "busy" : "free";
  }

  utilForEq(eqId: string, date: Date): number {
    const year = date.getFullYear(),
      month = date.getMonth();
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    const dim = monthEnd.getDate();
    const busyDays = new Set<string>();
    const periods = [
      ...this.orders()
        .filter((o) => o.equipmentId === eqId && o.status !== "cancelled")
        .map((o) => ({ s: o.startDate, e: o.endDate })),
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
          busyDays.add(day.toISOString().slice(0, 10));
        }
      }
    });
    return Math.round((busyDays.size / dim) * 100);
  }
}
