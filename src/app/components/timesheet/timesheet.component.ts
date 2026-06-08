import { Component, computed, inject, signal } from "@angular/core";
import { NgClass } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Operator, OperatorShift, Order } from "../../models/crm.models";
import { StateService } from "../../services/state.service";
import { UtilsService } from "../../services/utils.service";

interface TimesheetDay {
  day: number;
  date: string;
  weekend: boolean;
}

interface TimesheetOrderDetail {
  key: string;
  orderId: string;
  orderShortId: string;
  clientName: string;
  equipmentName: string;
  location: string;
  startDate: string;
  endDate: string;
  days: number;
  hours: number;
  status: Order["status"];
}

interface TimesheetDayDetail {
  key: string;
  date: string;
  orderId: string;
  orderShortId: string;
  clientName: string;
  equipmentName: string;
  location: string;
  hours: number;
  status: Order["status"];
}

interface TimesheetRow {
  index: number;
  operator: Operator;
  dayHours: Record<string, number>;
  dayDetails: Record<string, TimesheetDayDetail[]>;
  totalDays: number;
  regularHours: number;
  extraHours: number;
  totalHours: number;
  hourlyRate: number;
  dailyRate: number;
  amount: number;
  details: TimesheetOrderDetail[];
}

interface SelectedDayDetails {
  operatorName: string;
  date: string;
  hours: number;
  items: TimesheetDayDetail[];
}

@Component({
  selector: "app-timesheet",
  standalone: true,
  imports: [FormsModule, NgClass],
  templateUrl: "./timesheet.component.html",
  styleUrl: "./timesheet.component.css",
})
export class TimesheetComponent {
  state = inject(StateService);
  utils = inject(UtilsService);

  selectedYear = signal(new Date().getFullYear());
  selectedMonth = signal(new Date().getMonth() + 1);
  selectedDayDetails = signal<SelectedDayDetails | null>(null);

  readonly months = [
    { value: 1, label: "Январь" },
    { value: 2, label: "Февраль" },
    { value: 3, label: "Март" },
    { value: 4, label: "Апрель" },
    { value: 5, label: "Май" },
    { value: 6, label: "Июнь" },
    { value: 7, label: "Июль" },
    { value: 8, label: "Август" },
    { value: 9, label: "Сентябрь" },
    { value: 10, label: "Октябрь" },
    { value: 11, label: "Ноябрь" },
    { value: 12, label: "Декабрь" },
  ];

  readonly years = computed(() => {
    const current = new Date().getFullYear();
    const years = new Set<number>([current - 1, current, current + 1]);
    this.state.orders().forEach((order) => {
      [order.startDate, order.endDate, order.createdAt?.slice(0, 10)]
        .filter(Boolean)
        .forEach((date) => years.add(Number(date.slice(0, 4))));
    });
    return [...years].sort((a, b) => b - a);
  });

  readonly monthLabel = computed(() => {
    const month = this.months.find(
      (item) => item.value === this.selectedMonth(),
    );
    return `${month?.label || ""} ${this.selectedYear()}`;
  });

  readonly periodStart = computed(
    () =>
      `${this.selectedYear()}-${String(this.selectedMonth()).padStart(2, "0")}-01`,
  );

  readonly periodEnd = computed(() => {
    const end = new Date(this.selectedYear(), this.selectedMonth(), 0);
    return this.utils.dateKey(end);
  });

  readonly days = computed<TimesheetDay[]>(() =>
    this.utils
      .datesInclusive(this.periodStart(), this.periodEnd())
      .map((date) => {
        const native = new Date(`${date}T00:00:00`);
        const dayOfWeek = native.getDay();
        return {
          day: native.getDate(),
          date,
          weekend: dayOfWeek === 0 || dayOfWeek === 6,
        };
      }),
  );

  readonly rows = computed<TimesheetRow[]>(() =>
    this.state
      .operators()
      .map((operator, index) => this.buildOperatorRow(operator, index + 1))
      .filter(
        (row) => row.totalHours > 0 || row.operator.workStatus !== "dismissed",
      ),
  );

  readonly totals = computed(() =>
    this.rows().reduce(
      (summary, row) => ({
        operators: summary.operators + 1,
        days: summary.days + row.totalDays,
        hours: summary.hours + row.totalHours,
        amount: summary.amount + row.amount,
      }),
      { operators: 0, days: 0, hours: 0, amount: 0 },
    ),
  );

  previousMonth(): void {
    const month = this.selectedMonth();
    if (month === 1) {
      this.selectedMonth.set(12);
      this.selectedYear.update((year) => year - 1);
      return;
    }
    this.selectedMonth.set(month - 1);
  }

  nextMonth(): void {
    const month = this.selectedMonth();
    if (month === 12) {
      this.selectedMonth.set(1);
      this.selectedYear.update((year) => year + 1);
      return;
    }
    this.selectedMonth.set(month + 1);
  }

  setCurrentMonth(): void {
    const today = new Date();
    this.selectedYear.set(today.getFullYear());
    this.selectedMonth.set(today.getMonth() + 1);
  }

  openDayDetails(row: TimesheetRow, date: string): void {
    const items = row.dayDetails[date] || [];
    if (!items.length) return;
    this.selectedDayDetails.set({
      operatorName: row.operator.name,
      date,
      hours: row.dayHours[date] || 0,
      items,
    });
  }

  closeDayDetails(): void {
    this.selectedDayDetails.set(null);
  }

  orderStatusLabel(status: Order["status"]): string {
    const labels: Record<Order["status"], string> = {
      new: "Новая",
      confirmed: "Подтверждена",
      active: "В работе",
      completed: "Завершена",
      cancelled: "Отменена",
    };
    return labels[status];
  }

  fmtHours(value: number): string {
    return Number(value || 0).toLocaleString("uk-UA", {
      maximumFractionDigits: 2,
    });
  }

  private buildOperatorRow(operator: Operator, index: number): TimesheetRow {
    const dayHours: Record<string, number> = {};
    const dayDetails: Record<string, TimesheetDayDetail[]> = {};
    const details: TimesheetOrderDetail[] = [];
    const extraHoursByOrder = new Map<string, number>();
    let payrollAmount = 0;

    this.state
      .orders()
      .filter((order) => this.orderCountsInTimesheet(order))
      .forEach((order) => {
        const assignments = this.operatorAssignmentsForTimesheet(order).filter(
          (assignment) => assignment.operatorId === operator.id,
        );
        if (assignments.length) {
          payrollAmount += this.state.orderOperatorCostFor(
            order,
            operator.id,
            this.periodStart(),
            this.periodEnd(),
          );
        }
        const totalAssignmentDays = assignments.reduce(
          (sum, assignment) =>
            sum +
            this.assignmentDates(
              order,
              assignment,
              this.periodStart(),
              this.periodEnd(),
            ).length,
          0,
        );

        assignments.forEach((assignment) => {
          const dates = this.assignmentDates(
            order,
            assignment,
            this.periodStart(),
            this.periodEnd(),
          );
          if (!dates.length) return;

          const hoursPerDay = this.orderStandardWorkHours(order);
          dates.forEach((date) => {
            dayHours[date] = (dayHours[date] || 0) + hoursPerDay;
            dayDetails[date] = [
              ...(dayDetails[date] || []),
              {
                key: `${order.id}-${assignment.id}-${operator.id}-${date}`,
                date,
                orderId: order.id,
                orderShortId: this.utils.shortId(order.id),
                clientName:
                  this.state.byId(this.state.clients(), order.clientId)?.name ||
                  "—",
                equipmentName:
                  this.state.byId(this.state.equipment(), order.equipmentId)
                    ?.name || "—",
                location: order.location || "—",
                hours: hoursPerDay,
                status: order.status,
              },
            ];
          });

          const extraShare =
            totalAssignmentDays > 0
              ? Number(order.operatorAdditionalWorkHours || 0) *
                (dates.length / totalAssignmentDays)
              : 0;
          extraHoursByOrder.set(
            order.id,
            (extraHoursByOrder.get(order.id) || 0) + extraShare,
          );

          details.push({
            key: `${order.id}-${assignment.id}-${operator.id}`,
            orderId: order.id,
            orderShortId: this.utils.shortId(order.id),
            clientName:
              this.state.byId(this.state.clients(), order.clientId)?.name ||
              "—",
            equipmentName:
              this.state.byId(this.state.equipment(), order.equipmentId)
                ?.name || "—",
            location: order.location || "—",
            startDate: dates[0],
            endDate: dates[dates.length - 1],
            days: dates.length,
            hours: dates.length * hoursPerDay + extraShare,
            status: order.status,
          });
        });
      });

    const regularHours = Object.values(dayHours).reduce(
      (sum, value) => sum + value,
      0,
    );
    const extraHours = [...extraHoursByOrder.values()].reduce(
      (sum, value) => sum + value,
      0,
    );
    const totalHours = regularHours + extraHours;
    const totalDays = Object.values(dayHours).filter(
      (value) => value > 0,
    ).length;
    const hourlyRate = Number(operator.hourlyRate || 0);
    const dailyRate = Number(operator.rate || 0);
    const amount = payrollAmount;

    return {
      index,
      operator,
      dayHours,
      dayDetails,
      totalDays,
      regularHours,
      extraHours,
      totalHours,
      hourlyRate,
      dailyRate,
      amount,
      details: details.sort((a, b) => a.startDate.localeCompare(b.startDate)),
    };
  }

  private orderCountsInTimesheet(order: Order): boolean {
    return (
      !order.deferred &&
      order.status !== "cancelled" &&
      order.endDate >= this.periodStart() &&
      order.startDate <= this.periodEnd()
    );
  }

  private operatorAssignmentsForTimesheet(order: Order): OperatorShift[] {
    return this.state.orderOperatorAssignments(order);
  }

  private assignmentDates(
    order: Order,
    assignment: OperatorShift,
    fromDate: string,
    toDate: string,
  ): string[] {
    const startDate =
      [order.startDate, assignment.startDate, fromDate].sort().at(-1) || "";
    const endDate = [order.endDate, assignment.endDate, toDate].sort()[0] || "";
    if (!startDate || !endDate || startDate > endDate) return [];
    const idleDates = new Set(assignment.idleDates || []);
    return this.utils
      .datesInclusive(startDate, endDate)
      .filter((date) => !idleDates.has(date));
  }

  private orderStandardWorkHours(order: Order): number {
    return Number(order.standardWorkHours || 8);
  }
}
