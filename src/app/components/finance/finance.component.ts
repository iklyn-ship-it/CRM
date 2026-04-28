import { Component, computed, signal, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { NgClass, SlicePipe } from "@angular/common";
import { StateService } from "../../services/state.service";
import { DbService } from "../../services/db.service";
import { UtilsService } from "../../services/utils.service";
import { FinanceOperation, Order, OrderStatus } from "../../models/crm.models";

interface OrderFinanceRow {
  order: Order;
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
  editingId = "";
  form = {
    date: "",
    type: "income" as "income" | "expense",
    category: "Оплата клиента",
    amount: 0,
    orderId: "",
    repairId: "",
    comment: "",
  };
  readonly categories = [
    "Оплата клиента",
    "Топливо",
    "Зарплата оператора",
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

  readonly unlinkedOps = computed(() =>
    this.state
      .operations()
      .filter((op) => !op.orderId && !op.repairId)
      .sort((a, b) => b.date.localeCompare(a.date)),
  );

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

  onOrderLinkChange(): void {
    const order = this.state.byId(this.state.orders(), this.form.orderId);
    if (order?.status === "completed") {
      this.form.orderId = "";
      alert(
        "Завершённая заявка закрыта для финансовых операций. Сначала измените статус заявки.",
      );
      return;
    }
    if (this.form.orderId) this.form.repairId = "";
  }

  onRepairLinkChange(): void {
    if (this.form.repairId) this.form.orderId = "";
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
    if (this.editingId)
      await this.db.update("operations", this.editingId, this.form);
    else
      await this.db.insert("operations", {
        id: this.utils.uid("fin"),
        ...this.form,
      });
    this.clearForm();
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
      comment: op.comment,
    };
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
      comment: "",
    };
  }
}
