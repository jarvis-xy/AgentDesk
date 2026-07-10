let usage = null;
let activeScope = "all";
let modelExpanded = false;

const themeStorageKey = "token-ledger-theme";
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
const themeToggleButton = document.querySelector("#theme-toggle");

const tooltip = document.createElement("div");
tooltip.className = "usage-tooltip";
document.body.append(tooltip);

function getPreferredTheme() {
  const stored = localStorage.getItem(themeStorageKey);
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

function getScopedData(scope) {
  if (!usage) return null;
  if (scope === "all") return usage;

  const source = usage.sources.find((item) => item.id === scope);
  const toolName = source ? source.name : scope;
  const days = usage.days
    .map((day) => {
      const tokens = day.tools[toolName] || 0;
      const models = {};
      if (!tokens) return null;
      for (const [model, value] of Object.entries(day.models)) {
        const modelTotal = usage.models.find((item) => item.name === model)?.tokens || 0;
        if (modelTotal && value) models[model] = value;
      }
      return { ...day, tokens, models, tools: { [toolName]: tokens } };
    })
    .filter(Boolean);
  const totalTokens = source ? source.tokens : days.reduce((sum, day) => sum + day.tokens, 0);

  return {
    ...usage,
    totalTokens,
    recordCount: source ? source.records : 0,
    dayCount: days.length,
    firstDate: days[0] ? days[0].date : null,
    lastDate: days[days.length - 1] ? days[days.length - 1].date : null,
    days,
    calendarDays: usage.calendarDays.map((day) => {
      const tokens = day.tools[toolName] || 0;
      const models = tokens ? day.models : {};
      return {
        ...day,
        tokens,
        cost: day.toolCosts && day.toolCosts[toolName] ? day.toolCosts[toolName] : 0,
        models,
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
  trendTotalEl.textContent = scanDate.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
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
  const activeTools = data.tools.filter((tool) => tool.tokens > 0).length || (activeScope === "all" ? 0 : 1);
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
  const days = (data.calendarDays && data.calendarDays.length ? data.calendarDays : data.days)
    .filter((day) => day.date);
  trendPanelEl.hidden = days.length === 0;
  if (!days.length) return;
  const max = Math.max(...days.map((day) => day.tokens), 1);
  barsEl.style.gridTemplateColumns = `repeat(${Math.max(days.length, 1)}, 16px)`;
  days.forEach((day, index) => {
    const bar = document.createElement("button");
    bar.type = "button";
    bar.className = day.tokens && index > days.length - 12 ? "bar hot" : "bar";
    bar.title = `${day.date} · ${formatTokens(day.tokens)} token`;
    bar.setAttribute("aria-label", bar.title);
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
        <div class="share-meta">
          <strong>${tool.name}</strong>
          <span>${formatTokens(tool.tokens)} · ${percent}%</span>
        </div>
        <div class="track"><span style="width:${Math.max(percent, 1)}%"></span></div>
      `;
    toolShareEl.append(row);
  });
}

function renderModels(data) {
  const modelTotals = new Map();
  for (const day of data.days) {
    for (const [model, tokens] of Object.entries(day.models)) {
      modelTotals.set(model, (modelTotals.get(model) || 0) + tokens);
    }
  }
  const models = [...modelTotals.entries()]
    .map(([name, tokens]) => ({ name, tokens }))
    .sort((a, b) => b.tokens - a.tokens);
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
  const models = Object.entries(day.models)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([model, tokens]) => `<div><span>${model}</span><strong>${formatTokens(tokens)}</strong></div>`)
    .join("");
  return `
    <h4>${formatDate(day.date)}</h4>
    <p>${formatTokens(day.tokens)} token</p>
    ${models || "<em>无模型明细</em>"}
  `;
}

function showTooltip(event, day) {
  tooltip.innerHTML = tooltipHtml(day);
  tooltip.classList.add("visible");
  const rect = event.currentTarget.getBoundingClientRect();
  const left = Math.min(window.innerWidth - 260, rect.left + window.scrollX + 18);
  const top = rect.top + window.scrollY - 10;
  tooltip.style.left = `${Math.max(12, left)}px`;
  tooltip.style.top = `${Math.max(12, top)}px`;
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
    cell.setAttribute("aria-label", cell.title);
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
  const rows = data.days
    .slice()
    .reverse()
    .filter((day) => day.tokens > 0);
  activityPanelEl.hidden = rows.length === 0;
  if (!rows.length) return;

  const toolColumns = [...rows.reduce((map, day) => {
    for (const [tool, tokens] of Object.entries(day.tools)) {
      map.set(tool, (map.get(tool) || 0) + tokens);
    }
    return map;
  }, new Map()).entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tool]) => tool);
  const gridColumns = `108px 130px repeat(${toolColumns.length}, minmax(120px, 1fr)) 110px 110px 110px`;
  activityEl.style.setProperty("--activity-columns", gridColumns);

  const header = document.createElement("div");
  header.className = "activity-row activity-header";
  header.innerHTML = `
    <span>日期</span>
    <strong>合计 token</strong>
    ${toolColumns.map((tool) => `<span title="${tool}">${tool}</span>`).join("")}
    <span>输入 token</span>
    <span>输出 token</span>
    <em>预估成本</em>
  `;
  activityEl.append(header);

  rows.forEach((day) => {
    const row = document.createElement("div");
    row.className = "activity-row";
    row.innerHTML = `
      <span>${day.date}</span>
      <strong>${formatTokens(day.tokens)}</strong>
      ${toolColumns.map((tool) => `<span>${day.tools[tool] ? formatTokens(day.tools[tool]) : "-"}</span>`).join("")}
      <span>${formatTokens(day.inputTokens || 0)}</span>
      <span>${formatTokens(day.outputTokens || 0)}</span>
      <em>${formatCost(day.cost)}</em>
    `;
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
    const recentDays = (diagnostics.recentDays || []).slice(0, 3);
    const topFiles = (diagnostics.topFiles || []).slice(0, 3);
    const sourceKinds = (diagnostics.sourceKinds || [])
      .map((item) => `${item.name} ${formatCount(item.records)}`)
      .join(" / ");

    const card = document.createElement("article");
    card.className = "diagnostic-card";
    card.innerHTML = `
      <div class="diagnostic-head">
        <strong>${source.name}</strong>
        <span>${source.status}</span>
      </div>
      <div class="diagnostic-stats">
        <span>${formatCount(source.files)} 个文件</span>
        <span>${formatCount(source.parsedLines)} 行日志</span>
        <span>${formatCount(source.records)} 条有效记录</span>
        <span>${formatTokens(source.tokens)}</span>
      </div>
      <p>${diagnostics.dateRule || ""}</p>
      <p>${diagnostics.tokenRule || ""}</p>
      <p>${diagnostics.dedupeRule || ""}</p>
      ${sourceKinds ? `<div class="diagnostic-line"><b>来源类型</b><span>${sourceKinds}</span></div>` : ""}
      ${
        recentDays.length
          ? `<div class="diagnostic-line"><b>最近日期</b><span>${recentDays
              .map((day) => `${day.date} ${formatTokens(day.tokens)} / ${formatCount(day.records)}条`)
              .join("；")}</span></div>`
          : ""
      }
      ${
        topFiles.length
          ? `<div class="diagnostic-line"><b>主要文件</b><span>${topFiles
              .map((file) => `${file.name} ${formatTokens(file.tokens)}`)
              .join("；")}</span></div>`
          : ""
      }
      ${
        skipped.length
          ? `<div class="diagnostic-line"><b>已跳过</b><span>${skipped
              .map(([reason, count]) => `${reason} ${formatCount(count)}`)
              .join("；")}</span></div>`
          : ""
      }
    `;
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

  document.querySelectorAll(".segment").forEach((button) => {
    button.classList.toggle("active", button.dataset.scope === scope);
  });
}

async function loadUsage(refresh = false) {
  rescanButton.textContent = refresh ? "扫描中..." : rescanButton.textContent;
  const apiBase = window.location.protocol === "file:" ? "http://127.0.0.1:5188" : "";
  const response = await fetch(`${apiBase}/api/usage${refresh ? "?refresh=1" : ""}`);
  if (!response.ok) throw new Error(`usage api failed: ${response.status}`);
  usage = await response.json();
  renderTopline();
  renderScopeNav();
  setScope(activeScope);
  rescanButton.textContent = "重新扫描";
}

rescanButton.addEventListener("click", () => loadUsage(true));
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
loadUsage().catch((error) => {
  scopeTitleEl.textContent = "本地扫描失败";
  metricsEl.innerHTML = `<article class="metric-card"><strong>ERR</strong><span>${error.message}</span><small>请确认本地 Node 服务已启动</small></article>`;
});
