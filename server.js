const fs = require("fs");
const http = require("http");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = process.pkg ? path.dirname(process.execPath) : __dirname;
const HOME = os.homedir();
const PORT = Number(process.env.PORT || 5188);
const PRICING_FILE = path.join(ROOT, "pricing.json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const PRODUCT_SCANNER_NAME = "Token Ledger Scanner";
const TOOL_NAMES = {
  "claude-code": "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  openclaw: "OpenClaw",
  hermes: "Hermes",
};

const DEFAULT_PRICE = { input: 0.5, cache: 0.05, cacheWrite: 0.5, output: 2 };
const FALLBACK_PRICES = [
  { model: "gpt-5.5", match: "^gpt-5\\.5", input: 5, cache: 0.5, output: 30 },
  { model: "gpt-5.4", match: "^gpt-5\\.4", input: 2.5, cache: 0.25, output: 15 },
  { model: "MiniMax-M2.7", match: "^MiniMax-M2\\.7", input: 0.3, cache: 0.06, cacheWrite: 0.375, output: 1.2 },
];

function loadPricingTable() {
  let rows = FALLBACK_PRICES;
  try {
    const parsed = JSON.parse(fs.readFileSync(PRICING_FILE, "utf8"));
    if (Array.isArray(parsed) && parsed.length) rows = parsed;
  } catch {
    rows = FALLBACK_PRICES;
  }
  return rows
    .filter((row) => row && row.match)
    .map((row) => ({
      ...row,
      matchRegex: new RegExp(row.match, "i"),
    }));
}

const PRICE_TABLE = loadPricingTable();

function priceForModel(model, inputTokens = 0) {
  const name = String(model || "");
  const found = PRICE_TABLE.find((price) => price.matchRegex.test(name));
  if (!found) return DEFAULT_PRICE;
  if (found.longInput && safeNumber(inputTokens) > safeNumber(found.longInputThreshold || 200_000)) {
    return {
      input: found.longInput,
      cache: found.longCache,
      cacheWrite: found.longCache,
      output: found.longOutput,
    };
  }
  return found;
}

function estimatedCost(model, inputTokens, cacheReadTokens, outputTokens, cacheWriteTokens = 0) {
  const price = priceForModel(model, inputTokens);
  return (
    (safeNumber(inputTokens) / 1_000_000) * price.input +
    (safeNumber(cacheReadTokens) / 1_000_000) * price.cache +
    (safeNumber(cacheWriteTokens) / 1_000_000) * (price.cacheWrite || price.cache) +
    (safeNumber(outputTokens) / 1_000_000) * price.output
  );
}

function safeNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function timestampMs(value) {
  if (!value) return 0;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.getTime();
  const number = safeNumber(value);
  if (!number) return 0;
  return number > 10_000_000_000 ? number : number * 1000;
}

function dayFromTimestamp(value) {
  const ms = timestampMs(value);
  if (!ms) return null;
  const date = new Date(ms);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function dayFromUnixSeconds(value) {
  const seconds = safeNumber(value);
  if (!seconds) return null;
  return dayFromTimestamp(seconds * 1000);
}

function dayFromCompactSessionId(value) {
  const match = /^(\d{4})(\d{2})(\d{2})_/.exec(String(value || ""));
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function walk(dir, predicate, limit = 5000) {
  const files = [];
  const stack = [dir];
  while (stack.length && files.length < limit) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".git")) stack.push(full);
      } else if (predicate(full)) {
        files.push(full);
      }
    }
  }
  return files;
}

function readJsonLines(file, visitor) {
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return { lines: 0, parsed: 0 };
  }
  let parsed = 0;
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      visitor(JSON.parse(line), file);
      parsed += 1;
    } catch {
      // Ignore malformed lines; logs can be partially written.
    }
  }
  return { lines: lines.length, parsed };
}

function usageTotal(usage) {
  if (!usage || typeof usage !== "object") return 0;
  if (usage.total_tokens) return safeNumber(usage.total_tokens);
  return (
    safeNumber(usage.input_tokens) +
    safeNumber(usage.cache_creation_input_tokens) +
    safeNumber(usage.cache_read_input_tokens) +
    safeNumber(usage.cached_input_tokens) +
    safeNumber(usage.output_tokens) +
    safeNumber(usage.reasoning_output_tokens)
  );
}

function usageRecord({
  tool,
  model,
  date,
  tokens,
  normalizedTokens,
  inputTokens,
  cacheTokens,
  cacheReadTokens,
  cacheWriteTokens,
  outputTokens,
  timestamp,
}) {
  const cleanInput = safeNumber(inputTokens);
  const cleanCacheRead = safeNumber(cacheReadTokens);
  const cleanCacheWrite = safeNumber(cacheWriteTokens);
  const cleanCache = safeNumber(cacheTokens) || cleanCacheRead + cleanCacheWrite;
  const cleanOutput = safeNumber(outputTokens);
  const cleanTokens = safeNumber(tokens) || cleanInput + cleanCache + cleanOutput;
  return {
    tool,
    model,
    date,
    tokens: cleanTokens,
    normalizedTokens: safeNumber(normalizedTokens) || cleanInput + cleanOutput,
    inputTokens: cleanInput,
    cacheTokens: cleanCache,
    cacheReadTokens: cleanCacheRead || cleanCache,
    cacheWriteTokens: cleanCacheWrite,
    outputTokens: cleanOutput,
    timestampMs: timestampMs(timestamp),
    cost: estimatedCost(model, cleanInput, cleanCacheRead || cleanCache, cleanOutput, cleanCacheWrite),
  };
}

function usageEvent({
  tool,
  model,
  date,
  tokens,
  normalizedTokens,
  inputTokens,
  cacheTokens,
  cacheReadTokens,
  cacheWriteTokens,
  outputTokens,
  sessionId,
  requestId,
  messageId,
  status,
  sourceFile,
  sourceKind,
  timestamp,
}) {
  const record = usageRecord({
    tool,
    model,
    date,
    tokens,
    normalizedTokens,
    inputTokens,
    cacheTokens,
    cacheReadTokens,
    cacheWriteTokens,
    outputTokens,
    timestamp,
  });
  const identity = requestId || messageId || "";
  const fallback = [
    tool,
    sessionId || "",
    model || "",
    date || "",
    record.inputTokens,
    record.cacheTokens,
    record.outputTokens,
    record.tokens,
  ].join("|");
  return {
    ...record,
    sessionId: sessionId || "",
    requestId: requestId || "",
    messageId: messageId || "",
    status: status || "unknown",
    sourceFile: sourceFile || "",
    sourceKind: sourceKind || "primary",
    dedupeKey: identity ? [tool, sessionId || "", identity, model || "", record.tokens].join("|") : fallback,
  };
}

function createScanStats(extra = {}) {
  return {
    dateRule: "按日志事件 timestamp 转本机本地日期归属",
    tokenRule: "有效调用 token = input + cache + output；优先使用日志里的 total_tokens",
    dedupeRule: "同一来源文件内按模型和 token 组成去重，避免重复快照重复累加",
    skipped: {},
    ...extra,
  };
}

function addSkip(stats, reason, count = 1) {
  stats.skipped[reason] = (stats.skipped[reason] || 0) + count;
}

function summarizeRecordDiagnostics(source) {
  const records = Array.isArray(source.records) ? source.records.filter((record) => record.date && record.tokens) : [];
  const byDay = new Map();
  const byFile = new Map();
  const byKind = new Map();

  for (const record of records) {
    const day = byDay.get(record.date) || { date: record.date, records: 0, tokens: 0, files: new Set() };
    day.records += 1;
    day.tokens += record.tokens;
    if (record.sourceFile) day.files.add(record.sourceFile);
    byDay.set(record.date, day);

    if (record.sourceFile) {
      const file = byFile.get(record.sourceFile) || {
        file: record.sourceFile,
        name: path.basename(record.sourceFile),
        records: 0,
        tokens: 0,
      };
      file.records += 1;
      file.tokens += record.tokens;
      byFile.set(record.sourceFile, file);
    }

    const kind = record.sourceKind || "primary";
    byKind.set(kind, (byKind.get(kind) || 0) + 1);
  }

  return {
    dateRule: source.diagnostics?.dateRule || "按日志事件 timestamp 转本机本地日期归属",
    tokenRule: source.diagnostics?.tokenRule || "读取用量元数据，不解析代码或对话正文",
    dedupeRule: source.diagnostics?.dedupeRule || "按请求、消息或 token 组成去重",
    skipped: source.diagnostics?.skipped || {},
    sourceKinds: [...byKind.entries()].map(([name, records]) => ({ name, records })),
    recentDays: [...byDay.values()]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10)
      .map((day) => ({
        date: day.date,
        records: day.records,
        tokens: day.tokens,
        files: day.files.size,
      })),
    topFiles: [...byFile.values()]
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 8)
      .map((file) => ({
        name: file.name,
        records: file.records,
        tokens: file.tokens,
      })),
  };
}

function canonicalOpenClawSessionFile(file) {
  let name = path.basename(file);
  name = name.replace(/\.jsonl\.reset\..*$/, ".jsonl");
  name = name.replace(/\.jsonl\.deleted\..*$/, ".jsonl");
  name = name.replace(/\.checkpoint\.[^.]+(?=\.jsonl$)/, "");
  return path.join(path.dirname(file), name);
}

function openClawSourceKind(file) {
  if (/\.jsonl\.reset\./.test(file)) return "reset";
  if (/\.jsonl\.deleted\./.test(file)) return "deleted-archive";
  if (/\.checkpoint\./.test(file)) return "checkpoint";
  return "primary";
}

function jsonlUsageTotal(file) {
  let total = 0;
  readJsonLines(file, (entry) => {
    const message = entry.message && typeof entry.message === "object" ? entry.message : entry;
    const usage = message.usage || entry.usage;
    if (!usage || typeof usage !== "object") return;
    const inputTokens = safeNumber(usage.input ?? usage.inputTokens ?? usage.input_tokens);
    const outputTokens = safeNumber(usage.output ?? usage.outputTokens ?? usage.output_tokens);
    const cacheTokens =
      safeNumber(usage.cacheRead ?? usage.cache_read ?? usage.cacheReadTokens ?? usage.cache_read_input_tokens) +
      safeNumber(usage.cacheWrite ?? usage.cache_write ?? usage.cacheWriteTokens ?? usage.cache_creation_input_tokens);
    total += safeNumber(usage.total ?? usage.totalTokens ?? usage.total_tokens) || inputTokens + outputTokens + cacheTokens;
  });
  return total;
}

function chooseOpenClawSessionFiles(files) {
  const groups = new Map();
  for (const file of files) {
    const key = canonicalOpenClawSessionFile(file);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(file);
  }

  const chosen = [];
  for (const groupFiles of groups.values()) {
    const byKind = {
      primary: groupFiles.filter((file) => openClawSourceKind(file) === "primary"),
      reset: groupFiles.filter((file) => openClawSourceKind(file) === "reset"),
      checkpoint: groupFiles.filter((file) => openClawSourceKind(file) === "checkpoint"),
      deletedArchive: groupFiles.filter((file) => openClawSourceKind(file) === "deleted-archive"),
    };
    if (byKind.primary.length) {
      chosen.push(...byKind.primary);
      continue;
    }
    if (byKind.reset.length) {
      chosen.push(
        byKind.reset.sort((a, b) => {
          const aTime = /\.jsonl\.reset\.(.*)$/.exec(a)?.[1] || "";
          const bTime = /\.jsonl\.reset\.(.*)$/.exec(b)?.[1] || "";
          return bTime.localeCompare(aTime);
        })[0],
      );
      continue;
    }
    if (byKind.checkpoint.length) {
      chosen.push(
        byKind.checkpoint
          .map((file) => ({ file, total: jsonlUsageTotal(file) }))
          .sort((a, b) => b.total - a.total)[0].file,
      );
      continue;
    }
    if (byKind.deletedArchive.length) {
      chosen.push(
        byKind.deletedArchive
          .map((file) => ({
            file,
            total: jsonlUsageTotal(file),
            mtime: fs.statSync(file).mtimeMs || 0,
          }))
          .sort((a, b) => b.total - a.total || b.mtime - a.mtime)[0].file,
      );
    }
  }
  return chosen;
}

function openAiStyleUsageParts(usage) {
  const promptTokens = safeNumber(usage.prompt_tokens || usage.input_tokens);
  const outputTokens =
    safeNumber(usage.completion_tokens || usage.output_tokens) +
    safeNumber(usage.reasoning_output_tokens || usage.completion_thinking_tokens);
  const promptDetails = usage.prompt_tokens_details || {};
  const cacheReadTokens =
    safeNumber(promptDetails.cached_tokens) ||
    safeNumber(usage.prompt_cache_hit_tokens) ||
    safeNumber(usage.cache_read_input_tokens) ||
    safeNumber(usage.cached_input_tokens);
  const cacheWriteTokens =
    safeNumber(usage.prompt_cache_write_tokens) ||
    safeNumber(usage.cache_creation_input_tokens) ||
    safeNumber(promptDetails.cache_creation_input_tokens);
  const explicitMiss = safeNumber(usage.prompt_cache_miss_tokens);
  const inputTokens =
    explicitMiss || Math.max(0, promptTokens - cacheReadTokens - cacheWriteTokens);
  return {
    inputTokens,
    outputTokens,
    cacheTokens: cacheReadTokens + cacheWriteTokens,
    cacheReadTokens,
    cacheWriteTokens,
    tokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
  };
}

function usageFingerprint(record, windowMs = 5 * 60 * 1000) {
  const bucket = record.timestampMs ? Math.floor(record.timestampMs / windowMs) : record.date || "";
  return [
    record.tool,
    String(record.model || "").toLowerCase(),
    bucket,
    record.inputTokens,
    record.cacheReadTokens,
    record.cacheWriteTokens,
    record.outputTokens,
    record.tokens,
  ].join("|");
}

function sqliteJson(dbFile, sql) {
  if (!fs.existsSync(dbFile)) return [];
  try {
    const stdout = execFileSync("sqlite3", ["-json", dbFile, sql], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      timeout: 20_000,
    });
    const parsed = JSON.parse(stdout || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function claudeUsage() {
  const root = path.join(HOME, ".claude", "projects");
  const files = walk(root, (file) => file.endsWith(".jsonl"), 12000);
  const records = [];
  const seen = new Set();
  let parsedLines = 0;
  const diagnostics = createScanStats({
    tokenRule: "读取 Claude Code assistant message.usage",
    dedupeRule: "按 requestId + messageId + total tokens 去重",
  });

  for (const file of files) {
    const stat = readJsonLines(file, (entry) => {
      if (entry.type !== "assistant") {
        addSkip(diagnostics, "non_assistant_line");
        return;
      }
      const usage = entry.message && entry.message.usage;
      const tokens = usageTotal(usage);
      if (!tokens) {
        addSkip(diagnostics, "missing_usage");
        return;
      }
      const messageId = entry.message && entry.message.id;
      const key = [entry.requestId || "", messageId || "", tokens].join("|");
      if (seen.has(key)) {
        addSkip(diagnostics, "duplicate_request_message");
        return;
      }
      seen.add(key);
      records.push(usageEvent({
        tool: "Claude Code",
        model: (entry.message && entry.message.model) || "claude-unknown",
        date: dayFromTimestamp(entry.timestamp),
        tokens,
        inputTokens: safeNumber(usage.input_tokens),
        cacheTokens:
          safeNumber(usage.cache_creation_input_tokens) +
          safeNumber(usage.cache_read_input_tokens),
        cacheReadTokens: safeNumber(usage.cache_read_input_tokens),
        cacheWriteTokens: safeNumber(usage.cache_creation_input_tokens),
        outputTokens: safeNumber(usage.output_tokens) + safeNumber(usage.reasoning_output_tokens),
        sessionId: entry.sessionId || "",
        requestId: entry.requestId || "",
        messageId: messageId || "",
        status: "assistant",
        sourceFile: file,
        sourceKind: "primary",
        timestamp: entry.timestamp,
      }));
    });
    parsedLines += stat.parsed;
  }

  return {
    id: "claude",
    name: "Claude Code",
    source: "~/.claude/projects/**/*.jsonl",
    files: files.length,
    parsedLines,
    records,
    diagnostics,
  };
}

function codexSessionFiles() {
  const current = walk(path.join(HOME, ".codex", "sessions"), (file) => file.endsWith(".jsonl"), 20000);
  const byName = new Map(current.map((file) => [path.basename(file), file]));
  const archived = walk(
    path.join(HOME, ".codex", "archived_sessions"),
    (file) => file.endsWith(".jsonl"),
    20000,
  );
  for (const file of archived) {
    if (!byName.has(path.basename(file))) byName.set(path.basename(file), file);
  }
  return [...byName.values()];
}

function codexUsage() {
  const files = codexSessionFiles();
  const records = [];
  let parsedLines = 0;
  const diagnostics = createScanStats({
    tokenRule: "读取 Codex event_msg token_count.info.last_token_usage",
    dedupeRule: "同一会话文件内按 model + input + cache + output + reasoning + total 去重",
  });

  for (const file of files) {
    let currentModel = "codex-unknown";
    const seenTokenCounts = new Set();
    const stat = readJsonLines(file, (entry) => {
      if (entry.type === "session_meta" && entry.payload && entry.payload.model) {
        currentModel = entry.payload.model;
        return;
      }
      if (entry.type === "turn_context") {
        const payload = entry.payload || {};
        currentModel =
          payload.model ||
          (payload.collaboration_mode &&
            payload.collaboration_mode.settings &&
            payload.collaboration_mode.settings.model) ||
          currentModel;
        return;
      }
      if (entry.type !== "event_msg") {
        addSkip(diagnostics, "non_event_line");
        return;
      }
      const payload = entry.payload || {};
      if (payload.type !== "token_count") {
        addSkip(diagnostics, "non_token_count_event");
        return;
      }
      const usage = payload.info && payload.info.last_token_usage;
      const tokens = usageTotal(usage);
      if (!tokens) {
        addSkip(diagnostics, "missing_last_token_usage");
        return;
      }
      const dedupeKey = [
        currentModel,
        safeNumber(usage.input_tokens),
        safeNumber(usage.cached_input_tokens),
        safeNumber(usage.output_tokens),
        safeNumber(usage.reasoning_output_tokens),
        safeNumber(usage.total_tokens),
      ].join("|");
      if (seenTokenCounts.has(dedupeKey)) {
        addSkip(diagnostics, "duplicate_token_snapshot");
        return;
      }
      seenTokenCounts.add(dedupeKey);
      records.push(usageEvent({
        tool: "Codex",
        model: currentModel,
        date: dayFromTimestamp(entry.timestamp),
        tokens,
        inputTokens: Math.max(0, safeNumber(usage.input_tokens) - safeNumber(usage.cached_input_tokens)),
        cacheTokens: safeNumber(usage.cached_input_tokens),
        cacheReadTokens: safeNumber(usage.cached_input_tokens),
        outputTokens: safeNumber(usage.output_tokens) + safeNumber(usage.reasoning_output_tokens),
        sessionId: path.basename(file, ".jsonl"),
        requestId: payload.info && payload.info.request_id,
        messageId: "",
        status: "token_count",
        sourceFile: file,
        sourceKind: "primary",
        timestamp: entry.timestamp,
      }));
    });
    parsedLines += stat.parsed;
  }

  return {
    id: "codex",
    name: "Codex",
    source: "~/.codex/sessions/**/*.jsonl + archived_sessions",
    files: files.length,
    parsedLines,
    records,
    diagnostics,
  };
}

function openClawUsage() {
  const sessionRoot = path.join(HOME, ".openclaw", "agents");
  const allSessionFiles = walk(
    sessionRoot,
    (file) =>
      (file.endsWith(".jsonl") || /\.jsonl\.reset\./.test(file) || /\.jsonl\.deleted\./.test(file)) &&
      file.includes(`${path.sep}sessions${path.sep}`) &&
      !path.basename(file).startsWith("probe-"),
    20000,
  );
  const sessionFiles = chooseOpenClawSessionFiles(allSessionFiles);
  const roots = [
    path.join(HOME, "Library", "Logs", "QClaw"),
    path.join(HOME, "AppData", "Roaming", "QClaw", "logs"),
  ];
  const logFiles = roots.flatMap((root) =>
    walk(root, (file) => /\.(log|txt)$/i.test(file) && !file.includes(`${path.sep}node_modules${path.sep}`), 2000),
  );
  const records = [];
  const seen = new Set();
  const seenFingerprints = new Set();
  let parsedLines = 0;
  const diagnostics = createScanStats({
    tokenRule: "读取 OpenClaw session message.usage 和 QClaw [LLM] RESP usage；session 总量按 input + cacheRead + cacheWrite + output 计算",
    dedupeRule: "会话版本优先 primary，其次最新 reset，再取最大 checkpoint；再按 request/message 和 5 分钟调用指纹跨来源去重",
  });
  addSkip(diagnostics, "superseded_session_version", allSessionFiles.length - sessionFiles.length);

  const addRecord = (record) => {
    if (!record.date || !record.tokens) {
      addSkip(diagnostics, "missing_date_or_tokens");
      return;
    }
    const key = record.dedupeKey || [
      record.tool,
      record.date,
      record.model,
      record.inputTokens,
      record.cacheTokens,
      record.outputTokens,
      record.tokens,
    ].join("|");
    if (seen.has(key)) {
      addSkip(diagnostics, "duplicate_usage_record");
      return;
    }
    seen.add(key);
    const fingerprint = usageFingerprint(record);
    if (seenFingerprints.has(fingerprint)) {
      addSkip(diagnostics, "duplicate_usage_fingerprint");
      return;
    }
    seenFingerprints.add(fingerprint);
    records.push(record);
  };

  for (const file of sessionFiles) {
    let currentSessionId = path.basename(canonicalOpenClawSessionFile(file), ".jsonl");
    const sourceKind = openClawSourceKind(file);
    const stat = readJsonLines(file, (entry) => {
      if (entry.type === "session" && entry.id) {
        currentSessionId = entry.id;
      }
      const message = entry.message && typeof entry.message === "object" ? entry.message : entry;
      const usage = message.usage || entry.usage;
      if (!usage || typeof usage !== "object") {
        addSkip(diagnostics, "missing_usage");
        return;
      }
      const status = message.stopReason || entry.stopReason || "unknown";
      if (["error", "failed", "fail", "cancelled", "canceled", "aborted", "interrupted"].includes(String(status).toLowerCase())) {
        addSkip(diagnostics, "error_status");
        return;
      }
      const rawInputTokens = safeNumber(usage.input ?? usage.inputTokens ?? usage.input_tokens);
      const outputTokens = safeNumber(usage.output ?? usage.outputTokens ?? usage.output_tokens);
      const cacheTokens =
        safeNumber(usage.cacheRead ?? usage.cache_read ?? usage.cacheReadTokens ?? usage.cache_read_input_tokens) +
        safeNumber(usage.cacheWrite ?? usage.cache_write ?? usage.cacheWriteTokens ?? usage.cache_creation_input_tokens);
      const cacheReadTokens = safeNumber(
        usage.cacheRead ?? usage.cache_read ?? usage.cacheReadTokens ?? usage.cache_read_input_tokens,
      );
      const cacheWriteTokens = safeNumber(
        usage.cacheWrite ?? usage.cache_write ?? usage.cacheWriteTokens ?? usage.cache_creation_input_tokens,
      );
      const inputTokens = rawInputTokens;
      const tokens = rawInputTokens + cacheReadTokens + cacheWriteTokens + outputTokens;
      if (!tokens) return;
      addRecord(usageEvent({
        tool: "OpenClaw",
        model: message.model || entry.model || "openclaw-unknown",
        date: dayFromTimestamp(entry.timestamp || message.timestamp),
        tokens,
        inputTokens,
        cacheTokens,
        cacheReadTokens,
        cacheWriteTokens,
        outputTokens,
        sessionId: currentSessionId,
        requestId: entry.requestId || message.requestId || "",
        messageId: entry.id || message.id || "",
        status,
        sourceFile: file,
        sourceKind,
        timestamp: entry.timestamp || message.timestamp,
      }));
    });
    parsedLines += stat.parsed;
  }

  const responsePattern = /^\[(.*?)\].*?\[LLM\]\s+RESP .*?(\{.*\})/;

  for (const file of logFiles) {
    let text = "";
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      if (!line.includes("[LLM] RESP") || !line.includes('"usage"')) continue;
      const match = responsePattern.exec(line);
      if (!match) {
        addSkip(diagnostics, "unmatched_llm_log");
        continue;
      }
      let payload;
      try {
        payload = JSON.parse(match[2]);
      } catch {
        addSkip(diagnostics, "malformed_llm_json");
        continue;
      }
      const usage = payload.usage;
      if (!usage || typeof usage !== "object") {
        addSkip(diagnostics, "missing_llm_usage");
        continue;
      }
      const model = payload.model || "openclaw-unknown";
      const parts = openAiStyleUsageParts(usage);
      if (!parts.tokens) continue;
      addRecord(usageEvent({
        tool: "OpenClaw",
        model,
        date: dayFromTimestamp(match[1]),
        ...parts,
        status: "stop",
        sourceFile: file,
        sourceKind: "llm-log",
        timestamp: match[1],
      }));
      parsedLines += 1;
    }
  }

  return {
    id: "openclaw",
    name: "OpenClaw",
    source: "~/.openclaw/agents/**/sessions/*.jsonl + ~/Library/Logs/QClaw/**/*.log",
    files: sessionFiles.length + logFiles.length,
    parsedLines,
    records,
    diagnostics,
  };
}

function genericJsonUsageSource(id, name, sourceDir, displaySource) {
  const files = walk(sourceDir, (file) => /\.(json|jsonl)$/i.test(file), 5000);
  const records = [];
  let parsedLines = 0;
  const diagnostics = createScanStats({
    tokenRule: `递归检查 ${displaySource} 中常见 usage/token_usage 字段`,
    dedupeRule: "实验性通用 JSON 扫描，当前不作为核心准确口径",
  });

  const inspect = (value, inherited = {}) => {
    if (!value || typeof value !== "object") return;
    const maybeUsage = value.usage || value.token_usage || value.tokenUsage;
    const tokens = usageTotal(maybeUsage || value);
    const hasTokenField =
      "input_tokens" in value ||
      "output_tokens" in value ||
      "total_tokens" in value ||
      "cached_input_tokens" in value;
    if (tokens && (maybeUsage || hasTokenField)) {
      records.push(usageRecord({
        tool: name,
        model: value.model || inherited.model || `${id}-unknown`,
        date: dayFromTimestamp(value.timestamp || value.time || value.created_at || inherited.timestamp),
        tokens,
        inputTokens: safeNumber((maybeUsage || value).input_tokens),
        cacheTokens: safeNumber((maybeUsage || value).cached_input_tokens),
        cacheReadTokens: safeNumber((maybeUsage || value).cached_input_tokens),
        outputTokens: safeNumber((maybeUsage || value).output_tokens),
      }));
      return;
    }
    for (const child of Object.values(value)) {
      if (child && typeof child === "object") {
        inspect(child, {
          model: value.model || inherited.model,
          timestamp: value.timestamp || value.time || value.created_at || inherited.timestamp,
        });
      }
    }
  };

  for (const file of files) {
    if (file.endsWith(".jsonl")) {
      const stat = readJsonLines(file, (entry) => inspect(entry));
      parsedLines += stat.parsed;
    } else {
      try {
        inspect(JSON.parse(fs.readFileSync(file, "utf8")));
        parsedLines += 1;
      } catch {
        addSkip(diagnostics, "malformed_json_file");
        // Ignore app config/cache files that are not valid JSON.
      }
    }
  }

  return { id, name, source: displaySource, files: files.length, parsedLines, records, diagnostics };
}

function hermesUsage() {
  const dbFile = path.join(HOME, ".hermes", "state.db");
  const rows = sqliteJson(
    dbFile,
    `select id, model, started_at, input_tokens, output_tokens, cache_read_tokens,
            cache_write_tokens, reasoning_tokens, estimated_cost_usd
       from sessions
      where coalesce(input_tokens, 0) + coalesce(output_tokens, 0)
          + coalesce(cache_read_tokens, 0) + coalesce(cache_write_tokens, 0)
          + coalesce(reasoning_tokens, 0) > 0
      order by started_at asc`,
  );
  const records = rows.map((row) => {
    const model = row.model || "hermes-unknown";
    const inputTokens = safeNumber(row.input_tokens);
    const cacheTokens = safeNumber(row.cache_read_tokens) + safeNumber(row.cache_write_tokens);
    const cacheReadTokens = safeNumber(row.cache_read_tokens);
    const cacheWriteTokens = safeNumber(row.cache_write_tokens);
    const outputTokens = safeNumber(row.output_tokens) + safeNumber(row.reasoning_tokens);
    const fallbackCost = estimatedCost(model, inputTokens, cacheReadTokens, outputTokens, cacheWriteTokens);
    return {
      ...usageEvent({
        tool: "Hermes",
        model,
        date: dayFromCompactSessionId(row.id) || dayFromUnixSeconds(row.started_at),
        inputTokens,
        cacheTokens,
        cacheReadTokens,
        cacheWriteTokens,
        outputTokens,
        sessionId: row.id,
        requestId: row.id,
        messageId: row.id,
        status: "session",
        sourceFile: dbFile,
        sourceKind: "sqlite",
        timestamp: safeNumber(row.started_at) ? safeNumber(row.started_at) * 1000 : "",
      }),
      cost: safeNumber(row.estimated_cost_usd) || fallbackCost,
    };
  });

  return {
    id: "hermes",
    name: "Hermes",
    source: "~/.hermes/state.db",
    files: fs.existsSync(dbFile) ? 1 : 0,
    parsedLines: rows.length,
    records,
    diagnostics: createScanStats({
      tokenRule: "读取 Hermes SQLite sessions 表的 input/cache/output/reasoning token 字段",
      dedupeRule: "SQLite sessions 表本身按 session id 唯一",
    }),
  };
}

function buildAggregatesFromRecords(records, sourceSummaries, meta = {}) {
  const cleanRecords = records.filter((record) => record.date && record.tokens);
  const byDay = new Map();
  const byTool = new Map();
  const byModel = new Map();
  const recent = [];

  for (const record of cleanRecords) {
    const day = byDay.get(record.date) || {
      date: record.date,
      tokens: 0,
      normalizedTokens: 0,
      inputTokens: 0,
      cacheTokens: 0,
      outputTokens: 0,
      cost: 0,
      tools: {},
      toolCosts: {},
      models: {},
    };
    day.tokens += record.tokens;
    day.normalizedTokens += record.normalizedTokens || 0;
    day.inputTokens += record.inputTokens;
    day.cacheTokens += record.cacheTokens;
    day.outputTokens += record.outputTokens;
    day.cost += safeNumber(record.cost);
    day.tools[record.tool] = (day.tools[record.tool] || 0) + record.tokens;
    day.toolCosts[record.tool] = (day.toolCosts[record.tool] || 0) + safeNumber(record.cost);
    day.models[record.model] = (day.models[record.model] || 0) + record.tokens;
    byDay.set(record.date, day);

    byTool.set(record.tool, (byTool.get(record.tool) || 0) + record.tokens);
    byModel.set(record.model, (byModel.get(record.model) || 0) + record.tokens);
    recent.push(record);
  }

  const days = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  const calendarDays = [];
  if (days.length) {
    const cursor = new Date(`${days[0].date}T00:00:00.000Z`);
    const end = new Date(`${days[days.length - 1].date}T00:00:00.000Z`);
    while (cursor <= end) {
      const date = cursor.toISOString().slice(0, 10);
      calendarDays.push(
        byDay.get(date) || {
          date,
      tokens: 0,
          normalizedTokens: 0,
          inputTokens: 0,
          cacheTokens: 0,
          outputTokens: 0,
          cost: 0,
          tools: {},
          toolCosts: {},
          models: {},
        },
      );
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  const totalTokens = cleanRecords.reduce((sum, record) => sum + record.tokens, 0);
  const normalizedTokens = cleanRecords.reduce((sum, record) => sum + (record.normalizedTokens || 0), 0);
  return {
    ...meta,
    generatedAt: new Date().toISOString(),
    totalTokens,
    normalizedTokens,
    recordCount: cleanRecords.length,
    dayCount: days.length,
    firstDate: days[0] ? days[0].date : null,
    lastDate: days[days.length - 1] ? days[days.length - 1].date : null,
    days,
    calendarDays,
    tools: [...byTool.entries()]
      .map(([name, tokens]) => ({ name, tokens }))
      .sort((a, b) => b.tokens - a.tokens),
    models: [...byModel.entries()]
      .map(([name, tokens]) => ({ name, tokens }))
      .sort((a, b) => b.tokens - a.tokens),
    sources: sourceSummaries.map((source) => ({
      id: source.id,
      name: source.name,
      source: source.source,
      files: source.files,
      parsedLines: source.parsedLines,
      records: Array.isArray(source.records) ? source.records.length : source.records || 0,
      tokens:
        typeof source.tokens === "number"
          ? source.tokens
          : source.records.reduce((sum, record) => sum + record.tokens, 0),
      normalizedTokens:
        typeof source.normalizedTokens === "number"
          ? source.normalizedTokens
          : source.records.reduce((sum, record) => sum + (record.normalizedTokens || 0), 0),
      status:
        (Array.isArray(source.records) ? source.records.length : source.records || 0) > 0
          ? "已接入"
          : "未发现用量明细",
      diagnostics: summarizeRecordDiagnostics(source),
    })),
    recent: recent
      .sort((a, b) => `${b.date}`.localeCompare(`${a.date}`))
      .slice(0, 16),
  };
}

function buildAggregates(sources) {
  const records = sources.flatMap((source) =>
    source.records
      .filter((record) => record.date && record.tokens)
      .map((record) => ({ ...record, sourceId: source.id })),
  );
  return buildAggregatesFromRecords(records, sources);
}

function scanUsage() {
  const sources = [
    codexUsage(),
    openClawUsage(),
    claudeUsage(),
    hermesUsage(),
    genericJsonUsageSource("gemini", "Gemini CLI", path.join(HOME, ".gemini"), "~/.gemini/**/*.json"),
  ];
  return {
    ...buildAggregates(sources),
    sourceMode: "native-token-ledger-scanner",
    scanner: {
      name: PRODUCT_SCANNER_NAME,
      embedded: true,
      ok: true,
      externalCommand: false,
    },
    metric: "effective call total = input + output + cache_read + cache_write after session-version selection and request dedupe",
  };
}

let cache = null;
let cacheTime = 0;
function getUsage(force = false) {
  if (!force && cache && Date.now() - cacheTime < 30_000) return cache;
  cache = scanUsage();
  cacheTime = Date.now();
  return cache;
}

function sendJson(res, data) {
  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
  });
  res.end(JSON.stringify(data));
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  
  // 在 pkg 环境下，静态文件打包在虚拟文件系统里 (__dirname)
  // 而外部的 pricing.json 在物理目录里 (ROOT)
  const isStaticAsset = [".html", ".css", ".js"].includes(path.extname(requested));
  const baseDir = (process.pkg && isStaticAsset) ? __dirname : ROOT;
  
  const file = path.normalize(path.join(baseDir, requested));
  if (!file.startsWith(baseDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
    });
    res.end();
    return;
  }
  if (url.pathname === "/api/usage") {
    try {
      sendJson(res, getUsage(url.searchParams.get("refresh") === "1"));
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  serveStatic(req, res);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('\n========================================================');
    console.error('❌ 启动失败：端口 ' + PORT + ' 已被占用！');
    console.error('========================================================');
    console.error('👉 原因：你可能已经打开了一个 Token Ledger 窗口没有关。');
    console.error('👉 解决办法：');
    console.error('   1. 请直接在浏览器访问 http://127.0.0.1:' + PORT);
    console.error('   2. 或者找到之前打开的黑色终端窗口并将其关闭。');
    console.error('========================================================');
    console.error('\n(本窗口将在 8 秒后自动关闭...)');
    
    // 即使端口被占用，我们也尝试帮用户打开浏览器，因为很可能旧进程就是我们要的
    const { exec } = require('child_process');
    const startUrl = `http://127.0.0.1:${PORT}`;
    const openCommand = process.platform === 'darwin' ? `open ${startUrl}` : process.platform === 'win32' ? `start ${startUrl}` : '';
    if (openCommand) {
      exec(openCommand, () => {});
    }

    setTimeout(() => process.exit(1), 8000);
  } else {
    console.error('\n❌ 发生未知错误：', e.message);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n✅ Token Ledger 启动成功！`);
  console.log(`👉 正在为你打开浏览器访问: http://127.0.0.1:${PORT}\n`);
  console.log(`(注意：请保持此黑色终端窗口打开，关闭窗口即代表退出程序)`);
  
  // 自动打开浏览器
  const { exec } = require('child_process');
  const startUrl = `http://127.0.0.1:${PORT}`;
  const openCommand = process.platform === 'darwin' ? `open ${startUrl}` : process.platform === 'win32' ? `start ${startUrl}` : '';
  if (openCommand) {
    exec(openCommand, () => {});
  }
});
