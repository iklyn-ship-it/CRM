import { Injectable, signal, WritableSignal, inject } from "@angular/core";
import { SupabaseService } from "./supabase.service";
import { RealtimeChannel } from "@supabase/supabase-js";
import {
  Client,
  Equipment,
  Operator,
  Order,
  Repair,
  FinanceOperation,
  AuditLog,
  AuditLogChange,
  Integrations,
} from "../models/crm.models";

/** Maps camelCase model fields to snake_case DB columns and back */
function toSnake(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase())] = v;
  }
  return out;
}

function toCamel(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  return out;
}

@Injectable({ providedIn: "root" })
export class DbService {
  private supa = inject(SupabaseService);
  private channels: RealtimeChannel[] = [];
  private readonly sharedTables = [
    "clients",
    "equipment",
    "operators",
    "orders",
    "repairs",
    "operations",
    "audit_logs",
  ] as const;
  private readonly auditableTables = [
    "clients",
    "equipment",
    "operators",
    "orders",
    "repairs",
    "operations",
    "integrations",
  ] as const;

  readonly clients = signal<Client[]>([]);
  readonly equipment = signal<Equipment[]>([]);
  readonly operators = signal<Operator[]>([]);
  readonly orders = signal<Order[]>([]);
  readonly repairs = signal<Repair[]>([]);
  readonly operations = signal<FinanceOperation[]>([]);
  readonly auditLogs = signal<AuditLog[]>([]);
  readonly integrations = signal<Integrations>({
    googleFormsUrl: "",
    autoSync: false,
    importedResponseIds: [],
    lastSyncAt: "",
    lastSyncStatus: "",
  });
  readonly userSettings = signal<{
    chartMode: string;
    calendarMode: string;
    calendarDate: string;
  }>({
    chartMode: "bars",
    calendarMode: "month",
    calendarDate: "",
  });

  readonly loading = signal(false);

  private normalizeOperator(row: any): Operator {
    const operator = toCamel(row) as any;
    return {
      ...operator,
      workStatus: operator.workStatus || "active",
    } as Operator;
  }

  private normalizeOrder(row: any): Order {
    const order = toCamel(row) as any;
    const fallbackDistance = Number(order.logisticsDeliveryKm || 0);
    const fallbackCost =
      Number(order.logisticsPickupCost || 0) +
      Number(order.logisticsDeliveryCost || 0);
    const logisticsDistanceKm = Number(
      order.logisticsDistanceKm || fallbackDistance,
    );
    const logisticsCost = Number(order.logisticsCost || fallbackCost);
    return {
      ...order,
      equipmentIdleDates: Array.isArray(order.equipmentIdleDates)
        ? order.equipmentIdleDates
        : [],
      operatorIdleDates: Array.isArray(order.operatorIdleDates)
        ? order.operatorIdleDates
        : [],
      logisticsEnabled: Boolean(order.logisticsEnabled),
      logisticsProvider: order.logisticsProvider || "own_trawl",
      logisticsTrailerId: order.logisticsTrailerId || "",
      logisticsStartDate: order.logisticsStartDate || order.startDate || "",
      logisticsEndDate: order.logisticsEndDate || order.endDate || "",
      logisticsDistanceKm,
      logisticsPricePerKm: Number(
        order.logisticsPricePerKm ||
          (logisticsDistanceKm ? logisticsCost / logisticsDistanceKm : 0),
      ),
      logisticsCost,
      logisticsPickupKm: Number(order.logisticsPickupKm || 0),
      logisticsDeliveryKm: Number(order.logisticsDeliveryKm || 0),
      logisticsPickupCost: Number(order.logisticsPickupCost || 0),
      logisticsDeliveryCost: Number(order.logisticsDeliveryCost || 0),
    } as Order;
  }

  /** Load shared CRM data for all authenticated users. */
  async loadAll(): Promise<void> {
    this.loading.set(true);
    const uid = this.supa.userId;
    if (!uid) {
      this.loading.set(false);
      return;
    }

    const [
      clients,
      equipment,
      operators,
      orders,
      repairs,
      operations,
      auditLogs,
      integ,
      settings,
    ] = await Promise.all([
      this.supa.client.from("clients").select("*"),
      this.supa.client.from("equipment").select("*"),
      this.supa.client.from("operators").select("*"),
      this.supa.client.from("orders").select("*"),
      this.supa.client.from("repairs").select("*"),
      this.supa.client.from("operations").select("*"),
      this.supa.client
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300),
      this.supa.client
        .from("integrations")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      this.supa.client
        .from("user_settings")
        .select("*")
        .eq("user_id", uid)
        .maybeSingle(),
    ]);

    this.clients.set((clients.data || []).map((r) => toCamel(r) as any));
    this.equipment.set((equipment.data || []).map((r) => toCamel(r) as any));
    this.operators.set((operators.data || []).map((r) => this.normalizeOperator(r)));
    this.orders.set((orders.data || []).map((r) => this.normalizeOrder(r)));
    this.repairs.set((repairs.data || []).map((r) => toCamel(r) as any));
    this.operations.set((operations.data || []).map((r) => toCamel(r) as any));
    this.auditLogs.set((auditLogs.data || []).map((r) => toCamel(r) as any));

    if (integ.data) {
      const d = toCamel(integ.data) as any;
      this.integrations.set({
        googleFormsUrl: d.googleSheetsUrl || "",
        autoSync: Boolean(d.autoSync),
        importedResponseIds: Array.isArray(d.importedResponseIds)
          ? d.importedResponseIds
          : [],
        lastSyncAt: d.lastSyncAt || "",
        lastSyncStatus: d.lastSyncStatus || "",
      });
    }

    if (settings.data) {
      const d = toCamel(settings.data) as any;
      this.userSettings.set({
        chartMode: d.chartMode || "bars",
        calendarMode: d.calendarMode || "month",
        calendarDate: d.calendarDate || "",
      });
    }

    this.loading.set(false);
  }

  /** Subscribe to realtime changes */
  subscribeRealtime(): void {
    this.unsubscribeRealtime();
    const uid = this.supa.userId;
    if (!uid) return;

    this.sharedTables.forEach((table) => {
      const ch = this.supa.client
        .channel(`${table}_shared`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table,
          },
          () => this.reloadTable(table),
        )
        .subscribe();
      this.channels.push(ch);
    });
  }

  unsubscribeRealtime(): void {
    this.channels.forEach((ch) => this.supa.client.removeChannel(ch));
    this.channels = [];
  }

  private async reloadTable(table: string): Promise<void> {
    const uid = this.supa.userId;
    if (!uid) return;
    const query =
      table === "audit_logs"
        ? this.supa.client
            .from(table)
            .select("*")
            .order("created_at", { ascending: false })
            .limit(300)
        : this.supa.client.from(table).select("*");
    const { data } = await query;
    const rows = (data || []).map((r) => toCamel(r) as any);
    const normalizedRows =
      table === "operators"
        ? (data || []).map((r) => this.normalizeOperator(r))
        : table === "orders"
          ? (data || []).map((r) => this.normalizeOrder(r))
        : rows;
    const signalMap: Record<string, WritableSignal<any[]>> = {
      clients: this.clients,
      equipment: this.equipment,
      operators: this.operators,
      orders: this.orders,
      repairs: this.repairs,
      operations: this.operations,
      audit_logs: this.auditLogs,
    };
    signalMap[table]?.set(normalizedRows);
  }

  // ---- Generic CRUD ----

  async insert(table: string, record: Record<string, any>): Promise<any> {
    const row = toSnake({ ...record, userId: this.supa.userId });
    let { data, error } = await this.supa.client
      .from(table)
      .insert(row)
      .select()
      .single();
    if (error && this.canRetryOrderWithoutFlexibleLogistics(table, error)) {
      const fallbackRow = this.withoutFlexibleLogisticsColumns(row);
      const retry = await this.supa.client
        .from(table)
        .insert(fallbackRow)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }
    if (error) throw error;
    await this.writeAuditLog(table, "create", null, toCamel(data));
    await this.reloadTable(table);
    return toCamel(data);
  }

  async update(
    table: string,
    id: string,
    changes: Record<string, any>,
  ): Promise<any> {
    const previous = this.getLocalRow(table, id);
    const row = toSnake(changes);
    delete row["id"];
    delete row["user_id"];
    let { data, error } = await this.supa.client
      .from(table)
      .update(row)
      .eq("id", id)
      .select()
      .single();
    if (error && this.canRetryOrderWithoutFlexibleLogistics(table, error)) {
      const fallbackRow = this.withoutFlexibleLogisticsColumns(row);
      const retry = await this.supa.client
        .from(table)
        .update(fallbackRow)
        .eq("id", id)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }
    if (error) throw error;
    await this.writeAuditLog(table, "update", previous, toCamel(data));
    await this.reloadTable(table);
    return toCamel(data);
  }

  async remove(table: string, id: string): Promise<void> {
    const previous = this.getLocalRow(table, id);
    const { error } = await this.supa.client.from(table).delete().eq("id", id);
    if (error) throw error;
    await this.writeAuditLog(table, "delete", previous, null);
    await this.reloadTable(table);
  }

  // ---- Integrations (single row per user) ----

  async saveIntegrations(integ: Integrations): Promise<void> {
    const uid = this.supa.userId;
    if (!uid) return;
    const { error } = await this.supa.client.from("integrations").upsert(
      {
        user_id: uid,
        google_sheets_url: integ.googleFormsUrl,
        auto_sync: integ.autoSync,
        imported_response_ids: integ.importedResponseIds,
        last_sync_at: integ.lastSyncAt,
        last_sync_status: integ.lastSyncStatus,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (!error) this.integrations.set(integ);
  }

  // ---- User settings (single row per user) ----

  async saveUserSettings(settings: {
    chartMode: string;
    calendarMode: string;
    calendarDate: string;
  }): Promise<void> {
    const uid = this.supa.userId;
    if (!uid) return;
    const { error } = await this.supa.client.from("user_settings").upsert(
      {
        user_id: uid,
        chart_mode: settings.chartMode,
        calendar_mode: settings.calendarMode,
        calendar_date: settings.calendarDate,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (!error) this.userSettings.set(settings);
  }

  /** Clear all local signals */
  clearAll(): void {
    this.clients.set([]);
    this.equipment.set([]);
    this.operators.set([]);
    this.orders.set([]);
    this.repairs.set([]);
    this.operations.set([]);
    this.auditLogs.set([]);
    this.integrations.set({
      googleFormsUrl: "",
      autoSync: false,
      importedResponseIds: [],
      lastSyncAt: "",
      lastSyncStatus: "",
    });
    this.userSettings.set({
      chartMode: "bars",
      calendarMode: "month",
      calendarDate: "",
    });
  }

  private getLocalRow(table: string, id: string): Record<string, any> | null {
    const rows = this.localRows(table);
    return rows.find((row: any) => row.id === id) || null;
  }

  private localRows(table: string): any[] {
    const signalMap: Record<string, () => any[]> = {
      clients: this.clients,
      equipment: this.equipment,
      operators: this.operators,
      orders: this.orders,
      repairs: this.repairs,
      operations: this.operations,
    };
    return signalMap[table]?.() || [];
  }

  private isAuditableTable(table: string): boolean {
    return (this.auditableTables as readonly string[]).includes(table);
  }

  private canRetryOrderWithoutFlexibleLogistics(table: string, error: any): boolean {
    return (
      table === "orders" &&
      error?.code === "42703" &&
      /logistics_(distance_km|price_per_km|cost)/.test(error?.message || "")
    );
  }

  private withoutFlexibleLogisticsColumns(
    row: Record<string, any>,
  ): Record<string, any> {
    const fallbackRow = { ...row };
    delete fallbackRow["logistics_distance_km"];
    delete fallbackRow["logistics_price_per_km"];
    delete fallbackRow["logistics_cost"];
    return fallbackRow;
  }

  private async writeAuditLog(
    table: string,
    action: AuditLog["action"],
    previous: Record<string, any> | null,
    next: Record<string, any> | null,
  ): Promise<void> {
    if (!this.isAuditableTable(table) || table === "audit_logs") return;

    try {
      const changes =
        action === "update" ? this.buildChanges(previous || {}, next || {}) : [];
      const payload = {
        id: this.supa.userId
          ? `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
          : "",
        user_id: this.supa.userId,
        actor_email: this.supa.user()?.email || "",
        entity_type: table,
        entity_id: String(next?.["id"] || previous?.["id"] || ""),
        entity_label: this.entityLabel(table, next || previous || {}),
        action,
        summary: this.buildSummary(table, action, next || previous || {}, changes),
        changes,
      };

      if (!payload.id || !payload.user_id) return;

      await this.supa.client.from("audit_logs").insert(payload);
    } catch {
      // Audit log should never break the main CRM action.
    }
  }

  private buildChanges(
    previous: Record<string, any>,
    next: Record<string, any>,
  ): AuditLogChange[] {
    const ignored = new Set([
      "id",
      "userId",
      "user_id",
      "createdAt",
      "created_at",
      "updatedAt",
      "updated_at",
    ]);
    const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
    return [...keys]
      .filter((key) => !ignored.has(key))
      .filter(
        (key) => JSON.stringify(previous[key] ?? "") !== JSON.stringify(next[key] ?? ""),
      )
      .map((key) => ({
        field: key,
        label: this.fieldLabel(key),
        from: this.stringifyValue(previous[key]),
        to: this.stringifyValue(next[key]),
      }))
      .slice(0, 12);
  }

  private buildSummary(
    table: string,
    action: AuditLog["action"],
    record: Record<string, any>,
    changes: AuditLogChange[],
  ): string {
    const entity = this.entityTitle(table);
    const label = this.entityLabel(table, record);
    if (action === "create") return `Создан ${entity}: ${label}`;
    if (action === "delete") return `Удален ${entity}: ${label}`;
    if (!changes.length) return `Обновлен ${entity}: ${label}`;
    return `Обновлен ${entity}: ${label} (${changes.map((c) => c.label).join(", ")})`;
  }

  private entityTitle(table: string): string {
    const labels: Record<string, string> = {
      clients: "клиент",
      equipment: "техника",
      operators: "оператор",
      orders: "заявка",
      repairs: "ремонт",
      operations: "финансовая операция",
      integrations: "интеграция",
    };
    return labels[table] || table;
  }

  private entityLabel(table: string, record: Record<string, any>): string {
    if (table === "clients") {
      return record["name"] || record["id"] || "без названия";
    }
    if (table === "equipment") {
      return record["name"] || record["code"] || record["id"] || "без названия";
    }
    if (table === "operators") {
      return record["name"] || record["id"] || "без имени";
    }
    if (table === "orders") {
      return record["id"] ? String(record["id"]).slice(-5) : "без ID";
    }
    if (table === "repairs") {
      return record["tasks"] || record["id"] || "без описания";
    }
    if (table === "operations") {
      return record["category"] || record["id"] || "операция";
    }
    if (table === "integrations") return "Google Таблицы";
    return record["id"] || "запись";
  }

  private fieldLabel(field: string): string {
    const labels: Record<string, string> = {
      name: "Название",
      phone: "Телефон",
      source: "Источник",
      type: "Тип",
      notes: "Комментарий",
      code: "Код",
      defaultRate: "Ставка по умолчанию",
      status: "Статус",
      clientId: "Клиент",
      equipmentId: "Техника",
      operatorId: "Оператор",
      startDate: "Дата начала",
      endDate: "Дата окончания",
      equipmentIdleDates: "Простой техники",
      operatorIdleDates: "Простой оператора",
      logisticsEnabled: "Логистика",
      logisticsProvider: "Перевозчик",
      logisticsTrailerId: "Трал",
      logisticsStartDate: "Дата начала логистики",
      logisticsEndDate: "Дата окончания логистики",
      logisticsDistanceKm: "Км логистики",
      logisticsPricePerKm: "Цена за км",
      logisticsCost: "Стоимость логистики",
      logisticsPickupKm: "Км подачи",
      logisticsDeliveryKm: "Км доставки",
      logisticsPickupCost: "Стоимость подачи",
      logisticsDeliveryCost: "Стоимость доставки",
      location: "Локация",
      rate: "Тариф",
      workStatus: "Состояние сотрудника",
      tasks: "Работы",
      date: "Дата",
      category: "Категория",
      amount: "Сумма",
      orderId: "Заявка",
      repairId: "Ремонт",
      comment: "Комментарий",
      googleFormsUrl: "Google Таблицы",
      autoSync: "Автосинхронизация",
      lastSyncStatus: "Статус синхронизации",
    };
    return labels[field] || field;
  }

  private stringifyValue(value: any): string {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? "Да" : "Нет";
    if (Array.isArray(value)) return value.join(", ") || "—";
    if (typeof value === "object") return JSON.stringify(value);
    if (value === "active") return "Работает";
    if (value === "sick_leave") return "Больничный";
    if (value === "dismissed") return "Уволен";
    return String(value);
  }
}
