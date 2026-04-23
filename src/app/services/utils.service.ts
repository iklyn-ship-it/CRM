import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UtilsService {
  uid(prefix: string): string {
    return prefix + '_' + Math.random().toString(36).slice(2, 9);
  }

  normalizeEmail(v: string): string {
    return (v || '').trim().toLowerCase();
  }

  normalizeText(v: string): string {
    return (v || '').trim().toLowerCase();
  }

  money(v: number): string {
    return '₴' + Number(v || 0).toLocaleString('uk-UA');
  }

  fmtDate(v: string): string {
    if (!v) return '—';
    return new Date(v + 'T00:00:00').toLocaleDateString('uk-UA');
  }

  daysInclusive(s: string, e: string): number {
    return Math.max(
      1,
      Math.floor(
        (new Date(e + 'T00:00:00').getTime() - new Date(s + 'T00:00:00').getTime()) / 86400000
      ) + 1
    );
  }

  overlap(a1: string, a2: string, b1: string, b2: string): boolean {
    return new Date(a1) <= new Date(b2) && new Date(b1) <= new Date(a2);
  }

  todayStr(): string {
    return new Date().toISOString().slice(0, 10);
  }

  dateOffset(base: Date, days: number): string {
    const x = new Date(base);
    x.setDate(x.getDate() + days);
    return x.toISOString().slice(0, 10);
  }
}
