import { Component, computed, signal, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { NgClass, SlicePipe } from "@angular/common";
import { StateService } from "../../services/state.service";
import { DbService } from "../../services/db.service";
import { UtilsService } from "../../services/utils.service";
import {
  FinanceOperation,
  Order,
  OrderStatus,
  Transport,
} from "../../models/crm.models";

interface OrderFinanceRow {
  order: Order;
  clientId: string;
  clientName: string;
  equipmentName: string;
  plan: number;
  income: number;
  expense: number;
  manualExpense: number;
  operatorExpense: number;
  profit: number;
  remaining: number;
  incomeOps: FinanceOperation[];
  expenseOps: FinanceOperation[];
}

interface ClientFinanceGroup {
  clientId: string;
  clientName: string;
  rows: OrderFinanceRow[];
  plan: number;
  income: number;
  expense: number;
  profit: number;
  remaining: number;
  latestDate: string;
}

interface TransportFinanceRow {
  transport: Transport;
  route: string;
  driverName: string;
  equipmentName: string;
  plan: number;
  income: number;
  expense: number;
  manualExpense: number;
  driverExpense: number;
  profit: number;
  remaining: number;
  incomeOps: FinanceOperation[];
  expenseOps: FinanceOperation[];
}

@Component({
  selector: "app-finance",
  standalone: true,
  imports: [FormsModule, NgClass, SlicePipe],
  templateUrl: "./finance.component.html",
  styleUrl: "./finance.component.css",
})
export class FinanceComponent {
  state = inject(StateService);
  db = inject(DbService);
  utils = inject(UtilsService);

  search = signal("");
  filterType = signal("");
  orderFinanceStatusFilter = signal<"open" | "all" | OrderStatus>("open");
  expandedClientIds = signal<string[]>([]);
  formOpen = signal(false);
  editingId = "";
  form = {
    date: "",
    type: "income" as "income" | "expense",
    category: "Оплата клиента",
    amount: 0,
    orderId: "",
    repairId: "",
    transportId: "",
    equipmentId: "",
    billClient: false,
    markup: 0,
    paid: false,
    comment: "",
  };
  readonly categories = [
    "Оплата клиента",
    "Оплата перевозки",
    "Топливо",
    "Зарплата оператора",
    "Водитель",
    "Ремонт",
    "Логистика",
    "Запчасти",
    "Прочее",
  ];

  readonly orderFinanceStatusFilters: {
    value: "open" | "all" | OrderStatus;
    label: string;
  }[] = [
    { value: "open", label: "Актуальные" },
    { value: "new", label: "Новые" },
    { value: "confirmed", label: "Подтверждённые" },
    { value: "active", label: "В работе" },
    { value: "cancelled", label: "Отменённые" },
    { value: "completed", label: "Завершённые" },
    { value: "all", label: "Все" },
  ];

  readonly availableOrderLinks = computed(() => {
    return [...this.state.orders()]
      .filter((order) => order.status !== "completed")
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  });

  readonly availableTransportLinks = computed(() => {
    return [...this.state.transports()].sort((a, b) =>
      b.startDate.localeCompare(a.startDate),
    );
  });

  readonly filteredOps = computed(() => {
    const q = this.search().toLowerCase(),
      ft = this.filterType();
    let ops = [...this.state.operations()].sort((a, b) =>
      b.date.localeCompare(a.date),
    );
    if (ft) ops = ops.filter((o) => o.type === ft);
    if (q)
      ops = ops.filter(
        (o) =>
          (o.category || "").toLowerCase().includes(q) ||
          (o.comment || "").toLowerCase().includes(q) ||
          this.linkText(o).toLowerCase().includes(q),
      );
    return ops;
  });

  readonly orderFinanceRows = computed((): OrderFinanceRow[] => {
    const q = this.search().toLowerCase();
    const statusFilter = this.orderFinanceStatusFilter();
    return [...this.state.orders()]
      .filter((order) => {
        if (statusFilter === "all") return true;
        if (statusFilter === "open") return order.status !== "completed";
        return order.status === statusFilter;
      })
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
      .map((order) => {
        const clientName =
          this.state.byId(this.state.clients(), order.clientId)?.name || "—";
        const equipmentName =
          this.state.byId(this.state.equipment(), order.equipmentId)?.name ||
          "—";
        const operations = this.state
          .orderOps(order.id)
          .sort((a, b) => b.date.localeCompare(a.date));
        const incomeOps = operations.filter((op) => op.type === "income");
        const expenseOps = operations.filter((op) => op.type === "expense");
        const income = incomeOps.reduce(
          (sum, op) => sum + Number(op.amount || 0),
          0,
        );
        const manualExpense = expenseOps.reduce(
          (sum, op) => sum + Number(op.amount || 0),
          0,
        );
        const operatorExpense = this.state.orderOperatorCost(order);
        const expense = manualExpense + operatorExpense;
        const plan = this.state.orderPlan(order);

        return {
          order,
          clientId: order.clientId || "no-client",
          clientName,
          equipmentName,
          plan,
          income,
          expense,
          manualExpense,
          operatorExpense,
          profit: income - expense,
          remaining: Math.max(0, plan - income),
          incomeOps,
          expenseOps,
        };
      })
      .filter((row) => {
        if (!q) return true;
        return (
          row.order.id.toLowerCase().includes(q) ||
          row.clientName.toLowerCase().includes(q) ||
          row.equipmentName.toLowerCase().includes(q) ||
          (row.order.location || "").toLowerCase().includes(q)
        );
      });
  });

  readonly groupedOrderFinanceRows = computed((): ClientFinanceGroup[] => {
    const groups = new Map<string, OrderFinanceRow[]>();
    this.orderFinanceRows().forEach((row) => {
      groups.set(row.clientId, [...(groups.get(row.clientId) || []), row]);
    });

    return [...groups.entries()]
      .map(([clientId, rows]) => ({
        clientId,
        clientName: rows[0]?.clientName || "—",
        rows,
        plan: rows.reduce((sum, row) => sum + row.plan, 0),
        income: rows.reduce((sum, row) => sum + row.income, 0),
        expense: rows.reduce((sum, row) => sum + row.expense, 0),
        profit: rows.reduce((sum, row) => sum + row.profit, 0),
        remaining: rows.reduce((sum, row) => sum + row.remaining, 0),
        latestDate: rows.reduce(
          (latest, row) =>
            row.order.startDate > latest ? row.order.startDate : latest,
          "",
        ),
      }))
      .sort((a, b) => b.latestDate.localeCompare(a.latestDate));
  });

  readonly unlinkedOps = computed(() =>
    this.state
      .operations()
      .filter(
        (op) =>
          !op.orderId && !op.repairId && !op.transportId && !op.equipmentId,
      )
      .sort((a, b) => b.date.localeCompare(a.date)),
  );

  readonly transportFinanceRows = computed((): TransportFinanceRow[] => {
    const q = this.search().toLowerCase();
    return [...this.state.transports()]
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
      .map((transport) => {
        const operations = this.state
          .transportOps(transport.id)
          .sort((a, b) => b.date.localeCompare(a.date));
        const incomeOps = operations.filter((op) => op.type === "income");
        const expenseOps = operations.filter((op) => op.type === "expense");
        const income = this.state.transportIncome(transport.id);
        const manualExpense = this.state.transportManualExpense(transport.id);
        const driverExpense = this.state.transportDriverCost(transport);
        const expense = manualExpense + driverExpense;
        const route = `${transport.loadingPoint || "—"} → ${transport.unloadingPoint || "—"}`;
        const driverName =
          this.state.byId(this.state.operators(), transport.driverId)?.name ||
          "—";
        const equipmentName =
          this.state.byId(this.state.equipment(), transport.equipmentId)
            ?.name || "—";

        return {
          transport,
          route,
          driverName,
          equipmentName,
          plan: this.state.transportTotal(transport),
          income,
          expense,
          manualExpense,
          driverExpense,
          profit: income - expense,
          remaining: this.state.transportRemaining(transport),
          incomeOps,
          expenseOps,
        };
      })
      .filter((row) => {
        if (!q) return true;
        return (
          row.transport.id.toLowerCase().includes(q) ||
          row.route.toLowerCase().includes(q) ||
          row.driverName.toLowerCase().includes(q) ||
          row.equipmentName.toLowerCase().includes(q) ||
          (row.transport.cargoName || "").toLowerCase().includes(q)
        );
      });
  });

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      new: "Новая",
      confirmed: "Подтверждена",
      active: "В работе",
      completed: "Завершена",
      cancelled: "Отменена",
    };
    return labels[status] || status;
  }

  transportStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      new: "Новая",
      active: "В работе",
      completed: "Завершена",
      cancelled: "Отменена",
    };
    return labels[status] || status;
  }

  isClientExpanded(clientId: string): boolean {
    return this.expandedClientIds().includes(clientId);
  }

  toggleClientGroup(clientId: string): void {
    const ids = new Set(this.expandedClientIds());
    if (ids.has(clientId)) ids.delete(clientId);
    else ids.add(clientId);
    this.expandedClientIds.set([...ids]);
  }

  onOrderLinkChange(): void {
    const order = this.state.byId(this.state.orders(), this.form.orderId);
    if (order?.status === "completed") {
      this.form.orderId = "";
      alert(
        "Завершённая заявка закрыта для финансовых операций. Сначала измените статус заявки.",
      );
      return;
    }
    if (this.form.orderId) {
      this.form.repairId = "";
      this.form.transportId = "";
      const order = this.state.byId(this.state.orders(), this.form.orderId);
      this.form.equipmentId = order?.equipmentId || this.form.equipmentId;
    }
  }

  onRepairLinkChange(): void {
    if (this.form.repairId) {
      this.form.orderId = "";
      this.form.transportId = "";
      const repair = this.state.byId(this.state.repairs(), this.form.repairId);
      this.form.equipmentId = repair?.equipmentId || this.form.equipmentId;
    }
  }

  onTransportLinkChange(): void {
    if (this.form.transportId) {
      this.form.orderId = "";
      this.form.repairId = "";
      const transport = this.state.byId(
        this.state.transports(),
        this.form.transportId,
      );
      this.form.equipmentId = transport?.equipmentId || this.form.equipmentId;
    }
  }

  onEquipmentLinkChange(): void {
    if (this.form.equipmentId) {
      this.form.repairId = "";
    }
  }

  linkText(op: FinanceOperation): string {
    if (op.orderId) {
      const ord = this.state.byId(this.state.orders(), op.orderId);
      if (ord)
        return `Аренда ${ord.id.slice(-5)} • ${this.state.byId(this.state.clients(), ord.clientId)?.name || ""}`;
    }
    if (op.repairId) {
      const rep = this.state.byId(this.state.repairs(), op.repairId);
      if (rep)
        return `Ремонт ${rep.id.slice(-5)} • ${this.state.byId(this.state.equipment(), rep.equipmentId)?.name || ""}`;
    }
    if (op.transportId) {
      const transport = this.state.byId(
        this.state.transports(),
        op.transportId,
      );
      if (transport) {
        return `Перевозка ${transport.id.slice(-5)} • ${transport.loadingPoint || "—"} → ${transport.unloadingPoint || "—"}`;
      }
    }
    if (op.equipmentId) {
      const equipment = this.state.byId(this.state.equipment(), op.equipmentId);
      if (equipment) return `Техника • ${equipment.name}`;
    }
    return "—";
  }

  async save(): Promise<void> {
    if (!this.form.date || !this.form.amount) return;
    const linkedOrder = this.state.byId(this.state.orders(), this.form.orderId);
    if (linkedOrder?.status === "completed") {
      alert(
        "Завершённая заявка закрыта для финансовых операций. Чтобы внести изменения, сначала измените статус заявки.",
      );
      return;
    }
    const payload = {
      ...this.form,
      billClient: this.form.type === "expense" && Boolean(this.form.billClient),
      markup:
        this.form.type === "expense" && this.form.billClient
          ? Number(this.form.markup || 0)
          : 0,
      paid: this.form.type === "expense" ? Boolean(this.form.paid) : false,
    };
    try {
      if (this.editingId)
        await this.db.update("operations", this.editingId, payload);
      else
        await this.db.insert("operations", {
          id: this.utils.uid("fin"),
          ...payload,
        });
    } catch (error) {
      alert(this.saveErrorMessage(error));
      return;
    }
    this.clearForm();
    this.formOpen.set(false);
  }

  openCreate(type: "income" | "expense" = "income"): void {
    this.clearForm();
    this.form = {
      ...this.form,
      type,
      category: type === "income" ? "Оплата клиента" : "Прочее",
    };
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.clearForm();
    this.formOpen.set(false);
  }

  edit(op: FinanceOperation): void {
    const linkedOrder = this.state.byId(this.state.orders(), op.orderId);
    if (linkedOrder?.status === "completed") {
      alert(
        "Операции по завершённой заявке нельзя изменять. Сначала измените статус заявки.",
      );
      return;
    }
    this.editingId = op.id;
    this.form = {
      date: op.date,
      type: op.type,
      category: op.category,
      amount: op.amount,
      orderId: op.orderId,
      repairId: op.repairId,
      transportId: op.transportId || "",
      equipmentId: op.equipmentId || "",
      billClient: Boolean(op.billClient),
      markup: Number(op.markup || 0),
      paid: Boolean(op.paid),
      comment: op.comment,
    };
    this.formOpen.set(true);
  }

  async remove(id: string): Promise<void> {
    if (!confirm("Удалить операцию?")) return;
    await this.db.remove("operations", id);
    this.clearForm();
  }

  clearForm(): void {
    this.editingId = "";
    this.form = {
      date: "",
      type: "income",
      category: "Оплата клиента",
      amount: 0,
      orderId: "",
      repairId: "",
      transportId: "",
      equipmentId: "",
      billClient: false,
      markup: 0,
      paid: false,
      comment: "",
    };
  }

  private saveErrorMessage(error: unknown): string {
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message || "")
        : "";
    if (message.includes("equipment_id")) {
      return "База Supabase еще не готова для привязки финансов к технике. Выполни SQL-файл supabase-hourly-rates-and-operation-equipment.sql в Supabase SQL Editor и попробуй снова.";
    }
    if (message.includes("transport_id")) {
      return "База Supabase еще не готова для финансов перевозок. Выполни SQL-файл supabase-transport-finance.sql в Supabase SQL Editor и попробуй снова.";
    }
    if (
      message.includes("bill_client") ||
      message.includes("markup") ||
      message.includes("paid")
    ) {
      return "База Supabase еще не готова для расходов с наценкой/оплатой. Выполни SQL-файл supabase-operation-billing.sql в Supabase SQL Editor и попробуй снова.";
    }
    return message
      ? `Не удалось сохранить финансовую операцию: ${message}`
      : "Не удалось сохранить финансовую операцию.";
  }
}
