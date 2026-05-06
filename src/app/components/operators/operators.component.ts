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
  key: string;
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
    hourlyRate: 0,
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
      .flatMap((order) => {
        if (order.status === "cancelled") return [];
        return this.state.orderOperatorAssignments(order).map((assignment) => ({
          order,
          assignment,
        }));
      })
      .filter(({ order, assignment }) => {
        const assignedOperatorId = assignment.operatorId;
        if (operatorId && assignedOperatorId !== operatorId) return false;
        if (from || to) {
          const fromDate = from || "0000-01-01";
          const toDate = to || "9999-12-31";
          if (
            !this.utils.overlap(
              fromDate,
              toDate,
              assignment.startDate,
              assignment.endDate,
            )
          ) {
            return false;
          }
        }
        return true;
      })
      .map(({ order, assignment }) => {
        const assignedOperatorId = assignment.operatorId;
        const operator = this.state.byId(
          this.state.operators(),
          assignedOperatorId,
        );
        const client = this.state.byId(this.state.clients(), order.clientId);
        const equipment = this.state.byId(
          this.state.equipment(),
          order.equipmentId,
        );
        const startDate =
          from && from > assignment.startDate ? from : assignment.startDate;
        const endDate = to && to < assignment.endDate ? to : assignment.endDate;
        const idleDates = new Set(assignment.idleDates || []);
        const days = this.utils
          .datesInclusive(startDate, endDate)
          .filter((date) => !idleDates.has(date)).length;
        const hourlyRate = Number(operator?.hourlyRate || 0);
        const rate = hourlyRate || Number(operator?.rate || 0);
        const hours =
          hourlyRate > 0
            ? days * this.state.orderStandardWorkHours(order)
            : days;

        return {
          key: `${order.id}-${assignment.id}-${assignedOperatorId}`,
          orderId: order.id,
          operatorName: operator?.name || "—",
          clientName: client?.name || "—",
          equipmentName: equipment?.name || "—",
          location: order.location || "—",
          startDate,
          endDate,
          days,
          rate,
          amount: hours * rate,
          status: order.status,
        };
      })
      .filter((row) => row.days > 0)
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
      .filter((o) => o.status !== "cancelled")
      .reduce(
        (s, o) => s + this.state.orderOperatorWorkDaysFor(o, opId),
        0,
      );
  }

  async save(): Promise<void> {
    if (!this.form.name) return;
    try {
      if (this.editingId)
        await this.db.update("operators", this.editingId, this.form);
      else
        await this.db.insert("operators", {
          id: this.utils.uid("op"),
          ...this.form,
        });
    } catch (error) {
      alert(this.saveErrorMessage(error));
      return;
    }
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
      hourlyRate: op.hourlyRate || 0,
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
    const orders = this.state
      .orders()
      .filter(
        (o) =>
          o.operatorId === id ||
          (o.operatorShifts || []).some((shift) => shift.operatorId === id),
      );
    for (const o of orders) {
      await this.db.update("orders", o.id, {
        operatorId: o.operatorId === id ? "" : o.operatorId,
        operatorShifts: (o.operatorShifts || []).filter(
          (shift) => shift.operatorId !== id,
        ),
      });
    }
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
      hourlyRate: 0,
      workStatus: "active",
    };
  }

  private saveErrorMessage(error: unknown): string {
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message || "")
        : "";
    if (message.includes("hourly_rate")) {
      return "База Supabase еще не готова для часовых ставок. Выполни SQL-файл supabase-hourly-rates-and-operation-equipment.sql в Supabase SQL Editor и попробуй снова.";
    }
    return message
      ? `Не удалось сохранить оператора: ${message}`
      : "Не удалось сохранить оператора.";
  }
}
