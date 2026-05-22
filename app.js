const STORAGE_KEY = "longform-writing-workbench-v1";

const stateLabels = {
  unused: "未使用",
  used: "已使用",
  discarded: "废弃",
  reuse: "待回收",
};

const rhythms = ["", "-", "--", "+", "++", "!"];

const defaultFormat = {
  fontFamily: "Microsoft YaHei",
  fontSize: 18,
  lineHeight: 2,
  editorWidth: 780,
  background: "#ecefed",
  textColor: "#212833",
  bold: false,
  formatIndent: false,
  formatBlankLines: false,
  formatTrimIndent: false,
};

const appState = {
  route: "shelf",
  activeBookId: null,
  activeChapterId: null,
  ideaPanel: "closed",
  ideaView: "list",
  sideTab: "common",
  draggingIdeaId: null,
  theme: localStorage.getItem("workbench-theme") || "light",
  modal: null,
  historyVersionId: null,
  searchQuery: "",
  preview: null,
  sessionStartedAt: Date.now(),
  sessionBaseCount: 0,
  activeWritingMs: 0,
  lastWritingAt: 0,
  lastWordCount: 0,
  idleThresholdMs: 60000,
  blackHouseRulesReadyAt: 0,
  blackHouse: null,
  saveState: "已保存",
  undoStack: [],
  redoStack: [],
  isRestoring: false,
  leftCollapsed: false,
  rightCollapsed: false,
};

let data = loadData();

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { books: [] };
  try {
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.books) ? parsed : { books: [] };
  } catch {
    return { books: [] };
  }
}

function persist() {
  appState.saveState = "正在保存";
  updateSaveLabel();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  setTimeout(() => {
    appState.saveState = "已保存";
    updateSaveLabel();
  }, 180);
}

function workspaceSnapshot() {
  return JSON.stringify({
    data,
    activeBookId: appState.activeBookId,
    activeChapterId: appState.activeChapterId,
    sideTab: appState.sideTab,
    ideaPanel: appState.ideaPanel,
    ideaView: appState.ideaView,
  });
}

function updateHistoryControls() {
  document.querySelectorAll("[data-action='undo']").forEach((button) => {
    button.disabled = !appState.undoStack.length;
  });
  document.querySelectorAll("[data-action='redo']").forEach((button) => {
    button.disabled = !appState.redoStack.length;
  });
}

function pushUndo() {
  if (appState.isRestoring) return;
  const snapshot = workspaceSnapshot();
  if (appState.undoStack.at(-1) === snapshot) return;
  appState.undoStack.push(snapshot);
  appState.undoStack = appState.undoStack.slice(-80);
  appState.redoStack = [];
  updateHistoryControls();
}

function historyIcon(type) {
  const arrow =
    type === "undo"
      ? '<path d="M10 8H4v-6"/><path d="M4 8c3.2-4.3 10.5-5.1 14.4-1.4 4 3.8 3.3 10.6-1.3 13.4-2.9 1.8-6.7 1.8-9.7.1"/>'
      : '<path d="M14 8h6v-6"/><path d="M20 8C16.8 3.7 9.5 2.9 5.6 6.6c-4 3.8-3.3 10.6 1.3 13.4 2.9 1.8 6.7 1.8 9.7.1"/>';
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${arrow}</svg>`;
}

function restoreSnapshot(snapshot) {
  if (!snapshot) return;
  appState.isRestoring = true;
  const next = JSON.parse(snapshot);
  data = next.data;
  appState.activeBookId = next.activeBookId;
  appState.activeChapterId = next.activeChapterId;
  appState.sideTab = next.sideTab || "common";
  appState.ideaPanel = next.ideaPanel || "closed";
  appState.ideaView = next.ideaView || "list";
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  appState.isRestoring = false;
  render();
}

function undoChange() {
  const previous = appState.undoStack.pop();
  if (!previous) return;
  appState.redoStack.push(workspaceSnapshot());
  restoreSnapshot(previous);
}

function redoChange() {
  const next = appState.redoStack.pop();
  if (!next) return;
  appState.undoStack.push(workspaceSnapshot());
  restoreSnapshot(next);
}

function updateSaveLabel() {
  const node = document.querySelector(".save-state");
  if (node) node.textContent = appState.saveState;
}

function updateStatsDisplay() {
  const book = getBook();
  const chapter = getChapter(book);
  if (!book || !chapter) return;
  const stats = sessionStats(book, chapter);
  document.querySelector("[data-stat='chapter']")?.replaceChildren(document.createTextNode(stats.chapterWords));
  document.querySelector("[data-stat='session']")?.replaceChildren(document.createTextNode(stats.sessionWords));
  document.querySelector("[data-stat='speed']")?.replaceChildren(document.createTextNode(stats.speed));
  document.querySelector("[data-stat-unit='speed']")?.replaceChildren(document.createTextNode(stats.speedUnit));
  document.querySelector("[data-stat-note='speed']")?.replaceChildren(document.createTextNode(stats.speedNote));
  document.querySelector("[data-stat='elapsed']")?.replaceChildren(document.createTextNode(stats.elapsedText));
  document.querySelectorAll("[data-stat='total']").forEach((node) => node.replaceChildren(document.createTextNode(stats.total.toLocaleString("zh-CN"))));
  document.querySelector(`[data-chapter-count='${chapter.id}']`)?.replaceChildren(document.createTextNode(`${stats.chapterWords.toLocaleString("zh-CN")} 字`));
  updateBlackHouseProgress();
}

function showPreview(ideaId, anchor) {
  const book = getBook();
  const idea = book?.ideas.find((item) => item.id === ideaId);
  if (!book || !idea || document.querySelector(".preview")) return;
  const rect = anchor.getBoundingClientRect();
  const linked = idea.chapterIds
    .map((id) => book.chapters.find((chapter) => chapter.id === id)?.title)
    .filter(Boolean)
    .join("、");
  const node = document.createElement("div");
  node.className = "preview";
  node.innerHTML = `
    <strong>${stateLabels[idea.state]}</strong>
    <p>${escapeHtml(idea.content || "空灵感卡")}</p>
    <p class="meta">关联：${escapeHtml(linked || "暂无")}</p>
  `;
  node.style.left = `${Math.min(rect.right + 10, window.innerWidth - 300)}px`;
  node.style.top = `${Math.min(rect.top, window.innerHeight - 190)}px`;
  document.body.appendChild(node);
}

function hidePreview() {
  document.querySelector(".preview")?.remove();
}

function formatDate(value) {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function countText(text) {
  const source = String(text || "").normalize("NFKC");
  const matches = source.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]|[A-Za-z0-9]+|[^\sA-Za-z0-9\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g);
  return matches ? matches.length : 0;
}

function getBook() {
  const book = data.books.find((item) => item.id === appState.activeBookId);
  if (book) ensureBookStructure(book);
  return book;
}

function ensureBookStructure(book) {
  if (!book.volumes || !book.volumes.length) {
    book.volumes = [{ id: "default-volume", title: "第一卷" }];
  }
  if (!book.layout) book.layout = { left: 248, right: 248 };
  if (typeof book.intro !== "string") book.intro = "";
  if (typeof book.introExpanded !== "boolean") book.introExpanded = false;
  book.chapters.forEach((chapter) => {
    if (!chapter.volumeId) chapter.volumeId = book.volumes[0].id;
    if (!chapter.versions) chapter.versions = [];
  });
}

function updateBook(patch) {
  const book = getBook();
  if (!book) return;
  pushUndo();
  Object.assign(book, patch);
  touchBook(book);
  persist();
}

function updateBookLayout(pane, width) {
  const book = getBook();
  if (!book) return;
  pushUndo();
  const key = pane === "left" ? "left" : "right";
  const nextWidth = Math.max(190, Math.min(420, Math.round(width)));
  book.layout = { ...(book.layout || { left: 248, right: 248 }), [key]: nextWidth };
  persist();
  const body = document.querySelector(".workspace-body");
  if (body) {
    const left = appState.leftCollapsed ? 0 : book.layout.left;
    const leftResize = appState.leftCollapsed ? 0 : 6;
    const rightResize = appState.rightCollapsed ? 0 : 6;
    const right = appState.rightCollapsed ? 0 : book.layout.right;
    body.style.gridTemplateColumns = `${left}px ${leftResize}px minmax(420px, 1fr) ${rightResize}px ${right}px`;
  }
}

function getChapter(book = getBook()) {
  if (!book) return null;
  return book.chapters.find((chapter) => chapter.id === appState.activeChapterId) || book.chapters[0] || null;
}

function getFormat(book = getBook()) {
  return { ...defaultFormat, ...(book?.format || {}) };
}

function bookWordCount(book) {
  return book.chapters.reduce((sum, chapter) => sum + countText(chapter.body), 0);
}

function touchBook(book) {
  book.updatedAt = Date.now();
}

function createBook(title) {
  pushUndo();
  const now = Date.now();
  const chapterId = uid("chapter");
  const volumeId = uid("volume");
  const book = {
    id: uid("book"),
    title: title.trim() || "未命名小说",
    coverText: (title.trim() || "书").slice(0, 1),
    createdAt: now,
    updatedAt: now,
    format: { ...defaultFormat },
    volumes: [{ id: volumeId, title: "第一卷" }],
    chapters: [
      {
        id: chapterId,
        volumeId,
        title: "第一章",
        rhythm: "",
        body: "",
        versions: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
    ideas: [],
  };
  data.books.unshift(book);
  persist();
  openBook(book.id);
}

function openBook(bookId) {
  const book = data.books.find((item) => item.id === bookId);
  if (!book) return;
  appState.route = "workspace";
  appState.activeBookId = book.id;
  appState.activeChapterId = book.chapters[0]?.id || null;
  const total = bookWordCount(book);
  appState.sessionStartedAt = Date.now();
  appState.sessionBaseCount = total;
  appState.activeWritingMs = 0;
  appState.lastWritingAt = 0;
  appState.lastWordCount = total;
  render();
}

function addChapter() {
  const book = getBook();
  if (!book) return;
  pushUndo();
  const activeChapter = getChapter(book);
  const volumeId = activeChapter?.volumeId || book.volumes.at(-1)?.id || book.volumes[0].id;
  const chapter = {
    id: uid("chapter"),
    volumeId,
    title: `第 ${book.chapters.length + 1} 章`,
    rhythm: "",
    body: "",
    versions: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  book.chapters.push(chapter);
  touchBook(book);
  appState.activeChapterId = chapter.id;
  persist();
  render();
}

function addVolume() {
  const book = getBook();
  if (!book) return;
  pushUndo();
  const volume = { id: uid("volume"), title: `第 ${book.volumes.length + 1} 卷` };
  book.volumes.push(volume);
  touchBook(book);
  persist();
  render();
}

function addIdea() {
  const book = getBook();
  if (!book) return;
  pushUndo();
  book.ideas.unshift({
    id: uid("idea"),
    content: "",
    state: "unused",
    chapterIds: appState.activeChapterId ? [appState.activeChapterId] : [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  touchBook(book);
  persist();
  render();
}

function updateIdea(id, patch) {
  const book = getBook();
  const idea = book?.ideas.find((item) => item.id === id);
  if (!idea) return;
  pushUndo();
  Object.assign(idea, patch, { updatedAt: Date.now() });
  touchBook(book);
  persist();
}

function deleteIdea(id) {
  const book = getBook();
  if (!book) return;
  pushUndo();
  book.ideas = book.ideas.filter((idea) => idea.id !== id);
  touchBook(book);
  persist();
  render();
}

function toggleIdeaChapter(ideaId, chapterId) {
  const book = getBook();
  const idea = book?.ideas.find((item) => item.id === ideaId);
  if (!idea) return;
  const exists = idea.chapterIds.includes(chapterId);
  idea.chapterIds = exists ? idea.chapterIds.filter((id) => id !== chapterId) : [...idea.chapterIds, chapterId];
  idea.updatedAt = Date.now();
  touchBook(book);
  persist();
  render();
}

function addIdeaChapter(ideaId, chapterId) {
  if (!chapterId) return;
  const book = getBook();
  const idea = book?.ideas.find((item) => item.id === ideaId);
  if (!idea || idea.chapterIds.includes(chapterId)) return;
  pushUndo();
  idea.chapterIds.push(chapterId);
  idea.updatedAt = Date.now();
  touchBook(book);
  persist();
  render();
}

function removeIdeaChapter(ideaId, chapterId) {
  const book = getBook();
  const idea = book?.ideas.find((item) => item.id === ideaId);
  if (!idea) return;
  pushUndo();
  idea.chapterIds = idea.chapterIds.filter((id) => id !== chapterId);
  idea.updatedAt = Date.now();
  touchBook(book);
  persist();
  render();
}

function updateChapter(patch) {
  const book = getBook();
  const chapter = getChapter(book);
  if (!book || !chapter) return;
  pushUndo();
  Object.assign(chapter, patch, { updatedAt: Date.now() });
  touchBook(book);
  persist();
}

function snapshotChapter(chapter) {
  if (!chapter || !chapter.body?.trim()) return;
  if (!chapter.versions) chapter.versions = [];
  const latest = chapter.versions[0];
  if (latest && latest.body === chapter.body && latest.title === chapter.title && latest.rhythm === chapter.rhythm) return;
  chapter.versions.unshift({
    id: uid("version"),
    createdAt: Date.now(),
    title: chapter.title,
    rhythm: chapter.rhythm,
    body: chapter.body,
  });
  chapter.versions = chapter.versions.slice(0, 10);
}

function snapshotActiveChapter() {
  const book = getBook();
  const chapter = getChapter(book);
  if (!book || !chapter) return;
  snapshotChapter(chapter);
  touchBook(book);
  persist();
}

function importTextToChapter(text, fileName = "") {
  const chapter = getChapter();
  if (!chapter) return;
  snapshotActiveChapter();
  const title = fileName.replace(/\.[^.]+$/, "").trim();
  updateChapter({ body: text, ...(title ? { title } : {}) });
  render();
}

function downloadText(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".txt") ? filename : `${filename}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportText(scope, filename) {
  const book = getBook();
  const chapter = getChapter(book);
  if (!book || !chapter) return;
  const safeName = (filename || chapter.title || book.title || "导出章节").trim();
  const content =
    scope === "book"
      ? book.chapters.map((item) => `${item.title || "未命名章节"}\n\n${item.body || ""}`).join("\n\n\n")
      : `${chapter.title || "未命名章节"}\n\n${chapter.body || ""}`;
  downloadText(safeName, content);
  appState.modal = null;
  render();
}

function startBlackHouse(type, target) {
  const chapter = getChapter();
  const numericTarget = Number(target);
  if (!chapter || !numericTarget || numericTarget <= 0) return;
  appState.blackHouse = {
    active: true,
    type,
    target: numericTarget,
    startedAt: Date.now(),
    baseCount: countText(chapter.body),
  };
  appState.modal = null;
  render();
}

function blackHouseProgress() {
  const chapter = getChapter();
  const lock = appState.blackHouse;
  if (!chapter || !lock?.active) return null;
  const words = Math.max(0, countText(chapter.body) - lock.baseCount);
  const elapsedMs = Date.now() - lock.startedAt;
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const elapsedText = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`;
  const timeTargetMs = lock.target * 60000;
  const done = lock.type === "words" ? words >= lock.target : elapsedMs >= timeTargetMs;
  const current = lock.type === "words" ? words : Math.min(elapsedMs, timeTargetMs);
  const target = lock.type === "words" ? lock.target : timeTargetMs;
  return {
    done,
    words,
    elapsedText,
    percent: Math.min(100, Math.round((current / target) * 100)),
    label: lock.type === "words" ? `${words} / ${lock.target} 字` : `${elapsedText} / ${lock.target} 分钟`,
  };
}

function updateBlackHouseProgress() {
  const progress = blackHouseProgress();
  if (!progress) return;
  document.querySelector("[data-lock-progress]")?.replaceChildren(document.createTextNode(progress.label));
  const bar = document.querySelector("[data-lock-bar]");
  if (bar) bar.style.width = `${progress.percent}%`;
  if (progress.done) {
    appState.blackHouse = null;
    render();
  }
}

function recordWritingActivity() {
  const book = getBook();
  if (!book) return;
  const now = Date.now();
  const currentCount = bookWordCount(book);
  const lastCount = appState.lastWordCount ?? appState.sessionBaseCount ?? currentCount;
  const delta = currentCount - lastCount;
  if (delta > 0) {
    const gap = appState.lastWritingAt ? now - appState.lastWritingAt : 0;
    appState.activeWritingMs += appState.lastWritingAt && gap <= appState.idleThresholdMs ? Math.max(gap, 1000) : 1000;
    appState.lastWritingAt = now;
  }
  appState.lastWordCount = currentCount;
}

function openHistoryModal() {
  const chapter = getChapter();
  if (!chapter) return;
  snapshotActiveChapter();
  appState.historyVersionId = chapter.versions?.[0]?.id || null;
  appState.modal = "history";
  render();
}

function restoreHistoryVersion(versionId) {
  const chapter = getChapter();
  const version = chapter?.versions?.find((item) => item.id === versionId);
  if (!chapter || !version) return;
  snapshotActiveChapter();
  updateChapter({ title: version.title, rhythm: version.rhythm, body: version.body });
  appState.modal = null;
  render();
}

function searchResults(book, query) {
  const keyword = query.trim();
  if (!keyword) return [];
  return book.chapters
    .map((chapter) => {
      const index = (chapter.body || "").indexOf(keyword);
      if (index < 0 && !(chapter.title || "").includes(keyword)) return null;
      const start = Math.max(0, index - 24);
      const end = Math.min((chapter.body || "").length, index + keyword.length + 42);
      return {
        chapter,
        snippet: index >= 0 ? (chapter.body || "").slice(start, end) : chapter.title,
      };
    })
    .filter(Boolean);
}

function updateBookFormat(patch) {
  const book = getBook();
  if (!book) return;
  pushUndo();
  book.format = { ...getFormat(book), ...patch };
  touchBook(book);
  persist();
  render();
}

function applyBodyFormat(mode) {
  const chapter = getChapter();
  if (!chapter) return;
  snapshotActiveChapter();
  const format = getFormat();
  const body = (chapter.body || "").replace(/\r\n/g, "\n");
  let lines = body.split(mode === "standard" ? /\n+/ : "\n");

  if (mode === "trim-indent" || (mode === "standard" && format.formatTrimIndent)) {
    lines = lines.map((line) => line.replace(/^[\s　]+/, ""));
  }
  if (mode === "indent" || (mode === "standard" && format.formatIndent)) {
    lines = lines.map((line) => (line.trim() ? `　　${line.replace(/^[\s　]+/, "")}` : ""));
  }
  if (mode === "standard") {
    lines = lines.map((line) => line.trimEnd()).filter((line) => line.trim());
  }

  const separator = mode === "blank-lines" || (mode === "standard" && format.formatBlankLines) ? "\n\n" : "\n";
  updateChapter({ body: lines.join(separator) });
  render();
}

function insertAroundSelection(textarea, open, close) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const selected = value.slice(start, end);
  const next = `${value.slice(0, start)}${open}${selected}${close}${value.slice(end)}`;
  textarea.value = next;
  const cursor = selected ? start + open.length + selected.length + close.length : start + open.length;
  textarea.setSelectionRange(cursor, cursor);
  updateChapter({ body: next });
  recordWritingActivity();
  updateStatsDisplay();
}

function pairMap() {
  return {
    "“": "”",
    "‘": "’",
    "（": "）",
    "(": ")",
    "《": "》",
    "<": ">",
    "【": "】",
    "[": "]",
    "{": "}",
    "「": "」",
    "『": "』",
    "\"": "\"",
    "'": "'",
  };
}

function handleChapterBeforeInput(event) {
  if (event.inputType && event.inputType !== "insertText") return;
  const pairs = pairMap();
  const value = event.data;
  if (!value || value.length !== 1) return;
  const textarea = event.currentTarget;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const nextChar = textarea.value[start];
  const closingChars = new Set(Object.values(pairs));
  if (closingChars.has(value) && start === end && nextChar === value) {
    event.preventDefault();
    textarea.setSelectionRange(start + 1, start + 1);
  }
}

function handleChapterInput(event) {
  const textarea = event.currentTarget;
  if (event.inputType?.startsWith("delete")) {
    updateChapter({ body: textarea.value });
    recordWritingActivity();
    updateStatsDisplay();
    return;
  }
  const pairs = pairMap();
  const cursor = textarea.selectionStart;
  const value = textarea.value;
  const typed = value[cursor - 1];
  const prevChar = value[cursor - 2];
  const nextChar = value[cursor];
  const closeChar = pairs[typed];
  if (typed && closeChar) {
    if (typed !== closeChar && prevChar === typed && nextChar === closeChar) {
      const afterPair = value[cursor + 1] === closeChar ? cursor + 2 : cursor + 1;
      const next = `${value.slice(0, cursor - 1)}${closeChar}${value.slice(afterPair)}`;
      textarea.value = next;
      textarea.setSelectionRange(cursor - 1, cursor - 1);
      updateChapter({ body: next });
      recordWritingActivity();
      updateStatsDisplay();
      return;
    }
    if (nextChar !== closeChar) {
      const next = `${value.slice(0, cursor)}${closeChar}${value.slice(cursor)}`;
      textarea.value = next;
      textarea.setSelectionRange(cursor, cursor);
      updateChapter({ body: next });
      recordWritingActivity();
      updateStatsDisplay();
      return;
    }
  }
  updateChapter({ body: textarea.value });
  recordWritingActivity();
  updateStatsDisplay();
}

function handleChapterKeydown(event) {
  const textarea = event.currentTarget;
  if (event.key === "Enter") {
    event.preventDefault();
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    const insert = "\n　　";
    textarea.value = `${value.slice(0, start)}${insert}${value.slice(end)}`;
    const cursor = start + insert.length;
    textarea.setSelectionRange(cursor, cursor);
    updateChapter({ body: textarea.value });
    recordWritingActivity();
    updateStatsDisplay();
  }
}

function moveIdea(sourceId, targetId) {
  const book = getBook();
  if (!book || !sourceId || !targetId || sourceId === targetId) return;
  const sourceIndex = book.ideas.findIndex((idea) => idea.id === sourceId);
  const targetIndex = book.ideas.findIndex((idea) => idea.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [item] = book.ideas.splice(sourceIndex, 1);
  book.ideas.splice(targetIndex, 0, item);
  touchBook(book);
  persist();
  render();
}

function sessionStats(book, chapter) {
  const currentCount = bookWordCount(book);
  const sessionWords = Math.max(0, currentCount - appState.sessionBaseCount);
  const elapsedMs = Date.now() - appState.sessionStartedAt;
  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  const elapsedSeconds = Math.floor((elapsedMs % 60000) / 1000);
  const elapsedText = `${String(elapsedMinutes).padStart(2, "0")}:${String(elapsedSeconds).padStart(2, "0")}`;
  const activeMs = Math.max(appState.activeWritingMs, sessionWords > 0 ? 1000 : 0);
  const activeMinutes = Math.floor(activeMs / 60000);
  const activeSeconds = Math.floor((activeMs % 60000) / 1000);
  const activeText = `${String(activeMinutes).padStart(2, "0")}:${String(activeSeconds).padStart(2, "0")}`;
  const idleMs = Math.max(0, elapsedMs - activeMs);
  const idleMinutes = Math.floor(idleMs / 60000);
  const canShowSpeed = sessionWords > 0 && activeMs > 0;
  const hours = Math.max(activeMs / 3600000, 1 / 3600);
  const idleText = idleMinutes > 0 ? `，摸鱼约 ${idleMinutes} 分钟` : "";
  return {
    chapterWords: countText(chapter?.body || ""),
    sessionWords,
    speed: canShowSpeed ? Math.round(sessionWords / hours) : "--",
    speedUnit: canShowSpeed ? "字/小时" : "",
    speedNote: canShowSpeed ? `活跃 ${activeText}${idleText}` : `计时 ${elapsedText}`,
    elapsedText,
    total: currentCount,
  };
}

function render() {
  document.getElementById("app").innerHTML = appState.route === "shelf" ? renderShelf() : renderWorkspace();
  document.body.dataset.theme = appState.theme;
  bindEvents();
}

function renderShelf() {
  return `
    <main class="app shelf">
      <aside class="shelf-nav">
        <h1 class="brand">长篇写作<br />结构工作台<span>先接住灵感，再写成故事</span></h1>
        <button class="nav-item">▣ 书架</button>
      </aside>
      <section class="shelf-main">
        <header class="shelf-head">
          <div class="shelf-title">
            <h1>我的书架</h1>
            <p>本地网页原型，数据会保存在当前浏览器里。</p>
          </div>
          <button class="primary" data-action="open-new-book">新建小说</button>
        </header>
        ${
          data.books.length
            ? `<div class="book-grid">${data.books.map(renderBookCard).join("")}</div>`
            : `<div class="empty">还没有小说。先建一本，让故事有个落脚点。</div>`
        }
      </section>
      ${appState.modal === "new-book" ? renderNewBookModal() : ""}
    </main>
  `;
}

function renderBookCard(book) {
  return `
    <article class="book-card" data-action="open-book" data-id="${book.id}">
      <div class="cover">${escapeHtml(book.coverText || "书")}</div>
      <div>
        <h3 class="book-card-title"><span>${escapeHtml(book.title)}</span><button data-action="edit-book-title" data-id="${book.id}" title="修改书名">✎</button></h3>
        <p class="meta">总字数：${bookWordCount(book).toLocaleString("zh-CN")} 字</p>
        <p class="meta">最近编辑：${formatDate(book.updatedAt)}</p>
      </div>
    </article>
  `;
}

function renderNewBookModal() {
  return `
    <div class="modal-backdrop">
      <form class="modal" data-form="new-book">
        <h2>新建小说</h2>
        <label class="field">
          <span>书名</span>
          <input name="title" placeholder="比如：分级乌托邦" autofocus />
        </label>
        <div class="modal-actions">
          <button class="ghost" type="button" data-action="close-modal">取消</button>
          <button class="primary" type="submit">创建</button>
        </div>
      </form>
    </div>
  `;
}

function renderExportModal(book, chapter) {
  const defaultName = escapeAttr(chapter?.title || book?.title || "导出章节");
  return `
    <div class="modal-backdrop">
      <form class="modal" data-form="export">
        <button class="modal-close" type="button" data-action="close-modal">×</button>
        <h2>导出</h2>
        <div class="choice-group">
          <span>导出范围</span>
          <label><input type="radio" name="scope" value="chapter" checked /> 当前章节</label>
          <label><input type="radio" name="scope" value="book" /> 整本书</label>
        </div>
        <div class="choice-group">
          <span>导出格式</span>
          <label><input type="radio" name="format" value="txt" checked /> TXT</label>
        </div>
        <label class="field">
          <span>文件名称</span>
          <input name="filename" value="${defaultName}" />
        </label>
        <div class="modal-actions">
          <button class="ghost" type="button" data-action="close-modal">取消</button>
          <button class="primary" type="submit">确定</button>
        </div>
      </form>
    </div>
  `;
}

function renderBlackHouseRulesModal() {
  const ready = Date.now() >= appState.blackHouseRulesReadyAt;
  const seconds = Math.max(0, Math.ceil((appState.blackHouseRulesReadyAt - Date.now()) / 1000));
  return `
    <div class="modal-backdrop">
      <div class="modal blackhouse-modal">
        <h2>小黑屋</h2>
        <p class="modal-subtitle">完成设定目标即可解锁</p>
        <p>开启小黑屋后，当前写作界面会被锁定。只有完成设定字数或达到规定时间，才可以离开小黑屋。</p>
        <p>网页原型无法真正锁定整台电脑或禁止关闭浏览器，所以第一版先锁定当前写作界面，用来验证写作流程。</p>
        <p>小黑屋开启过程中，请尽量避免大量复制粘贴。后续版本可以继续加入更严格的判断规则。</p>
        <div class="modal-actions">
          <button class="primary" data-action="accept-blackhouse-rules" ${ready ? "" : "disabled"}>${ready ? "知道了" : `${seconds} 秒后可确认`}</button>
        </div>
      </div>
    </div>
  `;
}

function renderBlackHouseSetupModal() {
  return `
    <div class="modal-backdrop">
      <form class="modal blackhouse-modal" data-form="blackhouse">
        <button class="modal-close" type="button" data-action="close-modal">×</button>
        <h2>小黑屋</h2>
        <p class="modal-subtitle">请选择锁定方式</p>
        <div class="choice-group">
          <label><input type="radio" name="type" value="words" checked /> 码字字数</label>
          <label><input type="radio" name="type" value="time" /> 码字时间</label>
        </div>
        <label class="field">
          <span>锁定目标</span>
          <input name="target" type="number" min="1" placeholder="字数或分钟" required />
        </label>
        <p class="modal-note">选择字数时，单位为“字”；选择时间时，单位为“分钟”。</p>
        <div class="modal-actions">
          <button class="ghost" type="button" data-action="close-modal">从心</button>
          <button class="primary" type="submit">进屋</button>
        </div>
      </form>
    </div>
  `;
}

function renderHistoryModal(chapter) {
  const versions = chapter?.versions || [];
  const active = versions.find((item) => item.id === appState.historyVersionId) || versions[0];
  return `
    <div class="modal-backdrop">
      <div class="history-modal">
        <button class="modal-close" type="button" data-action="close-modal">×</button>
        <aside class="history-list">
          <h2>历史版本</h2>
          <p class="meta">最多保留 10 条记录</p>
          ${versions.length ? versions.map((version) => `<button class="${active?.id === version.id ? "active" : ""}" data-action="pick-history" data-id="${version.id}">${formatDate(version.createdAt)}</button>`).join("") : `<div class="empty small">暂无历史版本</div>`}
        </aside>
        <section class="history-preview">
          <h2>${escapeHtml(active?.title || chapter?.title || "当前章节")}</h2>
          <p class="meta">绿色为新增内容，红线为删除内容。第一版先展示历史正文预览。</p>
          <article>${escapeHtml(active?.body || "暂无内容").replaceAll("\n", "<br />")}</article>
          <div class="modal-actions">
            <button class="ghost" type="button" data-action="close-modal">取消</button>
            <button class="primary" type="button" data-action="restore-history" data-id="${active?.id || ""}" ${active ? "" : "disabled"}>恢复此版本</button>
          </div>
        </section>
      </div>
    </div>
  `;
}

function renderSearchModal(book) {
  const results = searchResults(book, appState.searchQuery);
  return `
    <div class="modal-backdrop">
      <div class="search-modal">
        <button class="modal-close" type="button" data-action="close-modal">×</button>
        <aside class="search-side">
          <h2>全文搜索</h2>
          <input data-input="search" value="${escapeAttr(appState.searchQuery)}" placeholder="输入要搜索的内容" autofocus />
          <div class="search-tabs"><span class="active">本书</span><span>本卷</span></div>
          <div class="search-count">${appState.searchQuery ? `${results.length} 个结果` : "立刻开始搜索之旅吧"}</div>
        </aside>
        <section class="search-results">
          ${
            appState.searchQuery
              ? results.map(({ chapter, snippet }) => `<button class="search-result" data-action="open-search-result" data-id="${chapter.id}"><strong>${escapeHtml(chapter.title || "未命名章节")}</strong><span>${escapeHtml(snippet)}</span></button>`).join("") || `<div class="empty small">没有找到相关内容</div>`
              : `<div class="empty small">( ● ᴗ ● )</div>`
          }
        </section>
      </div>
    </div>
  `;
}

function renderBlackHouseOverlay() {
  const progress = blackHouseProgress();
  return `
    <div class="blackhouse-overlay">
      <div class="blackhouse-lock">
        <h2>小黑屋进行中</h2>
        <p data-lock-progress>${progress?.label || ""}</p>
        <div class="lock-bar"><span data-lock-bar style="width:${progress?.percent || 0}%"></span></div>
        <small>完成目标后自动解锁。现在先专心写这一章。</small>
      </div>
    </div>
  `;
}

function renderWorkspace() {
  const book = getBook();
  if (!book) {
    appState.route = "shelf";
    return renderShelf();
  }
  const chapter = getChapter(book);
  if (!appState.activeChapterId && chapter) appState.activeChapterId = chapter.id;
  const stats = sessionStats(book, chapter);
  const gridColumns = `${appState.leftCollapsed ? 0 : book.layout.left}px ${appState.leftCollapsed ? 0 : 6}px minmax(420px, 1fr) ${appState.rightCollapsed ? 0 : 6}px ${appState.rightCollapsed ? 0 : book.layout.right}px`;
  return `
    <main class="app workspace ${appState.leftCollapsed ? "left-collapsed" : ""} ${appState.rightCollapsed ? "right-collapsed" : ""}">
      <header class="workspace-top">
        <div class="top-left">
          <button class="icon-btn" data-action="back-shelf" title="返回书架">‹</button>
          <span class="book-name">${escapeHtml(book.title)}</span>
          <span class="save-state">${appState.saveState}</span>
          <div class="history-controls">
            <button class="history-btn" data-action="undo" title="撤回上一步" ${appState.undoStack.length ? "" : "disabled"}>${historyIcon("undo")}</button>
            <button class="history-btn" data-action="redo" title="恢复下一步" ${appState.redoStack.length ? "" : "disabled"}>${historyIcon("redo")}</button>
          </div>
        </div>
        <div class="top-right">
          <span class="meta">全书 <span data-stat="total">${stats.total.toLocaleString("zh-CN")}</span> 字</span>
        </div>
      </header>
      <div class="workspace-body" style="grid-template-columns:${gridColumns}">
        ${renderChapterList(book, chapter)}
        <div class="pane-resizer" data-resize="left" title="拖动调整章节栏宽度"></div>
        ${renderEditor(book, chapter)}
        <div class="pane-resizer" data-resize="right" title="拖动调整工具栏宽度"></div>
        ${renderSideTools(stats)}
      </div>
      ${appState.modal === "export" ? renderExportModal(book, chapter) : ""}
      ${appState.modal === "blackhouse-rules" ? renderBlackHouseRulesModal() : ""}
      ${appState.modal === "blackhouse-setup" ? renderBlackHouseSetupModal() : ""}
      ${appState.modal === "history" ? renderHistoryModal(chapter) : ""}
      ${appState.modal === "search" ? renderSearchModal(book) : ""}
      ${appState.blackHouse?.active ? renderBlackHouseOverlay() : ""}
    </main>
  `;
}

function renderChapterList(book, activeChapter) {
  ensureBookStructure(book);
  return `
    <aside class="chapter-list">
      <div class="section-head">
        <h2>章节</h2>
        <div class="chapter-actions">
          <button class="ghost" data-action="add-chapter">新建章节</button>
          <button class="ghost" data-action="add-volume">新建分卷</button>
        </div>
      </div>
      <div class="chapter-items">
        ${book.volumes
          .map((volume) => {
            const chapters = book.chapters.filter((chapter) => chapter.volumeId === volume.id);
            return `
              <div class="volume-title">${escapeHtml(volume.title)}</div>
              ${chapters
                .map(
                  (chapter) => `
              <button class="chapter-item ${chapter.id === activeChapter?.id ? "active" : ""}" data-action="select-chapter" data-id="${chapter.id}">
                <span class="chapter-line">
                  <strong>${escapeHtml(chapter.title || "未命名章节")}</strong>
                  ${chapter.rhythm ? `<span class="rhythm">${escapeHtml(chapter.rhythm)}</span>` : ""}
                </span>
                <span class="chapter-count" data-chapter-count="${chapter.id}">${countText(chapter.body).toLocaleString("zh-CN")} 字</span>
              </button>
            `
                )
                .join("")}
            `;
          })
          .join("")}
      </div>
      <div class="chapter-total">
        <span>全文字数</span>
        <strong data-stat="total">${bookWordCount(book).toLocaleString("zh-CN")}</strong>
        <em>字</em>
        <button class="theme-toggle" data-action="toggle-theme" title="${appState.theme === "dark" ? "切换日间模式" : "切换夜间模式"}">${appState.theme === "dark" ? "☀" : "☾"}</button>
      </div>
    </aside>
  `;
}

function renderEditor(book, chapter) {
  if (!chapter) return `<section class="editor-shell"></section>`;
  const format = getFormat(book);
  return `
    <section class="editor-shell" style="background:${escapeAttr(format.background)}">
      <button class="pane-toggle left" data-action="toggle-left-pane" title="${appState.leftCollapsed ? "展开章节栏" : "收起章节栏"}">${appState.leftCollapsed ? "»" : "«"}</button>
      <button class="pane-toggle right" data-action="toggle-right-pane" title="${appState.rightCollapsed ? "展开工具栏" : "收起工具栏"}">${appState.rightCollapsed ? "«" : "»"}</button>
      <article class="editor-card" style="width:min(${format.editorWidth}px, calc(100% - 64px));">
        <input class="chapter-title" data-input="chapter-title" value="${escapeAttr(chapter.title)}" placeholder="章节标题" />
        <div class="rhythm-picker">
          <span>节奏</span>
          ${rhythms
            .map(
              (rhythm) => `
                <button class="rhythm-btn ${chapter.rhythm === rhythm ? "active" : ""}" data-action="set-rhythm" data-value="${escapeAttr(rhythm)}">
                  ${rhythm || "空"}
                </button>
              `
            )
            .join("")}
          <button class="quick-format-btn" data-action="format-body" data-mode="standard" title="按右侧勾选项整理当前章节正文">排版</button>
        </div>
        <textarea class="chapter-body" data-input="chapter-body" style="font-family:${escapeAttr(format.fontFamily)}; font-size:${format.fontSize}px; line-height:${format.lineHeight}; color:${escapeAttr(format.textColor)}; font-weight:${format.bold ? 700 : 400};" placeholder="请输入正文内容">${escapeHtml(chapter.body)}</textarea>
      </article>
      ${renderIdeaPanel(book)}
    </section>
  `;
}

function renderSideTools(stats) {
  const format = getFormat();
  return `
    <aside class="side-tools">
      <div class="side-tabs">
        <button class="${appState.sideTab === "common" ? "active" : ""}" data-action="side-tab" data-tab="common">常用</button>
        <button class="${appState.sideTab === "format" ? "active" : ""}" data-action="side-tab" data-tab="format">格式</button>
      </div>
      ${appState.sideTab === "format" ? renderFormatTools(format) : renderCommonTools(stats)}
    </aside>
  `;
}

function renderCommonTools(stats) {
  return `
    <div class="tool-block">
      <h3>码字统计</h3>
      <div class="stat-card"><span>章节字数</span><strong data-stat="chapter">${stats.chapterWords}</strong> 字</div>
      <div class="stat-card"><span>本次码字</span><strong data-stat="session">${stats.sessionWords}</strong> 字</div>
      <div class="stat-card"><span>本次时长</span><strong data-stat="elapsed">${stats.elapsedText}</strong></div>
      <div class="stat-card">
        <span>当前时速</span>
        <strong data-stat="speed">${stats.speed}</strong> <em data-stat-unit="speed">${stats.speedUnit}</em>
        <small data-stat-note="speed">${stats.speedNote}</small>
      </div>
    </div>
    <div class="tool-block">
      <h3>常规工具</h3>
      <div class="tool-grid">
        <button data-action="import-text" title="导入 TXT 到当前章节" aria-label="导入 TXT 到当前章节">导入</button>
        <button data-action="open-export" title="导出 TXT，可选当前章节或整本书" aria-label="导出 TXT">导出</button>
        <button data-action="open-blackhouse" title="小黑屋：按字数或时间锁定写作界面" aria-label="小黑屋">小黑</button>
        <button data-action="open-history" title="历史版本：查看和恢复当前章节最近 10 条记录" aria-label="历史版本">历史</button>
        <button data-action="open-search" title="全文搜索：搜索整本书章节正文" aria-label="全文搜索">搜索</button>
        <button title="随机取名：后续加入" aria-label="随机取名：后续加入">取名</button>
      </div>
      <input class="hidden-file" type="file" accept=".txt,text/plain" data-input="import-file" />
    </div>
    ${renderBookIntroBox()}
  `;
}


function renderBookIntroBox() {
  const book = getBook();
  if (!book) return "";
  const long = book.intro.length > 200;
  const shown = long && !book.introExpanded ? `${book.intro.slice(0, 200)}...` : book.intro;
  return `
    <div class="tool-block intro-block">
      <h3>作品简介</h3>
      ${
        long && !book.introExpanded
          ? `<div class="intro-preview">${escapeHtml(shown)}</div>`
          : `<textarea data-input="book-intro" maxlength="1200" placeholder="写下这本小说的简介、卖点、主线或给自己的提醒。">${escapeHtml(book.intro)}</textarea>`
      }
      ${long ? `<button class="intro-toggle" data-action="toggle-intro">${book.introExpanded ? "收起" : "展开完整简介"}</button>` : ""}
    </div>
  `;
}
function renderFormatTools(format) {
  return `
    <div class="tool-block">
      <h3>字体排版</h3>
      <label class="format-field">
        <span>字体</span>
        <select data-format="fontFamily">
          ${[
            ["Microsoft YaHei", "微软雅黑"],
            ["SimSun", "宋体"],
            ["SimHei", "黑体"],
            ["KaiTi", "楷体"],
            ["FangSong", "仿宋"],
            ["Noto Sans SC", "思源黑体 / Noto Sans SC"],
            ["Noto Serif SC", "思源宋体 / Noto Serif SC"],
          ]
            .map(([value, label]) => `<option value="${value}" ${format.fontFamily === value ? "selected" : ""}>${label}</option>`)
            .join("")}
        </select>
      </label>
      <label class="format-field">
        <span>字号</span>
        <select data-format="fontSize">
          ${[16, 18, 20, 22, 24].map((size) => `<option value="${size}" ${format.fontSize === size ? "selected" : ""}>${size}</option>`).join("")}
        </select>
      </label>
      <label class="format-field">
        <span>行距</span>
        <select data-format="lineHeight">
          ${[1.6, 1.8, 2, 2.2, 2.5].map((height) => `<option value="${height}" ${format.lineHeight === height ? "selected" : ""}>${height}</option>`).join("")}
        </select>
      </label>
      <label class="format-field">
        <span>编辑区宽度</span>
        <select data-format="editorWidth">
          ${[680, 780, 880, 980].map((width) => `<option value="${width}" ${format.editorWidth === width ? "selected" : ""}>${width}px</option>`).join("")}
        </select>
      </label>
    </div>
    <div class="tool-block">
      <h3>背景装扮</h3>
      <div class="swatch-row">
        ${[
          ["#ecefed", "浅灰"],
          ["#f6f7f4", "米白"],
          ["#edf5f1", "薄绿"],
          ["#f2eff7", "淡紫"],
        ]
          .map(([color, label]) => `<button class="swatch ${format.background === color ? "active" : ""}" style="background:${color}" data-action="set-format" data-key="background" data-value="${color}" title="${label}"></button>`)
          .join("")}
      </div>
      <label class="format-field inline">
        <span>正文加粗</span>
        <input type="checkbox" data-format="bold" ${format.bold ? "checked" : ""} />
      </label>
      <label class="format-field">
        <span>文字颜色</span>
        <select data-format="textColor">
          ${[
            ["#212833", "墨黑"],
            ["#3d4a43", "柔黑"],
            ["#5f4937", "暖棕"],
            ["#263f58", "深蓝"],
          ]
            .map(([color, label]) => `<option value="${color}" ${format.textColor === color ? "selected" : ""}>${label}</option>`)
            .join("")}
        </select>
      </label>
    </div>
    <div class="tool-block">
      <h3>一键排版</h3>
      <div class="format-checks">
        <label><input type="checkbox" data-format="formatIndent" ${format.formatIndent ? "checked" : ""} /> 段首缩进两个字符</label>
        <label><input type="checkbox" data-format="formatBlankLines" ${format.formatBlankLines ? "checked" : ""} /> 段落之间空一行</label>
        <label><input type="checkbox" data-format="formatTrimIndent" ${format.formatTrimIndent ? "checked" : ""} /> 清理多余段首空格</label>
      </div>
      <p class="format-hint">勾选后，点击正文区的小型“一键排版”按钮生效。</p>
    </div>
  `;
}

function renderIdeaPanel(book) {
  const isOpen = appState.ideaPanel !== "closed";
  const classes = `idea-panel ${appState.ideaPanel === "peek" ? "peek" : ""} ${appState.ideaPanel === "full" ? "full" : ""}`;
  return `
    <section class="${classes}">
      <header class="idea-head">
        <button class="idea-toggle-center" data-action="toggle-ideas" title="展开/收起">${isOpen ? "⌄" : "⌃"}</button>
        <div class="idea-title">
          <span>灵感池</span>
          <span class="meta">${book.ideas.length} 张卡片</span>
        </div>
        <div class="idea-actions">
          ${
            isOpen
              ? `<div class="segmented">
                  <button class="${appState.ideaView === "list" ? "active" : ""}" data-action="idea-view" data-view="list">便签流</button>
                  <button class="${appState.ideaView === "wall" ? "active" : ""}" data-action="idea-view" data-view="wall">卡片墙</button>
                </div>`
              : ""
          }
          <button class="ghost" data-action="add-idea">新建灵感</button>
          <button class="icon-btn" data-action="ideas-full" title="全屏">⛶</button>
        </div>
      </header>
      ${
        isOpen
          ? `<div class="idea-content">
              <div class="${appState.ideaView === "wall" ? "idea-wall" : "idea-list"}">
                ${book.ideas.length ? book.ideas.map((idea) => renderIdeaCard(book, idea)).join("") : `<div class="empty">先随手写一张灵感卡，不用分类。</div>`}
              </div>
            </div>`
          : ""
      }
    </section>
  `;
}

function renderIdeaCard(book, idea) {
  return `
    <article class="idea-card ${idea.state}" draggable="true" data-preview="${idea.id}" data-idea-card="${idea.id}">
      <div class="drag-handle" title="拖动调整顺序">↕</div>
      <textarea data-input="idea-content" data-id="${idea.id}" placeholder="一句对白、一个画面、一个反转、一个情绪都可以。">${escapeHtml(idea.content)}</textarea>
      <div class="idea-card-footer">
        <select data-input="idea-state" data-id="${idea.id}">
          ${Object.entries(stateLabels)
            .map(([value, label]) => `<option value="${value}" ${idea.state === value ? "selected" : ""}>${label}</option>`)
            .join("")}
        </select>
        <button class="icon-btn" data-action="delete-idea" data-id="${idea.id}" title="删除">×</button>
      </div>
      <div class="link-row">
        ${
          idea.chapterIds.length
            ? idea.chapterIds
                .map((chapterId) => {
                  const chapter = book.chapters.find((item) => item.id === chapterId);
                  if (!chapter) return "";
                  return `<button class="link-chip active" data-action="remove-link" data-idea="${idea.id}" data-chapter="${chapter.id}" title="点击移除关联">${escapeHtml(chapter.title || "未命名")} ×</button>`;
                })
                .join("")
            : `<span class="link-empty">未关联章节</span>`
        }
      </div>
      <select class="chapter-link-select" data-input="add-link" data-id="${idea.id}">
        <option value="">+ 添加关联章节</option>
        ${book.chapters
          .filter((chapter) => !idea.chapterIds.includes(chapter.id))
          .map((chapter) => `<option value="${chapter.id}">${escapeHtml(chapter.title || "未命名章节")}</option>`)
          .join("")}
      </select>
    </article>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-action]").forEach((node) => {
    node.addEventListener("click", handleAction);
  });

  document.querySelector("[data-form='new-book']")?.addEventListener("submit", (event) => {
    event.preventDefault();
    createBook(new FormData(event.currentTarget).get("title"));
    appState.modal = null;
  });

  document.querySelector("[data-form='export']")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    exportText(form.get("scope"), form.get("filename"));
  });

  document.querySelector("[data-form='blackhouse']")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startBlackHouse(form.get("type"), form.get("target"));
  });

  document.querySelector("[data-input='search']")?.addEventListener("input", (event) => {
    appState.searchQuery = event.target.value;
    render();
  });

  document.querySelector("[data-input='chapter-title']")?.addEventListener("input", (event) => {
    updateChapter({ title: event.target.value });
  });

  document.querySelector("[data-input='chapter-body']")?.addEventListener("beforeinput", handleChapterBeforeInput);
  document.querySelector("[data-input='chapter-body']")?.addEventListener("keydown", handleChapterKeydown);

  document.querySelector("[data-input='chapter-body']")?.addEventListener("input", (event) => {
    handleChapterInput(event);
  });

  document.querySelector("[data-input='book-intro']")?.addEventListener("input", (event) => {
    const book = getBook();
    if (!book || (book.intro.length > 200 && !book.introExpanded)) return;
    updateBook({ intro: event.target.value });
  });

  document.querySelectorAll("[data-input='idea-content']").forEach((node) => {
    node.addEventListener("input", (event) => {
      updateIdea(event.target.dataset.id, { content: event.target.value });
    });
  });

  document.querySelectorAll("[data-input='idea-state']").forEach((node) => {
    node.addEventListener("change", (event) => {
      updateIdea(event.target.dataset.id, { state: event.target.value });
      render();
    });
  });

  document.querySelectorAll("[data-input='add-link']").forEach((node) => {
    node.addEventListener("change", (event) => {
      addIdeaChapter(event.target.dataset.id, event.target.value);
    });
  });

  document.querySelector("[data-input='import-file']")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => importTextToChapter(String(reader.result || ""), file.name));
    reader.readAsText(file, "utf-8");
  });

  document.querySelectorAll("[data-format]").forEach((node) => {
    node.addEventListener("change", (event) => {
      const key = event.target.dataset.format;
      const numericKeys = ["fontSize", "lineHeight", "editorWidth"];
      const value = event.target.type === "checkbox" ? event.target.checked : numericKeys.includes(key) ? Number(event.target.value) : event.target.value;
      updateBookFormat({ [key]: value });
    });
  });

  document.querySelectorAll("[data-preview]").forEach((node) => {
    node.addEventListener("mouseenter", (event) => {
      if (event.target.closest("textarea, select, button")) return;
      showPreview(event.currentTarget.dataset.preview, event.currentTarget);
    });
    node.addEventListener("mouseleave", hidePreview);
  });

  document.querySelectorAll("[data-resize]").forEach((node) => {
    node.addEventListener("pointerdown", (event) => {
      appState.resizingPane = event.currentTarget.dataset.resize;
      document.body.classList.add("is-resizing");
      event.currentTarget.setPointerCapture?.(event.pointerId);
    });
  });
  document.querySelectorAll("[data-idea-card]").forEach((node) => {
    node.addEventListener("dragstart", (event) => {
      if (event.target.closest("textarea, select, button")) {
        event.preventDefault();
        return;
      }
      appState.draggingIdeaId = event.currentTarget.dataset.ideaCard;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", appState.draggingIdeaId);
      event.currentTarget.classList.add("dragging");
    });
    node.addEventListener("dragend", (event) => {
      event.currentTarget.classList.remove("dragging");
      document.querySelectorAll(".idea-card.drop-target").forEach((card) => card.classList.remove("drop-target"));
      appState.draggingIdeaId = null;
    });
    node.addEventListener("dragover", (event) => {
      if (!appState.draggingIdeaId || appState.draggingIdeaId === event.currentTarget.dataset.ideaCard) return;
      event.preventDefault();
      event.currentTarget.classList.add("drop-target");
    });
    node.addEventListener("dragleave", (event) => {
      event.currentTarget.classList.remove("drop-target");
    });
    node.addEventListener("drop", (event) => {
      event.preventDefault();
      const sourceId = event.dataTransfer.getData("text/plain") || appState.draggingIdeaId;
      moveIdea(sourceId, event.currentTarget.dataset.ideaCard);
    });
  });
}

function handleAction(event) {
  const target = event.currentTarget;
  const action = target.dataset.action;
  if (action === "open-new-book") appState.modal = "new-book";
  if (action === "edit-book-title") {
    event.stopPropagation();
    const book = data.books.find((item) => item.id === target.dataset.id);
    if (book) {
      const title = prompt("修改书名", book.title);
      if (title !== null && title.trim()) {
        book.title = title.trim();
        book.coverText = book.title.slice(0, 1);
        touchBook(book);
        persist();
      }
    }
  }
  if (action === "undo") {
    undoChange();
    return;
  }
  if (action === "redo") {
    redoChange();
    return;
  }
  if (action === "toggle-left-pane") appState.leftCollapsed = !appState.leftCollapsed;
  if (action === "toggle-right-pane") appState.rightCollapsed = !appState.rightCollapsed;
  if (action === "close-modal") appState.modal = null;
  if (action === "open-book") openBook(target.dataset.id);
  if (action === "back-shelf") {
    snapshotActiveChapter();
    appState.route = "shelf";
  }
  if (action === "add-chapter") addChapter();
  if (action === "add-volume") addVolume();
  if (action === "select-chapter") {
    snapshotActiveChapter();
    appState.activeChapterId = target.dataset.id;
  }
  if (action === "set-rhythm") updateChapter({ rhythm: target.dataset.value });
  if (action === "side-tab") appState.sideTab = target.dataset.tab;
  if (action === "set-format") updateBookFormat({ [target.dataset.key]: target.dataset.value });
  if (action === "format-body") applyBodyFormat(target.dataset.mode);
  if (action === "import-text") document.querySelector("[data-input='import-file']")?.click();
  if (action === "open-export") appState.modal = "export";
  if (action === "open-history") openHistoryModal();
  if (action === "open-search") {
    appState.searchQuery = "";
    appState.modal = "search";
  }
  if (action === "pick-history") appState.historyVersionId = target.dataset.id;
  if (action === "restore-history") restoreHistoryVersion(target.dataset.id);
  if (action === "open-search-result") {
    snapshotActiveChapter();
    appState.activeChapterId = target.dataset.id;
    appState.modal = null;
  }
  if (action === "open-blackhouse") {
    if (localStorage.getItem("blackhouse-rules-ok") === "1") {
      appState.modal = "blackhouse-setup";
    } else {
      appState.modal = "blackhouse-rules";
      appState.blackHouseRulesReadyAt = Date.now() + 5000;
      setTimeout(render, 5000);
    }
  }
  if (action === "accept-blackhouse-rules") {
    if (Date.now() < appState.blackHouseRulesReadyAt) return;
    localStorage.setItem("blackhouse-rules-ok", "1");
    appState.modal = "blackhouse-setup";
  }
  if (action === "toggle-intro") {
    const book = getBook();
    if (book) {
      updateBook({ introExpanded: !book.introExpanded });
      render();
    }
  }
  if (action === "toggle-theme") {
    appState.theme = appState.theme === "dark" ? "light" : "dark";
    localStorage.setItem("workbench-theme", appState.theme);
  }
  if (action === "toggle-ideas") {
    appState.ideaPanel = appState.ideaPanel === "closed" ? "peek" : "closed";
    if (appState.ideaPanel === "peek") appState.ideaView = "wall";
  }
  if (action === "ideas-full") appState.ideaPanel = "full";
  if (action === "idea-view") appState.ideaView = target.dataset.view;
  if (action === "add-idea") {
    if (appState.ideaPanel === "closed") appState.ideaPanel = "peek";
    addIdea();
    return;
  }
  if (action === "delete-idea") {
    if (confirm("确定删除这张灵感卡吗？删除后可以用顶部撤回按钮找回。")) deleteIdea(target.dataset.id);
  }
  if (action === "remove-link") removeIdeaChapter(target.dataset.idea, target.dataset.chapter);
  render();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

render();
setInterval(updateStatsDisplay, 1000);

let scrollTimer = null;
window.addEventListener(
  "wheel",
  () => {
    document.body.classList.add("is-scrolling");
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => document.body.classList.remove("is-scrolling"), 900);
  },
  { passive: true }
);

window.addEventListener("beforeunload", () => {
  snapshotActiveChapter();
});
















window.addEventListener("pointermove", (event) => {
  if (!appState.resizingPane) return;
  const body = document.querySelector(".workspace-body");
  if (!body) return;
  const rect = body.getBoundingClientRect();
  if (appState.resizingPane === "left") {
    updateBookLayout("left", event.clientX - rect.left);
  } else {
    updateBookLayout("right", rect.right - event.clientX);
  }
});

window.addEventListener("pointerup", () => {
  if (!appState.resizingPane) return;
  appState.resizingPane = null;
  document.body.classList.remove("is-resizing");
});














