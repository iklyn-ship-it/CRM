import { Component, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { StateService } from "../../services/state.service";
import { SupabaseService } from "../../services/supabase.service";

@Component({
  selector: "app-settings",
  standalone: true,
  imports: [FormsModule],
  templateUrl: "./settings.component.html",
  styleUrl: "./settings.component.css",
})
export class SettingsComponent {
  state = inject(StateService);
  supa = inject(SupabaseService);
}
