const FALLBACK_SOURCES = [
  {
    value: "auto",
    label: "自动选择",
    description: "优先使用腾讯，异常时回退到东方财富。",
  },
  {
    value: "eastmoney",
    label: "东方财富",
    description: "K 线与快照字段更完整，适合默认研究场景。",
  },
  {
    value: "tencent",
    label: "腾讯",
    description: "分钟线与盘口快照稳定性较好，可作为备选信息源。",
  },
];

const DEFAULT_GROUP_NAME = "核心";

const WATCHLIST_SORT_MODES = ["manual", "change_desc", "trend_up"];
const T0_SYMBOL_OVERRIDES = new Set(["sz162719"]);
const WATCHLIST_IMPORT_CODE_HEADERS = ["代码", "证券代码", "股票代码", "基金代码", "code", "symbol", "ticker"];
const WATCHLIST_IMPORT_NAME_HEADERS = ["名称", "证券名称", "股票名称", "基金名称", "证券简称", "股票简称", "基金简称", "name"];

const state = {
  symbol: window.APP_DEFAULTS.symbol,
  timeframe: window.APP_DEFAULTS.timeframe,
  source: loadSourcePreference(window.APP_DEFAULTS.source),
  strategy: loadStrategyPreference(window.APP_DEFAULTS.strategy),
  watchlistSortMode: loadWatchlistSortPreference("manual"),
  watchlistFilter: "",
  chart: null,
  chartResizeObserver: null,
  currentPayload: null,
  strategySignal: null,
  refreshTimer: null,
  quoteTimer: null,
  strategyTimer: null,
  watchlistQuoteTimer: null,
  searchTimer: null,
  searchRequestId: 0,
  searchResults: [],
  activeSuggestionIndex: -1,
  watchlistModel: loadWatchlistModel(),
  watchlistQuotes: {},
  watchlistStrategySignals: {},
  webhookUrl: loadWebhookUrlPreference(),
  webhookLogs: loadWebhookLogs(),
  webhookAlertSymbols: loadWebhookAlertSymbols(),
  webhookAlertStates: loadWebhookAlertStates(),
  availableSources: [...FALLBACK_SOURCES],
  availableStrategies: [],
  rulesPayload: null,
  rulesModalOpen: false,
  webhookModalOpen: false,
  signalDrawerOpen: false,
  isLoadingChart: false,
  isLoadingQuote: false,
  isLoadingStrategy: false,
  isLoadingWatchlistQuotes: false,
  isLoadingWatchlistStrategySignals: false,
  marketRequestId: 0,
  quoteRequestId: 0,
  strategyRequestId: 0,
  watchlistQuoteRequestId: 0,
  watchlistStrategyRequestId: 0,
  lastStrategyAlertKey: "",
  watchlistStrategyTimer: null,
  watchlistScrollTimer: null,
};

const dom = {
  chart: document.getElementById("chart"),
  searchInput: document.getElementById("searchInput"),
  searchButton: document.getElementById("searchButton"),
  searchSuggestions: document.getElementById("searchSuggestions"),
  watchlistButton: document.getElementById("watchlistButton"),
  refreshStatus: document.getElementById("refreshStatus"),
  activeSourceLabel: document.getElementById("activeSourceLabel"),
  sourceSelect: document.getElementById("sourceSelect"),
  strategySelect: document.getElementById("strategySelect"),
  strategyDeleteButton: document.getElementById("strategyDeleteButton"),
  rulesButton: document.getElementById("rulesButton"),
  webhookButton: document.getElementById("webhookButton"),
  webhookInput: document.getElementById("webhookInput"),
  webhookSaveButton: document.getElementById("webhookSaveButton"),
  webhookTestButton: document.getElementById("webhookTestButton"),
  webhookStatusMessage: document.getElementById("webhookStatusMessage"),
  strategySignalBadge: document.getElementById("strategySignalBadge"),
  strategySignalMeta: document.getElementById("strategySignalMeta"),
  toastStack: document.getElementById("toastStack"),
  metricName: document.getElementById("metricName"),
  metricSymbol: document.getElementById("metricSymbol"),
  metricPrice: document.getElementById("metricPrice"),
  metricChange: document.getElementById("metricChange"),
  metricSignal: document.getElementById("metricSignal"),
  metricTime: document.getElementById("metricTime"),
  metricSource: document.getElementById("metricSource"),
  metricSourceMeta: document.getElementById("metricSourceMeta"),
  marketOpen: document.getElementById("marketOpen"),
  marketPrevClose: document.getElementById("marketPrevClose"),
  marketHigh: document.getElementById("marketHigh"),
  marketLow: document.getElementById("marketLow"),
  marketVolume: document.getElementById("marketVolume"),
  marketAmount: document.getElementById("marketAmount"),
  marketTurnover: document.getElementById("marketTurnover"),
  marketAmplitude: document.getElementById("marketAmplitude"),
  watchlistGroups: document.getElementById("watchlistGroups"),
  watchlist: document.getElementById("watchlist"),
  watchlistCount: document.getElementById("watchlistCount"),
  watchlistSortSelect: document.getElementById("watchlistSortSelect"),
  watchlistSearchInput: document.getElementById("watchlistSearchInput"),
  watchlistImportButton: document.getElementById("watchlistImportButton"),
  watchlistImportInput: document.getElementById("watchlistImportInput"),
  buyCount: document.getElementById("buyCount"),
  sellCount: document.getElementById("sellCount"),
  buyReasons: document.getElementById("buyReasons"),
  sellReasons: document.getElementById("sellReasons"),
  warnings: document.getElementById("warnings"),
  macdDifLabel: document.getElementById("macdDifLabel"),
  macdDeaLabel: document.getElementById("macdDeaLabel"),
  macdHistLabel: document.getElementById("macdHistLabel"),
  kdjKLabel: document.getElementById("kdjKLabel"),
  kdjDLabel: document.getElementById("kdjDLabel"),
  kdjJLabel: document.getElementById("kdjJLabel"),
  signalDrawerToggle: document.getElementById("signalDrawerToggle"),
  signalDrawerBackdrop: document.getElementById("signalDrawerBackdrop"),
  signalDrawer: document.getElementById("signalDrawer"),
  signalDrawerClose: document.getElementById("signalDrawerClose"),
  timeframeButtons: document.getElementById("timeframeButtons"),
  rulesBackdrop: document.getElementById("rulesBackdrop"),
  rulesModal: document.getElementById("rulesModal"),
  rulesModalTitle: document.getElementById("rulesModalTitle"),
  rulesModalClose: document.getElementById("rulesModalClose"),
  webhookBackdrop: document.getElementById("webhookBackdrop"),
  webhookModal: document.getElementById("webhookModal"),
  webhookModalClose: document.getElementById("webhookModalClose"),
  webhookSavedUrl: document.getElementById("webhookSavedUrl"),
  webhookSelectedCount: document.getElementById("webhookSelectedCount"),
  webhookLastResult: document.getElementById("webhookLastResult"),
  webhookLogCount: document.getElementById("webhookLogCount"),
  webhookLogList: document.getElementById("webhookLogList"),
  rulesTimeframe: document.getElementById("rulesTimeframe"),
  rulesAdjust: document.getElementById("rulesAdjust"),
  rulesCurrentSource: document.getElementById("rulesCurrentSource"),
  indicatorList: document.getElementById("indicatorList"),
  buyRulesList: document.getElementById("buyRulesList"),
  sellRulesList: document.getElementById("sellRulesList"),
  rulesNotes: document.getElementById("rulesNotes"),
  customRuleInput: document.getElementById("customRuleInput"),
  customRuleSaveButton: document.getElementById("customRuleSaveButton"),
  customRuleMessage: document.getElementById("customRuleMessage"),
};

function defaultWatchlistItems() {
  return [
    { symbol: "sh000001", name: "上证指数" },
    { symbol: "sh000300", name: "沪深300" },
  ];
}

function createDefaultWatchlistModel() {
  return {
    selectedGroup: DEFAULT_GROUP_NAME,
    groups: {
      [DEFAULT_GROUP_NAME]: defaultWatchlistItems(),
      观察: [],
    },
  };
}

function sanitizeGroupName(name) {
  return String(name || "").trim().slice(0, 12);
}

function dedupeWatchlist(items) {
  const seen = new Set();
  const result = [];
  for (const item of Array.isArray(items) ? items : []) {
    const symbol = String(item?.symbol || "").trim().toLowerCase();
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    result.push({
      symbol,
      name: String(item?.name || symbol).trim(),
      trade_cycle: normalizeTradeCycle(item?.trade_cycle),
    });
  }
  return result;
}

function normalizeTradeCycle(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized === "T0" || normalized === "T1" ? normalized : "";
}

function inferTradeCycle(item) {
  const forcedSymbol = String(item?.symbol || "").trim().toLowerCase();
  if (T0_SYMBOL_OVERRIDES.has(forcedSymbol)) {
    return "T0";
  }

  const explicit = normalizeTradeCycle(item?.trade_cycle);
  if (explicit) {
    return explicit;
  }

  const symbol = String(item?.symbol || "").trim().toLowerCase();
  const name = String(item?.name || "").trim().toLowerCase();
  const securityType = String(item?.security_type || item?.securityType || "").trim().toLowerCase();
  const code = symbol.slice(2);
  const text = `${name} ${securityType}`;

  const isIndex =
    text.includes("指数") ||
    securityType.includes("index") ||
    /^(sh000|sh880|sz399)/.test(symbol);
  if (isIndex) {
    return "";
  }

  if (T0_SYMBOL_OVERRIDES.has(symbol)) {
    return "T0";
  }

  if (/^(110|111|113|118|123|127|128)\d{3}$/.test(code)) {
    return "T0";
  }

  const t0Keywords = [
    "黄金",
    "商品",
    "原油",
    "油气",
    "纳指",
    "纳斯达克",
    "标普",
    "恒生",
    "港股",
    "日经",
    "德国",
    "法国",
    "沙特",
    "跨境",
    "qdii",
    "货币",
    "现金",
    "债",
    "国债",
    "政金债",
    "可转债",
    "同业存单",
  ];
  if (t0Keywords.some((keyword) => text.includes(keyword))) {
    return "T0";
  }

  const isFundLike =
    text.includes("etf") ||
    text.includes("lof") ||
    text.includes("基金") ||
    /^(1|5|16)\d{5}$/.test(code);
  if (isFundLike) {
    if (/^(511|513|518)\d{3}$/.test(code)) {
      return "T0";
    }
    return "T1";
  }

  if (/^(000|001|002|003|300|301|600|601|603|605|688)\d{3}$/.test(code)) {
    return "T1";
  }

  return "T1";
}

function tradeCycleClass(value) {
  const normalized = normalizeTradeCycle(value);
  if (normalized === "T0") return "t0";
  if (normalized === "T1") return "t1";
  return "neutral";
}

function normalizeWatchlistStreak(streak) {
  const direction = String(streak?.direction || "").trim().toLowerCase();
  const days = Number(streak?.days || 0);
  const label = String(streak?.label || "").trim();
  if (!label || days < 2 || !["up", "down"].includes(direction)) {
    return { direction: "", days: 0, label: "" };
  }
  return { direction, days, label };
}

function buildWatchlistQuote(symbol, name, market, source = null, streak = null) {
  if (!symbol || !market) {
    return null;
  }
  return {
    symbol: String(symbol).trim().toLowerCase(),
    name: name || market.name || symbol,
    last_price: market.last_price,
    change: market.change,
    change_pct: market.change_pct,
    timestamp: market.timestamp || null,
    source: source || market.source || null,
    streak: normalizeWatchlistStreak(streak),
  };
}

function normalizeWatchlistStrategySignal(payload) {
  const symbol = String(payload?.symbol || "").trim().toLowerCase();
  if (!symbol) {
    return null;
  }

  const signal = String(payload?.signal || "").trim().toUpperCase();
  return {
    symbol,
    signal,
    triggered: Boolean(payload?.triggered),
    strategy_id: normalizeStrategyValue(payload?.strategy?.id),
    priority_label: String(payload?.priority?.label || "").trim(),
    priority_score: Number(payload?.priority?.score),
    timestamp: payload?.timestamp || null,
    reason: String(payload?.reason || "").trim(),
  };
}

function cacheWatchlistQuote(symbol, name, market, source = null, streak = null) {
  const entry = buildWatchlistQuote(symbol, name, market, source, streak);
  if (!entry) {
    return;
  }
  const existing = state.watchlistQuotes[entry.symbol];
  if ((!entry.streak || !entry.streak.label) && existing?.streak?.label) {
    entry.streak = existing.streak;
  }
  state.watchlistQuotes = {
    ...state.watchlistQuotes,
    [entry.symbol]: entry,
  };
}

function cacheWatchlistStrategySignal(payload) {
  const entry = normalizeWatchlistStrategySignal(payload);
  if (!entry) {
    return;
  }

  state.watchlistStrategySignals = {
    ...state.watchlistStrategySignals,
    [entry.symbol]: entry,
  };
}

function currentGroupSymbols() {
  return [...new Set(currentGroupItems().map((item) => String(item?.symbol || "").trim().toLowerCase()).filter(Boolean))];
}

function getWatchlistQuote(item) {
  const symbol = String(item?.symbol || "").trim().toLowerCase();
  if (!symbol) {
    return null;
  }
  if (state.watchlistQuotes[symbol]) {
    return state.watchlistQuotes[symbol];
  }
  if (state.currentPayload?.symbol === symbol && state.currentPayload?.market) {
    return buildWatchlistQuote(symbol, state.currentPayload.name, state.currentPayload.market, state.currentPayload.source?.actual);
  }
  return null;
}

function getWatchlistStrategySignal(item) {
  if (normalizeStrategyValue(state.strategy) === "none") {
    return null;
  }

  const symbol = String(item?.symbol || "").trim().toLowerCase();
  if (!symbol) {
    return null;
  }

  const cached = state.watchlistStrategySignals[symbol];
  if (cached && normalizeStrategyValue(cached.strategy_id) === normalizeStrategyValue(state.strategy)) {
    return cached;
  }

  if (
    state.strategySignal &&
    state.currentPayload?.symbol === symbol &&
    normalizeStrategyValue(state.strategySignal?.strategy?.id) === normalizeStrategyValue(state.strategy)
  ) {
    return normalizeWatchlistStrategySignal(state.strategySignal);
  }

  return null;
}

function watchlistChangeClass(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "neutral";
  if (num > 0) return "up";
  if (num < 0) return "down";
  return "flat";
}

function watchlistStreakClass(streak) {
  const direction = String(streak?.direction || "").trim().toLowerCase();
  if (direction === "up") return "up";
  if (direction === "down") return "down";
  return "neutral";
}

function watchlistStrategySignalClass(signal) {
  const normalized = String(signal || "").trim().toLowerCase();
  if (normalized === "buy") return "buy";
  if (normalized === "sell") return "sell";
  if (normalized === "hold") return "hold";
  return "neutral";
}

function finiteOrFallback(value, fallback = -Infinity) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function strategyTrendRank(signal) {
  const normalized = String(signal || "").trim().toUpperCase();
  if (normalized === "BUY") return 0;
  if (normalized === "HOLD") return 1;
  if (normalized === "SELL") return 2;
  return 3;
}

function watchlistMatchesFilter(item, quote, strategySignal) {
  const keyword = String(state.watchlistFilter || "")
    .trim()
    .toLowerCase();
  if (!keyword) {
    return true;
  }

  const tradeCycle = inferTradeCycle(item);
  const searchText = [
    item?.symbol,
    item?.name,
    quote?.name,
    tradeCycle,
    strategySignal?.signal,
    strategySignal?.reason,
    quote?.streak?.label,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchText.includes(keyword);
}

function getRenderedWatchlistItems() {
  const baseItems = currentGroupItems();
  const mode = normalizeWatchlistSortMode(state.watchlistSortMode);
  const rows = baseItems
    .map((item, index) => ({
      item,
      index,
      quote: getWatchlistQuote(item),
      strategySignal: getWatchlistStrategySignal(item),
    }))
    .filter((row) => watchlistMatchesFilter(row.item, row.quote, row.strategySignal));

  if (mode === "manual") {
    return rows.map((row) => row.item);
  }

  if (mode === "change_desc") {
    rows.sort((left, right) => {
      const changeDiff = finiteOrFallback(right.quote?.change_pct) - finiteOrFallback(left.quote?.change_pct);
      if (changeDiff !== 0) return changeDiff;
      return left.index - right.index;
    });
    return rows.map((row) => row.item);
  }

  if (mode === "trend_up" && normalizeStrategyValue(state.strategy) !== "none") {
    rows.sort((left, right) => {
      const rankDiff =
        strategyTrendRank(left.strategySignal?.signal) - strategyTrendRank(right.strategySignal?.signal);
      if (rankDiff !== 0) return rankDiff;

      const leftPriority =
        String(left.strategySignal?.signal || "").toUpperCase() === "BUY"
          ? finiteOrFallback(left.strategySignal?.priority_score)
          : -Infinity;
      const rightPriority =
        String(right.strategySignal?.signal || "").toUpperCase() === "BUY"
          ? finiteOrFallback(right.strategySignal?.priority_score)
          : -Infinity;
      if (rightPriority !== leftPriority) return rightPriority - leftPriority;

      const changeDiff = finiteOrFallback(right.quote?.change_pct) - finiteOrFallback(left.quote?.change_pct);
      if (changeDiff !== 0) return changeDiff;

      return left.index - right.index;
    });
  }

  return rows.map((row) => row.item);
}

function normalizeWatchlistModel(raw) {
  if (Array.isArray(raw)) {
    return {
      selectedGroup: DEFAULT_GROUP_NAME,
      groups: {
        [DEFAULT_GROUP_NAME]: dedupeWatchlist(raw),
      },
    };
  }

  if (!raw || typeof raw !== "object" || typeof raw.groups !== "object") {
    return createDefaultWatchlistModel();
  }

  const groups = {};
  Object.entries(raw.groups || {}).forEach(([name, items]) => {
    const safeName = sanitizeGroupName(name);
    if (!safeName) return;
    groups[safeName] = dedupeWatchlist(items);
  });

  if (Object.keys(groups).length === 0) {
    groups[DEFAULT_GROUP_NAME] = defaultWatchlistItems();
  }

  const preferred = sanitizeGroupName(raw.selectedGroup);
  const selectedGroup = groups[preferred] ? preferred : Object.keys(groups)[0];
  return { selectedGroup, groups };
}

function loadWatchlistModel() {
  try {
    const raw = localStorage.getItem("signal-deck-watchlist");
    if (!raw) {
      return createDefaultWatchlistModel();
    }
    return normalizeWatchlistModel(JSON.parse(raw));
  } catch (error) {
    console.error(error);
    return createDefaultWatchlistModel();
  }
}

function saveWatchlistModel() {
  localStorage.setItem("signal-deck-watchlist", JSON.stringify(state.watchlistModel));
}

function currentGroupName() {
  return state.watchlistModel.selectedGroup;
}

function currentGroupItems() {
  return state.watchlistModel.groups[currentGroupName()] || [];
}

function totalWatchlistCount() {
  return Object.values(state.watchlistModel.groups).reduce((sum, items) => sum + items.length, 0);
}

function symbolExistsInGroup(symbol, groupName = currentGroupName()) {
  return (state.watchlistModel.groups[groupName] || []).some((item) => item.symbol === symbol);
}

function symbolExistsAnywhere(symbol) {
  return Object.values(state.watchlistModel.groups).some((items) => items.some((item) => item.symbol === symbol));
}

function flattenLegacyWatchlistItems(raw) {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (Array.isArray(raw?.items)) {
    return raw.items;
  }
  if (raw && typeof raw.groups === "object" && raw.groups) {
    return Object.values(raw.groups).flatMap((items) => (Array.isArray(items) ? items : []));
  }
  return [];
}

function createDefaultWatchlistModel() {
  return {
    items: defaultWatchlistItems(),
  };
}

function normalizeWatchlistModel(raw) {
  const items = dedupeWatchlist(flattenLegacyWatchlistItems(raw));
  if (items.length > 0) {
    return { items };
  }
  return createDefaultWatchlistModel();
}

function loadWatchlistModel() {
  try {
    const raw = localStorage.getItem("signal-deck-watchlist");
    if (!raw) {
      return createDefaultWatchlistModel();
    }
    return normalizeWatchlistModel(JSON.parse(raw));
  } catch (error) {
    console.error(error);
    return createDefaultWatchlistModel();
  }
}

function currentGroupName() {
  return "自选池";
}

function currentGroupItems() {
  return Array.isArray(state.watchlistModel?.items) ? state.watchlistModel.items : [];
}

function totalWatchlistCount() {
  return currentGroupItems().length;
}

function symbolExistsInGroup(symbol) {
  return currentGroupItems().some((item) => item.symbol === symbol);
}

function symbolExistsAnywhere(symbol) {
  return currentGroupItems().some((item) => item.symbol === symbol);
}

function loadWebhookUrlPreference() {
  try {
    return localStorage.getItem("signal-deck-webhook-url") || "";
  } catch (error) {
    console.error(error);
    return "";
  }
}

function saveWebhookUrlPreference() {
  try {
    localStorage.setItem("signal-deck-webhook-url", state.webhookUrl || "");
  } catch (error) {
    console.error(error);
  }
}

function loadWebhookLogs() {
  try {
    const raw = JSON.parse(localStorage.getItem("signal-deck-webhook-logs") || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch (error) {
    console.error(error);
    return [];
  }
}

function saveWebhookLogs() {
  try {
    localStorage.setItem("signal-deck-webhook-logs", JSON.stringify((state.webhookLogs || []).slice(0, 80)));
  } catch (error) {
    console.error(error);
  }
}

function commitWebhookUrlPreference() {
  if (dom.webhookInput) {
    state.webhookUrl = dom.webhookInput.value.trim();
    dom.webhookInput.classList.remove("unsaved");
  }
  saveWebhookUrlPreference();
  renderWebhookPanel();
  setWebhookStatusMessage(state.webhookUrl ? "WebHook 地址已保存。" : "WebHook 地址已清空。", state.webhookUrl ? "success" : "neutral");
  setRefreshStatus(state.webhookUrl ? "WebHook 已保存" : "WebHook 已清空");
}

function loadWebhookAlertSymbols() {
  try {
    const raw = JSON.parse(localStorage.getItem("signal-deck-webhook-symbols") || "[]");
    return new Set((Array.isArray(raw) ? raw : []).map((symbol) => String(symbol || "").trim().toLowerCase()).filter(Boolean));
  } catch (error) {
    console.error(error);
    return new Set();
  }
}

function saveWebhookAlertSymbols() {
  try {
    localStorage.setItem("signal-deck-webhook-symbols", JSON.stringify([...state.webhookAlertSymbols]));
  } catch (error) {
    console.error(error);
  }
}

function loadWebhookAlertStates() {
  try {
    const raw = JSON.parse(localStorage.getItem("signal-deck-webhook-states") || "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch (error) {
    console.error(error);
    return {};
  }
}

function saveWebhookAlertStates() {
  try {
    localStorage.setItem("signal-deck-webhook-states", JSON.stringify(state.webhookAlertStates || {}));
  } catch (error) {
    console.error(error);
  }
}

function loadSourcePreference(fallback) {
  try {
    return localStorage.getItem("signal-deck-source") || fallback || "auto";
  } catch (error) {
    console.error(error);
    return fallback || "auto";
  }
}

function saveSourcePreference() {
  localStorage.setItem("signal-deck-source", state.source);
}

function normalizeStrategyValue(value) {
  return String(value || "").trim().toLowerCase() || "none";
}

function loadStrategyPreference(fallback) {
  try {
    return normalizeStrategyValue(localStorage.getItem("signal-deck-strategy") || fallback || "none");
  } catch (error) {
    console.error(error);
    return normalizeStrategyValue(fallback || "none");
  }
}

function saveStrategyPreference() {
  localStorage.setItem("signal-deck-strategy", normalizeStrategyValue(state.strategy));
}

function normalizeWatchlistSortMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return WATCHLIST_SORT_MODES.includes(normalized) ? normalized : "manual";
}

function loadWatchlistSortPreference(fallback) {
  try {
    return normalizeWatchlistSortMode(localStorage.getItem("signal-deck-watchlist-sort") || fallback || "manual");
  } catch (error) {
    console.error(error);
    return normalizeWatchlistSortMode(fallback || "manual");
  }
}

function saveWatchlistSortPreference() {
  localStorage.setItem("signal-deck-watchlist-sort", normalizeWatchlistSortMode(state.watchlistSortMode));
}

function normalizeImportCellText(value) {
  return String(value ?? "")
    .replace(/\u3000/g, " ")
    .trim();
}

function normalizeImportHeader(value) {
  return normalizeImportCellText(value).toLowerCase().replace(/\s+/g, "");
}

function normalizeImportCodeCandidate(value) {
  const text = normalizeImportCellText(value).replace(/['"]/g, "");
  if (!text) {
    return "";
  }

  const directMatch = text.match(/\b(?:sh|sz)\s*\d{6}\b/i);
  if (directMatch) {
    return directMatch[0].replace(/\s+/g, "").toLowerCase();
  }

  const codeMatch = text.match(/(?<!\d)\d{6}(?!\d)/);
  if (codeMatch) {
    return codeMatch[0];
  }

  return "";
}

function detectWatchlistImportColumns(rows) {
  let bestMatch = { headerRow: -1, codeIndex: -1, nameIndex: -1, score: -1 };

  rows.slice(0, 6).forEach((row, rowIndex) => {
    if (!Array.isArray(row)) return;
    let codeIndex = -1;
    let nameIndex = -1;

    row.forEach((cell, cellIndex) => {
      const normalized = normalizeImportHeader(cell);
      if (codeIndex === -1 && WATCHLIST_IMPORT_CODE_HEADERS.includes(normalized)) {
        codeIndex = cellIndex;
      }
      if (nameIndex === -1 && WATCHLIST_IMPORT_NAME_HEADERS.includes(normalized)) {
        nameIndex = cellIndex;
      }
    });

    const score = (codeIndex >= 0 ? 2 : 0) + (nameIndex >= 0 ? 1 : 0);
    if (score > bestMatch.score) {
      bestMatch = { headerRow: rowIndex, codeIndex, nameIndex, score };
    }
  });

  return bestMatch;
}

function pickImportNameFromRow(cells, codeIndex, nameIndex) {
  if (nameIndex >= 0) {
    const explicitName = normalizeImportCellText(cells[nameIndex]);
    if (explicitName) {
      return explicitName;
    }
  }

  return (
    cells.find((cell, index) => {
      if (index === codeIndex) return false;
      const text = normalizeImportCellText(cell);
      if (!text) return false;
      if (normalizeImportCodeCandidate(text)) return false;
      return true;
    }) || ""
  );
}

function extractWatchlistImportItemsFromRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const { headerRow, codeIndex, nameIndex } = detectWatchlistImportColumns(rows);
  const startIndex = headerRow >= 0 && codeIndex >= 0 ? headerRow + 1 : 0;
  const items = [];
  const seen = new Set();

  rows.slice(startIndex).forEach((row) => {
    if (!Array.isArray(row) || row.length === 0) {
      return;
    }

    const cells = row.map((cell) => normalizeImportCellText(cell));
    let raw = codeIndex >= 0 ? normalizeImportCodeCandidate(cells[codeIndex]) : "";
    if (!raw) {
      raw = cells.map((cell) => normalizeImportCodeCandidate(cell)).find(Boolean) || "";
    }
    if (!raw) {
      return;
    }

    const normalizedRaw = raw.toLowerCase();
    if (seen.has(normalizedRaw)) {
      return;
    }
    seen.add(normalizedRaw);

    items.push({
      raw,
      name: pickImportNameFromRow(cells, codeIndex, nameIndex),
    });
  });

  return items;
}

function extractWatchlistImportItemsFromWorkbook(workbook) {
  if (!workbook || !Array.isArray(workbook.SheetNames)) {
    return [];
  }

  const allItems = [];
  const seen = new Set();

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets?.[sheetName];
    if (!sheet) {
      return;
    }
    const rows = window.XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });

    extractWatchlistImportItemsFromRows(rows).forEach((item) => {
      const key = String(item.raw || "").toLowerCase();
      if (!key || seen.has(key)) {
        return;
      }
      seen.add(key);
      allItems.push(item);
    });
  });

  return allItems;
}

async function parseWatchlistImportFile(file) {
  if (!file) {
    return [];
  }
  if (!window.XLSX) {
    throw new Error("XLSX parser is not ready");
  }

  const buffer = await file.arrayBuffer();
  const workbook = window.XLSX.read(buffer, { type: "array" });
  const items = extractWatchlistImportItemsFromWorkbook(workbook);
  if (items.length === 0) {
    throw new Error("No security codes found in workbook");
  }
  return items.slice(0, 200);
}

async function resolveWatchlistImportItems(items) {
  const response = await fetch("/api/watchlist-import", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ items }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Import resolve failed");
  }
  return payload;
}

function mergeImportedWatchlistItems(items) {
  const currentItems = [...currentGroupItems()];
  const existingSymbols = new Set(currentItems.map((item) => String(item?.symbol || "").trim().toLowerCase()).filter(Boolean));
  const added = [];
  const skipped = [];

  items.forEach((item) => {
    const symbol = String(item?.symbol || "").trim().toLowerCase();
    if (!symbol) {
      return;
    }
    if (existingSymbols.has(symbol)) {
      skipped.push(item);
      return;
    }

    existingSymbols.add(symbol);
    added.push(item);
    currentItems.push({
      symbol,
      name: String(item?.name || symbol).trim(),
      security_type: String(item?.security_type || "").trim(),
      trade_cycle: inferTradeCycle(item),
    });
  });

  state.watchlistModel.items = dedupeWatchlist(currentItems);
  saveWatchlistModel();
  renderWatchlist();
  updateWatchlistButtonState();

  if (added.length > 0) {
    fetchWatchlistQuotes({ silent: true });
    fetchWatchlistStrategySignals({ silent: true });
  }

  return { added, skipped };
}

async function handleWatchlistImport(file) {
  if (!file) {
    return;
  }

  setRefreshStatus(`Importing ${file.name}...`);
  const parsedItems = await parseWatchlistImportFile(file);
  const resolvedPayload = await resolveWatchlistImportItems(parsedItems);
  const resolvedItems = Array.isArray(resolvedPayload.items) ? resolvedPayload.items : [];
  const failedItems = Array.isArray(resolvedPayload.errors) ? resolvedPayload.errors : [];
  const { added, skipped } = mergeImportedWatchlistItems(resolvedItems);

  const summaryParts = [];
  if (added.length > 0) summaryParts.push(`added ${added.length}`);
  if (skipped.length > 0) summaryParts.push(`skipped ${skipped.length}`);
  if (failedItems.length > 0) summaryParts.push(`failed ${failedItems.length}`);
  const summaryText = summaryParts.join(", ") || "no new items";

  setRefreshStatus(`Import done: ${summaryText}`);
  showToast({
    tone: added.length > 0 ? "buy" : "neutral",
    title: "Watchlist import complete",
    body: summaryText,
    meta: `Watchlist | ${file.name}`,
  });
}

function getSourceMeta(value) {
  return state.availableSources.find((item) => item.value === value) || FALLBACK_SOURCES.find((item) => item.value === value);
}

function getStrategyMeta(value) {
  const normalized = normalizeStrategyValue(value);
  return state.availableStrategies.find((item) => normalizeStrategyValue(item.id) === normalized) || null;
}

function isCustomStrategy(value = state.strategy) {
  return getStrategyMeta(value)?.type === "custom";
}

function updateStrategyDeleteButtonState(nextStrategy = null) {
  if (!dom.strategyDeleteButton) return;
  const currentValue = nextStrategy ?? dom.strategySelect?.value ?? state.strategy;
  const strategy = getStrategyMeta(currentValue);
  const canDelete = Boolean(strategy && normalizeStrategyValue(strategy.id) !== "none");
  dom.strategyDeleteButton.disabled = !canDelete;
  dom.strategyDeleteButton.title = canDelete ? `删除 ${strategy.label || strategy.id}` : "不启用不能删除";
}

function setRefreshStatus(message) {
  dom.refreshStatus.textContent = message;
}

function formatSigned(value, digits = 2) {
  const num = Number(value || 0);
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(digits)}`;
}

function formatPercent(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  return `${formatSigned(value, digits)}%`;
}

function formatFixed(value, digits = 3) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  return Number(value).toFixed(digits);
}

function formatCompactNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "--";
  }
  const abs = Math.abs(num);
  if (abs >= 1e12) return `${(num / 1e12).toFixed(2)}万亿`;
  if (abs >= 1e8) return `${(num / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${(num / 1e4).toFixed(2)}万`;
  return num.toFixed(2);
}

function normalizeTimestampDigits(value) {
  return String(value ?? "")
    .trim()
    .replace(/\D/g, "");
}

function formatTimestampLabel(value, timeframe = state.timeframe, compact = false) {
  const raw = String(value ?? "").trim();
  const digits = normalizeTimestampDigits(raw);
  if (!digits) {
    return raw || "--";
  }

  if (digits.length >= 12) {
    const year = digits.slice(0, 4);
    const month = digits.slice(4, 6);
    const day = digits.slice(6, 8);
    const hour = digits.slice(8, 10);
    const minute = digits.slice(10, 12);
    if (compact) {
      return `${month}-${day}\n${hour}:${minute}`;
    }
    return `${year}-${month}-${day} ${hour}:${minute}`;
  }

  if (digits.length >= 8) {
    const year = digits.slice(0, 4);
    const month = digits.slice(4, 6);
    const day = digits.slice(6, 8);
    if (compact) {
      if (timeframe === "1w" || timeframe === "1M") {
        return `${year}-${month}`;
      }
      return `${month}-${day}`;
    }
    return `${year}-${month}-${day}`;
  }

  if (digits.length >= 6) {
    const year = digits.slice(0, 4);
    const month = digits.slice(4, 6);
    return `${year}-${month}`;
  }

  return raw;
}

function formatTooltipValue(seriesName, value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  if (seriesName === "VOL") {
    return formatCompactNumber(value);
  }
  if (["MACD Hist", "DIF", "DEA", "K", "D", "J"].includes(seriesName)) {
    return formatFixed(value, 4);
  }
  return formatFixed(value, 3);
}

function getLastFiniteValue(values) {
  if (!Array.isArray(values)) return null;
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = Number(values[index]);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function renderIndicatorHeaders(payload) {
  const macd = payload?.indicators?.macd || {};
  const kdj = payload?.indicators?.kdj || {};

  dom.macdDifLabel.textContent = `DIF:${formatFixed(getLastFiniteValue(macd.dif), 2)}`;
  dom.macdDeaLabel.textContent = `DEA:${formatFixed(getLastFiniteValue(macd.dea), 2)}`;
  dom.macdHistLabel.textContent = `MACD:${formatFixed(getLastFiniteValue(macd.hist), 2)}`;

  dom.kdjKLabel.textContent = `K:${formatFixed(getLastFiniteValue(kdj.k), 2)}`;
  dom.kdjDLabel.textContent = `D:${formatFixed(getLastFiniteValue(kdj.d), 2)}`;
  dom.kdjJLabel.textContent = `J:${formatFixed(getLastFiniteValue(kdj.j), 2)}`;
}

function scheduleChartResize() {
  if (!state.chart) return;

  const runResize = () => {
    if (!state.chart) return;
    try {
      state.chart.resize();
    } catch (error) {
      console.error(error);
    }
  };

  window.requestAnimationFrame(runResize);
  window.setTimeout(runResize, 80);
  window.setTimeout(runResize, 220);
}

function ensureChartReady() {
  if (!state.chart) {
    state.chart = echarts.init(dom.chart);
    window.addEventListener("resize", scheduleChartResize);
  }

  if (!state.chartResizeObserver && typeof ResizeObserver !== "undefined") {
    state.chartResizeObserver = new ResizeObserver(() => {
      scheduleChartResize();
    });
    state.chartResizeObserver.observe(dom.chart);
  }
}

function signalClass(signal) {
  const normalized = String(signal || "").toLowerCase();
  if (normalized === "buy") return "buy";
  if (normalized === "sell") return "sell";
  if (normalized === "hold") return "hold";
  if (normalized === "conflict") return "conflict";
  return "neutral";
}

function setActiveTimeframeButton() {
  dom.timeframeButtons.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.timeframe === state.timeframe);
  });
}

function renderChipList(container, items, emptyText) {
  container.innerHTML = "";
  if (!items || items.length === 0) {
    container.innerHTML = `<div class="empty-state">${emptyText}</div>`;
    return;
  }
  items.forEach((item) => {
    const node = document.createElement("div");
    node.className = "modal-chip";
    node.textContent = item;
    container.appendChild(node);
  });
}

function renderReasons(container, items, emptyText) {
  container.innerHTML = "";
  if (!items || items.length === 0) {
    container.innerHTML = `<div class="empty-state">${emptyText}</div>`;
    return;
  }
  items.forEach((item) => {
    const symbol = String(item?.symbol || "").trim().toLowerCase();
    const node = document.createElement(symbol ? "button" : "div");
    node.className = `reason-chip ${symbol && symbol === state.symbol ? "active" : ""}`;
    node.textContent = item?.text || String(item || "");
    if (symbol) {
      node.type = "button";
      node.addEventListener("click", () => {
        selectSignalDrawerSymbol(symbol);
      });
    }
    container.appendChild(node);
  });
}

function buildWatchlistSignalItem(row) {
  const { item, quote, strategySignal } = row;
  const symbol = String(item?.symbol || strategySignal?.symbol || "").trim().toLowerCase();
  const labelSymbol = symbol.toUpperCase();
  const name = quote?.name || item?.name || labelSymbol;
  const price = quote ? formatFixed(quote.last_price, 3) : "--";
  const change = quote ? formatPercent(quote.change_pct) : "--";
  const signal = String(strategySignal?.signal || "--").toUpperCase();
  const priority = strategySignal?.priority?.label && strategySignal.priority.label !== "--"
    ? ` | ${strategySignal.priority.label}`
    : "";
  const jValue = Number(strategySignal?.indicators?.j);
  const jText = Number.isFinite(jValue) ? ` | J ${formatFixed(jValue, 2)}` : "";
  return {
    symbol,
    text: `${labelSymbol} ${name} | ${price} | ${change} | ${signal}${priority}${jText}`,
  };
}

function scrollActiveWatchlistItemIntoView() {
  const active = dom.watchlist?.querySelector(".watchlist-item.active");
  if (active) {
    active.scrollIntoView({ block: "nearest" });
  }
}

function selectSignalDrawerSymbol(symbol) {
  const normalized = String(symbol || "").trim().toLowerCase();
  if (!normalized) return;
  state.symbol = normalized;
  state.watchlistFilter = "";
  if (dom.watchlistSearchInput) {
    dom.watchlistSearchInput.value = "";
  }
  dom.searchInput.value = normalized;
  renderWatchlist();
  renderSignalDrawerFromWatchlist();
  scrollActiveWatchlistItemIntoView();
  loadMarket(normalized).then(() => {
    scrollActiveWatchlistItemIntoView();
    renderSignalDrawerFromWatchlist();
  });
}

function watchlistAlertStateForRow(row) {
  const signal = String(row.strategySignal?.signal || "").toUpperCase();
  return row.strategySignal?.triggered && ["BUY", "SELL"].includes(signal) ? signal : "HOLD";
}

function setWebhookStatusMessage(message, tone = "neutral") {
  if (!dom.webhookStatusMessage) return;
  dom.webhookStatusMessage.textContent = message || "保存后会持久化到本地；测试发送使用当前输入地址。";
  dom.webhookStatusMessage.classList.toggle("success", tone === "success");
  dom.webhookStatusMessage.classList.toggle("error", tone === "error");
}

function appendWebhookLogEntry(entry) {
  const nextEntry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...entry,
  };
  state.webhookLogs = [nextEntry, ...(state.webhookLogs || [])].slice(0, 80);
  saveWebhookLogs();
  renderWebhookPanel();
}

function formatWebhookLogTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function renderWebhookLogList() {
  if (!dom.webhookLogList) return;
  const logs = Array.isArray(state.webhookLogs) ? state.webhookLogs : [];
  if (dom.webhookLogCount) {
    dom.webhookLogCount.textContent = `${logs.length}`;
  }
  dom.webhookLogList.innerHTML = "";
  if (logs.length === 0) {
    dom.webhookLogList.innerHTML = `<div class="empty-state">还没有 WebHook 发送记录。</div>`;
    return;
  }

  logs.forEach((entry) => {
    const item = document.createElement("article");
    item.className = `webhook-log-item ${entry.ok ? "success" : "error"}`;
    const signal = String(entry.signal || "TEST").toUpperCase();
    const resultText = entry.ok ? "成功" : "失败";
    const statusText = entry.responseStatus ? `HTTP ${entry.responseStatus}` : resultText;
    item.innerHTML = `
      <div class="webhook-log-top">
        <div class="webhook-log-title">
          <span class="webhook-log-signal ${signal.toLowerCase()}">${signal}</span>
          <strong>${entry.symbol ? String(entry.symbol).toUpperCase() : "TEST"}</strong>
        </div>
        <span class="webhook-log-time">${formatWebhookLogTime(entry.createdAt)}</span>
      </div>
      <div class="webhook-log-body">${entry.name || entry.reason || "WebHook 记录"}</div>
      <div class="webhook-log-meta">
        <span>${statusText}</span>
        <span>${entry.strategyLabel || "--"}</span>
        <span>${entry.message || resultText}</span>
      </div>
    `;
    dom.webhookLogList.appendChild(item);
  });
}

function renderWebhookPanel(options = {}) {
  const { syncInput = false } = options;
  if (syncInput && dom.webhookInput) {
    dom.webhookInput.value = state.webhookUrl || "";
    dom.webhookInput.classList.remove("unsaved");
  }
  if (dom.webhookSavedUrl) {
    dom.webhookSavedUrl.textContent = state.webhookUrl || "--";
    dom.webhookSavedUrl.title = state.webhookUrl || "";
  }
  if (dom.webhookSelectedCount) {
    dom.webhookSelectedCount.textContent = `${state.webhookAlertSymbols?.size || 0}`;
  }
  if (dom.webhookLastResult) {
    const latest = Array.isArray(state.webhookLogs) && state.webhookLogs.length > 0 ? state.webhookLogs[0] : null;
    dom.webhookLastResult.textContent = latest
      ? `${String(latest.signal || "TEST").toUpperCase()} · ${latest.ok ? "成功" : "失败"}`
      : "--";
  }
  renderWebhookLogList();
  if (dom.webhookStatusMessage && !dom.webhookStatusMessage.textContent.trim()) {
    setWebhookStatusMessage("");
  }
}

async function testWebhookConnection() {
  const inputUrl = dom.webhookInput?.value.trim() || "";
  const targetUrl = inputUrl || state.webhookUrl || "";
  if (!targetUrl) {
    setWebhookStatusMessage("请先输入 WebHook URL。", "error");
    return;
  }
  if (dom.webhookTestButton) {
    dom.webhookTestButton.disabled = true;
  }
  setWebhookStatusMessage("正在发送测试请求...", "neutral");
  const payload = {
    event: "webhook_test",
    signal: "TEST",
    symbol: state.symbol || "",
    name: state.currentPayload?.name || "手动测试",
    strategy: state.strategy,
    strategy_label: getStrategyMeta(state.strategy)?.label || state.strategy,
    reason: "手动测试 WebHook 连通性",
    timestamp: new Date().toISOString(),
    source: state.source,
  };
  const result = await sendWebhookAlert(payload, {
    urlOverride: targetUrl,
    recordType: "test",
    quietStatus: true,
  });
  if (result.ok) {
    setWebhookStatusMessage(`测试发送成功 · HTTP ${result.status || 200}`, "success");
  } else {
    setWebhookStatusMessage(result.error || "测试发送失败", "error");
  }
  if (dom.webhookTestButton) {
    dom.webhookTestButton.disabled = false;
  }
}

function openWebhookModal() {
  if (state.rulesModalOpen) {
    closeRulesModal();
  }
  setSignalDrawerOpen(false);
  state.webhookModalOpen = true;
  renderWebhookPanel({ syncInput: true });
  setWebhookStatusMessage("");
  dom.webhookBackdrop.classList.remove("hidden");
  dom.webhookModal.classList.remove("hidden");
  dom.webhookModal.setAttribute("aria-hidden", "false");
}

function closeWebhookModal() {
  state.webhookModalOpen = false;
  dom.webhookBackdrop.classList.add("hidden");
  dom.webhookModal.classList.add("hidden");
  dom.webhookModal.setAttribute("aria-hidden", "true");
}

function buildWebhookPayload(row, signal) {
  const symbol = String(row.item?.symbol || row.strategySignal?.symbol || "").trim().toLowerCase();
  const quote = row.quote;
  const strategySignal = row.strategySignal;
  return {
    event: "signal_state_change",
    signal,
    symbol,
    name: quote?.name || row.item?.name || symbol.toUpperCase(),
    strategy: strategySignal?.strategy_id || state.strategy,
    strategy_label: getStrategyMeta(state.strategy)?.label || state.strategy,
    price: quote?.last_price ?? null,
    change: quote?.change ?? null,
    change_pct: quote?.change_pct ?? null,
    reason: strategySignal?.reason || "",
    priority: strategySignal?.priority || null,
    timestamp: strategySignal?.timestamp || new Date().toISOString(),
    source: state.source,
  };
}

async function sendWebhookAlert(payload, options = {}) {
  const { urlOverride = "", recordType = "signal", quietStatus = false } = options;
  const targetUrl = String(urlOverride || state.webhookUrl || "").trim();
  if (!targetUrl) {
    return { ok: false, error: "请先录入 WebHook URL", skipped: true };
  }
  try {
    const response = await fetch("/api/webhook-alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: targetUrl,
        payload,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || "Webhook send failed");
    }
    appendWebhookLogEntry({
      ok: true,
      type: recordType,
      signal: payload.signal || "TEST",
      symbol: payload.symbol || "",
      name: payload.name || payload.reason || "",
      strategyLabel: payload.strategy_label || payload.strategy || "",
      responseStatus: result.status || response.status,
      message: (result.body || "发送成功").toString().slice(0, 80),
      reason: payload.reason || "",
    });
    if (!quietStatus) {
      setRefreshStatus(`Webhook 已发送 · ${String(payload.symbol || "test").toUpperCase()} ${payload.signal}`);
    }
    return { ok: true, status: result.status || response.status, body: result.body || "" };
  } catch (error) {
    console.error(error);
    appendWebhookLogEntry({
      ok: false,
      type: recordType,
      signal: payload.signal || "TEST",
      symbol: payload.symbol || "",
      name: payload.name || payload.reason || "",
      strategyLabel: payload.strategy_label || payload.strategy || "",
      responseStatus: null,
      message: (error.message || "Webhook send failed").toString().slice(0, 80),
      reason: payload.reason || "",
    });
    if (!quietStatus) {
      setRefreshStatus(error.message || "Webhook send failed");
    }
    return { ok: false, error: error.message || "Webhook send failed" };
  }
}

function seedWebhookAlertState(symbol) {
  const normalized = String(symbol || "").trim().toLowerCase();
  if (!normalized) return;
  const item = currentGroupItems().find((entry) => String(entry.symbol || "").trim().toLowerCase() === normalized);
  if (!item) return;
  const row = {
    item,
    quote: getWatchlistQuote(item),
    strategySignal: getWatchlistStrategySignal(item),
  };
  state.webhookAlertStates[normalized] = {
    signal: watchlistAlertStateForRow(row),
    updatedAt: Date.now(),
  };
  saveWebhookAlertStates();
}

function processWebhookAlerts() {
  const rows = currentGroupItems().map((item) => ({
    item,
    quote: getWatchlistQuote(item),
    strategySignal: getWatchlistStrategySignal(item),
  }));
  let changed = false;
  rows.forEach((row) => {
    const symbol = String(row.item?.symbol || "").trim().toLowerCase();
    if (!symbol) return;
    const nextSignal = watchlistAlertStateForRow(row);
    const previous = state.webhookAlertStates[symbol]?.signal;
    if (!previous) {
      state.webhookAlertStates[symbol] = { signal: nextSignal, updatedAt: Date.now() };
      changed = true;
      return;
    }
    if (previous === nextSignal) {
      return;
    }

    state.webhookAlertStates[symbol] = { signal: nextSignal, updatedAt: Date.now() };
    changed = true;
    if (state.webhookAlertSymbols.has(symbol) && ["BUY", "SELL"].includes(nextSignal) && state.webhookUrl) {
      sendWebhookAlert(buildWebhookPayload(row, nextSignal));
    }
  });
  if (changed) {
    saveWebhookAlertStates();
  }
}

function renderSignalDrawerFromWatchlist() {
  const items = currentGroupItems();
  const total = items.length;
  const strategyOff = normalizeStrategyValue(state.strategy) === "none";

  if (strategyOff) {
    dom.buyCount.textContent = `0 / ${total}`;
    dom.sellCount.textContent = `0 / ${total}`;
    renderReasons(dom.buyReasons, [], "当前未启用策略，选择规则后显示自选池买入命中。");
    renderReasons(dom.sellReasons, [], "当前未启用策略，选择规则后显示自选池卖出命中。");
    renderWarnings([]);
    return;
  }

  const rows = items.map((item) => ({
    item,
    quote: getWatchlistQuote(item),
    strategySignal: getWatchlistStrategySignal(item),
  }));

  const buyRows = rows.filter((row) => {
    const signal = String(row.strategySignal?.signal || "").toUpperCase();
    return row.strategySignal?.triggered && signal === "BUY";
  });
  const sellRows = rows.filter((row) => {
    const signal = String(row.strategySignal?.signal || "").toUpperCase();
    return row.strategySignal?.triggered && signal === "SELL";
  });

  dom.buyCount.textContent = `${buyRows.length} / ${total}`;
  dom.sellCount.textContent = `${sellRows.length} / ${total}`;
  renderReasons(dom.buyReasons, buyRows.map(buildWatchlistSignalItem), "当前自选池没有买入命中。");
  renderReasons(dom.sellReasons, sellRows.map(buildWatchlistSignalItem), "当前自选池没有卖出命中。");
  renderWarnings([]);
}

async function refreshSignalDrawerData() {
  if (!state.signalDrawerOpen) return;
  renderSignalDrawerFromWatchlist();
  await fetchWatchlistQuotes({ silent: true });
  await fetchWatchlistStrategySignals({ silent: true });
  renderSignalDrawerFromWatchlist();
}

function renderWarnings(warnings) {
  if (!warnings || warnings.length === 0) {
    dom.warnings.classList.add("hidden");
    dom.warnings.innerHTML = "";
    return;
  }
  dom.warnings.classList.remove("hidden");
  dom.warnings.innerHTML = warnings.map((warning) => `<div>${warning}</div>`).join("");
}

function updateWatchlistButtonState() {
  if (!state.currentPayload) return;
  const symbol = state.currentPayload.symbol;
  dom.watchlistButton.textContent = symbolExistsInGroup(symbol) ? "已在当前组" : "加入当前组";
}

function renderSourceOptions() {
  dom.sourceSelect.innerHTML = "";
  state.availableSources.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    dom.sourceSelect.appendChild(option);
  });

  if (!getSourceMeta(state.source)) {
    state.source = window.APP_DEFAULTS.source || "auto";
  }
  dom.sourceSelect.value = state.source;
}

function renderSourcePanels(sourcePayload) {
  const source = sourcePayload || {
    requested: state.source,
    requested_label: getSourceMeta(state.source)?.label || state.source,
    actual: state.source,
    actual_label: getSourceMeta(state.source)?.label || state.source,
  };
  const requestedMeta = getSourceMeta(source.requested);
  const actualMeta = getSourceMeta(source.actual);

  dom.activeSourceLabel.textContent = source.actual_label;
  dom.metricSource.textContent = source.actual_label;
  dom.metricSourceMeta.textContent =
    source.requested === source.actual ? `请求: ${source.requested_label}` : `${source.requested_label} → ${source.actual_label}`;
  dom.sourceRequested.textContent = source.requested_label;
  dom.sourceActual.textContent = source.actual_label;
  dom.sourceActualBadge.textContent = source.actual_label;

  if (source.requested === source.actual) {
    dom.sourceDescription.textContent = actualMeta?.description || "当前信息源可用于 K 线与快照查询。";
  } else {
    dom.sourceDescription.textContent = `当前为自动切源，实际使用 ${source.actual_label}。${requestedMeta?.description || ""}`;
  }
}

function renderSummary(payload) {
  dom.metricName.textContent = payload.name;
  dom.metricSymbol.textContent = `${payload.symbol.toUpperCase()} · ${payload.timeframe}`;
  dom.metricPrice.textContent = formatFixed(payload.last_price, 3);
  dom.metricChange.textContent = `${formatSigned(payload.change)} / ${formatPercent(payload.change_pct)}`;
  dom.metricChange.style.color = payload.change >= 0 ? "var(--buy)" : "var(--sell)";
  dom.metricSignal.textContent = payload.signal.signal;
  dom.metricSignal.className = `metric-value signal-pill ${signalClass(payload.signal.signal)}`;
  dom.metricTime.textContent = `更新于 ${payload.market.timestamp || payload.last_timestamp}`;
  renderSignalDrawerFromWatchlist();
  renderSourcePanels(payload.source);
  renderIndicatorHeaders(payload);
  updateWatchlistButtonState();
}

function renderMarketStats(market) {
  dom.marketOpen.textContent = formatFixed(market.open, 3);
  dom.marketPrevClose.textContent = formatFixed(market.prev_close, 3);
  dom.marketHigh.textContent = formatFixed(market.high, 3);
  dom.marketLow.textContent = formatFixed(market.low, 3);
  dom.marketVolume.textContent = formatCompactNumber(market.volume);
  dom.marketAmount.textContent = formatCompactNumber(market.amount);
  dom.marketTurnover.textContent = formatPercent(market.turnover_rate, 2);
  dom.marketAmplitude.textContent = formatPercent(market.amplitude_pct, 2);
}

function setCurrentGroup(name) {
  if (!state.watchlistModel.groups[name]) return;
  state.watchlistModel.selectedGroup = name;
  saveWatchlistModel();
  renderWatchlist();
  fetchWatchlistQuotes({ silent: true });
  fetchWatchlistStrategySignals({ silent: true });
  updateWatchlistButtonState();
}

function createGroup() {
  const groupName = sanitizeGroupName(dom.groupNameInput.value);
  if (!groupName) {
    setRefreshStatus("请输入分组名称");
    return;
  }
  if (state.watchlistModel.groups[groupName]) {
    setRefreshStatus("这个分组已经存在");
    return;
  }
  state.watchlistModel.groups[groupName] = [];
  state.watchlistModel.selectedGroup = groupName;
  dom.groupNameInput.value = "";
  saveWatchlistModel();
  renderWatchlist();
  fetchWatchlistQuotes({ silent: true });
  fetchWatchlistStrategySignals({ silent: true });
  updateWatchlistButtonState();
}

function deleteCurrentGroup() {
  const groupName = currentGroupName();
  if (groupName === DEFAULT_GROUP_NAME) {
    setRefreshStatus("默认分组不能删除");
    return;
  }
  const count = currentGroupItems().length;
  const confirmed = window.confirm(`确定删除分组“${groupName}”吗？${count > 0 ? "该组自选也会一起移除。" : ""}`);
  if (!confirmed) return;
  delete state.watchlistModel.groups[groupName];
  state.watchlistModel.selectedGroup = Object.keys(state.watchlistModel.groups)[0] || DEFAULT_GROUP_NAME;
  if (!state.watchlistModel.groups[state.watchlistModel.selectedGroup]) {
    state.watchlistModel.groups[state.watchlistModel.selectedGroup] = [];
  }
  saveWatchlistModel();
  renderWatchlist();
  fetchWatchlistQuotes({ silent: true });
  fetchWatchlistStrategySignals({ silent: true });
  updateWatchlistButtonState();
}

function renderWatchlistGroups() {
  dom.watchlistGroups.innerHTML = "";
  Object.entries(state.watchlistModel.groups).forEach(([name, items]) => {
    const button = document.createElement("button");
    button.className = `group-chip ${name === currentGroupName() ? "active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <span>${name}</span>
      <span class="group-chip-count">${items.length}</span>
    `;
    button.addEventListener("click", () => {
      setCurrentGroup(name);
    });
    dom.watchlistGroups.appendChild(button);
  });
}

function renderWatchlist() {
  dom.watchlist.innerHTML = "";
  const baseItems = currentGroupItems();
  const items = getRenderedWatchlistItems();
  const hasFilter = Boolean(String(state.watchlistFilter || "").trim());
  dom.watchlistCount.textContent = hasFilter ? `${items.length}/${totalWatchlistCount()}` : `${totalWatchlistCount()}`;
  if (dom.watchlistSortSelect) {
    dom.watchlistSortSelect.value = normalizeWatchlistSortMode(state.watchlistSortMode);
  }
  if (dom.watchlistSearchInput && dom.watchlistSearchInput.value !== state.watchlistFilter) {
    dom.watchlistSearchInput.value = state.watchlistFilter;
  }

  if (baseItems.length === 0) {
    dom.watchlist.innerHTML = `<div class="empty-state">当前分组还没有自选，先查一个标的再加入。</div>`;
    return;
  }

  items.forEach((item) => {
    const itemSymbol = String(item.symbol || "").trim().toLowerCase();
    const tradeCycle = inferTradeCycle(item);
    const quote = getWatchlistQuote(item);
    const strategySignal = getWatchlistStrategySignal(item);
    const changeClass = watchlistChangeClass(quote?.change_pct);
    const streak = quote?.streak;
    const wrapper = document.createElement("div");
    wrapper.className = `watchlist-item ${item.symbol === state.symbol ? "active" : ""}`;
    wrapper.dataset.symbol = item.symbol;

    const alertToggle = document.createElement("button");
    const alertEnabled = state.webhookAlertSymbols.has(item.symbol);
    alertToggle.className = `watchlist-alert-toggle ${alertEnabled ? "active" : ""}`;
    alertToggle.type = "button";
    alertToggle.setAttribute("aria-pressed", alertEnabled ? "true" : "false");
    alertToggle.setAttribute("aria-label", alertEnabled ? "关闭 WebHook 提醒" : "开启 WebHook 提醒");
    alertToggle.title = alertEnabled ? "已开启 WebHook 提醒" : "开启 WebHook 提醒";
    alertToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      if (state.webhookAlertSymbols.has(item.symbol)) {
        state.webhookAlertSymbols.delete(item.symbol);
      } else {
        state.webhookAlertSymbols.add(item.symbol);
        seedWebhookAlertState(item.symbol);
      }
      saveWebhookAlertSymbols();
      renderWatchlist();
    });

    const main = document.createElement("button");
    main.className = "watchlist-main";
    main.type = "button";
    main.innerHTML = `
      <span class="watchlist-topline">
        <span class="watchlist-identity">
          <span class="watchlist-symbol">${item.symbol.toUpperCase()}</span>
          <span class="watchlist-name">${quote?.name || item.name || item.symbol}</span>
        </span>
        <span class="watchlist-price ${changeClass}">${quote ? formatFixed(quote.last_price, 3) : "--"}</span>
      </span>
      <span class="watchlist-bottomline">
        <span class="watchlist-tags">
          <span class="watchlist-cycle ${tradeCycleClass(tradeCycle)}">${tradeCycle || "--"}</span>
          ${
            strategySignal?.triggered && ["BUY", "SELL"].includes(strategySignal.signal)
              ? `<span class="watchlist-signal ${watchlistStrategySignalClass(strategySignal.signal)}">5m ${strategySignal.signal}</span>`
              : ""
          }
          ${streak?.label ? `<span class="watchlist-streak ${watchlistStreakClass(streak)}">${streak.label}</span>` : ""}
        </span>
        <span class="watchlist-change ${changeClass}">${quote ? `${formatSigned(quote.change)} / ${formatPercent(quote.change_pct)}` : "-- / --"}</span>
      </span>
    `;
    main.addEventListener("click", () => {
      state.symbol = item.symbol;
      dom.searchInput.value = item.symbol;
      loadMarket(item.symbol);
    });

    const remove = document.createElement("button");
    remove.className = "watchlist-remove";
    remove.type = "button";
    remove.textContent = "";
    remove.setAttribute("aria-label", "移除自选");
    remove.title = "移除";
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      state.watchlistModel.groups[currentGroupName()] = currentGroupItems().filter((entry) => entry.symbol !== item.symbol);
      saveWatchlistModel();
      renderWatchlist();
      fetchWatchlistQuotes({ silent: true });
      fetchWatchlistStrategySignals({ silent: true });
      updateWatchlistButtonState();
    });

    wrapper.appendChild(alertToggle);
    wrapper.appendChild(main);
    wrapper.appendChild(remove);
    dom.watchlist.appendChild(wrapper);
  });
}

function renderWatchlist() {
  dom.watchlist.innerHTML = "";

  const baseItems = currentGroupItems();
  const items = getRenderedWatchlistItems();
  const hasFilter = Boolean(String(state.watchlistFilter || "").trim());

  if (dom.watchlistSortSelect) {
    dom.watchlistSortSelect.value = normalizeWatchlistSortMode(state.watchlistSortMode);
  }
  if (dom.watchlistSearchInput && dom.watchlistSearchInput.value !== state.watchlistFilter) {
    dom.watchlistSearchInput.value = state.watchlistFilter;
  }

  dom.watchlistCount.textContent = hasFilter ? `${items.length}/${totalWatchlistCount()}` : `${totalWatchlistCount()}`;

  if (baseItems.length === 0) {
    dom.watchlist.innerHTML = `<div class="empty-state">当前还没有自选项，先查询一个标的再加入。</div>`;
    return;
  }

  if (items.length === 0) {
    dom.watchlist.innerHTML = `<div class="empty-state">未找到匹配的自选项，换个关键词试试。</div>`;
    return;
  }

  items.forEach((item) => {
    const itemSymbol = String(item.symbol || "").trim().toLowerCase();
    const tradeCycle = inferTradeCycle(item);
    const quote = getWatchlistQuote(item);
    const strategySignal = getWatchlistStrategySignal(item);
    const changeClass = watchlistChangeClass(quote?.change_pct);
    const streak = quote?.streak;
    const wrapper = document.createElement("div");
    wrapper.className = `watchlist-item ${itemSymbol === String(state.symbol || "").trim().toLowerCase() ? "active" : ""}`;
    wrapper.dataset.symbol = itemSymbol;

    const alertToggle = document.createElement("button");
    const alertEnabled = state.webhookAlertSymbols.has(itemSymbol);
    alertToggle.className = `watchlist-alert-toggle ${alertEnabled ? "active" : ""}`;
    alertToggle.type = "button";
    alertToggle.setAttribute("aria-pressed", alertEnabled ? "true" : "false");
    alertToggle.setAttribute("aria-label", alertEnabled ? "Disable WebHook alert" : "Enable WebHook alert");
    alertToggle.title = alertEnabled ? "WebHook alert on" : "WebHook alert off";
    alertToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      if (state.webhookAlertSymbols.has(itemSymbol)) {
        state.webhookAlertSymbols.delete(itemSymbol);
      } else {
        state.webhookAlertSymbols.add(itemSymbol);
        seedWebhookAlertState(itemSymbol);
      }
      saveWebhookAlertSymbols();
      renderWatchlist();
    });

    const main = document.createElement("button");
    main.className = "watchlist-main";
    main.type = "button";
    main.innerHTML = `
      <span class="watchlist-topline">
        <span class="watchlist-identity">
          <span class="watchlist-symbol">${item.symbol.toUpperCase()}</span>
          <span class="watchlist-name">${quote?.name || item.name || item.symbol}</span>
        </span>
        <span class="watchlist-price ${changeClass}">${quote ? formatFixed(quote.last_price, 3) : "--"}</span>
      </span>
      <span class="watchlist-bottomline">
        <span class="watchlist-tags">
          <span class="watchlist-cycle ${tradeCycleClass(tradeCycle)}">${tradeCycle || "--"}</span>
          ${
            strategySignal?.triggered && ["BUY", "SELL"].includes(strategySignal.signal)
              ? `<span class="watchlist-signal ${watchlistStrategySignalClass(strategySignal.signal)}">5m ${strategySignal.signal}</span>`
              : ""
          }
          ${streak?.label ? `<span class="watchlist-streak ${watchlistStreakClass(streak)}">${streak.label}</span>` : ""}
        </span>
        <span class="watchlist-change ${changeClass}">${quote ? `${formatSigned(quote.change)} / ${formatPercent(quote.change_pct)}` : "-- / --"}</span>
      </span>
    `;
    main.addEventListener("click", () => {
      state.symbol = item.symbol;
      dom.searchInput.value = item.symbol;
      loadMarket(item.symbol);
    });

    const remove = document.createElement("button");
    remove.className = "watchlist-remove";
    remove.type = "button";
    remove.textContent = "";
    remove.setAttribute("aria-label", "移除自选");
    remove.title = "移除";
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      state.watchlistModel.items = currentGroupItems().filter((entry) => entry.symbol !== item.symbol);
      delete state.webhookAlertStates[itemSymbol];
      state.webhookAlertSymbols.delete(itemSymbol);
      saveWatchlistModel();
      saveWebhookAlertSymbols();
      saveWebhookAlertStates();
      renderWatchlist();
      fetchWatchlistQuotes({ silent: true });
      fetchWatchlistStrategySignals({ silent: true });
      updateWatchlistButtonState();
    });

    wrapper.appendChild(alertToggle);
    wrapper.appendChild(main);
    wrapper.appendChild(remove);
    dom.watchlist.appendChild(wrapper);
  });
}

function renderChart(payload) {
  ensureChartReady();

  const colorUp = "#11855e";
  const colorDown = "#c85243";
  const axisColor = "rgba(22, 33, 42, 0.55)";
  const splitColor = "rgba(22, 33, 42, 0.08)";

  state.chart.setOption(
    {
      animation: false,
      backgroundColor: "transparent",
      color: [colorUp, "#ffb347", "#125e78", "#1a8fca", "#8964d8"],
      legend: {
        top: 8,
        left: 12,
        textStyle: {
          color: axisColor,
          fontFamily: "IBM Plex Mono",
        },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
        backgroundColor: "rgba(21, 27, 33, 0.94)",
        borderWidth: 0,
        textStyle: { color: "#f4f7fa" },
      },
      axisPointer: {
        link: [{ xAxisIndex: "all" }],
        label: { backgroundColor: "#17232e" },
      },
      grid: [
        { left: 58, right: 18, top: 42, height: "38%" },
        { left: 58, right: 18, top: "50%", height: "10%" },
        { left: 58, right: 18, top: "64%", height: "12%" },
        { left: 58, right: 18, top: "80%", height: "10%" },
      ],
      dataZoom: [
        { type: "inside", xAxisIndex: [0, 1, 2, 3], start: 72, end: 100 },
        {
          type: "slider",
          xAxisIndex: [0, 1, 2, 3],
          bottom: 8,
          height: 18,
          borderColor: "transparent",
          backgroundColor: "rgba(22, 33, 42, 0.06)",
          fillerColor: "rgba(15, 122, 109, 0.18)",
          handleSize: "110%",
        },
      ],
      xAxis: [
        {
          type: "category",
          data: payload.chart.timestamps,
          boundaryGap: true,
          axisLine: { lineStyle: { color: splitColor } },
          axisLabel: { show: false },
          min: "dataMin",
          max: "dataMax",
        },
        {
          type: "category",
          gridIndex: 1,
          data: payload.chart.timestamps,
          boundaryGap: true,
          axisLine: { lineStyle: { color: splitColor } },
          axisLabel: { show: false },
          axisTick: { show: false },
        },
        {
          type: "category",
          gridIndex: 2,
          data: payload.chart.timestamps,
          boundaryGap: true,
          axisLine: { lineStyle: { color: splitColor } },
          axisLabel: { show: false },
          axisTick: { show: false },
        },
        {
          type: "category",
          gridIndex: 3,
          data: payload.chart.timestamps,
          boundaryGap: true,
          axisLine: { lineStyle: { color: splitColor } },
          axisLabel: { color: axisColor, hideOverlap: true },
        },
      ],
      yAxis: [
        {
          scale: true,
          splitNumber: 4,
          axisLine: { show: false },
          axisLabel: { color: axisColor },
          splitLine: { lineStyle: { color: splitColor } },
        },
        {
          gridIndex: 1,
          scale: true,
          splitNumber: 2,
          axisLine: { show: false },
          axisLabel: { color: axisColor, formatter: (value) => formatCompactNumber(value) },
          splitLine: { show: false },
        },
        {
          gridIndex: 2,
          scale: true,
          splitNumber: 3,
          axisLine: { show: false },
          axisLabel: { color: axisColor },
          splitLine: { lineStyle: { color: splitColor } },
        },
        {
          gridIndex: 3,
          scale: true,
          splitNumber: 3,
          axisLine: { show: false },
          axisLabel: { color: axisColor },
          splitLine: { lineStyle: { color: splitColor } },
        },
      ],
      series: [
        {
          name: "K线",
          type: "candlestick",
          data: payload.chart.candles,
          itemStyle: {
            color: colorUp,
            color0: colorDown,
            borderColor: colorUp,
            borderColor0: colorDown,
          },
        },
        {
          name: `${payload.timeframe} MA5`,
          type: "line",
          data: payload.indicators.ma5,
          showSymbol: false,
          smooth: true,
          lineStyle: { width: 1.4, color: "#ffb347" },
        },
        {
          name: `${payload.timeframe} MA20`,
          type: "line",
          data: payload.indicators.ma20,
          showSymbol: false,
          smooth: true,
          lineStyle: { width: 1.4, color: "#125e78" },
        },
        {
          name: "VOL",
          type: "bar",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: payload.chart.volumes,
          itemStyle: {
            color: (params) => {
              const candle = payload.chart.candles[params.dataIndex] || [0, 0];
              return candle[1] >= candle[0] ? colorUp : colorDown;
            },
          },
        },
        {
          name: "MACD Hist",
          type: "bar",
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: payload.indicators.macd.hist,
          itemStyle: {
            color: (params) => (params.value >= 0 ? colorUp : colorDown),
          },
        },
        {
          name: "DIF",
          type: "line",
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: payload.indicators.macd.dif,
          showSymbol: false,
          lineStyle: { width: 1.4, color: "#125e78" },
        },
        {
          name: "DEA",
          type: "line",
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: payload.indicators.macd.dea,
          showSymbol: false,
          lineStyle: { width: 1.4, color: "#d9974d" },
        },
        {
          name: "K",
          type: "line",
          xAxisIndex: 3,
          yAxisIndex: 3,
          data: payload.indicators.kdj.k,
          showSymbol: false,
          lineStyle: { width: 1.4, color: "#11855e" },
        },
        {
          name: "D",
          type: "line",
          xAxisIndex: 3,
          yAxisIndex: 3,
          data: payload.indicators.kdj.d,
          showSymbol: false,
          lineStyle: { width: 1.4, color: "#125e78" },
        },
        {
          name: "J",
          type: "line",
          xAxisIndex: 3,
          yAxisIndex: 3,
          data: payload.indicators.kdj.j,
          showSymbol: false,
          lineStyle: { width: 1.4, color: "#8f5ad6" },
        },
      ],
    },
    true
  );

  scheduleChartResize();
}

function hideSuggestions() {
  state.activeSuggestionIndex = -1;
  dom.searchSuggestions.classList.add("hidden");
  dom.searchSuggestions.innerHTML = "";
}

function isSuggestionsOpen() {
  return !dom.searchSuggestions.classList.contains("hidden");
}

function setActiveSuggestionIndex(index) {
  const buttons = [...dom.searchSuggestions.querySelectorAll("button")];
  if (buttons.length === 0) {
    state.activeSuggestionIndex = -1;
    return;
  }

  const safeIndex = Math.max(0, Math.min(index, buttons.length - 1));
  state.activeSuggestionIndex = safeIndex;
  buttons.forEach((button, buttonIndex) => {
    button.classList.toggle("active", buttonIndex === safeIndex);
  });
  buttons[safeIndex]?.scrollIntoView({ block: "nearest" });
}

async function selectSuggestion(item) {
  if (!item?.symbol) {
    return;
  }
  state.symbol = item.symbol;
  dom.searchInput.value = item.symbol;
  hideSuggestions();
  await loadMarket(item.symbol);
}

function renderSuggestions(items) {
  state.searchResults = Array.isArray(items) ? items : [];
  if (!items || items.length === 0) {
    hideSuggestions();
    return;
  }

  dom.searchSuggestions.classList.remove("hidden");
  dom.searchSuggestions.innerHTML = "";
  items.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion-item";
    button.dataset.index = String(index);

    const title = document.createElement("div");
    title.className = "suggestion-title";

    const strong = document.createElement("strong");
    strong.textContent = item.display || item.symbol;
    title.appendChild(strong);

    const market = document.createElement("span");
    market.textContent = item.market || "--";
    title.appendChild(market);

    const meta = document.createElement("div");
    meta.className = "suggestion-meta";
    meta.textContent = `${item.security_type || "证券"} · ${item.code}`;

    button.appendChild(title);
    button.appendChild(meta);
    button.addEventListener("mouseenter", () => {
      setActiveSuggestionIndex(index);
    });
    button.addEventListener("click", async () => {
      await selectSuggestion(item);
    });
    dom.searchSuggestions.appendChild(button);
  });
  setActiveSuggestionIndex(0);
}

async function fetchSuggestions(query) {
  const keyword = query.trim();
  if (!keyword) {
    state.searchResults = [];
    hideSuggestions();
    return;
  }

  const requestId = ++state.searchRequestId;
  const response = await fetch(`/api/search?q=${encodeURIComponent(keyword)}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Search failed");
  }
  if (requestId !== state.searchRequestId) {
    return;
  }
  renderSuggestions(payload.results || []);
}

async function resolveAndLoadInput() {
  const query = dom.searchInput.value.trim();
  if (!query) return;

  if (isSuggestionsOpen() && state.searchResults[state.activeSuggestionIndex]) {
    await selectSuggestion(state.searchResults[state.activeSuggestionIndex]);
    return;
  }

  hideSuggestions();
  state.symbol = query;
  await loadMarket(query);
}

function syncWatchlistName(symbol, name) {
  let touched = false;
  state.watchlistModel.items = currentGroupItems().map((item) => {
    if (item.symbol !== symbol) return item;
    touched = true;
    return {
      ...item,
      name,
      trade_cycle: inferTradeCycle({ ...item, symbol, name }),
    };
  });
  if (touched) {
    saveWatchlistModel();
  }
}

function strategyPillClass(signal) {
  const normalized = String(signal || "").trim().toLowerCase();
  if (normalized === "buy") return "buy";
  if (normalized === "sell") return "sell";
  if (normalized === "hold") return "hold";
  if (normalized === "off") return "off";
  return "neutral";
}

function renderStrategyOptions() {
  const strategies =
    Array.isArray(state.availableStrategies) && state.availableStrategies.length > 0
      ? state.availableStrategies
      : [{ id: "none", label: "Off", description: "Disable strategy alerts" }];

  dom.strategySelect.innerHTML = "";
  strategies.forEach((item) => {
    const option = document.createElement("option");
    option.value = normalizeStrategyValue(item.id);
    option.textContent = item.label || item.id;
    dom.strategySelect.appendChild(option);
  });

  if (!getStrategyMeta(state.strategy)) {
    const fallback = normalizeStrategyValue(window.APP_DEFAULTS.strategy || strategies[0]?.id || "none");
    state.strategy = getStrategyMeta(fallback) ? fallback : normalizeStrategyValue(strategies[0]?.id || "none");
    saveStrategyPreference();
  }

  dom.strategySelect.value = state.strategy;
  updateStrategyDeleteButtonState();
}

function renderStrategyError(message) {
  dom.strategySignalBadge.textContent = "ERR";
  dom.strategySignalBadge.className = "strategy-pill neutral";
  dom.strategySignalMeta.textContent = message || "Strategy signal load failed";
}

function buildStrategyMetaText(payload) {
  const strategyLabel = payload?.strategy?.label || getStrategyMeta(state.strategy)?.label || "Strategy";
  const parts = [strategyLabel];
  const strategyTimeframe = String(payload?.strategy?.timeframe || "").trim();

  if (strategyTimeframe) {
    parts.push(`Fixed ${strategyTimeframe}`);
  }

  if (payload?.reason) {
    parts.push(payload.reason);
  }

  if (payload?.priority?.label && payload.priority.label !== "--") {
    const score = Number(payload.priority.score);
    const scoreText = Number.isFinite(score) ? ` (${formatFixed(score, 2)})` : "";
    parts.push(`Priority ${payload.priority.label}${scoreText}`);
  }

  const jValue = Number(payload?.indicators?.j);
  if (Number.isFinite(jValue)) {
    parts.push(`J ${formatFixed(jValue, 2)}`);
  }

  if (payload?.timestamp) {
    parts.push(formatTimestampLabel(payload.timestamp, "5m", false));
  }

  return parts.join(" | ");
}

function renderStrategySignal(payload = null) {
  const strategyMeta = getStrategyMeta(state.strategy);
  if (normalizeStrategyValue(state.strategy) === "none") {
    dom.strategySignalBadge.textContent = "OFF";
    dom.strategySignalBadge.className = "strategy-pill off";
    dom.strategySignalMeta.textContent = strategyMeta?.description || "Strategy alerts are off";
    return;
  }

  if (!payload) {
    dom.strategySignalBadge.textContent = "SCAN";
    dom.strategySignalBadge.className = "strategy-pill neutral";
    dom.strategySignalMeta.textContent = strategyMeta?.description || "Waiting for 5m strategy refresh";
    return;
  }

  const signal = String(payload.signal || "HOLD").toUpperCase();
  dom.strategySignalBadge.textContent = signal;
  dom.strategySignalBadge.className = `strategy-pill ${strategyPillClass(signal)}`;
  dom.strategySignalMeta.textContent = buildStrategyMetaText(payload);
}

function showToast({ tone = "neutral", title, body = "", meta = "" }) {
  if (!dom.toastStack) return;

  const toast = document.createElement("article");
  toast.className = `toast-card ${tone}`;

  const titleNode = document.createElement("p");
  titleNode.className = `toast-title ${tone}`;
  titleNode.textContent = title;
  toast.appendChild(titleNode);

  if (body) {
    const bodyNode = document.createElement("div");
    bodyNode.className = "toast-body";
    bodyNode.textContent = body;
    toast.appendChild(bodyNode);
  }

  if (meta) {
    const metaNode = document.createElement("div");
    metaNode.className = "toast-meta";
    metaNode.textContent = meta;
    toast.appendChild(metaNode);
  }

  dom.toastStack.appendChild(toast);
  window.requestAnimationFrame(() => {
    toast.classList.add("visible");
  });

  window.setTimeout(() => {
    toast.classList.remove("visible");
    window.setTimeout(() => {
      toast.remove();
    }, 220);
  }, 5200);
}

function maybeShowStrategyToast(payload, options = {}) {
  const { announce = false } = options;
  if (!announce || !payload?.triggered || !payload?.alert_key) {
    return;
  }
  if (state.lastStrategyAlertKey === payload.alert_key) {
    return;
  }

  state.lastStrategyAlertKey = payload.alert_key;
}

async function loadStrategies() {
  try {
    const response = await fetch("/api/strategies");
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Load strategies failed");
    }
    if (Array.isArray(payload.strategies) && payload.strategies.length > 0) {
      state.availableStrategies = payload.strategies;
    }

    const fallback = normalizeStrategyValue(payload.default || window.APP_DEFAULTS.strategy || "none");
    if (!getStrategyMeta(state.strategy)) {
      state.strategy = getStrategyMeta(fallback)
        ? fallback
        : normalizeStrategyValue(state.availableStrategies[0]?.id || "none");
      saveStrategyPreference();
    }
  } catch (error) {
    console.error(error);
    if (!Array.isArray(state.availableStrategies) || state.availableStrategies.length === 0) {
      state.availableStrategies = [{ id: "none", label: "Off", description: "Disable strategy alerts" }];
    }
    state.strategy = getStrategyMeta(state.strategy) ? state.strategy : "none";
  }

  renderStrategyOptions();
  renderStrategySignal(state.strategySignal);
}

async function fetchStrategySignal(symbol = state.symbol, options = {}) {
  const { silent = true, announce = false } = options;
  if (!symbol) {
    return;
  }

  if (normalizeStrategyValue(state.strategy) === "none") {
    state.strategySignal = null;
    renderStrategySignal(null);
    return;
  }

  const requestId = ++state.strategyRequestId;
  state.isLoadingStrategy = true;

  try {
    const response = await fetch(
      `/api/strategy-signal?symbol=${encodeURIComponent(symbol)}&strategy=${encodeURIComponent(state.strategy)}&source=${encodeURIComponent(state.source)}`
    );
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Strategy load failed");
    }

    if (requestId !== state.strategyRequestId || symbol !== state.symbol) {
      return;
    }

    if (normalizeStrategyValue(payload?.strategy?.id) !== normalizeStrategyValue(state.strategy)) {
      return;
    }

    state.strategySignal = payload;
    renderStrategySignal(payload);
    maybeShowStrategyToast(payload, { announce });

    if (!silent) {
      setRefreshStatus(`Strategy signal updated | ${new Date().toLocaleTimeString("zh-CN")}`);
    }
  } catch (error) {
    console.error(error);
    if (requestId !== state.strategyRequestId) {
      return;
    }
    renderStrategyError(error.message || "Strategy signal load failed");
    if (!silent) {
      setRefreshStatus(error.message || "Strategy signal load failed");
    }
  } finally {
    if (requestId === state.strategyRequestId) {
      state.isLoadingStrategy = false;
    }
  }
}

async function loadSources() {
  try {
    const response = await fetch("/api/sources");
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Load sources failed");
    }
    if (Array.isArray(payload.sources) && payload.sources.length > 0) {
      state.availableSources = payload.sources;
    }
    if (!getSourceMeta(state.source)) {
      state.source = payload.default || "auto";
      saveSourcePreference();
    }
  } catch (error) {
    console.error(error);
  }
  renderSourceOptions();
  renderSourcePanels();
}

async function ensureRulesLoaded(options = {}) {
  const { force = false } = options;
  const strategy = normalizeStrategyValue(state.strategy);
  if (!force && state.rulesPayload?.strategy?.id && normalizeStrategyValue(state.rulesPayload.strategy.id) === strategy) {
    return state.rulesPayload;
  }
  const response = await fetch(`/api/rules?strategy=${encodeURIComponent(strategy)}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Load rules failed");
  }
  state.rulesPayload = payload;
  return payload;
}

function renderRulesModal(payload) {
  const strategyMeta = payload.strategy || getStrategyMeta(state.strategy);
  dom.rulesTimeframe.textContent = payload.timeframe || "--";
  dom.rulesAdjust.textContent = payload.adjust || "--";
  dom.rulesCurrentSource.textContent = state.currentPayload?.source.actual_label || getSourceMeta(state.source)?.label || "--";
  renderStrategySignal(state.strategySignal);
  renderChipList(
    dom.indicatorList,
    (payload.indicators || []).map((item) => `${item.name}: ${item.description}`),
    "当前没有指标配置"
  );
  renderChipList(dom.buyRulesList, payload.buy_rules || [], "当前没有买入规则");
  renderChipList(dom.sellRulesList, payload.sell_rules || [], "当前没有卖出规则");
  renderChipList(dom.rulesNotes, payload.notes || [], "当前没有额外说明");
  if (dom.rulesModalTitle && strategyMeta?.label) {
    dom.rulesModalTitle.textContent = `规则说明 · ${strategyMeta.label}`;
  }
  if (dom.customRuleMessage && !dom.customRuleMessage.classList.contains("error")) {
    dom.customRuleMessage.textContent = "支持周期 1m/5m/15m/30m/60m/1d；条件支持 >、<、>=、<=、==、!=。";
  }
}

async function refreshRulesModal(options = {}) {
  try {
    const payload = await ensureRulesLoaded({ force: options.force !== false });
    renderRulesModal(payload);
  } catch (error) {
    console.error(error);
    setRefreshStatus(error.message || "规则说明加载失败");
  }
}

function setCustomRuleMessage(message, tone = "neutral") {
  if (!dom.customRuleMessage) return;
  dom.customRuleMessage.textContent = message || "";
  dom.customRuleMessage.classList.toggle("error", tone === "error");
  dom.customRuleMessage.classList.toggle("success", tone === "success");
}

async function submitCustomStrategyRule() {
  const rule = dom.customRuleInput?.value.trim() || "";
  if (!rule) {
    setCustomRuleMessage("请输入自定义规则。", "error");
    return;
  }
  if (dom.customRuleSaveButton) {
    dom.customRuleSaveButton.disabled = true;
  }
  setCustomRuleMessage("正在录入规则...", "neutral");
  try {
    const response = await fetch("/api/custom-strategy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rule }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "规则录入失败");
    }
    if (Array.isArray(payload.strategies)) {
      state.availableStrategies = payload.strategies;
    }
    state.strategy = normalizeStrategyValue(payload.strategy?.id || state.strategy);
    state.strategySignal = null;
    state.watchlistStrategySignals = {};
    state.lastStrategyAlertKey = "";
    state.rulesPayload = payload.rules || null;
    saveStrategyPreference();
    renderStrategyOptions();
    renderWatchlist();
    renderStrategySignal(null);
    if (state.rulesPayload) {
      renderRulesModal(state.rulesPayload);
    } else {
      await refreshRulesModal({ force: true });
    }
    setCustomRuleMessage("规则已录入，并已切换到该策略。", "success");
    setRefreshStatus("自定义规则已录入");
    fetchStrategySignal(state.symbol, { silent: true, announce: false });
    fetchWatchlistStrategySignals({ silent: true });
  } catch (error) {
    console.error(error);
    setCustomRuleMessage(error.message || "规则录入失败", "error");
    setRefreshStatus(error.message || "规则录入失败");
  } finally {
    if (dom.customRuleSaveButton) {
      dom.customRuleSaveButton.disabled = false;
    }
  }
}

async function deleteSelectedCustomStrategy() {
  const strategy = getStrategyMeta(state.strategy);
  if (!strategy || normalizeStrategyValue(strategy.id) === "none") {
    setRefreshStatus("不启用不能删除");
    updateStrategyDeleteButtonState();
    return;
  }
  const label = strategy.label || strategy.id;
  if (!window.confirm(`确认删除规则“${label}”？`)) {
    return;
  }
  if (!window.confirm("删除后不可恢复，确认继续？")) {
    return;
  }
  if (dom.strategyDeleteButton) {
    dom.strategyDeleteButton.disabled = true;
  }
  try {
    const response = await fetch(`/api/custom-strategy/${encodeURIComponent(strategy.id)}`, {
      method: "DELETE",
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "规则删除失败");
    }
    if (Array.isArray(payload.strategies)) {
      state.availableStrategies = payload.strategies;
    }
    state.strategy = normalizeStrategyValue(payload.default || "none");
    state.strategySignal = null;
    state.watchlistStrategySignals = {};
    state.lastStrategyAlertKey = "";
    state.rulesPayload = null;
    updateStrategyDeleteButtonState();
    saveStrategyPreference();
    renderStrategyOptions();
    renderWatchlist();
    renderStrategySignal(null);
    processWebhookAlerts();
    if (state.rulesModalOpen) {
      await refreshRulesModal({ force: true });
    }
    fetchWatchlistStrategySignals({ silent: true });
    setRefreshStatus(`已删除自定义规则：${label}`);
  } catch (error) {
    console.error(error);
    setRefreshStatus(error.message || "规则删除失败");
    updateStrategyDeleteButtonState();
  }
}

async function openRulesModal() {
  try {
    const payload = await ensureRulesLoaded({ force: true });
    renderRulesModal(payload);
    state.rulesModalOpen = true;
    dom.rulesBackdrop.classList.remove("hidden");
    dom.rulesModal.classList.remove("hidden");
    dom.rulesModal.setAttribute("aria-hidden", "false");
  } catch (error) {
    console.error(error);
    setRefreshStatus(error.message || "规则说明加载失败");
  }
}

function closeRulesModal() {
  state.rulesModalOpen = false;
  dom.rulesBackdrop.classList.add("hidden");
  dom.rulesModal.classList.add("hidden");
  dom.rulesModal.setAttribute("aria-hidden", "true");
}

function applyQuotePayload(payload) {
  if (!state.currentPayload || payload.symbol !== state.currentPayload.symbol) {
    return;
  }

  const nextMarket = {
    ...state.currentPayload.market,
    ...(payload.market || {}),
  };

  state.currentPayload = {
    ...state.currentPayload,
    market: nextMarket,
    last_price: payload.market?.last_price ?? state.currentPayload.last_price,
    change: payload.market?.change ?? state.currentPayload.change,
    change_pct: payload.market?.change_pct ?? state.currentPayload.change_pct,
  };

  cacheWatchlistQuote(payload.symbol, state.currentPayload.name, nextMarket, payload.source?.actual);
  renderSummary(state.currentPayload);
  renderMarketStats(state.currentPayload.market);
  renderWatchlist();
}

function applyWatchlistQuotes(payload) {
  const nextQuotes = { ...state.watchlistQuotes };
  (payload?.quotes || []).forEach((item) => {
    const entry = buildWatchlistQuote(item.symbol, item.name, item.market, item.source?.actual, item.streak);
    if (entry) {
      nextQuotes[entry.symbol] = entry;
    }
  });
  state.watchlistQuotes = nextQuotes;
  renderWatchlist();
  if (state.signalDrawerOpen) {
    renderSignalDrawerFromWatchlist();
  }
}

function applyWatchlistStrategySignals(payload) {
  const nextSignals = { ...state.watchlistStrategySignals };
  (payload?.signals || []).forEach((item) => {
    const entry = normalizeWatchlistStrategySignal(item);
    if (entry) {
      nextSignals[entry.symbol] = entry;
    }
  });
  state.watchlistStrategySignals = nextSignals;
  renderWatchlist();
  processWebhookAlerts();
  if (state.signalDrawerOpen) {
    renderSignalDrawerFromWatchlist();
  }
}

async function fetchWatchlistQuotes(options = {}) {
  const { silent = true } = options;
  const symbols = currentGroupSymbols();
  if (symbols.length === 0) {
    return;
  }
  if (state.isLoadingWatchlistQuotes) {
    return;
  }

  const requestId = ++state.watchlistQuoteRequestId;
  state.isLoadingWatchlistQuotes = true;

  try {
    const response = await fetch(
      `/api/watchlist-quotes?symbols=${encodeURIComponent(symbols.join(","))}&source=${encodeURIComponent(state.source)}`
    );
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Watchlist quote load failed");
    }
    if (requestId !== state.watchlistQuoteRequestId) {
      return;
    }

    applyWatchlistQuotes(payload);
    if (!silent && Array.isArray(payload.errors) && payload.errors.length > 0) {
      setRefreshStatus(payload.errors[0].error || "部分自选行情加载失败");
    }
  } catch (error) {
    console.error(error);
    if (!silent) {
      setRefreshStatus(error.message || "自选行情加载失败");
    }
  } finally {
    if (requestId === state.watchlistQuoteRequestId) {
      state.isLoadingWatchlistQuotes = false;
    }
  }
}

async function fetchWatchlistStrategySignals(options = {}) {
  const { silent = true } = options;
  const symbols = currentGroupSymbols();
  if (normalizeStrategyValue(state.strategy) === "none") {
    state.watchlistStrategySignals = {};
    renderWatchlist();
    processWebhookAlerts();
    if (state.signalDrawerOpen) {
      renderSignalDrawerFromWatchlist();
    }
    return;
  }
  if (symbols.length === 0) {
    state.watchlistStrategySignals = {};
    renderWatchlist();
    processWebhookAlerts();
    if (state.signalDrawerOpen) {
      renderSignalDrawerFromWatchlist();
    }
    return;
  }
  if (state.isLoadingWatchlistStrategySignals) {
    return;
  }

  const requestId = ++state.watchlistStrategyRequestId;
  state.isLoadingWatchlistStrategySignals = true;

  try {
    const response = await fetch(
      `/api/watchlist-strategy-signals?symbols=${encodeURIComponent(symbols.join(","))}&strategy=${encodeURIComponent(state.strategy)}&source=${encodeURIComponent(state.source)}`
    );
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Watchlist strategy load failed");
    }
    if (requestId !== state.watchlistStrategyRequestId) {
      return;
    }

    const nextSignals = {};
    (payload?.signals || []).forEach((item) => {
      const entry = normalizeWatchlistStrategySignal(item);
      if (entry) {
        nextSignals[entry.symbol] = entry;
      }
    });
    state.watchlistStrategySignals = nextSignals;
    renderWatchlist();
    processWebhookAlerts();
    if (state.signalDrawerOpen) {
      renderSignalDrawerFromWatchlist();
    }

    if (!silent && Array.isArray(payload.errors) && payload.errors.length > 0) {
      setRefreshStatus(payload.errors[0].error || "Watchlist strategy load failed");
    }
  } catch (error) {
    console.error(error);
    if (!silent) {
      setRefreshStatus(error.message || "Watchlist strategy load failed");
    }
  } finally {
    if (requestId === state.watchlistStrategyRequestId) {
      state.isLoadingWatchlistStrategySignals = false;
    }
  }
}

async function fetchQuote(symbol = state.symbol, options = {}) {
  const { silent = true } = options;
  if (!symbol || state.isLoadingQuote || state.isLoadingChart) {
    return;
  }
  if (!state.currentPayload || state.currentPayload.symbol !== symbol) {
    return;
  }

  const requestId = ++state.quoteRequestId;
  state.isLoadingQuote = true;

  try {
    const response = await fetch(
      `/api/quote?symbol=${encodeURIComponent(symbol)}&source=${encodeURIComponent(state.source)}`
    );
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Quote load failed");
    }
    if (requestId !== state.quoteRequestId || symbol !== state.symbol) {
      return;
    }

    applyQuotePayload(payload);
    if (!silent) {
      setRefreshStatus(`快照更新 · ${new Date().toLocaleTimeString("zh-CN")}`);
    }
  } catch (error) {
    console.error(error);
    if (!silent) {
      setRefreshStatus(error.message || "快照加载失败");
    }
  } finally {
    if (requestId === state.quoteRequestId) {
      state.isLoadingQuote = false;
    }
  }
}

async function loadMarket(symbol, options = {}) {
  const { silent = false, background = false } = options;
  if (!symbol) {
    return;
  }
  if (background && state.isLoadingChart) {
    return;
  }

  const requestId = ++state.marketRequestId;
  state.isLoadingChart = true;
  if (!silent) {
    setRefreshStatus(`正在加载 ${symbol} · ${getSourceMeta(state.source)?.label || state.source}`);
  }
  try {
    const response = await fetch(
      `/api/chart?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(state.timeframe)}&bars=260&source=${encodeURIComponent(state.source)}`
    );
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Load failed");
    }
    if (requestId !== state.marketRequestId) {
      return;
    }

    state.currentPayload = payload;
    state.symbol = payload.symbol;
    dom.searchInput.value = payload.symbol;
    renderSummary(payload);
    renderMarketStats(payload.market);
    renderChart(payload);
    syncWatchlistName(payload.symbol, payload.name);
    cacheWatchlistQuote(payload.symbol, payload.name, payload.market, payload.source?.actual);
    renderWatchlist();
    fetchStrategySignal(payload.symbol, { silent: true, announce: !background });
    fetchWatchlistQuotes({ silent: true });
    fetchWatchlistStrategySignals({ silent: true });
    if (state.rulesPayload) {
      renderRulesModal(state.rulesPayload);
    }
    state.isLoadingChart = false;
    setRefreshStatus(`自动刷新中 · ${new Date().toLocaleTimeString("zh-CN")}`);
  } catch (error) {
    console.error(error);
    if (requestId !== state.marketRequestId) {
      return;
    }
    state.isLoadingChart = false;
    const message = error.message || "加载失败";
    if (state.source !== "auto") {
      setRefreshStatus(`${message}，可切换到自动选择或腾讯`);
    } else {
      setRefreshStatus(message);
    }
  }
}

function toggleCurrentIntoWatchlist() {
  if (!state.currentPayload) return;
  const symbol = state.currentPayload.symbol;
  if (symbolExistsInGroup(symbol)) return;

  state.watchlistModel.items = [
    {
      symbol,
      name: state.currentPayload.name,
      trade_cycle: inferTradeCycle(state.currentPayload),
    },
    ...currentGroupItems(),
  ];
  saveWatchlistModel();
  cacheWatchlistQuote(symbol, state.currentPayload.name, state.currentPayload.market, state.currentPayload.source?.actual);
  renderWatchlist();
  fetchWatchlistQuotes({ silent: true });
  fetchWatchlistStrategySignals({ silent: true });
  updateWatchlistButtonState();
}

function startAutoRefresh() {
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
  }
  if (state.quoteTimer) {
    clearInterval(state.quoteTimer);
  }
  if (state.strategyTimer) {
    clearInterval(state.strategyTimer);
  }
  if (state.watchlistQuoteTimer) {
    clearInterval(state.watchlistQuoteTimer);
  }
  if (state.watchlistStrategyTimer) {
    clearInterval(state.watchlistStrategyTimer);
  }
  state.refreshTimer = window.setInterval(() => {
    if (!state.symbol) return;
    loadMarket(state.symbol, { silent: true, background: true });
  }, 10000);
  state.quoteTimer = window.setInterval(() => {
    if (!state.symbol) return;
    fetchQuote(state.symbol, { silent: true });
  }, 3000);
  state.strategyTimer = window.setInterval(() => {
    if (!state.symbol || normalizeStrategyValue(state.strategy) === "none") return;
    fetchStrategySignal(state.symbol, { silent: true, announce: true });
  }, 5000);
  state.watchlistQuoteTimer = window.setInterval(() => {
    fetchWatchlistQuotes({ silent: true });
  }, 5000);
  state.watchlistStrategyTimer = window.setInterval(() => {
    fetchWatchlistStrategySignals({ silent: true });
  }, 8000);
}

function bindEvents() {
  dom.searchButton.addEventListener("click", () => {
    resolveAndLoadInput();
  });

  dom.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      if (!isSuggestionsOpen()) {
        fetchSuggestions(dom.searchInput.value).catch((error) => {
          console.error(error);
          hideSuggestions();
        });
      } else {
        setActiveSuggestionIndex(state.activeSuggestionIndex + 1);
      }
      event.preventDefault();
      return;
    }

    if (event.key === "ArrowUp") {
      if (isSuggestionsOpen()) {
        setActiveSuggestionIndex(state.activeSuggestionIndex - 1);
        event.preventDefault();
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      resolveAndLoadInput();
      return;
    }

    if (event.key === "Escape") {
      hideSuggestions();
    }
  });

  dom.searchInput.addEventListener("input", () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      fetchSuggestions(dom.searchInput.value).catch((error) => {
        console.error(error);
        hideSuggestions();
      });
    }, 220);
  });

  dom.searchInput.addEventListener("focus", () => {
    if (dom.searchInput.value.trim() && state.searchResults.length > 0) {
      renderSuggestions(state.searchResults);
    }
  });

  dom.groupNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      createGroup();
    }
  });

  document.addEventListener("click", (event) => {
    if (!dom.searchSuggestions.contains(event.target) && event.target !== dom.searchInput) {
      hideSuggestions();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.rulesModalOpen) {
      closeRulesModal();
    }
  });

  dom.watchlistButton.addEventListener("click", () => {
    toggleCurrentIntoWatchlist();
  });

  dom.groupCreateButton.addEventListener("click", () => {
    createGroup();
  });

  dom.groupDeleteButton.addEventListener("click", () => {
    deleteCurrentGroup();
  });

  dom.watchlistImportButton.addEventListener("click", () => {
    if (dom.watchlistImportInput) {
      if (typeof dom.watchlistImportInput.showPicker === "function") {
        dom.watchlistImportInput.showPicker();
      } else {
        dom.watchlistImportInput.click();
      }
    }
  });

  dom.watchlistImportInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    try {
      await handleWatchlistImport(file);
    } catch (error) {
      console.error(error);
      const message = error?.message || "XLSX import failed";
      setRefreshStatus(message);
      showToast({
        tone: "sell",
        title: "Watchlist import failed",
        body: message,
      });
    } finally {
      event.target.value = "";
    }
  });

  dom.watchlistSortSelect.addEventListener("change", () => {
    state.watchlistSortMode = normalizeWatchlistSortMode(dom.watchlistSortSelect.value);
    saveWatchlistSortPreference();
    renderWatchlist();
  });

  dom.sourceSelect.addEventListener("change", () => {
    state.source = dom.sourceSelect.value;
    saveSourcePreference();
    renderSourcePanels();
    loadMarket(state.symbol);
  });

  dom.strategySelect.addEventListener("change", () => {
    state.strategy = normalizeStrategyValue(dom.strategySelect.value);
    state.strategySignal = null;
    state.watchlistStrategySignals = {};
    state.lastStrategyAlertKey = "";
    state.rulesPayload = null;
    updateStrategyDeleteButtonState();
    saveStrategyPreference();
    renderWatchlist();
    renderStrategySignal(null);
    if (state.rulesModalOpen) {
      refreshRulesModal({ force: true });
    }
    startAutoRefresh();
    fetchStrategySignal(state.symbol, { silent: false, announce: true });
    fetchWatchlistStrategySignals({ silent: true });
  });

  if (dom.strategyDeleteButton) {
    dom.strategyDeleteButton.addEventListener("click", deleteSelectedCustomStrategy);
  }

  dom.timeframeButtons.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.timeframe = button.dataset.timeframe;
      setActiveTimeframeButton();
      loadMarket(state.symbol);
    });
  });

  dom.rulesButton.addEventListener("click", () => {
    openRulesModal();
  });

  dom.rulesMiniButton.addEventListener("click", () => {
    openRulesModal();
  });

  dom.rulesModalClose.addEventListener("click", () => {
    closeRulesModal();
  });

  dom.rulesBackdrop.addEventListener("click", () => {
    closeRulesModal();
  });

  if (dom.customRuleSaveButton) {
    dom.customRuleSaveButton.addEventListener("click", submitCustomStrategyRule);
  }
  if (dom.customRuleInput) {
    dom.customRuleInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submitCustomStrategyRule();
      }
    });
  }
}

function renderSourcePanels(sourcePayload) {
  const source = sourcePayload || {
    requested: state.source,
    requested_label: getSourceMeta(state.source)?.label || state.source,
    actual: state.source,
    actual_label: getSourceMeta(state.source)?.label || state.source,
  };

  dom.activeSourceLabel.textContent = source.actual_label;
  dom.metricSource.textContent = source.actual_label;

  if (source.requested === source.actual) {
    dom.metricSourceMeta.textContent = `请求: ${source.requested_label}`;
    return;
  }

  dom.metricSourceMeta.textContent = `请求: ${source.requested_label} -> ${source.actual_label}`;
}

function renderSummary(payload) {
  dom.metricName.textContent = payload.name;
  dom.metricSymbol.textContent = `${payload.symbol.toUpperCase()} · ${payload.timeframe}`;
  dom.metricPrice.textContent = formatFixed(payload.last_price, 3);
  dom.metricChange.textContent = `${formatSigned(payload.change)} / ${formatPercent(payload.change_pct)}`;
  dom.metricChange.style.color = payload.change >= 0 ? "var(--rise)" : "var(--fall)";
  dom.metricSignal.textContent = payload.signal.signal;
  dom.metricSignal.className = `metric-value signal-pill ${signalClass(payload.signal.signal)}`;
  dom.metricTime.textContent = `更新于 ${payload.market.timestamp || payload.last_timestamp}`;
  renderSignalDrawerFromWatchlist();
  renderSourcePanels(payload.source);
  renderIndicatorHeaders(payload);
  updateWatchlistButtonState();
}

function renderChart(payload) {
  if (!state.chart) {
    state.chart = echarts.init(document.getElementById("chart"));
    window.addEventListener("resize", () => state.chart && state.chart.resize());
  }

  const riseColor = "#d14f3f";
  const fallColor = "#14966b";
  const difColor = "#f6a21a";
  const deaColor = "#3f91ff";
  const kColor = "#f6a21a";
  const dColor = "#3f91ff";
  const jColor = "#d83bb0";
  const ma5Color = "#e1a84e";
  const ma20Color = "#58a6ff";
  const axisColor = "rgba(223, 231, 242, 0.74)";
  const splitColor = "rgba(148, 163, 184, 0.14)";
  const gridBorderColor = "rgba(148, 163, 184, 0.12)";

  state.chart.setOption(
    {
      animation: false,
      backgroundColor: "transparent",
      color: [riseColor, ma5Color, ma20Color, difColor, deaColor, kColor, dColor, jColor],
      legend: [],
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
        backgroundColor: "rgba(6, 11, 18, 0.96)",
        borderColor: "rgba(148, 163, 184, 0.16)",
        borderWidth: 1,
        textStyle: { color: "#f4f7fa" },
        formatter: (params) => {
          const rows = Array.isArray(params) ? params : [params];
          if (rows.length === 0) return "";
          const lines = [`<div style="margin-bottom:6px;">${formatTimestampLabel(rows[0].axisValue, payload.timeframe, false)}</div>`];

          rows.forEach((item) => {
            if (item.seriesType === "candlestick" && Array.isArray(item.data)) {
              const [open, close, low, high] = item.data;
              lines.push(
                `${item.marker}${item.seriesName} 开 ${formatFixed(open, 3)} 收 ${formatFixed(close, 3)} 低 ${formatFixed(low, 3)} 高 ${formatFixed(high, 3)}`
              );
              return;
            }

            const rawValue = Array.isArray(item.value) ? item.value[item.value.length - 1] : item.value;
            lines.push(`${item.marker}${item.seriesName} ${formatTooltipValue(item.seriesName, rawValue)}`);
          });

          return lines.join("<br/>");
        },
      },
      axisPointer: {
        link: [{ xAxisIndex: "all" }],
        label: {
          backgroundColor: "#17232e",
          color: "#f4f7fa",
          formatter: (params) => {
            if (params.axisDimension === "x") {
              return formatTimestampLabel(params.value, payload.timeframe, false);
            }
            return Number.isFinite(Number(params.value)) ? formatCompactNumber(params.value) : params.value;
          },
        },
      },
      grid: [
        {
          left: 56,
          right: 16,
          top: 48,
          height: "39%",
          show: true,
          backgroundColor: "rgba(10, 16, 24, 0.72)",
          borderColor: gridBorderColor,
          borderWidth: 1,
        },
        {
          left: 56,
          right: 16,
          top: "52.5%",
          height: "16.5%",
          show: true,
          backgroundColor: "rgba(18, 14, 18, 0.72)",
          borderColor: "rgba(209, 79, 63, 0.12)",
          borderWidth: 1,
        },
        {
          left: 56,
          right: 16,
          top: "75.5%",
          height: "11.5%",
          show: true,
          backgroundColor: "rgba(12, 16, 24, 0.74)",
          borderColor: "rgba(43, 120, 214, 0.12)",
          borderWidth: 1,
        },
      ],
      dataZoom: [
        { type: "inside", xAxisIndex: [0, 1, 2], start: 72, end: 100 },
        {
          type: "slider",
          xAxisIndex: [0, 1, 2],
          bottom: 8,
          height: 18,
          borderColor: "transparent",
          backgroundColor: "rgba(255, 255, 255, 0.06)",
          fillerColor: "rgba(43, 120, 214, 0.18)",
          handleSize: "110%",
        },
      ],
      xAxis: [
        {
          type: "category",
          data: payload.chart.timestamps,
          boundaryGap: true,
          axisLine: { lineStyle: { color: splitColor } },
          axisLabel: { show: false },
          axisTick: { show: false },
          min: "dataMin",
          max: "dataMax",
        },
        {
          type: "category",
          gridIndex: 1,
          data: payload.chart.timestamps,
          boundaryGap: true,
          axisLine: { lineStyle: { color: splitColor } },
          axisLabel: { show: false },
          axisTick: { show: false },
        },
        {
          type: "category",
          gridIndex: 2,
          data: payload.chart.timestamps,
          boundaryGap: true,
          axisLine: { lineStyle: { color: splitColor } },
          axisLabel: {
            color: axisColor,
            hideOverlap: true,
            formatter: (value) => formatTimestampLabel(value, payload.timeframe, true),
            margin: 14,
          },
          axisTick: { show: false },
        },
      ],
      yAxis: [
        {
          scale: true,
          splitNumber: 4,
          axisLine: { show: false },
          axisLabel: { color: axisColor, showMinLabel: false },
          splitLine: { lineStyle: { color: splitColor } },
        },
        {
          gridIndex: 1,
          scale: true,
          splitNumber: 3,
          axisLine: { show: false },
          axisLabel: { color: axisColor },
          splitLine: { lineStyle: { color: splitColor } },
        },
        {
          gridIndex: 2,
          scale: true,
          splitNumber: 3,
          axisLine: { show: false },
          axisLabel: { color: axisColor },
          splitLine: { lineStyle: { color: splitColor } },
        },
      ],
      series: [
        {
          name: "K线",
          type: "candlestick",
          data: payload.chart.candles,
          itemStyle: {
            color: riseColor,
            color0: fallColor,
            borderColor: riseColor,
            borderColor0: fallColor,
          },
        },
        {
          name: `${payload.timeframe} MA5`,
          type: "line",
          data: payload.indicators.ma5,
          showSymbol: false,
          smooth: true,
          lineStyle: { width: 1.4, color: ma5Color },
        },
        {
          name: `${payload.timeframe} MA20`,
          type: "line",
          data: payload.indicators.ma20,
          showSymbol: false,
          smooth: true,
          lineStyle: { width: 1.4, color: ma20Color },
        },
        {
          name: "MACD Hist",
          type: "bar",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: payload.indicators.macd.hist,
          itemStyle: {
            color: (params) => (Number(params.value) >= 0 ? riseColor : fallColor),
          },
        },
        {
          name: "DIF",
          type: "line",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: payload.indicators.macd.dif,
          showSymbol: false,
          lineStyle: { width: 1.4, color: difColor },
        },
        {
          name: "DEA",
          type: "line",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: payload.indicators.macd.dea,
          showSymbol: false,
          lineStyle: { width: 1.4, color: deaColor },
        },
        {
          name: "K",
          type: "line",
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: payload.indicators.kdj.k,
          showSymbol: false,
          lineStyle: { width: 1.4, color: kColor },
        },
        {
          name: "D",
          type: "line",
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: payload.indicators.kdj.d,
          showSymbol: false,
          lineStyle: { width: 1.4, color: dColor },
        },
        {
          name: "J",
          type: "line",
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: payload.indicators.kdj.j,
          showSymbol: false,
          lineStyle: { width: 1.4, color: jColor },
        },
      ],
    },
    true
  );
}

async function openRulesModal() {
  try {
    const payload = await ensureRulesLoaded({ force: true });
    renderRulesModal(payload);
    if (state.webhookModalOpen) {
      closeWebhookModal();
    }
    setSignalDrawerOpen(false);
    state.rulesModalOpen = true;
    dom.rulesBackdrop.classList.remove("hidden");
    dom.rulesModal.classList.remove("hidden");
    dom.rulesModal.setAttribute("aria-hidden", "false");
  } catch (error) {
    console.error(error);
    setRefreshStatus(error.message || "规则说明加载失败");
  }
}

function closeRulesModal() {
  state.rulesModalOpen = false;
  dom.rulesBackdrop.classList.add("hidden");
  dom.rulesModal.classList.add("hidden");
  dom.rulesModal.setAttribute("aria-hidden", "true");
}

function setSignalDrawerOpen(nextOpen) {
  state.signalDrawerOpen = Boolean(nextOpen);
  dom.signalDrawer.classList.toggle("open", state.signalDrawerOpen);
  dom.signalDrawerBackdrop.classList.toggle("hidden", !state.signalDrawerOpen);
  dom.signalDrawer.setAttribute("aria-hidden", state.signalDrawerOpen ? "false" : "true");
  dom.signalDrawerToggle.setAttribute("aria-expanded", state.signalDrawerOpen ? "true" : "false");
  if (state.signalDrawerOpen) {
    refreshSignalDrawerData().catch((error) => {
      console.error(error);
      renderSignalDrawerFromWatchlist();
    });
  }
}

function scheduleWatchlistScrollRefresh() {
  if (!dom.watchlist) return;
  clearTimeout(state.watchlistScrollTimer);
  state.watchlistScrollTimer = window.setTimeout(() => {
    fetchWatchlistQuotes({ silent: true });
    fetchWatchlistStrategySignals({ silent: true });
  }, 420);
}

function bindEvents() {
  dom.searchButton.addEventListener("click", () => {
    resolveAndLoadInput();
  });

  dom.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      if (!isSuggestionsOpen()) {
        fetchSuggestions(dom.searchInput.value).catch((error) => {
          console.error(error);
          hideSuggestions();
        });
      } else {
        setActiveSuggestionIndex(state.activeSuggestionIndex + 1);
      }
      event.preventDefault();
      return;
    }

    if (event.key === "ArrowUp") {
      if (isSuggestionsOpen()) {
        setActiveSuggestionIndex(state.activeSuggestionIndex - 1);
        event.preventDefault();
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      resolveAndLoadInput();
      return;
    }

    if (event.key === "Escape") {
      hideSuggestions();
    }
  });

  dom.searchInput.addEventListener("input", () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      fetchSuggestions(dom.searchInput.value).catch((error) => {
        console.error(error);
        hideSuggestions();
      });
    }, 220);
  });

  dom.searchInput.addEventListener("focus", () => {
    if (dom.searchInput.value.trim() && state.searchResults.length > 0) {
      renderSuggestions(state.searchResults);
    }
  });

  dom.groupNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      createGroup();
    }
  });

  document.addEventListener("click", (event) => {
    if (!dom.searchSuggestions.contains(event.target) && event.target !== dom.searchInput) {
      hideSuggestions();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (state.rulesModalOpen) {
      closeRulesModal();
      return;
    }
    if (state.signalDrawerOpen) {
      setSignalDrawerOpen(false);
    }
  });

  dom.watchlistButton.addEventListener("click", () => {
    toggleCurrentIntoWatchlist();
  });

  dom.groupCreateButton.addEventListener("click", () => {
    createGroup();
  });

  dom.groupDeleteButton.addEventListener("click", () => {
    deleteCurrentGroup();
  });

  dom.watchlistImportButton.addEventListener("click", () => {
    if (!dom.watchlistImportInput) {
      return;
    }
    if (typeof dom.watchlistImportInput.showPicker === "function") {
      dom.watchlistImportInput.showPicker();
      return;
    }
    dom.watchlistImportInput.click();
  });

  dom.watchlistImportInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    try {
      await handleWatchlistImport(file);
    } catch (error) {
      console.error(error);
      const message = error?.message || "XLSX import failed";
      setRefreshStatus(message);
      showToast({
        tone: "sell",
        title: "Watchlist import failed",
        body: message,
      });
    } finally {
      event.target.value = "";
    }
  });

  dom.watchlistSortSelect.addEventListener("change", () => {
    state.watchlistSortMode = normalizeWatchlistSortMode(dom.watchlistSortSelect.value);
    saveWatchlistSortPreference();
    renderWatchlist();
  });

  dom.sourceSelect.addEventListener("change", () => {
    state.source = dom.sourceSelect.value;
    saveSourcePreference();
    renderSourcePanels();
    loadMarket(state.symbol);
  });

  dom.strategySelect.addEventListener("change", () => {
    state.strategy = normalizeStrategyValue(dom.strategySelect.value);
    state.strategySignal = null;
    state.watchlistStrategySignals = {};
    state.lastStrategyAlertKey = "";
    state.rulesPayload = null;
    updateStrategyDeleteButtonState();
    saveStrategyPreference();
    renderWatchlist();
    renderStrategySignal(null);
    if (state.rulesModalOpen) {
      refreshRulesModal({ force: true });
    }
    startAutoRefresh();
    fetchStrategySignal(state.symbol, { silent: false, announce: true });
    fetchWatchlistStrategySignals({ silent: true });
  });

  if (dom.strategyDeleteButton) {
    dom.strategyDeleteButton.addEventListener("click", deleteSelectedCustomStrategy);
  }

  dom.timeframeButtons.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.timeframe = button.dataset.timeframe;
      setActiveTimeframeButton();
      loadMarket(state.symbol);
    });
  });

  dom.rulesButton.addEventListener("click", () => {
    openRulesModal();
  });

  dom.signalDrawerToggle.addEventListener("click", () => {
    setSignalDrawerOpen(!state.signalDrawerOpen);
  });

  dom.signalDrawerClose.addEventListener("click", () => {
    setSignalDrawerOpen(false);
  });

  dom.signalDrawerBackdrop.addEventListener("click", () => {
    setSignalDrawerOpen(false);
  });

  dom.rulesModalClose.addEventListener("click", () => {
    closeRulesModal();
  });

  dom.rulesBackdrop.addEventListener("click", () => {
    closeRulesModal();
  });

  if (dom.customRuleSaveButton) {
    dom.customRuleSaveButton.addEventListener("click", submitCustomStrategyRule);
  }
  if (dom.customRuleInput) {
    dom.customRuleInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submitCustomStrategyRule();
      }
    });
  }
}

function bindEvents() {
  dom.searchButton.addEventListener("click", () => {
    resolveAndLoadInput();
  });

  dom.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      if (!isSuggestionsOpen()) {
        fetchSuggestions(dom.searchInput.value).catch((error) => {
          console.error(error);
          hideSuggestions();
        });
      } else {
        setActiveSuggestionIndex(state.activeSuggestionIndex + 1);
      }
      event.preventDefault();
      return;
    }

    if (event.key === "ArrowUp") {
      if (isSuggestionsOpen()) {
        setActiveSuggestionIndex(state.activeSuggestionIndex - 1);
        event.preventDefault();
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      resolveAndLoadInput();
      return;
    }

    if (event.key === "Escape") {
      hideSuggestions();
    }
  });

  dom.searchInput.addEventListener("input", () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      fetchSuggestions(dom.searchInput.value).catch((error) => {
        console.error(error);
        hideSuggestions();
      });
    }, 220);
  });

  dom.searchInput.addEventListener("focus", () => {
    if (dom.searchInput.value.trim() && state.searchResults.length > 0) {
      renderSuggestions(state.searchResults);
    }
  });

  if (dom.webhookInput) {
    dom.webhookInput.addEventListener("input", () => {
      dom.webhookInput.classList.toggle("unsaved", dom.webhookInput.value.trim() !== state.webhookUrl);
    });
    dom.webhookInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitWebhookUrlPreference();
      }
    });
  }
  if (dom.webhookSaveButton) {
    dom.webhookSaveButton.addEventListener("click", commitWebhookUrlPreference);
  }
  if (dom.webhookTestButton) {
    dom.webhookTestButton.addEventListener("click", testWebhookConnection);
  }

  if (dom.watchlistSearchInput) {
    dom.watchlistSearchInput.addEventListener("input", () => {
      state.watchlistFilter = dom.watchlistSearchInput.value.trim();
      renderWatchlist();
    });
  }
  if (dom.watchlist) {
    dom.watchlist.addEventListener("scroll", scheduleWatchlistScrollRefresh, { passive: true });
  }

  document.addEventListener("click", (event) => {
    if (!dom.searchSuggestions.contains(event.target) && event.target !== dom.searchInput) {
      hideSuggestions();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (state.webhookModalOpen) {
      closeWebhookModal();
      return;
    }
    if (state.rulesModalOpen) {
      closeRulesModal();
      return;
    }
    if (state.signalDrawerOpen) {
      setSignalDrawerOpen(false);
    }
  });

  dom.watchlistButton.addEventListener("click", () => {
    toggleCurrentIntoWatchlist();
  });

  dom.watchlistImportButton.addEventListener("click", () => {
    if (!dom.watchlistImportInput) {
      return;
    }
    if (typeof dom.watchlistImportInput.showPicker === "function") {
      dom.watchlistImportInput.showPicker();
      return;
    }
    dom.watchlistImportInput.click();
  });

  dom.watchlistImportInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    try {
      await handleWatchlistImport(file);
    } catch (error) {
      console.error(error);
      const message = error?.message || "XLSX import failed";
      setRefreshStatus(message);
      showToast({
        tone: "sell",
        title: "Watchlist import failed",
        body: message,
      });
    } finally {
      event.target.value = "";
    }
  });

  dom.watchlistSortSelect.addEventListener("change", () => {
    state.watchlistSortMode = normalizeWatchlistSortMode(dom.watchlistSortSelect.value);
    saveWatchlistSortPreference();
    renderWatchlist();
  });

  dom.sourceSelect.addEventListener("change", () => {
    state.source = dom.sourceSelect.value;
    saveSourcePreference();
    renderSourcePanels();
    loadMarket(state.symbol);
  });

  dom.strategySelect.addEventListener("change", () => {
    state.strategy = normalizeStrategyValue(dom.strategySelect.value);
    state.strategySignal = null;
    state.watchlistStrategySignals = {};
    state.lastStrategyAlertKey = "";
    state.rulesPayload = null;
    updateStrategyDeleteButtonState(state.strategy);
    saveStrategyPreference();
    renderWatchlist();
    renderStrategySignal(null);
    if (state.rulesModalOpen) {
      refreshRulesModal({ force: true });
    }
    startAutoRefresh();
    fetchStrategySignal(state.symbol, { silent: false, announce: true });
    fetchWatchlistStrategySignals({ silent: true });
  });

  if (dom.strategyDeleteButton) {
    dom.strategyDeleteButton.addEventListener("click", deleteSelectedCustomStrategy);
  }

  dom.timeframeButtons.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.timeframe = button.dataset.timeframe;
      setActiveTimeframeButton();
      loadMarket(state.symbol);
    });
  });

  dom.rulesButton.addEventListener("click", () => {
    openRulesModal();
  });

  if (dom.webhookButton) {
    dom.webhookButton.addEventListener("click", () => {
      openWebhookModal();
    });
  }

  dom.signalDrawerToggle.addEventListener("click", () => {
    setSignalDrawerOpen(!state.signalDrawerOpen);
  });

  dom.signalDrawerClose.addEventListener("click", () => {
    setSignalDrawerOpen(false);
  });

  dom.signalDrawerBackdrop.addEventListener("click", () => {
    setSignalDrawerOpen(false);
  });

  dom.rulesModalClose.addEventListener("click", () => {
    closeRulesModal();
  });

  dom.rulesBackdrop.addEventListener("click", () => {
    closeRulesModal();
  });

  if (dom.webhookModalClose) {
    dom.webhookModalClose.addEventListener("click", () => {
      closeWebhookModal();
    });
  }
  if (dom.webhookBackdrop) {
    dom.webhookBackdrop.addEventListener("click", () => {
      closeWebhookModal();
    });
  }

  if (dom.customRuleSaveButton) {
    dom.customRuleSaveButton.addEventListener("click", submitCustomStrategyRule);
  }
  if (dom.customRuleInput) {
    dom.customRuleInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submitCustomStrategyRule();
      }
    });
  }
}

async function init() {
  bindEvents();
  renderWatchlist();
  renderWebhookPanel({ syncInput: true });
  setActiveTimeframeButton();
  setSignalDrawerOpen(false);
  renderSourcePanels();
  await loadSources();
  await loadStrategies();
  await loadMarket(state.symbol);
  await fetchWatchlistQuotes({ silent: true });
  await fetchWatchlistStrategySignals({ silent: true });
  scheduleChartResize();
  startAutoRefresh();
}

init();
