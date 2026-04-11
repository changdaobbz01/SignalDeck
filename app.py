#!/usr/bin/env python3
from __future__ import annotations

import copy
import hashlib
import json
import os
import re
import shutil
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from threading import Lock
from typing import Any, Dict, List, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from flask import Flask, jsonify, render_template, request

from market_signal_tool import (
    EastMoneyClient,
    MarketDataError,
    MarketSnapshot,
    SOURCE_HEALTH_TRACKER,
    SOURCE_METADATA,
    SignalEngine,
    http_get_json,
    load_config,
    macd,
    normalize_source_name,
    sma,
    source_label,
)


def resolve_resource_dir() -> str:
    if getattr(sys, "frozen", False):
        return os.path.abspath(getattr(sys, "_MEIPASS", os.path.dirname(sys.executable)))
    return os.path.abspath(os.path.dirname(__file__))


def resolve_app_data_dir() -> str:
    override = os.getenv("SIGNAL_DECK_DATA_DIR", "").strip()
    if override:
        return os.path.abspath(override)
    home_dir = os.path.expanduser("~")
    if sys.platform == "darwin":
        return os.path.join(home_dir, "Library", "Application Support", "SignalDeck")
    if os.name == "nt":
        appdata = os.getenv("APPDATA", "").strip()
        if appdata:
            return os.path.join(appdata, "SignalDeck")
        return os.path.join(home_dir, "AppData", "Roaming", "SignalDeck")
    return os.path.join(home_dir, ".signal-deck")


def ensure_runtime_file(target_path: str, default_path: str, fallback: str = "") -> None:
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    if os.path.exists(target_path):
        return
    if default_path and os.path.exists(default_path):
        shutil.copyfile(default_path, target_path)
        return
    with open(target_path, "w", encoding="utf-8") as file:
        file.write(fallback)


RESOURCE_DIR = resolve_resource_dir()
DATA_DIR = resolve_app_data_dir()
CONFIG_TEMPLATE_PATH = os.path.join(RESOURCE_DIR, "config.example.json")
CUSTOM_STRATEGIES_TEMPLATE_PATH = os.path.join(RESOURCE_DIR, "custom_strategies.json")
CONFIG_PATH = os.path.join(DATA_DIR, "config.example.json")
CUSTOM_STRATEGIES_PATH = os.path.join(DATA_DIR, "custom_strategies.json")
ensure_runtime_file(CONFIG_PATH, CONFIG_TEMPLATE_PATH, "{}\n")
ensure_runtime_file(CUSTOM_STRATEGIES_PATH, CUSTOM_STRATEGIES_TEMPLATE_PATH, '{"strategies":{},"deleted":[]}\n')
SEARCH_TOKEN = "D43BF722C8E33BDC906FB84D85E326E8"
SEARCH_BASE = "https://searchapi.eastmoney.com/api/suggest/get"
CLIST_BASE = "https://push2.eastmoney.com/api/qt/clist/get"
CLIST_UT = "bd1d9ddb04089700cf9c27f6f7426281"
CLIST_PAGE_SIZE = 100
SEARCH_UNIVERSE_TTL = 6 * 60 * 60
SEARCH_UNIVERSE_SEGMENTS = [
    ("b:MK0021,b:MK0022,b:MK0023,b:MK0024", "ETF"),
]
SEARCH_UNIVERSE_CACHE: Dict[str, Any] = {"items": [], "loaded_at": 0.0}
SEARCH_UNIVERSE_LOCK = Lock()
PREFIX_SEGMENT_CACHE: Dict[str, Any] = {}
PREFIX_SEGMENT_LOCK = Lock()
CUSTOM_STRATEGY_LOCK = Lock()
RESPONSE_CACHE: Dict[str, Dict[str, Any]] = {}
RESPONSE_CACHE_LOCK = Lock()
RESPONSE_CACHE_MAX_ITEMS = 1024
CHART_CACHE_TTL = 3.0
SNAPSHOT_CACHE_TTL = 2.0
STRATEGY_SIGNAL_CACHE_TTL = 3.0
DASHBOARD_PULSE_CACHE_TTL = 2.0
WATCHLIST_STREAK_CACHE_TTL = 20.0
RESPONSE_CACHE_MISS = object()

DEFAULT_SYMBOL = "sh000001"
DEFAULT_TIMEFRAME = "1d"
DEFAULT_ADJUST = "qfq"
DEFAULT_SOURCE = os.getenv("APP_SOURCE", "auto")
DEFAULT_HOST = os.getenv("APP_HOST", "127.0.0.1")
DEFAULT_PORT = int(os.getenv("APP_PORT", "8000"))
DEFAULT_STRATEGY = "none"
STRATEGY_TIMEFRAMES = {"1m", "5m", "15m", "30m", "60m", "1d"}
CUSTOM_VALUE_LABELS = {
    "DIF": "MACD DIF 快线",
    "DEA": "MACD DEA 慢线",
    "K": "KDJ K 值",
    "D": "KDJ D 值",
    "J": "KDJ J 值",
    "CLOSE": "最新 K 线收盘价",
    "OPEN": "最新 K 线开盘价",
    "HIGH": "最新 K 线最高价",
    "LOW": "最新 K 线最低价",
    "VOLUME": "最新 K 线成交量",
    "AMOUNT": "最新 K 线成交额",
}

STRATEGY_PRESETS = {
    "none": {
        "id": "none",
        "label": "不启用",
        "description": "关闭买卖提示。",
        "timeframe": None,
        "type": "builtin",
        "indicators": [],
        "buy_rules": [],
        "sell_rules": [],
        "notes": ["当前策略已关闭，不计算买入或卖出命中。"],
    },
    "rule1": {
        "id": "rule1",
        "label": "规则1 · 5m MACD/KDJ",
        "description": "5分钟 DIF>DEA 且 K>D 触发买入，反向触发卖出；J 值决定优先级。",
        "timeframe": "5m",
        "type": "builtin",
        "indicators": [
            {"name": "DIF", "type": "macd", "description": "MACD DIF 快线"},
            {"name": "DEA", "type": "macd", "description": "MACD DEA 慢线"},
            {"name": "K", "type": "kdj", "description": "KDJ K 值"},
            {"name": "D", "type": "kdj", "description": "KDJ D 值"},
            {"name": "J", "type": "kdj", "description": "KDJ J 值，用于估算优先级"},
        ],
        "buy_rules": ["5m DIF>DEA 且 K>D"],
        "sell_rules": ["5m DIF<DEA 且 K<D"],
        "notes": [
            "规则信号固定使用 5m 周期计算，不跟随主图周期切换。",
            "BUY 红色、SELL 绿色；J 值越接近极端区间，优先级越高。",
        ],
    },
}

app = Flask(
    __name__,
    template_folder=os.path.join(RESOURCE_DIR, "templates"),
    static_folder=os.path.join(RESOURCE_DIR, "static"),
)
app.json.ensure_ascii = False
client = EastMoneyClient()


def build_response_cache_key(prefix: str, *parts: Any) -> str:
    normalized_parts: List[str] = [prefix]
    for part in parts:
        if isinstance(part, (dict, list, tuple, set)):
            normalized_parts.append(json.dumps(part, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
        else:
            normalized_parts.append(str(part))
    return "|".join(normalized_parts)


def get_response_cache(key: str) -> Any:
    now = time.time()
    with RESPONSE_CACHE_LOCK:
        entry = RESPONSE_CACHE.get(key)
        if not entry:
            return RESPONSE_CACHE_MISS
        if float(entry.get("expires_at") or 0.0) <= now:
            RESPONSE_CACHE.pop(key, None)
            return RESPONSE_CACHE_MISS
        return copy.deepcopy(entry.get("value"))


def set_response_cache(key: str, value: Any, ttl: float) -> Any:
    now = time.time()
    stored = copy.deepcopy(value)
    with RESPONSE_CACHE_LOCK:
        RESPONSE_CACHE[key] = {
            "expires_at": now + max(ttl, 0.0),
            "value": stored,
            "updated_at": now,
        }
        if len(RESPONSE_CACHE) > RESPONSE_CACHE_MAX_ITEMS:
            stale_keys = sorted(
                RESPONSE_CACHE.keys(),
                key=lambda item: float(RESPONSE_CACHE[item].get("expires_at") or 0.0),
            )[: max(1, len(RESPONSE_CACHE) - RESPONSE_CACHE_MAX_ITEMS)]
            for stale_key in stale_keys:
                RESPONSE_CACHE.pop(stale_key, None)
    return copy.deepcopy(stored)


def get_or_set_response_cache(key: str, ttl: float, builder: Any) -> Any:
    cached = get_response_cache(key)
    if cached is not RESPONSE_CACHE_MISS:
        return cached
    value = builder()
    return set_response_cache(key, value, ttl)


def clear_response_cache(prefix: Optional[str] = None) -> None:
    with RESPONSE_CACHE_LOCK:
        if not prefix:
            RESPONSE_CACHE.clear()
            return
        cache_prefix = f"{prefix}|"
        keys = [key for key in RESPONSE_CACHE.keys() if key.startswith(cache_prefix)]
        for key in keys:
            RESPONSE_CACHE.pop(key, None)


def fetch_bars_with_source_cached(
    symbol: str,
    timeframe: str,
    max_bars: int,
    adjust: str,
    source: str,
    ttl: float,
) -> Tuple[str, List[Any], str]:
    requested_source = normalize_source_name(source)
    cache_key = build_response_cache_key("bars", symbol, timeframe, max_bars, adjust, requested_source)
    return get_or_set_response_cache(
        cache_key,
        ttl,
        lambda: client.fetch_bars_with_source(symbol, timeframe, max_bars, adjust, source=requested_source),
    )


def fetch_snapshot_cached(symbol: str, source: str, ttl: float = SNAPSHOT_CACHE_TTL) -> MarketSnapshot:
    requested_source = normalize_source_name(source)
    cache_key = build_response_cache_key("snapshot", symbol, requested_source)
    return get_or_set_response_cache(
        cache_key,
        ttl,
        lambda: client.fetch_snapshot(symbol, source=requested_source),
    )


def build_strategy_signal_payload_cached(symbol: str, strategy_name: str, source: str) -> Dict[str, Any]:
    cache_key = build_response_cache_key("strategy", symbol, normalize_strategy_name(strategy_name), normalize_source_name(source))
    return get_or_set_response_cache(
        cache_key,
        STRATEGY_SIGNAL_CACHE_TTL,
        lambda: build_strategy_signal_payload(symbol, strategy_name, source),
    )


def build_chart_payload_cached(
    symbol: str,
    timeframe: str,
    adjust: str,
    history_bars: int,
    source: str,
) -> Dict[str, Any]:
    cache_key = build_response_cache_key("chart", symbol, timeframe, adjust, history_bars, normalize_source_name(source))
    return get_or_set_response_cache(
        cache_key,
        CHART_CACHE_TTL,
        lambda: build_chart_payload(symbol, timeframe, adjust, history_bars, source),
    )


def compute_watchlist_streak_cached(symbol: str, source: str) -> Dict[str, Any]:
    requested_source = normalize_source_name(source)
    cache_key = build_response_cache_key("watchlist-streak", symbol, requested_source)
    return get_or_set_response_cache(
        cache_key,
        WATCHLIST_STREAK_CACHE_TTL,
        lambda: compute_consecutive_trend(
            fetch_bars_with_source_cached(
                symbol,
                "1d",
                6,
                "none",
                requested_source,
                WATCHLIST_STREAK_CACHE_TTL,
            )[1]
        ),
    )


def normalize_symbol_request_list(raw_symbols: str, limit: int = 120) -> List[str]:
    tokens = [item.strip() for item in str(raw_symbols or "").split(",") if item.strip()]
    ordered_symbols: List[str] = []
    seen: set[str] = set()
    for token in tokens[:limit]:
        normalized = token.lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        ordered_symbols.append(token)
    return ordered_symbols


def build_watchlist_quotes_payload(raw_symbols: str, source: str) -> Dict[str, Any]:
    requested_source = normalize_source_name(source)
    ordered_symbols = normalize_symbol_request_list(raw_symbols)
    if not ordered_symbols:
        return {"quotes": [], "errors": []}

    def fetch_one(raw_symbol: str) -> Dict[str, Any]:
        symbol = resolve_symbol(raw_symbol)
        snapshot = fetch_snapshot_cached(symbol, requested_source, ttl=SNAPSHOT_CACHE_TTL)
        try:
            streak = compute_watchlist_streak_cached(symbol, requested_source)
        except Exception:
            streak = {"direction": "", "days": 0, "label": ""}
        return {
            "requested_symbol": raw_symbol.lower(),
            "symbol": symbol,
            "name": snapshot.name,
            "source": build_source_info(requested_source, snapshot.source),
            "market": serialize_snapshot(snapshot),
            "streak": streak,
        }

    quotes: List[Dict[str, Any]] = []
    errors: List[Dict[str, str]] = []
    max_workers = min(6, len(ordered_symbols)) or 1
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_map = {executor.submit(fetch_one, symbol): symbol for symbol in ordered_symbols}
        for future in as_completed(future_map):
            raw_symbol = future_map[future]
            try:
                quotes.append(future.result())
            except Exception as exc:  # noqa: BLE001
                errors.append({"symbol": raw_symbol, "error": str(exc)})

    order_index = {symbol.lower(): idx for idx, symbol in enumerate(ordered_symbols)}
    quotes.sort(key=lambda item: order_index.get(item.get("requested_symbol", ""), len(order_index)))
    for item in quotes:
        item.pop("requested_symbol", None)
    errors.sort(key=lambda item: order_index.get(item["symbol"].lower(), len(order_index)))
    return {"quotes": quotes, "errors": errors}


def build_watchlist_strategy_signals_payload(raw_symbols: str, strategy_name: str, source: str) -> Dict[str, Any]:
    strategy_id = normalize_strategy_name(strategy_name)
    if strategy_id == "none":
        return {"signals": [], "errors": []}

    normalize_source_name(source)
    ordered_symbols = normalize_symbol_request_list(raw_symbols)
    if not ordered_symbols:
        return {"signals": [], "errors": []}

    def fetch_one(raw_symbol: str) -> Dict[str, Any]:
        symbol = resolve_symbol(raw_symbol)
        payload = build_strategy_signal_payload_cached(symbol, strategy_id, source)
        payload["requested_symbol"] = raw_symbol.lower()
        return payload

    signals: List[Dict[str, Any]] = []
    errors: List[Dict[str, str]] = []
    max_workers = min(6, len(ordered_symbols)) or 1
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_map = {executor.submit(fetch_one, symbol): symbol for symbol in ordered_symbols}
        for future in as_completed(future_map):
            raw_symbol = future_map[future]
            try:
                signals.append(future.result())
            except Exception as exc:  # noqa: BLE001
                errors.append({"symbol": raw_symbol, "error": str(exc)})

    order_index = {symbol.lower(): idx for idx, symbol in enumerate(ordered_symbols)}
    signals.sort(key=lambda item: order_index.get(item.get("requested_symbol", ""), len(order_index)))
    for item in signals:
        item.pop("requested_symbol", None)
    errors.sort(key=lambda item: order_index.get(item["symbol"].lower(), len(order_index)))
    return {"signals": signals, "errors": errors}


def build_dashboard_pulse_payload(
    symbol: str,
    timeframe: str,
    adjust: str,
    history_bars: int,
    source: str,
    strategy_name: str,
    raw_watchlist_symbols: str,
    include_chart: bool = False,
    include_watchlist_signals: bool = False,
) -> Dict[str, Any]:
    requested_source = normalize_source_name(source)
    strategy_id = normalize_strategy_name(strategy_name)
    watchlist_symbols = normalize_symbol_request_list(raw_watchlist_symbols)

    payload: Dict[str, Any] = {
        "symbol": symbol,
        "timeframe": timeframe,
        "adjust": adjust,
        "strategy": strategy_id,
        "source": requested_source,
        "server_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "chart": None,
        "quote": None,
        "strategy_signal": None,
        "watchlist_quotes": {"quotes": [], "errors": []},
        "watchlist_signals": {"signals": [], "errors": []},
        "includes": {
            "chart": include_chart,
            "watchlist_signals": include_watchlist_signals and strategy_id != "none",
        },
    }
    errors: Dict[str, str] = {}

    def fetch_chart() -> Dict[str, Any]:
        return build_chart_payload_cached(symbol, timeframe, adjust, history_bars, requested_source)

    def fetch_quote() -> Dict[str, Any]:
        snapshot = fetch_snapshot_cached(symbol, requested_source, ttl=SNAPSHOT_CACHE_TTL)
        return {
            "symbol": symbol,
            "source": build_source_info(requested_source, snapshot.source),
            "market": serialize_snapshot(snapshot),
        }

    jobs: Dict[Any, str] = {}
    max_workers = 2
    if strategy_id != "none":
        max_workers += 1
    if watchlist_symbols:
        max_workers += 1
        if include_watchlist_signals and strategy_id != "none":
            max_workers += 1

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        jobs[executor.submit(fetch_chart if include_chart else fetch_quote)] = "chart" if include_chart else "quote"
        if strategy_id != "none":
            jobs[executor.submit(build_strategy_signal_payload_cached, symbol, strategy_id, requested_source)] = "strategy_signal"
        if watchlist_symbols:
            jobs[executor.submit(build_watchlist_quotes_payload, ",".join(watchlist_symbols), requested_source)] = "watchlist_quotes"
            if include_watchlist_signals and strategy_id != "none":
                jobs[
                    executor.submit(
                        build_watchlist_strategy_signals_payload,
                        ",".join(watchlist_symbols),
                        strategy_id,
                        requested_source,
                    )
                ] = "watchlist_signals"

        for future in as_completed(jobs):
            key = jobs[future]
            try:
                result = future.result()
                if key == "chart":
                    payload["chart"] = result
                    payload["quote"] = {
                        "symbol": result["symbol"],
                        "source": result["source"],
                        "market": result["market"],
                    }
                else:
                    payload[key] = result
            except Exception as exc:  # noqa: BLE001
                errors[key] = str(exc)

    if errors:
        payload["errors"] = errors
    return payload


def build_dashboard_pulse_payload_cached(
    symbol: str,
    timeframe: str,
    adjust: str,
    history_bars: int,
    source: str,
    strategy_name: str,
    raw_watchlist_symbols: str,
    include_chart: bool = False,
    include_watchlist_signals: bool = False,
) -> Dict[str, Any]:
    requested_source = normalize_source_name(source)
    strategy_id = normalize_strategy_name(strategy_name)
    watchlist_key = ",".join(normalize_symbol_request_list(raw_watchlist_symbols))
    cache_key = build_response_cache_key(
        "dashboard-pulse",
        symbol,
        timeframe,
        adjust,
        history_bars,
        requested_source,
        strategy_id,
        watchlist_key,
        int(bool(include_chart)),
        int(bool(include_watchlist_signals)),
    )
    return get_or_set_response_cache(
        cache_key,
        DASHBOARD_PULSE_CACHE_TTL,
        lambda: build_dashboard_pulse_payload(
            symbol,
            timeframe,
            adjust,
            history_bars,
            requested_source,
            strategy_id,
            watchlist_key,
            include_chart=include_chart,
            include_watchlist_signals=include_watchlist_signals,
        ),
    )


def calc_kdj(
    highs: List[float],
    lows: List[float],
    closes: List[float],
    window: int = 9,
) -> Tuple[List[Optional[float]], List[Optional[float]], List[Optional[float]]]:
    k_values: List[Optional[float]] = [None] * len(closes)
    d_values: List[Optional[float]] = [None] * len(closes)
    j_values: List[Optional[float]] = [None] * len(closes)
    prev_k = 50.0
    prev_d = 50.0

    for idx in range(len(closes)):
        start = max(0, idx - window + 1)
        window_high = max(highs[start : idx + 1])
        window_low = min(lows[start : idx + 1])
        if window_high == window_low:
            rsv = 50.0
        else:
            rsv = ((closes[idx] - window_low) / (window_high - window_low)) * 100.0
        current_k = (2.0 / 3.0) * prev_k + (1.0 / 3.0) * rsv
        current_d = (2.0 / 3.0) * prev_d + (1.0 / 3.0) * current_k
        current_j = (3.0 * current_k) - (2.0 * current_d)
        k_values[idx] = current_k
        d_values[idx] = current_d
        j_values[idx] = current_j
        prev_k = current_k
        prev_d = current_d

    return k_values, d_values, j_values


def round_series(values: List[Optional[float]], digits: int = 4) -> List[Optional[float]]:
    rounded: List[Optional[float]] = []
    for value in values:
        if value is None:
            rounded.append(None)
        else:
            rounded.append(round(float(value), digits))
    return rounded


def round_optional(value: Optional[float], digits: int = 4) -> Optional[float]:
    if value is None:
        return None
    return round(float(value), digits)


def load_runtime_config() -> Dict[str, Any]:
    return copy.deepcopy(load_config(CONFIG_PATH))


def load_custom_strategies() -> Dict[str, Dict[str, Any]]:
    payload = load_strategy_store()
    strategies = payload.get("strategies") if isinstance(payload, dict) else payload
    if not isinstance(strategies, dict):
        return {}
    cleaned: Dict[str, Dict[str, Any]] = {}
    for key, value in strategies.items():
        if not isinstance(value, dict):
            continue
        strategy_id = str(value.get("id") or key).strip().lower()
        if not strategy_id.startswith("custom_"):
            continue
        cleaned[strategy_id] = normalize_custom_strategy_record({**value, "id": strategy_id})
    return cleaned


def load_strategy_store() -> Dict[str, Any]:
    if not os.path.exists(CUSTOM_STRATEGIES_PATH):
        return {"strategies": {}, "deleted": []}
    try:
        with open(CUSTOM_STRATEGIES_PATH, "r", encoding="utf-8") as file:
            payload = json.load(file)
    except (OSError, json.JSONDecodeError):
        return {"strategies": {}, "deleted": []}
    if not isinstance(payload, dict):
        return {"strategies": {}, "deleted": []}
    return {
        "strategies": payload.get("strategies") if isinstance(payload.get("strategies"), dict) else {},
        "deleted": payload.get("deleted") if isinstance(payload.get("deleted"), list) else [],
    }


def load_deleted_strategy_ids() -> set[str]:
    store = load_strategy_store()
    return {
        str(item or "").strip().lower()
        for item in store.get("deleted", [])
        if str(item or "").strip().lower() and str(item or "").strip().lower() != "none"
    }


def save_strategy_store(strategies: Dict[str, Dict[str, Any]], deleted: set[str]) -> None:
    payload = {
        "strategies": strategies,
        "deleted": sorted(item for item in deleted if item and item != "none"),
    }
    tmp_path = f"{CUSTOM_STRATEGIES_PATH}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)
    os.replace(tmp_path, CUSTOM_STRATEGIES_PATH)


def save_custom_strategies(strategies: Dict[str, Dict[str, Any]]) -> None:
    save_strategy_store(strategies, load_deleted_strategy_ids())


def normalize_custom_strategy_record(strategy: Dict[str, Any]) -> Dict[str, Any]:
    buy_rule = normalize_custom_condition(str(strategy.get("buy_rule") or ""))
    sell_rule = normalize_custom_condition(str(strategy.get("sell_rule") or ""))
    timeframe = normalize_strategy_timeframe(str(strategy.get("timeframe") or ""))
    label = str(strategy.get("label") or "自定义规则").strip()[:40] or "自定义规则"
    strategy_id = str(strategy.get("id") or "").strip().lower()
    indicators = build_custom_indicator_list(buy_rule, sell_rule)
    return {
        "id": strategy_id,
        "label": label,
        "description": f"{timeframe} 自定义规则 · BUY: {buy_rule} · SELL: {sell_rule}",
        "timeframe": timeframe,
        "type": "custom",
        "buy_rule": buy_rule,
        "sell_rule": sell_rule,
        "indicators": indicators,
        "buy_rules": [f"{timeframe} {buy_rule}"],
        "sell_rules": [f"{timeframe} {sell_rule}"],
        "notes": [
            "自定义规则使用当前所选信息源计算。",
            "支持指标 DIF、DEA、K、D、J、OPEN、HIGH、LOW、CLOSE、VOLUME、AMOUNT。",
            "条件支持 >、<、>=、<=、==、!=，可用 AND/OR 或 且/或 连接。",
        ],
    }


def all_strategy_presets() -> Dict[str, Dict[str, Any]]:
    strategies = {key: copy.deepcopy(value) for key, value in STRATEGY_PRESETS.items()}
    for deleted_id in load_deleted_strategy_ids():
        strategies.pop(deleted_id, None)
    strategies.update(load_custom_strategies())
    return strategies


def get_strategy_preset(strategy_id: str) -> Dict[str, Any]:
    strategies = all_strategy_presets()
    if strategy_id not in strategies:
        raise MarketDataError(f"未知策略: {strategy_id}")
    return strategies[strategy_id]


def normalize_strategy_timeframe(raw: str) -> str:
    text = str(raw or "").strip().lower()
    match = re.search(r"\b(1m|5m|15m|30m|60m|1d)\b", text)
    if not match:
        raise MarketDataError("周期必须是 1m、5m、15m、30m、60m 或 1d")
    timeframe = match.group(1)
    if timeframe not in STRATEGY_TIMEFRAMES:
        raise MarketDataError(f"暂不支持周期: {timeframe}")
    return timeframe


def normalize_custom_condition(raw: str) -> str:
    text = str(raw or "").strip()
    text = re.sub(r"^(buy|sell|买入|卖出)\s*[:：]\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"^(fixed\s*)?(1m|5m|15m|30m|60m|1d)\s+", "", text, flags=re.IGNORECASE)
    replacements = {
        "＞": ">",
        "＜": "<",
        "＝": "=",
        "！": "!",
        "（": "(",
        "）": ")",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    text = re.sub(r"\s+", " ", text).strip()
    return text.upper()


def parse_custom_strategy_rule(raw: str) -> Dict[str, Any]:
    text = str(raw or "").strip()
    if not text:
        raise MarketDataError("请输入规则")
    parts = [part.strip() for part in text.split("|")]
    if len(parts) != 4:
        raise MarketDataError("格式应为：名称 | 周期 | BUY: 条件 | SELL: 条件")

    label = parts[0][:40].strip()
    if not label:
        raise MarketDataError("规则名称不能为空")
    timeframe = normalize_strategy_timeframe(parts[1])
    buy_rule = normalize_custom_condition(parts[2])
    sell_rule = normalize_custom_condition(parts[3])
    if not buy_rule or not sell_rule:
        raise MarketDataError("请同时填写 BUY 和 SELL 条件")
    validate_custom_condition(buy_rule)
    validate_custom_condition(sell_rule)
    digest = hashlib.sha1(f"{label}|{timeframe}|{buy_rule}|{sell_rule}".encode("utf-8")).hexdigest()[:10]
    return normalize_custom_strategy_record(
        {
            "id": f"custom_{digest}",
            "label": label,
            "timeframe": timeframe,
            "buy_rule": buy_rule,
            "sell_rule": sell_rule,
        }
    )


def build_custom_indicator_list(*conditions: str) -> List[Dict[str, Any]]:
    used: List[str] = []
    for condition in conditions:
        for token in re.findall(r"\b[A-Z_][A-Z0-9_]*\b", condition.upper()):
            if token in {"AND", "OR"} or token not in CUSTOM_VALUE_LABELS or token in used:
                continue
            used.append(token)
    return [
        {"name": token, "type": "custom", "description": CUSTOM_VALUE_LABELS[token]}
        for token in used
    ]


def validate_custom_condition(condition: str) -> None:
    for comparison in iter_condition_comparisons(condition):
        left, operator, right = parse_custom_comparison(comparison)
        if operator not in {">", "<", ">=", "<=", "==", "!="}:
            raise MarketDataError(f"不支持的比较符: {operator}")
        validate_custom_operand(left)
        validate_custom_operand(right)


def normalize_boolean_connectors(condition: str) -> str:
    text = normalize_custom_condition(condition)
    text = re.sub(r"\s*&&\s*", " AND ", text)
    text = re.sub(r"\s*\|\|\s*", " OR ", text)
    text = re.sub(r"\s*且\s*", " AND ", text)
    text = re.sub(r"\s*或\s*", " OR ", text)
    text = re.sub(r"\bAND\b", " AND ", text, flags=re.IGNORECASE)
    text = re.sub(r"\bOR\b", " OR ", text, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", text).strip()


def iter_condition_comparisons(condition: str) -> List[str]:
    text = normalize_boolean_connectors(condition)
    if not text:
        raise MarketDataError("条件不能为空")
    comparisons: List[str] = []
    for or_group in re.split(r"\s+OR\s+", text):
        for comparison in re.split(r"\s+AND\s+", or_group):
            item = comparison.strip()
            if not item:
                raise MarketDataError("条件连接符附近缺少比较表达式")
            comparisons.append(item)
    return comparisons


def parse_custom_comparison(comparison: str) -> Tuple[str, str, str]:
    match = re.fullmatch(
        r"([A-Z_][A-Z0-9_]*|-?\d+(?:\.\d+)?)\s*(>=|<=|==|!=|>|<)\s*([A-Z_][A-Z0-9_]*|-?\d+(?:\.\d+)?)",
        comparison.strip(),
    )
    if not match:
        raise MarketDataError(f"无法解析条件: {comparison}")
    return match.group(1), match.group(2), match.group(3)


def validate_custom_operand(value: str) -> None:
    if re.fullmatch(r"-?\d+(?:\.\d+)?", value):
        return
    if value not in CUSTOM_VALUE_LABELS:
        raise MarketDataError(f"不支持的指标: {value}")


def custom_operand_value(value: str, values: Dict[str, Optional[float]]) -> Optional[float]:
    if re.fullmatch(r"-?\d+(?:\.\d+)?", value):
        return float(value)
    return values.get(value)


def evaluate_custom_comparison(comparison: str, values: Dict[str, Optional[float]]) -> bool:
    left, operator, right = parse_custom_comparison(comparison)
    left_value = custom_operand_value(left, values)
    right_value = custom_operand_value(right, values)
    if left_value is None or right_value is None:
        return False
    if operator == ">":
        return left_value > right_value
    if operator == "<":
        return left_value < right_value
    if operator == ">=":
        return left_value >= right_value
    if operator == "<=":
        return left_value <= right_value
    if operator == "==":
        return left_value == right_value
    if operator == "!=":
        return left_value != right_value
    return False


def evaluate_custom_condition(condition: str, values: Dict[str, Optional[float]]) -> bool:
    text = normalize_boolean_connectors(condition)
    for or_group in re.split(r"\s+OR\s+", text):
        and_results = [
            evaluate_custom_comparison(comparison.strip(), values)
            for comparison in re.split(r"\s+AND\s+", or_group)
            if comparison.strip()
        ]
        if and_results and all(and_results):
            return True
    return False


def build_source_info(requested: str, actual: str) -> Dict[str, str]:
    return {
        "requested": requested,
        "requested_label": source_label(requested),
        "actual": actual,
        "actual_label": source_label(actual),
    }


def build_snapshot_from_bars(
    symbol: str,
    name: str,
    bars: List[Any],
    source: str,
) -> MarketSnapshot:
    last_bar = bars[-1]
    prev_close = bars[-2].close if len(bars) >= 2 else last_bar.close
    change = last_bar.close - prev_close
    change_pct = (change / prev_close * 100.0) if prev_close else 0.0
    return MarketSnapshot(
        symbol=symbol,
        name=name,
        source=source,
        last_price=last_bar.close,
        prev_close=prev_close,
        open=last_bar.open,
        high=last_bar.high,
        low=last_bar.low,
        volume=last_bar.volume,
        amount=last_bar.amount,
        change=change,
        change_pct=change_pct,
        turnover_rate=None,
        amplitude_pct=((last_bar.high - last_bar.low) / prev_close * 100.0) if prev_close else None,
        pe_dynamic=None,
        pb=None,
        total_market_value=None,
        circulating_market_value=None,
        upper_limit=None,
        lower_limit=None,
        timestamp=last_bar.timestamp,
    )


def serialize_snapshot(snapshot: MarketSnapshot, fallback_timestamp: Optional[str] = None) -> Dict[str, Any]:
    return {
        "symbol": snapshot.symbol,
        "name": snapshot.name,
        "source": snapshot.source,
        "source_label": source_label(snapshot.source),
        "last_price": round_optional(snapshot.last_price, 3),
        "prev_close": round_optional(snapshot.prev_close, 3),
        "open": round_optional(snapshot.open, 3),
        "high": round_optional(snapshot.high, 3),
        "low": round_optional(snapshot.low, 3),
        "volume": round_optional(snapshot.volume, 2),
        "amount": round_optional(snapshot.amount, 2),
        "change": round_optional(snapshot.change, 4),
        "change_pct": round_optional(snapshot.change_pct, 4),
        "turnover_rate": round_optional(snapshot.turnover_rate, 4),
        "amplitude_pct": round_optional(snapshot.amplitude_pct, 4),
        "pe_dynamic": round_optional(snapshot.pe_dynamic, 4),
        "pb": round_optional(snapshot.pb, 4),
        "total_market_value": round_optional(snapshot.total_market_value, 2),
        "circulating_market_value": round_optional(snapshot.circulating_market_value, 2),
        "upper_limit": round_optional(snapshot.upper_limit, 3),
        "lower_limit": round_optional(snapshot.lower_limit, 3),
        "timestamp": snapshot.timestamp or fallback_timestamp,
    }


def compute_consecutive_trend(bars: List[Any]) -> Dict[str, Any]:
    if len(bars) < 3:
        return {"direction": "", "days": 0, "label": ""}

    direction = 0
    days = 0
    for index in range(len(bars) - 1, 0, -1):
        diff = float(bars[index].close) - float(bars[index - 1].close)
        current = 1 if diff > 0 else -1 if diff < 0 else 0
        if current == 0:
            break
        if direction == 0:
            direction = current
            days = 1
            continue
        if current != direction:
            break
        days += 1

    if days < 2:
        return {"direction": "", "days": days, "label": ""}

    label = f"连涨{days}天" if direction > 0 else f"连跌{days}天"
    return {"direction": "up" if direction > 0 else "down", "days": days, "label": label}


def describe_indicator(name: str, spec: Dict[str, Any]) -> str:
    indicator_type = str(spec.get("type", "")).lower()
    source_name = spec.get("source", "close")
    if indicator_type in {"sma", "ema", "rsi"}:
        return f"{indicator_type.upper()}({source_name}, {spec.get('window', '-')})"
    if indicator_type == "macd":
        return (
            f"MACD({source_name}, fast={spec.get('fast', 12)}, "
            f"slow={spec.get('slow', 26)}, signal={spec.get('signal', 9)})"
        )
    if indicator_type == "bollinger":
        return (
            f"BOLL({source_name}, window={spec.get('window', 20)}, "
            f"std={spec.get('stddev', 2)})"
        )
    if indicator_type == "atr":
        return f"ATR(window={spec.get('window', 14)})"
    return f"{name} ({indicator_type})"


def build_rules_payload(strategy_name: str = DEFAULT_STRATEGY) -> Dict[str, Any]:
    config = load_runtime_config()
    strategy_id = normalize_strategy_name(strategy_name)
    strategy = get_strategy_preset(strategy_id)
    return {
        "strategy": strategy,
        "timeframe": strategy.get("timeframe") or "--",
        "adjust": config.get("adjust", DEFAULT_ADJUST),
        "indicators": list(strategy.get("indicators") or []),
        "buy_rules": list(strategy.get("buy_rules") or []),
        "sell_rules": list(strategy.get("sell_rules") or []),
        "notes": list(strategy.get("notes") or []),
    }


def normalize_strategy_name(raw: str) -> str:
    strategy = str(raw or DEFAULT_STRATEGY).strip().lower()
    if strategy in all_strategy_presets():
        return strategy
    raise MarketDataError(f"未知策略: {raw}")


def build_strategy_list_payload() -> Dict[str, Any]:
    strategies = all_strategy_presets()
    return {
        "default": DEFAULT_STRATEGY,
        "strategies": list(strategies.values()),
        "notes": [
            "策略信号独立于主图周期，按各自规则的固定周期计算。",
            "自定义规则会保存到本地 custom_strategies.json。",
        ],
    }


def last_valid_value(values: List[Optional[float]]) -> Optional[float]:
    for value in reversed(values):
        if value is None:
            continue
        return float(value)
    return None


def build_strategy_signal_payload(
    symbol: str,
    strategy_name: str,
    source: str,
) -> Dict[str, Any]:
    strategy_id = normalize_strategy_name(strategy_name)
    strategy = get_strategy_preset(strategy_id)

    if strategy_id == "none":
        return {
            "symbol": symbol,
            "strategy": strategy,
            "signal": "OFF",
            "triggered": False,
            "timestamp": None,
            "source": build_source_info(source, source),
            "priority": {"score": None, "label": "--"},
            "indicators": {},
            "reason": "策略已关闭",
            "alert_key": None,
        }

    if strategy_id != "rule1" and strategy.get("type") != "custom":
        raise MarketDataError(f"暂不支持策略: {strategy_name}")

    requested_source = normalize_source_name(source)
    timeframe = strategy["timeframe"] or "5m"
    name, bars, actual_source = fetch_bars_with_source_cached(
        symbol,
        timeframe,
        120,
        "none",
        requested_source,
        STRATEGY_SIGNAL_CACHE_TTL,
    )
    if len(bars) < 35:
        raise MarketDataError(f"{symbol} 的 {timeframe} 数据不足，无法计算策略")

    closes = [bar.close for bar in bars]
    highs = [bar.high for bar in bars]
    lows = [bar.low for bar in bars]
    dif_series, dea_series, _ = macd(closes)
    k_series, d_series, j_series = calc_kdj(highs, lows, closes)

    dif = last_valid_value(dif_series)
    dea = last_valid_value(dea_series)
    k_value = last_valid_value(k_series)
    d_value = last_valid_value(d_series)
    j_value = last_valid_value(j_series)
    if None in (dif, dea, k_value, d_value, j_value):
        raise MarketDataError(f"{symbol} 的策略指标计算失败")

    latest = bars[-1]
    values: Dict[str, Optional[float]] = {
        "DIF": dif,
        "DEA": dea,
        "K": k_value,
        "D": d_value,
        "J": j_value,
        "OPEN": latest.open,
        "HIGH": latest.high,
        "LOW": latest.low,
        "CLOSE": latest.close,
        "VOLUME": latest.volume,
        "AMOUNT": latest.amount,
    }

    if strategy.get("type") == "custom":
        buy_rule = str(strategy.get("buy_rule") or "")
        sell_rule = str(strategy.get("sell_rule") or "")
        buy_hit = evaluate_custom_condition(buy_rule, values)
        sell_hit = evaluate_custom_condition(sell_rule, values)
        buy_reason = f"{timeframe} {buy_rule}"
        sell_reason = f"{timeframe} {sell_rule}"
        hold_reason = f"{timeframe} 自定义规则未命中"
    else:
        buy_hit = bool(dif > dea and k_value > d_value)
        sell_hit = bool(dif < dea and k_value < d_value)
        buy_reason = "5m DIF>DEA 且 K>D"
        sell_reason = "5m DIF<DEA 且 K<D"
        hold_reason = "5m MACD / KDJ 未同时满足同向条件"

    if buy_hit and not sell_hit:
        signal = "BUY"
        priority_score = float(j_value)
        priority_label = "高" if j_value >= 80 else "中" if j_value >= 50 else "低"
        reason = buy_reason
    elif sell_hit and not buy_hit:
        signal = "SELL"
        priority_score = float(100 - j_value)
        priority_label = "高" if j_value <= 20 else "中" if j_value <= 50 else "低"
        reason = sell_reason
    elif buy_hit and sell_hit:
        signal = "HOLD"
        priority_score = None
        priority_label = "--"
        reason = f"{timeframe} 买入和卖出条件同时命中，保持观望"
    else:
        signal = "HOLD"
        priority_score = None
        priority_label = "--"
        reason = hold_reason

    timestamp = bars[-1].timestamp
    return {
        "symbol": symbol,
        "name": name,
        "strategy": strategy,
        "signal": signal,
        "triggered": signal in {"BUY", "SELL"},
        "timestamp": timestamp,
        "source": build_source_info(requested_source, actual_source),
        "priority": {
            "score": round_optional(priority_score, 2),
            "label": priority_label,
        },
        "indicators": {
            "dif": round_optional(dif, 4),
            "dea": round_optional(dea, 4),
            "k": round_optional(k_value, 2),
            "d": round_optional(d_value, 2),
            "j": round_optional(j_value, 2),
        },
        "reason": reason,
        "alert_key": f"{strategy_id}:{symbol}:{signal}:{timestamp}",
    }


def normalize_query_symbol(raw: str) -> Optional[str]:
    query = raw.strip().lower()
    if re.fullmatch(r"(sh|sz)\d{6}", query):
        return query
    return None


def quote_id_to_symbol(quote_id: str, code: str) -> Optional[str]:
    if quote_id.startswith("1."):
        return f"sh{code}"
    if quote_id.startswith("0."):
        return f"sz{code}"
    return None


def build_search_item(symbol: str, code: str, name: str, security_type: str) -> Dict[str, Any]:
    return {
        "symbol": symbol,
        "code": code,
        "name": name,
        "market": symbol[:2].upper(),
        "security_type": security_type,
        "display": f"{symbol.upper()} · {name}",
    }


def score_search_result(query: str, item: Dict[str, Any]) -> int:
    q = query.strip().lower()
    symbol = str(item.get("symbol") or "").lower()
    code = str(item.get("code") or "").lower()
    name = str(item.get("name") or "").lower()
    security_type = str(item.get("security_type") or "").lower()

    score = 0
    if q == code:
        score += 300
    elif code.startswith(q):
        score += 220
    elif q in code:
        score += 140

    if q == symbol:
        score += 280
    elif symbol.startswith(q):
        score += 180
    elif q in symbol:
        score += 120

    if q == name:
        score += 260
    elif name.startswith(q):
        score += 200
    elif q in name:
        score += 150

    if q and q in security_type:
        score += 30
    return score


def market_field_to_symbol(code: str, market_field: Any) -> Optional[str]:
    market = str(market_field)
    if market == "1":
        return f"sh{code}"
    if market == "0":
        return f"sz{code}"
    return None


def fetch_clist_page(fs: str, page: int, fid: str = "f3") -> Tuple[int, List[Dict[str, Any]]]:
    params = {
        "pn": page,
        "pz": CLIST_PAGE_SIZE,
        "po": 1,
        "np": 1,
        "ut": CLIST_UT,
        "fltt": 2,
        "invt": 2,
        "fid": fid,
        "fs": fs,
        "fields": "f12,f13,f14",
    }
    payload = http_get_json(f"{CLIST_BASE}?{urlencode(params)}")
    data = payload.get("data") or {}
    total = int(data.get("total") or 0)
    rows = data.get("diff") or []
    return total, rows


def build_search_universe() -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    seen: set[str] = set()

    for fs, security_type in SEARCH_UNIVERSE_SEGMENTS:
        total, first_rows = fetch_clist_page(fs, 1)
        total_pages = max(1, (total + CLIST_PAGE_SIZE - 1) // CLIST_PAGE_SIZE)
        all_rows = list(first_rows)

        if total_pages > 1:
            for page in range(2, total_pages + 1):
                try:
                    _, rows = fetch_clist_page(fs, page)
                except Exception:
                    continue
                all_rows.extend(rows)

        for row in all_rows:
            code = str(row.get("f12") or "").strip()
            symbol = market_field_to_symbol(code, row.get("f13"))
            if not code or not symbol or symbol in seen:
                continue
            seen.add(symbol)
            name = str(row.get("f14") or symbol).strip()
            items.append(build_search_item(symbol, code, name, security_type))

    return items


def get_search_universe() -> List[Dict[str, Any]]:
    now = time.time()
    with SEARCH_UNIVERSE_LOCK:
        cached_items = SEARCH_UNIVERSE_CACHE.get("items") or []
        loaded_at = float(SEARCH_UNIVERSE_CACHE.get("loaded_at") or 0.0)
        if cached_items and (now - loaded_at) < SEARCH_UNIVERSE_TTL:
            return list(cached_items)

    items = build_search_universe()
    with SEARCH_UNIVERSE_LOCK:
        SEARCH_UNIVERSE_CACHE["items"] = items
        SEARCH_UNIVERSE_CACHE["loaded_at"] = now
    return list(items)


def fuzzy_search_universe(query: str, limit: int = 12) -> List[Dict[str, Any]]:
    try:
        universe = get_search_universe()
    except Exception:
        return []

    scored: List[Tuple[int, Dict[str, Any]]] = []
    for item in universe:
        score = score_search_result(query, item)
        if score <= 0:
            continue
        scored.append((score, item))

    scored.sort(key=lambda pair: (-pair[0], str(pair[1].get("code") or "")))
    return [item for _, item in scored[:limit]]


def get_prefix_segment_items(fs: str, security_type: str, page_count: int = 4) -> List[Dict[str, Any]]:
    cache_key = f"{fs}|{security_type}|{page_count}"
    now = time.time()
    with PREFIX_SEGMENT_LOCK:
        cached = PREFIX_SEGMENT_CACHE.get(cache_key)
        if cached and (now - float(cached.get("loaded_at") or 0.0)) < SEARCH_UNIVERSE_TTL:
            return list(cached.get("items") or [])

    rows: List[Dict[str, Any]] = []
    for page in range(1, page_count + 1):
        try:
            _, page_rows = fetch_clist_page(fs, page, fid="f12")
        except Exception:
            continue
        rows.extend(page_rows)

    seen: set[str] = set()
    items: List[Dict[str, Any]] = []
    for row in rows:
        code = str(row.get("f12") or "").strip()
        symbol = market_field_to_symbol(code, row.get("f13"))
        if not code or not symbol or symbol in seen:
            continue
        seen.add(symbol)
        items.append(build_search_item(symbol, code, str(row.get("f14") or symbol).strip(), security_type))

    items.sort(key=lambda item: str(item.get("code") or ""))
    with PREFIX_SEGMENT_LOCK:
        PREFIX_SEGMENT_CACHE[cache_key] = {"items": items, "loaded_at": now}
    return list(items)


def prefix_search_candidates(query: str, limit: int = 12) -> List[Dict[str, Any]]:
    q = query.strip()
    if not q.isdigit() or len(q) >= 6:
        return []

    if q.startswith("6"):
        fs = "m:1+t:2,m:1+t:23"
        page_count = 4
    elif q.startswith("3"):
        fs = "m:0+t:80"
        page_count = 4
    elif q.startswith("0"):
        fs = "m:0+t:6"
        page_count = 4
    elif q.startswith(("1", "5")):
        return [item for item in fuzzy_search_universe(q, limit=max(limit * 2, limit)) if item["code"].startswith(q)][:limit]
    else:
        return []

    items = get_prefix_segment_items(fs, "A股", page_count=page_count)
    return [item for item in items if item["code"].startswith(q)][:limit]


def warm_search_cache() -> None:
    try:
        get_prefix_segment_items("m:1+t:2,m:1+t:23", "A股", page_count=4)
    except Exception:
        pass
    try:
        get_prefix_segment_items("m:0+t:6", "A股", page_count=4)
    except Exception:
        pass
    try:
        get_prefix_segment_items("m:0+t:80", "A股", page_count=4)
    except Exception:
        pass
    try:
        get_search_universe()
    except Exception:
        pass


def search_securities(query: str, limit: int = 12) -> List[Dict[str, Any]]:
    query = query.strip()
    if not query:
        return []

    direct_symbol = normalize_query_symbol(query)
    is_exact_code = bool(re.fullmatch(r"\d{6}", query))
    is_exact_symbol = bool(direct_symbol)
    fallback_item = (
        build_search_item(direct_symbol, direct_symbol[2:], direct_symbol.upper(), "Direct")
        if direct_symbol
        else None
    )

    query_variants = [query]
    if direct_symbol and direct_symbol[2:] not in query_variants:
        query_variants.append(direct_symbol[2:])

    seen: set[str] = set()
    results: List[Dict[str, Any]] = []
    for query_text in query_variants:
        params = {
            "input": query_text,
            "type": 14,
            "token": SEARCH_TOKEN,
        }
        payload = http_get_json(f"{SEARCH_BASE}?{urlencode(params)}")
        rows = (payload.get("QuotationCodeTable") or {}).get("Data") or []

        for item in rows:
            code = str(item.get("Code") or "").strip()
            quote_id = str(item.get("QuoteID") or "").strip()
            symbol = quote_id_to_symbol(quote_id, code)
            if not symbol or symbol in seen:
                continue
            seen.add(symbol)
            name = str(item.get("Name") or symbol)
            security_type = str(item.get("SecurityTypeName") or item.get("Classify") or "")
            results.append(build_search_item(symbol, code, name, security_type))
            if len(results) >= max(limit * 2, limit):
                break
        if len(results) >= max(limit * 2, limit):
            break

    if fallback_item and fallback_item["symbol"] not in seen:
        results.insert(0, fallback_item)

    if len(results) < limit and query.isdigit() and len(query) < 6:
        seen_symbols = {str(item.get("symbol") or "").lower() for item in results}
        for item in prefix_search_candidates(query, limit=max(limit * 2, limit)):
            symbol = str(item.get("symbol") or "").lower()
            if not symbol or symbol in seen_symbols:
                continue
            seen_symbols.add(symbol)
            results.append(item)
            if len(results) >= limit:
                break

    fuzzy_keywords = ("etf", "lof", "指数", "黄金", "300", "500", "1000", "中证", "沪深", "上证", "深证", "创业板", "科创")
    should_use_fuzzy = (
        not (is_exact_code or is_exact_symbol or (query.isdigit() and len(query) < 6))
        and (len(results) == 0 or any(keyword in query.lower() for keyword in fuzzy_keywords))
    )
    if len(results) < limit and should_use_fuzzy:
        seen_symbols = {str(item.get("symbol") or "").lower() for item in results}
        for item in fuzzy_search_universe(query, limit=max(limit * 2, limit)):
            symbol = str(item.get("symbol") or "").lower()
            if not symbol or symbol in seen_symbols:
                continue
            seen_symbols.add(symbol)
            results.append(item)
            if len(results) >= max(limit * 2, limit):
                break

    ranked = sorted(results, key=lambda item: (-score_search_result(query, item), str(item.get("code") or "")))
    return ranked[:limit]


def resolve_symbol(raw: str) -> str:
    direct = normalize_query_symbol(raw)
    if direct:
        return direct

    query = raw.strip()
    if re.fullmatch(r"\d{6}", query):
        results = search_securities(query, limit=1)
        if results:
            return results[0]["symbol"]
        if query.startswith(("5", "6", "9")):
            return f"sh{query}"
        return f"sz{query}"

    results = search_securities(query, limit=1)
    if results:
        return results[0]["symbol"]
    raise MarketDataError(f"Could not resolve symbol from query: {raw}")


def normalize_import_query(raw: Any) -> str:
    text = str(raw or "").strip()
    if not text:
        return ""

    direct_match = re.search(r"\b(sh|sz)\s*(\d{6})\b", text, flags=re.IGNORECASE)
    if direct_match:
        return f"{direct_match.group(1).lower()}{direct_match.group(2)}"

    code_match = re.search(r"(?<!\d)(\d{6})(?!\d)", text)
    if code_match:
        return code_match.group(1)

    return text[:64]


def resolve_watchlist_import_item(raw_item: Dict[str, Any]) -> Dict[str, Any]:
    query = normalize_import_query(
        raw_item.get("raw")
        or raw_item.get("symbol")
        or raw_item.get("code")
        or raw_item.get("name")
    )
    if not query:
        raise MarketDataError("Missing security code")

    provided_name = str(raw_item.get("name") or "").strip()
    search_match: Optional[Dict[str, Any]] = None

    try:
        search_results = search_securities(query, limit=6)
    except Exception:
        search_results = []

    if search_results:
        normalized_query = normalize_query_symbol(query)
        if normalized_query:
            search_match = next(
                (item for item in search_results if str(item.get("symbol") or "").lower() == normalized_query),
                None,
            )
        elif re.fullmatch(r"\d{6}", query):
            search_match = next(
                (item for item in search_results if str(item.get("code") or "").strip() == query),
                None,
            )
        if search_match is None:
            search_match = search_results[0]

    if search_match:
        symbol = str(search_match.get("symbol") or "").lower()
        name = provided_name or str(search_match.get("name") or "").strip()
        security_type = str(search_match.get("security_type") or "").strip()
    else:
        symbol = resolve_symbol(query)
        name = provided_name
        security_type = ""

    if not name:
        try:
            snapshot = client.fetch_snapshot(symbol, source=normalize_source_name(DEFAULT_SOURCE))
            name = snapshot.name or symbol.upper()
        except Exception:
            name = symbol.upper()

    return {
        "query": query,
        "symbol": symbol,
        "code": symbol[2:] if len(symbol) > 2 else symbol,
        "name": name,
        "security_type": security_type,
    }


def load_signal_summary(
    symbol: str,
    timeframe: str,
    adjust: str,
    history_bars: int,
    source: str,
) -> Dict[str, Any]:
    config = build_signal_config(timeframe, adjust, history_bars, source)
    result = SignalEngine(config).run([symbol])[0]
    return {
        "signal": result.signal,
        "buy_hits": result.buy_hits,
        "buy_total": result.buy_total,
        "sell_hits": result.sell_hits,
        "sell_total": result.sell_total,
        "buy_matched": result.buy_matched,
        "sell_matched": result.sell_matched,
        "warnings": result.warnings,
    }


def build_signal_config(
    timeframe: str,
    adjust: str,
    history_bars: int,
    source: str,
) -> Dict[str, Any]:
    config = load_runtime_config()
    config["timeframe"] = timeframe
    config["adjust"] = adjust
    config["data_source"] = source
    config["history_bars"] = max(int(config.get("history_bars", 250)), history_bars)
    return config


def build_signal_summary_from_bars(bars: List[Any], config: Dict[str, Any]) -> Dict[str, Any]:
    if len(bars) < 3:
        raise MarketDataError("Not enough bars to evaluate signal rules")

    warnings: List[str] = []
    series = {
        "open": [bar.open for bar in bars],
        "close": [bar.close for bar in bars],
        "high": [bar.high for bar in bars],
        "low": [bar.low for bar in bars],
        "volume": [bar.volume for bar in bars],
        "amount": [bar.amount for bar in bars],
    }

    engine = SignalEngine(config)
    context = engine._build_context(series, warnings)
    rule_context = engine._build_rule_context(context)

    buy_rules = list(config.get("rules", {}).get("buy", []))
    sell_rules = list(config.get("rules", {}).get("sell", []))

    buy_matched, buy_warnings = engine._evaluate_rules(buy_rules, rule_context, side="buy")
    sell_matched, sell_warnings = engine._evaluate_rules(sell_rules, rule_context, side="sell")
    warnings.extend(buy_warnings)
    warnings.extend(sell_warnings)

    all_buy = bool(buy_rules) and len(buy_matched) == len(buy_rules)
    all_sell = bool(sell_rules) and len(sell_matched) == len(sell_rules)

    if all_buy and not all_sell:
        signal = "BUY"
    elif all_sell and not all_buy:
        signal = "SELL"
    elif all_buy and all_sell:
        signal = "CONFLICT"
    else:
        signal = "HOLD"

    return {
        "signal": signal,
        "buy_hits": len(buy_matched),
        "buy_total": len(buy_rules),
        "sell_hits": len(sell_matched),
        "sell_total": len(sell_rules),
        "buy_matched": buy_matched,
        "sell_matched": sell_matched,
        "warnings": warnings,
    }


def build_chart_payload(
    symbol: str,
    timeframe: str,
    adjust: str,
    history_bars: int,
    source: str,
) -> Dict[str, Any]:
    requested_source = normalize_source_name(source)
    name, bars, actual_source = fetch_bars_with_source_cached(
        symbol,
        timeframe,
        history_bars,
        adjust,
        requested_source,
        CHART_CACHE_TTL,
    )
    timestamps = [bar.timestamp for bar in bars]
    closes = [bar.close for bar in bars]
    highs = [bar.high for bar in bars]
    lows = [bar.low for bar in bars]
    volumes = [bar.volume for bar in bars]
    amounts = [bar.amount for bar in bars]

    macd_line, signal_line, hist_line = macd(closes)
    k_line, d_line, j_line = calc_kdj(highs, lows, closes)
    ma5 = sma(closes, 5)
    ma20 = sma(closes, 20)

    previous_close = closes[-2] if len(closes) >= 2 else closes[-1]
    change = closes[-1] - previous_close
    change_pct = (change / previous_close * 100.0) if previous_close else 0.0

    try:
        snapshot = fetch_snapshot_cached(symbol, actual_source, ttl=SNAPSHOT_CACHE_TTL)
    except MarketDataError:
        snapshot = build_snapshot_from_bars(symbol, name, bars, actual_source)

    signal_config = build_signal_config(timeframe, adjust, history_bars, actual_source)
    signal_summary = build_signal_summary_from_bars(bars, signal_config)

    return {
        "symbol": symbol,
        "name": name,
        "timeframe": timeframe,
        "adjust": adjust,
        "source": build_source_info(requested_source, actual_source),
        "last_timestamp": timestamps[-1],
        "last_price": round(closes[-1], 3),
        "change": round(change, 4),
        "change_pct": round(change_pct, 4),
        "market": serialize_snapshot(snapshot, fallback_timestamp=timestamps[-1]),
        "signal": signal_summary,
        "chart": {
            "timestamps": timestamps,
            "candles": [
                [round(bar.open, 4), round(bar.close, 4), round(bar.low, 4), round(bar.high, 4)]
                for bar in bars
            ],
            "volumes": [round(value, 2) for value in volumes],
            "amounts": [round(value, 2) for value in amounts],
        },
        "indicators": {
            "ma5": round_series(ma5),
            "ma20": round_series(ma20),
            "macd": {
                "dif": round_series(macd_line),
                "dea": round_series(signal_line),
                "hist": round_series(hist_line),
            },
            "kdj": {
                "k": round_series(k_line),
                "d": round_series(d_line),
                "j": round_series(j_line),
            },
        },
    }


@app.get("/")
def index() -> str:
    return render_template(
        "index.html",
        default_symbol=DEFAULT_SYMBOL,
        default_timeframe=DEFAULT_TIMEFRAME,
        default_source=DEFAULT_SOURCE,
        default_strategy=DEFAULT_STRATEGY,
    )


@app.get("/api/health")
def health() -> Any:
    with RESPONSE_CACHE_LOCK:
        cache_entries = len(RESPONSE_CACHE)
    return jsonify(
        {
            "status": "ok",
            "cache_entries": cache_entries,
            "source_health": SOURCE_HEALTH_TRACKER.snapshot(),
        }
    )


@app.get("/api/sources")
def api_sources() -> Any:
    sources = []
    for key, item in SOURCE_METADATA.items():
        sources.append(
            {
                "value": key,
                "label": item["label"],
                "description": item["description"],
                "supports_bars": item["supports_bars"],
                "supports_snapshot": item["supports_snapshot"],
            }
        )
    return jsonify({"default": DEFAULT_SOURCE, "sources": sources})


@app.get("/api/rules")
def api_rules() -> Any:
    strategy = request.args.get("strategy", DEFAULT_STRATEGY)
    try:
        return jsonify(build_rules_payload(strategy))
    except MarketDataError as exc:
        return jsonify({"error": str(exc)}), 400


@app.get("/api/strategies")
def api_strategies() -> Any:
    return jsonify(build_strategy_list_payload())


@app.post("/api/custom-strategy")
def api_custom_strategy() -> Any:
    try:
        payload = request.get_json(silent=True) or {}
        strategy = parse_custom_strategy_rule(str(payload.get("rule") or ""))
        with CUSTOM_STRATEGY_LOCK:
            strategies = load_custom_strategies()
            strategies[strategy["id"]] = strategy
            save_custom_strategies(strategies)
        clear_response_cache("strategy")
        return jsonify(
            {
                "strategy": strategy,
                "strategies": build_strategy_list_payload()["strategies"],
                "rules": build_rules_payload(strategy["id"]),
            }
        )
    except MarketDataError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": str(exc)}), 500


@app.delete("/api/custom-strategy/<strategy_id>")
def api_delete_custom_strategy(strategy_id: str) -> Any:
    strategy_id = str(strategy_id or "").strip().lower()
    if strategy_id == "none":
        return jsonify({"error": "不启用不能删除"}), 400
    try:
        with CUSTOM_STRATEGY_LOCK:
            strategies = load_custom_strategies()
            deleted = load_deleted_strategy_ids()
            if strategy_id in strategies:
                removed = strategies.pop(strategy_id)
            elif strategy_id in STRATEGY_PRESETS:
                removed = copy.deepcopy(STRATEGY_PRESETS[strategy_id])
                deleted.add(strategy_id)
            else:
                return jsonify({"error": "规则不存在"}), 404
            save_strategy_store(strategies, deleted)
        clear_response_cache("strategy")
        return jsonify(
            {
                "ok": True,
                "removed": removed,
                "default": DEFAULT_STRATEGY,
                "strategies": build_strategy_list_payload()["strategies"],
                "rules": build_rules_payload(DEFAULT_STRATEGY),
            }
        )
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": str(exc)}), 500


@app.get("/api/search")
def api_search() -> Any:
    query = request.args.get("q", "").strip()
    try:
        return jsonify({"results": search_securities(query)})
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": str(exc), "results": []}), 400


@app.post("/api/watchlist-import")
def api_watchlist_import() -> Any:
    try:
        payload = request.get_json(silent=True) or {}
        raw_items = payload.get("items") or []
        if not isinstance(raw_items, list):
            raise MarketDataError("items must be a list")

        ordered_requests: List[Dict[str, Any]] = []
        seen_queries: set[str] = set()
        for raw_item in raw_items[:200]:
            item = raw_item if isinstance(raw_item, dict) else {"raw": raw_item}
            query = normalize_import_query(
                item.get("raw")
                or item.get("symbol")
                or item.get("code")
                or item.get("name")
            )
            if not query:
                continue
            lowered = query.lower()
            if lowered in seen_queries:
                continue
            seen_queries.add(lowered)
            ordered_requests.append(
                {
                    "raw": query,
                    "name": str(item.get("name") or "").strip(),
                }
            )

        if not ordered_requests:
            return jsonify({"items": [], "errors": [], "summary": {"total": 0, "resolved": 0, "failed": 0}})

        def resolve_one(item: Dict[str, Any]) -> Dict[str, Any]:
            result = resolve_watchlist_import_item(item)
            result["requested_query"] = str(item.get("raw") or "").lower()
            return result

        items: List[Dict[str, Any]] = []
        errors: List[Dict[str, str]] = []
        max_workers = min(6, len(ordered_requests)) or 1
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_map = {executor.submit(resolve_one, item): item for item in ordered_requests}
            for future in as_completed(future_map):
                item = future_map[future]
                try:
                    items.append(future.result())
                except Exception as exc:  # noqa: BLE001
                    errors.append({"query": str(item.get("raw") or ""), "error": str(exc)})

        order_index = {
            str(item.get("raw") or "").lower(): index for index, item in enumerate(ordered_requests)
        }
        items.sort(key=lambda item: order_index.get(str(item.get("requested_query") or ""), len(order_index)))
        for item in items:
            item.pop("requested_query", None)
        errors.sort(key=lambda item: order_index.get(str(item.get("query") or "").lower(), len(order_index)))
        return jsonify(
            {
                "items": items,
                "errors": errors,
                "summary": {
                    "total": len(ordered_requests),
                    "resolved": len(items),
                    "failed": len(errors),
                },
            }
        )
    except MarketDataError as exc:
        return jsonify({"error": str(exc), "items": [], "errors": []}), 400
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": str(exc), "items": [], "errors": []}), 500


@app.get("/api/chart")
def api_chart() -> Any:
    raw_symbol = request.args.get("symbol", DEFAULT_SYMBOL)
    timeframe = request.args.get("timeframe", DEFAULT_TIMEFRAME)
    adjust = request.args.get("adjust", DEFAULT_ADJUST)
    source = request.args.get("source", DEFAULT_SOURCE)
    bars = int(request.args.get("bars", "240"))
    bars = max(80, min(bars, 1200))

    try:
        symbol = resolve_symbol(raw_symbol)
        payload = build_chart_payload_cached(symbol, timeframe, adjust, bars, source)
        return jsonify(payload)
    except MarketDataError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": str(exc)}), 500


@app.get("/api/quote")
def api_quote() -> Any:
    raw_symbol = request.args.get("symbol", DEFAULT_SYMBOL)
    source = request.args.get("source", DEFAULT_SOURCE)
    try:
        requested_source = normalize_source_name(source)
        symbol = resolve_symbol(raw_symbol)
        snapshot = fetch_snapshot_cached(symbol, requested_source, ttl=SNAPSHOT_CACHE_TTL)
        return jsonify(
            {
                "symbol": symbol,
                "source": build_source_info(requested_source, snapshot.source),
                "market": serialize_snapshot(snapshot),
            }
        )
    except MarketDataError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": str(exc)}), 500


@app.get("/api/strategy-signal")
def api_strategy_signal() -> Any:
    raw_symbol = request.args.get("symbol", DEFAULT_SYMBOL)
    strategy_name = request.args.get("strategy", DEFAULT_STRATEGY)
    source = request.args.get("source", DEFAULT_SOURCE)
    try:
        symbol = resolve_symbol(raw_symbol)
        return jsonify(build_strategy_signal_payload_cached(symbol, strategy_name, source))
    except MarketDataError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": str(exc)}), 500


@app.get("/api/watchlist-quotes")
def api_watchlist_quotes() -> Any:
    raw_symbols = request.args.get("symbols", "")
    source = request.args.get("source", DEFAULT_SOURCE)
    try:
        return jsonify(build_watchlist_quotes_payload(raw_symbols, source))
    except MarketDataError as exc:
        return jsonify({"error": str(exc), "quotes": [], "errors": []}), 400
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": str(exc), "quotes": [], "errors": []}), 500


@app.get("/api/watchlist-strategy-signals")
def api_watchlist_strategy_signals() -> Any:
    raw_symbols = request.args.get("symbols", "")
    strategy_name = request.args.get("strategy", DEFAULT_STRATEGY)
    source = request.args.get("source", DEFAULT_SOURCE)
    try:
        return jsonify(build_watchlist_strategy_signals_payload(raw_symbols, strategy_name, source))
    except MarketDataError as exc:
        return jsonify({"error": str(exc), "signals": [], "errors": []}), 400
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": str(exc), "signals": [], "errors": []}), 500


@app.get("/api/dashboard-pulse")
def api_dashboard_pulse() -> Any:
    raw_symbol = request.args.get("symbol", DEFAULT_SYMBOL)
    timeframe = request.args.get("timeframe", DEFAULT_TIMEFRAME)
    adjust = request.args.get("adjust", DEFAULT_ADJUST)
    source = request.args.get("source", DEFAULT_SOURCE)
    strategy_name = request.args.get("strategy", DEFAULT_STRATEGY)
    raw_watchlist_symbols = request.args.get("symbols", "")
    include_chart = request.args.get("include_chart", "0") == "1"
    include_watchlist_signals = request.args.get("include_watchlist_signals", "0") == "1"
    bars = int(request.args.get("bars", "260"))
    bars = max(80, min(bars, 1200))

    try:
        symbol = resolve_symbol(raw_symbol)
        payload = build_dashboard_pulse_payload_cached(
            symbol,
            timeframe,
            adjust,
            bars,
            source,
            strategy_name,
            raw_watchlist_symbols,
            include_chart=include_chart,
            include_watchlist_signals=include_watchlist_signals,
        )
        return jsonify(payload)
    except MarketDataError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": str(exc)}), 500


def webhook_provider_for_url(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    path = parsed.path.lower()
    if "qyapi.weixin.qq.com" in host and "/cgi-bin/webhook/send" in path:
        return "wecom"
    return "generic"


def format_webhook_number(value: Any, digits: int = 3, signed: bool = False, suffix: str = "") -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return ""
    sign = "+" if signed and number > 0 else ""
    return f"{sign}{number:.{digits}f}{suffix}"


def format_webhook_timestamp(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return time.strftime("%Y-%m-%d %H:%M:%S")
    return text.replace("T", " ").replace("Z", "")


def build_wecom_text_content(payload: Dict[str, Any]) -> str:
    signal = str(payload.get("signal") or "TEST").strip().upper() or "TEST"
    symbol = str(payload.get("symbol") or "").strip().upper()
    name = str(payload.get("name") or "").strip()
    strategy = str(payload.get("strategy_label") or payload.get("strategy") or "").strip()
    source = str(payload.get("source") or "").strip()
    reason = str(payload.get("reason") or "").strip()
    timestamp = format_webhook_timestamp(payload.get("timestamp"))
    price = format_webhook_number(payload.get("price"), digits=3)
    change_value = format_webhook_number(payload.get("change"), digits=3, signed=True)
    change_pct = format_webhook_number(payload.get("change_pct"), digits=2, signed=True, suffix="%")

    lines = [f"Signal Deck {signal}"]
    if symbol or name:
        lines.append(f"Symbol: {' '.join(part for part in [symbol, name] if part)}")
    if strategy:
        lines.append(f"Strategy: {strategy}")
    if price or change_value or change_pct:
        change_parts = [part for part in [change_value, change_pct] if part]
        line_parts = []
        if price:
            line_parts.append(f"Price: {price}")
        if change_parts:
            line_parts.append(f"Change: {' / '.join(change_parts)}")
        lines.append(" | ".join(line_parts))
    if source:
        lines.append(f"Source: {source}")
    lines.append(f"Time: {timestamp}")
    if reason:
        lines.append(f"Reason: {reason}")
    return "\n".join(lines)


def prepare_webhook_request_payload(url: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    provider = webhook_provider_for_url(url)
    if provider == "wecom":
        if isinstance(payload.get("msgtype"), str) and payload.get("msgtype"):
            return payload
        return {
            "msgtype": "text",
            "text": {
                "content": build_wecom_text_content(payload),
            },
        }
    return payload


def extract_webhook_response_error(response_body: str) -> Optional[str]:
    text = str(response_body or "").strip()
    if not text:
        return None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None

    errcode = data.get("errcode")
    if errcode in {None, 0, "0", ""}:
        return None

    errmsg = str(data.get("errmsg") or data.get("error") or "Webhook returned an error").strip()
    return f"{errmsg} (errcode {errcode})"


@app.post("/api/webhook-alert")
def api_webhook_alert() -> Any:
    data = request.get_json(silent=True) or {}
    url = str(data.get("url") or "").strip()
    payload = data.get("payload")
    provider = webhook_provider_for_url(url)
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return jsonify({"error": "Webhook URL 无效"}), 400
    if not isinstance(payload, dict):
        return jsonify({"error": "Webhook payload 无效"}), 400

    request_payload = prepare_webhook_request_payload(url, payload)
    body = json.dumps(request_payload, ensure_ascii=False).encode("utf-8")
    req = Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": "SignalDeckWebhook/1.0",
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=10) as resp:
            response_body = resp.read(2048).decode("utf-8", errors="ignore")
            response_error = extract_webhook_response_error(response_body)
            if response_error:
                return jsonify({"error": response_error, "status": resp.status, "body": response_body}), 502
            return jsonify({"ok": True, "status": resp.status, "body": response_body, "provider": provider})
    except HTTPError as exc:
        response_body = exc.read(2048).decode("utf-8", errors="ignore")
        response_error = extract_webhook_response_error(response_body)
        return jsonify(
            {
                "error": response_error or response_body or str(exc),
                "status": exc.code,
                "body": response_body,
            }
        ), 502
    except URLError as exc:
        return jsonify({"error": str(exc.reason or exc)}), 502
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": str(exc)}), 502


if __name__ == "__main__":
    warm_search_cache()
    try:
        from waitress import serve
    except ImportError:
        app.run(host=DEFAULT_HOST, port=DEFAULT_PORT, debug=False)
    else:
        serve(app, host=DEFAULT_HOST, port=DEFAULT_PORT, threads=8)
