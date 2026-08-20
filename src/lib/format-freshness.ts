/**
 * §17 — every dynamic figure that matters (market prices, news, broker
 * account, positions, signals, health) must say when it was last
 * updated. Server-rendered (no client timer/ticking — a static "hace X"
 * computed at request time is accurate enough for a dashboard refreshed
 * by navigation, and avoids a hydration-mismatch-prone client clock).
 */
export function formatFreshness(iso: string | undefined, locale = "es-ES"): string {
  if (!iso) return "Sin fecha";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Sin fecha";

  const diffMs = Date.now() - then;
  const diffMin = Math.round(diffMs / 60_000);

  if (diffMin < 1) return "hace instantes";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;

  return new Date(iso).toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
