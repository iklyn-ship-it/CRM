import {
  ApplicationConfig,
  provideZonelessChangeDetection,
  APP_INITIALIZER,
} from "@angular/core";
import { provideRouter } from "@angular/router";
import { routes } from "./app.routes";
import { SupabaseService } from "./services/supabase.service";

function initAuth(supa: SupabaseService) {
  return () => supa.initAuth();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    {
      provide: APP_INITIALIZER,
      useFactory: initAuth,
      deps: [SupabaseService],
      multi: true,
    },
  ],
};
