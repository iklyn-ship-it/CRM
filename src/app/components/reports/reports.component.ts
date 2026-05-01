import { Component, computed, inject, signal } from "@angular/core";
import { NgClass, SlicePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { StateService } from "../../services/state.service";
import { UtilsService } from "../../services/utils.service";
import { Order } from "../../models/crm.models";

interface ReportSummary {
  orders: number;
  plan: number;
  income: number;
  expense: number;
  profit: number;
  remaining: number;
}

interface LocationClientReport {
  clientId: string;
  clientName: string;
  orders: Order[];
  summary: ReportSummary;
}

@Component({
  selector: "app-reports",
  standalone: true,
  imports: [FormsModule, NgClass, SlicePipe],
  templateUrl: "./reports.component.html",
  styleUrl: "./reports.component.css",
})
export class ReportsComponent {
  state = inject(StateService);
  utils = inject(UtilsService);

  selectedClientId = signal("");
  selectedLocation = signal("");
  periodFrom = signal("");
  periodTo = signal("");

  readonly locations = computed(() =>
    Array.from(
      new Set(
        this.state
          .orders()
          .map((order) => this.normalizeLocation(order.location))
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b)),
  );

  readonly clientOrders = computed(() => {
    const clientId = this.selectedClientId();
    if (!clientId) return [];
    return this.filteredOrders().filter((order) => order.clientId === clientId);
  });

  readonly locationOrders = computed(() => {
    const location = this.normalizeLocation(this.selectedLocation());
    if (!location) return [];
    return this.filteredOrders().filter(
      (order) => this.normalizeLocation(order.location) === location,
    );
  });

  readonly clientSummary = computed(() => this.summaryFor(this.clientOrders()));
  readonly locationSummary = computed(() => this.summaryFor(this.locationOrders()));

  readonly clientLocations = computed(() =>
    Array.from(
      new Set(
        this.clientOrders()
          .map((order) => this.normalizeLocation(order.location))
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b)),
  );

  readonly locationClientReports = computed((): LocationClientReport[] => {
    const groups = new Map<string, Order[]>();
    for (const order of this.locationOrders()) {
      const key = order.clientId || "no-client";
      groups.set(key, [...(groups.get(key) || []), order]);
    }
    return Array.from(groups.entries())
      .map(([clientId, orders]) => ({
        clientId,
        clientName: this.clientName(clientId),
        orders,
        summary: this.summaryFor(orders),
      }))
      .sort((a, b) => b.summary.plan - a.summary.plan);
  });

  readonly topClients = computed(() =>
    this.state
      .clients()
      .map((client) => {
        const orders = this.filteredOrders().filter(
          (order) => order.clientId === client.id,
        );
        return {
          id: client.id,
          name: client.name,
          summary: this.summaryFor(orders),
        };
      })
      .filter((item) => item.summary.orders)
      .sort((a, b) => b.summary.profit - a.summary.profit)
      .slice(0, 6),
  );

  readonly topLocations = computed(() =>
    this.locations()
      .map((location) => {
        const orders = this.filteredOrders().filter(
          (order) => this.normalizeLocation(order.location) === location,
        );
        return {
          location,
          summary: this.summaryFor(orders),
        };
      })
      .filter((item) => item.summary.orders)
      .sort((a, b) => b.summary.plan - a.summary.plan)
      .slice(0, 6),
  );

  selectClient(id: string): void {
    this.selectedClientId.set(id);
  }

  selectLocation(location: string): void {
    this.selectedLocation.set(location);
  }

  resetPeriod(): void {
    this.periodFrom.set("");
    this.periodTo.set("");
  }

  clientName(id: string): string {
    return this.state.byId(this.state.clients(), id)?.name || "Клиент не указан";
  }

  equipmentName(id: string): string {
    return this.state.byId(this.state.equipment(), id)?.name || "—";
  }

  operatorName(id: string): string {
    return this.state.byId(this.state.operators(), id)?.name || "—";
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      new: "Новое",
      confirmed: "Подтверждена",
      active: "В работе",
      completed: "Завершена",
      cancelled: "Отменена",
    };
    return labels[status] || status;
  }

  private filteredOrders(): Order[] {
    return this.state
      .orders()
      .filter((order) => this.rangeInPeriod(order.startDate, order.endDate));
  }

  private summaryFor(orders: Order[]): ReportSummary {
    return orders.reduce(
      (summary, order) => {
        const plan = this.state.orderPlan(order);
        const income = this.state.orderIncome(order.id);
        const expense = this.state.orderExpense(order.id);
        return {
          orders: summary.orders + 1,
          plan: summary.plan + plan,
          income: summary.income + income,
          expense: summary.expense + expense,
          profit: summary.profit + income - expense,
          remaining: summary.remaining + this.state.orderRemaining(order),
        };
      },
      { orders: 0, plan: 0, income: 0, expense: 0, profit: 0, remaining: 0 },
    );
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

  private normalizeLocation(value: string): string {
    return (value || "").trim().replace(/\s+/g, " ");
  }
}
