import { Component, computed, signal, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { NgClass, SlicePipe } from "@angular/common";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import { StateService } from "../../services/state.service";
import { DbService } from "../../services/db.service";
import { UtilsService } from "../../services/utils.service";
import { Repair, RepairStatus } from "../../models/crm.models";
import { EquipmentPickerComponent } from "../equipment-picker/equipment-picker.component";

@Component({
  selector: "app-repairs",
  standalone: true,
  imports: [FormsModule, NgClass, SlicePipe, EquipmentPickerComponent],
  templateUrl: "./repairs.component.html",
  styleUrl: "./repairs.component.css",
})
export class RepairsComponent {
  state = inject(StateService);
  db = inject(DbService);
  utils = inject(UtilsService);
  sanitizer = inject(DomSanitizer);

  search = signal("");
  filterStatus = signal("");
  formOpen = signal(false);
  documentPreviewUrl = signal<SafeResourceUrl | null>(null);
  private documentPreviewObjectUrl = "";
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

  openRepairDocument(): void {
    const html = this.repairDocumentHtml(this.filteredRepairs());
    this.closeDocumentPreview();
    this.documentPreviewObjectUrl = URL.createObjectURL(
      new Blob([html], { type: "text/html;charset=utf-8" }),
    );
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

  private repairDocumentHtml(repairs: Repair[]): string {
    const totalLabor = repairs.reduce((sum, r) => sum + Number(r.laborCost || 0), 0);
    const totalParts = repairs.reduce((sum, r) => sum + Number(r.partsCost || 0), 0);
    const total = totalLabor + totalParts;
    const statusText =
      this.filterStatus() ? this.statusLabel(this.filterStatus()) : "Все статусы";
    const rows = repairs
      .map(
        (r, index) => `<tr>
          <td>${index + 1}</td>
          <td>${this.html(r.id.slice(-5))}</td>
          <td>
            <strong>${this.html(this.eqName(r.equipmentId))}</strong>
            <div class="muted">${this.html(this.statusLabel(r.status))}</div>
          </td>
          <td>${this.html(this.utils.fmtDate(r.startDate))}<br /><span class="muted">${this.html(this.utils.fmtDate(r.endDate))} • ${this.utils.daysInclusive(r.startDate, r.endDate)} дн.</span></td>
          <td>${this.html(r.tasks || "—")}</td>
          <td>${this.html(r.responsible || "—")}</td>
          <td class="money">${this.html(this.utils.money(r.laborCost || 0))}</td>
          <td class="money">${this.html(this.utils.money(r.partsCost || 0))}</td>
          <td class="money"><strong>${this.html(this.utils.money(this.repairTotal(r)))}</strong></td>
          <td>${this.html(r.notes || "—")}</td>
        </tr>`,
      )
      .join("");

    return `<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8" />
  <title>Звіт по ремонтах</title>
  <style>
    :root { --ink: #172033; --muted: #697386; --line: #d8dee9; --brand: #15386f; --soft: #eef4ff; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #e8edf5; color: var(--ink); font-family: Arial, sans-serif; }
    .toolbar { position: sticky; top: 0; z-index: 2; display: flex; justify-content: flex-end; gap: 10px; padding: 10px 14px; background: #111827; }
    .toolbar button { border: 0; border-radius: 10px; padding: 10px 14px; font-weight: 800; cursor: pointer; color: #fff; background: #16a34a; }
    .toolbar button.secondary { background: #334155; }
    .page { width: 297mm; min-height: 210mm; margin: 18px auto; padding: 18mm; background: #fff; box-shadow: 0 18px 50px rgba(15, 23, 42, .18); }
    header { display: grid; grid-template-columns: 1fr 1.3fr; gap: 24px; align-items: end; padding-bottom: 14px; border-bottom: 3px solid #c7ceda; }
    .logo { font-size: 48px; font-weight: 900; letter-spacing: -5px; color: #c2c9d4; line-height: .85; }
    .logo span { color: #b7cdf8; }
    .company { margin-top: 12px; color: var(--muted); font-weight: 700; font-size: 13px; line-height: 1.45; }
    .address { text-align: right; color: var(--muted); font-weight: 700; font-size: 13px; line-height: 1.45; }
    h1 { margin: 24px 0 4px; color: var(--brand); text-align: center; font-size: 30px; }
    .subtitle { margin: 0 0 18px; text-align: center; color: var(--muted); }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; }
    .summary-card { padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--soft); }
    .summary-card .label { color: var(--muted); font-size: 12px; font-weight: 700; }
    .summary-card .value { margin-top: 6px; font-size: 20px; font-weight: 900; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th { background: var(--brand); color: #fff; text-align: left; font-size: 11px; letter-spacing: .03em; text-transform: uppercase; }
    th, td { border: 1px solid var(--line); padding: 8px; vertical-align: top; font-size: 12px; overflow-wrap: anywhere; }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    .muted { color: var(--muted); font-size: 11px; }
    .money { text-align: right; white-space: nowrap; }
    .empty { padding: 24px; text-align: center; color: var(--muted); border: 1px dashed var(--line); border-radius: 12px; }
    footer { margin-top: 22px; padding-top: 12px; border-top: 2px solid #c7ceda; color: var(--muted); font-size: 12px; display: flex; justify-content: space-between; }
    @media print {
      body { background: #fff; }
      .toolbar { display: none; }
      .page { width: auto; min-height: auto; margin: 0; padding: 12mm; box-shadow: none; }
      tr { page-break-inside: avoid; }
    }
    @media (max-width: 900px) {
      .page { width: 100%; margin: 0; padding: 16px; }
      header, .summary { grid-template-columns: 1fr; }
      .address { text-align: left; }
      table { min-width: 1100px; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button type="button" onclick="window.print()">Печать / PDF</button>
    <button type="button" class="secondary" onclick="window.close()">Закрыть</button>
  </div>
  <main class="page">
    <header>
      <div>
        <div class="logo">R<span>B</span>T</div>
        <div class="company">ТОВ «РБТ-ГРУП»<br />код ЄДРПОУ 37360626</div>
      </div>
      <div class="address">Місцезнаходження: 08292, Київська обл.,<br />Бучанський р-н, м. Буча, вул. Тячівська, буд.1</div>
    </header>
    <h1>Звіт по ремонтах</h1>
    <p class="subtitle">Сформовано ${this.html(this.utils.fmtDate(this.utils.todayStr()))} • Фільтр: ${this.html(statusText)}</p>
    <section class="summary">
      <div class="summary-card"><div class="label">Ремонтів у документі</div><div class="value">${repairs.length}</div></div>
      <div class="summary-card"><div class="label">Вартість робіт</div><div class="value">${this.html(this.utils.money(totalLabor))}</div></div>
      <div class="summary-card"><div class="label">Вартість запчастин</div><div class="value">${this.html(this.utils.money(totalParts))}</div></div>
      <div class="summary-card"><div class="label">Разом</div><div class="value">${this.html(this.utils.money(total))}</div></div>
    </section>
    ${
      repairs.length
        ? `<table>
      <thead>
        <tr>
          <th style="width: 34px">№</th>
          <th style="width: 58px">ID</th>
          <th style="width: 180px">Техніка</th>
          <th style="width: 105px">Період</th>
          <th>Роботи</th>
          <th style="width: 130px">Відповідальний</th>
          <th style="width: 95px">Роботи</th>
          <th style="width: 95px">Запчастини</th>
          <th style="width: 95px">Сума</th>
          <th>Коментар</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
        : `<div class="empty">За поточним фільтром ремонтів немає.</div>`
    }
    <footer>
      <span>trans@rbt-group.com.ua</span>
      <span>+38(068) 968 44 28</span>
    </footer>
  </main>
</body>
</html>`;
  }

  private html(value: unknown): string {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
