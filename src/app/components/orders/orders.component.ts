import { Component, computed, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { NgClass, SlicePipe } from "@angular/common";
import { StateService } from "../../services/state.service";
import { DbService } from "../../services/db.service";
import { UtilsService } from "../../services/utils.service";
import { Order, OrderStatus } from "../../models/crm.models";

@Component({
  selector: "app-orders",
  standalone: true,
  imports: [FormsModule, NgClass, SlicePipe],
  templateUrl: "./orders.component.html",
  styleUrl: "./orders.component.css",
})
export class OrdersComponent {
  state = inject(StateService);
  db = inject(DbService);
  utils = inject(UtilsService);

  search = "";
  filterStatus = "";
  editingId = "";

  form = {
    clientId: "",
    equipmentId: "",
    operatorId: "",
    startDate: "",
    endDate: "",
    location: "",
    rate: 0,
    status: "new" as OrderStatus,
    notes: "",
  };

  readonly statuses: { value: OrderStatus; label: string }[] = [
    { value: "new", label: "Новая" },
    { value: "confirmed", label: "Подтверждена" },
    { value: "active", label: "В работе" },
    { value: "completed", label: "Завершена" },
    { value: "cancelled", label: "Отменена" },
  ];

  readonly filterStatuses = [{ value: "", label: "Все" }, ...this.statuses];

  readonly conflictSet = computed(() => {
    const conf = this.state.orderConflicts();
    return new Set(conf.flatMap((x) => [x[0], x[1]]));
  });

  readonly filteredOrders = computed(() => {
    const q = this.search.toLowerCase();
    const fs = this.filterStatus;
    let list = [...this.state.orders()];
    if (fs) list = list.filter((o) => o.status === fs);
    if (q) {
      list = list.filter((o) => {
        const cl = (
          this.state.byId(this.state.clients(), o.clientId)?.name || ""
        ).toLowerCase();
        const eq = (
          this.state.byId(this.state.equipment(), o.equipmentId)?.name || ""
        ).toLowerCase();
        const loc = (o.location || "").toLowerCase();
        return (
          cl.includes(q) ||
          eq.includes(q) ||
          loc.includes(q) ||
          o.id.toLowerCase().includes(q)
        );
      });
    }
    return list.sort((a, b) => b.startDate.localeCompare(a.startDate));
  });

  clientName(id: string): string {
    return this.state.byId(this.state.clients(), id)?.name || "—";
  }
  eqName(id: string): string {
    return this.state.byId(this.state.equipment(), id)?.name || "—";
  }
  statusLabel(s: string): string {
    return (
      {
        new: "Новое",
        confirmed: "Подтверждена",
        active: "В работе",
        completed: "Завершена",
        cancelled: "Отменена",
      }[s] || s
    );
  }

  onEquipmentChange(): void {
    const eq = this.state.byId(this.state.equipment(), this.form.equipmentId);
    if (eq && !this.form.rate) this.form.rate = eq.defaultRate || 0;
  }

  async save(): Promise<void> {
    if (!this.form.startDate || !this.form.endDate) return;
    if (this.editingId) {
      await this.db.update("orders", this.editingId, this.form);
    } else {
      await this.db.insert("orders", {
        id: this.utils.uid("ord"),
        ...this.form,
      });
    }
    this.clearForm();
  }

  edit(order: Order): void {
    this.editingId = order.id;
    this.form = {
      clientId: order.clientId,
      equipmentId: order.equipmentId,
      operatorId: order.operatorId,
      startDate: order.startDate,
      endDate: order.endDate,
      location: order.location,
      rate: order.rate,
      status: order.status,
      notes: order.notes,
    };
  }

  async remove(id: string): Promise<void> {
    if (!confirm("Удалить заявку?")) return;
    // Unlink operations
    const ops = this.state.operations().filter((op) => op.orderId === id);
    for (const op of ops) {
      await this.db.update("operations", op.id, { orderId: "" });
    }
    await this.db.remove("orders", id);
    this.clearForm();
  }

  clearForm(): void {
    this.editingId = "";
    this.form = {
      clientId: "",
      equipmentId: "",
      operatorId: "",
      startDate: "",
      endDate: "",
      location: "",
      rate: 0,
      status: "new",
      notes: "",
    };
  }
}
