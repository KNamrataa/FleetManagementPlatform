import { useMemo, useState } from "react";

export function Pagination({ page = 1, totalPages = 1, onPageChange, total = 0, limit = 10, onLimitChange, className = "" }) {
  const safeTotalPages = Math.max(1, Number(totalPages) || 1);
  const safePage = Math.min(Math.max(1, Number(page) || 1), safeTotalPages);
  const pages = useMemo(() => {
    if (safeTotalPages <= 7) return Array.from({ length: safeTotalPages }, (_, i) => i + 1);
    const values = [1];
    const start = Math.max(2, safePage - 1);
    const end = Math.min(safeTotalPages - 1, safePage + 1);
    if (start > 2) values.push("...");
    for (let p = start; p <= end; p += 1) values.push(p);
    if (end < safeTotalPages - 1) values.push("...");
    values.push(safeTotalPages);
    return values;
  }, [safePage, safeTotalPages]);

  if (!total) return null;

  return (
    <div className={`ff-pagination ${className}`.trim()}>
      <div className="ff-pagination-info">
        Showing {Math.min((safePage - 1) * limit + 1, total)}–{Math.min(safePage * limit, total)} of {total}
      </div>
      <div className="ff-pagination-controls">
        {onLimitChange && (
          <label className="ff-pagination-size">
            Rows
            <select value={limit} onChange={(e) => onLimitChange(Number(e.target.value))}>
              {[10, 20, 30, 50].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
        )}
        <button type="button" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)}>Previous</button>
        {pages.map((item, index) => item === "..." ? (
          <span key={`ellipsis-${index}`} className="ff-pagination-ellipsis">…</span>
        ) : (
          <button key={item} type="button" className={item === safePage ? "active" : ""} onClick={() => onPageChange(item)}>{item}</button>
        ))}
        <button type="button" disabled={safePage >= safeTotalPages} onClick={() => onPageChange(safePage + 1)}>Next</button>
      </div>
    </div>
  );
}

export function ClientPaginationTable({ headers, items = [], renderRow, empty = "No records found.", pageSize = 10, className = "", tableClassName = "" }) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(pageSize);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const visibleItems = items.slice((safePage - 1) * limit, safePage * limit);

  return (
    <>
      <div className={className}>
        <table className={tableClassName}>
          <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>
            {visibleItems.length ? visibleItems.map((item, index) => renderRow(item, index)) : <tr><td colSpan={headers.length} className="ff-pagination-empty">{empty}</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={safePage} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={(value) => { setLimit(value); setPage(1); }} />
    </>
  );
}
