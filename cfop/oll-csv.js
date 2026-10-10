(function () {
  const CSV_SOURCE_KEY = "oll-csv-source";

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

  function download(entries, editsByNo) {
    const exportRows = entries.map((entry) => prepareExportRow(entry, editsByNo));
    const headers = getExportHeaders(exportRows);
    const rows = exportRows.map((row) => createExportRow(row, headers));
    downloadTextFile(serializeCsv([headers, ...rows]));
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

  function parse(text) {
    return rowsToEntries(parseRows(text));
  }

  function createCsvState() {
    return { rows: [], row: [], field: "", inQuotes: false };
  }

  function parseRows(text) {
    const state = createCsvState();
    for (let index = 0; index < text.length; index += 1) {
      if (parseCharacter(state, text[index], text[index + 1])) {
        index += 1;
      }
    }
    finishCsvRows(state);
    return state.rows;
  }

  function parseCharacter(state, char, next) {
    return state.inQuotes
      ? parseQuotedCharacter(state, char, next)
      : parseUnquotedCharacter(state, char);
  }

  function parseQuotedCharacter(state, char, next) {
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

  function parseUnquotedCharacter(state, char) {
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

  async function loadEntries() {
    const entries = parse(await getCsvSource());
    if (entries.length === 0) {
      throw new Error("oll_def.csv にデータがありません");
    }
    return entries;
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

  function importText(csvText) {
    validateImportedCsv(csvText);
    localStorage.setItem(CSV_SOURCE_KEY, csvText);
  }

  function validateImportedCsv(csvText) {
    const entries = parse(csvText);
    if (entries.length === 0 || !Object.hasOwn(entries[0], "No.")) {
      throw new Error("No.列を含むOLL CSVを選択してください");
    }
  }

  window.OllCsv = Object.freeze({
    download,
    getEntryTags,
    importText,
    loadEntries,
    parse
  });
})();
