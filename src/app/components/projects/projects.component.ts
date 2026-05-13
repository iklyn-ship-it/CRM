import { Component, computed, inject, signal } from "@angular/core";
import { NgClass, SlicePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { DbService } from "../../services/db.service";
import { StateService } from "../../services/state.service";
import { UtilsService } from "../../services/utils.service";
import { Project, ProjectStatus } from "../../models/crm.models";

@Component({
  selector: "app-projects",
  standalone: true,
  imports: [FormsModule, NgClass, SlicePipe],
  templateUrl: "./projects.component.html",
  styleUrl: "./projects.component.css",
})
export class ProjectsComponent {
  state = inject(StateService);
  db = inject(DbService);
  utils = inject(UtilsService);

  search = signal("");
  filterStatus = signal("");
  selectedProjectId = signal("");
  editing = signal(false);

  form = this.emptyForm();

  readonly statuses: { value: ProjectStatus; label: string }[] = [
    { value: "new", label: "Новый" },
    { value: "active", label: "В работе" },
    { value: "paused", label: "Пауза" },
    { value: "completed", label: "Завершен" },
    { value: "cancelled", label: "Отменен" },
  ];

  readonly filteredProjects = computed(() => {
    const q = this.search().trim().toLowerCase();
    const status = this.filterStatus();
    let rows = [...this.state.projects()];
    if (status) rows = rows.filter((project) => project.status === status);
    if (q) {
      rows = rows.filter((project) =>
        [
          project.name,
          this.clientName(project.clientId),
          project.location,
          project.notes,
          this.statusLabel(project.status),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    return rows.sort((a, b) => {
      const byDate = (b.startDate || "").localeCompare(a.startDate || "");
      return byDate || b.id.localeCompare(a.id);
    });
  });

  readonly selectedProject = computed(() =>
    this.state.byId(this.state.projects(), this.selectedProjectId()),
  );

  openCreate(): void {
    const today = this.utils.todayStr();
    const project: Project = {
      id: this.utils.uid("prj"),
      name: "Новый проект",
      clientId: "",
      startDate: today,
      endDate: today,
      status: "new",
      budget: 0,
      location: "",
      notes: "",
      createdAt: new Date().toISOString(),
    };
    this.selectedProjectId.set(project.id);
    this.form = this.projectToForm(project);
    this.editing.set(true);
  }

  openProject(project: Project): void {
    this.selectedProjectId.set(project.id);
    this.form = this.projectToForm(project);
    this.editing.set(false);
  }

  editSelected(): void {
    const project = this.selectedProject();
    if (!project) return;
    this.form = this.projectToForm(project);
    this.editing.set(true);
  }

  closeProject(): void {
    this.selectedProjectId.set("");
    this.editing.set(false);
    this.form = this.emptyForm();
  }

  cancelEdit(): void {
    const project = this.selectedProject();
    if (project) {
      this.form = this.projectToForm(project);
      this.editing.set(false);
      return;
    }
    this.closeProject();
  }

  async save(): Promise<void> {
    if (!this.form.name.trim()) {
      alert("Укажи название проекта.");
      return;
    }
    if (this.form.startDate && this.form.endDate && this.form.startDate > this.form.endDate) {
      alert("Дата начала проекта не может быть позже даты окончания.");
      return;
    }
    const payload = {
      ...this.form,
      name: this.form.name.trim(),
      budget: Number(this.form.budget || 0),
    };

    try {
      const exists = Boolean(this.state.byId(this.state.projects(), payload.id));
      if (exists) {
        await this.db.update("projects", payload.id, payload);
      } else {
        await this.db.insert("projects", payload);
      }
      this.selectedProjectId.set(payload.id);
      this.editing.set(false);
    } catch (error) {
      alert(this.saveErrorMessage(error));
    }
  }

  async remove(project: Project): Promise<void> {
    if (!confirm(`Удалить проект "${project.name}"?`)) return;
    try {
      await this.db.remove("projects", project.id);
      this.closeProject();
    } catch (error) {
      alert(this.saveErrorMessage(error));
    }
  }

  clientName(id: string): string {
    return this.state.byId(this.state.clients(), id)?.name || "—";
  }

  statusLabel(status: string): string {
    return (
      {
        new: "Новый",
        active: "В работе",
        paused: "Пауза",
        completed: "Завершен",
        cancelled: "Отменен",
      }[status] || status
    );
  }

  statusBadgeClass(status: string): string {
    return (
      {
        new: "new",
        active: "active",
        paused: "confirmed",
        completed: "completed",
        cancelled: "cancelled",
      }[status] || "new"
    );
  }

  private emptyForm() {
    return {
      id: "",
      name: "",
      clientId: "",
      startDate: "",
      endDate: "",
      status: "new" as ProjectStatus,
      budget: 0,
      location: "",
      notes: "",
      createdAt: "",
    };
  }

  private projectToForm(project: Project) {
    return {
      id: project.id,
      name: project.name || "",
      clientId: project.clientId || "",
      startDate: project.startDate || "",
      endDate: project.endDate || "",
      status: project.status || ("new" as ProjectStatus),
      budget: Number(project.budget || 0),
      location: project.location || "",
      notes: project.notes || "",
      createdAt: project.createdAt || new Date().toISOString(),
    };
  }

  private saveErrorMessage(error: any): string {
    const message = `${error?.message || ""} ${error?.details || ""}`;
    if (
      ["42P01", "PGRST205"].includes(error?.code) ||
      message.toLowerCase().includes("projects")
    ) {
      return "База Supabase еще не готова для проектов. Выполни SQL-файл supabase-projects.sql в Supabase SQL Editor и попробуй снова.";
    }
    return `Не удалось сохранить проект: ${error?.message || error}`;
  }
}
