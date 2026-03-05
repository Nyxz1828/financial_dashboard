import React, { useState } from "react";
import Homepage from "./components/Homepage";
import ReceiptSplitter from "./components/ReceiptSplitter";

function loadBills() {
  try {
    return JSON.parse(localStorage.getItem("rs_bills") || "[]");
  } catch {
    return [];
  }
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function App() {
  const [page, setPage] = useState("home");
  const [bills, setBills] = useState(loadBills);

  const saveBill = (bill) => {
    const updated = [{ ...bill, id: uid() }, ...bills].slice(0, 100);
    setBills(updated);
    localStorage.setItem("rs_bills", JSON.stringify(updated));
  };

  const deleteBill = (id) => {
    const updated = bills.filter((b) => b.id !== id);
    setBills(updated);
    localStorage.setItem("rs_bills", JSON.stringify(updated));
  };

  if (page === "splitter") {
    return (
      <ReceiptSplitter
        onGoHome={() => setPage("home")}
        onSaveBill={(bill) => {
          saveBill(bill);
          setPage("home");
        }}
      />
    );
  }

  return (
    <Homepage
      bills={bills}
      onUpload={() => setPage("splitter")}
      onDeleteBill={deleteBill}
    />
  );
}
