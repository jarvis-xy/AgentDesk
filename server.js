const fs = require("fs");
const http = require("http");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = process.pkg ? path.dirname(process.execPath) : __dirname;
const HOME = os.homedir();
const PORT = Number(process.env.PORT || 5188);
const PRICING_FILE = path.join(ROOT, "pricing.json");
const AGENTDESK_HOME = path.join(HOME, ".agentdesk");
const PROJECT_OVERRIDES_FILE = path.join(AGENTDESK_HOME, "project-overrides.json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const PRODUCT_NAME = "AgentDesk";
const PRODUCT_TAGLINE = "本地多 Agent 运维台";
const PRODUCT_SCANNER_NAME = "AgentDesk Scanner";
const TOOL_NAMES = {
  "claude-code": "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  openclaw: "OpenClaw",
  hermes: "Hermes",
  grok: "Grok",
};

/** Multi-agent skill roots discovered on this machine. */
const SKILL_AGENTS = [
  {
    id: "agents",
    name: "Agents 共享",
    description: "~/.agents/skills — 由 npx skills / skills.sh 从 GitHub 安装的共享库",
    roots: [{ path: path.join(HOME, ".agents", "skills"), kind: "skills" }],
  },
  {
    id: "claude",
    name: "Claude Code",
    description: "~/.claude/skills + commands",
    roots: [
      { path: path.join(HOME, ".claude", "skills"), kind: "skills" },
      { path: path.join(HOME, ".claude", "commands"), kind: "commands" },
    ],
  },
  {
    id: "codex",
    name: "Codex",
    description: "~/.codex/skills（含 .system 只读系统技能）",
    roots: [
      { path: path.join(HOME, ".codex", "skills"), kind: "skills" },
      { path: path.join(HOME, ".codex", "memories", "skills"), kind: "skills", label: "memories" },
    ],
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    description: "~/.openclaw/skills（含 external/internal 与到 Agents 的软链）",
    roots: [
      { path: path.join(HOME, ".openclaw", "skills"), kind: "skills", recursive: true },
      { path: path.join(HOME, ".openclaw", "workspace", "skills"), kind: "skills", recursive: true, label: "workspace" },
    ],
  },
  {
    id: "hermes",
    name: "Hermes",
    description: "~/.hermes/skills（按分类嵌套存放）",
    roots: [{ path: path.join(HOME, ".hermes", "skills"), kind: "skills", recursive: true }],
  },
  {
    id: "grok",
    name: "Grok",
    description: "~/.grok/skills + bundled（bundled 只读）",
    roots: [
      { path: path.join(HOME, ".grok", "skills"), kind: "skills" },
      { path: path.join(HOME, ".grok", "bundled", "skills"), kind: "skills", readOnly: true, label: "bundled" },
    ],
  },
  {
    id: "cursor",
    name: "Cursor",
    description: "~/.cursor/skills",
    roots: [{ path: path.join(HOME, ".cursor", "skills"), kind: "skills" }],
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    description: "~/.gemini/skills",
    roots: [{ path: path.join(HOME, ".gemini", "skills"), kind: "skills", recursive: true }],
  },
  {
    id: "trae",
    name: "Trae",
    description: "~/.trae/skills + builtin_skills",
    roots: [
      { path: path.join(HOME, ".trae", "skills"), kind: "skills", recursive: true },
      { path: path.join(HOME, ".trae", "builtin_skills"), kind: "skills", recursive: true, readOnly: true, label: "builtin" },
    ],
  },
];

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

let cachedZstdBin = undefined;
function resolveZstdBin() {
  if (cachedZstdBin !== undefined) return cachedZstdBin;
  const candidates = [
    process.env.ZSTD_BIN,
    "zstd",
    "/opt/homebrew/bin/zstd",
    "/usr/local/bin/zstd",
    "/usr/bin/zstd",
  ].filter(Boolean);
  for (const cand of candidates) {
    try {
      execFileSync(cand, ["--version"], { stdio: "ignore" });
      cachedZstdBin = cand;
      return cachedZstdBin;
    } catch {
      // try next
    }
  }
  cachedZstdBin = null;
  return null;
}

/** Read plain .jsonl or .jsonl.zst (Codex archived_sessions) into UTF-8 text. */
function readJsonlFileText(file) {
  if (file.endsWith(".zst")) {
    const bin = resolveZstdBin();
    if (!bin) return { text: "", error: "zstd_not_found" };
    try {
      const buf = execFileSync(bin, ["-dc", file], {
        maxBuffer: 512 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      });
      return { text: buf.toString("utf8") };
    } catch {
      return { text: "", error: "zstd_decompress_failed" };
    }
  }
  try {
    return { text: fs.readFileSync(file, "utf8") };
  } catch {
    return { text: "", error: "read_failed" };
  }
}

function readJsonLines(file, visitor) {
  const { text, error } = readJsonlFileText(file);
  if (!text) return { lines: 0, parsed: 0, error: error || null };
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
  return { lines: lines.length, parsed, error: null };
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
    coverageNote: source.diagnostics?.coverageNote || null,
    codexCoverage: source.diagnostics?.codexCoverage || null,
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

function codexRolloutBasename(file) {
  // rollout-....jsonl or rollout-....jsonl.zst → stable key for dedupe across live/archive
  return path.basename(file).replace(/\.zst$/i, "");
}

function codexSessionFiles() {
  const byName = new Map();
  const liveRoot = path.join(HOME, ".codex", "sessions");
  const archRoot = path.join(HOME, ".codex", "archived_sessions");

  const live = walk(
    liveRoot,
    (file) => file.endsWith(".jsonl") && !file.endsWith(".zst"),
    20000,
  );
  for (const file of live) {
    byName.set(codexRolloutBasename(file), { file, kind: "live" });
  }

  // Codex archives older rollouts as zstd: *.jsonl.zst (previously missed by scanner).
  const archived = walk(
    archRoot,
    (file) => file.endsWith(".jsonl") || file.endsWith(".jsonl.zst"),
    20000,
  );
  for (const file of archived) {
    const key = codexRolloutBasename(file);
    if (!byName.has(key)) byName.set(key, { file, kind: "archived" });
  }

  return [...byName.values()];
}

function codexSessionIndexStats() {
  const indexPath = path.join(HOME, ".codex", "session_index.jsonl");
  let lines = 0;
  const ids = new Set();
  if (!fs.existsSync(indexPath)) {
    return { path: indexPath, lines: 0, uniqueIds: 0 };
  }
  try {
    const text = fs.readFileSync(indexPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      lines += 1;
      try {
        const row = JSON.parse(line);
        if (row && row.id) ids.add(String(row.id));
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return { path: indexPath.replace(HOME, "~"), lines, uniqueIds: ids.size };
}

function codexUsage() {
  const fileEntries = codexSessionFiles();
  const records = [];
  let parsedLines = 0;
  let liveFiles = 0;
  let archivedFiles = 0;
  let zstFiles = 0;
  let zstOk = 0;
  let zstFail = 0;
  const indexStats = codexSessionIndexStats();
  const diagnostics = createScanStats({
    tokenRule:
      "读取 Codex event_msg token_count.info.last_token_usage（单次调用）；会话累计见 total_token_usage",
    dedupeRule:
      "同一会话文件内按 model + input + cache + output + reasoning + total 去重，去掉重复 token 快照",
    coverageNote:
      "仅统计本机 ~/.codex 会话落盘。Codex App 账号总用量可能含已删除会话、其他设备/账号，与本机扫描不必一致。",
  });

  for (const { file, kind } of fileEntries) {
    if (kind === "live") liveFiles += 1;
    else archivedFiles += 1;
    if (file.endsWith(".zst")) zstFiles += 1;

    let currentModel = "codex-unknown";
    const seenTokenCounts = new Set();
    const sessionKey = codexRolloutBasename(file).replace(/\.jsonl$/i, "");
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
      records.push(
        usageEvent({
          tool: "Codex",
          model: currentModel,
          date: dayFromTimestamp(entry.timestamp),
          tokens,
          inputTokens: Math.max(0, safeNumber(usage.input_tokens) - safeNumber(usage.cached_input_tokens)),
          cacheTokens: safeNumber(usage.cached_input_tokens),
          cacheReadTokens: safeNumber(usage.cached_input_tokens),
          outputTokens: safeNumber(usage.output_tokens) + safeNumber(usage.reasoning_output_tokens),
          sessionId: sessionKey,
          requestId: payload.info && payload.info.request_id,
          messageId: "",
          status: "token_count",
          sourceFile: file,
          sourceKind: kind === "archived" ? "archived" : "primary",
          timestamp: entry.timestamp,
        }),
      );
    });
    if (stat.error) {
      addSkip(diagnostics, stat.error);
      if (file.endsWith(".zst")) zstFail += 1;
    } else if (file.endsWith(".zst")) {
      zstOk += 1;
    }
    parsedLines += stat.parsed || 0;
  }

  const totalTokens = records.reduce((sum, r) => sum + safeNumber(r.tokens), 0);
  diagnostics.codexCoverage = {
    liveFiles,
    archivedFiles,
    zstFiles,
    zstOk,
    zstFail,
    zstdBin: resolveZstdBin() || null,
    sessionIndex: indexStats,
    filesOnDisk: fileEntries.length,
    records: records.length,
    totalTokens,
    gapHint:
      indexStats.uniqueIds > fileEntries.length
        ? `session_index 有 ${indexStats.uniqueIds} 个会话 id，本机仅 ${fileEntries.length} 个 rollout 文件；缺失会话无法计入（已删/未同步/其他设备）。`
        : "本机 rollout 文件与 session_index 规模接近。",
  };

  return {
    id: "codex",
    name: "Codex",
    source: "~/.codex/sessions/**/*.jsonl + archived_sessions/**/*.jsonl(.zst)",
    files: fileEntries.length,
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

function grokSessionModelMap() {
  const map = new Map();
  const sessionsRoot = path.join(HOME, ".grok", "sessions");
  if (!fs.existsSync(sessionsRoot)) return map;
  const summaries = walk(sessionsRoot, (file) => path.basename(file) === "summary.json", 8000);
  for (const file of summaries) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      const id = parsed?.info?.id || path.basename(path.dirname(file));
      const model = parsed?.current_model_id || parsed?.model_id || "grok-unknown";
      if (id) map.set(id, model);
    } catch {
      // ignore malformed summary
    }
  }
  return map;
}

function grokUsage() {
  const logDir = path.join(HOME, ".grok", "logs");
  const files = walk(
    logDir,
    (file) => /unified(\.|$)/.test(path.basename(file)) && (file.endsWith(".jsonl") || file.endsWith(".log")),
    200,
  );
  // Primary filename is unified.jsonl; also accept rotated variants if present.
  const primary = path.join(logDir, "unified.jsonl");
  if (fs.existsSync(primary) && !files.includes(primary)) files.unshift(primary);

  const records = [];
  let parsedLines = 0;
  const seen = new Set();
  const modelBySession = grokSessionModelMap();
  const diagnostics = createScanStats({
    tokenRule:
      "读取 ~/.grok/logs/unified.jsonl 中 shell.turn.inference_done 的 prompt/cached/completion token；模型优先取 session summary.current_model_id",
    dedupeRule: "按 session + timestamp + loop_index + token 组成去重",
    dateRule: "按日志 ts 转本机本地日期归属",
  });

  for (const file of files) {
    const stat = readJsonLines(file, (entry) => {
      if (entry.msg !== "shell.turn.inference_done") {
        return;
      }
      const ctx = entry.ctx && typeof entry.ctx === "object" ? entry.ctx : {};
      const promptTokens = safeNumber(ctx.prompt_tokens);
      const cacheReadTokens = safeNumber(ctx.cached_prompt_tokens);
      const completionTokens = safeNumber(ctx.completion_tokens);
      const reasoningTokens = safeNumber(ctx.reasoning_tokens);
      // completion_tokens already covers visible + reasoning in Grok CLI display; keep reasoning as subset only.
      const outputTokens = completionTokens || reasoningTokens;
      const inputTokens = Math.max(0, promptTokens - cacheReadTokens);
      const tokens = inputTokens + cacheReadTokens + outputTokens;
      if (!tokens) {
        addSkip(diagnostics, "missing_token_fields");
        return;
      }
      const sid = entry.sid || "";
      const model = modelBySession.get(sid) || "grok-4.5";
      const loopIndex = ctx.loop_index ?? "";
      const dedupeKey = [sid, entry.ts || "", loopIndex, promptTokens, cacheReadTokens, outputTokens].join("|");
      if (seen.has(dedupeKey)) {
        addSkip(diagnostics, "duplicate_inference");
        return;
      }
      seen.add(dedupeKey);
      records.push(
        usageEvent({
          tool: "Grok",
          model,
          date: dayFromTimestamp(entry.ts),
          tokens,
          normalizedTokens: inputTokens + outputTokens,
          inputTokens,
          cacheTokens: cacheReadTokens,
          cacheReadTokens,
          cacheWriteTokens: 0,
          outputTokens,
          sessionId: sid,
          requestId: `${sid}:${entry.ts || ""}:${loopIndex}`,
          messageId: String(loopIndex),
          status: "inference_done",
          sourceFile: file,
          sourceKind: "unified-log",
          timestamp: entry.ts,
        }),
      );
    });
    parsedLines += stat.parsed;
  }

  return {
    id: "grok",
    name: "Grok",
    source: "~/.grok/logs/unified.jsonl (+ session summary for model)",
    files: files.length,
    parsedLines,
    records,
    diagnostics,
  };
}

function parseSkillFrontmatter(text) {
  if (!text.startsWith("---")) return { meta: {}, body: text };
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: text };
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes(":")) continue;
    const idx = trimmed.indexOf(":");
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }
  return { meta, body: match[2] || "" };
}

function firstDescription(meta, body) {
  if (meta.description) return String(meta.description).replace(/\s+/g, " ").trim().slice(0, 240);
  for (const line of String(body || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) return trimmed.replace(/^#+\s*/, "").slice(0, 240);
    return trimmed.slice(0, 240);
  }
  return "";
}

function skillContentFingerprint(skillPath, kind) {
  try {
    if (kind === "commands" && skillPath.endsWith(".md")) {
      const text = fs.readFileSync(skillPath, "utf8");
      return `${text.length}:${text.slice(0, 200)}`;
    }
    const skillMd = path.join(skillPath, "SKILL.md");
    if (fs.existsSync(skillMd)) {
      const text = fs.readFileSync(skillMd, "utf8");
      return `${text.length}:${text.slice(0, 200)}`;
    }
    const entries = fs.readdirSync(skillPath);
    return `dir:${entries.length}:${entries.slice(0, 8).join(",")}`;
  } catch {
    return "unknown";
  }
}

const SKILL_CATEGORY_DEFS = [
  { id: "feishu", label: "飞书协作", re: /lark|feishu|飞书|bitable|妙记|多维表格/i },
  { id: "video", label: "视频动效", re: /hyperframes|video|media-use|product-launch|seedance|sora|remotion|animation|motion|字幕|视频/i },
  { id: "content", label: "内容写作", re: /article|omni-article|wechat|x-content|aihot|writing|blog|copy|公众号|文章|写作|日报/i },
  {
    id: "design",
    label: "设计界面",
    re: /design|ui|ux|figma|huashu|shadcn|brutalism|glassmorphism|neumorphism|claymorphism|dashboard|bento|typography|原型|设计/i,
  },
  { id: "style", label: "视觉风格", re: /minimal|modern|premium|neon|retro|vintage|luxury|corporate|elegant|flat|material|skeuo|doodle|sketch|matrix|pacman|tetris|sega|riso|terracotta|vibrant|sleek|spacious|storytelling|impeccable|agentic|ant$|fiction|cosmic|energetic|expressive|fantasy|futuristic|dramatic|refined|professional|publication|perspective|mono|dithered|cafe|bold|clean|colorful|friendly|simple|artistic|creative|contemporary|paper|gradient|editorial|enterprise|application|lingo|levels|immersive/i },
  { id: "engineering", label: "工程开发", re: /code|git|test|review|implement|api|security|aspnet|playwright|jupyter|pdf|docx|pptx|debug|refactor|编程|代码|测试/i },
  { id: "deploy", label: "部署运维", re: /deploy|vercel|netlify|cloudflare|render|docker|infra|ci|运维|部署/i },
  { id: "data", label: "数据研究", re: /data|research|analytics|sheet|csv|统计|研究|情报/i },
  { id: "productivity", label: "效率协作", re: /task|calendar|mail|notion|linear|todo|okr|attendance|approval|日程|任务|邮件|审批/i },
  { id: "agent-ops", label: "Agent 工具", re: /skill|plugin|mcp|agent|openai-docs|find-skills|skill-creator|skill-installer|agentdesk/i },
  { id: "other", label: "其他", re: /.*/ },
];

function extractChineseText(text, maxLen = 72) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const score = (s) => ((String(s).match(/[\u4e00-\u9fff]/g) || []).length);
  // bilingual "en / 中文" — pick the most Chinese slash segment
  const slashParts = raw
    .split(/\s*\/\s*/)
    .map((part) => part.replace(/^["']|["']$/g, "").trim())
    .filter(Boolean)
    .sort((a, b) => score(b) - score(a));
  if (slashParts[0] && score(slashParts[0]) >= 4) {
    // strip trailing english after chinese block
    const m = slashParts[0].match(/[\u4e00-\u9fff].*/);
    const picked = (m ? m[0] : slashParts[0]).replace(/[A-Za-z]{3,}.*$/, "").trim();
    if (score(picked) >= 4) return picked.slice(0, maxLen);
    return slashParts[0].slice(0, maxLen);
  }
  // longest high-density chinese run in whole text
  const runs = raw.match(/[\u4e00-\u9fff][\u4e00-\u9fff，。；：、（）()·\s「」【】A-Za-z0-9\-]{2,80}/g) || [];
  runs.sort((a, b) => score(b) - score(a));
  if (runs[0] && score(runs[0]) >= 4) {
    return runs[0].replace(/\s+/g, " ").replace(/[A-Za-z]{4,}.*$/, "").trim().slice(0, maxLen);
  }
  return "";
}

function classifySkillCapability(folderName, name, description) {
  const hay = `${folderName} ${name} ${description}`;
  for (const cat of SKILL_CATEGORY_DEFS) {
    if (cat.id === "other") continue;
    if (cat.re.test(hay)) return { id: cat.id, label: cat.label };
  }
  return { id: "other", label: "其他" };
}

function summarizeSkillInChinese(folderName, name, description, category) {
  const fromDoc = extractChineseText(description, 80);
  if (fromDoc) {
    return fromDoc.endsWith("。") || fromDoc.endsWith(".") ? fromDoc : `${fromDoc}`;
  }
  const d = String(description || "").toLowerCase();
  const n = String(folderName || name || "").toLowerCase();
  if (/lark-im|instant message|群聊/.test(d + n)) return "飞书即时消息：收发、搜聊天、管群与文件";
  if (/lark-doc|docx|云文档/.test(d + n)) return "飞书云文档：读写与编辑在线文档";
  if (/lark-base|bitable|多维/.test(d + n)) return "飞书多维表格：建表、字段、记录与视图";
  if (/lark-calendar|日历|日程/.test(d + n)) return "飞书日历：日程、会议室与忙闲";
  if (/lark-task|待办/.test(d + n)) return "飞书任务：待办、清单与分配";
  if (n === "hyperframes") return "HyperFrames 总入口：制作/改/渲染 HTML 动效视频";
  if (n === "hyperframes-animation") return "HyperFrames 动效规则与多运行时动画编排";
  if (n === "hyperframes-core") return "HyperFrames 合成契约：轨道、时序与可渲染结构";
  if (n === "hyperframes-cli") return "HyperFrames CLI：校验、预览、渲染与工程闭环";
  if (n === "hyperframes-creative") return "HyperFrames 创意方向：配色、旁白与镜头规划";
  if (n === "hyperframes-keyframes") return "HyperFrames 关键帧：GSAP/路径/3D 等 seek-safe 动画";
  if (n === "hyperframes-registry") return "HyperFrames 组件库：安装与接线 registry 区块";
  if (/hyperframes/.test(n)) return "HyperFrames 视频相关能力包";
  if (/media-use/.test(n)) return "媒体素材中枢：配乐、TTS、配图与素材解析";
  if (/product-launch/.test(n)) return "产品发布视频工作流：从 brief 到宣传片";
  if (/omni-article|article-creator/.test(n + d)) return "全平台长文创作：选题到成稿工作流";
  if (/find-skills|install.*skill|discover.*skill/.test(d + n)) return "发现并安装 Agent Skill 的助手";
  if (/wechat|公众号|typeset/.test(d + n)) return "公众号/微信内容排版与发布辅助";
  if (/deploy|vercel|netlify|cloudflare/.test(d + n)) return "应用部署上线相关能力";
  if (/figma/.test(d + n)) return "Figma 设计读取、实现与组件映射";
  if (/review|code review/.test(d + n)) return "代码评审与质量检查";
  if (/imagegen|imagine|image/.test(d + n) && category.id !== "video") return "图像生成或编辑相关能力";
  if (category.id === "style") return `界面视觉风格包：${name || folderName}`;
  if (category.id === "feishu") return `飞书生态能力：${name || folderName}`;
  if (category.id === "video") return `视频/动效能力：${name || folderName}`;
  if (category.id === "design") return `设计/UI 相关：${name || folderName}`;
  if (category.id === "engineering") return `工程开发相关：${name || folderName}`;
  if (category.id === "content") return `内容创作相关：${name || folderName}`;
  if (category.id === "productivity") return `效率协作相关：${name || folderName}`;
  if (category.id === "deploy") return `部署运维相关：${name || folderName}`;
  if (category.id === "data") return `数据/研究相关：${name || folderName}`;
  if (category.id === "agent-ops") return `Agent/Skill 工具：${name || folderName}`;
  // fallback: first English sentence shortened
  const en = String(description || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)[0]
    .slice(0, 90);
  if (en) return `（英）${en}`;
  return `${category.label}：${name || folderName}`;
}

function enrichSkillMeta(folderName, meta, body) {
  const description = firstDescription(meta, body);
  const name = meta.name || folderName;
  const category = classifySkillCapability(folderName, name, description);
  const summaryZh = summarizeSkillInChinese(folderName, name, description, category);
  return { name, description, categoryId: category.id, categoryLabel: category.label, summaryZh };
}

function pushSkillDirEntry(entries, { full, folderName, agentId, root, readOnlyOverride }) {
  const skillMd = path.join(full, "SKILL.md");
  const skillMdAlt = path.join(full, "skill.md");
  if (!fs.existsSync(skillMd) && !fs.existsSync(skillMdAlt)) return false;
  let meta = {};
  let body = "";
  try {
    const mdPath = fs.existsSync(skillMd) ? skillMd : skillMdAlt;
    // Read more of the skill doc for better Chinese summary / classification
    const raw = fs.readFileSync(mdPath, "utf8");
    ({ meta, body } = parseSkillFrontmatter(raw.slice(0, 12000)));
  } catch {
    // ignore
  }
  let isSymlink = false;
  let linkTarget = "";
  try {
    const lst = fs.lstatSync(full);
    isSymlink = lst.isSymbolicLink();
    if (isSymlink) linkTarget = fs.readlinkSync(full);
  } catch {
    // ignore
  }
  const enriched = enrichSkillMeta(folderName, meta, body);
  entries.push({
    name: enriched.name,
    folderName,
    description: enriched.description,
    summaryZh: enriched.summaryZh,
    categoryId: enriched.categoryId,
    categoryLabel: enriched.categoryLabel,
    agentId,
    rootKind: root.kind,
    rootLabel: root.label || "skills",
    path: full,
    kind: "skill",
    readOnly: readOnlyOverride != null ? readOnlyOverride : !!root.readOnly,
    isSymlink,
    linkTarget,
    fingerprint: skillContentFingerprint(full, "skills"),
  });
  return true;
}

function listSkillEntriesInRoot(root, agentId) {
  const entries = [];
  if (!fs.existsSync(root.path)) return entries;
  let dirents = [];
  try {
    dirents = fs.readdirSync(root.path, { withFileTypes: true });
  } catch {
    return entries;
  }

  // Flat command markdown files
  if (root.kind === "commands") {
    for (const dirent of dirents) {
      if (!dirent.isFile() || !dirent.name.endsWith(".md")) continue;
      const full = path.join(root.path, dirent.name);
      let meta = {};
      let body = "";
      try {
        ({ meta, body } = parseSkillFrontmatter(fs.readFileSync(full, "utf8")));
      } catch {
        // ignore
      }
      const stem = path.basename(dirent.name, ".md");
      let isSymlink = false;
      try {
        isSymlink = fs.lstatSync(full).isSymbolicLink();
      } catch {
        // ignore
      }
      const enriched = enrichSkillMeta(stem, meta, body);
      entries.push({
        name: enriched.name,
        folderName: stem,
        description: enriched.description,
        summaryZh: enriched.summaryZh,
        categoryId: enriched.categoryId,
        categoryLabel: enriched.categoryLabel,
        agentId,
        rootKind: root.kind,
        rootLabel: root.label || "commands",
        path: full,
        kind: "command",
        readOnly: !!root.readOnly,
        isSymlink,
        fingerprint: skillContentFingerprint(full, "commands"),
      });
    }
    return entries;
  }

  if (root.kind !== "skills") return entries;

  // Walk directories. recursive roots (OpenClaw/Hermes) discover nested SKILL.md.
  const maxDepth = root.recursive ? 4 : 2;
  const stack = [{ dir: root.path, depth: 0 }];
  const seen = new Set();

  while (stack.length) {
    const { dir, depth } = stack.pop();
    let children = [];
    try {
      children = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const dirent of children) {
      if (dirent.name.startsWith(".") && dirent.name !== ".system") continue;
      const full = path.join(dir, dirent.name);

      // Codex .system skills: read-only
      if (dirent.isDirectory() && dirent.name === ".system") {
        let systemEntries = [];
        try {
          systemEntries = fs.readdirSync(full, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const sys of systemEntries) {
          if (!sys.isDirectory() && !sys.isSymbolicLink()) continue;
          const sysFull = path.join(full, sys.name);
          pushSkillDirEntry(entries, {
            full: sysFull,
            folderName: sys.name,
            agentId,
            root,
            readOnlyOverride: true,
          });
        }
        continue;
      }

      let isSymlink = false;
      try {
        isSymlink = fs.lstatSync(full).isSymbolicLink();
      } catch {
        continue;
      }
      let isDir = dirent.isDirectory();
      if (!isDir && isSymlink) {
        try {
          isDir = fs.statSync(full).isDirectory();
        } catch {
          isDir = false;
        }
      }
      if (!isDir) continue;

      // Prefer immediate SKILL.md as a skill package.
      const hasSkillMd =
        fs.existsSync(path.join(full, "SKILL.md")) || fs.existsSync(path.join(full, "skill.md"));
      if (hasSkillMd) {
        const key = path.resolve(full);
        if (!seen.has(key)) {
          seen.add(key);
          pushSkillDirEntry(entries, {
            full,
            folderName: dirent.name,
            agentId,
            root,
          });
        }
        // Do not recurse into package internals (references/, scripts/, etc.)
        continue;
      }

      // Category folders (Hermes apple/, OpenClaw external/) — go deeper.
      if (depth + 1 < maxDepth) {
        stack.push({ dir: full, depth: depth + 1 });
      }
    }
  }

  return entries;
}

function scanSkills() {
  const agents = [];
  const allEntries = [];
  for (const agent of SKILL_AGENTS) {
    const roots = [];
    let count = 0;
    for (const root of agent.roots) {
      const exists = fs.existsSync(root.path);
      const entries = exists ? listSkillEntriesInRoot(root, agent.id, root) : [];
      count += entries.length;
      allEntries.push(...entries);
      roots.push({
        path: root.path.replace(HOME, "~"),
        absPath: root.path,
        kind: root.kind,
        label: root.label || root.kind,
        readOnly: !!root.readOnly,
        exists,
        count: entries.length,
      });
    }
    agents.push({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      skillCount: count,
      roots,
    });
  }

  // Group by skill identity (folderName preferred for sync)
  const byKey = new Map();
  for (const entry of allEntries) {
    const key = String(entry.folderName || entry.name).toLowerCase();
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        name: entry.name,
        folderName: entry.folderName,
        description: entry.description || "",
        summaryZh: entry.summaryZh || "",
        categoryId: entry.categoryId || "other",
        categoryLabel: entry.categoryLabel || "其他",
        kind: entry.kind,
        agents: {},
        locations: [],
      });
    }
    const group = byKey.get(key);
    if (!group.description && entry.description) group.description = entry.description;
    if (!group.summaryZh && entry.summaryZh) group.summaryZh = entry.summaryZh;
    // Prefer non-empty Chinese summary and richer description
    if (entry.summaryZh && entry.summaryZh.length > (group.summaryZh || "").length) {
      group.summaryZh = entry.summaryZh;
    }
    if (entry.description && entry.description.length > (group.description || "").length) {
      group.description = entry.description;
      // re-enrich category if description got better
      const enriched = enrichSkillMeta(entry.folderName, { name: entry.name, description: entry.description }, entry.description);
      group.categoryId = enriched.categoryId;
      group.categoryLabel = enriched.categoryLabel;
      if (!group.summaryZh || group.summaryZh.startsWith("（英）")) group.summaryZh = enriched.summaryZh;
    }
    if (entry.name && entry.name !== entry.folderName) group.name = entry.name;
    if (entry.categoryId && entry.categoryId !== "other" && group.categoryId === "other") {
      group.categoryId = entry.categoryId;
      group.categoryLabel = entry.categoryLabel;
    }
    group.agents[entry.agentId] = {
      present: true,
      path: entry.path.replace(HOME, "~"),
      absPath: entry.path,
      readOnly: entry.readOnly,
      isSymlink: entry.isSymlink,
      linkTarget: entry.linkTarget || "",
      rootLabel: entry.rootLabel,
      kind: entry.kind,
      fingerprint: entry.fingerprint,
    };
    group.locations.push({
      agentId: entry.agentId,
      path: entry.path.replace(HOME, "~"),
      readOnly: entry.readOnly,
      isSymlink: entry.isSymlink,
    });
  }

  const skills = [...byKey.values()]
    .map((skill) => {
      const presentOn = Object.keys(skill.agents);
      const missingOn = SKILL_AGENTS.map((a) => a.id).filter((id) => !skill.agents[id]);
      const syncTargets = SKILL_AGENTS.filter((agent) => {
        if (skill.agents[agent.id]) return false;
        return agent.roots.some((root) => root.kind === "skills" && !root.readOnly);
      }).map((agent) => agent.id);
      if (!skill.summaryZh) {
        const enriched = enrichSkillMeta(skill.folderName, { name: skill.name, description: skill.description }, skill.description);
        skill.summaryZh = enriched.summaryZh;
        skill.categoryId = skill.categoryId || enriched.categoryId;
        skill.categoryLabel = skill.categoryLabel || enriched.categoryLabel;
      }
      return {
        ...skill,
        presentOn,
        missingOn,
        syncTargets,
        agentCount: presentOn.length,
      };
    })
    .sort((a, b) => b.agentCount - a.agentCount || a.folderName.localeCompare(b.folderName));

  const byCategory = {};
  for (const skill of skills) {
    const id = skill.categoryId || "other";
    if (!byCategory[id]) {
      byCategory[id] = { id, label: skill.categoryLabel || "其他", count: 0 };
    }
    byCategory[id].count += 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    agentCount: agents.length,
    skillCount: skills.length,
    locationCount: allEntries.length,
    agents,
    skills,
    categories: Object.values(byCategory).sort((a, b) => b.count - a.count),
    writableAgents: SKILL_AGENTS.filter((agent) =>
      agent.roots.some((root) => root.kind === "skills" && !root.readOnly),
    ).map((agent) => ({ id: agent.id, name: agent.name })),
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function getWritableSkillsRoot(agentId) {
  const agent = SKILL_AGENTS.find((item) => item.id === agentId);
  if (!agent) throw new Error(`未知 Agent: ${agentId}`);
  const root = agent.roots.find((item) => item.kind === "skills" && !item.readOnly);
  if (!root) throw new Error(`${agent.name} 没有可写的 skills 目录（可能仅有 bundled/只读源）`);
  return root;
}

function findSkillSource(folderName, fromAgent) {
  const inventory = scanSkills();
  const skill = inventory.skills.find(
    (item) => item.folderName === folderName || item.name === folderName || item.key === String(folderName).toLowerCase(),
  );
  if (!skill) throw new Error(`未找到 skill: ${folderName}`);
  if (fromAgent) {
    const loc = skill.agents[fromAgent];
    if (!loc) throw new Error(`${folderName} 不在 ${fromAgent} 上`);
    return { skill, source: loc, sourceAgent: fromAgent };
  }
  // Prefer non-symlink real copy as source
  const preferred =
    Object.entries(skill.agents).find(([, loc]) => !loc.isSymlink && !loc.readOnly) ||
    Object.entries(skill.agents).find(([, loc]) => !loc.isSymlink) ||
    Object.entries(skill.agents)[0];
  if (!preferred) throw new Error(`skill 无可用源: ${folderName}`);
  return { skill, source: preferred[1], sourceAgent: preferred[0] };
}

function copyPathRecursive(src, dest) {
  const stat = fs.lstatSync(src);
  if (stat.isSymbolicLink()) {
    const target = fs.readlinkSync(src);
    // Materialize symlink target content when possible
    const resolved = path.resolve(path.dirname(src), target);
    if (fs.existsSync(resolved)) {
      copyPathRecursive(resolved, dest);
      return;
    }
    fs.symlinkSync(target, dest);
    return;
  }
  if (stat.isDirectory()) {
    ensureDir(dest);
    for (const name of fs.readdirSync(src)) {
      copyPathRecursive(path.join(src, name), path.join(dest, name));
    }
    return;
  }
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function skillCopy({ folderName, fromAgent, toAgents, mode = "copy" }) {
  if (!folderName) throw new Error("缺少 folderName / skill 名称");
  const targets = Array.isArray(toAgents) ? toAgents : toAgents ? [toAgents] : [];
  if (!targets.length) throw new Error("请至少选择一个目标 Agent");
  if (!["copy", "symlink"].includes(mode)) throw new Error("mode 仅支持 copy 或 symlink");

  const { skill, source, sourceAgent } = findSkillSource(folderName, fromAgent || null);
  const sourcePath = source.absPath;
  if (!fs.existsSync(sourcePath)) throw new Error(`源路径不存在: ${sourcePath}`);

  const results = [];
  for (const targetId of targets) {
    if (targetId === sourceAgent) {
      results.push({ agentId: targetId, ok: false, error: "源与目标相同，已跳过" });
      continue;
    }
    try {
      const root = getWritableSkillsRoot(targetId);
      ensureDir(root.path);
      const destName = skill.folderName || folderName;
      const destPath = path.join(root.path, destName);
      let exists = false;
      try {
        fs.lstatSync(destPath);
        exists = true;
      } catch {
        exists = false;
      }
      if (exists) {
        results.push({ agentId: targetId, ok: false, error: "目标已存在，未覆盖", path: destPath.replace(HOME, "~") });
        continue;
      }
      if (mode === "symlink") {
        fs.symlinkSync(sourcePath, destPath);
      } else {
        copyPathRecursive(sourcePath, destPath);
      }
      results.push({
        agentId: targetId,
        ok: true,
        mode,
        path: destPath.replace(HOME, "~"),
        from: sourcePath.replace(HOME, "~"),
        fromAgent: sourceAgent,
      });
    } catch (error) {
      results.push({ agentId: targetId, ok: false, error: error.message });
    }
  }

  skillsCache = null;
  return {
    skill: skill.folderName,
    fromAgent: sourceAgent,
    mode,
    results,
    inventory: scanSkills(),
  };
}

function skillRemove({ folderName, agentId }) {
  if (!folderName || !agentId) throw new Error("需要 folderName 与 agentId");
  const root = getWritableSkillsRoot(agentId);
  const destPath = path.join(root.path, folderName);
  let stat;
  try {
    stat = fs.lstatSync(destPath);
  } catch {
    throw new Error(`目标不存在: ${destPath}`);
  }
  // Safety: only delete under known skill roots
  const resolvedRoot = path.resolve(root.path);
  const resolvedDest = path.resolve(destPath);
  if (!resolvedDest.startsWith(resolvedRoot + path.sep) && resolvedDest !== resolvedRoot) {
    throw new Error("拒绝删除：路径超出 Agent skills 根目录");
  }
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    fs.rmSync(destPath, { recursive: true, force: false });
  } else {
    fs.unlinkSync(destPath);
  }
  skillsCache = null;
  return { ok: true, removed: destPath.replace(HOME, "~"), inventory: scanSkills() };
}

function scanUsage() {
  const sources = [
    codexUsage(),
    openClawUsage(),
    claudeUsage(),
    hermesUsage(),
    grokUsage(),
    genericJsonUsageSource("gemini", "Gemini CLI", path.join(HOME, ".gemini"), "~/.gemini/**/*.json"),
  ];
  const aggregates = buildAggregates(sources);
  // Internal cache for project-detail matching (not always sent to client fully).
  const flatRecords = sources.flatMap((source) =>
    (Array.isArray(source.records) ? source.records : [])
      .filter((record) => record && record.date && record.tokens)
      .map((record) => ({
        tool: record.tool,
        model: record.model,
        date: record.date,
        tokens: record.tokens,
        inputTokens: record.inputTokens || 0,
        cacheTokens: record.cacheTokens || 0,
        outputTokens: record.outputTokens || 0,
        cost: safeNumber(record.cost),
        sessionId: record.sessionId || "",
        timestampMs: record.timestampMs || 0,
        sourceId: source.id,
      })),
  );
  return {
    ...aggregates,
    _flatRecords: flatRecords,
    sourceMode: "agentdesk-native-scanner",
    scanner: {
      name: PRODUCT_SCANNER_NAME,
      product: PRODUCT_NAME,
      embedded: true,
      ok: true,
      externalCommand: false,
    },
    metric: "effective call total = input + output + cache_read + cache_write after session-version selection and request dedupe",
  };
}

// ─── Projects (session cwd aggregation) ─────────────────────────────────────

function ensureAgentdeskHome() {
  try {
    fs.mkdirSync(AGENTDESK_HOME, { recursive: true });
  } catch {
    // ignore
  }
}

function loadProjectOverrides() {
  try {
    if (!fs.existsSync(PROJECT_OVERRIDES_FILE)) return {};
    const parsed = JSON.parse(fs.readFileSync(PROJECT_OVERRIDES_FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveProjectOverrides(overrides) {
  ensureAgentdeskHome();
  fs.writeFileSync(PROJECT_OVERRIDES_FILE, JSON.stringify(overrides, null, 2), "utf8");
}

function normalizeCwd(cwd) {
  if (!cwd || typeof cwd !== "string") return null;
  let value = cwd.trim();
  if (!value) return null;
  try {
    value = path.resolve(value);
  } catch {
    return null;
  }
  if (value.length > 1 && value.endsWith(path.sep)) value = value.slice(0, -1);
  return value;
}

function detectGitRoot(cwd) {
  let current = normalizeCwd(cwd);
  if (!current) return null;
  for (let i = 0; i < 8; i += 1) {
    const gitPath = path.join(current, ".git");
    try {
      if (fs.existsSync(gitPath)) return current;
    } catch {
      // ignore
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function isTempCwd(cwd) {
  const value = normalizeCwd(cwd);
  if (!value) return true;
  if (value === HOME) return true;
  const lower = value.toLowerCase();
  if (value.startsWith("/tmp") || value.startsWith("/private/tmp") || value.startsWith("/var/folders")) return true;
  if (/\/(tmp|temp|cache|caches|downloads|trash)(\/|$)/i.test(value)) return true;
  if (lower.includes("/.cache/") || lower.includes("/library/caches/")) return true;
  return false;
}

const PROJECT_KIND_LABELS = {
  ai_coding: "AI 编程",
  content: "内容创作",
  ops: "Agent/运维",
  media: "媒体视频",
  research: "调研学习",
  other: "其他",
  temp: "临时任务",
  unknown: "未分类",
};

function defaultProjectKind(cwd, gitRoot) {
  const value = String(cwd || "");
  if (/\/\.(openclaw|hermes|claude|codex|grok|cursor|trae|agents)(\/|$)/i.test(value)) {
    return { kind: "ops", confidence: 0.7 };
  }
  if (isTempCwd(cwd) && !gitRoot) return { kind: "temp", confidence: 0.72 };
  if (/video|hyperframes|remotion|动画|视频/i.test(value)) return { kind: "media", confidence: 0.55 };
  if (/article|blog|wechat|公众号|写作|content/i.test(value)) return { kind: "content", confidence: 0.5 };
  if (/research|skill|学习|调研|docs/i.test(value)) return { kind: "research", confidence: 0.45 };
  if (gitRoot) return { kind: "ai_coding", confidence: 0.6 };
  if (valueHasProjectHint(cwd)) return { kind: "ai_coding", confidence: 0.52 };
  return { kind: "unknown", confidence: 0.35 };
}

function valueHasProjectHint(cwd) {
  return /\/(projects?|dev|code|src|github|gitlab|work|repos?|Documents|Desktop)(\/|$)/i.test(String(cwd || ""));
}

function projectDisplayName(cwd, gitRoot) {
  const base = gitRoot || cwd || "unknown";
  return path.basename(base) || base;
}

function projectKeyFor(cwd, gitRoot) {
  const keyPath = gitRoot || cwd;
  return `path:${normalizeCwd(keyPath) || "unknown"}`;
}

function displayPath(absPath) {
  const value = normalizeCwd(absPath);
  if (!value) return "";
  if (value === HOME) return "~";
  if (value.startsWith(HOME + path.sep)) return "~" + value.slice(HOME.length);
  return value;
}

/** Best-effort decode of Claude/Cursor dashed project folder names. */
function decodeDashedWorkspaceName(name) {
  if (!name || typeof name !== "string") return null;
  if (/^var-folders/i.test(name) || /^\d{10,}$/.test(name) || name === "empty-window") return null;
  let s = name.startsWith("-") ? name.slice(1) : name;
  if (!/^(Users|home|private|Volumes)/i.test(s) && !s.startsWith("Users-")) return null;
  // Collapse runs of dashes that often encode spaces or repeated separators
  s = s.replace(/-{2,}/g, "-");
  const decoded = "/" + s.replace(/-/g, "/");
  return normalizeCwd(decoded);
}

function fileMtimeIso(file) {
  try {
    return new Date(fs.statSync(file).mtimeMs).toISOString();
  } catch {
    return null;
  }
}

function readJsonlHead(file, maxLines = 40) {
  try {
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/).filter(Boolean);
    const out = [];
    for (const line of lines.slice(0, maxLines)) {
      try {
        out.push(JSON.parse(line));
      } catch {
        // ignore
      }
    }
    return out;
  } catch {
    return [];
  }
}

function pushSessionRecord(bucket, record) {
  const cwd = normalizeCwd(record.cwd);
  if (!cwd) return;
  const gitRoot = record.gitRoot || detectGitRoot(cwd);
  const key = projectKeyFor(cwd, gitRoot);
  let project = bucket.get(key);
  if (!project) {
    const inferred = defaultProjectKind(cwd, gitRoot);
    project = {
      projectKey: key,
      cwd,
      gitRoot: gitRoot || null,
      path: displayPath(gitRoot || cwd),
      displayName: projectDisplayName(cwd, gitRoot),
      kind: inferred.kind,
      confidence: inferred.confidence,
      inferredKind: inferred.kind,
      firstSeen: record.timestamp || null,
      lastSeen: record.timestamp || null,
      sessionCount: 0,
      sessions: [],
      agentsUsed: new Set(),
      titles: [],
      sources: new Set(),
    };
    bucket.set(key, project);
  }
  project.sessionCount += 1;
  if (record.agent) project.agentsUsed.add(record.agent);
  if (record.source) project.sources.add(record.source);
  if (record.title) project.titles.push(String(record.title).slice(0, 120));
  if (record.timestamp) {
    if (!project.firstSeen || record.timestamp < project.firstSeen) project.firstSeen = record.timestamp;
    if (!project.lastSeen || record.timestamp > project.lastSeen) project.lastSeen = record.timestamp;
  }
  // Keep a high cap so project detail can list history without re-scan loss.
  if (project.sessions.length < 800) {
    project.sessions.push({
      agent: record.agent,
      sessionId: record.sessionId || "",
      title: record.title || "",
      timestamp: record.timestamp || null,
      cwd: displayPath(cwd),
      source: record.source || "",
    });
  }
}

function summarizeProject(project, kind, displayName, agentsUsed, titleHint) {
  const kindLabel = PROJECT_KIND_LABELS[kind] || kind;
  const agents = agentsUsed.length ? agentsUsed.join("、") : "未知工具";
  const sessions = project.sessionCount;
  const name = displayName || project.displayName;
  const pathHint = project.path;
  if (kind === "temp") {
    return `临时/家目录类活动：约 ${sessions} 次会话，涉及 ${agents}。多为短时任务或未绑定仓库的操作。`;
  }
  if (kind === "ops") {
    return `Agent 工作区「${name}」：约 ${sessions} 次会话（${agents}），偏工具自身 workspace 而非业务仓库。`;
  }
  let line = `「${name}」推断为${kindLabel}项目，约 ${sessions} 次会话，工具：${agents}。`;
  if (titleHint) line += `线索：${titleHint.slice(0, 48)}。`;
  line += `路径 ${pathHint}`;
  return line;
}

function collectClaudeProjectSessions(bucket) {
  const root = path.join(HOME, ".claude", "projects");
  if (!fs.existsSync(root)) return;
  // 1) From jsonl cwd fields
  const files = walk(root, (file) => file.endsWith(".jsonl"), 12000);
  for (const file of files) {
    let cwd = null;
    let sessionId = "";
    let gitBranch = "";
    let firstTs = null;
    for (const entry of readJsonlHead(file, 50)) {
      if (entry.cwd && !cwd) cwd = entry.cwd;
      if (entry.sessionId && !sessionId) sessionId = entry.sessionId;
      if (entry.gitBranch && !gitBranch) gitBranch = entry.gitBranch;
      if (entry.timestamp && !firstTs) firstTs = entry.timestamp;
      if (cwd && sessionId) break;
    }
    // 2) Fallback: decode project folder name
    if (!cwd) {
      const projectDir = path.basename(path.dirname(file));
      cwd = decodeDashedWorkspaceName(projectDir);
    }
    if (!cwd) continue;
    pushSessionRecord(bucket, {
      agent: "Claude Code",
      source: "claude-jsonl",
      cwd,
      sessionId: sessionId || path.basename(file, ".jsonl"),
      timestamp: fileMtimeIso(file) || firstTs,
      title: gitBranch && gitBranch !== "HEAD" ? `branch:${gitBranch}` : "",
    });
  }
  // 3) Dirs without jsonl still count as seen workspaces
  try {
    for (const dirent of fs.readdirSync(root, { withFileTypes: true })) {
      if (!dirent.isDirectory()) continue;
      const decoded = decodeDashedWorkspaceName(dirent.name);
      if (!decoded) continue;
      const dirPath = path.join(root, dirent.name);
      const hasJsonl = walk(dirPath, (f) => f.endsWith(".jsonl"), 5).length > 0;
      if (hasJsonl) continue;
      pushSessionRecord(bucket, {
        agent: "Claude Code",
        source: "claude-project-dir",
        cwd: decoded,
        sessionId: `dir:${dirent.name}`,
        timestamp: fileMtimeIso(dirPath),
        title: "project-folder",
      });
    }
  } catch {
    // ignore
  }
}

function collectCodexProjectSessions(bucket) {
  const files = codexSessionFiles();
  for (const file of files) {
    let meta = null;
    for (const entry of readJsonlHead(file, 30)) {
      if (entry.type === "session_meta" && entry.payload) {
        meta = entry.payload;
        break;
      }
    }
    if (!meta || !meta.cwd) continue;
    pushSessionRecord(bucket, {
      agent: "Codex",
      source: "codex-session-meta",
      cwd: meta.cwd,
      sessionId: meta.session_id || meta.id || path.basename(file),
      timestamp: meta.timestamp || fileMtimeIso(file),
      title: meta.originator || meta.source || "",
    });
  }
}

function collectGrokProjectSessions(bucket) {
  const sessionsRoot = path.join(HOME, ".grok", "sessions");
  if (!fs.existsSync(sessionsRoot)) return;
  const summaries = walk(sessionsRoot, (file) => path.basename(file) === "summary.json", 8000);
  for (const file of summaries) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      const cwd = parsed?.info?.cwd;
      if (!cwd) continue;
      pushSessionRecord(bucket, {
        agent: "Grok",
        source: "grok-summary",
        cwd,
        sessionId: parsed?.info?.id || path.basename(path.dirname(file)),
        timestamp: parsed?.last_active_at || parsed?.updated_at || parsed?.created_at || fileMtimeIso(file),
        title: parsed?.generated_title || parsed?.session_summary || "",
      });
    } catch {
      // ignore
    }
  }
  // prompt_history also ties session ids to workspaces via parent folder encoding
  const histories = walk(sessionsRoot, (file) => path.basename(file) === "prompt_history.jsonl", 2000);
  for (const file of histories) {
    const parent = path.basename(path.dirname(file));
    const decoded = decodeDashedWorkspaceName(parent.replace(/%2F/g, "/").replace(/^%2F/, ""));
    // grok uses URL-encoded path folders like %2FUsers%2Fdulipeng
    let cwd = null;
    try {
      cwd = decodeURIComponent(parent);
      if (cwd.startsWith("/")) {
        /* ok */
      } else if (parent.includes("%2F")) {
        cwd = decodeURIComponent(parent);
      } else {
        cwd = decoded;
      }
    } catch {
      cwd = decoded;
    }
    if (!cwd || !cwd.startsWith("/")) continue;
    pushSessionRecord(bucket, {
      agent: "Grok",
      source: "grok-prompt-history",
      cwd,
      sessionId: `history:${parent}`,
      timestamp: fileMtimeIso(file),
      title: "prompt-history",
    });
  }
}

function collectOpenClawProjectSessions(bucket) {
  const agentsRoot = path.join(HOME, ".openclaw", "agents");
  if (fs.existsSync(agentsRoot)) {
    const sessionFiles = walk(
      agentsRoot,
      (file) => file.endsWith(".jsonl") && file.includes(`${path.sep}sessions${path.sep}`),
      8000,
    );
    for (const file of sessionFiles) {
      const head = readJsonlHead(file, 5);
      let cwd = null;
      let sessionId = path.basename(file, ".jsonl");
      let ts = null;
      for (const entry of head) {
        if (entry.type === "session" && entry.cwd) {
          cwd = entry.cwd;
          sessionId = entry.id || sessionId;
          ts = entry.timestamp || ts;
          break;
        }
        if (entry.cwd && !cwd) cwd = entry.cwd;
      }
      if (!cwd) continue;
      pushSessionRecord(bucket, {
        agent: "OpenClaw",
        source: "openclaw-session",
        cwd,
        sessionId,
        timestamp: ts || fileMtimeIso(file),
        title: path.basename(path.dirname(path.dirname(file))), // agent name
      });
    }
  }
  const workspaces = [
    path.join(HOME, ".openclaw", "workspace"),
    path.join(HOME, ".openclaw", "workspace-dev"),
  ];
  for (const ws of workspaces) {
    if (!fs.existsSync(ws)) continue;
    pushSessionRecord(bucket, {
      agent: "OpenClaw",
      source: "openclaw-workspace",
      cwd: ws,
      sessionId: `workspace:${path.basename(ws)}`,
      timestamp: fileMtimeIso(ws),
      title: "openclaw-workspace",
    });
  }
}

function collectCursorProjectSessions(bucket) {
  // 1) workspaceStorage workspace.json
  const storage = path.join(HOME, "Library", "Application Support", "Cursor", "User", "workspaceStorage");
  if (fs.existsSync(storage)) {
    let dirs = [];
    try {
      dirs = fs.readdirSync(storage, { withFileTypes: true }).filter((d) => d.isDirectory());
    } catch {
      dirs = [];
    }
    for (const dirent of dirs.slice(0, 400)) {
      const wsFile = path.join(storage, dirent.name, "workspace.json");
      if (!fs.existsSync(wsFile)) continue;
      try {
        const parsed = JSON.parse(fs.readFileSync(wsFile, "utf8"));
        const folder = parsed.folder || "";
        if (!folder.startsWith("file://")) continue;
        let cwd = decodeURIComponent(folder.replace("file://", ""));
        if (process.platform === "win32" && /^\/[A-Za-z]:/.test(cwd)) cwd = cwd.slice(1);
        pushSessionRecord(bucket, {
          agent: "Cursor",
          source: "cursor-workspaceStorage",
          cwd,
          sessionId: `cursor-ws:${dirent.name}`,
          timestamp: fileMtimeIso(wsFile),
          title: "cursor-workspace",
        });
      } catch {
        // ignore
      }
    }
  }
  // 2) ~/.cursor/projects dashed names
  const projectsRoot = path.join(HOME, ".cursor", "projects");
  if (!fs.existsSync(projectsRoot)) return;
  try {
    for (const dirent of fs.readdirSync(projectsRoot, { withFileTypes: true })) {
      if (!dirent.isDirectory()) continue;
      const decoded = decodeDashedWorkspaceName(dirent.name);
      if (!decoded) continue;
      pushSessionRecord(bucket, {
        agent: "Cursor",
        source: "cursor-projects-dir",
        cwd: decoded,
        sessionId: `cursor-proj:${dirent.name}`,
        timestamp: fileMtimeIso(path.join(projectsRoot, dirent.name)),
        title: "cursor-project",
      });
    }
  } catch {
    // ignore
  }
}

function collectGeminiProjectSessions(bucket) {
  const file = path.join(HOME, ".gemini", "projects.json");
  if (!fs.existsSync(file)) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const projects = parsed.projects || parsed;
    if (!projects || typeof projects !== "object") return;
    for (const [cwd, label] of Object.entries(projects)) {
      if (!cwd || cwd === "/") continue;
      pushSessionRecord(bucket, {
        agent: "Gemini CLI",
        source: "gemini-projects-json",
        cwd,
        sessionId: `gemini:${label || path.basename(cwd)}`,
        timestamp: fileMtimeIso(file),
        title: String(label || ""),
      });
    }
  } catch {
    // ignore
  }
}

function collectTraeProjectSessions(bucket) {
  const root = path.join(HOME, ".trae", "session_work_dirs");
  if (!fs.existsSync(root)) return;
  let dirs = [];
  try {
    dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch {
    return;
  }
  for (const dirent of dirs.slice(0, 500)) {
    const dir = path.join(root, dirent.name);
    // look for a path marker file
    let cwd = null;
    for (const name of ["cwd", "work_dir", "path.txt", "workspace.json", "meta.json"]) {
      const f = path.join(dir, name);
      if (!fs.existsSync(f)) continue;
      try {
        const text = fs.readFileSync(f, "utf8").trim();
        if (text.startsWith("{")) {
          const j = JSON.parse(text);
          cwd = j.cwd || j.path || j.workDir || j.workspace;
        } else if (text.startsWith("/")) {
          cwd = text.split(/\r?\n/)[0];
        }
      } catch {
        // ignore
      }
      if (cwd) break;
    }
    // symlink target?
    if (!cwd) {
      try {
        const lst = fs.lstatSync(dir);
        if (lst.isSymbolicLink()) cwd = fs.readlinkSync(dir);
      } catch {
        // ignore
      }
    }
    if (!cwd) continue;
    pushSessionRecord(bucket, {
      agent: "Trae",
      source: "trae-session-work-dirs",
      cwd,
      sessionId: `trae:${dirent.name}`,
      timestamp: fileMtimeIso(dir),
      title: "trae-session",
    });
  }
}

function collectHermesProjectSessions(bucket) {
  const skills = path.join(HOME, ".hermes", "skills");
  // Hermes rarely stores project cwd; use config home as weak ops signal only if skills exist
  if (fs.existsSync(path.join(HOME, ".hermes"))) {
    pushSessionRecord(bucket, {
      agent: "Hermes",
      source: "hermes-home",
      cwd: path.join(HOME, ".hermes"),
      sessionId: "hermes-home",
      timestamp: fileMtimeIso(path.join(HOME, ".hermes")),
      title: "hermes-config-home",
    });
  }
  // optional: hermes state db paths if present later
  void skills;
}

function scanProjects() {
  const bucket = new Map();
  const sourceStats = [];

  function run(name, fn) {
    const before = bucket.size;
    let sessions = 0;
    const sizeBefore = [...bucket.values()].reduce((s, p) => s + p.sessionCount, 0);
    try {
      fn(bucket);
    } catch (error) {
      sourceStats.push({ id: name, ok: false, error: error.message, projectsAdded: 0, sessions: 0 });
      return;
    }
    const sizeAfter = [...bucket.values()].reduce((s, p) => s + p.sessionCount, 0);
    sessions = sizeAfter - sizeBefore;
    sourceStats.push({
      id: name,
      ok: true,
      projectsAdded: bucket.size - before,
      sessions,
    });
  }

  run("claude", collectClaudeProjectSessions);
  run("codex", collectCodexProjectSessions);
  run("grok", collectGrokProjectSessions);
  run("openclaw", collectOpenClawProjectSessions);
  run("cursor", collectCursorProjectSessions);
  run("gemini", collectGeminiProjectSessions);
  run("trae", collectTraeProjectSessions);
  run("hermes", collectHermesProjectSessions);

  const overrides = loadProjectOverrides();
  const detailByKey = {};
  const projects = [...bucket.values()].map((project) => {
    const override = overrides[project.projectKey] || {};
    const agentsUsed = [...project.agentsUsed].sort();
    const kind = override.kind || project.kind;
    const displayName = override.displayName || project.displayName;
    const pinned = !!override.pinned;
    const notes = override.notes || "";
    const titleHint =
      project.titles.filter(Boolean).sort((a, b) => b.length - a.length)[0] || "";
    const summary =
      override.summary ||
      summarizeProject(project, kind, displayName, agentsUsed, titleHint);
    const allSessions = (project.sessions || [])
      .slice()
      .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
    const full = {
      projectKey: project.projectKey,
      displayName,
      path: project.path,
      cwd: displayPath(project.cwd),
      gitRoot: project.gitRoot ? displayPath(project.gitRoot) : null,
      kind,
      kindLabel: PROJECT_KIND_LABELS[kind] || kind,
      inferredKind: project.inferredKind,
      confidence: override.kind ? 1 : project.confidence,
      pinned,
      notes,
      summary,
      firstSeen: project.firstSeen,
      lastSeen: project.lastSeen,
      sessionCount: project.sessionCount,
      agentsUsed,
      titleHint,
      sources: [...(project.sources || [])],
      sessions: allSessions,
      isTemp: kind === "temp",
    };
    detailByKey[project.projectKey] = full;
    // List payload: keep only a short session preview for bandwidth.
    return {
      ...full,
      sessions: allSessions.slice(0, 5),
      sessionPreviewCount: Math.min(5, allSessions.length),
    };
  });

  projects.sort((a, b) => String(b.lastSeen || "").localeCompare(String(a.lastSeen || "")));

  const byKind = {};
  for (const project of projects) {
    byKind[project.kind] = (byKind[project.kind] || 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    projectCount: projects.length,
    formalCount: projects.filter((p) => !["temp", "unknown"].includes(p.kind)).length,
    tempCount: projects.filter((p) => p.kind === "temp").length,
    unknownCount: projects.filter((p) => p.kind === "unknown").length,
    sessionTotal: projects.reduce((s, p) => s + p.sessionCount, 0),
    byKind,
    projects,
    _detailByKey: detailByKey,
    overridesPath: displayPath(PROJECT_OVERRIDES_FILE),
    sourceStats,
    sources: [
      { id: "claude", name: "Claude Code", rule: "projects/**/*.jsonl cwd + 目录名解码" },
      { id: "codex", name: "Codex", rule: "session_meta.payload.cwd (+archived)" },
      { id: "grok", name: "Grok", rule: "summary.json + prompt_history 目录" },
      { id: "openclaw", name: "OpenClaw", rule: "agents/**/sessions/*.jsonl cwd" },
      { id: "cursor", name: "Cursor", rule: "workspaceStorage + ~/.cursor/projects" },
      { id: "gemini", name: "Gemini CLI", rule: "~/.gemini/projects.json" },
      { id: "trae", name: "Trae", rule: "session_work_dirs（有 path 标记时）" },
      { id: "hermes", name: "Hermes", rule: "配置主目录弱信号" },
    ],
  };
}

function updateProjectOverride(body = {}) {
  const projectKey = body.projectKey || body.key;
  if (!projectKey) throw new Error("缺少 projectKey");
  const overrides = loadProjectOverrides();
  const current = overrides[projectKey] || {};
  const next = { ...current };
  if (body.displayName != null) next.displayName = String(body.displayName).slice(0, 120);
  if (body.kind != null) {
    const allowed = new Set(["ai_coding", "content", "ops", "media", "research", "other", "temp", "unknown"]);
    if (!allowed.has(body.kind)) throw new Error("非法 kind");
    next.kind = body.kind;
  }
  if (body.pinned != null) next.pinned = Boolean(body.pinned);
  if (body.notes != null) next.notes = String(body.notes).slice(0, 500);
  if (body.summary != null) next.summary = String(body.summary).slice(0, 300);
  if (body.clear) {
    delete overrides[projectKey];
  } else {
    overrides[projectKey] = next;
  }
  saveProjectOverrides(overrides);
  projectsCache = null;
  return { ok: true, projectKey, override: overrides[projectKey] || null, inventory: scanProjects() };
}

function normalizeSessionId(value) {
  return String(value || "").trim();
}

function sessionIdVariants(id) {
  const raw = normalizeSessionId(id);
  if (!raw) return [];
  const out = new Set([raw]);
  // strip common prefixes used in synthetic ids
  out.add(raw.replace(/^dir:/, ""));
  out.add(raw.replace(/^history:/, ""));
  out.add(raw.replace(/^cursor-ws:/, ""));
  out.add(raw.replace(/^cursor-proj:/, ""));
  out.add(raw.replace(/^gemini:/, ""));
  out.add(raw.replace(/^trae:/, ""));
  out.add(raw.replace(/^workspace:/, ""));
  out.add(raw.replace(/^agent-ws:/, ""));
  // basename without extension
  if (raw.includes("/")) out.add(path.basename(raw));
  if (raw.endsWith(".jsonl")) out.add(raw.replace(/\.jsonl$/, ""));
  return [...out].filter(Boolean);
}

function matchUsageRecordsForProject(project, flatRecords) {
  const sessionKeys = new Set();
  for (const session of project.sessions || []) {
    for (const variant of sessionIdVariants(session.sessionId)) {
      sessionKeys.add(variant);
    }
  }
  const agentTools = new Set(project.agentsUsed || []);
  // date set from sessions for soft match
  const sessionDates = new Set();
  for (const session of project.sessions || []) {
    if (session.timestamp) {
      const day = dayFromTimestamp(session.timestamp);
      if (day) sessionDates.add(day);
    }
  }

  const hard = [];
  const soft = [];
  for (const record of flatRecords) {
    const rid = normalizeSessionId(record.sessionId);
    let hardHit = false;
    if (rid) {
      for (const variant of sessionIdVariants(rid)) {
        if (sessionKeys.has(variant)) {
          hardHit = true;
          break;
        }
      }
    }
    if (hardHit) {
      hard.push({ ...record, match: "session" });
      continue;
    }
    // Soft: same calendar day + same tool family, only when project has sparse hard matches later
    if (agentTools.has(record.tool) && sessionDates.has(record.date)) {
      soft.push({ ...record, match: "tool-date" });
    }
  }

  // Prefer hard matches; if none, fall back to soft with a note
  const useSoft = hard.length === 0 && soft.length > 0;
  const matched = useSoft ? soft : hard;
  const byDay = new Map();
  const byTool = new Map();
  const byModel = new Map();
  let tokens = 0;
  let cost = 0;
  let inputTokens = 0;
  let cacheTokens = 0;
  let outputTokens = 0;
  for (const record of matched) {
    tokens += record.tokens;
    cost += safeNumber(record.cost);
    inputTokens += record.inputTokens || 0;
    cacheTokens += record.cacheTokens || 0;
    outputTokens += record.outputTokens || 0;
    byDay.set(record.date, (byDay.get(record.date) || 0) + record.tokens);
    byTool.set(record.tool, (byTool.get(record.tool) || 0) + record.tokens);
    byModel.set(record.model || "unknown", (byModel.get(record.model || "unknown") || 0) + record.tokens);
  }

  return {
    matchMode: useSoft ? "tool-date-fallback" : hard.length ? "session-id" : "none",
    matchNote:
      useSoft
        ? "未能用 sessionId 精确关联用量，已按「同工具 + 会话活跃日」估算，可能偏大。"
        : hard.length
          ? "已通过 sessionId 精确关联用量记录。"
          : "未找到可关联的用量记录（该 Agent 可能未落盘 token，或 sessionId 不一致）。",
    recordCount: matched.length,
    tokens,
    cost,
    inputTokens,
    cacheTokens,
    outputTokens,
    byDay: [...byDay.entries()]
      .map(([date, value]) => ({ date, tokens: value }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    byTool: [...byTool.entries()]
      .map(([name, value]) => ({ name, tokens: value }))
      .sort((a, b) => b.tokens - a.tokens),
    byModel: [...byModel.entries()]
      .map(([name, value]) => ({ name, tokens: value }))
      .sort((a, b) => b.tokens - a.tokens),
    recent: matched
      .slice()
      .sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0) || String(b.date).localeCompare(String(a.date)))
      .slice(0, 40)
      .map((record) => ({
        date: record.date,
        tool: record.tool,
        model: record.model,
        tokens: record.tokens,
        cost: record.cost,
        sessionId: record.sessionId,
        match: record.match,
      })),
  };
}

function getProjectDetail(projectKey, options = {}) {
  if (!projectKey) throw new Error("缺少 projectKey");
  const inventory = getProjects(!!options.refreshProjects);
  const full =
    (inventory._detailByKey && inventory._detailByKey[projectKey]) ||
    (inventory.projects || []).find((item) => item.projectKey === projectKey);
  if (!full) throw new Error(`未找到项目: ${projectKey}`);

  const sessions = (full.sessions || [])
    .slice()
    .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));

  const usage = getUsage(!!options.refreshUsage);
  const flat = Array.isArray(usage._flatRecords) ? usage._flatRecords : [];
  const usageLink = matchUsageRecordsForProject({ ...full, sessions }, flat);

  const tokensBySession = new Map();
  for (const record of flat) {
    for (const variant of sessionIdVariants(record.sessionId)) {
      tokensBySession.set(variant, (tokensBySession.get(variant) || 0) + record.tokens);
    }
  }
  const sessionsEnriched = sessions.map((session) => {
    let tokens = 0;
    for (const variant of sessionIdVariants(session.sessionId)) {
      if (tokensBySession.has(variant)) tokens = Math.max(tokens, tokensBySession.get(variant) || 0);
    }
    return { ...session, tokens: tokens || null };
  });

  // Strip internal-only fields from list payload if present
  const { sessions: _s, ...projectPublic } = full;

  return {
    generatedAt: new Date().toISOString(),
    project: {
      ...projectPublic,
      sessions: sessionsEnriched,
      sessionCount: full.sessionCount || sessionsEnriched.length,
    },
    usage: usageLink,
    relatedSkillsHint:
      full.kind === "media"
        ? ["hyperframes", "media-use", "product-launch-video"]
        : full.kind === "ops"
          ? ["find-skills", "lark-shared"]
          : full.kind === "content"
            ? ["omni-article-creator", "wechat-article-typesetting"]
            : ["review", "implement", "design"],
  };
}

function buildOverview() {
  const usage = getUsage(false);
  const skills = getSkills(false);
  const projects = getProjects(false);
  const today = dayFromTimestamp(new Date().toISOString());
  const todayRow = (usage.days || []).find((day) => day.date === today) || null;
  const last7 = (usage.days || []).slice(-7);
  const cost7 = last7.reduce((sum, day) => sum + Number(day.cost || 0), 0);
  const activeAgents = (usage.sources || []).filter((source) => source.records > 0).length;
  const skillConflicts = (skills.skills || []).filter((skill) => (skill.presentOn || []).length >= 2).length;
  const partialSkills = (skills.skills || []).filter((skill) => (skill.syncTargets || []).length > 0).length;

  return {
    generatedAt: new Date().toISOString(),
    product: { name: PRODUCT_NAME, tagline: PRODUCT_TAGLINE, formerName: "Token Ledger" },
    metrics: {
      todayTokens: todayRow ? todayRow.tokens : 0,
      todayCost: todayRow ? todayRow.cost : 0,
      totalTokens: usage.totalTokens || 0,
      cost7,
      activeAgents,
      skillCount: skills.skillCount || 0,
      skillLocations: skills.locationCount || 0,
      partialSkills,
      skillConflicts,
      projectCount: projects.projectCount || 0,
      formalProjects: projects.formalCount || 0,
      tempProjects: projects.tempCount || 0,
    },
    topTools: (usage.tools || []).slice(0, 5),
    topProjects: (projects.projects || []).filter((p) => !p.isTemp).slice(0, 6),
    agents: (skills.agents || []).map((agent) => ({
      id: agent.id,
      name: agent.name,
      skillCount: agent.skillCount,
    })),
    sources: usage.sources || [],
  };
}

let cache = null;
let cacheTime = 0;
let skillsCache = null;
let skillsCacheTime = 0;
let projectsCache = null;
let projectsCacheTime = 0;

function getUsage(force = false) {
  if (!force && cache && Date.now() - cacheTime < 30_000) return cache;
  cache = scanUsage();
  cacheTime = Date.now();
  return cache;
}

function getSkills(force = false) {
  if (!force && skillsCache && Date.now() - skillsCacheTime < 15_000) return skillsCache;
  skillsCache = scanSkills();
  skillsCacheTime = Date.now();
  return skillsCache;
}

function getProjects(force = false) {
  if (!force && projectsCache && Date.now() - projectsCacheTime < 20_000) return projectsCache;
  projectsCache = scanProjects();
  projectsCacheTime = Date.now();
  return projectsCache;
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error("请求体过大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8") || "{}";
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("JSON 解析失败"));
      }
    });
    req.on("error", reject);
  });
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "Content-Type",
    });
    res.end();
    return;
  }
  if (url.pathname === "/api/usage") {
    try {
      const data = getUsage(url.searchParams.get("refresh") === "1");
      // Never ship internal flat records to the browser (large).
      const { _flatRecords, ...publicUsage } = data;
      sendJson(res, publicUsage);
    } catch (error) {
      sendJson(res, { error: error.message }, 500);
    }
    return;
  }
  if (url.pathname === "/api/skills" && req.method === "GET") {
    try {
      sendJson(res, getSkills(url.searchParams.get("refresh") === "1"));
    } catch (error) {
      sendJson(res, { error: error.message }, 500);
    }
    return;
  }
  if (url.pathname === "/api/skills/copy" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      sendJson(
        res,
        skillCopy({
          folderName: body.folderName || body.skill || body.name,
          fromAgent: body.fromAgent || body.from || null,
          toAgents: body.toAgents || body.to || body.targets,
          mode: body.mode || "copy",
        }),
      );
    } catch (error) {
      sendJson(res, { error: error.message }, 400);
    }
    return;
  }
  if (url.pathname === "/api/skills/remove" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      sendJson(
        res,
        skillRemove({
          folderName: body.folderName || body.skill || body.name,
          agentId: body.agentId || body.agent || body.toAgent,
        }),
      );
    } catch (error) {
      sendJson(res, { error: error.message }, 400);
    }
    return;
  }
  if (url.pathname === "/api/projects" && req.method === "GET") {
    try {
      const data = getProjects(url.searchParams.get("refresh") === "1");
      const { _detailByKey, ...publicProjects } = data;
      sendJson(res, publicProjects);
    } catch (error) {
      sendJson(res, { error: error.message }, 500);
    }
    return;
  }
  if (url.pathname === "/api/projects/detail" && req.method === "GET") {
    try {
      const projectKey = url.searchParams.get("key") || url.searchParams.get("projectKey");
      sendJson(
        res,
        getProjectDetail(projectKey, {
          refreshProjects: url.searchParams.get("refresh") === "1",
          refreshUsage: url.searchParams.get("refresh") === "1",
        }),
      );
    } catch (error) {
      sendJson(res, { error: error.message }, 404);
    }
    return;
  }
  if (url.pathname === "/api/projects/override" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      sendJson(res, updateProjectOverride(body));
    } catch (error) {
      sendJson(res, { error: error.message }, 400);
    }
    return;
  }
  if (url.pathname === "/api/overview" && req.method === "GET") {
    try {
      if (url.searchParams.get("refresh") === "1") {
        cache = null;
        skillsCache = null;
        projectsCache = null;
      }
      sendJson(res, buildOverview());
    } catch (error) {
      sendJson(res, { error: error.message }, 500);
    }
    return;
  }
  if (url.pathname === "/api/product" && req.method === "GET") {
    sendJson(res, {
      name: PRODUCT_NAME,
      tagline: PRODUCT_TAGLINE,
      formerName: "Token Ledger",
      version: "1.3.0",
      products: [
        { id: "overview", name: "总览", path: "/#overview" },
        { id: "usage", name: "用量", path: "/#usage" },
        { id: "projects", name: "项目", path: "/#projects" },
        { id: "skills", name: "能力", path: "/#skills" },
      ],
      tools: Object.values(TOOL_NAMES),
    });
    return;
  }
  serveStatic(req, res);
});

function shouldOpenBrowser() {
  // LaunchAgent / 后台守护默认不弹浏览器，避免端口冲突时反复 open 刷屏。
  // 手动调试可设 OPEN_BROWSER=1；显式关闭用 TOKEN_LEDGER_NO_OPEN=1 或 OPEN_BROWSER=0。
  const noOpen = ["1", "true", "yes"].includes(String(process.env.TOKEN_LEDGER_NO_OPEN || "").toLowerCase());
  if (noOpen) return false;
  const flag = String(process.env.OPEN_BROWSER || "").toLowerCase();
  if (["0", "false", "no"].includes(flag)) return false;
  if (["1", "true", "yes"].includes(flag)) return true;
  // 交互式终端启动时默认打开一次；被 launchd/nohup 拉起时不打开。
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function openBrowserOnce(url) {
  if (!shouldOpenBrowser()) {
    console.log(`ℹ️  已跳过自动打开浏览器（后台/守护模式）。请手动访问: ${url}`);
    return;
  }
  const { exec } = require("child_process");
  const openCommand =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
        ? `start "" "${url}"`
        : "";
  if (!openCommand) return;
  exec(openCommand, () => {});
}

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`\n❌ 端口 ${PORT} 已被占用：${PRODUCT_NAME} 多半已经在运行。`);
    console.error(`👉 请直接访问 http://127.0.0.1:${PORT}`);
    console.error("👉 不会自动打开浏览器（避免 launchd/重复启动时无限弹窗）。");
    // 退出码 0：告诉 launchd「服务已可用」，配合 KeepAlive.SuccessfulExit=false 避免死循环重启。
    process.exit(0);
  } else {
    console.error("\n❌ 发生未知错误：", e.message);
    process.exit(1);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  const startUrl = `http://127.0.0.1:${PORT}`;
  console.log(`\n✅ ${PRODUCT_NAME} 启动成功！（${PRODUCT_TAGLINE}）`);
  console.log(`👉 本地地址: ${startUrl}`);
  console.log(`(原 Token Ledger · 关闭此进程即停止服务)\n`);
  openBrowserOnce(startUrl);
});
