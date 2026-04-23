import { Component } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { SupabaseService } from "../../services/supabase.service";

@Component({
  selector: "app-auth",
  standalone: true,
  imports: [FormsModule],
  templateUrl: "./auth.component.html",
  styleUrl: "./auth.component.css",
})
export class AuthComponent {
  email = "";
  password = "";
  loading = false;

  constructor(
    public supa: SupabaseService,
    private router: Router,
  ) {}

  async login(): Promise<void> {
    if (!this.email || !this.password) return;
    this.loading = true;
    await this.supa.signIn(this.email, this.password);
    this.loading = false;
    if (this.supa.isAuthenticated) {
      this.router.navigate(["/dashboard"]);
    }
  }

  async signup(): Promise<void> {
    if (!this.email || !this.password) {
      alert("Заполни email и пароль.");
      return;
    }
    this.loading = true;
    await this.supa.signUp(this.email, this.password);
    this.loading = false;
  }

  async resetPw(): Promise<void> {
    if (!this.email) {
      alert("Укажи email.");
      return;
    }
    await this.supa.resetPassword(this.email);
  }
}
