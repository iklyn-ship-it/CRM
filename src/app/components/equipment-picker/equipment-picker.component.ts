import {
  Component,
  EventEmitter,
  Input,
  Output,
  computed,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Equipment } from "../../models/crm.models";

@Component({
  selector: "app-equipment-picker",
  standalone: true,
  imports: [FormsModule],
  templateUrl: "./equipment-picker.component.html",
  styleUrl: "./equipment-picker.component.css",
})
export class EquipmentPickerComponent {
  private readonly equipmentSignal = signal<Equipment[]>([]);

  @Input() name = "equipmentId";
  @Input() placeholder = "— техника —";
  @Input() typePlaceholder = "Все типы";
  @Input() searchPlaceholder = "Поиск техники...";
  @Input() value = "";
  @Input() set equipment(items: Equipment[]) {
    this.equipmentSignal.set(items || []);
  }

  @Output() valueChange = new EventEmitter<string>();

  typeFilter = "";
  search = "";

  readonly types = computed(() =>
    [
      ...new Set(
        this.equipmentSignal()
          .map((item) => (item.type || "").trim())
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, "uk")),
  );

  filteredEquipment(): Equipment[] {
    const type = this.typeFilter.trim().toLowerCase();
    const query = this.search.trim().toLowerCase();
    return this.equipmentSignal().filter((item) => {
      const matchesType =
        !type || (item.type || "").trim().toLowerCase() === type;
      const haystack = [item.name, item.code, item.type]
        .join(" ")
        .toLowerCase();
      return matchesType && (!query || haystack.includes(query));
    });
  }

  select(value: string): void {
    this.value = value;
    this.valueChange.emit(value);
  }
}
