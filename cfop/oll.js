    const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "svg"];
    const ENTRY_EDITS_KEY = "oll-entry-edits";
    const CSV_SOURCE_KEY = "oll-csv-source";

    function loadEntryEdits() {
      try {
        return JSON.parse(localStorage.getItem(ENTRY_EDITS_KEY) ?? "{}") || {};
      } catch {
        return {};
      }
    }

    function saveEntryEdit(no, field, value) {
      try {
        const edits = loadEntryEdits();
        edits[no] = { ...(edits[no] ?? {}), [field]: value };
        localStorage.setItem(ENTRY_EDITS_KEY, JSON.stringify(edits));
      } catch {
        // localStorageが利用できない環境では保存しない
      }
    }

    function getEntryTags(entry) {
      if (Array.isArray(entry["タグ"])) {
        return [...new Set(entry["タグ"].map((tag) => String(tag).trim()).filter(Boolean))];
      }
      const csvTags = Object.keys(entry)
        .filter((key) => /^タグ\d+$/.test(key))
        .sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)))
        .map((key) => entry[key].trim())
        .filter(Boolean);
      return [...new Set(csvTags)];
    }

    function getAllTags(entries) {
      return new Set(entries.flatMap((entry) => getEntryTags(entry)));
    }

    function downloadCsv(entries) {
      const editsByNo = loadEntryEdits();
      const exportRows = entries.map((entry) => prepareExportRow(entry, editsByNo));
      const headers = getExportHeaders(exportRows);
      const rows = exportRows.map((row) => createExportRow(row, headers));
      const csv = serializeCsv([headers, ...rows]);
      downloadTextFile(csv);
    }

    function prepareExportRow(entry, editsByNo) {
      const data = { ...entry };
      const edits = editsByNo[entry["No."]] ?? {};
      applyEntryExportEdits(data, edits);
      const tags = getEntryTags(data);
      removeTagColumns(data);
      return { data, tags };
    }

    function applyEntryExportEdits(data, edits) {
      for (const field of ["通称", "メモ", "覚える順", "手順", "AUF"]) {
        if (typeof edits[field] === "string") {
          data[field] = edits[field];
        }
      }
      if (Array.isArray(edits["タグ"])) {
        data["タグ"] = edits["タグ"];
      }
    }

    function removeTagColumns(data) {
      for (const key of Object.keys(data)) {
        if (key === "タグ" || /^タグ\d+$/.test(key)) {
          delete data[key];
        }
      }
    }

    function getExportHeaders(exportRows) {
      const headers = [...new Set(exportRows.flatMap(({ data }) => Object.keys(data)))];
      const tagCount = Math.max(3, ...exportRows.map(({ tags }) => tags.length));
      for (let index = 1; index <= tagCount; index += 1) {
        headers.push(`タグ${index}`);
      }
      return headers;
    }

    function createExportRow({ data, tags }, headers) {
      return headers.map((header) => {
        const tagMatch = header.match(/^タグ(\d+)$/);
        return tagMatch ? tags[Number(tagMatch[1]) - 1] ?? "" : data[header] ?? "";
      });
    }

    function serializeCsv(rows) {
      return `\uFEFF${rows.map((row) => row.map(escapeCsvValue).join(",")).join("\r\n")}`;
    }

    function escapeCsvValue(value) {
      const text = String(value ?? "");
      return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    }

    function downloadTextFile(csv) {
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "oll_def.csv";
      link.click();
      URL.revokeObjectURL(url);
    }

    function parseCsv(text) {
      return rowsToEntries(parseCsvRows(text));
    }

    function createCsvState() {
      return { rows: [], row: [], field: "", inQuotes: false };
    }

    function parseCsvRows(text) {
      const state = createCsvState();
      for (let index = 0; index < text.length; index += 1) {
        if (parseCsvCharacter(state, text[index], text[index + 1])) {
          index += 1;
        }
      }
      finishCsvRows(state);
      return state.rows;
    }

    function parseCsvCharacter(state, char, next) {
      return state.inQuotes
        ? parseQuotedCsvCharacter(state, char, next)
        : parseUnquotedCsvCharacter(state, char);
    }

    function parseQuotedCsvCharacter(state, char, next) {
      if (char !== "\"") {
        state.field += char;
        return false;
      }
      if (next === "\"") {
        state.field += "\"";
        return true;
      }
      state.inQuotes = false;
      return false;
    }

    function parseUnquotedCsvCharacter(state, char) {
      if (char === "\"") {
        state.inQuotes = true;
      } else if (char === ",") {
        finishCsvField(state);
      } else if (char === "\n") {
        finishCsvRow(state);
      } else if (char !== "\r") {
        state.field += char;
      }
      return false;
    }

    function finishCsvField(state) {
      state.row.push(state.field);
      state.field = "";
    }

    function finishCsvRow(state) {
      finishCsvField(state);
      state.rows.push(state.row);
      state.row = [];
    }

    function finishCsvRows(state) {
      if (state.field.length > 0 || state.row.length > 0) {
        finishCsvRow(state);
      }
    }

    function rowsToEntries(rows) {
      if (rows.length === 0) {
        return [];
      }
      const headers = rows[0].map((header) => header.trim());
      return rows.slice(1).filter(hasCsvData).map((cells) => rowToEntry(headers, cells));
    }

    function hasCsvData(cells) {
      return cells.some((cell) => cell.trim() !== "");
    }

    function rowToEntry(headers, cells) {
      const entry = {};
      headers.forEach((header, index) => {
        entry[header] = (cells[index] ?? "").trim();
      });
      return entry;
    }

    function imageCandidates(no) {
      const num = String(no).trim().padStart( 2, '0');
      const padded = num.padStart(2, "0");
      const bases = [`../images/oll${num}`, `images/${padded}`, `images/oll-${num}`, `images/oll-${padded}`];
      const paths = [];
      for (const base of bases) {
        for (const ext of IMAGE_EXTENSIONS) {
          paths.push(`${base}.${ext}`);
        }
      }
      return paths;
    }

    function loadImage(candidates) {
      return tryLoadImage(candidates, 0);
    }

    function tryLoadImage(candidates, index) {
      if (index >= candidates.length) {
        return Promise.resolve(null);
      }
      const src = candidates[index];
      return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(src);
        image.onerror = () => resolve(tryLoadImage(candidates, index + 1));
        image.src = src;
      });
    }

    function uniqueValues(entries, key) {
      const counts = new Map();
      for (const entry of entries) {
        const value = (entry[key] ?? "").trim();
        if (!value) {
          continue;
        }
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
      return [...counts.entries()]
        .sort(([a], [b]) => a.localeCompare(b, "ja"))
        .map(([value, count]) => ({ value, count }));
    }

    function getShape(entry) {
      return (entry["形状"] ?? "").trim();
    }

    function getLearnOrder(entry) {
      return (entry["覚える順"] ?? "").trim();
    }

    function getStars(value) {
      const order = Number.parseInt(value, 10);
      return Number.isInteger(order) && order > 0 ? "★".repeat(order) : "";
    }

    function getLearnOrderStars(entry) {
      return getStars(getLearnOrder(entry));
    }

    function getAufRotation(auf) {
      switch ((auf ?? "").trim().toLowerCase()) {
        case "y":
          return 90;
        case "y'":
          return -90;
        case "y2":
          return 180;
        default:
          return 0;
      }
    }

    function createElement(tagName, className, textContent) {
      const element = document.createElement(tagName);
      element.className = className;
      if (textContent !== undefined) {
        element.textContent = textContent;
      }
      return element;
    }

    function createCard(entry, allTags) {
      const card = createElement("article", "oll-card");
      setCardData(card, entry);
      const imageWrap = createElement("div", "oll-image-wrap");
      const imageState = { current: null };
      const tagOptions = createTagOptions(entry);
      const body = createCardBody(entry, card, allTags, imageState, tagOptions);
      card.append(imageWrap, body, createMemo(entry), tagOptions);
      loadCardImage(entry, imageWrap, imageState);
      return card;
    }

    function setCardData(card, entry) {
      card.dataset.shape = getShape(entry);
      card.dataset.order = getLearnOrder(entry);
      card.dataset.tags = JSON.stringify(getEntryTags(entry));
    }

    function createCardBody(entry, card, allTags, imageState, tagOptions) {
      const body = createElement("div", "oll-body");
      body.append(createCardHead(entry), createAlgorithmEditor(entry, imageState));
      body.append(createMetadata(entry, card));
      body.append(createTagEditor(entry, card, allTags, tagOptions));
      return body;
    }

    function createCardHead(entry) {
      const no = createElement("span", "oll-no", `#${entry["No."]}`);
      const name = createNameInput(entry);
      const head = createElement("div", "oll-card-head");
      head.append(no, name);
      return head;
    }

    function createNameInput(entry) {
      const name = createElement("input", "oll-editable oll-name-input");
      name.type = "text";
      name.value = entry["通称"] || "";
      name.placeholder = "通称";
      name.setAttribute("aria-label", `OLL ${entry["No."]} の通称`);
      name.addEventListener("change", () => saveEntryEdit(entry["No."], "通称", name.value));
      return name;
    }

    function createAlgorithmEditor(entry, imageState) {
      const editor = createElement("div", "oll-algorithm-editor");
      const algorithm = createElement("p", "oll-algorithm", entry["手順"] || "—");
      const input = createAlgorithmInput(entry);
      const controls = createAlgorithmControls(entry);
      const editingActions = createEditingActions();
      const row = createElement("div", "oll-algorithm-row");
      row.append(algorithm, controls.container);
      editor.append(row, input, editingActions.container);
      bindAlgorithmEditor(entry, { algorithm, input, controls, editingActions, imageState });
      return editor;
    }

    function createAlgorithmInput(entry) {
      const input = createElement("textarea", "oll-editable oll-algorithm-input");
      input.hidden = true;
      input.setAttribute("aria-label", `OLL ${entry["No."]} の手順とAUFを編集`);
      return input;
    }

    function createAlgorithmButton(textContent, ariaLabel) {
      const button = createElement("button", "oll-algorithm-action", textContent);
      button.type = "button";
      if (ariaLabel) {
        button.setAttribute("aria-label", ariaLabel);
      }
      return button;
    }

    function createAlgorithmControls(entry) {
      const container = createElement("div", "oll-algorithm-controls");
      const button = createAlgorithmButton("編集", `OLL ${entry["No."]} の手順を編集`);
      container.append(button);
      return { container, button };
    }

    function createEditingActions() {
      const container = createElement("div", "oll-algorithm-controls");
      container.hidden = true;
      const saveButton = createAlgorithmButton("完了");
      const cancelButton = createAlgorithmButton("キャンセル");
      container.append(saveButton, cancelButton);
      return { container, saveButton, cancelButton };
    }

    function setAlgorithmEditing(elements, editing) {
      elements.input.hidden = !editing;
      elements.algorithm.hidden = editing;
      elements.controls.container.hidden = editing;
      elements.editingActions.container.hidden = !editing;
    }

    function beginAlgorithmEditing(entry, elements) {
      elements.input.value = [entry["AUF"], entry["手順"]]
        .map((value) => (value ?? "").trim())
        .filter(Boolean)
        .join(" ");
      setAlgorithmEditing(elements, true);
      elements.input.focus();
    }

    function saveAlgorithm(entry, elements) {
      const editedText = elements.input.value.trim();
      const aufMatch = editedText.match(/^([yY](?:2|')?)(?:\s+|$)/);
      entry["AUF"] = aufMatch ? aufMatch[1].toLowerCase() : "";
      entry["手順"] = aufMatch ? editedText.slice(aufMatch[0].length).trim() : editedText;
      elements.algorithm.textContent = entry["手順"] || "—";
      saveEntryEdit(entry["No."], "AUF", entry["AUF"]);
      saveEntryEdit(entry["No."], "手順", entry["手順"]);
      setAlgorithmEditing(elements, false);
      updateAlgorithmImage(entry, elements.imageState.current);
    }

    function updateAlgorithmImage(entry, image) {
      if (image) {
        image.style.transform = `rotate(${getAufRotation(entry["AUF"])}deg)`;
      }
    }

    function bindAlgorithmEditor(entry, elements) {
      elements.controls.button.addEventListener("click", () => beginAlgorithmEditing(entry, elements));
      elements.editingActions.saveButton.addEventListener("click", () => saveAlgorithm(entry, elements));
      elements.editingActions.cancelButton.addEventListener("click", () => setAlgorithmEditing(elements, false));
      elements.input.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          setAlgorithmEditing(elements, false);
        }
      });
    }

    function createMetadata(entry, card) {
      const meta = createElement("div", "oll-meta");
      const rate = entry["出現率"] ? ` · ${entry["出現率"]}` : "";
      const category = createElement("p", "oll-category", `${getShape(entry)}${rate}`.trim() || "—");
      meta.append(category, createLearnOrderInput(entry, card));
      return meta;
    }

    function createLearnOrderInput(entry, card) {
      const learnOrder = createElement("p", "oll-category oll-learn-order");
      const input = createElement("input", "oll-editable oll-order-input");
      input.type = "number";
      input.min = "1";
      input.step = "1";
      input.value = getLearnOrder(entry);
      input.placeholder = "未設定";
      input.setAttribute("aria-label", `OLL ${entry["No."]} の覚える順`);
      const stars = createElement("span", "oll-learn-order-stars", getLearnOrderStars(entry));
      learnOrder.append(document.createTextNode("覚える順: "), stars, " ", input);
      input.addEventListener("input", () => saveLearnOrder(entry, card, input, stars));
      return learnOrder;
    }

    function saveLearnOrder(entry, card, input, stars) {
      const value = input.value.trim();
      card.dataset.order = value;
      stars.textContent = getStars(value);
      saveEntryEdit(entry["No."], "覚える順", value);
    }

    function createMemo(entry) {
      const memo = createElement("textarea", "oll-editable oll-memo-input");
      memo.value = entry["メモ"] === "メモ" ? "" : (entry["メモ"] ?? "");
      memo.placeholder = "メモ";
      memo.rows = 1;
      memo.setAttribute("aria-label", `OLL ${entry["No."]} のメモ`);
      memo.addEventListener("input", () => saveMemo(entry, memo));
      requestAnimationFrame(() => resizeMemo(memo));
      return memo;
    }

    function resizeMemo(memo) {
      memo.style.height = "auto";
      memo.style.height = `${memo.scrollHeight}px`;
    }

    function saveMemo(entry, memo) {
      resizeMemo(memo);
      saveEntryEdit(entry["No."], "メモ", memo.value);
    }

    function createTagOptions(entry) {
      const options = document.createElement("datalist");
      options.id = `tag-options-${entry["No."]}`;
      return options;
    }

    function createTagEditor(entry, card, allTags, options) {
      const tags = getEntryTags(entry);
      const elements = createTagEditorElements(entry);
      const state = { entry, card, allTags, tags, options, ...elements };
      refreshTagOptions(state);
      bindTagEditor(state);
      renderTags(state);
      elements.container.append(elements.input, elements.addButton);
      return elements.container;
    }

    function createTagEditorElements(entry) {
      const container = createElement("div", "oll-tags");
      container.dataset.no = entry["No."];
      const input = createElement("input", "oll-editable oll-tag-input");
      input.type = "text";
      input.placeholder = "タグを追加";
      input.setAttribute("list", `tag-options-${entry["No."]}`);
      input.setAttribute("aria-label", `OLL ${entry["No."]} にタグを追加`);
      const addButton = createElement("button", "oll-tag-add", "追加");
      addButton.type = "button";
      return { container, input, addButton };
    }

    function refreshTagOptions(state) {
      state.options.replaceChildren();
      [...state.allTags]
        .filter((tag) => !state.tags.includes(tag))
        .sort((a, b) => a.localeCompare(b, "ja"))
        .forEach((tag) => state.options.append(createOption(tag)));
    }

    function createOption(value) {
      const option = document.createElement("option");
      option.value = value;
      return option;
    }

    function createTagElement(tag, state) {
      const tagElement = createElement("span", "oll-tag");
      const removeButton = createElement("button", "oll-tag-remove", "×");
      removeButton.type = "button";
      removeButton.setAttribute("aria-label", `${tag}を削除`);
      removeButton.addEventListener("click", () => removeTag(tag, state));
      tagElement.append(document.createTextNode(tag), removeButton);
      return tagElement;
    }

    function renderTags(state) {
      state.container.querySelectorAll(".oll-tag").forEach((tag) => tag.remove());
      state.tags.forEach((tag) => state.container.prepend(createTagElement(tag, state)));
    }

    function saveTags(state) {
      state.card.dataset.tags = JSON.stringify(state.tags);
      saveEntryEdit(state.entry["No."], "タグ", state.tags);
    }

    function removeTag(tag, state) {
      state.tags.splice(state.tags.indexOf(tag), 1);
      refreshTagOptions(state);
      renderTags(state);
      saveTags(state);
    }

    function addTagToOtherOptions(tag, currentOptions) {
      document.querySelectorAll("datalist[id^='tag-options-']").forEach((options) => {
        if (options !== currentOptions && ![...options.options].some((option) => option.value === tag)) {
          options.append(createOption(tag));
        }
      });
    }

    function addTag(state) {
      const tag = state.input.value.trim();
      if (!tag || state.tags.includes(tag)) {
        state.input.value = "";
        return;
      }
      state.tags.push(tag);
      state.allTags.add(tag);
      refreshTagOptions(state);
      addTagToOtherOptions(tag, state.options);
      state.input.value = "";
      renderTags(state);
      saveTags(state);
    }

    function bindTagEditor(state) {
      state.addButton.addEventListener("click", () => addTag(state));
      state.input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          addTag(state);
        }
      });
    }

    function loadCardImage(entry, imageWrap, imageState) {
      loadImage(imageCandidates(entry["No."]))
        .then((src) => appendCardImage(entry, imageWrap, imageState, src));
    }

    function appendCardImage(entry, imageWrap, imageState, src) {
      if (!src) {
        imageWrap.append(createElement("div", "oll-image-placeholder", "画像なし"));
        return;
      }
      const image = document.createElement("img");
      image.src = src;
      image.alt = `OLL ${entry["No."]}`;
      imageState.current = image;
      updateAlgorithmImage(entry, image);
      imageWrap.append(image);
    }

    function createTagFilter(values, label, onSelect) {
      const container = document.createElement("div");
      container.className = "tag-filter";
      container.setAttribute("role", "group");
      container.setAttribute("aria-label", `${label}で絞り込み`);
      container.append(createAllFilterButton(onSelect));
      for (const { value, count } of values) {
        container.append(createFilterButton(value, count, label, onSelect));
      }
      return container;
    }

    function createAllFilterButton(onSelect) {
      const button = createElement("button", "tag-btn active", "すべて");
      button.type = "button";
      button.dataset.tag = "";
      button.addEventListener("click", () => onSelect(""));
      return button;
    }

    function createFilterButton(value, count, label, onSelect) {
      const button = createElement("button", "tag-btn");
      button.type = "button";
      if (label === "覚える順") {
        button.classList.add("learn-order");
      }
      button.dataset.tag = value;
      appendFilterButtonLabel(button, value, count, label);
      button.addEventListener("click", () => onSelect(value));
      return button;
    }

    function appendFilterButtonLabel(button, value, count, label) {
      const stars = label === "覚える順" ? getStars(value) : "";
      const displayValue = stars || value;
      if (stars) {
        button.append(createElement("span", "tag-stars", displayValue), ` (${count})`);
      } else {
        button.textContent = `${displayValue} (${count})`;
      }
    }

    function getTagValue(button) {
      return button.getAttribute("data-tag") ?? "";
    }

    const FILTER_STATE_KEY = "oll-filter-state";

    function loadFilterState() {
      try {
        return JSON.parse(localStorage.getItem(FILTER_STATE_KEY) ?? "{}") || {};
      } catch {
        return {};
      }
    }

    function saveFilterState(state) {
      try {
        localStorage.setItem(FILTER_STATE_KEY, JSON.stringify(state));
      } catch {
        // localStorageが利用できない環境では保存しない
      }
    }

    function applyTagFilter(selectedTag, mode, gridEl, summary, emptyFilter, tagFilter) {
      const cards = gridEl.querySelectorAll(".oll-card");
      const visibleCount = filterCards(cards, selectedTag, mode);
      updateActiveFilterButton(tagFilter, selectedTag);
      emptyFilter.hidden = visibleCount > 0;
      gridEl.hidden = visibleCount === 0;
      updateFilterSummary(summary, selectedTag, visibleCount, cards.length);
    }

    function filterCards(cards, selectedTag, mode) {
      let visibleCount = 0;
      cards.forEach((card) => {
        if (setCardFilterVisibility(card, selectedTag, mode)) {
          visibleCount += 1;
        }
      });
      return visibleCount;
    }

    function setCardFilterVisibility(card, selectedTag, mode) {
      const value = getCardFilterValue(card, mode);
      const visible = selectedTag === "" || value.includes(selectedTag);
      card.classList.toggle("is-filtered-out", !visible);
      return visible;
    }

    function getCardFilterValue(card, mode) {
      if (mode === "tag") {
        return JSON.parse(card.dataset.tags ?? "[]");
      }
      const attribute = mode === "shape" ? "data-shape" : "data-order";
      return [card.getAttribute(attribute) ?? ""];
    }

    function updateActiveFilterButton(tagFilter, selectedTag) {
      tagFilter.querySelectorAll(".tag-btn").forEach((button) => {
        button.classList.toggle("active", getTagValue(button) === selectedTag);
      });
    }

    function updateFilterSummary(summary, selectedTag, visibleCount, totalCount) {
      summary.textContent = selectedTag
        ? `${visibleCount} / ${totalCount} ケース（${selectedTag}）`
        : `${totalCount} ケース`;
    }

    function getPageElements() {
      return {
        status: document.getElementById("status"),
        grid: document.getElementById("oll-grid"),
        summary: document.getElementById("summary"),
        tagFilter: document.getElementById("tag-filter"),
        modeButtons: document.querySelectorAll(".mode-btn"),
        emptyFilter: document.getElementById("empty-filter"),
        importCsvButton: document.getElementById("import-csv-button"),
        exportCsvButton: document.getElementById("export-csv-button"),
        importCsvInput: document.getElementById("import-csv-input")
      };
    }

    async function init() {
      const elements = getPageElements();
      bindCsvControls(elements);
      try {
        const entries = await loadEntries();
        renderEntries(entries, elements);
      } catch (error) {
        showLoadError(error, elements);
      }
    }

    function bindCsvControls(elements) {
      elements.importCsvButton.addEventListener("click", () => elements.importCsvInput.click());
      elements.exportCsvButton.addEventListener("click", exportCurrentEntries);
      elements.importCsvInput.addEventListener("change", () => importCsvFile(elements));
    }

    function exportCurrentEntries() {
      if (window.ollEntries) {
        downloadCsv(window.ollEntries);
      }
    }

    async function importCsvFile(elements) {
      const file = elements.importCsvInput.files?.[0];
      if (!file) {
        return;
      }
      try {
        await saveImportedCsv(file);
        location.reload();
      } catch (error) {
        showImportError(error, elements.status);
      } finally {
        elements.importCsvInput.value = "";
      }
    }

    async function saveImportedCsv(file) {
      const csvText = await file.text();
      validateImportedCsv(csvText);
      localStorage.setItem(CSV_SOURCE_KEY, csvText);
      localStorage.removeItem(ENTRY_EDITS_KEY);
    }

    function validateImportedCsv(csvText) {
      const entries = parseCsv(csvText);
      if (entries.length === 0 || !Object.hasOwn(entries[0], "No.")) {
        throw new Error("No.列を含むOLL CSVを選択してください");
      }
    }

    function showImportError(error, status) {
      status.className = "status error";
      status.hidden = false;
      status.textContent = `CSVの読み込みに失敗しました: ${error.message}`;
    }

    async function loadEntries() {
      const entries = parseCsv(await getCsvSource());
      if (entries.length === 0) {
        throw new Error("oll_def.csv にデータがありません");
      }
      return applyEntryEdits(entries, loadEntryEdits());
    }

    async function getCsvSource() {
      const savedCsv = localStorage.getItem(CSV_SOURCE_KEY);
      if (savedCsv !== null) {
        return savedCsv;
      }
      const response = await fetch("oll_def.csv");
      if (!response.ok) {
        throw new Error(`oll_def.csv の読み込みに失敗しました (${response.status})`);
      }
      return response.text();
    }

    function applyEntryEdits(entries, editsByNo) {
      for (const entry of entries) {
        applyEditsToEntry(entry, editsByNo[entry["No."]]);
      }
      return entries;
    }

    function applyEditsToEntry(entry, edits) {
      if (!edits) {
        return;
      }
      for (const field of ["通称", "メモ", "覚える順", "タグ", "手順", "AUF"]) {
        if (typeof edits[field] === "string" || (field === "タグ" && Array.isArray(edits[field]))) {
          entry[field] = edits[field];
        }
      }
    }

    function renderEntries(entries, elements) {
      elements.status.hidden = true;
      elements.grid.hidden = false;
      elements.summary.textContent = `${entries.length} ケース`;
      window.ollEntries = entries;
      const allTags = getAllTags(entries);
      renderCards(entries, elements.grid, allTags);
      setupFilters(entries, elements, allTags);
    }

    function renderCards(entries, grid, allTags) {
      const fragment = document.createDocumentFragment();
      entries.forEach((entry) => fragment.append(createCard(entry, allTags)));
      grid.append(fragment);
    }

    function showLoadError(error, elements) {
      elements.status.className = "status error";
      elements.status.textContent = `${error.message}。ローカルサーバー経由で開いてください（例: \`npx serve .\`）。`;
      elements.summary.textContent = "読み込み失敗";
    }

    function setupFilters(entries, elements, allTags) {
      const state = createFilterState(entries, elements, allTags);
      bindFilterModeButtons(state);
      selectFilterMode(getSavedFilterMode(state.filterState), state);
    }

    function createFilterState(entries, elements, allTags) {
      return {
        entries,
        allTags,
        ...elements,
        tagFilter: elements.tagFilter,
        filterState: loadFilterState(),
        selectedMode: "all",
        scrollController: null
      };
    }

    function getSavedFilterMode(filterState) {
      return ["all", "shape", "order", "tag"].includes(filterState.mode) ? filterState.mode : "all";
    }

    function bindFilterModeButtons(state) {
      state.modeButtons.forEach((button) => {
        button.addEventListener("click", () => handleFilterModeClick(button, state));
      });
    }

    function handleFilterModeClick(button, state) {
      const mode = button.dataset.mode;
      if (mode === state.selectedMode && mode !== "all") {
        toggleTagFilter(state);
        return;
      }
      selectFilterMode(mode, state);
    }

    function toggleTagFilter(state) {
      const isHidden = state.tagFilter.classList.contains("is-hidden");
      state.tagFilter.classList.toggle("is-hidden", !isHidden);
      if (isHidden) {
        state.scrollController?.keepVisibleDuringTransition();
      }
    }

    function selectFilterMode(mode, state) {
      state.selectedMode = mode;
      state.filterState.mode = mode;
      saveFilterState(state.filterState);
      updateModeButtons(state.modeButtons, mode);
      if (mode === "all") {
        showAllEntries(state);
        return;
      }
      showFilterMode(mode, state);
    }

    function updateModeButtons(buttons, mode) {
      buttons.forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
    }

    function showAllEntries(state) {
      state.tagFilter.hidden = true;
      state.tagFilter.classList.remove("is-hidden");
      applyTagFilter("", "all", state.grid, state.summary, state.emptyFilter, state.tagFilter);
    }

    function showFilterMode(mode, state) {
      const values = getFilterValues(mode, state.entries, state.allTags);
      const label = getFilterLabel(mode);
      const savedTag = getSavedFilterTag(values, state.filterState[mode]);
      const nextFilter = createTagFilter(values, label, (tag) => selectFilterTag(tag, state));
      replaceTagFilter(nextFilter, state);
      state.scrollController = setupScrollHideTagFilter(nextFilter);
      applyTagFilter(savedTag, mode, state.grid, state.summary, state.emptyFilter, nextFilter);
    }

    function getFilterLabel(mode) {
      return mode === "shape" ? "形状" : mode === "order" ? "覚える順" : "タグ";
    }

    function getFilterValues(mode, entries, allTags) {
      if (mode === "tag") {
        return [...allTags].sort((a, b) => a.localeCompare(b, "ja")).map((value) => ({
          value,
          count: entries.filter((entry) => getEntryTags(entry).includes(value)).length
        }));
      }
      const key = mode === "shape" ? "形状" : "覚える順";
      return uniqueValues(entries, key);
    }

    function getSavedFilterTag(values, savedTag) {
      return values.some(({ value }) => value === savedTag) ? savedTag : "";
    }

    function replaceTagFilter(nextFilter, state) {
      state.tagFilter.replaceWith(nextFilter);
      state.tagFilter = nextFilter;
      state.tagFilter.hidden = false;
    }

    function selectFilterTag(tag, state) {
      state.filterState[state.selectedMode] = tag;
      saveFilterState(state.filterState);
      applyTagFilter(tag, state.selectedMode, state.grid, state.summary, state.emptyFilter, state.tagFilter);
    }
    
    function setupScrollHideTagFilter(tagFilterElement) {
      const state = createScrollState();
      window.addEventListener("scroll", () => handleTagFilterScroll(tagFilterElement, state));
      return { keepVisibleDuringTransition: () => keepVisibleDuringTransition(state) };
    }

    function createScrollState() {
      return {
        lastScrollY: getScrollPosition(),
        isTransitioning: false,
        ignoreHideUntil: 0,
        transitionDuration: getFilterTransitionDuration(),
        threshold: 10
      };
    }

    function getScrollPosition() {
      return window.pageYOffset || document.documentElement.scrollTop;
    }

    function getFilterTransitionDuration() {
      const duration = getComputedStyle(document.documentElement)
        .getPropertyValue("--tag-filter-transition-duration")
        .trim();
      return parseFloat(duration) * 1000 * 1.05;
    }

    function keepVisibleDuringTransition(state) {
      state.lastScrollY = getScrollPosition();
      state.ignoreHideUntil = performance.now() + state.transitionDuration + 100;
    }

    function handleTagFilterScroll(tagFilter, state) {
      const currentScrollY = getScrollPosition();
      if (shouldIgnoreScroll(currentScrollY, state)) {
        return;
      }
      const delta = currentScrollY - state.lastScrollY;
      if (Math.abs(delta) < state.threshold) {
        return;
      }
      if (delta > 0) {
        hideTagFilter(tagFilter, state);
      }
      state.lastScrollY = currentScrollY;
    }

    function shouldIgnoreScroll(currentScrollY, state) {
      if (state.isTransitioning || performance.now() < state.ignoreHideUntil) {
        state.lastScrollY = currentScrollY;
        return true;
      }
      return false;
    }

    function hideTagFilter(tagFilter, state) {
      if (tagFilter.classList.contains("is-hidden")) {
        return;
      }
      state.isTransitioning = true;
      tagFilter.classList.add("is-hidden");
      setTimeout(() => finishTagFilterTransition(state), state.transitionDuration);
    }

    function finishTagFilterTransition(state) {
      state.isTransitioning = false;
      state.lastScrollY = getScrollPosition();
    }

    init();
