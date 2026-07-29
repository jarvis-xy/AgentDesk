let usage = null;
let skills = null;
let projects = null;
let overview = null;
let activeScope = "all";
let activeProduct = "overview";
let modelExpanded = false;
let selectedSkillKey = null;

const themeStorageKey = "agentdesk-theme";
const apiBase = window.location.protocol === "file:" ? "http://127.0.0.1:5188" : "";

const kindLabels = {
  ai_coding: "AI 编程",
  content: "内容",
  ops: "运维",
  media: "媒体",
  research: "调研",
  other: "其他",
  temp: "临时",
  unknown: "未知",
};

// DOM
const themeToggleButton = document.querySelector("#theme-toggle");
const productTabs = document.querySelectorAll(".product-tab");
const productOverview = document.querySelector("#product-overview");
const productUsage = document.querySelector("#product-usage");
const productProjects = document.querySelector("#product-projects");
const productSkills = document.querySelector("#product-skills");

const overviewMetricsEl = document.querySelector("#overview-metrics");
const overviewProjectsEl = document.querySelector("#overview-projects");
const overviewToolsEl = document.querySelector("#overview-tools");
const overviewAgentsEl = document.querySelector("#overview-agents");
const overviewRescanButton = document.querySelector("#overview-rescan");

const metricsEl = document.querySelector("#metrics");
const barsEl = document.querySelector("#bars");
const barScrollEl = document.querySelector("#bar-scroll");
const toolShareEl = document.querySelector("#tool-share");
const modelListEl = document.querySelector("#model-list");
const heatmapEl = document.querySelector("#heatmap");
const heatmapMonthsEl = document.querySelector("#heatmap-months");
const activityEl = document.querySelector("#activity");
const diagnosticsEl = document.querySelector("#diagnostics");
const trendPanelEl = document.querySelector(".trend-panel");
const toolSharePanelEl = document.querySelector("#tool-panel");
const modelPanelEl = document.querySelector("#model-panel");
const modelToggleButton = document.querySelector("#model-toggle");
const calendarPanelEl = document.querySelector("#calendar-panel");
const activityPanelEl = document.querySelector(".activity-panel");
const scopeTitleEl = document.querySelector("#scope-title");
const trendTotalEl = document.querySelector("#trend-total");
const rescanButton = document.querySelector("#rescan");
const scopeNavEl = document.querySelector(".segmented");

const projectsMetricsEl = document.querySelector("#projects-metrics");
const projectsTableEl = document.querySelector("#projects-table");
const projectsSearchEl = document.querySelector("#projects-search");
const projectsHideTempEl = document.querySelector("#projects-hide-temp");
const projectsHideUnknownEl = document.querySelector("#projects-hide-unknown");
const projectsKindFilterEl = document.querySelector("#projects-kind-filter");
const projectsSourceStatsEl = document.querySelector("#projects-source-stats");
const projectsRescanButton = document.querySelector("#projects-rescan");
const projectsTitleEl = document.querySelector("#projects-title");
const projectDetailPanel = document.querySelector("#project-detail-panel");
const projectDetailTitle = document.querySelector("#project-detail-title");
const projectDetailSummary = document.querySelector("#project-detail-summary");
const projectDetailMetrics = document.querySelector("#project-detail-metrics");
const projectDetailClose = document.querySelector("#project-detail-close");
const projectUsageNote = document.querySelector("#project-usage-note");
const projectUsageTools = document.querySelector("#project-usage-tools");
const projectUsageModels = document.querySelector("#project-usage-models");
const projectUsageDays = document.querySelector("#project-usage-days");
const projectSessionsEl = document.querySelector("#project-sessions");
const projectRelatedSkillsEl = document.querySelector("#project-related-skills");

const skillsMetricsEl = document.querySelector("#skills-metrics");
const skillsAgentsEl = document.querySelector("#skills-agents");
const skillsCategoriesEl = document.querySelector("#skills-categories");
const skillsTableEl = document.querySelector("#skills-table");
const skillsSearchEl = document.querySelector("#skills-search");
const skillsOnlyPartialEl = document.querySelector("#skills-only-partial");
const skillsCategoryFilterEl = document.querySelector("#skills-category-filter");
const skillsRescanButton = document.querySelector("#skills-rescan");
const skillsTitleEl = document.querySelector("#skills-title");
const skillsActionPanel = document.querySelector("#skills-action-panel");
const skillsActionTitle = document.querySelector("#skills-action-title");
const skillsActionDesc = document.querySelector("#skills-action-desc");
const skillsFromAgent = document.querySelector("#skills-from-agent");
const skillsMode = document.querySelector("#skills-mode");
const skillsTargets = document.querySelector("#skills-targets");
const skillsCopyBtn = document.querySelector("#skills-copy-btn");
const skillsActionStatus = document.querySelector("#skills-action-status");
const skillsActionClose = document.querySelector("#skills-action-close");

const tooltip = document.createElement("div");
tooltip.className = "usage-tooltip";
document.body.append(tooltip);

function getPreferredTheme() {
  const stored = localStorage.getItem(themeStorageKey) || localStorage.getItem("token-ledger-theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const label = theme === "light" ? "切换深色模式" : "切换浅色模式";
  themeToggleButton.setAttribute("aria-label", label);
  themeToggleButton.title = label;
}

applyTheme(getPreferredTheme());

function formatTokens(value) {
  const number = Number(value || 0);
  if (!number) return "0";
  if (Math.abs(number) >= 100_000_000) return `${trimNumber(number / 100_000_000)}亿`;
  return `${trimNumber(number / 10_000)}万`;
}

function formatCost(value) {
  const number = Number(value || 0);
  if (!number) return "$0.00";
  if (number >= 1000) return `$${trimNumber(number / 1000)}k`;
  return `$${number.toFixed(2)}`;
}

function formatCount(value) {
  return new Intl.NumberFormat("zh-CN").format(Number(value || 0));
}

function trimNumber(value) {
  const fixed = value >= 100 ? value.toFixed(1) : value.toFixed(2);
  return fixed.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

function formatDate(date) {
  if (!date) return "-";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });
}

function formatTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function setProduct(product) {
  // aliases from old hashes
  if (product === "tokens") product = "usage";
  activeProduct = product;
  productOverview.hidden = product !== "overview";
  productUsage.hidden = product !== "usage";
  productProjects.hidden = product !== "projects";
  productSkills.hidden = product !== "skills";
  productTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.product === product);
  });
  if (location.hash !== `#${product}`) history.replaceState(null, "", `#${product}`);

  if (product === "overview" && !overview) loadOverview(true).catch(showOverviewError);
  if (product === "usage" && !usage) loadUsage(true).catch(showUsageError);
  if (product === "projects" && !projects) loadProjects(true).catch(showProjectsError);
  if (product === "skills" && !skills) loadSkills(true).catch(showSkillsError);
}

function showOverviewError(error) {
  overviewMetricsEl.innerHTML = `<article class="metric-card"><strong>ERR</strong><span>${error.message}</span><small>请确认服务已启动</small></article>`;
}
function showUsageError(error) {
  scopeTitleEl.textContent = "扫描失败";
  metricsEl.innerHTML = `<article class="metric-card"><strong>ERR</strong><span>${error.message}</span><small>请确认服务已启动</small></article>`;
}
function showProjectsError(error) {
  projectsTitleEl.textContent = "项目扫描失败";
  projectsMetricsEl.innerHTML = `<article class="metric-card"><strong>ERR</strong><span>${error.message}</span><small>请确认服务已启动</small></article>`;
}
function showSkillsError(error) {
  skillsTitleEl.textContent = "Skill 扫描失败";
  skillsMetricsEl.innerHTML = `<article class="metric-card"><strong>ERR</strong><span>${error.message}</span><small>请确认服务已启动</small></article>`;
}

// ─── Overview ───────────────────────────────────────────────────────────────

function renderOverview() {
  if (!overview) return;
  const m = overview.metrics || {};
  const cards = [
    [formatCost(m.todayCost), "今日成本", formatTokens(m.todayTokens) + " token"],
    [formatCost(m.cost7), "近 7 日成本", "本地价格表估算"],
    [formatCount(m.activeAgents), "有用量的 Agent", "来自用量扫描"],
    [formatCount(m.formalProjects), "正式项目", `共 ${formatCount(m.projectCount)} · 临时 ${formatCount(m.tempProjects)}`],
    [formatCount(m.skillCount), "独立 Skill", `未对齐 ${formatCount(m.partialSkills)}`],
  ];
  overviewMetricsEl.replaceChildren();
  cards.forEach(([value, label, hint]) => {
    const card = document.createElement("article");
    card.className = "metric-card";
    card.innerHTML = `<strong>${value}</strong><span>${label}</span><small>${hint}</small>`;
    overviewMetricsEl.append(card);
  });

  overviewProjectsEl.replaceChildren();
  const topProjects = overview.topProjects || [];
  if (!topProjects.length) {
    overviewProjectsEl.innerHTML = `<div class="simple-row muted">暂无正式项目推断，去「项目」页查看全部。</div>`;
  } else {
    topProjects.forEach((project) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "simple-row clickable";
      row.innerHTML = `<strong>${escapeHtml(project.displayName)}</strong><span>${kindLabels[project.kind] || project.kind} · ${formatCount(project.sessionCount)} 会话 · ${formatTime(project.lastSeen)}</span>`;
      row.addEventListener("click", () => setProduct("projects"));
      overviewProjectsEl.append(row);
    });
  }

  overviewToolsEl.replaceChildren();
  const tools = overview.topTools || [];
  const total = tools.reduce((s, t) => s + (t.tokens || 0), 0) || 1;
  tools.forEach((tool) => {
    const percent = Math.round(((tool.tokens || 0) / total) * 100);
    const row = document.createElement("div");
    row.className = "share-row";
    row.innerHTML = `
      <div class="share-meta"><strong>${escapeHtml(tool.name)}</strong><span>${formatTokens(tool.tokens)} · ${percent}%</span></div>
      <div class="track"><span style="width:${Math.max(percent, 1)}%"></span></div>`;
    overviewToolsEl.append(row);
  });

  overviewAgentsEl.replaceChildren();
  (overview.agents || []).forEach((agent) => {
    const chip = document.createElement("div");
    chip.className = "agent-chip";
    chip.innerHTML = `<strong>${escapeHtml(agent.name)}</strong><span>${formatCount(agent.skillCount)} skills</span>`;
    overviewAgentsEl.append(chip);
  });
}

async function loadOverview(refresh = false) {
  overviewRescanButton.textContent = refresh ? "刷新中..." : overviewRescanButton.textContent;
  const response = await fetch(`${apiBase}/api/overview${refresh ? "?refresh=1" : ""}`);
  if (!response.ok) throw new Error(`overview api failed: ${response.status}`);
  overview = await response.json();
  renderOverview();
  overviewRescanButton.textContent = "刷新总览";
}

// ─── Usage (existing) ───────────────────────────────────────────────────────

function getScopedData(scope) {
  if (!usage) return null;
  if (scope === "all") return usage;
  const source = usage.sources.find((item) => item.id === scope);
  const toolName = source ? source.name : scope;
  const days = usage.days
    .map((day) => {
      const tokens = day.tools[toolName] || 0;
      if (!tokens) return null;
      const models = {};
      for (const [model, value] of Object.entries(day.models || {})) {
        if (value) models[model] = value;
      }
      return { ...day, tokens, models, tools: { [toolName]: tokens } };
    })
    .filter(Boolean);
  return {
    ...usage,
    totalTokens: source ? source.tokens : days.reduce((sum, day) => sum + day.tokens, 0),
    recordCount: source ? source.records : 0,
    dayCount: days.length,
    firstDate: days[0] ? days[0].date : null,
    lastDate: days[days.length - 1] ? days[days.length - 1].date : null,
    days,
    calendarDays: usage.calendarDays.map((day) => {
      const tokens = day.tools[toolName] || 0;
      return {
        ...day,
        tokens,
        cost: day.toolCosts && day.toolCosts[toolName] ? day.toolCosts[toolName] : 0,
        models: tokens ? day.models : {},
        tools: tokens ? { [toolName]: tokens } : {},
      };
    }),
    tools: source ? [{ name: source.name, tokens: source.tokens }] : [],
    models: usage.models,
    recent: usage.recent.filter((record) => record.tool === toolName),
  };
}

function renderTopline() {
  const scanDate = new Date(usage.generatedAt);
  trendTotalEl.textContent = scanDate.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function renderScopeNav() {
  const current = activeScope;
  scopeNavEl.replaceChildren();
  const allButton = document.createElement("button");
  allButton.className = "segment";
  allButton.type = "button";
  allButton.dataset.scope = "all";
  allButton.textContent = "全电脑";
  scopeNavEl.append(allButton);
  usage.sources
    .filter((source) => source.records > 0)
    .forEach((source) => {
      const button = document.createElement("button");
      button.className = "segment";
      button.type = "button";
      button.dataset.scope = source.id;
      button.textContent = source.name;
      scopeNavEl.append(button);
    });
  scopeNavEl.querySelectorAll(".segment").forEach((button) => {
    button.addEventListener("click", () => setScope(button.dataset.scope));
  });
  if (current !== "all" && !usage.sources.some((source) => source.id === current && source.records > 0)) {
    activeScope = "all";
  }
}

function renderMetrics(data) {
  const latestDay = data.days[data.days.length - 1];
  const totalCost = data.days.reduce((sum, day) => sum + Number(day.cost || 0), 0);
  const metrics = [
    [formatTokens(data.totalTokens), "全量历史 token", `${data.firstDate || "-"} 至 ${data.lastDate || "-"}`],
    [formatTokens(latestDay ? latestDay.tokens : 0), "最近一天 token", latestDay ? latestDay.date : "暂无数据"],
    [`${data.dayCount}`, "有消耗的天数", "来自本机日志聚合"],
    [formatCost(totalCost), "预估成本", "按模型单价估算"],
    [`${data.recordCount}`, "本地用量记录", "已去重后汇总"],
  ];
  metricsEl.replaceChildren();
  metrics.forEach(([value, label, hint]) => {
    const card = document.createElement("article");
    card.className = "metric-card";
    card.innerHTML = `<strong>${value}</strong><span>${label}</span><small>${hint}</small>`;
    metricsEl.append(card);
  });
}

function renderBars(data) {
  barsEl.replaceChildren();
  const days = (data.calendarDays && data.calendarDays.length ? data.calendarDays : data.days).filter((day) => day.date);
  trendPanelEl.hidden = days.length === 0;
  if (!days.length) return;
  const max = Math.max(...days.map((day) => day.tokens), 1);
  barsEl.style.gridTemplateColumns = `repeat(${Math.max(days.length, 1)}, 16px)`;
  days.forEach((day, index) => {
    const bar = document.createElement("button");
    bar.type = "button";
    bar.className = day.tokens && index > days.length - 12 ? "bar hot" : "bar";
    bar.title = `${day.date} · ${formatTokens(day.tokens)} token`;
    const line = document.createElement("span");
    line.className = "bar-line";
    line.style.height = `${day.tokens ? Math.max(4, (day.tokens / max) * 100) : 2}%`;
    bar.append(line);
    bar.addEventListener("mouseenter", (event) => showTooltip(event, day));
    bar.addEventListener("mousemove", (event) => showTooltip(event, day));
    bar.addEventListener("focus", (event) => showTooltip(event, day));
    bar.addEventListener("click", (event) => showTooltip(event, day));
    bar.addEventListener("mouseleave", hideTooltip);
    bar.addEventListener("blur", hideTooltip);
    barsEl.append(bar);
  });
  requestAnimationFrame(() => {
    barScrollEl.scrollLeft = barScrollEl.scrollWidth;
  });
}

function renderToolShare(data) {
  const total = Math.max(data.totalTokens, 1);
  toolShareEl.replaceChildren();
  const tools = data.tools.filter((tool) => tool.tokens > 0);
  toolSharePanelEl.hidden = tools.length === 0;
  tools.forEach((tool) => {
    const percent = Math.round((tool.tokens / total) * 100);
    const row = document.createElement("div");
    row.className = "share-row";
    row.innerHTML = `
        <div class="share-meta"><strong>${tool.name}</strong><span>${formatTokens(tool.tokens)} · ${percent}%</span></div>
        <div class="track"><span style="width:${Math.max(percent, 1)}%"></span></div>`;
    toolShareEl.append(row);
  });
}

function renderModels(data) {
  const modelTotals = new Map();
  for (const day of data.days) {
    for (const [model, tokens] of Object.entries(day.models || {})) {
      modelTotals.set(model, (modelTotals.get(model) || 0) + tokens);
    }
  }
  const models = [...modelTotals.entries()].map(([name, tokens]) => ({ name, tokens })).sort((a, b) => b.tokens - a.tokens);
  const total = models.reduce((sum, model) => sum + model.tokens, 0) || 1;
  modelListEl.replaceChildren();
  modelPanelEl.hidden = models.length === 0;
  const visibleModels = modelExpanded ? models : models.slice(0, 3);
  modelToggleButton.hidden = models.length <= 3;
  modelToggleButton.textContent = modelExpanded ? "收起" : `展开全部 ${models.length} 个模型`;
  visibleModels.forEach((model) => {
    const percent = Math.round((model.tokens / total) * 100);
    const row = document.createElement("div");
    row.className = "model-row";
    row.innerHTML = `<span>${model.name}</span><strong>${formatTokens(model.tokens)}</strong><em>${percent}%</em>`;
    modelListEl.append(row);
  });
}

function tooltipHtml(day) {
  const models = Object.entries(day.models || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([model, tokens]) => `<div><span>${model}</span><strong>${formatTokens(tokens)}</strong></div>`)
    .join("");
  return `<h4>${formatDate(day.date)}</h4><p>${formatTokens(day.tokens)} token</p>${models || "<em>无模型明细</em>"}`;
}

function showTooltip(event, day) {
  tooltip.innerHTML = tooltipHtml(day);
  tooltip.classList.add("visible");
  const rect = event.currentTarget.getBoundingClientRect();
  tooltip.style.left = `${Math.max(12, Math.min(window.innerWidth - 260, rect.left + window.scrollX + 18))}px`;
  tooltip.style.top = `${Math.max(12, rect.top + window.scrollY - 10)}px`;
}

function hideTooltip() {
  tooltip.classList.remove("visible");
}

function renderHeatmap(data) {
  heatmapEl.replaceChildren();
  heatmapMonthsEl.replaceChildren();
  const days = data.calendarDays && data.calendarDays.length ? data.calendarDays : data.days;
  const hasData = days.some((day) => day.tokens > 0);
  calendarPanelEl.hidden = !hasData;
  if (!hasData) return;
  const max = Math.max(...days.map((day) => day.tokens), 1);
  const weeks = Math.max(1, Math.ceil(days.length / 7));
  heatmapEl.style.gridTemplateColumns = `repeat(${weeks}, minmax(16px, 1fr))`;
  heatmapMonthsEl.style.gridTemplateColumns = `repeat(${weeks}, minmax(16px, 1fr))`;
  const monthLabels = new Map();
  const firstDate = new Date(`${days[0].date}T00:00:00`);
  const firstDayOfMonth = Number.isNaN(firstDate.getTime()) ? 1 : firstDate.getDate();
  days.forEach((day, index) => {
    const date = new Date(`${day.date}T00:00:00`);
    if (Number.isNaN(date.getTime())) return;
    const isFirstMonth = date.getFullYear() === firstDate.getFullYear() && date.getMonth() === firstDate.getMonth();
    if (date.getDate() === 1 || (index === 0 && isFirstMonth && firstDayOfMonth <= 15)) {
      let week = Math.floor(index / 7);
      if (isFirstMonth && firstDayOfMonth > 15) return;
      const label = `${date.getMonth() + 1}月`;
      while (monthLabels.has(week) && week < weeks) week += 1;
      if (week < weeks) monthLabels.set(week, label);
    }
  });
  for (let week = 0; week < weeks; week += 1) {
    const label = document.createElement("span");
    label.textContent = monthLabels.get(week) || "";
    heatmapMonthsEl.append(label);
  }
  days.forEach((day, index) => {
    const ratio = day.tokens / max;
    const level = ratio > 0.75 ? 4 : ratio > 0.45 ? 3 : ratio > 0.2 ? 2 : ratio > 0 ? 1 : 0;
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = `cell ${level ? `l${level}` : ""}`;
    cell.style.gridColumn = String(Math.floor(index / 7) + 1);
    cell.style.gridRow = String((index % 7) + 1);
    cell.title = `${day.date} · ${formatTokens(day.tokens)} token`;
    cell.addEventListener("mouseenter", (event) => showTooltip(event, day));
    cell.addEventListener("focus", (event) => showTooltip(event, day));
    cell.addEventListener("click", (event) => showTooltip(event, day));
    cell.addEventListener("mouseleave", hideTooltip);
    cell.addEventListener("blur", hideTooltip);
    heatmapEl.append(cell);
  });
}

function renderActivity(data) {
  activityEl.replaceChildren();
  const rows = data.days.slice().reverse().filter((day) => day.tokens > 0);
  activityPanelEl.hidden = rows.length === 0;
  if (!rows.length) return;
  const toolColumns = [
    ...rows
      .reduce((map, day) => {
        for (const [tool, tokens] of Object.entries(day.tools || {})) map.set(tool, (map.get(tool) || 0) + tokens);
        return map;
      }, new Map())
      .entries(),
  ]
    .sort((a, b) => b[1] - a[1])
    .map(([tool]) => tool);
  activityEl.style.setProperty("--activity-columns", `108px 130px repeat(${toolColumns.length}, minmax(120px, 1fr)) 110px 110px 110px 110px`);
  const header = document.createElement("div");
  header.className = "activity-row activity-header";
  header.innerHTML = `<span>日期</span><strong>合计 token</strong>${toolColumns.map((tool) => `<span>${tool}</span>`).join("")}<span>输入</span><span>缓存</span><span>输出</span><em>成本</em>`;
  activityEl.append(header);
  rows.forEach((day) => {
    const row = document.createElement("div");
    row.className = "activity-row";
    row.innerHTML = `<span>${day.date}</span><strong>${formatTokens(day.tokens)}</strong>${toolColumns
      .map((tool) => `<span>${day.tools[tool] ? formatTokens(day.tools[tool]) : "-"}</span>`)
      .join("")}<span>${formatTokens(day.inputTokens || 0)}</span><span>${formatTokens(day.cacheTokens || 0)}</span><span>${formatTokens(day.outputTokens || 0)}</span><em>${formatCost(day.cost)}</em>`;
    activityEl.append(row);
  });
}

function renderDiagnostics(data) {
  diagnosticsEl.replaceChildren();
  const sourceIds = activeScope === "all" ? data.sources.map((source) => source.id) : [activeScope];
  const sources = usage.sources.filter((source) => sourceIds.includes(source.id) && source.records > 0);
  if (!sources.length) {
    diagnosticsEl.innerHTML = `<article class="diagnostic-card"><strong>暂无诊断数据</strong><p>当前范围没有可统计的本地用量记录。</p></article>`;
    return;
  }
  sources.forEach((source) => {
    const diagnostics = source.diagnostics || {};
    const skipped = Object.entries(diagnostics.skipped || {})
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const card = document.createElement("article");
    card.className = "diagnostic-card";
    card.innerHTML = `
      <div class="diagnostic-head"><strong>${source.name}</strong><span>${source.status}</span></div>
      <div class="diagnostic-stats">
        <span>${formatCount(source.files)} 文件</span>
        <span>${formatCount(source.parsedLines)} 行</span>
        <span>${formatCount(source.records)} 记录</span>
        <span>${formatTokens(source.tokens)}</span>
      </div>
      <p>${diagnostics.tokenRule || ""}</p>
      ${
        skipped.length
          ? `<div class="diagnostic-line"><b>已跳过</b><span>${skipped.map(([r, c]) => `${r} ${formatCount(c)}`).join("；")}</span></div>`
          : ""
      }`;
    diagnosticsEl.append(card);
  });
}

function setScope(scope) {
  activeScope = scope;
  const data = getScopedData(scope);
  if (!data) return;
  const source = usage.sources.find((item) => item.id === scope);
  scopeTitleEl.textContent = scope === "all" ? "全电脑 token 消耗" : `${source.name} token 消耗`;
  renderMetrics(data);
  renderBars(data);
  renderToolShare(data);
  renderModels(data);
  renderHeatmap(data);
  renderActivity(data);
  renderDiagnostics(data);
  document.querySelectorAll("#product-usage .segment").forEach((button) => {
    button.classList.toggle("active", button.dataset.scope === scope);
  });
}

async function loadUsage(refresh = false) {
  rescanButton.textContent = refresh ? "扫描中..." : rescanButton.textContent;
  const response = await fetch(`${apiBase}/api/usage${refresh ? "?refresh=1" : ""}`);
  if (!response.ok) throw new Error(`usage api failed: ${response.status}`);
  usage = await response.json();
  renderTopline();
  renderScopeNav();
  setScope(activeScope);
  rescanButton.textContent = "重新扫描";
}

// ─── Projects ───────────────────────────────────────────────────────────────

function filteredProjects() {
  if (!projects) return [];
  const query = (projectsSearchEl.value || "").trim().toLowerCase();
  const hideTemp = projectsHideTempEl.checked;
  const hideUnknown = projectsHideUnknownEl.checked;
  const kindFilter = projectsKindFilterEl ? projectsKindFilterEl.value : "all";
  return projects.projects.filter((project) => {
    if (hideTemp && project.kind === "temp") return false;
    if (hideUnknown && project.kind === "unknown") return false;
    if (kindFilter !== "all" && project.kind !== kindFilter) return false;
    if (!query) return true;
    const hay = `${project.displayName} ${project.path} ${project.titleHint || ""} ${project.summary || ""} ${(project.agentsUsed || []).join(" ")}`.toLowerCase();
    return hay.includes(query);
  });
}

function renderProjectsMetrics() {
  const cards = [
    [formatCount(projects.projectCount), "推断项目", `会话合计 ${formatCount(projects.sessionTotal || 0)}`],
    [formatCount(projects.formalCount), "正式倾向", "非临时且非未知"],
    [formatCount(projects.tempCount), "临时", "可手动改类型"],
    [formatCount(projects.unknownCount), "未分类", "建议标注"],
  ];
  projectsMetricsEl.replaceChildren();
  cards.forEach(([value, label, hint]) => {
    const card = document.createElement("article");
    card.className = "metric-card";
    card.innerHTML = `<strong>${value}</strong><span>${label}</span><small>${hint}</small>`;
    projectsMetricsEl.append(card);
  });
  if (projectsSourceStatsEl) {
    projectsSourceStatsEl.replaceChildren();
    (projects.sourceStats || projects.sources || []).forEach((src) => {
      const chip = document.createElement("div");
      chip.className = "agent-chip";
      if (src.sessions != null) {
        chip.innerHTML = `<strong>${escapeHtml(src.id)}</strong><span>${formatCount(src.sessions)} 会话 · +${formatCount(src.projectsAdded || 0)} 项目</span>`;
      } else {
        chip.innerHTML = `<strong>${escapeHtml(src.name || src.id)}</strong><span>${escapeHtml(src.rule || "")}</span>`;
      }
      projectsSourceStatsEl.append(chip);
    });
  }
}

function renderProjectsTable() {
  const list = filteredProjects();
  projectsTableEl.replaceChildren();
  const header = document.createElement("div");
  header.className = "projects-row projects-header projects-row-rich";
  header.innerHTML = `<span>项目 / 总结</span><span>类型</span><span>会话</span><span>Agent</span><span>最近活跃</span><span>操作</span>`;
  projectsTableEl.append(header);
  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "projects-row";
    empty.innerHTML = `<div class="skill-name"><strong>没有匹配项目</strong><small>试试关闭筛选或重新扫描</small></div>`;
    projectsTableEl.append(empty);
    return;
  }
  list.forEach((project) => {
    const row = document.createElement("div");
    row.className = "projects-row projects-row-rich";
    const kindSelect = Object.entries(kindLabels)
      .map(([value, label]) => `<option value="${value}" ${project.kind === value ? "selected" : ""}>${label}</option>`)
      .join("");
    row.innerHTML = `
      <div class="skill-name project-open">
        <strong title="${escapeHtml(project.path)}">${escapeHtml(project.displayName)}${project.pinned ? " 📌" : ""}</strong>
        <small class="project-summary">${escapeHtml(project.summary || project.path)}</small>
        <small class="project-path" title="${escapeHtml(project.path)}">${escapeHtml(project.path)}${project.titleHint ? " · " + escapeHtml(project.titleHint) : ""}</small>
      </div>
      <select class="kind-select" data-key="${escapeHtml(project.projectKey)}">${kindSelect}</select>
      <span class="project-open">${formatCount(project.sessionCount)}</span>
      <span class="agents-cell project-open">${escapeHtml((project.agentsUsed || []).join(" / ") || "-")}</span>
      <span class="project-open">${formatTime(project.lastSeen)}</span>
      <button class="skill-sync-btn pin-btn" type="button" data-key="${escapeHtml(project.projectKey)}">${project.pinned ? "取消钉选" : "钉选"}</button>
    `;
    row.querySelectorAll(".project-open").forEach((el) => {
      el.addEventListener("click", () => openProjectDetail(project.projectKey));
    });
    row.querySelector(".kind-select").addEventListener("click", (event) => event.stopPropagation());
    row.querySelector(".kind-select").addEventListener("change", async (event) => {
      event.stopPropagation();
      await saveProjectOverride(project.projectKey, { kind: event.target.value });
    });
    row.querySelector(".pin-btn").addEventListener("click", async (event) => {
      event.stopPropagation();
      await saveProjectOverride(project.projectKey, { pinned: !project.pinned });
    });
    projectsTableEl.append(row);
  });
}

function closeProjectDetail() {
  if (projectDetailPanel) projectDetailPanel.hidden = true;
}

async function openProjectDetail(projectKey) {
  if (!projectDetailPanel) return;
  projectDetailPanel.hidden = false;
  projectDetailTitle.textContent = "加载中…";
  projectDetailSummary.textContent = "正在关联会话与用量…";
  projectDetailMetrics.replaceChildren();
  projectUsageTools.replaceChildren();
  projectUsageModels.replaceChildren();
  projectUsageDays.replaceChildren();
  projectSessionsEl.replaceChildren();
  projectRelatedSkillsEl.replaceChildren();
  projectDetailPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });

  try {
    const response = await fetch(
      `${apiBase}/api/projects/detail?key=${encodeURIComponent(projectKey)}`,
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    renderProjectDetail(data);
  } catch (error) {
    projectDetailTitle.textContent = "加载失败";
    projectDetailSummary.textContent = error.message;
  }
}

function renderProjectDetail(data) {
  const project = data.project || {};
  const usage = data.usage || {};
  projectDetailTitle.textContent = project.displayName || "项目详情";
  projectDetailSummary.textContent = project.summary || project.path || "";

  const cards = [
    [formatTokens(usage.tokens || 0), "关联 token", usage.matchMode || "none"],
    [formatCost(usage.cost || 0), "关联成本", `${formatCount(usage.recordCount || 0)} 条用量`],
    [formatCount(project.sessionCount || 0), "会话数", (project.agentsUsed || []).join(" / ") || "-"],
    [project.kindLabel || kindLabels[project.kind] || project.kind || "-", "类型", project.path || ""],
  ];
  projectDetailMetrics.replaceChildren();
  cards.forEach(([value, label, hint]) => {
    const card = document.createElement("article");
    card.className = "metric-card";
    card.innerHTML = `<strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span><small>${escapeHtml(String(hint))}</small>`;
    projectDetailMetrics.append(card);
  });

  projectUsageNote.textContent = usage.matchNote || "";
  const toolTotal = (usage.byTool || []).reduce((s, t) => s + (t.tokens || 0), 0) || 1;
  projectUsageTools.replaceChildren();
  (usage.byTool || []).forEach((tool) => {
    const percent = Math.round((tool.tokens / toolTotal) * 100);
    const row = document.createElement("div");
    row.className = "share-row";
    row.innerHTML = `
      <div class="share-meta"><strong>${escapeHtml(tool.name)}</strong><span>${formatTokens(tool.tokens)} · ${percent}%</span></div>
      <div class="track"><span style="width:${Math.max(percent, 1)}%"></span></div>`;
    projectUsageTools.append(row);
  });
  if (!(usage.byTool || []).length) {
    projectUsageTools.innerHTML = `<div class="simple-row muted">暂无工具用量明细</div>`;
  }

  projectUsageModels.replaceChildren();
  (usage.byModel || []).slice(0, 8).forEach((model) => {
    const row = document.createElement("div");
    row.className = "model-row";
    row.innerHTML = `<span>${escapeHtml(model.name)}</span><strong>${formatTokens(model.tokens)}</strong>`;
    projectUsageModels.append(row);
  });

  projectUsageDays.replaceChildren();
  (usage.byDay || [])
    .slice()
    .reverse()
    .slice(0, 14)
    .forEach((day) => {
      const row = document.createElement("div");
      row.className = "simple-row";
      row.innerHTML = `<strong>${escapeHtml(day.date)}</strong><span>${formatTokens(day.tokens)} token</span>`;
      projectUsageDays.append(row);
    });
  if (!(usage.byDay || []).length) {
    projectUsageDays.innerHTML = `<div class="simple-row muted">无按日用量</div>`;
  }

  projectSessionsEl.replaceChildren();
  const sessions = project.sessions || [];
  if (!sessions.length) {
    projectSessionsEl.innerHTML = `<div class="simple-row muted">未记录到会话明细</div>`;
  } else {
    sessions.slice(0, 100).forEach((session) => {
      const row = document.createElement("div");
      row.className = "session-row";
      const title = session.title || session.sessionId || "session";
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(session.agent || "-")} · ${escapeHtml(title)}</strong>
          <small>${escapeHtml(formatTime(session.timestamp))} · ${escapeHtml(session.source || "")}${session.cwd ? " · " + escapeHtml(session.cwd) : ""}</small>
        </div>
        <div class="session-tokens">${session.tokens ? formatTokens(session.tokens) : "—"}</div>`;
      projectSessionsEl.append(row);
    });
    if (sessions.length > 100) {
      const more = document.createElement("div");
      more.className = "simple-row muted";
      more.textContent = `仅显示最近 100 条，共 ${sessions.length} 条会话`;
      projectSessionsEl.append(more);
    }
  }

  projectRelatedSkillsEl.replaceChildren();
  (data.relatedSkillsHint || []).forEach((name) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "agent-chip clickable-chip";
    chip.innerHTML = `<strong>${escapeHtml(name)}</strong><span>相关能力提示</span>`;
    chip.addEventListener("click", () => {
      setProduct("skills");
      if (skillsSearchEl) {
        skillsSearchEl.value = name;
        if (skills) renderSkillsTable();
      }
    });
    projectRelatedSkillsEl.append(chip);
  });
}

async function saveProjectOverride(projectKey, patch) {
  const response = await fetch(`${apiBase}/api/projects/override`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectKey, ...patch }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "override failed");
  projects = data.inventory;
  renderProjectsAll();
}

function renderProjectsAll() {
  if (!projects) return;
  projectsTitleEl.textContent = `历史项目图谱 · ${formatCount(projects.projectCount)}`;
  renderProjectsMetrics();
  renderProjectsTable();
}

async function loadProjects(refresh = false) {
  projectsRescanButton.textContent = refresh ? "扫描中..." : projectsRescanButton.textContent;
  const response = await fetch(`${apiBase}/api/projects${refresh ? "?refresh=1" : ""}`);
  if (!response.ok) throw new Error(`projects api failed: ${response.status}`);
  projects = await response.json();
  renderProjectsAll();
  projectsRescanButton.textContent = "重新扫描项目";
}

// ─── Skills ─────────────────────────────────────────────────────────────────

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function agentName(id) {
  return skills?.agents?.find((agent) => agent.id === id)?.name || id;
}

function filteredSkills() {
  if (!skills) return [];
  const query = (skillsSearchEl.value || "").trim().toLowerCase();
  const onlyPartial = skillsOnlyPartialEl.checked;
  const cat = skillsCategoryFilterEl ? skillsCategoryFilterEl.value : "all";
  return skills.skills.filter((skill) => {
    if (onlyPartial && skill.missingOn.length === 0) return false;
    if (cat !== "all" && skill.categoryId !== cat) return false;
    if (!query) return true;
    return `${skill.name} ${skill.folderName} ${skill.description || ""} ${skill.summaryZh || ""} ${skill.categoryLabel || ""}`
      .toLowerCase()
      .includes(query);
  });
}

function renderSkillsMetrics() {
  const partial = skills.skills.filter((skill) => skill.missingOn.length > 0).length;
  const metrics = [
    [formatCount(skills.skillCount), "独立 Skill", "按名称去重"],
    [formatCount(skills.locationCount), "安装位置", "含各 Agent 副本"],
    [formatCount(skills.agentCount), "已发现 Agent", "本机目录扫描"],
    [formatCount((skills.categories || []).length), "能力分类", `未对齐 ${formatCount(partial)}`],
  ];
  skillsMetricsEl.replaceChildren();
  metrics.forEach(([value, label, hint]) => {
    const card = document.createElement("article");
    card.className = "metric-card";
    card.innerHTML = `<strong>${value}</strong><span>${label}</span><small>${hint}</small>`;
    skillsMetricsEl.append(card);
  });
}

function renderSkillsAgents() {
  skillsAgentsEl.replaceChildren();
  skills.agents.forEach((agent) => {
    const chip = document.createElement("div");
    chip.className = "agent-chip";
    chip.innerHTML = `<strong>${escapeHtml(agent.name)}</strong><span>${formatCount(agent.skillCount)} skills</span>`;
    skillsAgentsEl.append(chip);
  });
  if (skillsCategoriesEl) {
    skillsCategoriesEl.replaceChildren();
    (skills.categories || []).forEach((cat) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "agent-chip clickable-chip";
      chip.innerHTML = `<strong>${escapeHtml(cat.label)}</strong><span>${formatCount(cat.count)}</span>`;
      chip.addEventListener("click", () => {
        if (skillsCategoryFilterEl) {
          skillsCategoryFilterEl.value = cat.id;
          renderSkillsTable();
        }
      });
      skillsCategoriesEl.append(chip);
    });
  }
  if (skillsCategoryFilterEl) {
    const current = skillsCategoryFilterEl.value || "all";
    skillsCategoryFilterEl.replaceChildren();
    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = "全部分类";
    skillsCategoryFilterEl.append(allOpt);
    (skills.categories || []).forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat.id;
      opt.textContent = `${cat.label} (${cat.count})`;
      skillsCategoryFilterEl.append(opt);
    });
    skillsCategoryFilterEl.value = [...skillsCategoryFilterEl.options].some((o) => o.value === current) ? current : "all";
  }
}

function renderSkillsTable() {
  const list = filteredSkills();
  const agentIds = skills.agents.map((agent) => agent.id);
  skillsTableEl.style.setProperty("--agent-cols", String(Math.min(agentIds.length, 8)));
  skillsTableEl.replaceChildren();
  const header = document.createElement("div");
  header.className = "skills-row skills-header skills-row-rich";
  header.innerHTML = `<span>能力（中文说明）</span><span>分类</span>${agentIds
    .slice(0, 8)
    .map((id) => `<span title="${agentName(id)}">${agentName(id)}</span>`)
    .join("")}<span>操作</span>`;
  skillsTableEl.style.setProperty(
    "--skill-cols",
    `minmax(220px, 1.8fr) 88px repeat(${Math.min(agentIds.length, 8)}, minmax(52px, 1fr)) 72px`,
  );
  skillsTableEl.append(header);
  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "skills-row";
    empty.innerHTML = `<div class="skill-name"><strong>没有匹配的 skill</strong><small>试试清空筛选</small></div>`;
    skillsTableEl.append(empty);
    return;
  }
  const visibleAgents = agentIds.slice(0, 8);
  list.forEach((skill) => {
    const wrap = document.createElement("div");
    wrap.className = "skill-block";
    wrap.dataset.key = skill.key;

    const row = document.createElement("div");
    row.className = "skills-row skills-row-rich";
    const cells = visibleAgents
      .map((id) => {
        const loc = skill.agents[id];
        if (!loc) return `<span class="skill-dot off">—</span>`;
        if (loc.isSymlink) return `<span class="skill-dot link" title="${escapeHtml(loc.path)}">链</span>`;
        if (loc.readOnly) return `<span class="skill-dot on ro" title="${escapeHtml(loc.path)}">读</span>`;
        return `<span class="skill-dot on" title="${escapeHtml(loc.path)}">有</span>`;
      })
      .join("");
    const canSync = skill.syncTargets && skill.syncTargets.length > 0;
    const expanded = selectedSkillKey === skill.key && canSync;
    row.innerHTML = `
      <div class="skill-name">
        <strong>${escapeHtml(skill.name || skill.folderName)}</strong>
        <small class="skill-summary-zh">${escapeHtml(skill.summaryZh || skill.description || skill.folderName)}</small>
        <small class="skill-en-desc" title="${escapeHtml(skill.description || "")}">${escapeHtml(skill.folderName)}</small>
      </div>
      <span class="skill-cat-pill">${escapeHtml(skill.categoryLabel || "其他")}</span>
      ${cells}
      <button class="skill-sync-btn" type="button" data-key="${escapeHtml(skill.key)}" ${canSync ? "" : "disabled"}>
        ${!canSync ? "已齐" : expanded ? "收起" : "同步"}
      </button>`;
    const btn = row.querySelector(".skill-sync-btn");
    if (canSync) {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleInlineSkillSync(skill.key);
      });
    }
    wrap.append(row);

    if (expanded) {
      wrap.append(buildInlineSyncPanel(skill));
    }
    skillsTableEl.append(wrap);
  });
}

function missingWritableAgents(skill) {
  const present = new Set(Object.keys(skill.agents || {}));
  return (skills.writableAgents || []).filter((agent) => !present.has(agent.id));
}

function presentSourceAgents(skill) {
  return Object.keys(skill.agents || {}).map((id) => ({
    id,
    name: agentName(id),
    isSymlink: !!(skill.agents[id] && skill.agents[id].isSymlink),
  }));
}

function buildInlineSyncPanel(skill) {
  const panel = document.createElement("div");
  panel.className = "skill-inline-sync";
  panel.addEventListener("click", (event) => event.stopPropagation());

  const sources = presentSourceAgents(skill);
  const targets = missingWritableAgents(skill);
  const sourceOptions = sources
    .map(
      (s) =>
        `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}${s.isSymlink ? " (链接)" : ""}</option>`,
    )
    .join("");
  const targetChips = targets.length
    ? targets
        .map(
          (agent) =>
            `<label class="sync-chip"><input type="checkbox" value="${escapeHtml(agent.id)}" checked /> ${escapeHtml(agent.name)}</label>`,
        )
        .join("")
    : `<span class="sync-empty">没有可写入的未安装 Agent</span>`;

  panel.innerHTML = `
    <div class="sync-inline-head">
      <strong>同步到未安装的 Agent</strong>
      <span>源：已安装处 · 目标：勾选下方应用</span>
    </div>
    <div class="sync-inline-controls">
      <label class="sync-field">
        <span>来源 Agent</span>
        <select class="kind-select sync-from">${sourceOptions}</select>
      </label>
      <label class="sync-field">
        <span>方式</span>
        <select class="kind-select sync-mode">
          <option value="copy">复制副本</option>
          <option value="symlink">软链接</option>
        </select>
      </label>
    </div>
    <div class="sync-target-row">${targetChips}</div>
    <div class="sync-inline-actions">
      <button class="primary-button sync-run" type="button" ${targets.length ? "" : "disabled"}>确认同步</button>
      <button class="ghost-button sync-cancel" type="button">取消</button>
      <span class="skills-action-status sync-status"></span>
    </div>
  `;

  panel.querySelector(".sync-cancel").addEventListener("click", () => {
    selectedSkillKey = null;
    renderSkillsTable();
  });
  panel.querySelector(".sync-run").addEventListener("click", () => runInlineSkillCopy(skill, panel));
  return panel;
}

function toggleInlineSkillSync(key) {
  selectedSkillKey = selectedSkillKey === key ? null : key;
  renderSkillsTable();
  if (selectedSkillKey) {
    const block = skillsTableEl.querySelector(`.skill-block[data-key="${CSS.escape(selectedSkillKey)}"]`);
    if (block) block.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function closeSkillAction() {
  selectedSkillKey = null;
  if (skillsActionPanel) skillsActionPanel.hidden = true;
  renderSkillsTable();
}

async function runInlineSkillCopy(skill, panel) {
  const statusEl = panel.querySelector(".sync-status");
  const runBtn = panel.querySelector(".sync-run");
  const fromAgent = panel.querySelector(".sync-from")?.value;
  const mode = panel.querySelector(".sync-mode")?.value || "copy";
  const toAgents = [...panel.querySelectorAll(".sync-target-row input:checked")].map((input) => input.value);
  if (!toAgents.length) {
    statusEl.textContent = "请至少勾选一个目标 Agent";
    statusEl.className = "skills-action-status sync-status err";
    return;
  }
  runBtn.disabled = true;
  statusEl.textContent = "同步中…";
  statusEl.className = "skills-action-status sync-status";
  try {
    const response = await fetch(`${apiBase}/api/skills/copy`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        folderName: skill.folderName,
        fromAgent,
        toAgents,
        mode,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    skills = data.inventory || skills;
    const okCount = (data.results || []).filter((item) => item.ok).length;
    const fail = (data.results || []).filter((item) => !item.ok);
    // Keep row expanded if still has missing targets
    const updated = (skills.skills || []).find((item) => item.key === skill.key);
    const stillMissing = updated && updated.syncTargets && updated.syncTargets.length > 0;
    selectedSkillKey = stillMissing ? skill.key : null;
    renderSkillsAll();
    // show toast-like status on re-rendered panel if still open
    if (stillMissing) {
      const block = skillsTableEl.querySelector(`.skill-block[data-key="${CSS.escape(skill.key)}"] .sync-status`);
      if (block) {
        block.textContent =
          fail.length === 0 ? `已同步 ${okCount} 个` : `成功 ${okCount}，失败 ${fail.length}`;
        block.className = `skills-action-status sync-status ${fail.length ? "err" : "ok"}`;
      }
    }
  } catch (error) {
    statusEl.textContent = error.message;
    statusEl.className = "skills-action-status sync-status err";
    runBtn.disabled = false;
  }
}

function renderSkillsAll() {
  if (!skills) return;
  skillsTitleEl.textContent = `多 Agent 能力清单 · ${formatCount(skills.skillCount)}`;
  renderSkillsMetrics();
  renderSkillsAgents();
  renderSkillsTable();
}

async function loadSkills(refresh = false) {
  skillsRescanButton.textContent = refresh ? "扫描中..." : skillsRescanButton.textContent;
  const response = await fetch(`${apiBase}/api/skills${refresh ? "?refresh=1" : ""}`);
  if (!response.ok) throw new Error(`skills api failed: ${response.status}`);
  skills = await response.json();
  renderSkillsAll();
  skillsRescanButton.textContent = "重新扫描 Skills";
}

// ─── Events ─────────────────────────────────────────────────────────────────

overviewRescanButton.addEventListener("click", () => loadOverview(true).catch(showOverviewError));
rescanButton.addEventListener("click", () => loadUsage(true).catch(showUsageError));
projectsRescanButton.addEventListener("click", () => loadProjects(true).catch(showProjectsError));
skillsRescanButton.addEventListener("click", () => loadSkills(true).catch(showSkillsError));
projectsSearchEl.addEventListener("input", () => renderProjectsTable());
projectsHideTempEl.addEventListener("change", () => renderProjectsTable());
projectsHideUnknownEl.addEventListener("change", () => renderProjectsTable());
if (projectsKindFilterEl) projectsKindFilterEl.addEventListener("change", () => renderProjectsTable());
if (projectDetailClose) projectDetailClose.addEventListener("click", () => closeProjectDetail());
skillsSearchEl.addEventListener("input", () => renderSkillsTable());
skillsOnlyPartialEl.addEventListener("change", () => renderSkillsTable());
if (skillsCategoryFilterEl) skillsCategoryFilterEl.addEventListener("change", () => renderSkillsTable());
if (skillsActionClose) skillsActionClose.addEventListener("click", () => closeSkillAction());
// 底部旧同步栏已改为行内同步；保留节点兼容，默认隐藏
if (skillsActionPanel) skillsActionPanel.hidden = true;
themeToggleButton.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  localStorage.setItem(themeStorageKey, nextTheme);
  applyTheme(nextTheme);
});
modelToggleButton.addEventListener("click", () => {
  modelExpanded = !modelExpanded;
  const data = getScopedData(activeScope);
  if (data) renderModels(data);
});
productTabs.forEach((tab) => {
  tab.addEventListener("click", () => setProduct(tab.dataset.product));
});

const hash = (location.hash || "#overview").replace("#", "");
const initialProduct = ["overview", "usage", "projects", "skills", "tokens"].includes(hash)
  ? hash === "tokens"
    ? "usage"
    : hash
  : "overview";
setProduct(initialProduct);

// Prefetch overview always
loadOverview(false).catch(showOverviewError);
