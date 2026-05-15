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

export interface AccountApproval {
  user_id: string;
  email: string;
  approved: boolean;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
}

@Injectable({ providedIn: "root" })
export class SupabaseService {
  readonly client: SupabaseClient;
  readonly session = signal<Session | null>(null);
  readonly user = signal<User | null>(null);
  readonly accountApproval = signal<AccountApproval | null>(null);
  readonly accountApprovals = signal<AccountApproval[]>([]);
  readonly approvalLoaded = signal(false);
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

  get isApproved(): boolean {
    return this.isAdmin || !!this.accountApproval()?.approved;
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
    this.accountApproval.set(null);
    this.approvalLoaded.set(false);
    if (session?.user) {
      this.authStatus.set({
        kind: "ok",
        text: `Вход выполнен: ${session.user.email}`,
      });
      void this.ensureAccountApproval();
    } else {
      this.authStatus.set({ kind: "error", text: "Не авторизован." });
    }
  }

  async signIn(email: string, password: string): Promise<void> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      this.authStatus.set({
        kind: "error",
        text: `Ошибка входа: ${error.message}`,
      });
      return;
    }

    if (data.session) {
      this.handleSession(data.session);
    }

    const approved = await this.ensureAccountApproval();
    if (!approved) {
      this.authStatus.set({
        kind: "ok",
        text: "Вход выполнен. Аккаунт ожидает активации администратором.",
      });
    }
  }

  async signUp(email: string, password: string): Promise<void> {
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) {
      this.authStatus.set({
        kind: "error",
        text: `Ошибка регистрации: ${error.message}`,
      });
    } else if (data.session?.user) {
      this.handleSession(data.session);
      await this.ensureAccountApproval();
      this.authStatus.set({
        kind: "ok",
        text: "Регистрация создана. Аккаунт ожидает активации администратором.",
      });
    } else {
      this.authStatus.set({
        kind: "ok",
        text: "Регистрация успешна. Проверь email, затем администратор активирует аккаунт.",
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
    } else {
      this.accountApproval.set(null);
      this.accountApprovals.set([]);
      this.approvalLoaded.set(false);
    }
  }

  async ensureAccountApproval(): Promise<boolean> {
    const user = this.user();
    if (!user) {
      this.accountApproval.set(null);
      this.approvalLoaded.set(true);
      return false;
    }

    const email = this.utils.normalizeEmail(user.email || "");
    const admin = this.isAdmin;

    try {
      const { data: existing, error: selectError } = await this.client
        .from("account_approvals")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle<AccountApproval>();

      if (selectError) throw selectError;

      if (existing) {
        const approval =
          admin && !existing.approved
            ? await this.setOwnAdminApproval(user.id, email)
            : existing;
        this.accountApproval.set(approval);
        this.approvalLoaded.set(true);
        return approval.approved || admin;
      }

      const approval = admin
        ? await this.setOwnAdminApproval(user.id, email)
        : await this.createPendingApproval(user.id, email);

      this.accountApproval.set(approval);
      this.approvalLoaded.set(true);
      return approval.approved || admin;
    } catch (error) {
      this.approvalLoaded.set(true);
      this.authStatus.set({
        kind: "error",
        text: `База Supabase еще не готова для активации аккаунтов. Выполни SQL-файл supabase-account-approvals.sql в Supabase SQL Editor и попробуй снова. ${this.errorMessage(error)}`,
      });
      return admin;
    }
  }

  async loadAccountApprovals(): Promise<void> {
    if (!this.isAdmin) return;

    const { data, error } = await this.client
      .from("account_approvals")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      this.authStatus.set({
        kind: "error",
        text: `Не удалось загрузить аккаунты: ${error.message}`,
      });
      return;
    }

    this.accountApprovals.set((data || []) as AccountApproval[]);
  }

  async approveAccount(userId: string, approved: boolean): Promise<void> {
    if (!this.isAdmin) return;

    const { error } = await this.client
      .from("account_approvals")
      .update({
        approved,
        approved_at: approved ? new Date().toISOString() : null,
        approved_by: approved ? this.userId : null,
      })
      .eq("user_id", userId);

    if (error) {
      this.authStatus.set({
        kind: "error",
        text: `Не удалось изменить доступ: ${error.message}`,
      });
      return;
    }

    await this.loadAccountApprovals();
    this.authStatus.set({
      kind: "ok",
      text: approved ? "Аккаунт активирован." : "Аккаунт заблокирован.",
    });
  }

  private async createPendingApproval(
    userId: string,
    email: string,
  ): Promise<AccountApproval> {
    const { data, error } = await this.client
      .from("account_approvals")
      .insert({ user_id: userId, email, approved: false })
      .select("*")
      .single<AccountApproval>();

    if (error) throw error;
    return data;
  }

  private async setOwnAdminApproval(
    userId: string,
    email: string,
  ): Promise<AccountApproval> {
    const { data, error } = await this.client
      .from("account_approvals")
      .upsert({
        user_id: userId,
        email,
        approved: true,
        approved_at: new Date().toISOString(),
        approved_by: userId,
      })
      .select("*")
      .single<AccountApproval>();

    if (error) throw error;
    return data;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "";
  }
}
