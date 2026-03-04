// src/models/ledger.js

export const EntryType = Object.freeze({
  INCOME: "income",
  EXPENSE: "expense",
});

export class MoneyEntry {
  constructor({ id, name, type, amountPerMin, icon = "💠" }) {
    this.id = id;
    this.name = name;
    this.type = type; // income | expense
    this.amountPerMin = amountPerMin; // number (>=0)
    this.icon = icon;
  }

  signedRatePerMin() {
    return this.type === EntryType.INCOME ? this.amountPerMin : -this.amountPerMin;
  }
}

export class CategoryLedger {
  constructor({ id, name, icon = "📦", capacity = 11000, initial = 0 }) {
    this.id = id;
    this.name = name;
    this.icon = icon;
    this.capacity = capacity;
    this.balance = initial;

    /** @type {MoneyEntry[]} */
    this.entries = [];
  }

  addEntry(entry) {
    this.entries.push(entry);
    return this;
  }

  removeEntry(entryId) {
    this.entries = this.entries.filter((e) => e.id !== entryId);
    return this;
  }

  incomeRatePerMin() {
    return this.entries
      .filter((e) => e.type === EntryType.INCOME)
      .reduce((sum, e) => sum + e.amountPerMin, 0);
  }

  expenseRatePerMin() {
    return this.entries
      .filter((e) => e.type === EntryType.EXPENSE)
      .reduce((sum, e) => sum + e.amountPerMin, 0);
  }

  netRatePerMin() {
    return this.incomeRatePerMin() - this.expenseRatePerMin();
  }

  // advance balance by minutes (can be fractional)
  tick(minutes = 1) {
    const delta = this.netRatePerMin() * minutes;
    this.balance = clamp(this.balance + delta, 0, this.capacity);
    return this;
  }

  fillRatio() {
    return this.capacity <= 0 ? 0 : clamp(this.balance / this.capacity, 0, 1);
  }
}

export class LedgerEngine {
  constructor({ categories = [], powerUse = 145, powerOutput = 200 } = {}) {
    /** @type {CategoryLedger[]} */
    this.categories = categories;

    this.powerUse = powerUse;
    this.powerOutput = powerOutput;

    // bookkeeping
    this.lastAutoManageAt = Date.now();
    this.startedAt = Date.now();
  }

  addCategory(category) {
    this.categories.push(category);
    return this;
  }

  totalIncomePerMin() {
    return this.categories.reduce((sum, c) => sum + c.incomeRatePerMin(), 0);
  }

  totalExpensePerMin() {
    return this.categories.reduce((sum, c) => sum + c.expenseRatePerMin(), 0);
  }

  totalNetPerMin() {
    return this.totalIncomePerMin() - this.totalExpensePerMin();
  }

  // For the big gauge: combine "power grid" vibe with "budget health"
  // Here we define health as: net >=0 => good, net<0 => bad, and also consider reserve fullness.
  budgetHealthRatio() {
    // Weighted: 60% net positivity, 40% average reserves
    const net = this.totalNetPerMin();
    const netScore = net >= 0 ? 1 : clamp(1 + net / Math.max(1, this.totalExpensePerMin()), 0, 1);

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
    // Example auto-management: if a category is near full, reduce its income a bit (simulate throttling)
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

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}