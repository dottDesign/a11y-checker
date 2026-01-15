import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const AXE_PATH = path.resolve("./node_modules/axe-core/axe.min.js");

/**
 * Run axe against a single URL.
 * @param {string} url
 * @param {{ timeoutMs?: number, waitUntil?: "load"|"domcontentloaded"|"networkidle", includePasses?: boolean }} opts
 */
export async function scanUrl(url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 45000;
  const waitUntil = opts.waitUntil ?? "networkidle";
  const includePasses = opts.includePasses ?? false;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil, timeout: timeoutMs });

    // Add axe to the page
    const axeSource = await fs.readFile(AXE_PATH, "utf8");
    await page.addScriptTag({ content: axeSource });

    // Run axe with WCAG AA focus
    const results = await page.evaluate(async (includePassesInner) => {
      return await axe.run(document, {
        runOnly: {
          type: "tag",
          // Covers WCAG A + AA. AA assumes A is also met.
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]
        },
        resultTypes: includePassesInner
          ? ["violations", "incomplete", "passes"]
          : ["violations", "incomplete"]
      });
    }, includePasses);

    return {
      url,
      timestamp: new Date().toISOString(),
      userAgent: await page.evaluate(() => navigator.userAgent),
      results
    };
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}
