import React, { useState, useRef, useCallback } from "react";
import { createWorker } from "tesseract.js";
import "./ReceiptSplitter.css";

// ─── Step constants ────────────────────────────────────────────────────────
const STEP_UPLOAD = "upload";
const STEP_ITEMS = "items";
const STEP_PEOPLE = "people";
const STEP_RESULT = "result";

// ─── Favourites localStorage helpers ──────────────────────────────────────
const FAV_KEY = "rs_favourites";
function loadFavourites() {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
  } catch {
    return [];
  }
}
function persistFavourites(favs) {
  localStorage.setItem(FAV_KEY, JSON.stringify(favs));
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2);
}

function formatMoney(n) {
  return `$${Math.abs(n).toFixed(2)}`;
}

/** Very simple receipt-line parser: "Some Item Name   12.50" */
function parseReceiptText(text) {
  const lines = text.split("\n");
  const items = [];
  // Match a price at the end of the line:  12.50 / $12.50 / 12,50
  const priceRe = /\$?\s*(\d{1,5}[.,]\d{2})\s*$/;
  const skipRe =
    /total|subtotal|sub-total|tax|tip|gratuity|change|cash|credit|balance|amount|due|paid|vat|gst/i;

  for (const line of lines) {
    const t = line.trim();
    if (!t || t.length < 3) continue;
    const m = t.match(priceRe);
    if (!m) continue;
    const price = parseFloat(m[1].replace(",", "."));
    if (!price || price <= 0 || price > 9999) continue;
    const name =
      t
        .slice(0, t.lastIndexOf(m[0]))
        .replace(/[\s.]+$/, "")
        .trim() || "Item";
    if (skipRe.test(name)) continue;
    items.push({ id: uid(), name, price, assignedTo: null });
  }
  return items;
}

// ─── Sub-components ────────────────────────────────────────────────────────

function StepIndicator({ step }) {
  const steps = [
    { key: STEP_UPLOAD, label: "Upload" },
    { key: STEP_ITEMS, label: "Items" },
    { key: STEP_PEOPLE, label: "Split" },
    { key: STEP_RESULT, label: "Result" },
  ];
  const current = steps.findIndex((s) => s.key === step);
  return (
    <div className="rs-steps">
      {steps.map((s, i) => (
        <React.Fragment key={s.key}>
          <div
            className={`rs-step ${i <= current ? "rs-step--done" : ""} ${s.key === step ? "rs-step--active" : ""}`}
          >
            <div className="rs-step-circle">{i < current ? "✓" : i + 1}</div>
            <div className="rs-step-label">{s.label}</div>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`rs-step-line ${i < current ? "rs-step-line--done" : ""}`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function ReceiptSplitter({ onGoHome, onSaveBill } = {}) {
  const [step, setStep] = useState(STEP_UPLOAD);
  const [imagePreview, setImagePreview] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [items, setItems] = useState([]);
  const [people, setPeople] = useState([
    { id: uid(), name: "Person 1" },
    { id: uid(), name: "Person 2" },
  ]);
  const [tax, setTax] = useState("");
  const [tip, setTip] = useState("");
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [favourites, setFavourites] = useState(loadFavourites);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // ── Favourites ─────────────────────────────────────────────────────────────
  const isFavourite = (name) =>
    favourites.some((f) => f.name.toLowerCase() === name.trim().toLowerCase());

  const toggleFavourite = (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const already = isFavourite(trimmed);
    const next = already
      ? favourites.filter((f) => f.name.toLowerCase() !== trimmed.toLowerCase())
      : [...favourites, { id: uid(), name: trimmed }];
    setFavourites(next);
    persistFavourites(next);
  };

  const addFromFavourite = (favName) => {
    // don't add if name already in current list
    if (people.some((p) => p.name.toLowerCase() === favName.toLowerCase())) return;
    setPeople((prev) => [...prev, { id: uid(), name: favName }]);
  };

  // ── OCR processing ────────────────────────────────────────────────────────
  const processImage = useCallback(async (file) => {
    if (!file) return;
    setIsProcessing(true);
    setOcrProgress(0);
    setImagePreview(URL.createObjectURL(file));
    setStep(STEP_ITEMS);

    try {
      const worker = await createWorker("eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setOcrProgress(Math.round(m.progress * 100));
          }
        },
      });
      const {
        data: { text },
      } = await worker.recognize(file);
      await worker.terminate();
      const parsed = parseReceiptText(text);
      setItems(parsed);
    } catch (err) {
      console.error("OCR failed:", err);
      setItems([]);
    } finally {
      setIsProcessing(false);
      setOcrProgress(100);
    }
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
    e.target.value = "";
  };

  // ── Drag & Drop ───────────────────────────────────────────────────────────
  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) processImage(file);
  };

  // ── Item CRUD ─────────────────────────────────────────────────────────────
  const addItem = () => {
    const price = parseFloat(newPrice);
    if (!newName.trim() || isNaN(price) || price <= 0) return;
    setItems((prev) => [
      ...prev,
      { id: uid(), name: newName.trim(), price, assignedTo: null },
    ]);
    setNewName("");
    setNewPrice("");
  };

  const updateItem = (id, field, value) =>
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)),
    );

  const removeItem = (id) =>
    setItems((prev) => prev.filter((it) => it.id !== id));

  // assignedTo: null = shared by all, string[] = person ids
  const togglePersonOnItem = (itemId, personId) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        if (it.assignedTo === null) {
          // Switch to custom: only this person
          return { ...it, assignedTo: [personId] };
        }
        const already = it.assignedTo.includes(personId);
        const next = already
          ? it.assignedTo.filter((p) => p !== personId)
          : [...it.assignedTo, personId];
        // If all people selected → back to "shared"
        if (next.length === people.length) return { ...it, assignedTo: null };
        // If nobody selected → keep at least the clicked person
        if (next.length === 0) return { ...it, assignedTo: [personId] };
        return { ...it, assignedTo: next };
      }),
    );
  };

  const setItemShared = (id) => updateItem(id, "assignedTo", null);

  // ── People CRUD ───────────────────────────────────────────────────────────
  const addPerson = () =>
    setPeople((prev) => [
      ...prev,
      { id: uid(), name: `Person ${prev.length + 1}` },
    ]);

  const removePerson = (id) => {
    setPeople((prev) => prev.filter((p) => p.id !== id));
    // fix items that were assigned to removed person
    setItems((prev) =>
      prev.map((it) => {
        if (it.assignedTo === null) return it;
        const filtered = it.assignedTo.filter((pid) => pid !== id);
        return { ...it, assignedTo: filtered.length === 0 ? null : filtered };
      }),
    );
  };

  const updatePersonName = (id, name) =>
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));

  // ── Totals calculation ────────────────────────────────────────────────────
  const subtotal = items.reduce((s, it) => s + it.price, 0);
  const taxAmt = parseFloat(tax) || 0;
  const tipAmt = parseFloat(tip) || 0;
  const grandTotal = subtotal + taxAmt + tipAmt;

  const calcSplit = () => {
    const shares = {};
    people.forEach((p) => {
      shares[p.id] = { items: [], itemsTotal: 0 };
    });

    items.forEach((it) => {
      const owners = it.assignedTo ?? people.map((p) => p.id);
      const each = it.price / owners.length;
      owners.forEach((pid) => {
        if (shares[pid]) {
          shares[pid].items.push({ name: it.name, each });
          shares[pid].itemsTotal += each;
        }
      });
    });

    // Proportional tax + tip
    people.forEach((p) => {
      const ratio =
        grandTotal > 0
          ? shares[p.id].itemsTotal / Math.max(subtotal, 0.01)
          : 1 / people.length;
      shares[p.id].taxShare = taxAmt * ratio;
      shares[p.id].tipShare = tipAmt * ratio;
      shares[p.id].total =
        shares[p.id].itemsTotal + shares[p.id].taxShare + shares[p.id].tipShare;
    });

    return shares;
  };

  const reset = () => {
    setStep(STEP_UPLOAD);
    setImagePreview(null);
    setItems([]);
    setTax("");
    setTip("");
    setNewName("");
    setNewPrice("");
    setPeople([
      { id: uid(), name: "Person 1" },
      { id: uid(), name: "Person 2" },
    ]);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="rs-shell">
      {/* ── Header ── */}
      <header className="rs-header">
        {onGoHome ? (
          <button
            className="rs-header-back"
            onClick={onGoHome}
            aria-label="Back to home"
          >
            ← Home
          </button>
        ) : (
          <div className="rs-logo">🧾</div>
        )}
        <div>
          <h1 className="rs-title">SplitReceipt</h1>
          <p className="rs-subtitle">Snap · Scan · Split</p>
        </div>
      </header>

      <StepIndicator step={step} />

      <main className="rs-main">
        {/* ══════════════════ STEP 1 – UPLOAD ══════════════════════════════ */}
        {step === STEP_UPLOAD && (
          <div className="rs-card rs-upload">
            <h2 className="rs-card-title">Upload your receipt</h2>
            <p className="rs-card-desc">
              Take a photo or upload an image — we'll read the items
              automatically.
            </p>

            {/* Drop zone */}
            <div
              className={`rs-dropzone ${dragOver ? "rs-dropzone--over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) =>
                e.key === "Enter" && fileInputRef.current?.click()
              }
              aria-label="Click or drag receipt image here"
            >
              <div className="rs-dropzone-icon">📷</div>
              <div className="rs-dropzone-text">Click or drag image here</div>
              <div className="rs-dropzone-hint">PNG, JPG, HEIC · max 20 MB</div>
            </div>

            {/* Hidden inputs */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="rs-hidden-input"
              onChange={handleFileChange}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="rs-hidden-input"
              onChange={handleFileChange}
            />

            {/* Buttons */}
            <div className="rs-btn-row">
              <button
                className="rs-btn rs-btn--primary"
                onClick={() => cameraInputRef.current?.click()}
              >
                📸 Take Photo
              </button>
              <button
                className="rs-btn rs-btn--outline"
                onClick={() => fileInputRef.current?.click()}
              >
                🗂 Choose File
              </button>
            </div>

            {/* Skip to manual entry */}
            <button className="rs-link" onClick={() => setStep(STEP_ITEMS)}>
              Skip — enter items manually
            </button>
          </div>
        )}

        {/* ══════════════════ STEP 2 – ITEMS ═══════════════════════════════ */}
        {step === STEP_ITEMS && (
          <div className="rs-card">
            <div className="rs-items-top">
              {imagePreview && (
                <img
                  src={imagePreview}
                  alt="Receipt"
                  className="rs-receipt-thumb"
                />
              )}
              <div className="rs-items-header">
                <h2 className="rs-card-title">Review items</h2>
                {isProcessing ? (
                  <div className="rs-ocr-status">
                    <div className="rs-spinner" />
                    <span>Reading receipt… {ocrProgress}%</span>
                    <div className="rs-progress-bar">
                      <div
                        className="rs-progress-fill"
                        style={{ width: `${ocrProgress}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="rs-card-desc">
                    {items.length > 0
                      ? `${items.length} item${items.length !== 1 ? "s" : ""} found. Edit if needed.`
                      : "No items detected. Add them manually below."}
                  </p>
                )}
              </div>
            </div>

            {/* Item list */}
            {items.length > 0 && (
              <ul className="rs-item-list">
                {items.map((it) => (
                  <li className="rs-item-row" key={it.id}>
                    <input
                      className="rs-input rs-input--name"
                      value={it.name}
                      onChange={(e) =>
                        updateItem(it.id, "name", e.target.value)
                      }
                      placeholder="Item name"
                      aria-label="Item name"
                    />
                    <span className="rs-dollar">$</span>
                    <input
                      className="rs-input rs-input--price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={it.price}
                      onChange={(e) =>
                        updateItem(
                          it.id,
                          "price",
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      aria-label="Item price"
                    />
                    <button
                      className="rs-icon-btn rs-icon-btn--remove"
                      onClick={() => removeItem(it.id)}
                      aria-label="Remove item"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Add item manually */}
            <div className="rs-add-item">
              <p className="rs-label">Add item</p>
              <div className="rs-add-row">
                <input
                  className="rs-input rs-input--name"
                  placeholder="Item name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addItem()}
                />
                <span className="rs-dollar">$</span>
                <input
                  className="rs-input rs-input--price"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addItem()}
                />
                <button
                  className="rs-icon-btn rs-icon-btn--add"
                  onClick={addItem}
                  aria-label="Add item"
                >
                  +
                </button>
              </div>
            </div>

            {/* Tax & Tip */}
            <div className="rs-extras">
              <div className="rs-extra-field">
                <label className="rs-label">Tax ($)</label>
                <div className="rs-input-wrap">
                  <span className="rs-dollar">$</span>
                  <input
                    className="rs-input rs-input--price"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={tax}
                    onChange={(e) => setTax(e.target.value)}
                  />
                </div>
              </div>
              <div className="rs-extra-field">
                <label className="rs-label">Tip ($)</label>
                <div className="rs-input-wrap">
                  <span className="rs-dollar">$</span>
                  <input
                    className="rs-input rs-input--price"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={tip}
                    onChange={(e) => setTip(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Subtotal */}
            <div className="rs-subtotal">
              <span>Subtotal</span>
              <strong>{formatMoney(subtotal)}</strong>
            </div>

            <div className="rs-btn-row rs-btn-row--between">
              <button
                className="rs-btn rs-btn--ghost"
                onClick={() => setStep(STEP_UPLOAD)}
              >
                ← Back
              </button>
              <button
                className="rs-btn rs-btn--primary"
                disabled={items.length === 0}
                onClick={() => setStep(STEP_PEOPLE)}
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════ STEP 3 – PEOPLE & SPLIT ═══════════════════════ */}
        {step === STEP_PEOPLE && (
          <div className="rs-card">
            <h2 className="rs-card-title">Who's splitting?</h2>
            <p className="rs-card-desc">
              Add people, then choose who pays for each item.
            </p>

            {/* Quick-add from favourites */}
            {favourites.length > 0 && (
              <div className="rs-favs-section">
                <div className="rs-favs-label">⭐ Favourites</div>
                <div className="rs-favs-chips">
                  {favourites.map((fav) => {
                    const alreadyAdded = people.some(
                      (p) => p.name.toLowerCase() === fav.name.toLowerCase()
                    );
                    return (
                      <button
                        key={fav.id}
                        className={`rs-fav-chip ${
                          alreadyAdded ? "rs-fav-chip--added" : ""
                        }`}
                        onClick={() => addFromFavourite(fav.name)}
                        disabled={alreadyAdded}
                        title={alreadyAdded ? "Already in the list" : `Add ${fav.name}`}
                      >
                        <span className="rs-fav-chip-name">{fav.name}</span>
                        {alreadyAdded ? (
                          <span className="rs-fav-chip-check">✓</span>
                        ) : (
                          <span className="rs-fav-chip-plus">+</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* People list */}
            <div className="rs-people-list">
              {people.map((p, i) => (
                <div className="rs-person-row" key={p.id}>
                  <div className="rs-person-avatar">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <input
                    className="rs-input rs-input--name"
                    value={p.name}
                    onChange={(e) => updatePersonName(p.id, e.target.value)}
                    aria-label={`Name for person ${i + 1}`}
                  />
                  <button
                    className={`rs-icon-btn rs-icon-btn--star ${
                      isFavourite(p.name) ? "rs-icon-btn--star-on" : ""
                    }`}
                    onClick={() => toggleFavourite(p.name)}
                    aria-label={isFavourite(p.name) ? "Remove from favourites" : "Save to favourites"}
                    title={isFavourite(p.name) ? "Remove from favourites" : "Save to favourites"}
                  >
                    {isFavourite(p.name) ? "★" : "☆"}
                  </button>
                  {people.length > 1 && (
                    <button
                      className="rs-icon-btn rs-icon-btn--remove"
                      onClick={() => removePerson(p.id)}
                      aria-label="Remove person"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button
                className="rs-btn rs-btn--outline rs-btn--sm"
                onClick={addPerson}
              >
                + Add person
              </button>
            </div>

            {/* Item assignment */}
            <h3 className="rs-section-title">Assign items</h3>
            <p className="rs-hint">
              By default every item is <strong>shared equally</strong>. Tap a
              name to assign it to specific people only.
            </p>

            <ul className="rs-assign-list">
              {items.map((it) => (
                <li className="rs-assign-row" key={it.id}>
                  <div className="rs-assign-meta">
                    <span className="rs-assign-name">{it.name}</span>
                    <span className="rs-assign-price">
                      {formatMoney(it.price)}
                    </span>
                  </div>
                  <div className="rs-assign-people">
                    <button
                      className={`rs-chip ${it.assignedTo === null ? "rs-chip--active" : ""}`}
                      onClick={() => setItemShared(it.id)}
                    >
                      All
                    </button>
                    {people.map((p) => {
                      const isOn =
                        it.assignedTo === null || it.assignedTo.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          className={`rs-chip ${it.assignedTo !== null && isOn ? "rs-chip--active" : ""}`}
                          onClick={() => togglePersonOnItem(it.id, p.id)}
                        >
                          {p.name.split(" ")[0]}
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>

            <div className="rs-btn-row rs-btn-row--between">
              <button
                className="rs-btn rs-btn--ghost"
                onClick={() => setStep(STEP_ITEMS)}
              >
                ← Back
              </button>
              <button
                className="rs-btn rs-btn--primary"
                onClick={() => setStep(STEP_RESULT)}
              >
                Calculate →
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════ STEP 4 – RESULT ══════════════════════════════ */}
        {step === STEP_RESULT &&
          (() => {
            const splits = calcSplit();
            return (
              <div className="rs-card">
                <div className="rs-result-header">
                  <h2 className="rs-card-title">Here's the split 🎉</h2>
                  <div className="rs-total-badge">
                    {formatMoney(grandTotal)}
                  </div>
                </div>

                <div className="rs-result-grid">
                  {people.map((p) => {
                    const s = splits[p.id];
                    return (
                      <div className="rs-result-card" key={p.id}>
                        <div className="rs-result-person">
                          <div className="rs-person-avatar rs-person-avatar--lg">
                            {p.name.charAt(0).toUpperCase()}
                          </div>
                          <span>{p.name}</span>
                        </div>

                        <ul className="rs-result-items">
                          {s.items.map((ri, i) => (
                            <li key={i} className="rs-result-item">
                              <span className="rs-result-item-name">
                                {ri.name}
                              </span>
                              <span>{formatMoney(ri.each)}</span>
                            </li>
                          ))}
                          {s.taxShare > 0 && (
                            <li className="rs-result-item rs-result-item--extra">
                              <span>Tax (share)</span>
                              <span>{formatMoney(s.taxShare)}</span>
                            </li>
                          )}
                          {s.tipShare > 0 && (
                            <li className="rs-result-item rs-result-item--extra">
                              <span>Tip (share)</span>
                              <span>{formatMoney(s.tipShare)}</span>
                            </li>
                          )}
                        </ul>

                        <div className="rs-result-total">
                          <span>Total</span>
                          <strong className="rs-result-total-amt">
                            {formatMoney(s.total)}
                          </strong>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Grand total summary */}
                <div className="rs-summary">
                  <div className="rs-summary-row">
                    <span>Subtotal</span>
                    <span>{formatMoney(subtotal)}</span>
                  </div>
                  {taxAmt > 0 && (
                    <div className="rs-summary-row">
                      <span>Tax</span>
                      <span>{formatMoney(taxAmt)}</span>
                    </div>
                  )}
                  {tipAmt > 0 && (
                    <div className="rs-summary-row">
                      <span>Tip</span>
                      <span>{formatMoney(tipAmt)}</span>
                    </div>
                  )}
                  <div className="rs-summary-row rs-summary-row--total">
                    <span>Grand Total</span>
                    <strong>{formatMoney(grandTotal)}</strong>
                  </div>
                </div>

                <div className="rs-btn-row rs-btn-row--between">
                  <button className="rs-btn rs-btn--ghost" onClick={reset}>
                    🧾 Scan Another
                  </button>
                  {(onSaveBill || onGoHome) && (
                    <button
                      className="rs-btn rs-btn--primary"
                      onClick={() => {
                        if (onSaveBill) {
                          onSaveBill({
                            date: new Date().toISOString(),
                            total: grandTotal,
                            items,
                            people: people.map((p) => ({
                              name: p.name,
                              total: splits[p.id]?.total ?? 0,
                            })),
                          });
                        } else if (onGoHome) {
                          onGoHome();
                        }
                      }}
                    >
                      💾 Save &amp; Go Home
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
      </main>
    </div>
  );
}
