import "../Dashboard.css";
import { useCallback } from "react";
import { downloadTablePdf } from "../utils/pdfExport";

const cleanText = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export default function PageBottomExportActions({ title = "Dashboard Data" }) {
  const collectTables = useCallback(() => {
    const root = document.querySelector(".customer-content, .fm-content, .driver-content, .finance-content, .maintenance-content, .management-content, .tm-shell .fm-content") || document.querySelector("main");
    if (!root) return [];
    return Array.from(root.querySelectorAll("table")).map((table, index) => {
      const headers = Array.from(table.querySelectorAll("thead th")).map((cell) => cleanText(cell.innerText));
      const rows = Array.from(table.querySelectorAll("tbody tr"))
        .filter((tr) => !tr.querySelector("[colspan]"))
        .map((tr) => Array.from(tr.querySelectorAll("td")).map((cell) => cleanText(cell.innerText)));
      return { name: table.getAttribute("aria-label") || table.closest("section")?.querySelector("h2, h3")?.innerText?.trim() || `Table ${index + 1}`, headers, rows };
    }).filter((table) => table.headers.length && table.rows.length);
  }, []);

  const exportCsv = () => {
    const tables = collectTables();
    if (!tables.length) return;
    const rows = [["Section", "Record", "Field", "Value"]];
    tables.forEach((table) => table.rows.forEach((row, recordIndex) => {
      table.headers.forEach((header, columnIndex) => rows.push([table.name, String(recordIndex + 1), header || `Column ${columnIndex + 1}`, row[columnIndex] ?? ""]));
    }));
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "dashboard"}-data.csv`;
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const tables = collectTables();
    if (!tables.length) return;
    const rows = [];
    tables.forEach((table) => table.rows.forEach((row, recordIndex) => {
      table.headers.forEach((header, columnIndex) => rows.push([table.name, String(recordIndex + 1), header || `Column ${columnIndex + 1}`, row[columnIndex] ?? ""]));
    }));
    downloadTablePdf(`${title} - All Visible Table Data`, ["Section", "Record", "Field", "Value"], rows, title.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  };

  const hasTables = () => collectTables().length > 0;
  return <div className="page-bottom-export-actions" aria-label="Dashboard export actions">
    <span>Export dashboard data</span>
    <div>
      <button type="button" onClick={exportCsv}>Export CSV</button>
      <button type="button" onClick={exportPdf}>Export PDF</button>
    </div>
  </div>;
}
