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
  await page.waitForSelector("#summaryBody tr");
  await page.waitForSelector("#trendBody tr");

  const metrics = await page.locator(".metric").count();
  const definitionCards = await page.locator(".definition-card").count();
  const summaryRows = await page.locator("#summaryBody tr").count();
  const chartRows = await page.locator(".bar-row").count();
  const trendRows = await page.locator("#trendBody tr").count();
  const tooltipBeforeHover = await page.locator(".chart-tooltip").first().evaluate((el) => getComputedStyle(el).opacity);

  await page.locator(".hover-hit").nth(Math.floor((await page.locator(".hover-hit").count()) / 2)).hover();
  const tooltipAfterHover = await page.locator(".chart-tooltip").last().evaluate((el) => getComputedStyle(el).opacity);

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
    tooltipBeforeHover,
    tooltipAfterHover,
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
