(function () {
  const ENTRY_EDITS_KEY = "oll-entry-edits";
  const EDITABLE_FIELDS = ["通称", "メモ", "覚える順", "タグ", "手順", "AUF"];

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
      // Keep editing usable when browser storage is unavailable.
    }
  }

  function applyEntryEdits(entries) {
    const editsByNo = loadEntryEdits();
    entries.forEach((entry) => {
      const edits = editsByNo[entry["No."]];
      if (!edits) return;
      EDITABLE_FIELDS.forEach((field) => {
        if (typeof edits[field] === "string" || (field === "タグ" && Array.isArray(edits[field]))) {
          entry[field] = edits[field];
        }
      });
    });
    return entries;
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

  function bindCsvControls(elements) {
    elements.importCsvButton.addEventListener("click", () => elements.importCsvInput.click());
    elements.exportCsvButton.addEventListener("click", () => {
      if (window.ollEntries) {
        OllCsv.download(window.ollEntries, loadEntryEdits());
      }
    });
    elements.importCsvInput.addEventListener("change", () => importCsvFile(elements));
  }

  async function importCsvFile(elements) {
    const file = elements.importCsvInput.files?.[0];
    if (!file) return;
    try {
      OllCsv.importText(await file.text());
      localStorage.removeItem(ENTRY_EDITS_KEY);
      location.reload();
    } catch (error) {
      elements.status.className = "status error";
      elements.status.hidden = false;
      elements.status.textContent = `CSVの読み込みに失敗しました: ${error.message}`;
    } finally {
      elements.importCsvInput.value = "";
    }
  }

  function renderEntries(entries, elements) {
    elements.status.hidden = true;
    elements.grid.hidden = false;
    elements.summary.textContent = `${entries.length} ケース`;
    window.ollEntries = entries;
    const allTags = OllCards.getAllTags(entries);
    const fragment = document.createDocumentFragment();
    entries.forEach((entry) => fragment.append(
      OllCards.create(entry, allTags, saveEntryEdit)
    ));
    elements.grid.append(fragment);
    OllFilters.setup(entries, elements);
  }

  function showLoadError(error, elements) {
    elements.status.className = "status error";
    elements.status.textContent =
      `${error.message}。ローカルサーバー経由で開いてください（例: \`npx serve .\`）。`;
    elements.summary.textContent = "読み込み失敗";
  }

  async function init() {
    const elements = getPageElements();
    bindCsvControls(elements);
    try {
      renderEntries(applyEntryEdits(await OllCsv.loadEntries()), elements);
    } catch (error) {
      showLoadError(error, elements);
    }
  }

  init();
})();
