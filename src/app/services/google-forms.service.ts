import { Injectable, signal, inject } from "@angular/core";
import { DbService } from "./db.service";
import { UtilsService } from "./utils.service";
import { GoogleFormResponse } from "../models/crm.models";

@Injectable({ providedIn: "root" })
export class GoogleFormsService {
  readonly syncStatus = signal<{ kind: "ok" | "error"; text: string }>({
    kind: "ok",
    text: "",
  });
  private syncInFlight = false;
  private db = inject(DbService);
  private utils = inject(UtilsService);

  saveIntegrationSettings(url: string, autoSync: boolean): void {
    const integ = {
      ...this.db.integrations(),
      googleFormsUrl: url,
      autoSync,
      lastSyncStatus: "Настройки сохранены.",
    };
    this.db.saveIntegrations(integ);
    this.refreshStatus();
  }

  refreshStatus(): void {
    const integ = this.db.integrations();
    if (integ.lastSyncAt) {
      const details = `${integ.lastSyncStatus} Последняя синхронизация: ${new Date(integ.lastSyncAt).toLocaleString("uk-UA")}.`;
      this.syncStatus.set({
        kind: integ.lastSyncStatus.startsWith("Ошибка") ? "error" : "ok",
        text: details,
      });
    } else if (integ.lastSyncStatus) {
      this.syncStatus.set({ kind: "ok", text: integ.lastSyncStatus });
    } else {
      this.syncStatus.set({ kind: "ok", text: "" });
    }
  }

  sync(manual: boolean): void {
    const url = (this.db.integrations().googleFormsUrl || "").trim();
    if (!url) {
      this.syncStatus.set({
        kind: "error",
        text: "Сначала укажи URL Apps Script Web App.",
      });
      return;
    }
    if (this.syncInFlight) return;
    this.syncInFlight = true;
    this.syncStatus.set({
      kind: "ok",
      text: "Идёт загрузка заявок из Google Sheets...",
    });

    const callbackName = `crmGoogleFormsCallback_${Date.now()}`;
    (window as any)[callbackName] = (payload: any) => {
      try {
        if (payload?.error) throw new Error(payload.error);
        this.importResponses(
          Array.isArray(payload?.items) ? payload.items : [],
        );
      } catch (err: any) {
        const integ = {
          ...this.db.integrations(),
          lastSyncAt: new Date().toISOString(),
          lastSyncStatus: `Ошибка: ${err.message}`,
        };
        this.db.saveIntegrations(integ);
        this.refreshStatus();
      } finally {
        this.syncInFlight = false;
        delete (window as any)[callbackName];
      }
    };

    const script = document.createElement("script");
    const sep = url.includes("?") ? "&" : "?";
    script.src = `${url}${sep}callback=${callbackName}&t=${Date.now()}${manual ? "&manual=1" : ""}`;
    script.async = true;
    script.onerror = () => {
      this.syncInFlight = false;
      delete (window as any)[callbackName];
      const integ = {
        ...this.db.integrations(),
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: "Ошибка: не удалось загрузить данные.",
      };
      this.db.saveIntegrations(integ);
      this.refreshStatus();
    };
    document.body.appendChild(script);
  }

  private async importResponses(records: GoogleFormResponse[]): Promise<void> {
    let imported = 0,
      skipped = 0;
    const importedIds = [...this.db.integrations().importedResponseIds];

    for (const record of records) {
      const responseId = (record.responseId || "").trim();
      const startDate = (record.startDate || "").slice(0, 10);
      const endDate = (record.endDate || "").slice(0, 10);
      if (
        (responseId && importedIds.includes(responseId)) ||
        !record.clientName ||
        !startDate ||
        !endDate
      ) {
        skipped++;
        continue;
      }

      const clientId = await this.ensureClient(record);
      const equipmentId = this.findEquipmentId(record);
      const operatorId = this.findOperatorId(record);
      const notes = [
        (record.notes || "").trim(),
        !equipmentId && (record.equipmentCode || record.equipmentName)
          ? `Техника из формы: ${record.equipmentCode || record.equipmentName}`
          : "",
        responseId ? `Google Sheets ID: ${responseId}` : "Google Sheets import",
      ]
        .filter(Boolean)
        .join("\n");

      await this.db.insert("orders", {
        id: this.utils.uid("ord"),
        clientId,
        equipmentId,
        operatorId,
        startDate,
        endDate,
        location: (record.location || "").trim(),
        rate: Number(record.rate || 0),
        status: "new",
        notes,
      });
      if (responseId) importedIds.push(responseId);
      imported++;
    }

    const integ = {
      ...this.db.integrations(),
      importedResponseIds: importedIds,
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: imported
        ? `Импортировано: ${imported}. Пропущено: ${skipped}.`
        : `Новых заявок нет. Пропущено: ${skipped}.`,
    };
    await this.db.saveIntegrations(integ);
    this.refreshStatus();
  }

  private findEquipmentId(record: GoogleFormResponse): string {
    const code = this.utils.normalizeText(record.equipmentCode);
    const name = this.utils.normalizeText(record.equipmentName);
    return (
      this.db
        .equipment()
        .find(
          (item) =>
            (code && this.utils.normalizeText(item.code) === code) ||
            (name && this.utils.normalizeText(item.name) === name),
        )?.id || ""
    );
  }

  private findOperatorId(record: GoogleFormResponse): string {
    const name = this.utils.normalizeText(record.operatorName);
    return name
      ? this.db
          .operators()
          .find((item) => this.utils.normalizeText(item.name) === name)?.id ||
          ""
      : "";
  }

  private async ensureClient(record: GoogleFormResponse): Promise<string> {
    const phone = this.utils.normalizeText(record.clientPhone);
    const name = (record.clientName || "").trim();
    const existing = this.db
      .clients()
      .find(
        (item) =>
          (phone && this.utils.normalizeText(item.phone) === phone) ||
          (name &&
            this.utils.normalizeText(item.name) ===
              this.utils.normalizeText(name)),
      );
    if (existing) return existing.id;
    const client = await this.db.insert("clients", {
      id: this.utils.uid("cl"),
      name: name || "Новый клиент",
      phone: (record.clientPhone || "").trim(),
      source: (
        record.clientSource ||
        record.sourceLabel ||
        "Google Sheets"
      ).trim(),
      type: "Разовый",
      notes: (record.clientNotes || "").trim(),
    });
    return client.id;
  }
}
