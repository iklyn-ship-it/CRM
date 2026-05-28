import { Routes } from "@angular/router";
import { authGuard, loginGuard, pendingGuard } from "./guards/auth.guard";

export const routes: Routes = [
  {
    path: "login",
    canActivate: [loginGuard],
    loadComponent: () =>
      import("./components/auth/auth.component").then((m) => m.AuthComponent),
  },
  {
    path: "pending",
    canActivate: [pendingGuard],
    loadComponent: () =>
      import("./components/account-pending/account-pending.component").then(
        (m) => m.AccountPendingComponent,
      ),
  },
  {
    path: "",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./components/layout/layout.component").then(
        (m) => m.LayoutComponent,
      ),
    children: [
      {
        path: "dashboard",
        loadComponent: () =>
          import("./components/dashboard/dashboard.component").then(
            (m) => m.DashboardComponent,
          ),
      },
      {
        path: "orders",
        loadComponent: () =>
          import("./components/projects/projects.component").then(
            (m) => m.ProjectsComponent,
          ),
      },
      {
        path: "orders-old",
        loadComponent: () =>
          import("./components/orders/orders.component").then(
            (m) => m.OrdersComponent,
          ),
      },
      {
        path: "repairs",
        loadComponent: () =>
          import("./components/repairs/repairs.component").then(
            (m) => m.RepairsComponent,
          ),
      },
      {
        path: "calendar",
        loadComponent: () =>
          import("./components/calendar/calendar.component").then(
            (m) => m.CalendarComponent,
          ),
      },
      {
        path: "finance",
        loadComponent: () =>
          import("./components/finance/finance.component").then(
            (m) => m.FinanceComponent,
          ),
      },
      {
        path: "transports",
        loadComponent: () =>
          import("./components/transports/transports.component").then(
            (m) => m.TransportsComponent,
          ),
      },
      {
        path: "reports",
        loadComponent: () =>
          import("./components/reports/reports.component").then(
            (m) => m.ReportsComponent,
          ),
      },
      {
        path: "timesheet",
        loadComponent: () =>
          import("./components/timesheet/timesheet.component").then(
            (m) => m.TimesheetComponent,
          ),
      },
      {
        path: "projects",
        redirectTo: "orders",
        pathMatch: "full",
      },
      {
        path: "equipment",
        loadComponent: () =>
          import("./components/equipment/equipment.component").then(
            (m) => m.EquipmentComponent,
          ),
      },
      {
        path: "clients",
        loadComponent: () =>
          import("./components/clients/clients.component").then(
            (m) => m.ClientsComponent,
          ),
      },
      {
        path: "operators",
        loadComponent: () =>
          import("./components/operators/operators.component").then(
            (m) => m.OperatorsComponent,
          ),
      },
      {
        path: "integrations",
        loadComponent: () =>
          import("./components/integrations/integrations.component").then(
            (m) => m.IntegrationsComponent,
          ),
      },
      {
        path: "settings",
        loadComponent: () =>
          import("./components/settings/settings.component").then(
            (m) => m.SettingsComponent,
          ),
      },
      {
        path: "journal",
        loadComponent: () =>
          import("./components/audit-log/audit-log.component").then(
            (m) => m.AuditLogComponent,
          ),
      },
      { path: "", redirectTo: "dashboard", pathMatch: "full" },
    ],
  },
  { path: "**", redirectTo: "login" },
];
