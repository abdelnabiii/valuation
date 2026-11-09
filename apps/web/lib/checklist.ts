/** Pre-send checklist. Mirrored in docs/PRE-SEND-CHECKLIST.md. */
export const CHECKLIST: { title: string; items: string[] }[] = [
  {
    title: "Client data",
    items: [
      "Monthly revenue per unit agrees to the client's P&L or bank statements for at least three sample months.",
      "Sales are ex-VAT, and delivery sales are gross with commission shown as a cost (or the conversion is documented).",
      "Every figure extracted from an uploaded P&L was reviewed before you confirmed it.",
      "Owner pay and one-off add-backs are supported by evidence (payslips, invoices) and are genuinely non-recurring.",
      "Lease terms (years left, rent, renewal rights, escalation) match the signed leases.",
      "Debt, cash and deposit balances match statements at the valuation date.",
      "Capex and fit-out figures match invoices or the fixed-asset register.",
    ],
  },
  {
    title: "Market data and sources",
    items: [
      "Every macro input (T-bill, inflation path, FX, tax, VAT, country risk premium, ERP, size premium) cites a source and is dated within 30 days of the valuation date, or the staleness is waived with a reason.",
      "You opened each source link and checked that the figure and date are stated there.",
      "Every comparable has a dated source that states the multiple or the figures behind it; exclusions have a reason.",
      "The market-rate manager salary is supported by a salary survey or quotes.",
    ],
  },
  {
    title: "Judgement",
    items: [
      "Scenario growth, margin path and new-unit plans are reasonable against the client's history and plan.",
      "The company-specific premium and the adjustments do not count the same risk twice.",
      "Reconciliation weights and the young-company treatment are explained in the report.",
      "The concluded range is sensible against the asset floor, any offers received and past valuations.",
      "Sensitivities show which assumptions move the value most; those are discussed in the report.",
    ],
  },
  {
    title: "Outputs",
    items: [
      "The Excel, report and deck come from the same saved run (same run ID on each).",
      "The run is final, or the client has agreed to receive a provisional valuation and the Open Items page is included.",
      "The disclaimer states that this is an advisory valuation, not a certified valuation by a licensed valuer.",
      "Client name, valuation date, standard of value and basis (control or minority) are correct on every output.",
      "You read the report end to end for typos, layout problems and anything a client could misread.",
    ],
  },
];
