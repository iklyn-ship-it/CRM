import { Component } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { StateService } from "../../services/state.service";
import { GoogleFormsService } from "../../services/google-forms.service";

@Component({
  selector: "app-integrations",
  standalone: true,
  imports: [FormsModule],
  templateUrl: "./integrations.component.html",
  styleUrl: "./integrations.component.css",
})
export class IntegrationsComponent {
  url = "";
  autoSync = false;

  constructor(
    public state: StateService,
    public gf: GoogleFormsService,
  ) {
    this.url = state.integrations().googleFormsUrl;
    this.autoSync = state.integrations().autoSync;
  }

  saveSettings(): void {
    this.gf.saveIntegrationSettings(this.url, this.autoSync);
  }

  syncNow(): void {
    this.gf.sync(true);
  }
}
