import { Component, output } from "@angular/core";

@Component({
  selector: "app-sidebar",
  standalone: true,
  templateUrl: "./sidebar.component.html",
  styleUrl: "./sidebar.component.css",
})
export class SidebarComponent {
  readonly navigate = output<string>();
  activeSection = "dashboard";

  readonly sections = [
    { key: "auth", label: "Авторизация" },
    { key: "dashboard", label: "Дашборд" },
    { key: "orders", label: "Заявки" },
    { key: "repairs", label: "Ремонты" },
    { key: "calendar", label: "Календарь" },
    { key: "finance", label: "Финансы" },
    { key: "reports", label: "Отчеты" },
    { key: "equipment", label: "Техника" },
    { key: "clients", label: "Клиенты" },
    { key: "operators", label: "Операторы" },
    { key: "integrations", label: "Google Таблицы" },
    { key: "settings", label: "Настройки" },
  ];

  go(key: string): void {
    this.activeSection = key;
    this.navigate.emit(key);
  }
}
