import express from "express";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { scanUrl } from "./scanner.js";
import { crawlSite } from "./crawler.js";
import { generateHtmlReport } from "./reporter.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

// Static UI
app.use(express.static(path.resolve("./public")));

// Serve generated reports
app.use("/reports", express.static(path.resolve("./reports")));
import { chromium } from "playwright";


app.get("/reports/:id/report.pdf", async (req, res) => {
  const { id } = req.params;

  // Render may sit behind a proxy, so this helps build the correct absolute URL
  app.set("trust proxy", true);

  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const reportUrl = `${baseUrl}/reports/${id}/report.html`;

  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(reportUrl, { waitUntil: "networkidle", timeout: 45000 });

    const pdfBuffer = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" }
    });

    await page.close().catch(() => {});
    await browser.close().catch(() => {});

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="a11y-report-${id}.pdf"`);
    return res.status(200).send(pdfBuffer);
  } catch (e) {
    return res.status(500).json({
      error: "PDF generation failed.",
      details: String(e?.message ?? e),
      reportUrl
    });
  }
});


function isValidHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function makeReportId() {
  return crypto.randomBytes(8).toString("hex");
}

app.post("/api/scan", async (req, res) => {
  const { url, includePasses } = req.body ?? {};
  if (!url || !isValidHttpUrl(url)) {
    return res.status(400).json({ error: "Provide a valid http(s) URL." });
  }

  try {
    const report = await scanUrl(url, { includePasses: Boolean(includePasses) });
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: "Scan failed.", details: String(e?.message ?? e) });
  }
});

/**
 * Crawl + scan site and write report artifacts:
 * reports/<id>/report.html
 * reports/<id>/report.json
 */
app.post("/api/scan-site", async (req, res) => {
  const { startUrl, maxPages = 25, maxDepth = 2 } = req.body ?? {};

  if (!startUrl || !isValidHttpUrl(startUrl)) {
    return res.status(400).json({ error: "Provide a valid startUrl (http/https)." });
  }

  try {
    const urls = await crawlSite(startUrl, { maxPages, maxDepth, sameOriginOnly: true });

    const reports = [];
    for (const u of urls) {
      // sequential by default for predictable load
      // eslint-disable-next-line no-await-in-loop
      reports.push(await scanUrl(u));
    }

    const scannedAt = new Date().toISOString();
    const html = generateHtmlReport({ startUrl, scannedAt, reports });

    const reportId = makeReportId();
    const dir = path.resolve("./reports", reportId);
    await fs.mkdir(dir, { recursive: true });

    const jsonPayload = { startUrl, scannedAt, count: reports.length, reports };

    await fs.writeFile(path.join(dir, "report.html"), html, "utf8");
    await fs.writeFile(path.join(dir, "report.json"), JSON.stringify(jsonPayload, null, 2), "utf8");

    res.json({
      reportId,
      summary: {
        startUrl,
        scannedAt,
        pagesScanned: reports.length,
        totalViolations: reports.reduce((a, r) => a + (r.results?.violations?.length ?? 0), 0)
      },
      htmlUrl: `/reports/${reportId}/report.html`,
      jsonUrl: `/reports/${reportId}/report.json`
    });
  } catch (e) {
    res.status(500).json({ error: "Site scan failed.", details: String(e?.message ?? e) });
  }
});

const port = process.env.PORT || 8080;
app.get("/health", (req, res) => {
  res.status(200).send("ok");
});

app.listen(port, () => {
  console.log(`a11y-checker running on http://localhost:${port}`);
});
