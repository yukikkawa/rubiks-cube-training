(function () {
  const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "svg"];

  function element(tagName, className, textContent) {
    const node = document.createElement(tagName);
    node.className = className;
    if (textContent !== undefined) {
      node.textContent = textContent;
    }
    return node;
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

  function getAufRotation(auf) {
    switch ((auf ?? "").trim().toLowerCase()) {
      case "y": return 90;
      case "y'": return -90;
      case "y2": return 180;
      default: return 0;
    }
  }

  function createCard(entry, allTags, saveEntryEdit) {
    const card = element("article", "oll-card");
    card.dataset.shape = getShape(entry);
    card.dataset.order = getLearnOrder(entry);
    card.dataset.tags = JSON.stringify(OllCsv.getEntryTags(entry));
    const imageWrap = element("div", "oll-image-wrap");
    const imageState = { current: null };
    const options = createTagOptions(entry);
    const body = createCardBody(entry, card, allTags, options, imageState, saveEntryEdit);
    card.append(imageWrap, body, createMemo(entry, saveEntryEdit), options);
    loadCardImage(entry, imageWrap, imageState);
    return card;
  }

  function createCardBody(entry, card, allTags, options, imageState, saveEntryEdit) {
    const body = element("div", "oll-body");
    body.append(createCardHead(entry, saveEntryEdit));
    body.append(createAlgorithmEditor(entry, imageState, saveEntryEdit));
    body.append(createMetadata(entry, card, saveEntryEdit));
    body.append(createTagEditor(entry, card, allTags, options, saveEntryEdit));
    return body;
  }

  function createCardHead(entry, saveEntryEdit) {
    const head = element("div", "oll-card-head");
    const no = element("span", "oll-no", `#${entry["No."]}`);
    const name = element("input", "oll-editable oll-name-input");
    name.type = "text";
    name.value = entry["通称"] || "";
    name.placeholder = "通称";
    name.setAttribute("aria-label", `OLL ${entry["No."]} の通称`);
    name.addEventListener("change", () => saveEntryEdit(entry["No."], "通称", name.value));
    head.append(no, name);
    return head;
  }

  function createAlgorithmEditor(entry, imageState, saveEntryEdit) {
    const editor = element("div", "oll-algorithm-editor");
    const algorithm = element("p", "oll-algorithm", entry["手順"] || "—");
    const input = element("textarea", "oll-editable oll-algorithm-input");
    input.hidden = true;
    input.setAttribute("aria-label", `OLL ${entry["No."]} の手順とAUFを編集`);
    const controls = element("div", "oll-algorithm-controls");
    const editButton = createAlgorithmButton("編集", `OLL ${entry["No."]} の手順を編集`);
    controls.append(editButton);
    const actions = element("div", "oll-algorithm-controls");
    actions.hidden = true;
    const saveButton = createAlgorithmButton("完了");
    const cancelButton = createAlgorithmButton("キャンセル");
    actions.append(saveButton, cancelButton);
    const row = element("div", "oll-algorithm-row");
    row.append(algorithm, controls);
    editor.append(row, input, actions);
    bindAlgorithmEditor(entry, { algorithm, input, controls, actions, imageState }, saveEntryEdit);
    return editor;
  }

  function createAlgorithmButton(text, label) {
    const button = element("button", "oll-algorithm-action", text);
    button.type = "button";
    if (label) button.setAttribute("aria-label", label);
    return button;
  }

  function setAlgorithmEditing(elements, editing) {
    elements.input.hidden = !editing;
    elements.algorithm.hidden = editing;
    elements.controls.hidden = editing;
    elements.actions.hidden = !editing;
  }

  function bindAlgorithmEditor(entry, elements, saveEntryEdit) {
    elements.controls.firstElementChild.addEventListener("click", () => {
      elements.input.value = [entry["AUF"], entry["手順"]]
        .map((value) => (value ?? "").trim()).filter(Boolean).join(" ");
      setAlgorithmEditing(elements, true);
      elements.input.focus();
    });
    elements.actions.children[0].addEventListener("click", () => {
      const text = elements.input.value.trim();
      const auf = text.match(/^([yY](?:2|')?)(?:\s+|$)/);
      entry["AUF"] = auf ? auf[1].toLowerCase() : "";
      entry["手順"] = auf ? text.slice(auf[0].length).trim() : text;
      elements.algorithm.textContent = entry["手順"] || "—";
      saveEntryEdit(entry["No."], "AUF", entry["AUF"]);
      saveEntryEdit(entry["No."], "手順", entry["手順"]);
      setAlgorithmEditing(elements, false);
      if (elements.imageState.current) {
        elements.imageState.current.style.transform = `rotate(${getAufRotation(entry["AUF"])}deg)`;
      }
    });
    elements.actions.children[1].addEventListener("click", () => setAlgorithmEditing(elements, false));
    elements.input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setAlgorithmEditing(elements, false);
    });
  }

  function createMetadata(entry, card, saveEntryEdit) {
    const meta = element("div", "oll-meta");
    const rate = entry["出現率"] ? ` · ${entry["出現率"]}` : "";
    meta.append(element("p", "oll-category", `${getShape(entry)}${rate}`.trim() || "—"));
    const order = element("p", "oll-category oll-learn-order");
    const input = element("input", "oll-editable oll-order-input");
    input.type = "number";
    input.min = "1";
    input.step = "1";
    input.value = getLearnOrder(entry);
    input.placeholder = "未設定";
    input.setAttribute("aria-label", `OLL ${entry["No."]} の覚える順`);
    const stars = element("span", "oll-learn-order-stars", getStars(input.value));
    order.append(document.createTextNode("覚える順: "), stars, " ", input);
    input.addEventListener("input", () => {
      card.dataset.order = input.value.trim();
      stars.textContent = getStars(input.value);
      saveEntryEdit(entry["No."], "覚える順", input.value.trim());
    });
    meta.append(order);
    return meta;
  }

  function createMemo(entry, saveEntryEdit) {
    const memo = element("textarea", "oll-editable oll-memo-input");
    memo.value = entry["メモ"] === "メモ" ? "" : (entry["メモ"] ?? "");
    memo.placeholder = "メモ";
    memo.rows = 1;
    memo.setAttribute("aria-label", `OLL ${entry["No."]} のメモ`);
    const resize = () => {
      memo.style.height = "auto";
      memo.style.height = `${memo.scrollHeight}px`;
    };
    memo.addEventListener("input", () => {
      resize();
      saveEntryEdit(entry["No."], "メモ", memo.value);
    });
    requestAnimationFrame(resize);
    return memo;
  }

  function createTagOptions(entry) {
    const options = document.createElement("datalist");
    options.id = `tag-options-${entry["No."]}`;
    return options;
  }

  function createTagEditor(entry, card, allTags, options, saveEntryEdit) {
    const tags = OllCsv.getEntryTags(entry);
    const container = element("div", "oll-tags");
    container.dataset.no = entry["No."];
    const input = element("input", "oll-editable oll-tag-input");
    input.type = "text";
    input.placeholder = "タグを追加";
    input.setAttribute("list", options.id);
    input.setAttribute("aria-label", `OLL ${entry["No."]} にタグを追加`);
    const button = element("button", "oll-tag-add", "追加");
    button.type = "button";
    const state = { entry, card, allTags, tags, options, container, input, saveEntryEdit };
    refreshTagOptions(state);
    renderTags(state);
    button.addEventListener("click", () => addTag(state));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addTag(state);
      }
    });
    container.append(input, button);
    return container;
  }

  function refreshTagOptions(state) {
    state.options.replaceChildren();
    [...state.allTags].filter((tag) => !state.tags.includes(tag))
      .sort((a, b) => a.localeCompare(b, "ja"))
      .forEach((tag) => {
        const option = document.createElement("option");
        option.value = tag;
        state.options.append(option);
      });
  }

  function renderTags(state) {
    state.container.querySelectorAll(".oll-tag").forEach((tag) => tag.remove());
    state.tags.forEach((tag) => {
      const item = element("span", "oll-tag");
      const remove = element("button", "oll-tag-remove", "×");
      remove.type = "button";
      remove.setAttribute("aria-label", `${tag}を削除`);
      remove.addEventListener("click", () => removeTag(tag, state));
      item.append(document.createTextNode(tag), remove);
      state.container.prepend(item);
    });
  }

  function saveTags(state) {
    state.card.dataset.tags = JSON.stringify(state.tags);
    state.saveEntryEdit(state.entry["No."], "タグ", state.tags);
  }

  function removeTag(tag, state) {
    state.tags.splice(state.tags.indexOf(tag), 1);
    refreshTagOptions(state);
    renderTags(state);
    saveTags(state);
  }

  function addTag(state) {
    const tag = state.input.value.trim();
    state.input.value = "";
    if (!tag || state.tags.includes(tag)) return;
    state.tags.push(tag);
    state.allTags.add(tag);
    refreshTagOptions(state);
    document.querySelectorAll("datalist[id^='tag-options-']").forEach((options) => {
      if (options !== state.options && ![...options.options].some((item) => item.value === tag)) {
        const option = document.createElement("option");
        option.value = tag;
        options.append(option);
      }
    });
    renderTags(state);
    saveTags(state);
  }

  function imageCandidates(no) {
    const number = String(no).trim().padStart(2, "0");
    const bases = [`../images/oll${number}`, `images/${number}`, `images/oll-${number}`];
    return bases.flatMap((base) => IMAGE_EXTENSIONS.map((extension) => `${base}.${extension}`));
  }

  function loadImage(candidates, index = 0) {
    if (index >= candidates.length) return Promise.resolve(null);
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(candidates[index]);
      image.onerror = () => resolve(loadImage(candidates, index + 1));
      image.src = candidates[index];
    });
  }

  function loadCardImage(entry, imageWrap, imageState) {
    loadImage(imageCandidates(entry["No."])).then((src) => {
      if (!src) {
        imageWrap.append(element("div", "oll-image-placeholder", "画像なし"));
        return;
      }
      const image = document.createElement("img");
      image.src = src;
      image.alt = `OLL ${entry["No."]}`;
      image.style.transform = `rotate(${getAufRotation(entry["AUF"])}deg)`;
      imageState.current = image;
      imageWrap.append(image);
    });
  }

  function getAllTags(entries) {
    return new Set(entries.flatMap((entry) => OllCsv.getEntryTags(entry)));
  }

  window.OllCards = Object.freeze({ create: createCard, getAllTags });
})();
