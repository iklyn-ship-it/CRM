import { Component, computed, signal, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { NgClass, SlicePipe } from "@angular/common";
import { StateService } from "../../services/state.service";
import { DbService } from "../../services/db.service";
import { UtilsService } from "../../services/utils.service";
import { Repair, RepairStatus } from "../../models/crm.models";

@Component({
  selector: "app-repairs",
  standalone: true,
  imports: [FormsModule, NgClass, SlicePipe],
  templateUrl: "./repairs.component.html",
  styleUrl: "./repairs.component.css",
})
export class RepairsComponent {
  state = inject(StateService);
  db = inject(DbService);
  utils = inject(UtilsService);

  search = signal("");
  filterStatus = signal("");
  formOpen = signal(false);
  editingId = "";
  form = {
    equipmentId: "",
    startDate: "",
    endDate: "",
    status: "planned" as RepairStatus,
    laborCost: 0,
    partsCost: 0,
    responsible: "",
    tasks: "",
    notes: "",
  };

  readonly conflictSet = computed(
    () => new Set(this.state.repairConflicts().flatMap((x) => [x[0], x[1]])),
  );

  readonly filteredRepairs = computed(() => {
    const q = this.search().toLowerCase(),
      fs = this.filterStatus();
    let list = [...this.state.repairs()];
    if (fs) list = list.filter((r) => r.status === fs);
    if (q)
      list = list.filter((r) => {
        const eq = (
          this.state.byId(this.state.equipment(), r.equipmentId)?.name || ""
        ).toLowerCase();
        return (
          eq.includes(q) ||
          (r.responsible || "").toLowerCase().includes(q) ||
          (r.tasks || "").toLowerCase().includes(q) ||
          (r.notes || "").toLowerCase().includes(q)
        );
      });
    return list.sort((a, b) => b.startDate.localeCompare(a.startDate));
  });

  eqName(id: string): string {
    return this.state.byId(this.state.equipment(), id)?.name || "—";
  }
  statusLabel(s: string): string {
    return (
      {
        planned: "Запланирован",
        active: "В ремонте",
        completed: "Завершён",
        cancelled: "Отменён",
      }[s] || s
    );
  }
  statusBadgeClass(s: string): string {
    return (
      {
        planned: "repairplan",
        active: "repairstatus",
        completed: "completed",
        cancelled: "cancelled",
      }[s] || "repairplan"
    );
  }

  repairTotal(r: Pick<Repair, "laborCost" | "partsCost">): number {
    return Number(r.laborCost || 0) + Number(r.partsCost || 0);
  }

  async save(): Promise<void> {
    if (!this.form.startDate || !this.form.endDate) return;
    if (this.editingId)
      await this.db.update("repairs", this.editingId, this.form);
    else
      await this.db.insert("repairs", {
        id: this.utils.uid("rep"),
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

  edit(r: Repair): void {
    this.editingId = r.id;
    this.form = {
      equipmentId: r.equipmentId,
      startDate: r.startDate,
      endDate: r.endDate,
      status: r.status,
      laborCost: Number(r.laborCost || 0),
      partsCost: Number(r.partsCost || 0),
      responsible: r.responsible || "",
      tasks: r.tasks,
      notes: r.notes,
    };
    this.formOpen.set(true);
  }

  async remove(id: string): Promise<void> {
    if (!confirm("Удалить ремонт?")) return;
    const ops = this.state.operations().filter((op) => op.repairId === id);
    for (const op of ops)
      await this.db.update("operations", op.id, { repairId: "" });
    await this.db.remove("repairs", id);
    this.clearForm();
  }

  clearForm(): void {
    this.editingId = "";
    this.form = {
      equipmentId: "",
      startDate: "",
      endDate: "",
      status: "planned",
      laborCost: 0,
      partsCost: 0,
      responsible: "",
      tasks: "",
      notes: "",
    };
  }
}
