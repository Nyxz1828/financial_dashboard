import React, { useEffect, useMemo, useState } from "react";

/** =========================
 *  OOP MODELS (in same file)
 *  ========================= */
const EntryType = Object.freeze({
  INCOME: "income",
  EXPENSE: "expense",
});

class MoneyEntry {
  constructor({ id, name, type, amountPerMin, icon = "💠" }) {
    this.id = id;
    this.name = name;
    this.type = type;
    this.amountPerMin = amountPerMin;
    this.icon = icon;
  }
  signedRatePerMin() {
    return this.type === EntryType.INCOME ? this.amountPerMin : -this.amountPerMin;
  }
}

class CategoryLedger {
  constructor({ id, name, icon = "📦", capacity = 11000, initial = 0 }) {
    this.id = id;
    this.name = name;
    this.icon = icon;
    this.capacity = capacity;
    this.balance = initial;
    this.entries = [];
  }

  addEntry(entry) {
    this.entries.push(entry);
    return this;
  }

  incomeRatePerMin() {
    return this.entries
      .filter((e) => e.type === EntryType.INCOME)
      .reduce((s, e) => s + e.amountPerMin, 0);
  }

  expenseRatePerMin() {
    return this.entries
      .filter((e) => e.type === EntryType.EXPENSE)
      .reduce((s, e) => s + e.amountPerMin, 0);
  }

  netRatePerMin() {
    return this.incomeRatePerMin() - this.expenseRatePerMin();
  }

  tick(minutes = 1) {
    const delta = this.netRatePerMin() * minutes;
    this.balance = clamp(this.balance + delta, 0, this.capacity);
    return this;
  }

  fillRatio() {
    return this.capacity <= 0 ? 0 : clamp(this.balance / this.capacity, 0, 1);
  }
}

class LedgerEngine {
  constructor({ categories = [], powerUse = 145, powerOutput = 200 } = {}) {
    this.categories = categories;
    this.powerUse = powerUse;
    this.powerOutput = powerOutput;

    this.lastAutoManageAt = Date.now();
  }

  totalIncomePerMin() {
    return this.categories.reduce((s, c) => s + c.incomeRatePerMin(), 0);
  }

  totalExpensePerMin() {
    return this.categories.reduce((s, c) => s + c.expenseRatePerMin(), 0);
  }

  totalNetPerMin() {
    return this.totalIncomePerMin() - this.totalExpensePerMin();
  }

  budgetHealthRatio() {
    // 60% net positivity + 40% avg reserve fullness
    const net = this.totalNetPerMin();
    const expense = Math.max(1, this.totalExpensePerMin());

    const netScore = net >= 0 ? 1 : clamp(1 + net / expense, 0, 1);
    const avgReserve =
      this.categories.length === 0
        ? 0
        : this.categories.reduce((s, c) => s + c.fillRatio(), 0) / this.categories.length;

    return clamp(0.6 * netScore + 0.4 * avgReserve, 0, 1);
  }

  tick(minutes = 1) {
    this.categories.forEach((c) => c.tick(minutes));
    return this;
  }

  autoManage() {
    // Example: if near full, throttle income slightly
    this.categories.forEach((c) => {
      if (c.fillRatio() > 0.98) {
        c.entries.forEach((e) => {
          if (e.type === EntryType.INCOME) e.amountPerMin *= 0.9;
        });
      }
    });
    this.lastAutoManageAt = Date.now();
    return this;
  }

  timeSinceAutoManageMs() {
    return Date.now() - this.lastAutoManageAt;
  }
}

/** =========================
 *  UI HELPERS
 *  ========================= */
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
function formatPerMin(n) {
  const sign = n >= 0 ? "" : "-";
  return `${sign}${Math.abs(n).toFixed(0)}/min`;
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

/** =========================
 *  COMPONENTS
 *  ========================= */
function RingGauge({ value01, powerUse, powerOutput, labelTop, centerValue, centerSub }) {
  const size = 320;
  const r = 120;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * value01;
  const gap = circ - dash;

  return (
    <div style={styles.card}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={styles.pill}>
          <span style={styles.pillDim}>Amount Spended</span>
          <span style={styles.pillStrong}>{powerUse}</span>
        </div>
      </div>

      <svg width={size} height={size} style={{ display: "block", margin: "6px auto 0" }}>
        {/* decor arcs */}
        <circle cx={cx} cy={cy} r={r + 34} style={styles.arcWarm} />
        <circle cx={cx} cy={cy} r={r + 18} style={styles.arcCool} />

        {/* base */}
        <circle cx={cx} cy={cy} r={r} style={styles.ringBase} />

        {/* progress */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          style={{
            ...styles.ringProgress,
            strokeDasharray: `${dash} ${gap}`,
          }}
        />

        {/* center text */}
        <text x={cx} y={cy - 26} textAnchor="middle" style={styles.centerLabel}>
          {labelTop}
        </text>
        <text x={cx} y={cy + 18} textAnchor="middle" style={styles.centerValue}>
          {centerValue}
        </text>
        <text x={cx} y={cy + 44} textAnchor="middle" style={styles.centerSub}>
          {centerSub}
        </text>
      </svg>

      <div style={{ display: "flex", gap: 10, padding: "8px 10px 10px" }}>
        <div style={styles.kv}>
          <div style={styles.kvK}>Power Output</div>
          <div style={styles.kvV}>{powerOutput}</div>
        </div>
        <div style={styles.kv}>
          <div style={styles.kvK}>Balance Health</div>
          <div style={styles.kvV}>{Math.round(value01 * 100)}%</div>
        </div>
      </div>
    </div>
  );
}

function YieldTable({ categories }) {
  return (
    <div style={styles.card}>
      <div style={styles.tableHead}>
        <div style={styles.title}>Yield Overview</div>
        <div style={styles.tableCols}>
          <div style={styles.colHead}>Current Rate</div>
          <div style={styles.colHead}>Local Balance</div>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
        {categories.map((c) => {
          const net = c.netRatePerMin();
          return (
            <div key={c.id} style={styles.rowItem}>
              <div style={styles.prod}>
                <div style={styles.icon}>{c.icon}</div>
                <div style={styles.prodName}>{c.name}</div>
              </div>

              <div
                style={{
                  ...styles.rate,
                  color: net >= 0 ? styles.colors.good : styles.colors.bad,
                }}
              >
                {formatPerMin(net)}
              </div>

              <div style={styles.depot}>
                {formatInt(c.balance)}/{formatInt(c.capacity)}
              </div>

              <div style={styles.miniBar}>
                <div style={{ ...styles.miniFill, width: `${Math.round(c.fillRatio() * 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** =========================
 *  MAIN APP (CRA)
 *  ========================= */
export default function App() {
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

  // re-render tick
  const [tickIndex, setTickIndex] = useState(0);

  useEffect(() => {
    // every 1s => simulate 1 minute
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
  const totalBalance = categories.reduce((s, c) => s + c.balance, 0);

  return (
    <div style={styles.shell} key={tickIndex}>
      <div style={styles.topbar}>
        <div style={styles.breadcrumb}>Financial Dashboard</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={styles.btn} onClick={() => engine.autoManage()}>
            Auto-manage
          </button>
          <button
            style={{ ...styles.btn, background: "transparent" }}
            onClick={() => {
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

      <div style={styles.grid}>
        <RingGauge
          value01={health}
          powerUse={engine.powerUse}
          powerOutput={engine.powerOutput}
          labelTop="Budget Grid Report"
          centerValue={formatInt(totalBalance)}
          centerSub={net >= 0 ? "net positive" : "net negative"}
        />

        <YieldTable categories={categories} />
      </div>

      <div style={styles.footer}>
        <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
          <div style={styles.muted}>Duration of last auto-management:</div>
          <div style={styles.strong}>{msToHuman(engine.timeSinceAutoManageMs())}</div>
        </div>

        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <div>
            <div style={styles.muted}>Income</div>
            <div style={styles.strong}>{formatPerMin(income)}</div>
          </div>
          <div>
            <div style={styles.muted}>Expense</div>
            <div style={styles.strong}>{formatPerMin(expense)}</div>
          </div>
          <div>
            <div style={styles.muted}>Net</div>
            <div
              style={{
                ...styles.strong,
                color: net >= 0 ? styles.colors.good : styles.colors.bad,
              }}
            >
              {formatPerMin(net)}
            </div>
          </div>
        </div>

        <button style={{ ...styles.btn, padding: "12px 16px", minWidth: 180 }}>
          Construction
        </button>
      </div>
    </div>
  );
}

/** =========================
 *  INLINE STYLES (no CSS file)
 *  ========================= */
const styles = {
  colors: {
    warm: "#f0c23a",
    cool: "#7cc7f7",
    good: "#2dbb7f",
    bad: "#d14d57",
    line: "#dddddd",
  },

  shell: {
    minHeight: "100vh",
    padding: 22,
    fontFamily:
      "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
    background:
      "radial-gradient(1200px 800px at 15% 0%, #ffffff 0%, #f4f4f4 50%, #ededed 100%)",
    color: "#1b1b1b",
  },

  topbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },

  breadcrumb: { fontSize: 14, color: "#5b5b5b" },

  grid: {
    display: "grid",
    gridTemplateColumns: "420px 1fr",
    gap: 18,
    alignItems: "start",
  },

  card: {
    background: "#fff",
    border: "1px solid #dddddd",
    borderRadius: 14,
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
    padding: 14,
  },

  btn: {
    border: "1px solid #dddddd",
    background: "#fff",
    padding: "9px 12px",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 700,
    color: "#1b1b1b",
  },

  pill: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    border: "1px solid #dddddd",
    borderRadius: 999,
    padding: "6px 10px",
    background: "#fafafa",
  },
  pillDim: { color: "#7a7a7a", fontSize: 12, fontWeight: 700 },
  pillStrong: { fontWeight: 900 },

  arcWarm: {
    fill: "none",
    stroke: "#f0c23a",
    strokeWidth: 14,
    strokeLinecap: "round",
    opacity: 0.55,
    strokeDasharray: "14 8",
  },
  arcCool: {
    fill: "none",
    stroke: "#7cc7f7",
    strokeWidth: 14,
    strokeLinecap: "round",
    opacity: 0.35,
    strokeDasharray: "14 8",
  },

  ringBase: { fill: "none", stroke: "#efefef", strokeWidth: 16 },
  ringProgress: {
    fill: "none",
    stroke: "#f0c23a",
    strokeWidth: 16,
    strokeLinecap: "round",
    transform: "rotate(-90deg)",
    transformOrigin: "50% 50%",
  },

  centerLabel: { fontSize: 12, fill: "#444", fontWeight: 800 },
  centerValue: { fontSize: 40, fill: "#111", fontWeight: 900, letterSpacing: 0.5 },
  centerSub: { fontSize: 12, fill: "#7a7a7a", fontWeight: 800 },

  kv: {
    flex: 1,
    border: "1px solid #dddddd",
    borderRadius: 12,
    padding: 10,
    background: "#fafafa",
  },
  kvK: { fontSize: 12, color: "#7a7a7a", fontWeight: 800 },
  kvV: { fontSize: 18, fontWeight: 900, marginTop: 2 },

  tableHead: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingBottom: 10,
    borderBottom: "1px solid #dddddd",
  },
  title: { fontSize: 14, fontWeight: 900 },
  tableCols: {
    display: "grid",
    gridTemplateColumns: "140px 170px",
    gap: 16,
  },
  colHead: { color: "#7a7a7a", fontSize: 12, fontWeight: 900 },

  rowItem: {
    display: "grid",
    gridTemplateColumns: "1fr 140px 170px 140px",
    gap: 16,
    alignItems: "center",
    padding: "8px 10px",
    border: "1px solid #efefef",
    borderRadius: 12,
    background: "#fcfcfc",
  },
  prod: { display: "flex", alignItems: "center", gap: 10 },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    border: "1px solid #dddddd",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#fff",
    fontSize: 16,
  },
  prodName: { fontWeight: 900, fontSize: 13 },
  rate: { fontWeight: 900, textAlign: "right" },
  depot: { fontWeight: 800, color: "#333", textAlign: "right" },

  miniBar: {
    height: 10,
    borderRadius: 999,
    background: "#f0f0f0",
    border: "1px solid #e9e9e9",
    overflow: "hidden",
  },
  miniFill: { height: "100%", background: "#7cc7f7", width: "0%" },

  footer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
    padding: "12px 14px",
    border: "1px solid #dddddd",
    borderRadius: 14,
    background: "rgba(255,255,255,0.75)",
    gap: 12,
  },

  muted: { fontSize: 12, color: "#7a7a7a", fontWeight: 800 },
  strong: { fontWeight: 900 },
};