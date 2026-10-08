import { describe, expect, it } from "vitest";
import type { Sheet } from "@/lib/v2/pay/sheet";
import { appValues, compareCheck, planCheck, readSheetPeople, type AppPerson } from "./reconcile";

// A synthetic payroll sheet like an agent keeps: invented people and amounts.
const sheet: Sheet = {
  name: "Oct",
  rows: [
    ["TTDI payroll October 2026"],
    ["No", "Staff ID", "Name", "Parcels", "KPI", "Fuel", "Penalty", "Net Pay"],
    ["1", "kul001", "Ahmad Faiz", "1,520", "12.00", "", "50", "1,862.40"],
    ["2", "KUL002", "Siti Aminah", "980", "0", "45.50", "", "1,203.00"],
    ["3", "", "Lee Chong", "300", "", "", "", "(20.00)"],
    ["4", "HUB9", "Unknown Rider", "10", "", "", "", "12.00"],
    ["", "", "Total", "2,810", "", "", "", "3,057.40"],
  ],
};

const person = (dispatcherId: string, extId: string, name: string, values: Partial<AppPerson["values"]>): AppPerson => ({
  dispatcherId,
  extId,
  name,
  values: { net: 0, earnings: 0, deductions: 0, parcels: 0, ...values } as AppPerson["values"],
});

describe("reconciliation", () => {
  it("finds the header under a title and the figures it knows", () => {
    expect(planCheck(sheet)).toEqual({
      sheet: "Oct",
      headerRow: 1,
      extId: 1,
      name: 2,
      measures: [
        { measure: "parcels", column: 3 },
        { measure: "kind:KPI", column: 4 },
        { measure: "kind:FUEL", column: 5 },
        { measure: "kind:PENALTY", column: 6 },
        { measure: "net", column: 7 },
      ],
    });
  });

  it("reads people and figures, blanks as nothing, brackets as negative, totals skipped", () => {
    const people = readSheetPeople(sheet, planCheck(sheet));
    expect(people.map((p) => [p.key, p.values.parcels, p.values["kind:KPI"], p.values["kind:FUEL"], p.values.net])).toEqual([
      ["id:KUL001", 1520, 1200, 0, 186240],
      ["id:KUL002", 980, 0, 4550, 120300],
      ["name:LEE CHONG", 300, 0, 0, -2000],
      ["id:HUB9", 10, 0, 0, 1200],
    ]);
  });

  it("compares figure by figure, by J&T ID or a unique name, and lists who is on one side only", () => {
    const app = [
      person("d1", "KUL001", "Ahmad Faiz", { parcels: 1520, "kind:KPI": 1200, net: 186240 }),
      person("d2", "KUL002", "Siti Aminah", { parcels: 980, "kind:KPI": 0, net: 120250 }),
      person("d3", "KUL003", "Lee  Chong", { parcels: 300, net: -2000 }),
      person("d4", "KUL004", "Nur Izzati", { parcels: 5, net: 700 }),
    ];
    const lines = compareCheck(readSheetPeople(sheet, planCheck(sheet)), app, ["parcels", "net"]);
    expect(lines.map((l) => [l.key, l.sheet, l.app, l.status])).toEqual([
      ["id:KUL001|parcels", 1520, 1520, "match"],
      ["id:KUL001|net", 186240, 186240, "match"],
      ["id:KUL002|parcels", 980, 980, "match"],
      ["id:KUL002|net", 120300, 120250, "differs"],
      ["name:LEE CHONG|parcels", 300, 300, "match"],
      ["name:LEE CHONG|net", -2000, -2000, "match"],
      ["id:HUB9|parcels", 10, null, "sheetOnly"],
      ["id:HUB9|net", 1200, null, "sheetOnly"],
      ["app:d4|parcels", null, 5, "appOnly"],
      ["app:d4|net", null, 700, "appOnly"],
    ]);
  });

  it("sums a dispatcher's pay lines by kind", () => {
    const values = appValues({
      netCents: 900,
      earningsCents: 1500,
      deductionCents: 600,
      parcels: 12,
      lines: [
        { kind: "PARCEL", cents: 1200 },
        { kind: "KPI", cents: 300 },
        { kind: "PENALTY", cents: 400 },
        { kind: "PENALTY", cents: 200 },
      ],
    });
    expect([values.net, values.parcels, values["kind:PARCEL"], values["kind:PENALTY"], values["kind:FUEL"]]).toEqual([900, 12, 1200, 600, 0]);
  });
});
