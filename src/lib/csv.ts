/**
 * CSV for a spreadsheet, not for a parser.
 *
 * The admin downloads this and opens it in Excel, which is why the escaping
 * below is stricter than RFC 4180 requires.
 */

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string;
};

/**
 * A leading =, +, - or @ makes Excel and Sheets treat the cell as a formula,
 * so a lead named `=HYPERLINK(...)` becomes executable content in the admin's
 * spreadsheet. Prefixing with an apostrophe forces it back to text; the
 * apostrophe is not displayed.
 */
function neutraliseFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function escapeCell(value: string): string {
  const safe = neutraliseFormula(value);
  // Quote whenever the cell could otherwise break the row, and double any
  // quotes inside it.
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [
    columns.map((column) => escapeCell(column.header)).join(","),
    ...rows.map((row) => columns.map((column) => escapeCell(column.value(row) ?? "")).join(",")),
  ];

  // CRLF, because that is what Excel expects on every platform.
  return lines.join("\r\n");
}
