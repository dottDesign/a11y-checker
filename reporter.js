function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function summarizeSite(reports) {
  const pageSummaries = reports.map((r) => {
    const v = r.results?.violations?.length ?? 0;
    const inc = r.results?.incomplete?.length ?? 0;
    return { url: r.url, violations: v, incomplete: inc };
  });

  const totalPages = reports.length;
  const totalViolations = reports.reduce((acc, r) => acc + (r.results?.violations?.length ?? 0), 0);
  const totalIncomplete = reports.reduce((acc, r) => acc + (r.results?.incomplete?.length ?? 0), 0);

  const ruleCounts = new Map();
  for (const r of reports) {
    for (const v of r.results?.violations ?? []) {
      ruleCounts.set(v.id, (ruleCounts.get(v.id) ?? 0) + (v.nodes?.length ?? 0));
    }
  }

  const topRules = Array.from(ruleCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, count]) => ({ id, count }));

  return {
    totalPages,
    totalViolations,
    totalIncomplete,
    topRules,
    pageSummaries
  };
}

export function generateHtmlReport({ startUrl, scannedAt, reports }) {
  const summary = summarizeSite(reports);

  const rows = summary.pageSummaries
    .map((p) => {
      return `
        <tr>
          <td><a href="${escapeHtml(p.url)}" target="_blank" rel="noreferrer">${escapeHtml(p.url)}</a></td>
          <td class="num">${p.violations}</td>
          <td class="num">${p.incomplete}</td>
        </tr>
      `;
    })
    .join("");

  const topRules = summary.topRules
    .map((r) => `<li><code>${escapeHtml(r.id)}</code> (${r.count} affected nodes)</li>`)
    .join("");

  const perPageDetails = reports
    .map((r, idx) => {
      const v = r.results?.violations ?? [];
      const inc = r.results?.incomplete ?? [];

      const violationsHtml = v.length
        ? v
            .map((rule) => {
              const nodes = (rule.nodes ?? [])
                .map((n) => {
                  const targets = (n.target ?? []).map((t) => `<code>${escapeHtml(t)}</code>`).join(", ");
                  const failure = n.failureSummary ? `<div class="muted">${escapeHtml(n.failureSummary)}</div>` : "";
                  return `<li><div><strong>Target:</strong> ${targets}</div>${failure}</li>`;
                })
                .join("");

              return `
                <div class="issue">
                  <div class="issue-title">
                    <strong>${escapeHtml(rule.id)}</strong>
                    <span class="pill">${escapeHtml(rule.impact ?? "unknown")}</span>
                  </div>
                  <div class="muted">${escapeHtml(rule.description ?? "")}</div>
                  <div><strong>Help:</strong> <a href="${escapeHtml(rule.helpUrl)}" target="_blank" rel="noreferrer">${escapeHtml(rule.help ?? rule.helpUrl)}</a></div>
                  <details>
                    <summary>Affected elements (${rule.nodes?.length ?? 0})</summary>
                    <ul>${nodes}</ul>
                  </details>
                </div>
              `;
            })
            .join("")
        : `<div class="ok">No automated violations found on this page.</div>`;

      const incompleteHtml = inc.length
        ? `<details class="incomplete"><summary>Needs review (${inc.length})</summary><ul>${inc
            .map((i) => `<li><code>${escapeHtml(i.id)}</code> - ${escapeHtml(i.description ?? "")}</li>`)
            .join("")}</ul></details>`
        : "";

      return `
        <section class="page">
          <h3>${idx + 1}. <a href="${escapeHtml(r.url)}" target="_blank" rel="noreferrer">${escapeHtml(r.url)}</a></h3>
          <div class="meta">
            <span><strong>Violations:</strong> ${v.length}</span>
            <span><strong>Needs review:</strong> ${inc.length}</span>
          </div>
          ${incompleteHtml}
          ${violationsHtml}
        </section>
      `;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Accessibility Report (WCAG AA) - ${escapeHtml(startUrl)}</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 24px; max-width: 1100px; }
    h1 { margin-bottom: 6px; }
    .muted { color: #555; }
    .card { border: 1px solid #ddd; border-radius: 12px; padding: 16px; margin-top: 14px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #eee; padding: 10px; text-align: left; vertical-align: top; }
    th { background: #fafafa; }
    td.num { width: 120px; text-align: right; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; border: 1px solid #ccc; font-size: 12px; margin-left: 8px; }
    .page { border-top: 1px solid #eee; padding-top: 14px; margin-top: 14px; }
    .meta { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 10px; }
    .issue { border: 1px solid #eee; border-radius: 12px; padding: 12px; margin-top: 10px; background: #fff; }
    .issue-title { display: flex; align-items: center; gap: 8px; }
    details { margin-top: 8px; }
    summary { cursor: pointer; }
    code { background: #f6f6f6; padding: 2px 6px; border-radius: 6px; }
    .ok { padding: 10px; border: 1px solid #e6f4ea; background: #f1fbf4; border-radius: 12px; }
    .incomplete { margin-top: 10px; }
  </style>
</head>
<body>
  <h1>Accessibility Report (WCAG Level AA)</h1>
  <div class="muted">
    <div><strong>Start URL:</strong> ${escapeHtml(startUrl)}</div>
    <div><strong>Scanned:</strong> ${escapeHtml(scannedAt)}</div>
    <div><strong>Scope:</strong> Public, same-origin crawl</div>
  </div>

  <div class="card">
    <h2 style="margin-top:0;">Executive summary</h2>
    <div><strong>Pages scanned:</strong> ${summary.totalPages}</div>
    <div><strong>Total automated violations:</strong> ${summary.totalViolations}</div>
    <div><strong>Total items needing review:</strong> ${summary.totalIncomplete}</div>

    <h3>Top recurring issues</h3>
    <ul>${topRules || "<li>No recurring issues detected.</li>"}</ul>
  </div>

  <div class="card">
    <h2 style="margin-top:0;">Page overview</h2>
    <table>
      <thead>
        <tr>
          <th>Page</th>
          <th class="num">Violations</th>
          <th class="num">Needs review</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>

  <div class="card">
    <h2 style="margin-top:0;">Detailed findings</h2>
    ${perPageDetails}
  </div>

  <div class="muted" style="margin-top:16px;">
    Notes: This report reflects automated checks aligned to WCAG A and AA rules. Manual review is still required for some criteria.
  </div>
</body>
</html>`;
}
