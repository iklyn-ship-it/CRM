import { Component, computed } from "@angular/core";
import { StateService } from "../../services/state.service";
import { UtilsService } from "../../services/utils.service";
import { SupabaseService } from "../../services/supabase.service";

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

@Component({
  selector: "app-dashboard",
  standalone: true,
  templateUrl: "./dashboard.component.html",
  styleUrl: "./dashboard.component.css",
})
export class DashboardComponent {
  Math = Math;

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

  readonly upcomingEvents = computed(() => {
    const today = this.utils.todayStr();
    const events = [
      ...this.state.orders().map((o) => ({
        kind: "Аренда",
        startDate: o.startDate,
        endDate: o.endDate,
        label: this.state.byId(this.state.clients(), o.clientId)?.name || "—",
        equipment:
          this.state.byId(this.state.equipment(), o.equipmentId)?.name || "—",
        statusText: this.statusLabel(o.status),
        statusClass: o.status,
        value: this.state.orderProfit(o.id),
      })),
      ...this.state.repairs().map((r) => ({
        kind: "Ремонт",
        startDate: r.startDate,
        endDate: r.endDate,
        label: r.tasks || "—",
        equipment:
          this.state.byId(this.state.equipment(), r.equipmentId)?.name || "—",
        statusText: this.repairStatusLabel(r.status),
        statusClass: r.status,
        value: -this.state.repairExpense(r.id),
      })),
    ]
      .filter((e) => e.endDate >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 8);
    return events;
  });

  readonly maxProfit = computed(() =>
    Math.max(
      1,
      ...this.state.equipmentAnalytics().map((x) => Math.abs(x.profit)),
    ),
  );

  readonly finSummary = computed(() => {
    const ops = this.state.operations();
    const linkedIncome = ops
      .filter((o) => o.type === "income" && o.orderId)
      .reduce((s, o) => s + Number(o.amount || 0), 0);
    const repairSpend = ops
      .filter((o) => o.type === "expense" && o.repairId)
      .reduce((s, o) => s + Number(o.amount || 0), 0);
    const linkedExpense = ops
      .filter((o) => o.type === "expense" && o.orderId)
      .reduce((s, o) => s + Number(o.amount || 0), 0);
    return [
      { label: "Доход по аренде", value: linkedIncome },
      { label: "Расходы по аренде", value: linkedExpense },
      { label: "Расходы на ремонты", value: repairSpend },
      { label: "Общий cashflow", value: this.state.totalProfit() },
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
    const total = Math.max(1, this.state.orders().length);
    return ["new", "confirmed", "active", "completed", "cancelled"].map(
      (status) => {
        const value = this.state.orders().filter((o) => o.status === status)
          .length;
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
    const income = this.state.totalIncome();
    const orderExpense = this.state
      .operations()
      .filter((o) => o.type === "expense" && o.orderId)
      .reduce((s, o) => s + Number(o.amount || 0), 0);
    const repairExpense = this.state
      .operations()
      .filter((o) => o.type === "expense" && o.repairId)
      .reduce((s, o) => s + Number(o.amount || 0), 0);
    const otherExpense = Math.max(
      0,
      this.state.totalExpense() - orderExpense - repairExpense,
    );
    const rows = [
      { label: "Приходы", value: income, color: "#22c55e" },
      { label: "Расходы по заявкам", value: orderExpense, color: "#f59e0b" },
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
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0",
      )}`;
      const income = this.state
        .operations()
        .filter((o) => o.type === "income" && o.date.startsWith(key))
        .reduce((s, o) => s + Number(o.amount || 0), 0);
      const expense = this.state
        .operations()
        .filter((o) => o.type === "expense" && o.date.startsWith(key))
        .reduce((s, o) => s + Number(o.amount || 0), 0);
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
}
