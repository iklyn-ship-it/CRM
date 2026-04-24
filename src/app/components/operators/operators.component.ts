import { Component, inject } from "@angular/core";
import { NgClass } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { StateService } from "../../services/state.service";
import { DbService } from "../../services/db.service";
import { UtilsService } from "../../services/utils.service";
import { Operator } from "../../models/crm.models";

@Component({
  selector: "app-operators",
  standalone: true,
  imports: [FormsModule, NgClass],
  templateUrl: "./operators.component.html",
  styleUrl: "./operators.component.css",
})
export class OperatorsComponent {
  state = inject(StateService);
  db = inject(DbService);
  utils = inject(UtilsService);

  editingId = "";
  form = { name: "", phone: "", skill: "", rate: 0 };

  operatorBadgeClass(status: "free" | "busy"): string {
    return status === "busy" ? "busy" : "free";
  }

  operatorBadgeLabel(status: "free" | "busy"): string {
    return status === "busy" ? "В работе" : "Свободен";
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
  }

  edit(op: Operator): void {
    this.editingId = op.id;
    this.form = {
      name: op.name,
      phone: op.phone,
      skill: op.skill,
      rate: op.rate,
    };
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
    this.form = { name: "", phone: "", skill: "", rate: 0 };
  }
}
