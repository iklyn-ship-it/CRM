import { Component, computed, inject, signal } from "@angular/core";
import { NgClass } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import { StateService } from "../../services/state.service";
import { UtilsService } from "../../services/utils.service";
import {
  Client,
  Equipment,
  Order,
  OrderStatus,
  Transport,
} from "../../models/crm.models";
import { EquipmentPickerComponent } from "../equipment-picker/equipment-picker.component";

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

type EquipmentDocumentMode = "all" | "worked" | "single";
type ClientDocumentMode = "all" | "worked" | "single";
type ReportDocumentType = "equipment" | "client";

interface EquipmentDocumentRow {
  equipment: Equipment;
  orders: Order[];
  transports: Transport[];
  days: number;
  hours: number;
  plan: number;
  income: number;
  expense: number;
  profit: number;
  remaining: number;
}

interface ClientDocumentRow {
  client: Client;
  orders: Order[];
  transports: Transport[];
  locations: string[];
  plan: number;
  income: number;
  expense: number;
  profit: number;
  remaining: number;
}

@Component({
  selector: "app-reports",
  standalone: true,
  imports: [FormsModule, NgClass, EquipmentPickerComponent],
  templateUrl: "./reports.component.html",
  styleUrl: "./reports.component.css",
})
export class ReportsComponent {
  state = inject(StateService);
  utils = inject(UtilsService);
  sanitizer = inject(DomSanitizer);

  selectedClientId = signal("");
  selectedLocation = signal("");
  selectedEquipmentId = signal("");
  selectedOperatorId = signal("");
  periodFrom = signal("");
  periodTo = signal("");
  orderStatusFilter = signal<"" | OrderStatus>("");
  documentPreviewUrl = signal<SafeResourceUrl | null>(null);
  private documentPreviewObjectUrl = "";
  activeDocumentType: ReportDocumentType = "equipment";
  equipmentDocumentMode: EquipmentDocumentMode = "worked";
  equipmentDocumentId = "";
  equipmentDocumentShowFinance = true;
  clientDocumentMode: ClientDocumentMode = "worked";
  clientDocumentId = "";
  clientDocumentShowFinance = true;

  readonly orderStatusOptions: { value: "" | OrderStatus; label: string }[] = [
    { value: "", label: "Все статусы" },
    { value: "new", label: "Новые" },
    { value: "confirmed", label: "Подтвержденные" },
    { value: "active", label: "В работе" },
    { value: "completed", label: "Завершенные" },
    { value: "cancelled", label: "Отмененные" },
  ];

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
  readonly locationSummary = computed(() =>
    this.summaryFor(this.locationOrders()),
  );

  readonly equipmentOrders = computed(() => {
    const equipmentId = this.selectedEquipmentId();
    if (!equipmentId) return [];
    return this.filteredOrders().filter((order) =>
      this.state.orderEquipmentReservationIds(order).includes(equipmentId),
    );
  });

  readonly equipmentTransports = computed(() => {
    const equipmentId = this.selectedEquipmentId();
    if (!equipmentId) return [];
    return this.filteredTransports().filter(
      (transport) => transport.equipmentId === equipmentId,
    );
  });

  readonly operatorOrders = computed(() => {
    const operatorId = this.selectedOperatorId();
    if (!operatorId) return [];
    return this.filteredOrders().filter((order) =>
      this.state.orderOperatorIds(order).includes(operatorId),
    );
  });

  readonly equipmentSummary = computed(() => {
    const equipmentId = this.selectedEquipmentId();
    const orders = this.equipmentFinancialSummary(
      equipmentId,
      this.equipmentOrders(),
    );
    const transports = this.transportFinancialSummary(this.equipmentTransports());
    return {
      orders: orders.orders + transports.orders,
      plan: orders.plan + transports.plan,
      income: orders.income + transports.income,
      expense: orders.expense + transports.expense,
      profit: orders.profit + transports.profit,
      remaining: orders.remaining + transports.remaining,
    };
  });
  readonly operatorSummary = computed(() =>
    this.summaryFor(this.operatorOrders()),
  );
  readonly operatorSalarySummary = computed(() =>
    this.operatorOrders().reduce(
      (sum, order) => sum + this.operatorCost(order),
      0,
    ),
  );

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

  readonly topEquipment = computed(() =>
    this.state
      .equipment()
      .map((equipment) => {
        const orders = this.filteredOrders().filter((order) =>
          this.state.orderEquipmentReservationIds(order).includes(equipment.id),
        );
        const transports = this.filteredTransports().filter(
          (transport) => transport.equipmentId === equipment.id,
        );
        const orderSummary = this.equipmentFinancialSummary(
          equipment.id,
          orders,
        );
        const transportSummary = this.transportFinancialSummary(transports);
        return {
          id: equipment.id,
          name: equipment.name,
          summary: {
            orders: orderSummary.orders + transportSummary.orders,
            plan: orderSummary.plan + transportSummary.plan,
            income: orderSummary.income + transportSummary.income,
            expense: orderSummary.expense + transportSummary.expense,
            profit: orderSummary.profit + transportSummary.profit,
            remaining: orderSummary.remaining + transportSummary.remaining,
          },
        };
      })
      .filter((item) => item.summary.orders)
      .sort((a, b) => b.summary.plan - a.summary.plan)
      .slice(0, 6),
  );

  readonly topOperators = computed(() =>
    this.state
      .operators()
      .map((operator) => {
        const orders = this.filteredOrders().filter((order) =>
          this.state.orderOperatorIds(order).includes(operator.id),
        );
        return {
          id: operator.id,
          name: operator.name,
          summary: this.summaryFor(orders),
          salary: orders.reduce(
            (sum, order) => sum + this.operatorCost(order, operator.id),
            0,
          ),
        };
      })
      .filter((item) => item.summary.orders)
      .sort((a, b) => b.salary - a.salary)
      .slice(0, 6),
  );

  selectClient(id: string): void {
    this.selectedClientId.set(id);
  }

  selectLocation(location: string): void {
    this.selectedLocation.set(location);
  }

  selectEquipment(id: string): void {
    this.selectedEquipmentId.set(id);
  }

  selectOperator(id: string): void {
    this.selectedOperatorId.set(id);
  }

  resetPeriod(): void {
    this.periodFrom.set("");
    this.periodTo.set("");
    this.refreshDocumentIfOpen();
  }

  setOrderStatusFilter(status: "" | OrderStatus): void {
    this.orderStatusFilter.set(status);
    this.refreshDocumentIfOpen();
  }

  openEquipmentDocument(): void {
    this.activeDocumentType = "equipment";
    this.equipmentDocumentMode = this.selectedEquipmentId() ? "single" : "worked";
    this.equipmentDocumentId = this.selectedEquipmentId();
    this.equipmentDocumentShowFinance = true;
    this.refreshDocument();
  }

  openClientDocument(): void {
    this.activeDocumentType = "client";
    this.clientDocumentMode = this.selectedClientId() ? "single" : "worked";
    this.clientDocumentId = this.selectedClientId();
    this.clientDocumentShowFinance = true;
    this.refreshDocument();
  }

  refreshDocumentIfOpen(): void {
    if (this.documentPreviewUrl()) this.refreshDocument();
  }

  refreshEquipmentDocumentIfOpen(): void {
    this.refreshDocumentIfOpen();
  }

  refreshEquipmentDocument(): void {
    this.activeDocumentType = "equipment";
    this.refreshDocument();
  }

  refreshClientDocument(): void {
    this.activeDocumentType = "client";
    this.refreshDocument();
  }

  refreshDocument(): void {
    const html =
      this.activeDocumentType === "client"
        ? this.clientDocumentHtml(this.clientDocumentRows())
        : this.equipmentDocumentHtml(this.equipmentDocumentRows());
    this.releaseDocumentUrl();
    this.documentPreviewObjectUrl = URL.createObjectURL(
      new Blob([html], { type: "text/html;charset=utf-8" }),
    );
    this.documentPreviewUrl.set(
      this.sanitizer.bypassSecurityTrustResourceUrl(
        this.documentPreviewObjectUrl,
      ),
    );
  }

  closeDocumentPreview(): void {
    this.releaseDocumentUrl();
    this.documentPreviewUrl.set(null);
  }

  printDocumentPreview(frame: HTMLIFrameElement): void {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  }

  private releaseDocumentUrl(): void {
    if (this.documentPreviewObjectUrl) {
      URL.revokeObjectURL(this.documentPreviewObjectUrl);
      this.documentPreviewObjectUrl = "";
    }
  }

  clientName(id: string): string {
    return (
      this.state.byId(this.state.clients(), id)?.name || "Клиент не указан"
    );
  }

  equipmentName(id: string): string {
    return this.state.byId(this.state.equipment(), id)?.name || "—";
  }

  operatorName(id: string): string {
    return this.state.byId(this.state.operators(), id)?.name || "—";
  }

  transportPartyName(clientId: string, fallback: string): string {
    return (
      this.state.byId(this.state.clients(), clientId)?.name ||
      fallback ||
      "—"
    );
  }

  orderOperatorNames(order: Order): string {
    const names = this.state
      .orderOperatorIds(order)
      .map((id) => this.operatorName(id))
      .filter((name) => name !== "—");
    return names.length ? names.join(", ") : "—";
  }

  equipmentWorkDays(
    order: Order,
    equipmentId = this.selectedEquipmentId(),
  ): number {
    if (!equipmentId) return 0;
    if (order.equipmentId === equipmentId) {
      return this.state.orderEquipmentWorkDays(
        order,
        this.periodStart(),
        this.periodEnd(),
      );
    }
    const dates = this.utils.datesInclusive(
      order.logisticsStartDate || order.startDate,
      order.logisticsEndDate || order.startDate,
    );
    const returnDates = this.utils.datesInclusive(
      order.logisticsReturnStartDate || order.endDate,
      order.logisticsReturnEndDate || order.endDate,
    );
    const reserved = new Set<string>();
    if (
      order.logisticsProvider === "own_trawl" &&
      order.logisticsTrailerId === equipmentId
    ) {
      dates.forEach((date) => reserved.add(date));
    }
    if (
      order.logisticsReturnProvider === "own_trawl" &&
      order.logisticsReturnTrailerId === equipmentId
    ) {
      returnDates.forEach((date) => reserved.add(date));
    }
    return [...reserved].filter((date) => this.dateInPeriod(date)).length;
  }

  equipmentWorkHours(
    order: Order,
    equipmentId = this.selectedEquipmentId(),
  ): number {
    if (order.equipmentId === equipmentId) {
      return this.state.orderEquipmentWorkHours(
        order,
        this.periodStart(),
        this.periodEnd(),
      );
    }
    return this.equipmentWorkDays(order, equipmentId) * 8;
  }

  operatorWorkDays(
    order: Order,
    operatorId = this.selectedOperatorId(),
  ): number {
    if (!operatorId) return 0;
    return this.state.orderOperatorWorkDaysFor(
      order,
      operatorId,
      this.periodStart(),
      this.periodEnd(),
    );
  }

  equipmentOrderPlan(order: Order): number {
    return this.orderPlanForEquipment(order, this.selectedEquipmentId());
  }

  equipmentOrderProfit(order: Order): number {
    const plan = this.equipmentOrderPlan(order);
    const totalPlan = this.state.orderPlan(order);
    const share = totalPlan > 0 ? plan / totalPlan : 0;
    return (
      this.state.orderIncome(order.id) * share -
      this.state.orderExpense(order.id) * share
    );
  }

  operatorCost(order: Order, operatorId = this.selectedOperatorId()): number {
    if (!operatorId) return 0;
    return this.state.orderOperatorCostFor(
      order,
      operatorId,
      this.periodStart(),
      this.periodEnd(),
    );
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

  equipmentDocumentRows(): EquipmentDocumentRow[] {
    const selectedId = this.equipmentDocumentId || this.selectedEquipmentId();
    return this.state
      .equipment()
      .filter((equipment) =>
        this.equipmentDocumentMode === "single" ? equipment.id === selectedId : true,
      )
      .map((equipment) => {
        const orders = this.filteredOrders().filter((order) =>
          this.state.orderEquipmentReservationIds(order).includes(equipment.id),
        );
        const transports = this.filteredTransports().filter(
          (transport) => transport.equipmentId === equipment.id,
        );
        const days =
          orders.reduce(
            (sum, order) => sum + this.equipmentWorkDays(order, equipment.id),
            0,
          ) +
          transports.reduce(
            (sum, transport) => sum + this.transportDays(transport),
            0,
          );
        const hours =
          orders.reduce(
            (sum, order) => sum + this.equipmentWorkHours(order, equipment.id),
            0,
          ) +
          transports.reduce(
            (sum, transport) => sum + this.transportDays(transport) * 8,
            0,
          );
        const summary = this.equipmentFinancialSummary(equipment.id, orders);
        const transportSummary = this.transportFinancialSummary(transports);
        return {
          equipment,
          orders,
          transports,
          days,
          hours,
          plan: summary.plan + transportSummary.plan,
          income: summary.income + transportSummary.income,
          expense: summary.expense + transportSummary.expense,
          profit: summary.profit + transportSummary.profit,
          remaining: summary.remaining + transportSummary.remaining,
        };
      })
      .filter((row) =>
        this.equipmentDocumentMode === "worked"
          ? row.orders.length > 0 || row.transports.length > 0 || row.days > 0
          : true,
      )
      .sort((a, b) => b.plan - a.plan || b.days - a.days);
  }

  clientDocumentRows(): ClientDocumentRow[] {
    const selectedId = this.clientDocumentId || this.selectedClientId();
    return this.state
      .clients()
      .filter((client) =>
        this.clientDocumentMode === "single" ? client.id === selectedId : true,
      )
      .map((client) => {
        const orders = this.filteredOrders().filter(
          (order) => order.clientId === client.id,
        );
        const transports = this.filteredTransports().filter(
          (transport) =>
            transport.shipperClientId === client.id ||
            transport.consigneeClientId === client.id,
        );
        const orderSummary = this.summaryFor(orders);
        const transportSummary = this.transportFinancialSummary(transports);
        const locations = this.clientDocumentLocations(orders, transports);
        return {
          client,
          orders,
          transports,
          locations,
          plan: orderSummary.plan + transportSummary.plan,
          income: orderSummary.income + transportSummary.income,
          expense: orderSummary.expense + transportSummary.expense,
          profit: orderSummary.profit + transportSummary.profit,
          remaining: orderSummary.remaining + transportSummary.remaining,
        };
      })
      .filter((row) =>
        this.clientDocumentMode === "worked"
          ? row.orders.length > 0 || row.transports.length > 0
          : true,
      )
      .sort(
        (a, b) =>
          b.plan - a.plan ||
          b.orders.length +
            b.transports.length -
            (a.orders.length + a.transports.length),
      );
  }

  private clientDocumentLocations(
    orders: Order[],
    transports: Transport[],
  ): string[] {
    return Array.from(
      new Set(
        [
          ...orders.map((order) => this.normalizeLocation(order.location)),
          ...transports.flatMap((transport) => [
            this.normalizeLocation(transport.loadingPoint),
            this.normalizeLocation(transport.unloadingPoint),
          ]),
        ].filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }

  private equipmentFinancialSummary(
    equipmentId: string,
    orders: Order[],
  ): ReportSummary {
    return orders.reduce(
      (summary, order) => {
        const plan = this.orderPlanForEquipment(order, equipmentId);
        const totalPlan = this.state.orderPlan(order);
        const share = totalPlan > 0 ? plan / totalPlan : 0;
        const income = this.state.orderIncome(order.id) * share;
        const expense = this.state.orderExpense(order.id) * share;
        return {
          orders: summary.orders + 1,
          plan: summary.plan + plan,
          income: summary.income + income,
          expense: summary.expense + expense,
          profit: summary.profit + income - expense,
          remaining:
            summary.remaining + Math.max(0, plan - income),
        };
      },
      { orders: 0, plan: 0, income: 0, expense: 0, profit: 0, remaining: 0 },
    );
  }

  private orderPlanForEquipment(order: Order, equipmentId: string): number {
    let plan = 0;
    if (order.equipmentId === equipmentId) {
      plan += Math.max(
        0,
        this.state.orderPlan(order) - this.state.orderLogisticsCost(order),
      );
    }
    if (
      order.logisticsProvider === "own_trawl" &&
      order.logisticsTrailerId === equipmentId
    ) {
      plan +=
        Number(order.logisticsPickupCost || 0) +
        Number(order.logisticsDeliveryCost || 0);
    }
    if (
      order.logisticsReturnProvider === "own_trawl" &&
      order.logisticsReturnTrailerId === equipmentId
    ) {
      plan +=
        Number(order.logisticsReturnPickupCost || 0) +
        Number(order.logisticsReturnDeliveryCost || 0);
    }
    return plan;
  }

  private transportFinancialSummary(transports: Transport[]): ReportSummary {
    return transports.reduce(
      (summary, transport) => {
        const plan = this.state.transportTotal(transport);
        const income = this.state.transportIncome(transport.id);
        const expense = this.state.transportExpense(transport);
        return {
          orders: summary.orders + 1,
          plan: summary.plan + plan,
          income: summary.income + income,
          expense: summary.expense + expense,
          profit: summary.profit + income - expense,
          remaining: summary.remaining + this.state.transportRemaining(transport),
        };
      },
      { orders: 0, plan: 0, income: 0, expense: 0, profit: 0, remaining: 0 },
    );
  }

  transportDays(transport: Transport): number {
    const dates = this.utils.datesInclusive(
      transport.startDate,
      transport.endDate,
    );
    return dates.filter((date) => this.dateInPeriod(date)).length;
  }

  private filteredOrders(): Order[] {
    return this.state
      .orders()
      .filter(
        (order) =>
          !order.deferred &&
          (!this.orderStatusFilter() ||
            order.status === this.orderStatusFilter()) &&
          this.rangeInPeriod(order.startDate, order.endDate),
      );
  }

  private filteredTransports(): Transport[] {
    const status = this.orderStatusFilter();
    const transportStatus =
      status === "new" ||
      status === "active" ||
      status === "completed" ||
      status === "cancelled"
        ? status
        : "";
    return this.state
      .transports()
      .filter(
        (transport) =>
          !transport.deferred &&
          (!transportStatus || transport.status === transportStatus) &&
          this.rangeInPeriod(transport.startDate, transport.endDate),
      );
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

  private dateInPeriod(date: string): boolean {
    const from = this.periodStart();
    const to = this.periodEnd();
    if (from && date < from) return false;
    if (to && date > to) return false;
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

  private clientDocumentHtml(rows: ClientDocumentRow[]): string {
    const totals = rows.reduce(
      (sum, row) => ({
        clients: sum.clients + 1,
        records: sum.records + row.orders.length + row.transports.length,
        plan: sum.plan + row.plan,
        income: sum.income + row.income,
        expense: sum.expense + row.expense,
        profit: sum.profit + row.profit,
        remaining: sum.remaining + row.remaining,
      }),
      {
        clients: 0,
        records: 0,
        plan: 0,
        income: 0,
        expense: 0,
        profit: 0,
        remaining: 0,
      },
    );
    const period = this.periodLabel();
    const modeLabel =
      this.clientDocumentMode === "all"
        ? "Усі клієнти"
        : this.clientDocumentMode === "worked"
          ? "Клієнти із заявками/перевезеннями"
          : `Один клієнт: ${this.clientName(this.clientDocumentId)}`;
    const statusLabel =
      this.orderStatusOptions.find(
        (status) => status.value === this.orderStatusFilter(),
      )?.label || "Все статусы";
    const rowHtml = rows
      .map((row, index) => {
        const detailCards = [
          ...row.orders.map(
            (order) =>
              `<div class="record-card">
                <div><span>ID</span><strong>Заявка ${this.html(this.utils.shortId(order.id))}</strong></div>
                <div><span>Об'єкт</span><strong>${this.html(order.location || "—")}</strong></div>
                <div><span>Техніка</span><strong>${this.html(this.equipmentName(order.equipmentId))}</strong></div>
                <div><span>Оператор</span><strong>${this.html(this.orderOperatorNames(order))}</strong></div>
                <div><span>Період</span><strong>${this.html(this.utils.fmtDate(order.startDate))} - ${this.html(this.utils.fmtDate(order.endDate))}</strong></div>
                <div><span>Статус</span><strong>${this.html(this.statusLabel(order.status))}</strong></div>
                ${
                  this.clientDocumentShowFinance
                    ? `<div><span>План</span><strong>${this.html(this.utils.money(this.state.orderPlan(order)))}</strong></div>
                <div><span>Прибуток</span><strong>${this.html(this.utils.money(this.state.orderProfit(order.id)))}</strong></div>`
                    : ""
                }
                <div class="record-comment"><span>Коментар</span><strong>${this.html(order.notes || "без коментаря")}</strong></div>
              </div>`,
          ),
          ...row.transports.map(
            (transport) =>
              `<div class="record-card transport-card">
                <div><span>ID</span><strong>Перевезення ${this.html(this.utils.shortId(transport.id))}</strong></div>
                <div><span>Сторони</span><strong>${this.html(this.transportPartyName(transport.shipperClientId, transport.shipper))} → ${this.html(this.transportPartyName(transport.consigneeClientId, transport.consignee))}</strong></div>
                <div><span>Маршрут</span><strong>${this.html(transport.loadingPoint || "—")} → ${this.html(transport.unloadingPoint || "—")}</strong></div>
                <div><span>Трал</span><strong>${this.html(this.equipmentName(transport.equipmentId))}</strong></div>
                <div><span>Водій</span><strong>${this.html(this.operatorName(transport.driverId))}</strong></div>
                <div><span>Період</span><strong>${this.html(this.utils.fmtDate(transport.startDate))} - ${this.html(this.utils.fmtDate(transport.endDate))}</strong></div>
                <div><span>Статус</span><strong>${this.html(this.statusLabel(transport.status))}</strong></div>
                ${
                  this.clientDocumentShowFinance
                    ? `<div><span>План</span><strong>${this.html(this.utils.money(this.state.transportTotal(transport)))}</strong></div>
                <div><span>Прибуток</span><strong>${this.html(this.utils.money(this.state.transportProfit(transport)))}</strong></div>`
                    : ""
                }
                <div class="record-comment"><span>Вантаж / коментар</span><strong>${this.html(transport.cargoName || transport.notes || "без коментаря")}</strong></div>
              </div>`,
          ),
        ];
        const detailsHtml = detailCards.length
          ? `<tr class="client-details-row"><td colspan="${this.clientDocumentShowFinance ? 9 : 4}"><div class="client-details">${detailCards.join("")}</div></td></tr>`
          : `<tr class="client-details-row"><td colspan="${this.clientDocumentShowFinance ? 9 : 4}"><div class="client-details"><div class="empty">Записів за період немає.</div></div></td></tr>`;
        return `<tr>
          <td>${index + 1}</td>
          <td>
            <strong>${this.html(row.client.name)}</strong>
            <div class="muted">${this.html(row.client.phone || "Телефон не вказано")}</div>
            <div class="muted">${this.html([row.client.type, row.client.source].filter(Boolean).join(" • ") || "Тип/джерело не вказано")}</div>
          </td>
          <td class="num">${row.orders.length + row.transports.length}</td>
          <td>${this.html(row.locations.join(", ") || "—")}</td>
          ${
            this.clientDocumentShowFinance
              ? `<td class="money">${this.html(this.utils.money(row.plan))}</td>
          <td class="money">${this.html(this.utils.money(row.income))}</td>
          <td class="money">${this.html(this.utils.money(row.expense))}</td>
          <td class="money">${this.html(this.utils.money(row.profit))}</td>
          <td class="money">${this.html(this.utils.money(row.remaining))}</td>`
              : ""
          }
        </tr>${detailsHtml}`;
      })
      .join("");

    return `<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8" />
  <title>Звіт по клієнтах</title>
  <style>
    :root { --ink: #172033; --muted: #697386; --line: #d8dee9; --brand: #15386f; --soft: #eef4ff; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #e8edf5; color: var(--ink); font-family: Arial, sans-serif; }
    .toolbar { position: sticky; top: 0; z-index: 2; display: flex; justify-content: flex-end; gap: 10px; padding: 10px 14px; background: #111827; }
    .toolbar button { border: 0; border-radius: 10px; padding: 10px 14px; font-weight: 800; cursor: pointer; color: #fff; background: #16a34a; }
    .page { width: 297mm; min-height: 210mm; margin: 18px auto; padding: 16mm; background: #fff; box-shadow: 0 18px 50px rgba(15, 23, 42, .18); }
    header { display: grid; grid-template-columns: 1fr 1.3fr; gap: 24px; align-items: end; padding-bottom: 14px; border-bottom: 3px solid #c7ceda; }
    .logo { font-size: 48px; font-weight: 900; letter-spacing: -5px; color: #c2c9d4; line-height: .85; }
    .logo span { color: #b7cdf8; }
    .company, .address, .muted { color: var(--muted); }
    .company, .address { font-weight: 700; font-size: 13px; line-height: 1.45; }
    .address { text-align: right; }
    h1 { margin: 24px 0 4px; color: var(--brand); text-align: center; font-size: 30px; }
    .subtitle { margin: 0 0 18px; text-align: center; color: var(--muted); }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; }
    .summary-card { padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--soft); }
    .summary-card .label { color: var(--muted); font-size: 12px; font-weight: 700; }
    .summary-card .value { margin-top: 6px; font-size: 20px; font-weight: 900; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th { background: var(--brand); color: #fff; text-align: left; font-size: 11px; letter-spacing: .03em; text-transform: uppercase; white-space: nowrap; }
    th, td { border: 1px solid var(--line); padding: 7px; vertical-align: top; font-size: 11px; overflow-wrap: anywhere; }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    .num, .money { text-align: right; white-space: nowrap; }
    .client-details-row td { padding: 0 7px 12px; background: #fff !important; border-top: 0; }
    .client-details { display: grid; gap: 7px; padding: 8px; border: 1px solid #dbe3f0; border-top: 0; background: #f8fafc; }
    .record-card { display: grid; grid-template-columns: 92px 1.15fr 1.25fr 1fr 96px 84px 86px 86px minmax(140px, 1.3fr); gap: 6px; align-items: stretch; padding: 7px; border: 1px solid #d8dee9; border-left: 4px solid var(--brand); border-radius: 10px; background: #fff; }
    .transport-card { border-left-color: #0f766e; }
    .record-card div { min-width: 0; padding: 5px 6px; border-radius: 7px; background: #f1f5f9; }
    .record-card span { display: block; color: var(--muted); font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; white-space: nowrap; }
    .record-card strong { display: block; margin-top: 2px; font-size: 10px; line-height: 1.25; overflow-wrap: anywhere; }
    .record-comment { grid-column: auto; }
    .empty { padding: 24px; text-align: center; color: var(--muted); border: 1px dashed var(--line); border-radius: 12px; }
    footer { margin-top: 22px; padding-top: 12px; border-top: 2px solid #c7ceda; color: var(--muted); font-size: 12px; display: flex; justify-content: space-between; }
    @media print {
      body { background: #fff; }
      .toolbar { display: none; }
      .page { width: auto; min-height: auto; margin: 0; padding: 10mm; box-shadow: none; }
      tr { page-break-inside: avoid; }
    }
    @media (max-width: 900px) {
      .page { width: 100%; margin: 0; padding: 16px; }
      header, .summary { grid-template-columns: 1fr; }
      .address { text-align: left; }
      table { min-width: 1200px; }
    }
  </style>
</head>
<body>
  <div class="toolbar"><button type="button" onclick="window.print()">Печать / PDF</button></div>
  <main class="page">
    <header>
      <div>
        <div class="logo">R<span>B</span>T</div>
        <div class="company">ТОВ «РБТ-ГРУП»<br />код ЄДРПОУ 37360626</div>
      </div>
      <div class="address">Місцезнаходження: 08292, Київська обл.,<br />Бучанський р-н, м. Буча, вул. Тячівська, буд.1</div>
    </header>
    <h1>Звіт по клієнтах</h1>
    <p class="subtitle">Період: ${this.html(period)} • Статус заявок: ${this.html(statusLabel)} • Вибірка: ${this.html(modeLabel)} • Сформовано ${this.html(this.utils.fmtDate(this.utils.todayStr()))}</p>
    <section class="summary">
      <div class="summary-card"><div class="label">Клієнтів</div><div class="value">${totals.clients}</div></div>
      <div class="summary-card"><div class="label">Записів</div><div class="value">${totals.records}</div></div>
      <div class="summary-card"><div class="label">План</div><div class="value">${this.html(this.utils.money(totals.plan))}</div></div>
      <div class="summary-card"><div class="label">Прибуток</div><div class="value">${this.html(this.utils.money(totals.profit))}</div></div>
      ${
        this.clientDocumentShowFinance
          ? `<div class="summary-card"><div class="label">Прихід</div><div class="value">${this.html(this.utils.money(totals.income))}</div></div>
      <div class="summary-card"><div class="label">Витрати</div><div class="value">${this.html(this.utils.money(totals.expense))}</div></div>
      <div class="summary-card"><div class="label">Залишок</div><div class="value">${this.html(this.utils.money(totals.remaining))}</div></div>`
          : ""
      }
    </section>
    ${
      rows.length
        ? `<table>
      <thead>
        <tr>
          <th style="width: 34px">№</th>
          <th style="width: 190px">Клієнт</th>
          <th style="width: 58px">Записи</th>
          <th>Локації / маршрути</th>
          ${
            this.clientDocumentShowFinance
              ? `<th style="width: 82px">План</th><th style="width: 82px">Прихід</th><th style="width: 82px">Витрати</th><th style="width: 82px">Прибуток</th><th style="width: 82px">Залишок</th>`
              : ""
          }
        </tr>
      </thead>
      <tbody>${rowHtml}</tbody>
    </table>`
        : `<div class="empty">За поточною вибіркою немає даних.</div>`
    }
    <footer>
      <span>trans@rbt-group.com.ua</span>
      <span>+38(068) 968 44 28</span>
    </footer>
  </main>
</body>
</html>`;
  }

  private equipmentDocumentHtml(rows: EquipmentDocumentRow[]): string {
    const totals = rows.reduce(
      (sum, row) => ({
        equipment: sum.equipment + 1,
        orders: sum.orders + row.orders.length + row.transports.length,
        days: sum.days + row.days,
        hours: sum.hours + row.hours,
        plan: sum.plan + row.plan,
        income: sum.income + row.income,
        expense: sum.expense + row.expense,
        profit: sum.profit + row.profit,
        remaining: sum.remaining + row.remaining,
      }),
      {
        equipment: 0,
        orders: 0,
        days: 0,
        hours: 0,
        plan: 0,
        income: 0,
        expense: 0,
        profit: 0,
        remaining: 0,
      },
    );
    const period = this.periodLabel();
    const modeLabel =
      this.equipmentDocumentMode === "all"
        ? "Вся техника"
        : this.equipmentDocumentMode === "worked"
          ? "Техника, которая работала"
          : `Одна единица: ${this.equipmentName(this.equipmentDocumentId)}`;
    const statusLabel =
      this.orderStatusOptions.find(
        (status) => status.value === this.orderStatusFilter(),
      )?.label || "Все статусы";
    const rowHtml = rows
      .map((row, index) => {
        const details = [
          ...row.orders.map(
            (order) =>
              `<div class="detail-line">Заявка ${this.html(this.utils.shortId(order.id))} • ${this.html(this.clientName(order.clientId))} • ${this.html(order.location || "—")} • ${this.html(this.utils.fmtDate(order.startDate))}-${this.html(this.utils.fmtDate(order.endDate))} • ${this.html(this.statusLabel(order.status))}</div>`,
          ),
          ...row.transports.map(
            (transport) =>
              `<div class="detail-line">Перевезення ${this.html(this.utils.shortId(transport.id))} • ${this.html(this.transportPartyName(transport.shipperClientId, transport.shipper))} → ${this.html(this.transportPartyName(transport.consigneeClientId, transport.consignee))} • ${this.html(transport.loadingPoint || "—")} → ${this.html(transport.unloadingPoint || "—")} • ${this.html(this.utils.fmtDate(transport.startDate))}-${this.html(this.utils.fmtDate(transport.endDate))} • ${this.html(this.statusLabel(transport.status))}</div>`,
          ),
        ];
        const orderDetails = details.length
          ? details.join("")
          : `<div class="muted">Записів за період немає.</div>`;
        return `<tr>
          <td>${index + 1}</td>
          <td><strong>${this.html(row.equipment.name)}</strong><div class="muted">${this.html(row.equipment.type || "Тип не указан")}</div></td>
          <td class="num">${row.orders.length + row.transports.length}</td>
          <td class="num">${row.days}</td>
          <td class="num">${row.hours}</td>
          ${
            this.equipmentDocumentShowFinance
              ? `<td class="money">${this.html(this.utils.money(row.plan))}</td>
          <td class="money">${this.html(this.utils.money(row.income))}</td>
          <td class="money">${this.html(this.utils.money(row.expense))}</td>
          <td class="money">${this.html(this.utils.money(row.profit))}</td>
          <td class="money">${this.html(this.utils.money(row.remaining))}</td>`
              : ""
          }
          <td>${orderDetails}</td>
        </tr>`;
      })
      .join("");

    return `<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8" />
  <title>Звіт по техніці</title>
  <style>
    :root { --ink: #172033; --muted: #697386; --line: #d8dee9; --brand: #15386f; --soft: #eef4ff; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #e8edf5; color: var(--ink); font-family: Arial, sans-serif; }
    .toolbar { position: sticky; top: 0; z-index: 2; display: flex; justify-content: flex-end; gap: 10px; padding: 10px 14px; background: #111827; }
    .toolbar button { border: 0; border-radius: 10px; padding: 10px 14px; font-weight: 800; cursor: pointer; color: #fff; background: #16a34a; }
    .page { width: 297mm; min-height: 210mm; margin: 18px auto; padding: 16mm; background: #fff; box-shadow: 0 18px 50px rgba(15, 23, 42, .18); }
    header { display: grid; grid-template-columns: 1fr 1.3fr; gap: 24px; align-items: end; padding-bottom: 14px; border-bottom: 3px solid #c7ceda; }
    .logo { font-size: 48px; font-weight: 900; letter-spacing: -5px; color: #c2c9d4; line-height: .85; }
    .logo span { color: #b7cdf8; }
    .company, .address, .muted { color: var(--muted); }
    .company, .address { font-weight: 700; font-size: 13px; line-height: 1.45; }
    .address { text-align: right; }
    h1 { margin: 24px 0 4px; color: var(--brand); text-align: center; font-size: 30px; }
    .subtitle { margin: 0 0 18px; text-align: center; color: var(--muted); }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; }
    .summary-card { padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--soft); }
    .summary-card .label { color: var(--muted); font-size: 12px; font-weight: 700; }
    .summary-card .value { margin-top: 6px; font-size: 20px; font-weight: 900; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th { background: var(--brand); color: #fff; text-align: left; font-size: 11px; letter-spacing: .03em; text-transform: uppercase; white-space: nowrap; }
    th, td { border: 1px solid var(--line); padding: 7px; vertical-align: top; font-size: 11px; overflow-wrap: anywhere; }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    .num, .money { text-align: right; white-space: nowrap; }
    .detail-line { margin-bottom: 4px; }
    .empty { padding: 24px; text-align: center; color: var(--muted); border: 1px dashed var(--line); border-radius: 12px; }
    footer { margin-top: 22px; padding-top: 12px; border-top: 2px solid #c7ceda; color: var(--muted); font-size: 12px; display: flex; justify-content: space-between; }
    @media print {
      body { background: #fff; }
      .toolbar { display: none; }
      .page { width: auto; min-height: auto; margin: 0; padding: 10mm; box-shadow: none; }
      tr { page-break-inside: avoid; }
    }
    @media (max-width: 900px) {
      .page { width: 100%; margin: 0; padding: 16px; }
      header, .summary { grid-template-columns: 1fr; }
      .address { text-align: left; }
      table { min-width: 1200px; }
    }
  </style>
</head>
<body>
  <div class="toolbar"><button type="button" onclick="window.print()">Печать / PDF</button></div>
  <main class="page">
    <header>
      <div>
        <div class="logo">R<span>B</span>T</div>
        <div class="company">ТОВ «РБТ-ГРУП»<br />код ЄДРПОУ 37360626</div>
      </div>
      <div class="address">Місцезнаходження: 08292, Київська обл.,<br />Бучанський р-н, м. Буча, вул. Тячівська, буд.1</div>
    </header>
    <h1>Звіт по техніці</h1>
    <p class="subtitle">Період: ${this.html(period)} • Статус: ${this.html(statusLabel)} • Вибірка: ${this.html(modeLabel)} • Сформовано ${this.html(this.utils.fmtDate(this.utils.todayStr()))}</p>
    <section class="summary">
      <div class="summary-card"><div class="label">Одиниць техніки</div><div class="value">${totals.equipment}</div></div>
      <div class="summary-card"><div class="label">Записів</div><div class="value">${totals.orders}</div></div>
      <div class="summary-card"><div class="label">Днів роботи/резерву</div><div class="value">${totals.days}</div></div>
      <div class="summary-card"><div class="label">Годин роботи</div><div class="value">${totals.hours}</div></div>
      ${
        this.equipmentDocumentShowFinance
          ? `<div class="summary-card"><div class="label">План</div><div class="value">${this.html(this.utils.money(totals.plan))}</div></div>
      <div class="summary-card"><div class="label">Прихід</div><div class="value">${this.html(this.utils.money(totals.income))}</div></div>
      <div class="summary-card"><div class="label">Витрати</div><div class="value">${this.html(this.utils.money(totals.expense))}</div></div>
      <div class="summary-card"><div class="label">Прибуток</div><div class="value">${this.html(this.utils.money(totals.profit))}</div></div>`
          : ""
      }
    </section>
    ${
      rows.length
        ? `<table>
      <thead>
        <tr>
          <th style="width: 34px">№</th>
          <th style="width: 210px">Техніка</th>
          <th style="width: 58px">Записи</th>
          <th style="width: 52px">Дні</th>
          <th style="width: 58px">Год.</th>
          ${
            this.equipmentDocumentShowFinance
              ? `<th style="width: 82px">План</th><th style="width: 82px">Прихід</th><th style="width: 82px">Витрати</th><th style="width: 82px">Прибуток</th><th style="width: 82px">Залишок</th>`
              : ""
          }
          <th>Деталі</th>
        </tr>
      </thead>
      <tbody>${rowHtml}</tbody>
    </table>`
        : `<div class="empty">За поточною вибіркою немає даних.</div>`
    }
    <footer>
      <span>trans@rbt-group.com.ua</span>
      <span>+38(068) 968 44 28</span>
    </footer>
  </main>
</body>
</html>`;
  }

  private periodLabel(): string {
    const from = this.periodStart();
    const to = this.periodEnd();
    if (from && to) return `${this.utils.fmtDate(from)} - ${this.utils.fmtDate(to)}`;
    if (from) return `з ${this.utils.fmtDate(from)}`;
    if (to) return `до ${this.utils.fmtDate(to)}`;
    return "весь період";
  }

  private html(value: unknown): string {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
