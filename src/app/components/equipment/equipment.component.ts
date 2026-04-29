import { Component, computed, inject, signal } from "@angular/core";
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

  typeFilter = signal("");
  editingId = "";
  form = {
    name: "",
    type: "",
    code: "",
    defaultRate: 0,
    status: "free" as Equipment["status"],
  };
  readonly googleFormEquipmentNames = [
    "Автокран BUMAR 40т 43m HYDROS DST 0402 s/n 950098",
    "Автокран BUMAR 40т HYDROS DST 0401 т.п. СТТ №575455",
    "Автокран 25т Машека на базе МАЗ 6303 (КС55727-7-12) тп СХО 357338 стара",
    "Автокран 25т Машека на базе МАЗ 6312в3 (КС55727-7-12) №СХТ687648 нова",
    "Кран гусеничный РДК 400 40т",
    "Кран гусеничный ДЕК-631 63т. Зав. Ном. 206",
    "Кран гусеничный МКГ-25-01 А 25т. Зав. Ном. 207",
    "Кран гусеничный МКГ-25-01 А 25т. Зав. Ном. 104",
    "Кран гусеничный МКГ-25 - БР 25т. Зав. Ном.",
    "Кран гусеничный МКГ-25 - БР 25т. Зав. Ном. 1198",
    "Кран гусеничный МКГ-25 - БР 25т. Зав. Ном..",
    "Кран гусеничный МКГ-25 - БР 25т. Зав. Ном. 211",
    "Кран гусеничный МКГ-25 - БР 25т. Зав. № 381 Ном. готівковий Свваебойка",
    "Подъемник ножничный Genia 3229 електричка 11m 240kg",
    "Подъемник ножничный GENIE GS 3268",
    "Подъемник ножничный GENIE GS 5390 RT 18m 680kg",
    "Подъемник ножнечный SKYJET SJ9250 №51429 жолтый",
    "Подъемник ножнечный SKYJET SJ9250 №51835 синий",
    "Подъемник локтевой GENIE 45/25 BOON 11m 240kg №Z452507-33685",
    "Подъемник стреловой Haulotte HA16 ТPX №TD104351 15,3m 230rg",
    "Подъемник локтевой Haulotte HA16 SPX №AD11117915,3m 230rg",
    "Экскаватор гусеничный №ТП ЕЕ 208758 Doosan DX225LC",
    "Экскаватор Komatsu WB93S-5",
    "Экскаватор HYUNDAI ROBEX 140 w-9",
    "Екскаватор гусеничний JCB JS131LC Держ № 95344 АА",
    "Екскаватор-навантажувач CASE 770 EX-4WD №42051AI",
    "Екскаватор-навантажувач CASE 770 EX-4WD №97808АА",
    "Екскаватор гусеничний VOLVO ECR35D",
    "Бульдозер Komatsu D61РХ-15",
    "Бульдозер ХСMG TY160 №44438АІ",
    "Коток BOMAG BW 211 D-40",
    "Коток BOMAG BW 100 AMD-2 №101460623209",
    "Коток ґрунтовий CASE 1110 EX-D",
    "Погрузчик VOLVO MC70B №VCEMC70B706101900",
    "Навантажувач телескопічний  JCB 530-120",
    "Навантажувач телескопічний  JCB 530-110 cер №SLP53011TE0576366 1995р в б.в.",
    "Навантажувач телескопічний JCB 533-105 № 37190АМ",
    "Башенный кран Либхер 5т №16336633",
  ];

  duplicateName(): Equipment | null {
    const name = this.normalizeText(this.form.name);
    if (!name) return null;
    return (
      this.state
        .equipment()
        .find(
          (eq) =>
            eq.id !== this.editingId && this.normalizeText(eq.name) === name,
        ) || null
    );
  }

  private normalizeText(value: string): string {
    return (value || "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  readonly equipmentTypes = computed(() => {
    const types = this.state
      .equipment()
      .map((eq) => (eq.type || "").trim())
      .filter(Boolean);
    return Array.from(new Set(types)).sort((a, b) => a.localeCompare(b));
  });

  readonly filteredEquipment = computed(() => {
    const type = this.typeFilter();
    return this.state
      .equipment()
      .filter((eq) => !type || (eq.type || "").trim() === type);
  });

  missingGoogleFormEquipment(): string[] {
    const existing = new Set(
      this.state.equipment().map((eq) => this.normalizeText(eq.name)),
    );
    return this.googleFormEquipmentNames.filter(
      (name) => !existing.has(this.normalizeText(name)),
    );
  }

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
    if (this.duplicateName()) return;
    if (this.editingId)
      await this.db.update("equipment", this.editingId, this.form);
    else
      await this.db.insert("equipment", {
        id: this.utils.uid("eq"),
        ...this.form,
      });
    this.clearForm();
  }

  async importGoogleFormEquipment(): Promise<void> {
    const missing = this.missingGoogleFormEquipment();
    if (!missing.length) {
      alert("Вся техника из Google Form уже есть в CRM.");
      return;
    }

    for (const name of missing) {
      await this.db.insert("equipment", {
        id: this.utils.uid("eq"),
        name,
        type: "Из Google Form",
        code: "",
        defaultRate: 0,
        status: "free",
      });
    }
    alert(`Добавлено техники: ${missing.length}.`);
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
