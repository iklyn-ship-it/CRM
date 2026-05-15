import { Component, OnInit, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { StateService } from "../../services/state.service";
import {
  AccountApproval,
  SupabaseService,
} from "../../services/supabase.service";

@Component({
  selector: "app-settings",
  standalone: true,
  imports: [FormsModule],
  templateUrl: "./settings.component.html",
  styleUrl: "./settings.component.css",
})
export class SettingsComponent implements OnInit {
  state = inject(StateService);
  supa = inject(SupabaseService);

  ngOnInit(): void {
    if (this.supa.isAdmin) {
      void this.supa.loadAccountApprovals();
    }
  }

  reloadApprovals(): void {
    void this.supa.loadAccountApprovals();
  }

  approveAccount(account: AccountApproval): void {
    void this.supa.approveAccount(account.user_id, true);
  }

  blockAccount(account: AccountApproval): void {
    if (account.user_id === this.supa.userId) {
      alert("Нельзя заблокировать свой админ-аккаунт.");
      return;
    }
    void this.supa.approveAccount(account.user_id, false);
  }
}
