import React, { useMemo, useState } from "react";
import "./Homepage.css";

// ─── Helpers ───────────────────────────────────────────────────────────────
function formatMoney(n) {
  return `$${Math.abs(n).toFixed(2)}`;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function monthKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, {
    month: "short",
    year: "2-digit",
  });
}

// ─── SVG Bar Chart ──────────────────────────────────────────────────────────
function SpendingChart({ bills }) {
  const MONTHS = 6;

  const monthlyData = useMemo(() => {
    // Build last N months including current
    const result = [];
    const now = new Date();
    for (let i = MONTHS - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      result.push({ key, label: monthLabel(key), total: 0, count: 0 });
    }

    bills.forEach((b) => {
      const k = monthKey(b.date);
      const slot = result.find((r) => r.key === k);
      if (slot) {
        slot.total += b.total;
        slot.count += 1;
      }
    });

    return result;
  }, [bills]);

  const maxTotal = Math.max(...monthlyData.map((m) => m.total), 1);

  // Chart dimensions
  const W = 560;
  const H = 180;
  const PAD_L = 50;
  const PAD_R = 12;
  const PAD_TOP = 16;
  const PAD_BOT = 36;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_TOP - PAD_BOT;
  const barW = Math.floor(chartW / MONTHS) - 10;
  const barGap = Math.floor(chartW / MONTHS);

  // Y-axis ticks
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    value: Math.round(maxTotal * t),
    y: PAD_TOP + chartH - chartH * t,
  }));

  return (
    <div className="hp-chart-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="hp-chart-svg"
        aria-label="Monthly spending bar chart"
      >
        {/* Grid lines */}
        {ticks.map((t) => (
          <g key={t.value}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={t.y}
              y2={t.y}
              className="hp-grid-line"
            />
            <text
              x={PAD_L - 6}
              y={t.y + 4}
              textAnchor="end"
              className="hp-axis-text"
            >
              RM {t.value >= 1000 ? `${(t.value / 1000).toFixed(1)}k` : t.value}
            </text>
          </g>
        ))}

        {/* Bars */}
        {monthlyData.map((m, i) => {
          const barH = Math.max(2, (m.total / maxTotal) * chartH);
          const x = PAD_L + i * barGap + (barGap - barW) / 2;
          const y = PAD_TOP + chartH - barH;
          const isCurrentMonth = i === MONTHS - 1;

          return (
            <g key={m.key}>
              {/* Bar background (empty) */}
              <rect
                x={x}
                y={PAD_TOP}
                width={barW}
                height={chartH}
                className="hp-bar-bg"
                rx={4}
              />
              {/* Bar fill */}
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                className={`hp-bar ${isCurrentMonth ? "hp-bar--current" : ""}`}
                rx={4}
              />
              {/* Value label on top */}
              {m.total > 0 && (
                <text
                  x={x + barW / 2}
                  y={y - 5}
                  textAnchor="middle"
                  className="hp-bar-label"
                >
                  ${m.total.toFixed(0)}
                </text>
              )}
              {/* Month label */}
              <text
                x={x + barW / 2}
                y={H - 6}
                textAnchor="middle"
                className={`hp-month-label ${isCurrentMonth ? "hp-month-label--current" : ""}`}
              >
                {m.label}
              </text>
            </g>
          );
        })}

        {/* X axis base */}
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={PAD_TOP + chartH}
          y2={PAD_TOP + chartH}
          className="hp-axis-line"
        />
      </svg>
    </div>
  );
}

// ─── Bill history row ────────────────────────────────────────────────────────
function BillRow({ bill, onDelete }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="hp-bill-row">
      <div className="hp-bill-icon">🧾</div>
      <div className="hp-bill-info">
        <div className="hp-bill-date">{formatDate(bill.date)}</div>
        <div className="hp-bill-people">
          {bill.people?.map((p) => p.name).join(", ") || "—"}
        </div>
      </div>
      <div className="hp-bill-right">
        <div className="hp-bill-total">{formatMoney(bill.total)}</div>
        <div className="hp-bill-count">
          {bill.people?.length ?? 0}{" "}
          {bill.people?.length === 1 ? "person" : "people"}
        </div>
      </div>
      {confirming ? (
        <div className="hp-bill-confirm">
          <button
            className="hp-bill-del-confirm"
            onClick={() => onDelete(bill.id)}
          >
            Delete
          </button>
          <button
            className="hp-bill-del-cancel"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          className="hp-bill-del"
          onClick={() => setConfirming(true)}
          aria-label="Delete bill"
        >
          ✕
        </button>
      )}
    </li>
  );
}

// ─── Main Homepage component ─────────────────────────────────────────────────
export default function Homepage({ bills = [], onUpload, onDeleteBill }) {
  // Stats for current month
  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const thisMonthBills = bills.filter((b) => monthKey(b.date) === thisMonthKey);
  const thisMonthTotal = thisMonthBills.reduce((s, b) => s + b.total, 0);
  const avgBill =
    thisMonthBills.length > 0 ? thisMonthTotal / thisMonthBills.length : 0;

  const [historyLimit, setHistoryLimit] = useState(5);
  const recentBills = bills.slice(0, historyLimit);

  return (
    <div className="hp-shell">
      {/* ── Header ── */}
      <header className="hp-header">
        <div className="hp-header-brand">
          <span className="hp-logo">🧾</span>
          <div>
            <h1 className="hp-title">SplitReceipt</h1>
            <p className="hp-subtitle">Your bill splitting dashboard</p>
          </div>
        </div>
        <button className="hp-split-btn-sm" onClick={onUpload}>
          + Split Receipt
        </button>
      </header>

      <main className="hp-main">
        {/* ── Stats cards ── */}
        <section className="hp-stats">
          <div className="hp-stat-card">
            <div className="hp-stat-label">This Month</div>
            <div className="hp-stat-value">{formatMoney(thisMonthTotal)}</div>
            <div className="hp-stat-sub">total spent</div>
          </div>
          <div className="hp-stat-card">
            <div className="hp-stat-label">Bills</div>
            <div className="hp-stat-value">{thisMonthBills.length}</div>
            <div className="hp-stat-sub">this month</div>
          </div>
          <div className="hp-stat-card">
            <div className="hp-stat-label">Avg Bill</div>
            <div className="hp-stat-value">{formatMoney(avgBill)}</div>
            <div className="hp-stat-sub">per receipt</div>
          </div>
          <div className="hp-stat-card">
            <div className="hp-stat-label">All Time</div>
            <div className="hp-stat-value">{bills.length}</div>
            <div className="hp-stat-sub">receipts split</div>
          </div>
        </section>

        {/* ── Monthly spending chart ── */}
        <section className="hp-card">
          <div className="hp-card-header">
            <h2 className="hp-card-title">Monthly Spending</h2>
            <span className="hp-card-badge">Last 6 months</span>
          </div>
          {bills.length === 0 ? (
            <div className="hp-empty-chart">
              <div className="hp-empty-icon">📊</div>
              <p>
                No data yet — split your first receipt to see your spending
                trends.
              </p>
            </div>
          ) : (
            <SpendingChart bills={bills} />
          )}
        </section>

        {/* ── Upload CTA ── */}
        <section
          className="hp-cta-card"
          onClick={onUpload}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && onUpload()}
          aria-label="Split a new receipt"
        >
          <div className="hp-cta-icon">📸</div>
          <div className="hp-cta-text">
            <div className="hp-cta-title">Split a New Receipt</div>
            <div className="hp-cta-desc">
              Take a photo or upload an image — we'll read the items and split
              the bill
            </div>
          </div>
          <div className="hp-cta-arrow">→</div>
        </section>

        {/* ── Recent bills ── */}
        <section className="hp-card">
          <div className="hp-card-header">
            <h2 className="hp-card-title">Recent Bills</h2>
            {bills.length > 0 && (
              <span className="hp-card-badge">{bills.length} total</span>
            )}
          </div>

          {bills.length === 0 ? (
            <div className="hp-empty">
              <div className="hp-empty-icon">🗂</div>
              <p className="hp-empty-text">
                No bills yet. Split your first receipt!
              </p>
              <button className="hp-btn hp-btn--primary" onClick={onUpload}>
                + Split a Receipt
              </button>
            </div>
          ) : (
            <>
              <ul className="hp-bill-list">
                {recentBills.map((bill) => (
                  <BillRow key={bill.id} bill={bill} onDelete={onDeleteBill} />
                ))}
              </ul>
              {bills.length > historyLimit && (
                <button
                  className="hp-show-more"
                  onClick={() => setHistoryLimit((n) => n + 10)}
                >
                  Show more ({bills.length - historyLimit} remaining)
                </button>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
