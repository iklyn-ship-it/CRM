import { Component, computed } from "@angular/core";
import { StateService } from "../../services/state.service";
import { UtilsService } from "../../services/utils.service";
import { SupabaseService } from "../../services/supabase.service";

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

  statusLabel(s: string): string {
    return (
      {
        new: "Новое",
        confirmed: "Подтверждена",
        active: "В работе",
        completed: "Завершена",
        cancelled: "Отменена",
      }[s] || "Новое"
    );
  }

  repairStatusLabel(s: string): string {
    return (
      {
        planned: "Запланирован",
        active: "В ремонте",
        completed: "Завершён",
        cancelled: "Отменён",
      }[s] || "Запланирован"
    );
  }
}
