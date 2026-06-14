import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";

const port = 8765;
const baseUrl = `http://127.0.0.1:${port}`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startServer() {
  const server = spawn("python3", ["-m", "http.server", String(port), "--directory", "docs"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  await wait(800);
  return server;
}

async function auditViewport(browser, name, viewport) {
  const page = await browser.newPage({ viewport });
  const issues = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      issues.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => issues.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => issues.push(`request failed: ${request.url()} ${request.failure()?.errorText}`));

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForSelector("#summaryBody tr", { state: "attached" });
  await page.waitForSelector("#trendBody tr", { state: "attached" });
  await page.waitForSelector("#holdingTrendBody tr", { state: "attached" });

  const metrics = await page.locator(".metric").count();
  const definitionCards = await page.locator(".definition-card").count();
  const summaryRows = await page.locator("#summaryBody tr").count();
  const chartRows = await page.locator(".bar-row").count();
  const trendRows = await page.locator("#trendBody tr").count();
  const holdingTrendRows = await page.locator("#holdingTrendBody tr").count();
  const canvasVisible = await page.locator("#trendChart").isVisible();
  const holdingCanvasVisible = await page.locator("#holdingTrendChart").isVisible();
  const summaryTableOpenDefault = await page.locator("#summaryTableToggle").evaluate((element) => element.open);
  const trendTableOpenDefault = await page.locator("#trendTableToggle").evaluate((element) => element.open);
  const holdingTrendTableOpenDefault = await page.locator("#holdingTrendTableToggle").evaluate((element) => element.open);
  if (summaryTableOpenDefault) issues.push("cross-sectional table is open by default");
  if (trendTableOpenDefault) issues.push("time trend table is open by default");
  if (holdingTrendTableOpenDefault) issues.push("holding-period trend table is open by default");

  await page.locator("#summaryTableToggle summary").click();
  const summaryTableOpens = await page.locator("#summaryTableToggle").evaluate((element) => element.open);
  await page.locator("#summaryTableToggle summary").click();
  await page.locator("#trendTableToggle summary").click();
  const trendTableOpens = await page.locator("#trendTableToggle").evaluate((element) => element.open);
  await page.locator("#trendTableToggle summary").click();
  await page.locator("#holdingTrendTableToggle summary").click();
  const holdingTrendTableOpens = await page.locator("#holdingTrendTableToggle").evaluate((element) => element.open);
  await page.locator("#holdingTrendTableToggle summary").click();
  if (!summaryTableOpens) issues.push("cross-sectional table disclosure did not open");
  if (!trendTableOpens) issues.push("time trend table disclosure did not open");
  if (!holdingTrendTableOpens) issues.push("holding-period trend table disclosure did not open");

  const allOptionCounts = await Promise.all(
    ["#segmentSelect", "#tenureSelect", "#regionSelect", "#holdingSelect"].map((selector) =>
      page.locator(`${selector} option`, { hasText: "All" }).count()
    )
  );
  allOptionCounts.forEach((count, index) => {
    if (count !== 1) issues.push(`filter ${index} has ${count} All options`);
  });

  await page.locator("#cutSelect").selectOption("planning_area");
  const planningAreaRows = await page.locator("#summaryBody tr").count();
  const planningAreaChartRows = await page.locator(".bar-row").count();
  if (planningAreaRows !== planningAreaChartRows) {
    issues.push(`planning area chart rows ${planningAreaChartRows} did not match table rows ${planningAreaRows}`);
  }

  await page.locator("#segmentSelect").selectOption("Private non-landed");
  await page.locator("#tenureSelect").selectOption("99-year leasehold");
  await page.locator("#trendViewSelect").selectOption("new_vs_resale");
  const selectedSegment = await page.locator("#segmentSelect").inputValue();
  const selectedTenure = await page.locator("#tenureSelect").inputValue();
  const selectedTrendView = await page.locator("#trendViewSelect").inputValue();
  const filteredTrendRows = await page.locator("#trendBody tr").count();
  if (selectedSegment !== "Private non-landed" || selectedTenure !== "99-year leasehold") {
    issues.push(`combined filter selection did not persist: segment=${selectedSegment} tenure=${selectedTenure}`);
  }
  if (selectedTrendView !== "new_vs_resale") {
    issues.push(`trend view selection did not persist: ${selectedTrendView}`);
  }
  if (filteredTrendRows < 2) {
    issues.push(`combined segment+tenure filter returned only ${filteredTrendRows} trend rows`);
  }

  await page.locator("#holdingTrendSegmentSelect").selectOption("Private non-landed");
  await page.locator("#holdingTrendTenureSelect").selectOption("99-year leasehold");
  await page.locator("#holdingTrendViewSelect").selectOption("new_vs_resale");
  const selectedHoldingTrendView = await page.locator("#holdingTrendViewSelect").inputValue();
  const filteredHoldingTrendRows = await page.locator("#holdingTrendBody tr").count();
  if (selectedHoldingTrendView !== "new_vs_resale") {
    issues.push(`holding trend view selection did not persist: ${selectedHoldingTrendView}`);
  }
  if (filteredHoldingTrendRows < 2) {
    issues.push(`combined segment+tenure filter returned only ${filteredHoldingTrendRows} holding-period trend rows`);
  }

  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: `artifacts/dashboard-${name}.png`, fullPage: true });

  await page.close();
  return {
    name,
    viewport,
    metrics,
    definitionCards,
    summaryRows,
    chartRows,
    trendRows,
    holdingTrendRows,
    canvasVisible,
    holdingCanvasVisible,
    summaryTableOpenDefault,
    trendTableOpenDefault,
    holdingTrendTableOpenDefault,
    planningAreaRows,
    planningAreaChartRows,
    selectedTrendView,
    filteredTrendRows,
    selectedHoldingTrendView,
    filteredHoldingTrendRows,
    issues,
  };
}

const server = await startServer();
try {
  const browser = await chromium.launch();
  const results = [
    await auditViewport(browser, "desktop", { width: 1440, height: 1000 }),
    await auditViewport(browser, "mobile", { width: 390, height: 900 }),
  ];
  await browser.close();
  console.log(JSON.stringify(results, null, 2));
  const failures = results.flatMap((result) => result.issues);
  if (failures.length) {
    process.exitCode = 1;
  }
} finally {
  server.kill();
}
