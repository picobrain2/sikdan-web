import type { Audience, Cuisine, DishType, Recipe } from "../types";

export interface Filters {
  audience: Audience | "all";
  dishType: DishType | "all";
  cuisine: Cuisine | "all";
}

export const DEFAULT_FILTERS: Filters = {
  audience: "all",
  dishType: "all",
  cuisine: "all",
};

export interface MatchedRecipe {
  recipe: Recipe;
  haveCount: number;
  totalCount: number;
  missing: string[];
  /** 0..1, how much of the recipe's ingredients are already in the fridge */
  score: number;
  /** true when every ingredient is already available */
  isFullMatch: boolean;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export function matchIngredients(recipe: Recipe, fridge: string[]): MatchedRecipe {
  const fridgeSet = new Set(fridge.map(normalize));
  const total = recipe.ingredients.length;
  const missing = recipe.ingredients.filter((ing) => !fridgeSet.has(normalize(ing)));
  const haveCount = total - missing.length;
  const score = total === 0 ? 1 : haveCount / total;
  return {
    recipe,
    haveCount,
    totalCount: total,
    missing,
    score,
    isFullMatch: missing.length === 0,
  };
}

export function passesFilters(recipe: Recipe, filters: Filters): boolean {
  if (filters.cuisine !== "all" && recipe.cuisine !== filters.cuisine) return false;
  if (filters.dishType !== "all" && recipe.dishType !== filters.dishType) return false;
  if (filters.audience !== "all") {
    if (recipe.audience !== "both" && recipe.audience !== filters.audience) return false;
  }
  return true;
}

/** A cheap deterministic daily shuffle so "no ingredients" recommendations feel fresh every day. */
function dailySeed(): number {
  const d = new Date();
  return d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate();
}

function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function shuffleDaily<T>(arr: T[]): T[] {
  const rand = seededRandom(dailySeed());
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export interface RecommendResult {
  matches: MatchedRecipe[];
  usingFridge: boolean;
}

export function recommend(
  recipes: Recipe[],
  fridge: string[],
  filters: Filters
): RecommendResult {
  const filtered = recipes.filter((r) => passesFilters(r, filters));
  const usingFridge = fridge.length > 0;

  if (!usingFridge) {
    const shuffled = shuffleDaily(filtered);
    return {
      usingFridge,
      matches: shuffled.map((recipe) => ({
        recipe,
        haveCount: 0,
        totalCount: recipe.ingredients.length,
        missing: recipe.ingredients,
        score: 0,
        isFullMatch: false,
      })),
    };
  }

  const matched = filtered
    .map((r) => matchIngredients(r, fridge))
    .filter((m) => m.haveCount > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.missing.length !== b.missing.length) return a.missing.length - b.missing.length;
      return a.recipe.name.localeCompare(b.recipe.name, "ko");
    });

  return { usingFridge, matches: matched };
}

export function pickRandom(recipes: Recipe[], filters: Filters): Recipe | null {
  const pool = recipes.filter((r) => passesFilters(r, filters));
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
