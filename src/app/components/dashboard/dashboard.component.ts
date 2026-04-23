import { Component, computed, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { StateService } from "../../services/state.service";
import { UtilsService } from "../../services/utils.service";
import { SupabaseService } from "../../services/supabase.service";
import { EquipmentAnalytics } from "../../models/crm.models";

interface ChartPoint {
  label: string;
  value: number;
  percent: number;
  color: string;
}

interface MonthlyFinancePoint {
  label: string;
  income: number;
  expense: number;
  profit: number;
}

type DashboardChart = "orders" | "money" | "cashflow" | "equipment";

@Component({
  selector: "app-dashboard",
  standalone: true,
  imports: [FormsModule],
  templateUrl: "./dashboard.component.html",
  styleUrl: "./dashboard.component.css",
})
export class DashboardComponent {
  Math = Math;
  activeChart = signal<DashboardChart>("orders");
  periodFrom = signal("");
  periodTo = signal("");

  readonly chartTabs: { key: DashboardChart; label: string }[] = [
    { key: "orders", label: "Воронка заявок" },
    { key: "money", label: "Структура денег" },
    { key: "cashflow", label: "Cashflow" },
    { key: "equipment", label: "Прибыль техники" },
  ];

  constructor(
    public state: StateService,
    public utils: UtilsService,
    public supa: SupabaseService,
  ) {}

  readonly alerts = computed(() => {
    const msgs: { kind: string; text: string }[] = [];
    const conf = this.state.orderConflicts();
    const repConf = this.state.repairConflicts();
    if (conf.length)
      msgs.push({
        kind: "alert",
        text: `Есть ${conf.length} конфликт(ов) по пересечению заявок.`,
      });
    else msgs.push({ kind: "ok", text: "Конфликтов по аренде нет." });
    if (repConf.length)
      msgs.push({
        kind: "alert",
        text: `Есть ${repConf.length} конфликт(ов) между арендой и ремонтом.`,
      });
    else
      msgs.push({
        kind: "ok",
        text: "Конфликтов между ремонтом и арендой нет.",
      });
    return msgs;
  });

  readonly periodOperations = computed(() =>
    this.state.operations().filter((op) => this.dateInPeriod(op.date)),
  );

  readonly periodOrders = computed(() =>
    this.state
      .orders()
      .filter((order) => this.rangeInPeriod(order.startDate, order.endDate)),
  );

  readonly periodRepairs = computed(() =>
    this.state
      .repairs()
      .filter((repair) => this.rangeInPeriod(repair.startDate, repair.endDate)),
  );

  readonly metricSummary = computed(() => {
    const income = this.periodIncome();
    const expense = this.periodExpense();
    return {
      income,
      expense,
      profit: income - expense,
      activeOrders: this.periodOrders().filter((o) =>
        ["new", "confirmed", "active"].includes(o.status),
      ).length,
      activeRepairs: this.periodRepairs().filter((r) =>
        ["planned", "active"].includes(r.status),
      ).length,
      utilization: this.periodUtilization(),
    };
  });

  readonly upcomingEvents = computed(() => {
    const today = this.utils.todayStr();
    const hasPeriod = Boolean(this.periodFrom() || this.periodTo());
    const events = [
      ...this.periodOrders().map((o) => ({
        kind: "Аренда",
        startDate: o.startDate,
        endDate: o.endDate,
        label: this.state.byId(this.state.clients(), o.clientId)?.name || "—",
        equipment:
          this.state.byId(this.state.equipment(), o.equipmentId)?.name || "—",
        statusText: this.statusLabel(o.status),
        statusClass: o.status,
        value: this.orderProfitInPeriod(o.id),
      })),
      ...this.periodRepairs().map((r) => ({
        kind: "Ремонт",
        startDate: r.startDate,
        endDate: r.endDate,
        label: r.tasks || "—",
        equipment:
          this.state.byId(this.state.equipment(), r.equipmentId)?.name || "—",
        statusText: this.repairStatusLabel(r.status),
        statusClass: r.status,
        value: -this.repairExpenseInPeriod(r.id),
      })),
    ]
      .filter((e) => hasPeriod || e.endDate >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 8);
    return events;
  });

  readonly periodEquipmentAnalytics = computed((): EquipmentAnalytics[] => {
    const orders = this.periodOrders();
    const repairs = this.periodRepairs();
    const ops = this.periodOperations();

    return this.state
      .equipment()
      .map((eq) => {
        const orderIds = new Set(
          orders.filter((o) => o.equipmentId === eq.id).map((o) => o.id),
        );
        const repairIds = new Set(
          repairs.filter((r) => r.equipmentId === eq.id).map((r) => r.id),
        );
        const income = ops
          .filter((op) => op.type === "income" && orderIds.has(op.orderId))
          .reduce((sum, op) => sum + Number(op.amount || 0), 0);
        const operatorExpense = orders
          .filter((o) => o.equipmentId === eq.id)
          .reduce(
            (sum, order) =>
              sum +
              this.state.orderOperatorCost(
                order,
                this.periodStart(),
                this.periodEnd(),
              ),
            0,
          );
        const orderExpense = ops
          .filter((op) => op.type === "expense" && orderIds.has(op.orderId))
          .reduce((sum, op) => sum + Number(op.amount || 0), 0);
        const repairExpense = ops
          .filter((op) => op.type === "expense" && repairIds.has(op.repairId))
          .reduce((sum, op) => sum + Number(op.amount || 0), 0);
        return {
          name: eq.name,
          income,
          expense: orderExpense + operatorExpense + repairExpense,
          profit: income - orderExpense - operatorExpense - repairExpense,
        };
      })
      .filter((item) => item.income || item.expense || item.profit)
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 8);
  });

  readonly maxProfit = computed(() =>
    Math.max(
      1,
      ...this.periodEquipmentAnalytics().map((x) => Math.abs(x.profit)),
    ),
  );

  readonly finSummary = computed(() => {
    const ops = this.periodOperations();
    const linkedIncome = ops
      .filter((o) => o.type === "income" && o.orderId)
      .reduce((s, o) => s + Number(o.amount || 0), 0);
    const repairSpend = ops
      .filter((o) => o.type === "expense" && o.repairId)
      .reduce((s, o) => s + Number(o.amount || 0), 0);
    const linkedExpense = ops
      .filter((o) => o.type === "expense" && o.orderId)
      .reduce((s, o) => s + Number(o.amount || 0), 0);
    const operatorSpend = this.periodOperatorPayroll();
    return [
      { label: "Доход по аренде", value: linkedIncome },
      { label: "Расходы по аренде", value: linkedExpense },
      { label: "Зарплата операторов", value: operatorSpend },
      { label: "Расходы на ремонты", value: repairSpend },
      {
        label: "Cashflow за период",
        value: this.periodIncome() - this.periodExpense(),
      },
    ];
  });

  readonly orderStatusChart = computed((): ChartPoint[] => {
    const colors: Record<string, string> = {
      new: "#38bdf8",
      confirmed: "#22c55e",
      active: "#f59e0b",
      completed: "#94a3b8",
      cancelled: "#ef4444",
    };
    const orders = this.periodOrders();
    const total = Math.max(1, orders.length);
    return ["new", "confirmed", "active", "completed", "cancelled"].map(
      (status) => {
        const value = orders.filter((o) => o.status === status).length;
        return {
          label: this.statusLabel(status),
          value,
          percent: Math.round((value / total) * 100),
          color: colors[status] || "#94a3b8",
        };
      },
    );
  });

  readonly financeDonut = computed((): ChartPoint[] => {
    const ops = this.periodOperations();
    const income = this.periodIncome();
    const orderExpense = ops
      .filter((o) => o.type === "expense" && o.orderId)
      .reduce((s, o) => s + Number(o.amount || 0), 0);
    const repairExpense = ops
      .filter((o) => o.type === "expense" && o.repairId)
      .reduce((s, o) => s + Number(o.amount || 0), 0);
    const operatorExpense = this.periodOperatorPayroll();
    const otherExpense = Math.max(
      0,
      this.periodExpense() - orderExpense - operatorExpense - repairExpense,
    );
    const rows = [
      { label: "Приходы", value: income, color: "#22c55e" },
      { label: "Расходы по заявкам", value: orderExpense, color: "#f59e0b" },
      {
        label: "Зарплата операторов",
        value: operatorExpense,
        color: "#8b5cf6",
      },
      { label: "Ремонты", value: repairExpense, color: "#f97316" },
      { label: "Прочие расходы", value: otherExpense, color: "#ef4444" },
    ];
    const total = Math.max(
      1,
      rows.reduce((sum, row) => sum + row.value, 0),
    );
    return rows.map((row) => ({
      ...row,
      percent: Math.round((row.value / total) * 100),
    }));
  });

  readonly monthlyFinance = computed((): MonthlyFinancePoint[] => {
    const months: MonthlyFinancePoint[] = [];
    for (const d of this.monthRange()) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0",
      )}`;
      const income = this.periodOperations()
        .filter((o) => o.type === "income" && o.date.startsWith(key))
        .reduce((s, o) => s + Number(o.amount || 0), 0);
      const expense = this.periodOperations()
        .filter((o) => o.type === "expense" && o.date.startsWith(key))
        .reduce((s, o) => s + Number(o.amount || 0), 0) +
        this.operatorPayrollForMonth(key);
      months.push({
        label: `${String(d.getMonth() + 1).padStart(2, "0")}.${String(
          d.getFullYear(),
        ).slice(-2)}`,
        income,
        expense,
        profit: income - expense,
      });
    }
    return months;
  });

  readonly maxMonthlyValue = computed(() =>
    Math.max(
      1,
      ...this.monthlyFinance().flatMap((m) => [
        Math.abs(m.income),
        Math.abs(m.expense),
        Math.abs(m.profit),
      ]),
    ),
  );

  readonly periodLabel = computed(() => {
    const from = this.periodStart();
    const to = this.periodEnd();
    if (!from && !to) return "за всё время";
    if (from && to) {
      return `${this.utils.fmtDate(from)} — ${this.utils.fmtDate(to)}`;
    }
    if (from) return `с ${this.utils.fmtDate(from)}`;
    return `до ${this.utils.fmtDate(to || "")}`;
  });

  periodIncome(): number {
    return this.periodOperations()
      .filter((o) => o.type === "income")
      .reduce((s, o) => s + Number(o.amount || 0), 0);
  }

  periodExpense(): number {
    return this.periodOperations()
      .filter((o) => o.type === "expense")
      .reduce((s, o) => s + Number(o.amount || 0), 0) +
      this.periodOperatorPayroll();
  }

  setActiveChart(chart: DashboardChart): void {
    this.activeChart.set(chart);
  }

  resetPeriod(): void {
    this.periodFrom.set("");
    this.periodTo.set("");
  }

  donutStyle(points: ChartPoint[]): string {
    let cursor = 0;
    const slices = points
      .filter((p) => p.value > 0)
      .map((p) => {
        const start = cursor;
        cursor += p.percent;
        return `${p.color} ${start}% ${cursor}%`;
      });
    return `conic-gradient(${slices.length ? slices.join(", ") : "#334155 0 100%"})`;
  }

  statusLabel(s: string): string {
    const labels: Record<string, string> = {
      new: "Новое",
      confirmed: "Подтверждена",
      active: "В работе",
      completed: "Завершена",
      cancelled: "Отменена",
    };
    return labels[s] || "Новое";
  }

  repairStatusLabel(s: string): string {
    const labels: Record<string, string> = {
      planned: "Запланирован",
      active: "В ремонте",
      completed: "Завершён",
      cancelled: "Отменён",
    };
    return labels[s] || "Запланирован";
  }

  private dateInPeriod(date: string): boolean {
    const from = this.periodStart();
    const to = this.periodEnd();
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  }

  private rangeInPeriod(startDate: string, endDate: string): boolean {
    const from = this.periodStart();
    const to = this.periodEnd();
    if (from && endDate < from) return false;
    if (to && startDate > to) return false;
    return true;
  }

  private periodStart(): string {
    const from = this.periodFrom();
    const to = this.periodTo();
    if (from && to && from > to) return to;
    return from;
  }

  private periodEnd(): string {
    const from = this.periodFrom();
    const to = this.periodTo();
    if (from && to && from > to) return from;
    return to;
  }

  private monthRange(): Date[] {
    const from = this.periodStart();
    const to = this.periodEnd();
    const end = to ? new Date(`${to}T00:00:00`) : new Date();
    const start = from
      ? new Date(`${from}T00:00:00`)
      : new Date(end.getFullYear(), end.getMonth() - 5, 1);
    const first = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    const months: Date[] = [];

    for (
      let d = new Date(first);
      d <= last;
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    ) {
      months.push(d);
    }

    return months.length ? months : [last];
  }

  private periodUtilization(): number {
    const eq = this.state.equipment();
    if (!eq.length) return 0;
    const now = new Date();
    const from =
      this.periodStart() ||
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const to = this.periodEnd() || this.utils.todayStr();
    const totalDays = Math.max(1, this.utils.daysInclusive(from, to));

    const utilization = eq.reduce((sum, item) => {
      const busyDays = new Set<string>();
      const ranges = [
        ...this.periodOrders()
          .filter((o) => o.equipmentId === item.id && o.status !== "cancelled")
          .map((o) => ({ start: o.startDate, end: o.endDate })),
        ...this.periodRepairs()
          .filter((r) => r.equipmentId === item.id && r.status !== "cancelled")
          .map((r) => ({ start: r.startDate, end: r.endDate })),
      ];

      ranges.forEach((range) => {
        const start = range.start > from ? range.start : from;
        const end = range.end < to ? range.end : to;
        const cursor = new Date(`${start}T00:00:00`);
        const last = new Date(`${end}T00:00:00`);
        while (cursor <= last) {
          busyDays.add(cursor.toISOString().slice(0, 10));
          cursor.setDate(cursor.getDate() + 1);
        }
      });

      return sum + Math.round((busyDays.size / totalDays) * 100);
    }, 0);

    return Math.round(utilization / eq.length);
  }

  private orderProfitInPeriod(orderId: string): number {
    const order = this.state.byId(this.state.orders(), orderId);
    const operatorCost = order
      ? this.state.orderOperatorCost(order, this.periodStart(), this.periodEnd())
      : 0;
    return this.periodOperations()
      .filter((op) => op.orderId === orderId)
      .reduce(
        (sum, op) =>
          sum + (op.type === "income" ? 1 : -1) * Number(op.amount || 0),
        0,
      ) - operatorCost;
  }

  private repairExpenseInPeriod(repairId: string): number {
    return this.periodOperations()
      .filter((op) => op.repairId === repairId && op.type === "expense")
      .reduce((sum, op) => sum + Number(op.amount || 0), 0);
  }

  private periodOperatorPayroll(): number {
    return this.periodOrders().reduce(
      (sum, order) =>
        sum +
        this.state.orderOperatorCost(
          order,
          this.periodStart(),
          this.periodEnd(),
        ),
      0,
    );
  }

  private operatorPayrollForMonth(monthKey: string): number {
    const monthStart = `${monthKey}-01`;
    const [year, month] = monthKey.split("-").map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnd = `${monthKey}-${String(lastDay).padStart(2, "0")}`;
    return this.periodOrders()
      .filter(
        (order) => order.startDate <= monthEnd && order.endDate >= monthStart,
      )
      .reduce(
        (sum, order) =>
          sum +
          this.state.orderOperatorCost(
            order,
            this.maxDate(monthStart, this.periodStart()),
            this.minDate(monthEnd, this.periodEnd()),
          ),
        0,
      );
  }

  private maxDate(a: string, b: string): string {
    if (!b) return a;
    return a > b ? a : b;
  }

  private minDate(a: string, b: string): string {
    if (!b) return a;
    return a < b ? a : b;
  }
}
