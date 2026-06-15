import { Injectable, signal, WritableSignal, inject } from "@angular/core";
import { SupabaseService } from "./supabase.service";
import { RealtimeChannel } from "@supabase/supabase-js";
import {
  Client,
  Equipment,
  Operator,
  Order,
  Repair,
  Transport,
  Project,
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
    "transports",
    "projects",
    "operations",
    "audit_logs",
  ] as const;
  private readonly auditableTables = [
    "clients",
    "equipment",
    "operators",
    "orders",
    "repairs",
    "transports",
    "projects",
    "operations",
    "integrations",
  ] as const;

  readonly clients = signal<Client[]>([]);
  readonly equipment = signal<Equipment[]>([]);
  readonly operators = signal<Operator[]>([]);
  readonly orders = signal<Order[]>([]);
  readonly repairs = signal<Repair[]>([]);
  readonly transports = signal<Transport[]>([]);
  readonly projects = signal<Project[]>([]);
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
      rate: Number(operator.rate || 0),
      hourlyRate: Number(operator.hourlyRate || 0),
      workStatus: operator.workStatus || "active",
    } as Operator;
  }

  private normalizeEquipment(row: any): Equipment {
    const equipment = toCamel(row) as any;
    return {
      ...equipment,
      defaultRate: Number(equipment.defaultRate || 0),
      hourlyRate: Number(equipment.hourlyRate || 0),
      engineHours: Number(equipment.engineHours || 0),
    } as Equipment;
  }

  private normalizeOrder(row: any): Order {
    const order = toCamel(row) as any;
    const fallbackDistance = Number(order.logisticsDeliveryKm || 0);
    const fallbackCost =
      Number(order.logisticsPickupCost || 0) +
      Number(order.logisticsDeliveryCost || 0) +
      Number(order.logisticsReturnPickupCost || 0) +
      Number(order.logisticsReturnDeliveryCost || 0);
    const logisticsDistanceKm = Number(
      order.logisticsDistanceKm || fallbackDistance,
    );
    const logisticsCost = Number(order.logisticsCost || fallbackCost);
    const pickupCost = Number(order.logisticsPickupCost || 0);
    const deliveryCost = Number(
      order.logisticsDeliveryCost || (pickupCost ? 0 : logisticsCost),
    );
    return {
      ...order,
      rate: Number(order.rate || 0),
      equipmentHourlyRate: Number(order.equipmentHourlyRate || 0),
      equipmentEngineHoursStart: Number(order.equipmentEngineHoursStart || 0),
      equipmentEngineHoursEnd: Number(order.equipmentEngineHoursEnd || 0),
      paymentType: this.normalizeOrderPaymentType(order.paymentType),
      standardWorkHours: Number(order.standardWorkHours || 8),
      additionalWorkHours: Number(order.additionalWorkHours || 0),
      operatorAdditionalWorkHours: Number(
        order.operatorAdditionalWorkHours || 0,
      ),
      operatorSalaryMode: this.normalizeOperatorSalaryMode(
        order.operatorSalaryMode,
      ),
      operatorSalaryRate: Number(order.operatorSalaryRate || 0),
      vatEnabled: Boolean(order.vatEnabled),
      discountEnabled: Boolean(order.discountEnabled),
      discountType: order.discountType || "percent",
      discountValue: Number(order.discountValue || 0),
      deferred: Boolean(order.deferred),
      equipmentIdleDates: Array.isArray(order.equipmentIdleDates)
        ? order.equipmentIdleDates
        : [],
      operatorIdleDates: Array.isArray(order.operatorIdleDates)
        ? order.operatorIdleDates
        : [],
      operatorShifts: Array.isArray(order.operatorShifts)
        ? order.operatorShifts.map((shift: any) => ({
            id: shift.id || "",
            operatorId: shift.operatorId || "",
            startDate: shift.startDate || "",
            endDate: shift.endDate || "",
            idleDates: Array.isArray(shift.idleDates) ? shift.idleDates : [],
            salaryMode: this.normalizeOperatorSalaryMode(shift.salaryMode),
            salaryRate: Number(shift.salaryRate || 0),
          }))
        : [],
      logisticsEnabled: Boolean(order.logisticsEnabled),
      logisticsProvider: order.logisticsProvider || "own_trawl",
      logisticsTrailerId: order.logisticsTrailerId || "",
      logisticsStartDate: order.logisticsStartDate || order.startDate || "",
      logisticsEndDate: order.logisticsEndDate || order.endDate || "",
      logisticsReturnProvider:
        order.logisticsReturnProvider || order.logisticsProvider || "own_trawl",
      logisticsReturnTrailerId:
        order.logisticsReturnTrailerId || order.logisticsTrailerId || "",
      logisticsReturnStartDate:
        order.logisticsReturnStartDate ||
        order.logisticsEndDate ||
        order.endDate ||
        "",
      logisticsReturnEndDate:
        order.logisticsReturnEndDate ||
        order.logisticsEndDate ||
        order.endDate ||
        "",
      logisticsDistanceKm,
      logisticsPricePerKm: Number(
        order.logisticsPricePerKm ||
          (logisticsDistanceKm ? logisticsCost / logisticsDistanceKm : 0),
      ),
      logisticsCost,
      logisticsPickupPricePerKm: Number(
        order.logisticsPickupPricePerKm ||
          (order.logisticsPickupKm
            ? pickupCost / Number(order.logisticsPickupKm || 1)
            : 50),
      ),
      logisticsDeliveryPricePerKm: Number(
        order.logisticsDeliveryPricePerKm ||
          (order.logisticsDeliveryKm
            ? deliveryCost / Number(order.logisticsDeliveryKm || 1)
            : 250),
      ),
      logisticsPickupKm: Number(order.logisticsPickupKm || 0),
      logisticsDeliveryKm: Number(
        order.logisticsDeliveryKm || logisticsDistanceKm,
      ),
      logisticsPickupCost: pickupCost,
      logisticsDeliveryCost: deliveryCost,
      logisticsReturnPickupPricePerKm: Number(
        order.logisticsReturnPickupPricePerKm || 50,
      ),
      logisticsReturnDeliveryPricePerKm: Number(
        order.logisticsReturnDeliveryPricePerKm || 250,
      ),
      logisticsReturnPickupKm: Number(order.logisticsReturnPickupKm || 0),
      logisticsReturnDeliveryKm: Number(order.logisticsReturnDeliveryKm || 0),
      logisticsReturnPickupCost: Number(order.logisticsReturnPickupCost || 0),
      logisticsReturnDeliveryCost: Number(
        order.logisticsReturnDeliveryCost || 0,
      ),
      assemblyEnabled: Boolean(order.assemblyEnabled),
      assemblyDisassemblyDate: order.assemblyDisassemblyDate || "",
      assemblyAssemblyDate: order.assemblyAssemblyDate || "",
      assemblyDisassemblyCost: Number(order.assemblyDisassemblyCost || 0),
      assemblyAssemblyCost: Number(order.assemblyAssemblyCost || 0),
      breakdownEnabled: Boolean(order.breakdownEnabled),
      breakdownDate: order.breakdownDate || "",
      breakdownEndDate: order.breakdownEndDate || "",
      breakdownStatus: order.breakdownStatus || "reported",
      breakdownDescription: order.breakdownDescription || "",
      breakdownReporter: order.breakdownReporter || "",
      breakdownResponsible: order.breakdownResponsible || "",
      breakdownFaultParty: order.breakdownFaultParty || "unknown",
      breakdownAffectsPayment: Boolean(order.breakdownAffectsPayment),
      breakdownOperatorIdle: Boolean(order.breakdownOperatorIdle),
      breakdownLaborCost: Number(order.breakdownLaborCost || 0),
      breakdownPartsCost: Number(order.breakdownPartsCost || 0),
      breakdownCreateRepair: Boolean(order.breakdownCreateRepair),
      breakdownRepairId: order.breakdownRepairId || "",
    } as Order;
  }

  private normalizeOperatorSalaryMode(mode: any) {
    return ["auto", "hourly", "daily", "fixed"].includes(mode)
      ? mode
      : "auto";
  }

  private normalizeOrderPaymentType(type: any) {
    return ["cash", "cashless"].includes(type) ? type : "cashless";
  }

  private normalizeOperation(row: any): FinanceOperation {
    const operation = toCamel(row) as any;
    return {
      ...operation,
      amount: Number(operation.amount || 0),
      transportId: operation.transportId || "",
      equipmentId: operation.equipmentId || "",
      billClient:
        Boolean(operation.billClient) ||
        String(operation.comment || "").includes("[Выставить клиенту]"),
      markup: Number(operation.markup || 0),
      paid: Boolean(operation.paid),
    } as FinanceOperation;
  }

  private normalizeRepair(row: any): Repair {
    const repair = toCamel(row) as any;
    return {
      ...repair,
      laborCost: Number(repair.laborCost || 0),
      partsCost: Number(repair.partsCost || 0),
      subcontractor: Boolean(repair.subcontractor),
      responsible: repair.responsible || "",
    } as Repair;
  }

  private normalizeTransport(row: any): Transport {
    const transport = toCamel(row) as any;
    return {
      ...transport,
      shipperClientId: transport.shipperClientId || "",
      consigneeClientId: transport.consigneeClientId || "",
      pickupPricePerKm: Number(transport.pickupPricePerKm || 50),
      deliveryPricePerKm: Number(transport.deliveryPricePerKm || 250),
      pickupKm: Number(transport.pickupKm || 0),
      deliveryKm: Number(transport.deliveryKm || 0),
      pickupCost: Number(transport.pickupCost || 0),
      deliveryCost: Number(transport.deliveryCost || 0),
      status: transport.status || "new",
      deferred: Boolean(transport.deferred),
      createdAt: transport.createdAt || "",
    } as Transport;
  }

  private normalizeProject(row: any): Project {
    const project = toCamel(row) as any;
    return {
      ...project,
      clientId: project.clientId || "",
      budget: Number(project.budget || 0),
      status: project.status || "new",
      location: project.location || "",
      notes: project.notes || "",
      createdAt: project.createdAt || "",
    } as Project;
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
      transports,
      projects,
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
      this.supa.client.from("transports").select("*"),
      this.supa.client.from("projects").select("*"),
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
    this.equipment.set(
      (equipment.data || []).map((r) => this.normalizeEquipment(r)),
    );
    this.operators.set(
      (operators.data || []).map((r) => this.normalizeOperator(r)),
    );
    this.orders.set((orders.data || []).map((r) => this.normalizeOrder(r)));
    this.repairs.set((repairs.data || []).map((r) => this.normalizeRepair(r)));
    this.transports.set(
      (transports.data || []).map((r) => this.normalizeTransport(r)),
    );
    this.projects.set(
      (projects.data || []).map((r) => this.normalizeProject(r)),
    );
    this.operations.set(
      (operations.data || []).map((r) => this.normalizeOperation(r)),
    );
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
        : table === "equipment"
          ? (data || []).map((r) => this.normalizeEquipment(r))
          : table === "orders"
            ? (data || []).map((r) => this.normalizeOrder(r))
            : table === "repairs"
              ? (data || []).map((r) => this.normalizeRepair(r))
              : table === "transports"
                ? (data || []).map((r) => this.normalizeTransport(r))
                : table === "projects"
                  ? (data || []).map((r) => this.normalizeProject(r))
                  : table === "operations"
                    ? (data || []).map((r) => this.normalizeOperation(r))
                    : rows;
    const signalMap: Record<string, WritableSignal<any[]>> = {
      clients: this.clients,
      equipment: this.equipment,
      operators: this.operators,
      orders: this.orders,
      repairs: this.repairs,
      transports: this.transports,
      projects: this.projects,
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
    if (error && this.canRetryRepairWithoutCostFields(table, error)) {
      const fallbackRow = this.withoutRepairCostColumns(row);
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
    if (error && this.canRetryRepairWithoutCostFields(table, error)) {
      const fallbackRow = this.withoutRepairCostColumns(row);
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
    this.transports.set([]);
    this.projects.set([]);
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
      transports: this.transports,
      projects: this.projects,
      operations: this.operations,
    };
    return signalMap[table]?.() || [];
  }

  private isAuditableTable(table: string): boolean {
    return (this.auditableTables as readonly string[]).includes(table);
  }

  private canRetryOrderWithoutFlexibleLogistics(
    table: string,
    error: any,
  ): boolean {
    const message = `${error?.message || ""} ${error?.details || ""}`;
    return (
      table === "orders" &&
      ["42703", "PGRST204"].includes(error?.code) &&
      /logistics_(distance_km|price_per_km|cost|pickup_price_per_km|delivery_price_per_km)/.test(
        message,
      )
    );
  }

  private withoutFlexibleLogisticsColumns(
    row: Record<string, any>,
  ): Record<string, any> {
    const fallbackRow = { ...row };
    delete fallbackRow["logistics_distance_km"];
    delete fallbackRow["logistics_price_per_km"];
    delete fallbackRow["logistics_cost"];
    delete fallbackRow["logistics_pickup_price_per_km"];
    delete fallbackRow["logistics_delivery_price_per_km"];
    return fallbackRow;
  }

  private canRetryRepairWithoutCostFields(table: string, error: any): boolean {
    const message = `${error?.message || ""} ${error?.details || ""}`;
    return (
      table === "repairs" &&
      ["42703", "PGRST204"].includes(error?.code) &&
      /(labor_cost|parts_cost|responsible)/.test(message)
    );
  }

  private withoutRepairCostColumns(
    row: Record<string, any>,
  ): Record<string, any> {
    const fallbackRow = { ...row };
    delete fallbackRow["labor_cost"];
    delete fallbackRow["parts_cost"];
    delete fallbackRow["responsible"];
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
        action === "update"
          ? this.buildChanges(previous || {}, next || {})
          : [];
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
        summary: this.buildSummary(
          table,
          action,
          next || previous || {},
          changes,
        ),
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
        (key) =>
          JSON.stringify(previous[key] ?? "") !==
          JSON.stringify(next[key] ?? ""),
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
      transports: "перевозка",
      projects: "проект",
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
      return record["id"] || "без ID";
    }
    if (table === "repairs") {
      return record["tasks"] || record["id"] || "без описания";
    }
    if (table === "transports") {
      return (
        record["cargoName"] || record["shipper"] || record["id"] || "перевозка"
      );
    }
    if (table === "projects") {
      return record["name"] || record["id"] || "проект";
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
      hourlyRate: "Ставка за час",
      engineHours: "Моточасы",
      status: "Статус",
      clientId: "Клиент",
      equipmentId: "Техника",
      transportId: "Перевозка",
      operatorId: "Оператор",
      driverId: "Водитель",
      startDate: "Дата начала",
      endDate: "Дата окончания",
      shipper: "Грузоотправитель",
      consignee: "Грузополучатель",
      shipperClientId: "Грузоотправитель",
      consigneeClientId: "Грузополучатель",
      loadingPoint: "Пункт погрузки",
      unloadingPoint: "Пункт выгрузки",
      cargoName: "Груз",
      pickupPricePerKm: "Цена км подачи",
      deliveryPricePerKm: "Цена км доставки",
      pickupKm: "Км подачи",
      deliveryKm: "Км доставки",
      pickupCost: "Стоимость подачи",
      deliveryCost: "Стоимость доставки",
      equipmentIdleDates: "Простой техники",
      operatorIdleDates: "Простой оператора",
      operatorShifts: "Смены операторов",
      logisticsEnabled: "Логистика",
      logisticsProvider: "Перевозчик",
      logisticsTrailerId: "Трал",
      logisticsStartDate: "Дата начала логистики",
      logisticsEndDate: "Дата окончания логистики",
      logisticsReturnProvider: "Возврат: перевозчик",
      logisticsReturnTrailerId: "Возврат: трал",
      logisticsReturnStartDate: "Возврат: дата начала",
      logisticsReturnEndDate: "Возврат: дата окончания",
      logisticsDistanceKm: "Км логистики",
      logisticsPricePerKm: "Цена за км",
      logisticsCost: "Стоимость логистики",
      logisticsPickupPricePerKm: "Цена км подачи",
      logisticsDeliveryPricePerKm: "Цена км доставки",
      logisticsPickupKm: "Км подачи",
      logisticsDeliveryKm: "Км доставки",
      logisticsPickupCost: "Стоимость подачи",
      logisticsDeliveryCost: "Стоимость доставки",
      logisticsReturnPickupPricePerKm: "Возврат: цена км подачи",
      logisticsReturnDeliveryPricePerKm: "Возврат: цена км доставки",
      logisticsReturnPickupKm: "Возврат: км подачи",
      logisticsReturnDeliveryKm: "Возврат: км доставки",
      logisticsReturnPickupCost: "Возврат: стоимость подачи",
      logisticsReturnDeliveryCost: "Возврат: стоимость доставки",
      assemblyEnabled: "Сборка/разборка",
      assemblyDisassemblyDate: "Дата демонтажа",
      assemblyAssemblyDate: "Дата монтажа",
      assemblyDisassemblyCost: "Стоимость демонтажа",
      assemblyAssemblyCost: "Стоимость монтажа",
      breakdownEnabled: "Поломка",
      breakdownDate: "Дата поломки",
      breakdownEndDate: "Дата устранения",
      breakdownStatus: "Статус поломки",
      breakdownDescription: "Описание поломки",
      breakdownReporter: "Кто сообщил",
      breakdownResponsible: "Ответственный за поломку",
      breakdownFaultParty: "Ответственность",
      breakdownAffectsPayment: "Влияет на оплату",
      breakdownOperatorIdle: "Простой оператора из-за поломки",
      breakdownLaborCost: "Работы по поломке",
      breakdownPartsCost: "Запчасти по поломке",
      breakdownCreateRepair: "Создать ремонт",
      breakdownRepairId: "Связанный ремонт",
      location: "Локация",
      paymentType: "Тип оплаты",
      budget: "Бюджет",
      rate: "Тариф",
      equipmentHourlyRate: "Ставка техники за час",
      equipmentEngineHoursStart: "Моточасы на начало",
      equipmentEngineHoursEnd: "Моточасы на конец",
      standardWorkHours: "Стандарт часов",
      additionalWorkHours: "Дополнительные часы",
      operatorAdditionalWorkHours: "Дополнительные часы оператора",
      subcontractor: "Подрядная организация",
      vatEnabled: "НДС",
      discountEnabled: "Скидка",
      discountType: "Тип скидки",
      discountValue: "Размер скидки",
      deferred: "Отложено",
      workStatus: "Состояние сотрудника",
      laborCost: "Стоимость работ",
      partsCost: "Стоимость запчастей",
      responsible: "Ответственный",
      tasks: "Работы",
      date: "Дата",
      category: "Категория",
      amount: "Сумма",
      orderId: "Заявка",
      repairId: "Ремонт",
      billClient: "Выставить клиенту",
      markup: "Наценка",
      paid: "Оплачено",
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
    if (Array.isArray(value)) {
      if (value.some((item) => typeof item === "object")) {
        return JSON.stringify(value);
      }
      return value.join(", ") || "—";
    }
    if (typeof value === "object") return JSON.stringify(value);
    if (value === "active") return "Работает";
    if (value === "sick_leave") return "Больничный";
    if (value === "dismissed") return "Уволен";
    return String(value);
  }
}
