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

  readonly clients = signal<Client[]>([]);
  readonly equipment = signal<Equipment[]>([]);
  readonly operators = signal<Operator[]>([]);
  readonly orders = signal<Order[]>([]);
  readonly repairs = signal<Repair[]>([]);
  readonly operations = signal<FinanceOperation[]>([]);
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

  /** Load all data for current user */
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
      integ,
      settings,
    ] = await Promise.all([
      this.supa.client.from("clients").select("*").eq("user_id", uid),
      this.supa.client.from("equipment").select("*").eq("user_id", uid),
      this.supa.client.from("operators").select("*").eq("user_id", uid),
      this.supa.client.from("orders").select("*").eq("user_id", uid),
      this.supa.client.from("repairs").select("*").eq("user_id", uid),
      this.supa.client.from("operations").select("*").eq("user_id", uid),
      this.supa.client
        .from("integrations")
        .select("*")
        .eq("user_id", uid)
        .maybeSingle(),
      this.supa.client
        .from("user_settings")
        .select("*")
        .eq("user_id", uid)
        .maybeSingle(),
    ]);

    this.clients.set((clients.data || []).map((r) => toCamel(r) as any));
    this.equipment.set((equipment.data || []).map((r) => toCamel(r) as any));
    this.operators.set((operators.data || []).map((r) => toCamel(r) as any));
    this.orders.set((orders.data || []).map((r) => toCamel(r) as any));
    this.repairs.set((repairs.data || []).map((r) => toCamel(r) as any));
    this.operations.set((operations.data || []).map((r) => toCamel(r) as any));

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

    const tables = [
      "clients",
      "equipment",
      "operators",
      "orders",
      "repairs",
      "operations",
    ] as const;
    tables.forEach((table) => {
      const ch = this.supa.client
        .channel(`${table}_${uid}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table,
            filter: `user_id=eq.${uid}`,
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
    const { data } = await this.supa.client
      .from(table)
      .select("*")
      .eq("user_id", uid);
    const rows = (data || []).map((r) => toCamel(r) as any);
    const signalMap: Record<string, WritableSignal<any[]>> = {
      clients: this.clients,
      equipment: this.equipment,
      operators: this.operators,
      orders: this.orders,
      repairs: this.repairs,
      operations: this.operations,
    };
    signalMap[table]?.set(rows);
  }

  // ---- Generic CRUD ----

  async insert(table: string, record: Record<string, any>): Promise<any> {
    const row = toSnake({ ...record, userId: this.supa.userId });
    const { data, error } = await this.supa.client
      .from(table)
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    await this.reloadTable(table);
    return toCamel(data);
  }

  async update(
    table: string,
    id: string,
    changes: Record<string, any>,
  ): Promise<any> {
    const row = toSnake(changes);
    delete row["id"];
    delete row["user_id"];
    const { data, error } = await this.supa.client
      .from(table)
      .update(row)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    await this.reloadTable(table);
    return toCamel(data);
  }

  async remove(table: string, id: string): Promise<void> {
    const { error } = await this.supa.client.from(table).delete().eq("id", id);
    if (error) throw error;
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
}
