import { Component, computed, inject, signal } from "@angular/core";
import { NgClass } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import {
  CommercialProposalDraft,
  CommercialProposalService,
  ProposalRow,
} from "../../services/commercial-proposal.service";
import { StateService } from "../../services/state.service";
import { DbService } from "../../services/db.service";
import { UtilsService } from "../../services/utils.service";
import { Transport, TransportStatus } from "../../models/crm.models";
import { EquipmentPickerComponent } from "../equipment-picker/equipment-picker.component";

@Component({
  selector: "app-transports",
  standalone: true,
  imports: [FormsModule, NgClass, EquipmentPickerComponent],
  templateUrl: "./transports.component.html",
  styleUrl: "./transports.component.css",
})
export class TransportsComponent {
  state = inject(StateService);
  db = inject(DbService);
  utils = inject(UtilsService);
  proposal = inject(CommercialProposalService);
  sanitizer = inject(DomSanitizer);

  search = signal("");
  filterStatus = signal("");
  transportScope = signal<"active" | "deferred" | "completed">("active");
  formOpen = signal(false);
  selectedTransportId = signal("");
  invoiceEditorOpen = signal(false);
  documentPreviewUrl = signal<SafeResourceUrl | null>(null);
  private documentPreviewObjectUrl = "";
  editingId = "";
  invoiceDraft: CommercialProposalDraft | null = null;

  form = this.emptyForm();

  readonly statuses: { value: TransportStatus; label: string }[] = [
    { value: "new", label: "Новая" },
    { value: "active", label: "В работе" },
    { value: "completed", label: "Завершена" },
    { value: "cancelled", label: "Отменена" },
  ];

  readonly filteredTransports = computed(() => {
    const q = this.search().trim().toLowerCase();
    const status = this.filterStatus();
    let rows = [...this.state.transports()];
    const scope = this.transportScope();
    if (scope === "deferred") {
      rows = rows.filter((item) => item.deferred);
    } else if (scope === "completed") {
      rows = rows.filter(
        (item) => !item.deferred && item.status === "completed",
      );
    } else {
      rows = rows.filter(
        (item) => !item.deferred && item.status !== "completed",
      );
    }
    if (status) rows = rows.filter((item) => item.status === status);
    if (q) {
      rows = rows.filter((item) =>
        [
          item.shipper,
          item.consignee,
          this.clientName(item.shipperClientId),
          this.clientName(item.consigneeClientId),
          item.loadingPoint,
          item.unloadingPoint,
          item.cargoName,
          item.notes,
          this.equipmentName(item.equipmentId),
          this.driverName(item.driverId),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    return rows.sort((a, b) => b.startDate.localeCompare(a.startDate));
  });

  readonly selectedTransport = computed(() =>
    this.state.byId(this.state.transports(), this.selectedTransportId()),
  );

  switchTransportScope(scope: "active" | "deferred" | "completed"): void {
    this.transportScope.set(scope);
    this.closeTransport();
  }

  readonly transportEquipmentConflictSet = computed(() => {
    const orderConflicts = this.state
      .orderTransportConflicts()
      .map(([, transportId]) => transportId);
    const transportConflicts = this.state
      .transportConflicts()
      .flatMap(([firstId, secondId]) => [firstId, secondId]);
    return new Set([...orderConflicts, ...transportConflicts]);
  });

  readonly transportOperatorConflictSet = computed(() => {
    const orderConflicts = this.state
      .orderTransportOperatorConflicts()
      .map(([, transportId]) => transportId);
    const transportConflicts = this.state
      .transportOperatorConflicts()
      .flatMap(([firstId, secondId]) => [firstId, secondId]);
    return new Set([...orderConflicts, ...transportConflicts]);
  });

  trawlEquipment() {
    return this.state
      .equipment()
      .filter((eq) => (eq.type || "").trim().toLowerCase().includes("трал"));
  }

  drivers() {
    return this.state
      .operators()
      .filter((operator) => operator.workStatus !== "dismissed");
  }

  recalcPickup(): void {
    this.form.pickupCost =
      Number(this.form.pickupKm || 0) * Number(this.form.pickupPricePerKm || 0);
  }

  recalcDelivery(): void {
    this.form.deliveryCost =
      Number(this.form.deliveryKm || 0) *
      Number(this.form.deliveryPricePerKm || 0);
  }

  transportTotal(item = this.form): number {
    return Number(item.pickupCost || 0) + Number(item.deliveryCost || 0);
  }

  statusLabel(status: string): string {
    return (
      {
        new: "Новая",
        active: "В работе",
        completed: "Завершена",
        cancelled: "Отменена",
      }[status] || status
    );
  }

  statusBadgeClass(status: string): string {
    return (
      {
        new: "new",
        active: "active",
        completed: "completed",
        cancelled: "cancelled",
      }[status] || "new"
    );
  }

  equipmentName(id: string): string {
    return this.state.byId(this.state.equipment(), id)?.name || "—";
  }

  driverName(id: string): string {
    return this.state.byId(this.state.operators(), id)?.name || "—";
  }

  clientName(id: string): string {
    return this.state.byId(this.state.clients(), id)?.name || "—";
  }

  shipperName(item: Transport): string {
    return item.shipperClientId
      ? this.clientName(item.shipperClientId)
      : item.shipper || "—";
  }

  consigneeName(item: Transport): string {
    return item.consigneeClientId
      ? this.clientName(item.consigneeClientId)
      : item.consignee || "—";
  }

  openCreate(): void {
    this.clearForm();
    this.selectedTransportId.set("");
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.clearForm();
    this.formOpen.set(false);
    this.selectedTransportId.set("");
  }

  edit(item: Transport): void {
    this.selectedTransportId.set(item.id);
    this.editingId = item.id;
    this.form = {
      shipperClientId: item.shipperClientId || "",
      consigneeClientId: item.consigneeClientId || "",
      shipper: item.shipper || "",
      consignee: item.consignee || "",
      startDate: item.startDate || "",
      endDate: item.endDate || "",
      loadingPoint: item.loadingPoint || "",
      unloadingPoint: item.unloadingPoint || "",
      equipmentId: item.equipmentId || "",
      driverId: item.driverId || "",
      cargoName: item.cargoName || "",
      notes: item.notes || "",
      status: item.status || "new",
      deferred: Boolean(item.deferred),
      pickupPricePerKm: Number(item.pickupPricePerKm || 50),
      deliveryPricePerKm: Number(item.deliveryPricePerKm || 250),
      pickupKm: Number(item.pickupKm || 0),
      deliveryKm: Number(item.deliveryKm || 0),
      pickupCost: Number(item.pickupCost || 0),
      deliveryCost: Number(item.deliveryCost || 0),
    };
    this.formOpen.set(true);
  }

  setFormStatus(status: TransportStatus): void {
    this.form.status = status;
  }

  async completeTransport(): Promise<void> {
    this.form.status = "completed";
    this.form.deferred = false;
    await this.save();
  }

  async setTransportDeferred(
    item: Transport,
    deferred: boolean,
  ): Promise<void> {
    try {
      await this.db.update("transports", item.id, { deferred });
      if (this.selectedTransportId() === item.id) {
        this.form.deferred = deferred;
      }
    } catch (error) {
      alert(this.saveErrorMessage(error));
    }
  }

  closeTransport(): void {
    this.closeInvoiceEditor();
    this.closeForm();
  }

  async save(): Promise<void> {
    if (!this.form.startDate || !this.form.endDate) return;
    if (!this.form.shipperClientId || !this.form.consigneeClientId) {
      alert("Выбери грузоотправителя и грузополучателя из клиентов.");
      return;
    }
    if (this.form.startDate > this.form.endDate) {
      alert("Дата начала перевозки не может быть позже даты окончания.");
      return;
    }
    const conflictWarnings = this.transportConflictWarnings();
    if (conflictWarnings.length) {
      alert(conflictWarnings.join("\n"));
      return;
    }
    try {
      if (this.editingId) {
        await this.db.update("transports", this.editingId, this.form);
      } else {
        await this.db.insert("transports", {
          id: this.utils.sequentialId(
            "P",
            this.state.transports().map((transport) => transport.id),
          ),
          ...this.form,
        });
      }
    } catch (error) {
      alert(this.saveErrorMessage(error));
      return;
    }
    this.closeForm();
  }

  async remove(id: string): Promise<void> {
    if (!confirm("Удалить перевозку?")) return;
    try {
      await this.db.remove("transports", id);
      if (this.selectedTransportId() === id) {
        this.closeTransport();
      }
    } catch (error) {
      alert(this.saveErrorMessage(error));
    }
  }

  openInvoiceEditor(item: Transport): void {
    this.invoiceDraft = this.proposal.createTransportInvoiceDraft(item);
    this.invoiceEditorOpen.set(true);
  }

  closeInvoiceEditor(): void {
    this.invoiceEditorOpen.set(false);
    this.closeDocumentPreview();
    this.invoiceDraft = null;
  }

  addInvoiceRow(): void {
    this.invoiceDraft?.rows.push({
      title: "Додаткова позиція",
      details: "",
      amount: 0,
    });
  }

  removeInvoiceRow(index: number): void {
    this.invoiceDraft?.rows.splice(index, 1);
  }

  addInvoiceTerm(): void {
    this.invoiceDraft?.terms.push("");
  }

  removeInvoiceTerm(index: number): void {
    this.invoiceDraft?.terms.splice(index, 1);
  }

  invoiceTotal(draft: CommercialProposalDraft): number {
    return this.proposal.total(draft);
  }

  openInvoicePreview(draft: CommercialProposalDraft): void {
    this.closeDocumentPreview();
    this.documentPreviewObjectUrl = this.proposal.createPdfPreviewUrl(draft);
    this.documentPreviewUrl.set(
      this.sanitizer.bypassSecurityTrustResourceUrl(
        this.documentPreviewObjectUrl,
      ),
    );
  }

  closeDocumentPreview(): void {
    if (this.documentPreviewObjectUrl) {
      URL.revokeObjectURL(this.documentPreviewObjectUrl);
      this.documentPreviewObjectUrl = "";
    }
    this.documentPreviewUrl.set(null);
  }

  printDocumentPreview(frame: HTMLIFrameElement): void {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  }

  trackInvoiceRow(index: number, row: ProposalRow): string {
    return `${index}-${row.title}`;
  }

  clearForm(): void {
    this.editingId = "";
    this.form = this.emptyForm();
  }

  private emptyForm() {
    return {
      shipper: "",
      consignee: "",
      shipperClientId: "",
      consigneeClientId: "",
      startDate: "",
      endDate: "",
      loadingPoint: "",
      unloadingPoint: "",
      equipmentId: "",
      driverId: "",
      cargoName: "",
      notes: "",
      status: "new" as TransportStatus,
      deferred: false,
      pickupPricePerKm: 50,
      deliveryPricePerKm: 250,
      pickupKm: 0,
      deliveryKm: 0,
      pickupCost: 0,
      deliveryCost: 0,
    };
  }

  private transportConflictWarnings(): string[] {
    const draft = this.formDraftTransport();
    if (!this.state.transportBlocksSchedule(draft)) return [];
    const warnings: string[] = [];

    if (draft.equipmentId) {
      const orderConflict = this.state
        .orders()
        .find(
          (order) =>
            this.state.orderBlocksSchedule(order) &&
            this.state
              .orderEquipmentReservationIds(order)
              .includes(draft.equipmentId) &&
            this.state.orderTransportOverlapByEquipment(
              order,
              draft,
              draft.equipmentId,
            ),
        );
      if (orderConflict) {
        warnings.push(
          `Трал занят в заявке: ${this.clientName(orderConflict.clientId)}, ${this.utils.fmtDate(orderConflict.startDate)} - ${this.utils.fmtDate(orderConflict.endDate)}.`,
        );
      }

      const transportConflict = this.state
        .transports()
        .find(
          (transport) =>
            transport.id !== this.editingId &&
            transport.equipmentId === draft.equipmentId &&
            this.state.transportsOverlap(transport, draft),
        );
      if (transportConflict) {
        warnings.push(
          `Трал занят в другой перевозке: ${this.shipperName(transportConflict)} → ${this.consigneeName(transportConflict)}, ${this.utils.fmtDate(transportConflict.startDate)} - ${this.utils.fmtDate(transportConflict.endDate)}.`,
        );
      }
    }

    if (draft.driverId) {
      const orderConflict = this.state
        .orders()
        .find(
          (order) =>
            this.state.orderBlocksSchedule(order) &&
            this.state.orderOperatorIds(order).includes(draft.driverId) &&
            this.state.orderTransportOverlapByOperator(
              order,
              draft,
              draft.driverId,
            ),
        );
      if (orderConflict) {
        warnings.push(
          `Водитель/оператор занят в заявке: ${this.clientName(orderConflict.clientId)}, ${this.utils.fmtDate(orderConflict.startDate)} - ${this.utils.fmtDate(orderConflict.endDate)}.`,
        );
      }

      const transportConflict = this.state
        .transports()
        .find(
          (transport) =>
            transport.id !== this.editingId &&
            transport.driverId === draft.driverId &&
            this.state.transportsOverlap(transport, draft),
        );
      if (transportConflict) {
        warnings.push(
          `Водитель занят в другой перевозке: ${this.shipperName(transportConflict)} → ${this.consigneeName(transportConflict)}, ${this.utils.fmtDate(transportConflict.startDate)} - ${this.utils.fmtDate(transportConflict.endDate)}.`,
        );
      }
    }

    return warnings;
  }

  formDraftTransport(): Transport {
    return {
      id: this.editingId || "draft",
      createdAt: "",
      ...this.form,
    };
  }

  private saveErrorMessage(error: unknown): string {
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message || "")
        : "";
    if (message.includes("deferred")) {
      return "База Supabase еще не готова для отложенных перевозок. Выполни SQL-файл supabase-transport-deferred.sql в Supabase SQL Editor и попробуй снова.";
    }
    if (message.includes("transports")) {
      return "База Supabase еще не готова для перевозок. Выполни SQL-файл supabase-transports.sql в Supabase SQL Editor и попробуй снова.";
    }
    return message
      ? `Не удалось сохранить перевозку: ${message}`
      : "Не удалось сохранить перевозку.";
  }
}
