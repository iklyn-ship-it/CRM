import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { SupabaseService } from "../services/supabase.service";

export const authGuard: CanActivateFn = () => {
  const supa = inject(SupabaseService);
  const router = inject(Router);

  if (supa.isAuthenticated) {
    return true;
  }
  return router.createUrlTree(["/login"]);
};

export const loginGuard: CanActivateFn = () => {
  const supa = inject(SupabaseService);
  const router = inject(Router);

  if (!supa.isAuthenticated) {
    return true;
  }
  return router.createUrlTree(["/dashboard"]);
};
