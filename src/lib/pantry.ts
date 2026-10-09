/** Common household seasonings assumed to always be on hand. */
export const PANTRY_STAPLES = [
  "소금",
  "후추",
  "설탕",
  "간장",
  "고추장",
  "된장",
  "고춧가루",
  "참기름",
  "들기름",
  "식용유",
  "올리브유",
  "식초",
  "맛술",
  "굴소스",
  "케찹",
  "마요네즈",
  "전분",
  "밀가루",
  "부침가루",
  "빵가루",
  "꿀",
  "깨",
  "육수",
  "다시마",
  "카레가루",
  "짜장가루",
  "마늘",
  "생강",
] as const;

const PANTRY_SET = new Set(PANTRY_STAPLES.map((s) => s.trim().toLowerCase()));

export function isPantryStaple(name: string): boolean {
  return PANTRY_SET.has(name.trim().toLowerCase());
}

/** Ingredients that still need to come from the fridge (not pantry staples). */
export function requiredIngredients(names: string[]): string[] {
  return names.filter((name) => !isPantryStaple(name));
}
