(function () {
  const STORAGE_KEY = "oll-filter-state";
  const MODES = ["all", "shape", "order", "tag"];

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") || {};
    } catch {
      return {};
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // localStorage unavailable; filtering still works for this page load
    }
  }

  function setup(entries, elements) {
    const saved = loadState();
    const state = {
      entries,
      allTags: OllCards.getAllTags(entries),
      elements,
      saved,
      mode: MODES.includes(saved.mode) ? saved.mode : "all",
      selectedTag: "",
      scrollController: null
    };
    elements.modeButtons.forEach((button) => {
      button.addEventListener("click", () => onModeClick(button, state));
    });
    selectMode(state.mode, state);
  }

  function onModeClick(button, state) {
    const mode = button.dataset.mode;
    if (mode === state.mode && mode !== "all") {
      toggleFilterVisibility(state);
    } else {
      selectMode(mode, state);
    }
  }

  function toggleFilterVisibility(state) {
    const filter = state.elements.tagFilter;
    const hidden = filter.classList.contains("is-hidden");
    filter.classList.toggle("is-hidden", !hidden);
    if (hidden) state.scrollController?.keepVisibleDuringTransition();
  }

  function selectMode(mode, state) {
    state.mode = mode;
    state.saved.mode = mode;
    saveState(state.saved);
    state.elements.modeButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === mode);
    });
    if (mode === "all") {
      state.elements.tagFilter.hidden = true;
      state.elements.tagFilter.classList.remove("is-hidden");
      apply("", state);
      return;
    }
    showMode(mode, state);
  }

  function showMode(mode, state) {
    const values = getValues(mode, state);
    const label = mode === "shape" ? "形状" : mode === "order" ? "覚える順" : "タグ";
    const selected = values.some(({ value }) => value === state.saved[mode]) ? state.saved[mode] : "";
    const filter = createFilter(values, label, (tag) => selectTag(tag, state));
    state.elements.tagFilter.replaceWith(filter);
    state.elements.tagFilter = filter;
    filter.hidden = false;
    state.selectedTag = selected;
    state.scrollController = setupScrollHide(filter);
    apply(selected, state);
  }

  function getValues(mode, state) {
    if (mode === "tag") {
      return [...state.allTags].sort((a, b) => a.localeCompare(b, "ja")).map((value) => ({
        value,
        count: state.entries.filter((entry) => OllCsv.getEntryTags(entry).includes(value)).length
      }));
    }
    const key = mode === "shape" ? "形状" : "覚える順";
    const counts = new Map();
    state.entries.forEach((entry) => {
      const value = (entry[key] ?? "").trim();
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    });
    return [...counts].sort(([left], [right]) => left.localeCompare(right, "ja"))
      .map(([value, count]) => ({ value, count }));
  }

  function createFilter(values, label, onSelect) {
    const container = document.createElement("div");
    container.className = "tag-filter";
    container.setAttribute("role", "group");
    container.setAttribute("aria-label", `${label}で絞り込み`);
    container.append(createButton("", "すべて", true, onSelect));
    values.forEach(({ value, count }) => {
      const stars = label === "覚える順" ? getStars(value) : "";
      const button = createButton(value, stars || value, false, onSelect);
      if (label === "覚える順") button.classList.add("learn-order");
      if (stars) {
        const starLabel = document.createElement("span");
        starLabel.className = "tag-stars";
        starLabel.textContent = stars;
        button.replaceChildren(starLabel, ` (${count})`);
      } else {
        button.textContent = `${value} (${count})`;
      }
      container.append(button);
    });
    return container;
  }

  function createButton(value, label, active, onSelect) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = active ? "tag-btn active" : "tag-btn";
    button.dataset.tag = value;
    button.textContent = label;
    button.addEventListener("click", () => onSelect(value));
    return button;
  }

  function selectTag(tag, state) {
    state.selectedTag = tag;
    state.saved[state.mode] = tag;
    saveState(state.saved);
    apply(tag, state);
  }

  function apply(tag, state) {
    const { grid, emptyFilter, summary, tagFilter } = state.elements;
    const cards = [...grid.querySelectorAll(".oll-card")];
    const visibleCount = cards.filter((card) => {
      const values = state.mode === "tag"
        ? JSON.parse(card.dataset.tags ?? "[]")
        : [card.getAttribute(state.mode === "shape" ? "data-shape" : "data-order") ?? ""];
      const visible = !tag || values.includes(tag);
      card.classList.toggle("is-filtered-out", !visible);
      return visible;
    }).length;
    tagFilter.querySelectorAll(".tag-btn").forEach((button) => {
      button.classList.toggle("active", button.dataset.tag === tag);
    });
    emptyFilter.hidden = visibleCount > 0;
    grid.hidden = visibleCount === 0;
    summary.textContent = tag
      ? `${visibleCount} / ${cards.length} ケース（${tag}）`
      : `${cards.length} ケース`;
  }

  function setupScrollHide(filter) {
    const state = {
      lastY: window.pageYOffset || document.documentElement.scrollTop,
      transitioning: false,
      ignoreUntil: 0,
      duration: parseFloat(getComputedStyle(document.documentElement)
        .getPropertyValue("--tag-filter-transition-duration").trim()) * 1050
    };
    window.addEventListener("scroll", () => onScroll(filter, state));
    return { keepVisibleDuringTransition: () => {
      state.lastY = getScrollY();
      state.ignoreUntil = performance.now() + state.duration + 100;
    } };
  }

  function getScrollY() {
    return window.pageYOffset || document.documentElement.scrollTop;
  }

  function onScroll(filter, state) {
    const currentY = getScrollY();
    if (state.transitioning || performance.now() < state.ignoreUntil) {
      state.lastY = currentY;
      return;
    }
    const delta = currentY - state.lastY;
    if (Math.abs(delta) < 10) return;
    state.lastY = currentY;
    if (delta < 0) return;
    if (filter.classList.contains("is-hidden")) return;
    state.transitioning = true;
    filter.classList.add("is-hidden");
    setTimeout(() => {
      state.transitioning = false;
      state.lastY = getScrollY();
    }, state.duration);
  }

  function getStars(value) {
    const order = Number.parseInt(value, 10);
    return Number.isInteger(order) && order > 0 ? "★".repeat(order) : "";
  }

  window.OllFilters = Object.freeze({ setup });
})();
