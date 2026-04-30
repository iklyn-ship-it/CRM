import { Component, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { StateService } from "../../services/state.service";
import { DbService } from "../../services/db.service";
import { UtilsService } from "../../services/utils.service";
import { Client } from "../../models/crm.models";

@Component({
  selector: "app-clients",
  standalone: true,
  imports: [FormsModule],
  templateUrl: "./clients.component.html",
  styleUrl: "./clients.component.css",
})
export class ClientsComponent {
  state = inject(StateService);
  db = inject(DbService);
  utils = inject(UtilsService);

  formOpen = signal(false);
  editingId = "";
  form = { name: "", phone: "", source: "", type: "Разовый", notes: "" };

  duplicateName(): Client | null {
    const name = this.normalizeText(this.form.name);
    if (!name) return null;
    return (
      this.state
        .clients()
        .find(
          (client) =>
            client.id !== this.editingId &&
            this.normalizeText(client.name) === name,
        ) || null
    );
  }

  duplicatePhone(): Client | null {
    const phone = this.normalizePhone(this.form.phone);
    if (!phone) return null;
    return (
      this.state
        .clients()
        .find(
          (client) =>
            client.id !== this.editingId &&
            this.normalizePhone(client.phone) === phone,
        ) || null
    );
  }

  hasDuplicate(): boolean {
    return Boolean(this.duplicateName()) || Boolean(this.duplicatePhone());
  }

  private normalizeText(value: string): string {
    return (value || "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  private normalizePhone(value: string): string {
    return (value || "").replace(/\D/g, "");
  }

  clientOrders(clientId: string) {
    return this.state.orders().filter((o) => o.clientId === clientId);
  }
  clientIncome(clientId: string) {
    return this.clientOrders(clientId).reduce(
      (s, o) => s + this.state.orderIncome(o.id),
      0,
    );
  }
  clientProfit(clientId: string) {
    return this.clientOrders(clientId).reduce(
      (s, o) => s + this.state.orderProfit(o.id),
      0,
    );
  }

  async save(): Promise<void> {
    if (!this.form.name) return;
    if (this.hasDuplicate()) return;
    if (this.editingId)
      await this.db.update("clients", this.editingId, this.form);
    else
      await this.db.insert("clients", {
        id: this.utils.uid("cl"),
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

  edit(c: Client): void {
    this.editingId = c.id;
    this.form = {
      name: c.name,
      phone: c.phone,
      source: c.source,
      type: c.type,
      notes: c.notes,
    };
    this.formOpen.set(true);
  }

  async remove(id: string): Promise<void> {
    if (!confirm("Удалить клиента и связанные заявки?")) return;
    const orderIds = this.state
      .orders()
      .filter((o) => o.clientId === id)
      .map((o) => o.id);
    for (const oid of orderIds) await this.db.remove("orders", oid);
    await this.db.remove("clients", id);
    this.clearForm();
  }

  clearForm(): void {
    this.editingId = "";
    this.form = { name: "", phone: "", source: "", type: "Разовый", notes: "" };
  }
}
