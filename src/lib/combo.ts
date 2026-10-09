import type { DishType, MealTime, Recipe } from "../types";
import { DISH_TYPE_LABEL, MEAL_TIME_LABEL } from "../types";
import type { NotifySettings } from "./storage";
import { matchIngredients, MatchedRecipe, passesFilters, shuffleDaily } from "./recommend";

export interface DailyCombo {
  mealTime: MealTime;
  sides: MatchedRecipe[];
  soups: MatchedRecipe[];
  mains: MatchedRecipe[];
  usingFridge: boolean;
}

function pickGroup(pool: MatchedRecipe[], types: DishType[], count: number, seed: number): MatchedRecipe[] {
  if (count <= 0) return [];
  const candidates = pool.filter((m) => types.includes(m.recipe.dishType));
  const shuffled = shuffleDaily(candidates).map((item, i) => ({ item, i: (i + seed) % 97 }));
  shuffled.sort((a, b) => {
    if (b.item.score !== a.item.score) return b.item.score - a.item.score;
    if (a.item.missing.length !== b.item.missing.length) return a.item.missing.length - b.item.missing.length;
    return a.i - b.i;
  });

  const picked: MatchedRecipe[] = [];
  const used = new Set<string>();
  for (const { item } of shuffled) {
    if (picked.length >= count) break;
    if (used.has(item.recipe.id)) continue;
    picked.push(item);
    used.add(item.recipe.id);
  }
  return picked;
}

export function buildDailyCombo(recipes: Recipe[], fridge: string[], settings: NotifySettings): DailyCombo {
  const mealTime = settings.mealTime;
  const filtered = recipes.filter((r) =>
    passesFilters(r, { audience: "all", dishType: "all", cuisine: "all", mealTime })
  );
  const usingFridge = fridge.length > 0;
  const matches = usingFridge
    ? filtered
        .map((r) => matchIngredients(r, fridge))
        .filter((m) => m.haveCount > 0)
    : shuffleDaily(filtered).map((recipe) => matchIngredients(recipe, []));

  return {
    mealTime,
    usingFridge,
    sides: pickGroup(matches, ["side"], settings.sideCount, 1),
    soups: pickGroup(matches, ["soup"], settings.soupCount, 3),
    mains: pickGroup(matches, ["main", "rice"], settings.mainCount, 5),
  };
}

export function comboIsEmpty(combo: DailyCombo): boolean {
  return combo.sides.length + combo.soups.length + combo.mains.length === 0;
}

export function formatComboBody(combo: DailyCombo): string {
  const parts: string[] = [];
  if (combo.sides.length) {
    parts.push(`반찬 ${combo.sides.map((m) => m.recipe.name).join(", ")}`);
  }
  if (combo.soups.length) {
    parts.push(`국 ${combo.soups.map((m) => m.recipe.name).join(", ")}`);
  }
  if (combo.mains.length) {
    parts.push(`메인 ${combo.mains.map((m) => m.recipe.name).join(", ")}`);
  }
  if (!parts.length) {
    return "오늘은 맞는 메뉴가 없어요. 냉장고 재료를 확인해 보세요.";
  }
  return `${MEAL_TIME_LABEL[combo.mealTime]} · ${parts.join(" · ")}`;
}

export function formatComboTitle(combo: DailyCombo): string {
  return `오늘 뭐 먹지? ${MEAL_TIME_LABEL[combo.mealTime]} 한 상`;
}

export function comboGroups(combo: DailyCombo): { label: string; items: MatchedRecipe[] }[] {
  return [
    { label: DISH_TYPE_LABEL.side, items: combo.sides },
    { label: DISH_TYPE_LABEL.soup, items: combo.soups },
    { label: DISH_TYPE_LABEL.main, items: combo.mains },
  ].filter((g) => g.items.length > 0);
}
