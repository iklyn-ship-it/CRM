import { Component, computed, inject, signal } from "@angular/core";
import { NgClass, SlicePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { StateService } from "../../services/state.service";
import { DbService } from "../../services/db.service";
import { UtilsService } from "../../services/utils.service";
import {
  Operator,
  OperatorWorkStatus,
  OrderStatus,
} from "../../models/crm.models";

interface OperatorWorkJournalRow {
  orderId: string;
  operatorName: string;
  clientName: string;
  equipmentName: string;
  location: string;
  startDate: string;
  endDate: string;
  days: number;
  rate: number;
  amount: number;
  status: OrderStatus;
}

@Component({
  selector: "app-operators",
  standalone: true,
  imports: [FormsModule, NgClass, SlicePipe],
  templateUrl: "./operators.component.html",
  styleUrl: "./operators.component.css",
})
export class OperatorsComponent {
  state = inject(StateService);
  db = inject(DbService);
  utils = inject(UtilsService);

  journalOperatorFilter = signal("");
  journalFrom = signal("");
  journalTo = signal("");
  formOpen = signal(false);
  editingId = "";
  form = {
    name: "",
    phone: "",
    skill: "",
    rate: 0,
    workStatus: "active" as OperatorWorkStatus,
  };

  readonly workStatuses: {
    value: OperatorWorkStatus;
    label: string;
    className: string;
  }[] = [
    { value: "active", label: "Работает", className: "confirmed" },
    { value: "sick_leave", label: "Больничный", className: "repairplan" },
    { value: "dismissed", label: "Уволен", className: "cancelled" },
  ];

  readonly workJournalRows = computed((): OperatorWorkJournalRow[] => {
    const operatorId = this.journalOperatorFilter();
    const from = this.journalFrom();
    const to = this.journalTo();

    return this.state
      .orders()
      .filter((order) => {
        if (!order.operatorId || order.status === "cancelled") return false;
        if (operatorId && order.operatorId !== operatorId) return false;
        if (from || to) {
          const fromDate = from || "0000-01-01";
          const toDate = to || "9999-12-31";
          if (
            !this.utils.overlap(
              fromDate,
              toDate,
              order.startDate,
              order.endDate,
            )
          ) {
            return false;
          }
        }
        return true;
      })
      .map((order) => {
        const operator = this.state.byId(
          this.state.operators(),
          order.operatorId,
        );
        const client = this.state.byId(this.state.clients(), order.clientId);
        const equipment = this.state.byId(
          this.state.equipment(),
          order.equipmentId,
        );
        const startDate =
          from && from > order.startDate ? from : order.startDate;
        const endDate = to && to < order.endDate ? to : order.endDate;
        const days = this.utils.daysInclusive(startDate, endDate);
        const rate = Number(operator?.rate || 0);

        return {
          orderId: order.id,
          operatorName: operator?.name || "—",
          clientName: client?.name || "—",
          equipmentName: equipment?.name || "—",
          location: order.location || "—",
          startDate,
          endDate,
          days,
          rate,
          amount: days * rate,
          status: order.status,
        };
      })
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  });

  readonly journalSummary = computed(() =>
    this.workJournalRows().reduce(
      (summary, row) => ({
        days: summary.days + row.days,
        amount: summary.amount + row.amount,
      }),
      { days: 0, amount: 0 },
    ),
  );

  operatorBadgeClass(status: "free" | "busy"): string {
    return status === "busy" ? "busy" : "free";
  }

  operatorBadgeLabel(status: "free" | "busy"): string {
    return status === "busy" ? "В работе" : "Свободен";
  }

  orderStatusLabel(status: OrderStatus): string {
    const labels: Record<OrderStatus, string> = {
      new: "Новая",
      confirmed: "Подтверждена",
      active: "В работе",
      completed: "Завершена",
      cancelled: "Отменена",
    };
    return labels[status];
  }

  workStatusBadgeClass(status: OperatorWorkStatus): string {
    return (
      this.workStatuses.find((item) => item.value === status)?.className ||
      "confirmed"
    );
  }

  workStatusLabel(status: OperatorWorkStatus): string {
    return (
      this.workStatuses.find((item) => item.value === status)?.label ||
      "Работает"
    );
  }

  opShifts(opId: string): number {
    return this.state
      .orders()
      .filter((o) => o.operatorId === opId && o.status !== "cancelled")
      .reduce(
        (s, o) => s + this.utils.daysInclusive(o.startDate, o.endDate),
        0,
      );
  }

  async save(): Promise<void> {
    if (!this.form.name) return;
    if (this.editingId)
      await this.db.update("operators", this.editingId, this.form);
    else
      await this.db.insert("operators", {
        id: this.utils.uid("op"),
        ...this.form,
      });
    this.clearForm();
    this.formOpen.set(false);
  }

  openCreate(): void {
    this.clearForm();
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.clearForm();
    this.formOpen.set(false);
  }

  edit(op: Operator): void {
    this.editingId = op.id;
    this.form = {
      name: op.name,
      phone: op.phone,
      skill: op.skill,
      rate: op.rate,
      workStatus: op.workStatus || "active",
    };
    this.formOpen.set(true);
  }

  async setWorkStatus(
    op: Operator,
    status: OperatorWorkStatus,
  ): Promise<void> {
    if ((op.workStatus || "active") === status) return;
    await this.db.update("operators", op.id, { workStatus: status });
    if (this.editingId === op.id) {
      this.form = { ...this.form, workStatus: status };
    }
  }

  async remove(id: string): Promise<void> {
    if (!confirm("Удалить оператора?")) return;
    const orders = this.state.orders().filter((o) => o.operatorId === id);
    for (const o of orders)
      await this.db.update("orders", o.id, { operatorId: "" });
    await this.db.remove("operators", id);
    this.clearForm();
  }

  clearForm(): void {
    this.editingId = "";
    this.form = {
      name: "",
      phone: "",
      skill: "",
      rate: 0,
      workStatus: "active",
    };
  }
}
