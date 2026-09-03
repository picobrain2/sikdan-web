import type { PlannerSlot } from "../types";

const KEYS = {
  fridge: "sikdan.fridge.v1",
  planner: "sikdan.planner.v1",
} as const;

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
