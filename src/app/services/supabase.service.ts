import { Injectable, signal, inject } from "@angular/core";
import {
  createClient,
  SupabaseClient,
  Session,
  User,
  RealtimeChannel,
} from "@supabase/supabase-js";
import { environment } from "../../environments/environment";
import { UtilsService } from "./utils.service";

@Injectable({ providedIn: "root" })
export class SupabaseService {
  readonly client: SupabaseClient;
  readonly session = signal<Session | null>(null);
  readonly user = signal<User | null>(null);
  readonly authStatus = signal<{ kind: "ok" | "error"; text: string }>({
    kind: "ok",
    text: "",
  });

  private utils = inject(UtilsService);

  constructor() {
    this.client = createClient(
      environment.supabaseUrl,
      environment.supabaseAnonKey,
    );
  }

  get isAdmin(): boolean {
    return environment.adminEmails.includes(
      this.utils.normalizeEmail(this.user()?.email || ""),
    );
  }

  get isAuthenticated(): boolean {
    return !!this.user();
  }

  get userId(): string {
    return this.user()?.id || "";
  }

  async initAuth(): Promise<void> {
    const { data } = await this.client.auth.getSession();
    this.handleSession(data.session);

    this.client.auth.onAuthStateChange((_, session) => {
      this.handleSession(session);
    });
  }

  private handleSession(session: Session | null): void {
    this.session.set(session);
    this.user.set(session?.user || null);
    if (session?.user) {
      this.authStatus.set({
        kind: "ok",
        text: `Вход выполнен: ${session.user.email}`,
      });
    } else {
      this.authStatus.set({ kind: "error", text: "Не авторизован." });
    }
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      this.authStatus.set({
        kind: "error",
        text: `Ошибка входа: ${error.message}`,
      });
    }
  }

  async signUp(email: string, password: string): Promise<void> {
    const { error } = await this.client.auth.signUp({ email, password });
    if (error) {
      this.authStatus.set({
        kind: "error",
        text: `Ошибка регистрации: ${error.message}`,
      });
    } else {
      this.authStatus.set({
        kind: "ok",
        text: "Регистрация успешна. Проверь email.",
      });
    }
  }

  async resetPassword(email: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(email, {
      redirectTo: "https://supabase.com",
    });
    if (error) {
      this.authStatus.set({
        kind: "error",
        text: `Ошибка сброса пароля: ${error.message}`,
      });
    } else {
      this.authStatus.set({
        kind: "ok",
        text: "Письмо для сброса пароля отправлено.",
      });
    }
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) {
      this.authStatus.set({
        kind: "error",
        text: `Ошибка выхода: ${error.message}`,
      });
    }
  }
}
