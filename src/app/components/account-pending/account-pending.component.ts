import { Component, inject } from "@angular/core";
import { Router } from "@angular/router";
import { SupabaseService } from "../../services/supabase.service";

@Component({
  selector: "app-account-pending",
  standalone: true,
  templateUrl: "./account-pending.component.html",
  styleUrl: "./account-pending.component.css",
})
export class AccountPendingComponent {
  supa = inject(SupabaseService);
  private router = inject(Router);

  async checkAccess(): Promise<void> {
    const approved = await this.supa.ensureAccountApproval();
    if (approved) {
      await this.router.navigate(["/dashboard"]);
    }
  }

  async signOut(): Promise<void> {
    await this.supa.signOut();
    await this.router.navigate(["/login"]);
  }
}
