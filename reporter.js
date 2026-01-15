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

  // Aggregate by rule id, counting affected nodes
  const ruleCounts = new Map();
  const ruleMeta = new Map();

  for (const r of reports) {
    for (const v of r.results?.violations ?? []) {
      const count = v.nodes?.length ?? 0;
      ruleCounts.set(v.id, (ruleCounts.get(v.id) ?? 0) + count);
      if (!ruleMeta.has(v.id)) {
        ruleMeta.set(v.id, {
          id: v.id,
          help: v.help ?? "",
          helpUrl: v.helpUrl ?? "",
          impact: v.impact ?? "unknown",
          description: v.description ?? ""
        });
      }
    }
  }

  const topRules = Array.from(ruleCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, count]) => ({ ...(ruleMeta.get(id) ?? { id }), count }));

  return {
    totalPages,
    totalViolations,
    totalIncomplete,
    topRules,
    pageSummaries
  };
}

function impactBadge(impact) {
  const v = (impact || "unknown").toLowerCase();
  const label = escapeHtml(v);

  // Neutral styling, but we give subtle emphasis by impact
  const cls =
    v === "critical"
      ? "badge badge-critical"
      : v === "serious"
      ? "badge badge-serious"
      : v === "moderate"
      ? "badge badge-moderate"
      : v === "minor"
      ? "badge badge-minor"
      : "badge";

  return `<span class="${cls}">${label}</span>`;
}

export function generateHtmlReport({ startUrl, scannedAt, reports }) {
  const summary = summarizeSite(reports);

  const overviewRows = summary.pageSummaries
    .map((p) => {
      return `
        <tr>
          <td class="col-url">
            <a class="link" href="${escapeHtml(p.url)}" target="_blank" rel="noreferrer">${escapeHtml(p.url)}</a>
          </td>
          <td class="col-num">${p.violations}</td>
          <td class="col-num">${p.incomplete}</td>
        </tr>
      `;
    })
    .join("");

  const topIssues = summary.topRules.length
    ? summary.topRules
        .map((r) => {
          const help = r.help ? `: ${escapeHtml(r.help)}` : "";
          const helpLink = r.helpUrl
            ? ` <a class="link" href="${escapeHtml(r.helpUrl)}" target="_blank" rel="noreferrer">Learn more</a>`
            : "";
          return `
            <li>
              <code>${escapeHtml(r.id)}</code>
              <span class="muted">(${r.count} affected elements)</span>
              ${impactBadge(r.impact)}
              <div class="muted small">${escapeHtml(r.description || "")}${help}${helpLink}</div>
            </li>
          `;
        })
        .join("")
    : `<li class="muted">No recurring issues detected by automated rules.</li>`;

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
                  const failure = n.failureSummary
                    ? `<div class="muted small" style="margin-top:6px;">${escapeHtml(n.failureSummary)}</div>`
                    : "";

                  return `
                    <li class="node">
                      <div><span class="muted">Target:</span> ${targets}</div>
                      ${failure}
                    </li>
                  `;
                })
                .join("");

              const tags = (rule.tags ?? []).length
                ? `<div class="muted small" style="margin-top:8px;"><strong>Tags:</strong> ${rule.tags
                    .map(escapeHtml)
                    .join(", ")}</div>`
                : "";

              return `
                <div class="issue">
                  <div class="issue-head">
                    <div>
                      <div class="issue-title">
                        <code>${escapeHtml(rule.id)}</code>
                        ${impactBadge(rule.impact)}
                      </div>
                      <div class="muted">${escapeHtml(rule.description ?? "")}</div>
                    </div>
                    <div class="issue-help">
                      <a class="btn btn-secondary" href="${escapeHtml(rule.helpUrl)}" target="_blank" rel="noreferrer">
                        ${escapeHtml(rule.help ?? "Guidance")}
                      </a>
                    </div>
                  </div>

                  ${tags}

                  <details class="details">
                    <summary>Affected elements (${rule.nodes?.length ?? 0})</summary>
                    <ul class="nodes">${nodes}</ul>
                  </details>
                </div>
              `;
            })
            .join("")
        : `<div class="ok">No automated violations found on this page.</div>`;

      const incompleteHtml = inc.length
        ? `
          <details class="details details-review">
            <summary>Needs review (${inc.length})</summary>
            <ul class="nodes">
              ${inc
                .map((i) => {
                  return `<li class="node"><code>${escapeHtml(i.id)}</code> <span class="muted">${escapeHtml(
                    i.description ?? ""
                  )}</span></li>`;
                })
                .join("")}
            </ul>
          </details>
        `
        : "";

      return `
        <section class="page">
          <div class="page-head">
            <div>
              <h3 class="page-title">
                ${idx + 1}. <a class="link" href="${escapeHtml(r.url)}" target="_blank" rel="noreferrer">${escapeHtml(
        r.url
      )}</a>
              </h3>
              <div class="muted small">Scanned at: ${escapeHtml(r.timestamp ?? scannedAt)}</div>
            </div>

            <div class="page-metrics">
              <div class="pill"><strong>Violations</strong><span>${v.length}</span></div>
              <div class="pill"><strong>Needs review</strong><span>${inc.length}</span></div>
            </div>
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
  <title>Adler Accessibility Report (WCAG AA)</title>
  <link rel="icon" type="image/x-icon" href="https://www.adler.edu/wp-content/uploads/2025/07/favicon-150x150.png" />
  <style>
    :root {
      --adler-red: #b91c1c;
      --adler-charcoal: #111827;
      --adler-gray-100: #f3f4f6;
      --adler-gray-200: #e5e7eb;
      --adler-gray-400: #9ca3af;
      --adler-gray-600: #4b5563;
      --radius-lg: 16px;
      --radius-md: 10px;
    }

    * { box-sizing: border-box; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }

    body {
      margin: 0;
      background: var(--adler-gray-100);
      color: var(--adler-charcoal);
      padding: 32px 16px;
      display: flex;
      justify-content: center;
    }

    .wrapper { width: 100%; max-width: 1200px; }

    .card {
      background: #fff;
      border: 1px solid var(--adler-gray-200);
      border-radius: var(--radius-lg);
      padding: 20px;
      box-shadow: 0 14px 30px rgba(15, 23, 42, 0.06);
    }

    .site-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 16px;
    }

    .site-brand { display: flex; align-items: center; gap: 10px; }
    .brand-mark { width: 32px; height: 32px; border-radius: 8px; overflow: hidden; }
    .brand-mark img { width: 100%; height: 100%; object-fit: cover; }
    .brand-text { display: flex; flex-direction: column; gap: 2px; }
    .brand-text-main { font-size: 1.05rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
    .brand-text-sub { font-size: 0.8rem; color: var(--adler-gray-600); }

    .tool-title { text-align: right; }
    .tool-title-main { font-size: 1.15rem; font-weight: 600; }
    .tool-title-sub { font-size: 0.85rem; color: var(--adler-gray-600); }

    @media (max-width: 900px) {
      .site-header { flex-direction: column; align-items: flex-start; }
      .tool-title { text-align: left; }
    }

    h2 { margin: 0 0 10px; font-size: 1.0rem; }
    h3 { margin: 0; }

    .muted { color: var(--adler-gray-600); }
    .small { font-size: 0.85rem; }

    .grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 14px;
      margin-top: 14px;
    }

    .panel {
      background: #fff;
      border: 1px solid var(--adler-gray-200);
      border-radius: var(--radius-lg);
      padding: 14px;
    }

    .panel-title {
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.09em;
      color: var(--adler-gray-600);
      margin: 0 0 10px;
    }

    .meta {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 6px;
    }

    .pill-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid var(--adler-gray-200);
      background: var(--adler-gray-100);
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 0.8rem;
      color: var(--adler-gray-600);
    }
    .pill strong { color: var(--adler-charcoal); font-weight: 600; }
    .pill span { color: var(--adler-charcoal); font-weight: 600; }

    table { width: 100%; border-collapse: collapse; overflow: hidden; border-radius: var(--radius-md); }
    th, td { border-bottom: 1px solid var(--adler-gray-200); padding: 10px; text-align: left; vertical-align: top; }
    th { background: #fafafa; font-size: 0.85rem; color: var(--adler-gray-600); }
    td { font-size: 0.92rem; }
    .col-url { width: auto; }
    .col-num { width: 140px; text-align: right; }

    .link { color: var(--adler-red); text-decoration: none; }
    .link:hover { text-decoration: underline; }

    code { background: #f6f6f6; padding: 2px 6px; border-radius: 6px; border: 1px solid var(--adler-gray-200); }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 8px 12px;
      border-radius: var(--radius-md);
      font-size: 0.85rem;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      white-space: nowrap;
      border: 1px solid transparent;
    }
    .btn-secondary {
      background: #fff;
      border-color: var(--adler-gray-200);
      color: var(--adler-gray-600);
    }
    .btn-secondary:hover { border-color: var(--adler-gray-400); }

    .badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 0.75rem;
      border: 1px solid var(--adler-gray-200);
      background: var(--adler-gray-100);
      color: var(--adler-gray-600);
    }
    .badge-critical { border-color: rgba(185,28,28,0.35); background: rgba(185,28,28,0.10); color: var(--adler-red); }
    .badge-serious { border-color: rgba(185,28,28,0.25); background: rgba(185,28,28,0.06); color: #991b1b; }
    .badge-moderate { border-color: rgba(17,24,39,0.15); background: rgba(17,24,39,0.04); color: var(--adler-charcoal); }
    .badge-minor { border-color: rgba(75,85,99,0.18); background: rgba(75,85,99,0.06); color: var(--adler-gray-600); }

    ul { margin: 8px 0 0; padding-left: 18px; }
    li { margin: 10px 0; }
    .ok {
      padding: 12px;
      border-radius: var(--radius-md);
      border: 1px solid #e6f4ea;
      background: #f1fbf4;
      color: #065f46;
      font-size: 0.92rem;
    }

    .page { border-top: 1px solid var(--adler-gray-200); padding-top: 14px; margin-top: 14px; }
    .page-head { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: flex-start; }
    .page-title { font-size: 1rem; font-weight: 700; }

    .page-metrics { display: flex; gap: 8px; flex-wrap: wrap; }

    .issue {
      margin-top: 12px;
      border: 1px solid var(--adler-gray-200);
      border-radius: var(--radius-lg);
      padding: 12px;
      background: #fff;
    }

    .issue-head { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: flex-start; }
    .issue-title { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 4px; }

    .details {
      margin-top: 10px;
      border: 1px solid var(--adler-gray-200);
      border-radius: var(--radius-md);
      padding: 10px 12px;
      background: #fff;
    }
    .details-review { background: #fafafa; }
    summary { cursor: pointer; font-weight: 700; }

    .nodes { margin-top: 8px; }
    .node { margin: 10px 0; }

    .footer-note {
      margin-top: 14px;
      color: var(--adler-gray-600);
      font-size: 0.85rem;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <header class="site-header">
        <div class="site-brand">
          <div class="brand-mark">
            <img src="https://www.adler.edu/wp-content/uploads/2025/07/favicon-300x300.png" alt="Adler University favicon" />
          </div>
          <div class="brand-text">
            <div class="brand-text-main">Adler University</div>
            <div class="brand-text-sub">Digital &amp; Web Tools</div>
          </div>
        </div>
        <div class="tool-title">
          <div class="tool-title-main">Accessibility Report</div>
          <div class="tool-title-sub">Automated WCAG Level AA checks (public URLs)</div>
        </div>
      </header>

      <div class="grid">
        <section class="panel">
          <div class="panel-title">Executive summary</div>
          <div class="meta">
            <div><strong>Start URL:</strong> <a class="link" href="${escapeHtml(startUrl)}" target="_blank" rel="noreferrer">${escapeHtml(
    startUrl
  )}</a></div>
            <div><strong>Scanned:</strong> ${escapeHtml(scannedAt)}</div>
            <div><strong>Scope:</strong> Public, same-origin crawl</div>
          </div>

          <div class="pill-row">
            <div class="pill"><strong>Pages scanned</strong><span>${summary.totalPages}</span></div>
            <div class="pill"><strong>Total violations</strong><span>${summary.totalViolations}</span></div>
            <div class="pill"><strong>Needs review</strong><span>${summary.totalIncomplete}</span></div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-title">Top recurring issues</div>
          <ul>${topIssues}</ul>
        </section>

        <section class="panel">
          <div class="panel-title">Page overview</div>
          <table>
            <thead>
              <tr>
                <th>Page</th>
                <th class="col-num">Violations</th>
                <th class="col-num">Needs review</th>
              </tr>
            </thead>
            <tbody>
              ${overviewRows}
            </tbody>
          </table>
        </section>

        <section class="panel">
          <div class="panel-title">Detailed findings</div>
          ${perPageDetails}
          <div class="footer-note">
            Notes: This report reflects automated checks aligned to WCAG A and AA rules. Manual review is still required for some criteria.
          </div>
        </section>
      </div>
    </div>
  </div>
</body>
</html>`;
}
