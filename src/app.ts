import { ALL_INGREDIENTS, INGREDIENT_GROUPS } from "./data/ingredients";
import { RECIPES } from "./data/recipes";
import { buildDailyCombo, comboGroups, comboIsEmpty, DailyCombo } from "./lib/combo";
import {
  armNotifySchedule,
  notificationPermission,
  notificationSupported,
  requestNotificationPermission,
  showComboNotification,
} from "./lib/notify";
import { isPantryStaple } from "./lib/pantry";
import {
  DEFAULT_FILTERS,
  Filters,
  MatchedRecipe,
  pickRandom,
  recommend,
} from "./lib/recommend";
import {
  loadFridge,
  loadNotifySettings,
  loadPlanner,
  NotifySettings,
  saveFridge,
  saveNotifySettings,
  savePlanner,
} from "./lib/storage";
import {
  AUDIENCE_LABEL,
  CUISINE_LABEL,
  DISH_TYPE_LABEL,
  MEAL_TIME_LABEL,
  MealTime,
  PlannerSlot,
  Recipe,
  WEEKDAY_LABEL,
} from "./types";

// ───────────────────────── state ─────────────────────────

let fridge: string[] = loadFridge();
let filters: Filters = { ...DEFAULT_FILTERS };
let planner: PlannerSlot[] = loadPlanner();
let notify: NotifySettings = loadNotifySettings();
let notifyStatus = "";
let ingredientQuery = "";
let openCategory: string | null = INGREDIENT_GROUPS[0]?.label ?? null;

let activeRecipeId: string | null = null;
let plannerAssignTarget: { day: number; meal: MealTime } | null = null; // opens recipe-detail modal in "assign" mode
let plannerPickerTarget: { day: number; meal: MealTime } | null = null; // opens plain picker modal
let plannerPickerQuery = "";

const MEAL_ORDER: MealTime[] = ["breakfast", "lunch", "dinner"];

function todayIndex(): number {
  const jsDay = new Date().getDay(); // 0 = Sunday
  return jsDay === 0 ? 6 : jsDay - 1; // shift to 0 = Monday ... 6 = Sunday
}

let plannerDay: number = todayIndex();

// ───────────────────────── helpers ─────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function findRecipe(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}

function difficultyStars(n: number): string {
  return "★".repeat(n) + "☆".repeat(3 - n);
}

function cuisineBadgeClass(c: Recipe["cuisine"]): string {
  return `tag tag-cuisine-${c}`;
}

function currentCombo(): DailyCombo {
  return buildDailyCombo(RECIPES, fridge, notify);
}

function persistNotify(next: NotifySettings): void {
  notify = next;
  saveNotifySettings(notify);
}

// ───────────────────────── root render ─────────────────────────

let root: HTMLElement;

export function render(): void {
  root = document.getElementById("app")!;
  root.innerHTML = renderApp();
  bindEvents();
  registerServiceWorker();
  armNotifySchedule(notify, currentCombo());
}

function renderApp(): string {
  return `
    <div class="app">
      <header class="topbar">
        <h1>🍚 오늘 뭐 먹지?</h1>
        <p class="subtitle">냉장고 재료를 알려주면 만들 수 있는 반찬·국·메인을 추천해드려요</p>
      </header>
      <main class="content">
        ${renderFridgeCard()}
        ${renderNotifyCard()}
        ${renderComboCard()}
        ${renderFilterCard()}
        ${renderResultsCard()}
        ${renderPlannerCard()}
      </main>
      <footer class="app-footer">냉장고 속 재료는 이 기기에만 저장돼요 🔒</footer>
      ${renderModal()}
    </div>
  `;
}

// ───────────────────────── fridge card ─────────────────────────

function renderFridgeCard(): string {
  const selectedChips = fridge
    .map(
      (ing) => `
      <span class="chip chip-selected" data-selected-ingredient="${esc(ing)}">
        ${esc(ing)}
        <button type="button" class="chip-x" data-action="remove-ingredient" data-ingredient="${esc(ing)}" aria-label="${esc(ing)} 삭제">×</button>
      </span>`
    )
    .join("");

  const query = ingredientQuery.trim();
  let suggestionHtml = "";
  if (query) {
    const q = query.toLowerCase();
    const matches = ALL_INGREDIENTS.filter(
      (i) => i.toLowerCase().includes(q) && !fridge.includes(i)
    ).slice(0, 24);
    suggestionHtml = `
      <div class="suggestion-row">
        ${
          matches.length
            ? matches
                .map(
                  (i) =>
                    `<button type="button" class="chip chip-suggest" data-action="add-ingredient" data-ingredient="${esc(i)}">+ ${esc(i)}</button>`
                )
                .join("")
            : `<button type="button" class="chip chip-suggest chip-custom" data-action="add-ingredient" data-ingredient="${esc(query)}">"${esc(query)}" 직접 추가하기 +</button>`
        }
      </div>`;
  }

  const categoryTabs = INGREDIENT_GROUPS.map(
    (g) => `
      <button type="button" class="cat-tab ${openCategory === g.label ? "active" : ""}" data-action="toggle-category" data-category="${esc(g.label)}">
        ${esc(g.label)}
      </button>`
  ).join("");

  const activeGroup = INGREDIENT_GROUPS.find((g) => g.label === openCategory);
  const groupChips = activeGroup
    ? activeGroup.items
        .map((item) => {
          const isSelected = fridge.includes(item);
          return `<button type="button" class="chip ${isSelected ? "chip-on" : ""}" data-action="${isSelected ? "remove-ingredient" : "add-ingredient"}" data-ingredient="${esc(item)}">${esc(item)}</button>`;
        })
        .join("")
    : "";

  return `
    <section class="card">
      <div class="card-head">
        <h2>🧊 냉장고 재료</h2>
        ${fridge.length ? `<button type="button" class="btn-ghost btn-sm" data-action="clear-fridge">비우기</button>` : ""}
      </div>

      <div class="fridge-search">
        <input
          type="text"
          id="ingredient-input"
          placeholder="재료를 검색하거나 입력해보세요 (예: 감자, 돼지고기...)"
          value="${esc(ingredientQuery)}"
        />
      </div>
      ${suggestionHtml}

      ${
        fridge.length
          ? `<div class="chip-row selected-row">${selectedChips}</div>`
          : `<p class="hint">아직 넣은 재료가 없어요. 재료 없이도 아래에서 추천을 받을 수 있어요!</p>`
      }
      <p class="hint">소금·간장·기름·마늘 같은 기본 양념은 집에 있는 걸로 계산해요.</p>

      <div class="cat-tabs">${categoryTabs}</div>
      <div class="chip-row browse-row">${groupChips}</div>
    </section>
  `;
}

// ───────────────────────── filter card ─────────────────────────

function filterGroup(
  group: keyof Filters,
  label: string,
  options: { value: string; label: string }[]
): string {
  const buttons = options
    .map(
      (o) =>
        `<button type="button" class="filter-btn ${filters[group] === o.value ? "active" : ""}" data-action="set-filter" data-group="${group}" data-value="${o.value}">${esc(o.label)}</button>`
    )
    .join("");
  return `
    <div class="filter-row">
      <span class="filter-label">${label}</span>
      <div class="filter-group">${buttons}</div>
    </div>
  `;
}

function stepper(field: "sideCount" | "soupCount" | "mainCount", label: string, value: number, min: number, max: number): string {
  return `
    <div class="stepper">
      <span class="stepper-label">${label}</span>
      <div class="stepper-controls">
        <button type="button" class="stepper-btn" data-action="nudge-notify" data-field="${field}" data-delta="-1" ${value <= min ? "disabled" : ""} aria-label="${label} 줄이기">−</button>
        <span class="stepper-value">${value}</span>
        <button type="button" class="stepper-btn" data-action="nudge-notify" data-field="${field}" data-delta="1" ${value >= max ? "disabled" : ""} aria-label="${label} 늘리기">+</button>
      </div>
    </div>
  `;
}

function permissionHint(): string {
  const perm = notificationPermission();
  if (!notificationSupported() || perm === "unsupported") {
    return "이 브라우저는 알림을 지원하지 않아요. 홈 화면에 추가한 뒤 다시 시도해 보세요.";
  }
  if (perm === "denied") {
    return "알림이 차단되어 있어요. 브라우저 설정에서 허용해 주세요.";
  }
  if (perm === "granted" && notify.enabled) {
    return `매일 ${notify.time}에 냉장고 재료로 만든 한 상을 알려줄게요. 아이폰은 홈 화면에 추가해야 알림이 와요.`;
  }
  if (perm === "granted") {
    return "알림 권한은 있어요. 켜면 설정한 시간에 추천이 옵니다.";
  }
  return "알림을 켜면 권한을 요청해요. 아이폰은 홈 화면에 추가한 뒤에만 알림이 와요.";
}

function renderNotifyCard(): string {
  return `
    <section class="card notify-card" id="notify-card">
      <div class="card-head">
        <h2>🔔 매일 알림</h2>
        <button type="button" class="btn-ghost btn-sm ${notify.enabled ? "btn-on" : ""}" data-action="toggle-notify">
          ${notify.enabled ? "켜짐" : "꺼짐"}
        </button>
      </div>
      <div class="notify-row">
        <label class="notify-field">시간
          <input type="time" id="notify-time" value="${esc(notify.time)}" />
        </label>
        <div class="notify-field">
          <span>추천 끼니</span>
          <div class="filter-group">
            ${(["breakfast", "lunch", "dinner"] as MealTime[])
              .map(
                (m) =>
                  `<button type="button" class="filter-btn ${notify.mealTime === m ? "active" : ""}" data-action="set-notify-meal" data-value="${m}">${MEAL_TIME_LABEL[m]}</button>`
              )
              .join("")}
          </div>
        </div>
      </div>
      <div class="stepper-row">
        ${stepper("sideCount", "반찬", notify.sideCount, 0, 4)}
        ${stepper("soupCount", "국·찌개", notify.soupCount, 0, 2)}
        ${stepper("mainCount", "메인", notify.mainCount, 0, 2)}
      </div>
      <p class="hint">${esc(permissionHint())}</p>
      ${notifyStatus ? `<p class="hint notify-status">${esc(notifyStatus)}</p>` : ""}
      <div class="notify-actions">
        <button type="button" class="btn-ghost" data-action="test-notify">지금 알림 보내보기</button>
      </div>
    </section>
  `;
}

function renderComboCard(): string {
  const combo = currentCombo();
  const groups = comboGroups(combo);
  const empty = comboIsEmpty(combo);
  const firstMain = combo.mains[0];

  const groupHtml = empty
    ? `<p class="hint empty-hint">조건에 맞는 한 상이 없어요. 냉장고 재료를 더 넣거나 개수를 줄여 보세요.</p>`
    : groups
        .map(
          (g) => `
        <div class="combo-group">
          <h3>${esc(g.label)}</h3>
          <div class="combo-list">
            ${g.items
              .map((m) => {
                const badge = fridge.length
                  ? m.isFullMatch
                    ? `<span class="badge badge-full">바로 가능</span>`
                    : `<span class="badge badge-partial">${m.missing.length}개 부족</span>`
                  : "";
                return `
                  <button type="button" class="combo-item" data-action="open-recipe" data-recipe-id="${m.recipe.id}">
                    <span class="combo-item-name">${esc(m.recipe.name)}</span>
                    <span class="combo-item-meta">⏱ ${m.recipe.time}분 ${badge}</span>
                    ${!m.isFullMatch && fridge.length ? `<span class="missing-line">부족한 재료: ${m.missing.map(esc).join(", ")}</span>` : ""}
                  </button>`;
              })
              .join("")}
          </div>
        </div>`
        )
        .join("");

  return `
    <section class="card combo-card" id="today-combo">
      <div class="card-head">
        <h2>🍽 오늘의 ${MEAL_TIME_LABEL[combo.mealTime]} 한 상</h2>
      </div>
      <p class="hint">${
        fridge.length
          ? "냉장고에 있는 재료로 만들 수 있는 조합이에요. 기본 양념은 있는 걸로 봤어요."
          : "냉장고 재료가 없어서 오늘의 추천으로 한 상을 골랐어요."
      }</p>
      ${groupHtml}
      ${
        firstMain
          ? `<button type="button" class="btn-primary btn-block" data-action="assign-combo-main" data-recipe-id="${firstMain.recipe.id}">메인 요리를 식단표에 넣기</button>`
          : ""
      }
    </section>
  `;
}

function renderFilterCard(): string {
  return `
    <section class="card">
      ${filterGroup("mealTime", "끼니", [
        { value: "all", label: "전체" },
        { value: "breakfast", label: "아침" },
        { value: "lunch", label: "점심" },
        { value: "dinner", label: "저녁" },
      ])}
      ${filterGroup("audience", "대상", [
        { value: "all", label: "전체" },
        { value: "adult", label: "어른용" },
        { value: "child", label: "아이용" },
      ])}
      ${filterGroup("dishType", "종류", [
        { value: "all", label: "전체" },
        { value: "side", label: "반찬" },
        { value: "soup", label: "국·찌개" },
        { value: "main", label: "메인" },
        { value: "rice", label: "밥·면" },
        { value: "snack", label: "간식" },
      ])}
      ${filterGroup("cuisine", "나라별", [
        { value: "all", label: "전체" },
        { value: "korean", label: "한식" },
        { value: "western", label: "양식" },
        { value: "chinese", label: "중식" },
        { value: "japanese", label: "일식" },
        { value: "other", label: "기타" },
      ])}
      <button type="button" class="btn-accent random-btn" data-action="random-pick">🎲 오늘의 랜덤 추천</button>
    </section>
  `;
}

// ───────────────────────── results card ─────────────────────────

function renderRecipeCard(m: MatchedRecipe, usingFridge: boolean): string {
  const r = m.recipe;
  let badge = "";
  if (usingFridge) {
    badge = m.isFullMatch
      ? `<span class="badge badge-full">냉장고 재료로 바로 OK ✅</span>`
      : `<span class="badge badge-partial">${m.missing.length}개만 더 있으면 돼요</span>`;
  }
  return `
    <button type="button" class="recipe-card" data-action="open-recipe" data-recipe-id="${r.id}">
      <div class="recipe-card-tags">
        <span class="${cuisineBadgeClass(r.cuisine)}">${CUISINE_LABEL[r.cuisine]}</span>
        <span class="tag tag-dish">${DISH_TYPE_LABEL[r.dishType]}</span>
        <span class="tag tag-audience">${AUDIENCE_LABEL[r.audience]}</span>
      </div>
      <h3>${esc(r.name)}</h3>
      <div class="recipe-card-meta">
        <span>⏱ ${r.time}분</span>
        <span>${difficultyStars(r.difficulty)}</span>
      </div>
      ${badge}
      ${usingFridge && !m.isFullMatch ? `<p class="missing-line">부족한 재료: ${m.missing.map(esc).join(", ")}</p>` : ""}
    </button>
  `;
}

function renderResultsCard(): string {
  const { matches, usingFridge } = recommend(RECIPES, fridge, filters);
  const title = usingFridge
    ? `냉장고 재료로 만들 수 있는 요리 (${matches.length})`
    : `오늘의 추천 (재료 없이도 OK)`;

  const body = matches.length
    ? `<div class="results-grid">${matches.map((m) => renderRecipeCard(m, usingFridge)).join("")}</div>`
    : `<p class="hint empty-hint">조건에 맞는 요리를 찾지 못했어요. 필터를 조금 넓혀볼까요?</p>`;

  return `
    <section class="card">
      <div class="card-head">
        <h2>🍽 ${esc(title)}</h2>
      </div>
      ${body}
    </section>
  `;
}

// ───────────────────────── planner card ─────────────────────────

function plannerSlot(day: number, meal: MealTime): PlannerSlot | undefined {
  return planner.find((s) => s.day === day && s.meal === meal);
}

function renderPlannerCard(): string {
  const today = todayIndex();

  const dayTabs = WEEKDAY_LABEL.map((d, day) => {
    const filledCount = planner.filter((s) => s.day === day).length;
    const classes = [
      "day-tab",
      day === plannerDay ? "active" : "",
      day === today ? "is-today" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return `
      <button type="button" class="${classes}" data-action="set-planner-day" data-day="${day}">
        <span class="day-tab-label">${d}</span>
        ${filledCount ? `<span class="day-tab-dot"></span>` : ""}
      </button>`;
  }).join("");

  const mealRows = MEAL_ORDER.map((meal) => {
    const slot = plannerSlot(plannerDay, meal);
    let body: string;
    if (slot) {
      const recipe = findRecipe(slot.recipeId);
      body = `
        <div class="meal-slot filled">
          <button type="button" class="meal-slot-name" data-action="open-recipe" data-recipe-id="${slot.recipeId}">
            ${recipe ? `<span class="${cuisineBadgeClass(recipe.cuisine)}">${CUISINE_LABEL[recipe.cuisine]}</span> ${esc(recipe.name)}` : "(삭제된 레시피)"}
          </button>
          <button type="button" class="meal-slot-x" data-action="remove-planner-slot" data-day="${plannerDay}" data-meal="${meal}" aria-label="삭제">×</button>
        </div>`;
    } else {
      body = `
        <button type="button" class="meal-slot empty" data-action="open-planner-picker" data-day="${plannerDay}" data-meal="${meal}">
          + 메뉴 추가
        </button>`;
    }
    return `
      <div class="meal-row">
        <div class="meal-row-label">${MEAL_TIME_LABEL[meal]}</div>
        ${body}
      </div>`;
  }).join("");

  return `
    <section class="card planner-card">
      <div class="card-head">
        <h2>📅 이번 주 식단표</h2>
        ${planner.length ? `<button type="button" class="btn-ghost btn-sm" data-action="reset-planner">초기화</button>` : ""}
      </div>
      <div class="day-tabs">${dayTabs}</div>
      <div class="meal-rows">${mealRows}</div>
      <p class="hint">추천 카드나 레시피를 보다가 "식단표에 추가"를 눌러도 바로 넣을 수 있어요.</p>
    </section>
  `;
}

// ───────────────────────── modal ─────────────────────────

function renderModal(): string {
  if (activeRecipeId) return renderRecipeModal(activeRecipeId);
  if (plannerPickerTarget) return renderPickerModal(plannerPickerTarget);
  return "";
}

function renderRecipeModal(id: string): string {
  const r = findRecipe(id);
  if (!r) return "";
  const fridgeSet = new Set(fridge.map((i) => i.trim().toLowerCase()));

  const ingredientsHtml = r.ingredients
    .map((ing) => {
      const has = fridgeSet.has(ing.trim().toLowerCase()) || isPantryStaple(ing);
      const mark = isPantryStaple(ing) ? "🧂" : has ? "✅" : "▫️";
      return `<li class="${has ? "have" : "missing"}">${mark} ${esc(ing)}${isPantryStaple(ing) ? " <small>기본 양념</small>" : ""}</li>`;
    })
    .join("");

  const pantryHtml = r.pantry?.length
    ? `<p class="pantry-line">기본 양념: ${r.pantry.map(esc).join(", ")}</p>`
    : "";

  const stepsHtml = r.steps.map((s) => `<li>${esc(s)}</li>`).join("");

  const showAssignPicker = plannerAssignTarget !== null;
  const assignPickerHtml = showAssignPicker
    ? `
      <div class="assign-picker">
        <label>요일
          <select id="assign-day">
            ${WEEKDAY_LABEL.map((d, i) => `<option value="${i}" ${plannerAssignTarget!.day === i ? "selected" : ""}>${d}</option>`).join("")}
          </select>
        </label>
        <label>끼니
          <select id="assign-meal">
            ${MEAL_ORDER.map((m) => `<option value="${m}" ${plannerAssignTarget!.meal === m ? "selected" : ""}>${MEAL_TIME_LABEL[m]}</option>`).join("")}
          </select>
        </label>
        <button type="button" class="btn-primary" data-action="confirm-assign" data-recipe-id="${r.id}">이 칸에 넣기</button>
      </div>`
    : "";

  return `
    <div class="modal-bg" data-action="close-modal">
      <div class="modal" data-stop-propagation>
        <div class="modal-head">
          <div class="recipe-card-tags">
            <span class="${cuisineBadgeClass(r.cuisine)}">${CUISINE_LABEL[r.cuisine]}</span>
            <span class="tag tag-dish">${DISH_TYPE_LABEL[r.dishType]}</span>
            <span class="tag tag-audience">${AUDIENCE_LABEL[r.audience]}</span>
          </div>
          <button type="button" class="modal-close" data-action="close-modal" aria-label="닫기">×</button>
        </div>
        <h2>${esc(r.name)}</h2>
        <div class="recipe-card-meta">
          <span>⏱ ${r.time}분</span>
          <span>${difficultyStars(r.difficulty)}</span>
          <span>${r.mealTimes.map((m) => MEAL_TIME_LABEL[m]).join("·")}</span>
        </div>

        <h3>재료</h3>
        <ul class="ingredient-list">${ingredientsHtml}</ul>
        ${pantryHtml}

        <h3>조리법</h3>
        <ol class="steps-list">${stepsHtml}</ol>

        ${
          !showAssignPicker
            ? `<button type="button" class="btn-primary btn-block" data-action="start-assign" data-recipe-id="${r.id}">📅 이번 주 식단표에 추가</button>`
            : assignPickerHtml
        }
      </div>
    </div>
  `;
}

function renderPickerModal(target: { day: number; meal: MealTime }): string {
  const q = plannerPickerQuery.trim().toLowerCase();
  const list = RECIPES.filter((r) => (q ? r.name.toLowerCase().includes(q) : true)).slice(0, 60);

  const items = list
    .map(
      (r) => `
      <button type="button" class="picker-item" data-action="assign-planner-slot" data-recipe-id="${r.id}" data-day="${target.day}" data-meal="${target.meal}">
        <span class="${cuisineBadgeClass(r.cuisine)}">${CUISINE_LABEL[r.cuisine]}</span>
        <span class="picker-item-name">${esc(r.name)}</span>
        <span class="tag tag-dish">${DISH_TYPE_LABEL[r.dishType]}</span>
      </button>`
    )
    .join("");

  return `
    <div class="modal-bg" data-action="close-modal">
      <div class="modal" data-stop-propagation>
        <div class="modal-head">
          <h2>${WEEKDAY_LABEL[target.day]}요일 ${MEAL_TIME_LABEL[target.meal]} 메뉴 선택</h2>
          <button type="button" class="modal-close" data-action="close-modal" aria-label="닫기">×</button>
        </div>
        <input type="text" id="picker-search" placeholder="요리 이름으로 검색..." value="${esc(plannerPickerQuery)}" />
        <div class="picker-list">${items || `<p class="hint">검색 결과가 없어요.</p>`}</div>
      </div>
    </div>
  `;
}

// ───────────────────────── events ─────────────────────────

let eventsBound = false;

function bindEvents(): void {
  if (eventsBound) return;
  eventsBound = true;
  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKeydown);
  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
}

function onClick(e: MouseEvent): void {
  const target = e.target as HTMLElement;

  const actionEl = target.closest<HTMLElement>("[data-action]");
  if (!actionEl) return;

  // Clicking anywhere inside the modal box (data-stop-propagation) that isn't itself
  // an actionable element would otherwise bubble up to the backdrop's close-modal
  // action. Ignore that case so only the backdrop / explicit buttons close the modal.
  const stopEl = target.closest<HTMLElement>("[data-stop-propagation]");
  if (stopEl && !stopEl.contains(actionEl) && stopEl !== actionEl) {
    return;
  }

  const action = actionEl.dataset.action;

  switch (action) {
    case "add-ingredient": {
      const ing = actionEl.dataset.ingredient?.trim();
      if (ing && !fridge.includes(ing)) {
        fridge = [...fridge, ing];
        saveFridge(fridge);
      }
      ingredientQuery = "";
      render();
      break;
    }
    case "remove-ingredient": {
      const ing = actionEl.dataset.ingredient;
      fridge = fridge.filter((i) => i !== ing);
      saveFridge(fridge);
      render();
      break;
    }
    case "clear-fridge": {
      fridge = [];
      saveFridge(fridge);
      render();
      break;
    }
    case "toggle-category": {
      openCategory = actionEl.dataset.category ?? null;
      render();
      break;
    }
    case "set-filter": {
      const group = actionEl.dataset.group as keyof Filters;
      const value = actionEl.dataset.value as string;
      filters = { ...filters, [group]: value };
      render();
      break;
    }
    case "random-pick": {
      const picked = pickRandom(RECIPES, filters);
      if (picked) {
        activeRecipeId = picked.id;
        plannerAssignTarget = null;
        render();
      }
      break;
    }
    case "open-recipe": {
      activeRecipeId = actionEl.dataset.recipeId ?? null;
      plannerAssignTarget = null;
      render();
      break;
    }
    case "close-modal": {
      activeRecipeId = null;
      plannerAssignTarget = null;
      plannerPickerTarget = null;
      plannerPickerQuery = "";
      render();
      break;
    }
    case "start-assign": {
      plannerAssignTarget = { day: plannerDay, meal: "dinner" };
      render();
      break;
    }
    case "confirm-assign": {
      const recipeId = actionEl.dataset.recipeId!;
      const daySel = document.getElementById("assign-day") as HTMLSelectElement | null;
      const mealSel = document.getElementById("assign-meal") as HTMLSelectElement | null;
      const day = Number(daySel?.value ?? 0);
      const meal = (mealSel?.value ?? "dinner") as MealTime;
      planner = [...planner.filter((s) => !(s.day === day && s.meal === meal)), { day, meal, recipeId }];
      savePlanner(planner);
      activeRecipeId = null;
      plannerAssignTarget = null;
      plannerDay = day;
      render();
      break;
    }
    case "set-planner-day": {
      plannerDay = Number(actionEl.dataset.day);
      render();
      break;
    }
    case "remove-planner-slot": {
      const day = Number(actionEl.dataset.day);
      const meal = actionEl.dataset.meal as MealTime;
      planner = planner.filter((s) => !(s.day === day && s.meal === meal));
      savePlanner(planner);
      render();
      break;
    }
    case "reset-planner": {
      if (confirm("이번 주 식단표를 모두 비울까요?")) {
        planner = [];
        savePlanner(planner);
        render();
      }
      break;
    }
    case "open-planner-picker": {
      const day = Number(actionEl.dataset.day);
      const meal = actionEl.dataset.meal as MealTime;
      plannerPickerTarget = { day, meal };
      plannerPickerQuery = "";
      render();
      break;
    }
    case "assign-planner-slot": {
      const recipeId = actionEl.dataset.recipeId!;
      const day = Number(actionEl.dataset.day);
      const meal = actionEl.dataset.meal as MealTime;
      planner = [...planner.filter((s) => !(s.day === day && s.meal === meal)), { day, meal, recipeId }];
      savePlanner(planner);
      plannerPickerTarget = null;
      render();
      break;
    }
    case "toggle-notify": {
      void toggleNotify();
      break;
    }
    case "set-notify-meal": {
      persistNotify({ ...notify, mealTime: actionEl.dataset.value as MealTime });
      render();
      break;
    }
    case "nudge-notify": {
      const field = actionEl.dataset.field as "sideCount" | "soupCount" | "mainCount";
      const delta = Number(actionEl.dataset.delta);
      const max = field === "sideCount" ? 4 : 2;
      const next = Math.min(max, Math.max(0, notify[field] + delta));
      persistNotify({ ...notify, [field]: next });
      render();
      break;
    }
    case "test-notify": {
      void sendTestNotify();
      break;
    }
    case "assign-combo-main": {
      const recipeId = actionEl.dataset.recipeId!;
      planner = [
        ...planner.filter((s) => !(s.day === plannerDay && s.meal === notify.mealTime)),
        { day: plannerDay, meal: notify.mealTime, recipeId },
      ];
      savePlanner(planner);
      notifyStatus = `${WEEKDAY_LABEL[plannerDay]}요일 ${MEAL_TIME_LABEL[notify.mealTime]}에 넣었어요.`;
      render();
      document.getElementById("today-combo")?.scrollIntoView({ behavior: "smooth", block: "start" });
      break;
    }
  }
}

async function toggleNotify(): Promise<void> {
  if (notify.enabled) {
    persistNotify({ ...notify, enabled: false });
    notifyStatus = "알림을 껐어요.";
    render();
    return;
  }
  const perm = await requestNotificationPermission();
  if (perm !== "granted") {
    notifyStatus = perm === "denied"
      ? "알림이 차단되어 있어요. 브라우저 설정에서 허용해 주세요."
      : "알림 권한을 허용해야 켤 수 있어요.";
    persistNotify({ ...notify, enabled: false });
    render();
    return;
  }
  persistNotify({ ...notify, enabled: true });
  notifyStatus = `매일 ${notify.time}에 알려줄게요.`;
  render();
}

async function sendTestNotify(): Promise<void> {
  const perm = notificationPermission() === "granted"
    ? "granted"
    : await requestNotificationPermission();
  if (perm !== "granted") {
    notifyStatus = "알림 권한을 먼저 허용해 주세요.";
    render();
    return;
  }
  const ok = await showComboNotification(currentCombo(), false);
  notifyStatus = ok ? "알림을 보냈어요. 알림함을 확인해 보세요." : "알림을 보내지 못했어요.";
  render();
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Enter" && (e.target as HTMLElement).id === "ingredient-input") {
    e.preventDefault();
    const value = ingredientQuery.trim();
    if (value) {
      if (!fridge.includes(value)) {
        fridge = [...fridge, value];
        saveFridge(fridge);
      }
      ingredientQuery = "";
      render();
    }
  }
  if (e.key === "Escape" && (activeRecipeId || plannerPickerTarget)) {
    activeRecipeId = null;
    plannerAssignTarget = null;
    plannerPickerTarget = null;
    render();
  }
}

function onChange(e: Event): void {
  const target = e.target as HTMLElement;
  if (target.id === "notify-time") {
    const value = (target as HTMLInputElement).value;
    if (/^\d{2}:\d{2}$/.test(value)) {
      persistNotify({ ...notify, time: value });
      notifyStatus = notify.enabled ? `이제 매일 ${value}에 알려줄게요.` : "";
      render();
    }
  }
}

function onInput(e: Event): void {
  const target = e.target as HTMLElement;
  if (target.id === "ingredient-input") {
    ingredientQuery = (target as HTMLInputElement).value;
    // re-render but keep focus + caret in the input
    const caret = (target as HTMLInputElement).selectionStart;
    render();
    const input = document.getElementById("ingredient-input") as HTMLInputElement | null;
    if (input) {
      input.focus();
      if (caret !== null) input.setSelectionRange(caret, caret);
    }
  } else if (target.id === "picker-search") {
    plannerPickerQuery = (target as HTMLInputElement).value;
    const caret = (target as HTMLInputElement).selectionStart;
    render();
    const input = document.getElementById("picker-search") as HTMLInputElement | null;
    if (input) {
      input.focus();
      if (caret !== null) input.setSelectionRange(caret, caret);
    }
  }
}

// ───────────────────────── PWA ─────────────────────────

let swRegistered = false;

function registerServiceWorker(): void {
  if (swRegistered || !("serviceWorker" in navigator)) return;
  swRegistered = true;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "OPEN_TODAY_COMBO") {
      document.getElementById("today-combo")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

function consumeTodayDeepLink(): void {
  const params = new URLSearchParams(window.location.search);
  if (params.get("today") === "1" || window.location.hash === "#today") {
    window.setTimeout(() => {
      document.getElementById("today-combo")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }
}

export function boot(): void {
  render();
  consumeTodayDeepLink();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      armNotifySchedule(notify, currentCombo());
    }
  });
}
