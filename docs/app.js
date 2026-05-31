const fmtPct = new Intl.NumberFormat("en-SG", { style: "percent", maximumFractionDigits: 1 });
const fmtNum = new Intl.NumberFormat("en-SG");

const state = {
  summary: [],
  trend: [],
  metadata: null,
};

const labels = {
  property_segment: "Property segment",
  tenure_group: "Tenure group",
  buy_sale_type_group: "Buy sale type",
  planning_region: "Planning region",
  planning_area: "Planning area",
  postal_district: "Postal district",
  age_at_purchase_bucket: "Age at purchase",
  holding_period_bucket: "Holding period",
  buy_year: "Buy year",
  sell_year: "Sell year",
};

function byId(id) {
  return document.getElementById(id);
}

function option(select, value, label = value) {
  const el = document.createElement("option");
  el.value = value;
  el.textContent = label;
  select.appendChild(el);
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null))].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true })
  );
}

function selectedDefinition() {
  return byId("definitionSelect").value;
}

function renderMetrics() {
  const meta = state.metadata;
  const metrics = [
    ["Latest source month", meta.latest_source_month || "-"],
    ["Transactions read", fmtNum.format(meta.transaction_rows || 0)],
    ["Sequential repeat-sale pairs", fmtNum.format(meta.repeat_sale_pairs || 0)],
    ["Minimum n per row", fmtNum.format(meta.min_n || 0)],
  ];
  byId("metrics").innerHTML = metrics
    .map(([label, value]) => `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`)
    .join("");
}

function renderDefinitions() {
  const definitions = state.metadata.return_definitions || {};
  byId("definitionCards").innerHTML = Object.entries(definitions)
    .map(
      ([name, description]) => `<article class="definition-card">
        <h3>${name.replaceAll("_", " ")}</h3>
        <p>${description}</p>
      </article>`
    )
    .join("");
}

function renderSummary() {
  const cut = byId("cutSelect").value;
  const rows = state.summary
    .filter((row) => row.return_definition === selectedDefinition() && row.cut === cut)
    .sort((a, b) => b.n - a.n || b.median - a.median)
    .slice(0, 30);

  const maxAbs = Math.max(0.01, ...rows.map((row) => Math.abs(row.median)));
  byId("barChart").innerHTML = rows
    .slice(0, 12)
    .map((row) => {
      const width = Math.max(2, Math.abs(row.median / maxAbs) * 100);
      const cls = row.median < 0 ? "bar negative" : "bar";
      return `<div class="bar-row">
        <div>${row.value}</div>
        <div class="bar-track"><div class="${cls}" style="width:${width}%"></div></div>
        <div>${fmtPct.format(row.median)}</div>
      </div>`;
    })
    .join("");

  byId("summaryBody").innerHTML = rows
    .map(
      (row) => `<tr>
        <td>${row.value}</td>
        <td>${fmtPct.format(row.median)}</td>
        <td>${fmtPct.format(row.p25)}</td>
        <td>${fmtPct.format(row.p75)}</td>
        <td>${fmtPct.format(row.loss_share)}</td>
        <td>${fmtNum.format(row.n)}</td>
      </tr>`
    )
    .join("");
}

function setOptionsFromTrend(selectId, field) {
  const select = byId(selectId);
  const current = select.value;
  select.innerHTML = "";
  option(select, "All", "All");
  unique(state.trend.map((row) => row[field])).forEach((value) => option(select, value));
  if ([...select.options].some((item) => item.value === current)) select.value = current;
}

function trendFiltered() {
  const checks = [
    ["time_basis", byId("basisSelect").value],
    ["property_segment", byId("segmentSelect").value],
    ["tenure_group", byId("tenureSelect").value],
    ["planning_region", byId("regionSelect").value],
    ["holding_period_bucket", byId("holdingSelect").value],
  ];
  return state.trend
    .filter((row) => row.return_definition === selectedDefinition())
    .filter((row) => checks.every(([field, value]) => String(row[field]) === String(value)))
    .sort((a, b) => a.year - b.year);
}

function renderTrend() {
  const rows = trendFiltered();
  byId("trendBody").innerHTML = rows
    .map(
      (row) => `<tr>
        <td>${row.year}</td>
        <td>${fmtPct.format(row.median)}</td>
        <td>${fmtPct.format(row.p25)}</td>
        <td>${fmtPct.format(row.p75)}</td>
        <td>${fmtPct.format(row.loss_share)}</td>
        <td>${fmtNum.format(row.n)}</td>
      </tr>`
    )
    .join("");

  const svg = byId("trendChart");
  svg.innerHTML = "";
  if (rows.length < 2) {
    svg.innerHTML = `<text x="30" y="145" fill="#66717f">Not enough matching trend rows.</text>`;
    return;
  }

  const width = 900;
  const height = 280;
  const pad = { left: 54, right: 24, top: 22, bottom: 38 };
  const years = rows.map((row) => Number(row.year));
  const values = rows.flatMap((row) => [row.p25, row.p75, row.median]);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const minValue = Math.min(-0.05, ...values);
  const maxValue = Math.max(0.05, ...values);
  const x = (year) => pad.left + ((year - minYear) / Math.max(1, maxYear - minYear)) * (width - pad.left - pad.right);
  const y = (value) =>
    height - pad.bottom - ((value - minValue) / Math.max(0.001, maxValue - minValue)) * (height - pad.top - pad.bottom);
  const points = (field) => rows.map((row) => `${x(row.year)},${y(row[field])}`).join(" ");
  const band = `${points("p75")} ${rows
    .slice()
    .reverse()
    .map((row) => `${x(row.year)},${y(row.p25)}`)
    .join(" ")}`;

  svg.innerHTML = `
    <line class="axis" x1="${pad.left}" y1="${y(0)}" x2="${width - pad.right}" y2="${y(0)}"></line>
    <line class="axis" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}"></line>
    <polygon class="band" points="${band}"></polygon>
    <polyline class="line" points="${points("median")}"></polyline>
    ${rows.map((row) => `<circle class="dot" cx="${x(row.year)}" cy="${y(row.median)}" r="3"></circle>`).join("")}
    <text x="${pad.left}" y="${height - 10}" fill="#66717f">${minYear}</text>
    <text x="${width - pad.right - 42}" y="${height - 10}" fill="#66717f">${maxYear}</text>
    <text x="8" y="${y(maxValue) + 4}" fill="#66717f">${fmtPct.format(maxValue)}</text>
    <text x="8" y="${y(minValue) + 4}" fill="#66717f">${fmtPct.format(minValue)}</text>
  `;
}

function renderMethodology() {
  const meta = state.metadata;
  byId("methodology").textContent =
    "Returns are computed from exact Project Name + Address + Postal Code sequential repeat-sale pairs. The exported JSON contains aggregate statistics only.";
  byId("assumptions").innerHTML = Object.entries(meta.assumptions)
    .map(([key, value]) => `<li><strong>${key}</strong>: ${value}</li>`)
    .join("");
}

function wireControls() {
  const definitions = Object.keys(state.metadata.return_definitions);
  definitions.forEach((name) => option(byId("definitionSelect"), name, name.replaceAll("_", " ")));
  unique(state.summary.map((row) => row.cut)).forEach((cut) => option(byId("cutSelect"), cut, labels[cut] || cut));
  option(byId("basisSelect"), "buy_year", "Buy year");
  option(byId("basisSelect"), "sell_year", "Sell year");
  setOptionsFromTrend("segmentSelect", "property_segment");
  setOptionsFromTrend("tenureSelect", "tenure_group");
  setOptionsFromTrend("regionSelect", "planning_region");
  setOptionsFromTrend("holdingSelect", "holding_period_bucket");

  ["definitionSelect", "cutSelect"].forEach((id) => byId(id).addEventListener("change", () => {
    renderSummary();
    renderTrend();
  }));
  byId("basisSelect").addEventListener("change", renderTrend);
  ["segmentSelect", "tenureSelect", "regionSelect", "holdingSelect"].forEach((id) =>
    byId(id).addEventListener("change", () => {
      if (byId(id).value !== "All") {
        ["segmentSelect", "tenureSelect", "regionSelect", "holdingSelect"]
          .filter((otherId) => otherId !== id)
          .forEach((otherId) => {
            byId(otherId).value = "All";
          });
      }
      renderTrend();
    })
  );
}

async function init() {
  const [summary, trend, metadata] = await Promise.all([
    fetch("assets/summary.json").then((res) => res.json()),
    fetch("assets/trend.json").then((res) => res.json()),
    fetch("assets/metadata.json").then((res) => res.json()),
  ]);
  state.summary = summary;
  state.trend = trend;
  state.metadata = metadata;
  wireControls();
  renderMetrics();
  renderDefinitions();
  renderSummary();
  renderTrend();
  renderMethodology();
}

init().catch((error) => {
  document.body.innerHTML = `<main class="panel"><h1>Unable to load dashboard assets</h1><p>${error.message}</p></main>`;
});
