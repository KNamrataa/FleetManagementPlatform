import { useMemo } from "react";
import { downloadTablePdf } from "../utils/pdfExport";

const cellText = (value) => {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toLocaleString();
  if (Array.isArray(value)) return value.map(cellText).filter(Boolean).join(" ");
  if (value?.props) return cellText(value.props.children);
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}: ${cellText(item)}`).join("; ");
  return String(value);
};
const csvCell = value => `"${cellText(value).replaceAll('"', '""')}"`;

export default function DashboardExportButtons({ title = "FleetFlow Report", headers = [], rows = [], className = "" }) {
  const normalized = useMemo(() => (rows || []).map(row => (Array.isArray(row) ? row : headers.map(key => row?.[key])) .map(cellText)), [rows, headers]);
  const safeName = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "fleetflow-report";
  const exportCsv = () => {
    if (!headers.length || !normalized.length) return;
    const content = [headers.map(csvCell).join(","), ...normalized.map(row => row.map(csvCell).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${safeName}.csv`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  };
  const exportPdf = () => {
    if (!headers.length || !normalized.length) return;
    downloadTablePdf(`FleetFlow - ${title}`, headers.map(cellText), normalized, safeName);
  };
  const style = { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", margin: "16px 0 0" };
  const buttonStyle = { cursor: "pointer", border: "1px solid #cbd5e1", borderRadius: 6, padding: "7px 11px", background: "var(--surface, #fff)", color: "var(--text, #1f2937)", fontSize: 13, fontWeight: 600 };
  const disabled = !headers.length || !normalized.length;
  return <div className={className} style={style} aria-label={`${title} export actions`}><button type="button" style={buttonStyle} onClick={exportCsv} disabled={disabled}>Export CSV</button><button type="button" style={buttonStyle} onClick={exportPdf} disabled={disabled}>Export PDF</button></div>;
}
