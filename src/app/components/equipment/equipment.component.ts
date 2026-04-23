import { Component, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { NgClass } from "@angular/common";
import { StateService } from "../../services/state.service";
import { DbService } from "../../services/db.service";
import { UtilsService } from "../../services/utils.service";
import { Equipment } from "../../models/crm.models";

@Component({
  selector: "app-equipment",
  standalone: true,
  imports: [FormsModule, NgClass],
  templateUrl: "./equipment.component.html",
  styleUrl: "./equipment.component.css",
})
export class EquipmentComponent {
  state = inject(StateService);
  db = inject(DbService);
  utils = inject(UtilsService);

  editingId = "";
  form = {
    name: "",
    type: "",
    code: "",
    defaultRate: 0,
    status: "free" as Equipment["status"],
  };

  eqBadgeClass(s: string): string {
    return { free: "free", busy: "busy", repair: "repairstatus" }[s] || "free";
  }
  eqBadgeLabel(s: string): string {
    return (
      { free: "Свободна", busy: "В работе", repair: "Ремонт" }[s] || "Свободна"
    );
  }
  repairCount(eqId: string): number {
    return this.state
      .repairs()
      .filter((r) => r.equipmentId === eqId && r.status !== "cancelled").length;
  }

  async save(): Promise<void> {
    if (!this.form.name) return;
    if (this.editingId)
      await this.db.update("equipment", this.editingId, this.form);
    else
      await this.db.insert("equipment", {
        id: this.utils.uid("eq"),
        ...this.form,
      });
    this.clearForm();
  }

  edit(eq: Equipment): void {
    this.editingId = eq.id;
    this.form = {
      name: eq.name,
      type: eq.type,
      code: eq.code,
      defaultRate: eq.defaultRate,
      status: eq.status,
    };
  }

  async remove(id: string): Promise<void> {
    if (!confirm("Удалить технику и связанные заявки/ремонты?")) return;
    const orderIds = this.state
      .orders()
      .filter((o) => o.equipmentId === id)
      .map((o) => o.id);
    const repairIds = this.state
      .repairs()
      .filter((r) => r.equipmentId === id)
      .map((r) => r.id);
    for (const oid of orderIds) await this.db.remove("orders", oid);
    for (const rid of repairIds) await this.db.remove("repairs", rid);
    await this.db.remove("equipment", id);
    this.clearForm();
  }

  clearForm(): void {
    this.editingId = "";
    this.form = {
      name: "",
      type: "",
      code: "",
      defaultRate: 0,
      status: "free",
    };
  }
}
