import type { MealTime, PlannerSlot } from "../types";

const KEYS = {
  fridge: "sikdan.fridge.v1",
  planner: "sikdan.planner.v1",
  notify: "sikdan.notify.v1",
  lastNotify: "sikdan.notify.last.v1",
} as const;

export interface NotifySettings {
  enabled: boolean;
  time: string;
  mealTime: MealTime;
  sideCount: number;
  soupCount: number;
  mainCount: number;
}

export const DEFAULT_NOTIFY: NotifySettings = {
  enabled: false,
  time: "07:30",
  mealTime: "dinner",
  sideCount: 2,
  soupCount: 1,
  mainCount: 1,
};

function safeGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode, quota, etc.) - fail silently
  }
}

export function loadFridge(): string[] {
  return safeGet<string[]>(KEYS.fridge, []);
}

export function saveFridge(ingredients: string[]): void {
  safeSet(KEYS.fridge, ingredients);
}

export function loadPlanner(): PlannerSlot[] {
  return safeGet<PlannerSlot[]>(KEYS.planner, []);
}

export function savePlanner(slots: PlannerSlot[]): void {
  safeSet(KEYS.planner, slots);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function loadNotifySettings(): NotifySettings {
  const raw = safeGet<Partial<NotifySettings>>(KEYS.notify, {});
  return {
    enabled: Boolean(raw.enabled),
    time: typeof raw.time === "string" && /^\d{2}:\d{2}$/.test(raw.time) ? raw.time : DEFAULT_NOTIFY.time,
    mealTime: raw.mealTime === "breakfast" || raw.mealTime === "lunch" || raw.mealTime === "dinner"
      ? raw.mealTime
      : DEFAULT_NOTIFY.mealTime,
    sideCount: clamp(Number(raw.sideCount ?? DEFAULT_NOTIFY.sideCount), 0, 4),
    soupCount: clamp(Number(raw.soupCount ?? DEFAULT_NOTIFY.soupCount), 0, 2),
    mainCount: clamp(Number(raw.mainCount ?? DEFAULT_NOTIFY.mainCount), 0, 2),
  };
}

export function saveNotifySettings(settings: NotifySettings): void {
  safeSet(KEYS.notify, settings);
}

export function todayKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function loadLastNotifyDate(): string | null {
  return safeGet<string | null>(KEYS.lastNotify, null);
}

export function saveLastNotifyDate(day: string): void {
  safeSet(KEYS.lastNotify, day);
}
