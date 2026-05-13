import { Component, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { StateService } from "../../services/state.service";
import { UtilsService } from "../../services/utils.service";

@Component({
  selector: "app-audit-log",
  standalone: true,
  imports: [FormsModule],
  templateUrl: "./audit-log.component.html",
  styleUrl: "./audit-log.component.css",
})
export class AuditLogComponent {
  state = inject(StateService);
  utils = inject(UtilsService);

  search = signal("");
  filterEntity = signal("");
  filterAction = signal("");

  readonly entities = [
    { value: "", label: "Все объекты" },
    { value: "orders", label: "Заявки" },
    { value: "clients", label: "Клиенты" },
    { value: "equipment", label: "Техника" },
    { value: "operators", label: "Операторы" },
    { value: "repairs", label: "Ремонты" },
    { value: "projects", label: "Проекты" },
    { value: "operations", label: "Финансы" },
    { value: "integrations", label: "Интеграции" },
  ];

  readonly actions = [
    { value: "", label: "Все действия" },
    { value: "create", label: "Создание" },
    { value: "update", label: "Изменение" },
    { value: "delete", label: "Удаление" },
  ];

  readonly filteredLogs = computed(() => {
    const q = this.search().toLowerCase();
    const entity = this.filterEntity();
    const action = this.filterAction();

    return this.state.auditLogs().filter((log) => {
      if (entity && log.entityType !== entity) return false;
      if (action && log.action !== action) return false;
      if (!q) return true;
      return (
        (log.actorEmail || "").toLowerCase().includes(q) ||
        (log.entityLabel || "").toLowerCase().includes(q) ||
        (log.summary || "").toLowerCase().includes(q) ||
        (log.entityType || "").toLowerCase().includes(q)
      );
    });
  });

  actionLabel(action: string): string {
    const labels: Record<string, string> = {
      create: "Создание",
      update: "Изменение",
      delete: "Удаление",
    };
    return labels[action] || action;
  }

  entityLabel(entity: string): string {
    const labels: Record<string, string> = {
      orders: "Заявка",
      clients: "Клиент",
      equipment: "Техника",
      operators: "Оператор",
      repairs: "Ремонт",
      projects: "Проект",
      operations: "Финансы",
      integrations: "Интеграция",
    };
    return labels[entity] || entity;
  }
}
