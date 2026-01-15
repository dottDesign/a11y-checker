import { chromium } from "playwright";

/**
 * Crawl a public site starting from startUrl.
 * Same-origin only, BFS, with caps on pages and depth.
 *
 * @param {string} startUrl
 * @param {{ maxPages?: number, maxDepth?: number, sameOriginOnly?: boolean }} options
 * @returns {Promise<string[]>} list of URLs to scan (includes startUrl)
 */
export async function crawlSite(startUrl, options = {}) {
  const maxPages = Math.min(Number(options.maxPages ?? 25), 200);
  const maxDepth = Math.min(Number(options.maxDepth ?? 2), 10);
  const sameOriginOnly = options.sameOriginOnly ?? true;

  const start = new URL(startUrl);
  const origin = start.origin;

  const visited = new Set();
  const queued = new Set();
  const queue = [{ url: start.toString(), depth: 0 }];

  queued.add(start.toString());

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    while (queue.length && visited.size < maxPages) {
      const { url, depth } = queue.shift();
      queued.delete(url);

      if (visited.has(url)) continue;
      visited.add(url);

      if (depth >= maxDepth) continue;

      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      } catch {
        continue;
      }

      const hrefs = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll("a[href]"));
        return anchors.map((a) => a.getAttribute("href")).filter(Boolean);
      });

      for (const href of hrefs) {
        let next;
        try {
          next = new URL(href, url);
        } catch {
          continue;
        }

        if (!["http:", "https:"].includes(next.protocol)) continue;
        if (sameOriginOnly && next.origin !== origin) continue;

        next.hash = "";
        const nextUrl = next.toString();

        if (visited.has(nextUrl) || queued.has(nextUrl)) continue;
        if (visited.size + queue.length >= maxPages) break;

        queue.push({ url: nextUrl, depth: depth + 1 });
        queued.add(nextUrl);
      }
    }

    return Array.from(visited);
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}
