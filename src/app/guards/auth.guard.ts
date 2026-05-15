import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { SupabaseService } from "../services/supabase.service";

export const authGuard: CanActivateFn = () => {
  const supa = inject(SupabaseService);
  const router = inject(Router);

  if (!supa.isAuthenticated) {
    return router.createUrlTree(["/login"]);
  }

  if (supa.isApproved) {
    return true;
  }

  return supa.ensureAccountApproval().then((approved) => {
    if (approved) return true;
    return router.createUrlTree(["/pending"]);
  });
};

export const loginGuard: CanActivateFn = () => {
  const supa = inject(SupabaseService);
  const router = inject(Router);

  if (!supa.isAuthenticated) {
    return true;
  }

  if (supa.isApproved) {
    return router.createUrlTree(["/dashboard"]);
  }

  return supa
    .ensureAccountApproval()
    .then((approved) =>
      router.createUrlTree([approved ? "/dashboard" : "/pending"]),
    );
};

export const pendingGuard: CanActivateFn = () => {
  const supa = inject(SupabaseService);
  const router = inject(Router);

  if (!supa.isAuthenticated) {
    return router.createUrlTree(["/login"]);
  }

  if (supa.isApproved) {
    return router.createUrlTree(["/dashboard"]);
  }

  return supa.ensureAccountApproval().then((approved) => {
    if (approved) return router.createUrlTree(["/dashboard"]);
    return true;
  });
};
