import { Component, computed, signal, inject } from "@angular/core";
import { NgClass } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { StateService } from "../../services/state.service";
import { DbService } from "../../services/db.service";
import { UtilsService } from "../../services/utils.service";

interface CalCell {
  date: Date;
  inMonth: boolean;
  ds: string;
  entries: {
    eq: string;
    cl: string;
    type: string;
    statusClass: string;
    conflict: boolean;
  }[];
}

@Component({
  selector: "app-calendar",
  standalone: true,
  imports: [NgClass, FormsModule],
  templateUrl: "./calendar.component.html",
  styleUrl: "./calendar.component.css",
})
export class CalendarComponent {
  readonly weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  state = inject(StateService);
  db = inject(DbService);
  utils = inject(UtilsService);

  // Local signal for calendar navigation (not persisted on every click)
  readonly viewDate = signal(new Date());
  readonly equipmentTypeFilter = signal("");

  private normalizeType(value: string): string {
    return (value || "").trim();
  }

  readonly equipmentTypes = computed(() => {
    const types = this.state
      .equipment()
      .map((eq) => this.normalizeType(eq.type))
      .filter(Boolean);
    return Array.from(new Set(types)).sort((a, b) => a.localeCompare(b));
  });

  readonly filteredEquipment = computed(() => {
    const type = this.equipmentTypeFilter();
    return this.state
      .equipment()
      .filter((eq) => !type || this.normalizeType(eq.type) === type);
  });

  private isEquipmentTypeVisible(equipmentId: string): boolean {
    const type = this.equipmentTypeFilter();
    if (!type) return true;
    const equipment = this.state.byId(this.state.equipment(), equipmentId);
    return this.normalizeType(equipment?.type || "") === type;
  }

  get monthLabel(): string {
    return this.viewDate().toLocaleDateString("ru-RU", {
      month: "long",
      year: "numeric",
    });
  }

  prevMonth(): void {
    const d = this.viewDate();
    this.viewDate.set(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  nextMonth(): void {
    const d = this.viewDate();
    this.viewDate.set(new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }
  currentMonth(): void {
    this.viewDate.set(new Date());
  }

  onModeChange(mode: string): void {
    this.db.saveUserSettings({ ...this.db.userSettings(), calendarMode: mode });
  }

  readonly calendarCells = computed((): CalCell[] => {
    const d = this.viewDate();
    const y = d.getFullYear(),
      m = d.getMonth();
    const start = new Date(y, m, 1);
    const startWeek = (start.getDay() + 6) % 7;
    const dim = new Date(y, m + 1, 0).getDate();
    const weeks = Math.ceil((startWeek + dim) / 7);
    const cells: CalCell[] = [];

    for (let w = 0; w < weeks; w++) {
      for (let i = 0; i < 7; i++) {
        const cellNum = w * 7 + i + 1 - startWeek;
        const cur = new Date(y, m, cellNum);
        const inMonth = cur.getMonth() === m;
        const ds = cur.toISOString().slice(0, 10);

        const rentEntries = this.state
          .orders()
          .filter(
            (o) =>
              o.status !== "cancelled" &&
              this.isEquipmentTypeVisible(o.equipmentId) &&
              o.startDate <= ds &&
              o.endDate >= ds,
          )
          .map((o) => ({
            eq:
              this.state.byId(this.state.equipment(), o.equipmentId)?.name ||
              "Техника",
            cl:
              this.state.byId(this.state.clients(), o.clientId)?.name ||
              "Клиент",
            type: "rent",
            statusClass: "status-" + o.status,
            equipmentId: o.equipmentId,
            blocksSchedule: this.state.orderBlocksSchedule(o),
            conflict: false,
          }));

        const repairEntries = this.state
          .repairs()
          .filter(
            (r) =>
              r.status !== "cancelled" &&
              this.isEquipmentTypeVisible(r.equipmentId) &&
              r.startDate <= ds &&
              r.endDate >= ds,
          )
          .map((r) => ({
            eq:
              this.state.byId(this.state.equipment(), r.equipmentId)?.name ||
              "Техника",
            cl: r.tasks || "Ремонт",
            type: "repair",
            statusClass: "repair",
            equipmentId: r.equipmentId,
            conflict: false,
          }));

        const entries = [...rentEntries, ...repairEntries];
        const cnt: Record<string, number> = {};
        entries.forEach((e) => {
          const shouldCount =
            e.type === "repair" || ("blocksSchedule" in e && e.blocksSchedule);
          if (shouldCount) {
            cnt[e.equipmentId] = (cnt[e.equipmentId] || 0) + 1;
          }
        });
        entries.forEach((e) => (e.conflict = cnt[e.equipmentId] > 1));
        cells.push({ date: cur, inMonth, ds, entries: entries.slice(0, 5) });
      }
    }
    return cells;
  });

  readonly timelineEquipment = computed(() => {
    const d = this.viewDate();
    const y = d.getFullYear(),
      m = d.getMonth();
    const dim = new Date(y, m + 1, 0).getDate();
    const start = new Date(y, m, 1),
      end = new Date(y, m + 1, 0);

    return this.filteredEquipment().map((eq) => {
      const events = [
        ...this.state
          .orders()
          .filter((o) => o.equipmentId === eq.id && o.status !== "cancelled")
          .map((o) => ({
            type: "rent" as const,
            status: o.status,
            title:
              this.state.byId(this.state.clients(), o.clientId)?.name ||
              "Аренда",
            startDate: o.startDate,
            endDate: o.endDate,
          })),
        ...this.state
          .repairs()
          .filter((r) => r.equipmentId === eq.id && r.status !== "cancelled")
          .map((r) => ({
            type: "repair" as const,
            status: r.status,
            title: r.tasks || "Ремонт",
            startDate: r.startDate,
            endDate: r.endDate,
          })),
      ]
        .map((ev) => {
          const s = new Date(ev.startDate + "T00:00:00"),
            e = new Date(ev.endDate + "T00:00:00");
          const from = new Date(Math.max(s.getTime(), start.getTime())),
            to = new Date(Math.min(e.getTime(), end.getTime()));
          if (from > to) return null;
          return {
            ...ev,
            startDay: from.getDate(),
            span: to.getDate() - from.getDate() + 1,
          };
        })
        .filter(Boolean);
      return { eq, events, dim };
    });
  });

  readonly timelineDays = computed(() => {
    const d = this.viewDate();
    const y = d.getFullYear(),
      m = d.getMonth();
    const dim = new Date(y, m + 1, 0).getDate();
    return Array.from({ length: 31 }, (_, i) => {
      const day = i + 1,
        inMonth = day <= dim;
      const date = inMonth ? new Date(y, m, day) : null;
      return {
        day,
        inMonth,
        weekday: date
          ? date.toLocaleDateString("ru-RU", { weekday: "short" })
          : "",
      };
    });
  });
}
