// src/components/EndfieldBudgetDashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import { CategoryLedger, EntryType, LedgerEngine, MoneyEntry } from "../models/ledger";
import "./endfieldBudget.css";

function formatPerMin(n) {
  const sign = n >= 0 ? "" : "-";
  const abs = Math.abs(n);
  return `${sign}${abs.toFixed(0)}/min`;
}

function formatInt(n) {
  return `${Math.round(n)}`;
}

function msToHuman(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

// --- SVG Gauge ---
function RingGauge({ value01, labelTop, centerValue, centerSub, powerUse, powerOutput }) {
  const size = 320;
  const r = 120;
  const cx = size / 2;
  const cy = size / 2;
  const stroke = 16;
  const circ = 2 * Math.PI * r;
  const dash = circ * value01;
  const gap = circ - dash;

  return (
    <div className="ef-card ef-gauge">
      <div className="ef-gauge-top">
        <div className="ef-pill">
          <span className="ef-pill-dim">Power Use</span>
          <span className="ef-pill-strong">{powerUse}</span>
        </div>
      </div>

      <svg width={size} height={size} className="ef-gauge-svg" aria-label="budget gauge">
        {/* outer faint arcs (decor) */}
        <circle cx={cx} cy={cy} r={r + 34} className="ef-arc ef-arc-warm" />
        <circle cx={cx} cy={cy} r={r + 18} className="ef-arc ef-arc-cool" />

        {/* base ring */}
        <circle cx={cx} cy={cy} r={r} className="ef-ring-base" />

        {/* progress ring */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          className="ef-ring-progress"
          strokeDasharray={`${dash} ${gap}`}
        />

        {/* center panel */}
        <g>
          <text x={cx} y={cy - 26} textAnchor="middle" className="ef-center-label">
            {labelTop}
          </text>
          <text x={cx} y={cy + 18} textAnchor="middle" className="ef-center-value">
            {centerValue}
          </text>
          <text x={cx} y={cy + 44} textAnchor="middle" className="ef-center-sub">
            {centerSub}
          </text>
        </g>
      </svg>

      <div className="ef-gauge-bottom">
        <div className="ef-row">
          <div className="ef-kv">
            <div className="ef-kv-k">Power Output</div>
            <div className="ef-kv-v">{powerOutput}</div>
          </div>
          <div className="ef-kv">
            <div className="ef-kv-k">Balance Health</div>
            <div className="ef-kv-v">{Math.round(value01 * 100)}%</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function YieldTable({ categories }) {
  return (
    <div className="ef-card ef-table">
      <div className="ef-table-head">
        <div className="ef-title">Yield Overview</div>
        <div className="ef-table-cols">
          <div className="ef-colhead">Current Rate</div>
          <div className="ef-colhead">Local Balance</div>
        </div>
      </div>

      <div className="ef-table-body">
        {categories.map((c) => {
          const net = c.netRatePerMin();
          return (
            <div className="ef-row-item" key={c.id}>
              <div className="ef-prod">
                <div className="ef-icon">{c.icon}</div>
                <div className="ef-prod-name">{c.name}</div>
              </div>

              <div className={`ef-rate ${net >= 0 ? "pos" : "neg"}`}>
                {formatPerMin(net)}
              </div>

              <div className="ef-depot">
                {formatInt(c.balance)}/{formatInt(c.capacity)}
              </div>

              <div className="ef-mini-bar">
                <div
                  className="ef-mini-fill"
                  style={{ width: `${Math.round(c.fillRatio() * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function EndfieldBudgetDashboard() {
  // build engine once (OOP)
  const engine = useMemo(() => {
    const ops = new CategoryLedger({
      id: "ops",
      name: "Operations",
      icon: "🧰",
      capacity: 11000,
      initial: 6010,
    })
      .addEntry(
        new MoneyEntry({
          id: "contracts",
          name: "Contracts",
          type: EntryType.INCOME,
          amountPerMin: 55,
          icon: "📄",
        })
      )
      .addEntry(
        new MoneyEntry({
          id: "maintenance",
          name: "Maintenance",
          type: EntryType.EXPENSE,
          amountPerMin: 18,
          icon: "🔧",
        })
      );

    const materials = new CategoryLedger({
      id: "mat",
      name: "Materials",
      icon: "⛏️",
      capacity: 11000,
      initial: 2,
    }).addEntry(
      new MoneyEntry({
        id: "sales",
        name: "Sales",
        type: EntryType.INCOME,
        amountPerMin: 50,
        icon: "💰",
      })
    );

    const logistics = new CategoryLedger({
      id: "log",
      name: "Logistics",
      icon: "🚚",
      capacity: 11000,
      initial: 8,
    }).addEntry(
      new MoneyEntry({
        id: "shipping",
        name: "Shipping",
        type: EntryType.EXPENSE,
        amountPerMin: 25,
        icon: "📦",
      })
    );

    const utilities = new CategoryLedger({
      id: "util",
      name: "Utilities",
      icon: "⚡",
      capacity: 11000,
      initial: 26,
    }).addEntry(
      new MoneyEntry({
        id: "power",
        name: "Power Bill",
        type: EntryType.EXPENSE,
        amountPerMin: 12,
        icon: "🧾",
      })
    );

    return new LedgerEngine({
      categories: [ops, materials, logistics, utilities],
      powerUse: 145,
      powerOutput: 200,
    });
  }, []);

  // UI state snapshot (immutable-ish view of OOP engine state)
  const [tickIndex, setTickIndex] = useState(0);

  // tick simulation: every 1s => 1 minute (gamey)
  useEffect(() => {
    const t = setInterval(() => {
      engine.tick(1);
      setTickIndex((x) => x + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [engine]);

  const categories = engine.categories;
  const health = engine.budgetHealthRatio();
  const net = engine.totalNetPerMin();
  const income = engine.totalIncomePerMin();
  const expense = engine.totalExpensePerMin();

  const centerValue = formatInt(
    categories.reduce((s, c) => s + c.balance, 0)
  );

  const centerSub = net >= 0 ? "net positive" : "net negative";

  return (
    <div className="ef-shell" key={tickIndex}>
      <div className="ef-topbar">
        <div className="ef-breadcrumb">Automation-Core-Valley IV</div>
        <div className="ef-actions">
          <button className="ef-btn" onClick={() => engine.autoManage()}>
            Auto-manage
          </button>
          <button
            className="ef-btn ghost"
            onClick={() => {
              // quick test: add a one-time temporary expense entry to Ops
              categories[0].addEntry(
                new MoneyEntry({
                  id: `burst-${Date.now()}`,
                  name: "Burst Cost",
                  type: EntryType.EXPENSE,
                  amountPerMin: 10,
                  icon: "🔥",
                })
              );
              setTickIndex((x) => x + 1);
            }}
          >
            Add expense
          </button>
        </div>
      </div>

      <div className="ef-grid">
        <RingGauge
          value01={health}
          labelTop="Budget Grid Report"
          centerValue={centerValue}
          centerSub={centerSub}
          powerUse={engine.powerUse}
          powerOutput={engine.powerOutput}
        />

        <YieldTable categories={categories} />
      </div>

      <div className="ef-footer">
        <div className="ef-footer-left">
          <div className="ef-muted">Duration of last auto-management:</div>
          <div className="ef-strong">{msToHuman(engine.timeSinceAutoManageMs())}</div>
        </div>

        <div className="ef-footer-mid">
          <div className="ef-stat">
            <div className="ef-muted">Income</div>
            <div className="ef-strong">{formatPerMin(income)}</div>
          </div>
          <div className="ef-stat">
            <div className="ef-muted">Expense</div>
            <div className="ef-strong">{formatPerMin(expense)}</div>
          </div>
          <div className="ef-stat">
            <div className="ef-muted">Net</div>
            <div className={`ef-strong ${net >= 0 ? "pos" : "neg"}`}>{formatPerMin(net)}</div>
          </div>
        </div>

        <div className="ef-footer-right">
          <button className="ef-btn wide">Construction</button>
        </div>
      </div>
    </div>
  );
}