export type Cuisine = "korean" | "western" | "chinese" | "japanese" | "other";

export type Audience = "adult" | "child" | "both";

export type DishType = "side" | "soup" | "main" | "rice" | "snack";

export type MealTime = "breakfast" | "lunch" | "dinner";

export interface Recipe {
  id: string;
  name: string;
  cuisine: Cuisine;
  dishType: DishType;
  audience: Audience;
  mealTimes: MealTime[];
  /** minutes */
  time: number;
  /** 1 (easy) - 3 (hard) */
  difficulty: 1 | 2 | 3;
  /** ingredients that are matched against what's in the fridge */
  ingredients: string[];
  /** things you basically always have (seasonings, oil, etc.) - not matched, just shown */
  pantry?: string[];
  steps: string[];
  tip?: string;
}

export const CUISINE_LABEL: Record<Cuisine, string> = {
  korean: "한식",
  western: "양식",
  chinese: "중식",
  japanese: "일식",
  other: "기타",
};

export const DISH_TYPE_LABEL: Record<DishType, string> = {
  side: "반찬",
  soup: "국·찌개",
  main: "메인",
  rice: "밥·면",
  snack: "간식·디저트",
};

export const AUDIENCE_LABEL: Record<Audience, string> = {
  adult: "어른",
  child: "아이",
  both: "온가족",
};

export const MEAL_TIME_LABEL: Record<MealTime, string> = {
  breakfast: "아침",
  lunch: "점심",
  dinner: "저녁",
};

export const WEEKDAY_LABEL = ["월", "화", "수", "목", "금", "토", "일"] as const;

export interface PlannerSlot {
  day: number; // 0-6, matches WEEKDAY_LABEL index
  meal: MealTime;
  recipeId: string;
}

export interface FridgeState {
  ingredients: string[];
}
