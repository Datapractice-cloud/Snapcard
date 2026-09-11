import { describe, expect, it } from "vitest";
import { toCsv, type CsvColumn } from "./csv";

type Row = { name: string; company: string };

const columns: CsvColumn<Row>[] = [
  { header: "Name", value: (row) => row.name },
  { header: "Company", value: (row) => row.company },
];

function csv(rows: Row[]): string {
  return toCsv(columns, rows);
}

describe("toCsv", () => {
  it("writes a header row and one line per record", () => {
    expect(csv([{ name: "Rohan Deshmukh", company: "Acme Ltd" }])).toBe(
      "Name,Company\r\nRohan Deshmukh,Acme Ltd",
    );
  });

  it("writes just the header when there are no rows", () => {
    expect(csv([])).toBe("Name,Company");
  });

  it("uses CRLF, which is what Excel expects", () => {
    expect(csv([{ name: "A", company: "B" }])).toContain("\r\n");
  });

  it("quotes a cell containing a comma", () => {
    expect(csv([{ name: "Deshmukh, Rohan", company: "Acme" }])).toContain('"Deshmukh, Rohan"');
  });

  it("quotes and doubles an embedded quote", () => {
    expect(csv([{ name: 'Rohan "Ro" D', company: "Acme" }])).toContain('"Rohan ""Ro"" D"');
  });

  it("quotes a cell containing a newline, so the row does not split", () => {
    // OCR happily returns multi-line values.
    expect(csv([{ name: "Rohan\nDeshmukh", company: "Acme" }])).toContain('"Rohan\nDeshmukh"');
  });

  describe("spreadsheet formula injection", () => {
    // A cell starting with one of these is executed by Excel and Sheets. The
    // values come off a stranger's business card, via OCR.
    it.each(["=1+1", "+1", "-1", "@SUM(A1)"])("neutralises %s", (dangerous) => {
      const out = csv([{ name: dangerous, company: "Acme" }]);
      expect(out).toContain(`'${dangerous}`);
    });

    it("neutralises the classic command payload", () => {
      const payload = '=cmd|"/c calc"!A1';
      const out = csv([{ name: payload, company: "Acme" }]);
      // Quoted because it contains a quote, and prefixed so it stays text.
      expect(out).toContain(`"'=cmd|""/c calc""!A1"`);
    });

    it("leaves an ordinary value alone", () => {
      expect(csv([{ name: "Rohan", company: "Acme" }])).not.toContain("'");
    });

    it("does not mistake a phone number's plus for a formula start", () => {
      // It is still prefixed — safety wins over tidiness, and the apostrophe is
      // not displayed by the spreadsheet.
      expect(csv([{ name: "+91 98765 43210", company: "Acme" }])).toContain("'+91 98765 43210");
    });
  });
});
