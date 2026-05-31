const fmtPct = new Intl.NumberFormat("en-SG", { style: "percent", maximumFractionDigits: 1 });
const fmtNum = new Intl.NumberFormat("en-SG");

const state = {
  summary: [],
  trend: [],
  metadata: null,
  trendChart: null,
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

const postalDistrictNames = {
  "01": "Raffles Place, Cecil, Marina, People's Park",
  "02": "Anson, Tanjong Pagar",
  "03": "Queenstown, Tiong Bahru",
  "04": "Telok Blangah, Harbourfront",
  "05": "Pasir Panjang, Hong Leong Garden, Clementi New Town",
  "06": "High Street, Beach Road (part)",
  "07": "Middle Road, Golden Mile",
  "08": "Little India",
  "09": "Orchard, Cairnhill, River Valley",
  "10": "Ardmore, Bukit Timah, Holland Road, Tanglin",
  "11": "Watten Estate, Novena, Thomson",
  "12": "Balestier, Toa Payoh, Serangoon",
  "13": "Macpherson, Braddell",
  "14": "Geylang, Eunos",
  "15": "Katong, Joo Chiat, Amber Road",
  "16": "Bedok, Upper East Coast, Eastwood, Kew Drive",
  "17": "Loyang, Changi",
  "18": "Tampines, Pasir Ris",
  "19": "Serangoon Garden, Hougang, Punggol",
  "20": "Bishan, Ang Mo Kio",
  "21": "Upper Bukit Timah, Clementi Park, Ulu Pandan",
  "22": "Jurong",
  "23": "Hillview, Dairy Farm, Bukit Panjang, Choa Chu Kang",
  "24": "Lim Chu Kang, Tengah",
  "25": "Kranji, Woodgrove",
  "26": "Upper Thomson, Springleaf",
  "27": "Yishun, Sembawang",
  "28": "Seletar",
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

function normalizeTrend(payload) {
  if (Array.isArray(payload)) return payload;
  return payload.rows.map((row) => Object.fromEntries(payload.schema.map((field, index) => [field, row[index]])));
}

function holdingSortValue(value) {
  const order = {
    "<1 year": 0,
    "1-3 years": 1,
    "3-5 years": 2,
    "5-10 years": 3,
    "10+ years": 4,
  };
  return order[value] ?? 99;
}

function crossSectionSort(cut) {
  if (cut === "buy_year" || cut === "sell_year") {
    return (a, b) => Number(a.value) - Number(b.value);
  }
  if (cut === "holding_period_bucket") {
    return (a, b) => holdingSortValue(a.value) - holdingSortValue(b.value);
  }
  return (a, b) => b.median - a.median || b.n - a.n;
}

function displayValue(cut, value) {
  if (cut === "postal_district") {
    const district = String(value).padStart(2, "0");
    const name = postalDistrictNames[district];
    return name ? `${district} - ${name}` : district;
  }
  return value;
}

function selectedTrendView() {
  return byId("trendViewSelect").value;
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

function renderSnapshot() {
  const definition = selectedDefinition();
  const segmentRows = state.summary
    .filter((row) => row.return_definition === definition && row.cut === "property_segment")
    .sort((a, b) => b.median - a.median);
  const trendRows = trendFiltered();
  const latest = trendRows[trendRows.length - 1];
  const previous = trendRows[trendRows.length - 2];
  const bestSegment = segmentRows[0];
  const lowestSegment = segmentRows[segmentRows.length - 1];
  const delta = latest && previous ? latest.median - previous.median : null;

  const cards = [
    {
      label: "Latest trend median",
      value: latest ? fmtPct.format(latest.median) : "-",
      detail: latest ? `${latest.year}, n=${fmtNum.format(latest.n)}` : "No matching trend row",
    },
    {
      label: "One-period change",
      value: delta === null ? "-" : `${delta >= 0 ? "+" : ""}${fmtPct.format(delta)}`,
      detail: latest && previous ? `${previous.year} to ${latest.year}` : "Select a trend with 2+ years",
    },
    {
      label: "Highest segment",
      value: bestSegment ? fmtPct.format(bestSegment.median) : "-",
      detail: bestSegment ? displayValue("property_segment", bestSegment.value) : "No segment rows",
    },
    {
      label: "Lowest segment",
      value: lowestSegment ? fmtPct.format(lowestSegment.median) : "-",
      detail: lowestSegment ? displayValue("property_segment", lowestSegment.value) : "No segment rows",
    },
  ];

  byId("snapshot").innerHTML = cards
    .map(
      (card) => `<article class="snapshot-card">
        <span>${card.label}</span>
        <strong>${card.value}</strong>
        <small>${card.detail}</small>
      </article>`
    )
    .join("");
}

function renderDefinitions() {
  const definitions = state.metadata.return_definitions || {};
  byId("definitionNote").textContent = definitions[selectedDefinition()] || "";
  byId("definitionCards").innerHTML = Object.entries(definitions)
    .map(
      ([name, description]) => `<article class="definition-card ${name === selectedDefinition() ? "selected" : ""}">
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
    .sort(crossSectionSort(cut));

  const maxAbs = Math.max(0.01, ...rows.map((row) => Math.abs(row.median)));
  byId("barChart").innerHTML = rows
    .map((row) => {
      const width = Math.max(2, Math.abs(row.median / maxAbs) * 100);
      const cls = row.median < 0 ? "bar negative" : "bar";
      return `<div class="bar-row">
        <div>${displayValue(cut, row.value)}</div>
        <div class="bar-track"><div class="${cls}" style="width:${width}%"></div></div>
        <div>${fmtPct.format(row.median)}</div>
      </div>`;
    })
    .join("");

  byId("summaryBody").innerHTML = rows
    .map(
      (row) => `<tr>
        <td>${displayValue(cut, row.value)}</td>
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
  unique(state.trend.map((row) => row[field]).filter((value) => value !== "All")).forEach((value) => option(select, value));
  if ([...select.options].some((item) => item.value === current)) select.value = current;
}

function trendFiltered() {
  return trendRowsForSaleType("All");
}

function trendRowsForSaleType(saleType) {
  const checks = [
    ["time_basis", byId("basisSelect").value],
    ["property_segment", byId("segmentSelect").value],
    ["tenure_group", byId("tenureSelect").value],
    ["planning_region", byId("regionSelect").value],
    ["holding_period_bucket", byId("holdingSelect").value],
    ["buy_sale_type_group", saleType],
  ];
  return state.trend
    .filter((row) => row.return_definition === selectedDefinition())
    .filter((row) => checks.every(([field, value]) => String(row[field]) === String(value)))
    .sort((a, b) => a.year - b.year);
}

function splitTrendSeries() {
  return [
    { label: "New Sale", rows: trendRowsForSaleType("New Sale"), color: "#2563eb" },
    { label: "Resale", rows: trendRowsForSaleType("Resale"), color: "#e11d48" },
  ].filter((series) => series.rows.length >= 2);
}

function renderTrend() {
  const rows = trendFiltered();
  const splitMode = selectedTrendView() === "new_vs_resale";
  const splitSeries = splitMode ? splitTrendSeries() : [];
  byId("trendHead").innerHTML = splitMode
    ? `<tr><th>Year</th><th>Sale type</th><th>Median</th><th>P25</th><th>P75</th><th>Loss share</th><th>n</th></tr>`
    : `<tr><th>Year</th><th>Median</th><th>P25</th><th>P75</th><th>Loss share</th><th>n</th></tr>`;
  byId("trendBody").innerHTML = splitMode
    ? splitSeries
        .flatMap((series) =>
          series.rows.map(
            (row) => `<tr>
              <td>${row.year}</td>
              <td>${series.label}</td>
              <td>${fmtPct.format(row.median)}</td>
              <td>${fmtPct.format(row.p25)}</td>
              <td>${fmtPct.format(row.p75)}</td>
              <td>${fmtPct.format(row.loss_share)}</td>
              <td>${fmtNum.format(row.n)}</td>
            </tr>`
          )
        )
        .join("")
    : rows
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

  const canvas = byId("trendChart");
  if (state.trendChart) {
    state.trendChart.destroy();
    state.trendChart = null;
  }
  if ((!splitMode && rows.length < 2) || (splitMode && splitSeries.length === 0)) {
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#697386";
    context.font = "14px sans-serif";
    context.fillText("Not enough matching trend rows.", 24, 42);
    return;
  }

  const chartRows = splitMode ? splitSeries.flatMap((series) => series.rows) : rows;
  const values = chartRows.flatMap((row) => [row.p25, row.p75, row.median]);
  const minValue = Math.min(-0.05, ...values);
  const maxValue = Math.max(0.05, ...values);
  const labels = [...new Set(chartRows.map((row) => String(row.year)))].sort((a, b) => Number(a) - Number(b));
  const commonLine = {
    tension: 0.25,
    pointRadius: 2.5,
    pointHoverRadius: 5,
    borderWidth: 2,
  };

  const alignedValues = (seriesRows, field) => {
    const valuesByYear = new Map(seriesRows.map((row) => [String(row.year), row[field]]));
    return labels.map((year) => valuesByYear.get(year) ?? null);
  };
  const datasets = splitMode
    ? splitSeries.map((series) => ({
        label: series.label,
        data: alignedValues(series.rows, "median"),
        borderColor: series.color,
        backgroundColor: series.color,
        fill: false,
        ...commonLine,
      }))
    : [
        {
          label: "P75",
          data: rows.map((row) => row.p75),
          borderColor: "#60a5fa",
          backgroundColor: "rgba(37, 99, 235, 0.14)",
          fill: "+1",
          pointRadius: 0,
          borderWidth: 1.5,
          tension: 0.25,
        },
        {
          label: "P25",
          data: rows.map((row) => row.p25),
          borderColor: "#60a5fa",
          backgroundColor: "rgba(37, 99, 235, 0.14)",
          fill: false,
          pointRadius: 0,
          borderWidth: 1.5,
          borderDash: [5, 5],
          tension: 0.25,
        },
        {
          label: "Median",
          data: rows.map((row) => row.median),
          borderColor: "#2563eb",
          backgroundColor: "#2563eb",
          fill: false,
          ...commonLine,
        },
      ];

  state.trendChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: splitMode, position: "top", align: "start" },
        tooltip: {
          callbacks: {
            afterBody(items) {
              const dataset = items[0].dataset;
              const saleType = splitMode ? dataset.label : "All";
              const row = splitMode
                ? trendRowsForSaleType(saleType).find((item) => String(item.year) === items[0].label)
                : rows[items[0].dataIndex];
              if (!row) return [];
              return [`Loss share: ${fmtPct.format(row.loss_share)}`, `n: ${fmtNum.format(row.n)}`];
            },
            label(context) {
              return `${context.dataset.label}: ${fmtPct.format(context.parsed.y)}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(105, 115, 134, 0.12)" },
          ticks: { maxTicksLimit: 9, color: "#697386" },
        },
        y: {
          min: minValue,
          max: maxValue,
          grid: { color: "rgba(105, 115, 134, 0.16)" },
          ticks: {
            maxTicksLimit: 7,
            color: "#697386",
            callback(value) {
              return fmtPct.format(value);
            },
          },
        },
      },
    },
  });
}

function renderMethodology() {
  const meta = state.metadata;
  byId("methodology").textContent =
    "Returns are computed from exact Project Name + Address + Postal Code sequential repeat-sale pairs. The exported JSON contains aggregate statistics only.";
  byId("assumptions").innerHTML = Object.entries(meta.assumptions)
    .map(([key, value]) => `<li><strong>${key.replaceAll("_", " ")}</strong>: ${value}</li>`)
    .join("");
}

function wireControls() {
  const definitions = Object.keys(state.metadata.return_definitions);
  definitions.forEach((name) => option(byId("definitionSelect"), name, name.replaceAll("_", " ")));
  unique(state.summary.map((row) => row.cut)).forEach((cut) => option(byId("cutSelect"), cut, labels[cut] || cut));
  option(byId("basisSelect"), "buy_year", "Buy year");
  option(byId("basisSelect"), "sell_year", "Sell year");
  option(byId("trendViewSelect"), "overall", "Overall selected trend");
  option(byId("trendViewSelect"), "new_vs_resale", "New sale vs resale");
  setOptionsFromTrend("segmentSelect", "property_segment");
  setOptionsFromTrend("tenureSelect", "tenure_group");
  setOptionsFromTrend("regionSelect", "planning_region");
  setOptionsFromTrend("holdingSelect", "holding_period_bucket");

  ["definitionSelect", "cutSelect"].forEach((id) => byId(id).addEventListener("change", () => {
    renderDefinitions();
    renderSnapshot();
    renderSummary();
    renderTrend();
  }));
  ["basisSelect", "trendViewSelect"].forEach((id) => byId(id).addEventListener("change", () => {
    renderSnapshot();
    renderTrend();
  }));
  ["segmentSelect", "tenureSelect", "regionSelect", "holdingSelect"].forEach((id) =>
    byId(id).addEventListener("change", () => {
      renderSnapshot();
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
  state.trend = normalizeTrend(trend);
  state.metadata = metadata;
  wireControls();
  renderMetrics();
  renderSnapshot();
  renderDefinitions();
  renderSummary();
  renderTrend();
  renderMethodology();
}

init().catch((error) => {
  document.body.innerHTML = `<main class="panel"><h1>Unable to load dashboard assets</h1><p>${error.message}</p></main>`;
});
