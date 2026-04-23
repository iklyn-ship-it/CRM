import { Component, computed, signal, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { NgClass, SlicePipe } from "@angular/common";
import { StateService } from "../../services/state.service";
import { DbService } from "../../services/db.service";
import { UtilsService } from "../../services/utils.service";
import { FinanceOperation } from "../../models/crm.models";

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
          (o.comment || "").toLowerCase().includes(q),
      );
    return ops;
  });

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
