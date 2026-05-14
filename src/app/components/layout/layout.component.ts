import { Component, OnInit, OnDestroy, inject } from "@angular/core";
import {
  Router,
  RouterOutlet,
  RouterLink,
  RouterLinkActive,
} from "@angular/router";
import { SupabaseService } from "../../services/supabase.service";
import { DbService } from "../../services/db.service";
import { GoogleFormsService } from "../../services/google-forms.service";
import { StateService } from "../../services/state.service";

@Component({
  selector: "app-layout",
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: "./layout.component.html",
  styleUrl: "./layout.component.css",
})
export class LayoutComponent implements OnInit, OnDestroy {
  supa = inject(SupabaseService);
  db = inject(DbService);
  state = inject(StateService);
  gf = inject(GoogleFormsService);
  private router = inject(Router);

  readonly navItems = [
    { path: "/dashboard", label: "Дашборд" },
    { path: "/orders", label: "Заявки" },
    { path: "/repairs", label: "Ремонты" },
    { path: "/calendar", label: "Календарь" },
    { path: "/finance", label: "Финансы" },
    { path: "/transports", label: "Перевозки" },
    { path: "/reports", label: "Отчеты" },
    { path: "/projects", label: "Заявки v2" },
    { path: "/equipment", label: "Техника" },
    { path: "/clients", label: "Клиенты" },
    { path: "/operators", label: "Операторы" },
    { path: "/integrations", label: "Google Таблицы" },
    { path: "/journal", label: "Журнал" },
    { path: "/settings", label: "Настройки" },
  ];

  async ngOnInit(): Promise<void> {
    await this.db.loadAll();
    this.db.subscribeRealtime();
    this.gf.refreshStatus();
    const integ = this.state.integrations();
    if (integ.autoSync && integ.googleFormsUrl) {
      this.gf.sync(false);
    }
  }

  ngOnDestroy(): void {
    this.db.unsubscribeRealtime();
  }

  async logout(): Promise<void> {
    this.db.unsubscribeRealtime();
    this.db.clearAll();
    await this.supa.signOut();
    this.router.navigate(["/login"]);
  }
}
