import type { ParsedRow } from "@/lib/upload/parser";
import type { EmployeeType, StoreKeeperSubtype } from "@/generated/prisma/client";

/**
 * Onboarding sample data: 6 months of deliveries for a fictional branch so a
 * brand-new agent can explore every page. Pure + deterministic (seeded PRNG)
 * so the numbers are stable across sign-ups and testable without a DB.
 * Written to the DB by `seed.ts`, which runs these rows through the real
 * salary calculator.
 */

export const DEMO_MONTHS = 6;

const DISPATCHERS = [
  { name: "AHMAD FAIZAL BIN ROSLI", icNo: "900314065231", dailyAvg: 84, petrol: true },
  { name: "NUR AISYAH BINTI KAMAL", icNo: "950722106482", dailyAvg: 71, petrol: true },
  { name: "LIM WEI JIAN", icNo: "880105145517", dailyAvg: 76, petrol: true },
  { name: "MUHAMMAD HAZIQ BIN AZMAN", icNo: "980611035673", dailyAvg: 62, petrol: true },
  { name: "SITI NORHALIZA BINTI OMAR", icNo: "930918087744", dailyAvg: 55, petrol: false },
  { name: "RAJESH A/L MURUGAN", icNo: "910227016859", dailyAvg: 48, petrol: false },
];

const EMPLOYEES: {
  name: string;
  icNo: string;
  type: EmployeeType;
  subtype: StoreKeeperSubtype;
  basicPay: number;
  hourlyWage: number;
  petrolAllowance: number;
  kpiAllowance: number;
}[] = [
  { name: "TAN MEI LING", icNo: "870403105568", type: "SUPERVISOR", subtype: "PERMANENT", basicPay: 3200, hourlyWage: 0, petrolAllowance: 150, kpiAllowance: 200 },
  { name: "MOHD SYAFIQ BIN HASSAN", icNo: "960812045121", type: "ADMIN", subtype: "PERMANENT", basicPay: 2300, hourlyWage: 0, petrolAllowance: 100, kpiAllowance: 0 },
  { name: "KUMAR A/L SELVAM", icNo: "990130085433", type: "STORE_KEEPER", subtype: "TEMPORARY", basicPay: 0, hourlyWage: 9, petrolAllowance: 0, kpiAllowance: 0 },
  { name: "FARAH NADIA BINTI YUSOF", icNo: "940505146626", type: "DRIVER", subtype: "PERMANENT", basicPay: 2600, hourlyWage: 0, petrolAllowance: 200, kpiAllowance: 0 },
];

/**
 * Extra sample branches (DEMO02+): same roles, pay and petrol mix as DEMO01
 * with different people and volumes, so multi-branch charts have something
 * to compare. IC last digit matches gender (odd = male, even = female).
 */
const EXTRA_BRANCHES: { volume: number; dispatchers: [string, string][]; employees: [string, string][] }[] = [
  {
    volume: 0.85,
    dispatchers: [
      ["MOHD AMIRUL BIN ISMAIL", "920415035117"], ["SITI AMINAH BINTI RAHMAN", "960203146248"],
      ["WONG KAH HO", "890728105539"], ["MUHAMMAD FIRDAUS BIN YAHYA", "970911016451"],
      ["NURUL IZZAH BINTI SALLEH", "940622085262"], ["SURESH A/L RAMASAMY", "900117145573"],
    ],
    employees: [["LEE CHOON HOCK", "850309105185"], ["NOR AZLINA BINTI ZAKARIA", "930504036296"], ["AZRUL BIN HAMDAN", "000812146307"], ["MOHD RIDZUAN BIN AZIZ", "910130085419"]],
  },
  {
    volume: 1.1,
    dispatchers: [
      ["AHMAD ZAKI BIN OTHMAN", "930826065621"], ["CHONG MEI YEE", "950317106732"],
      ["MOHD HAFIZ BIN JAMALUDIN", "880402035843"], ["NUR SYAFIQAH BINTI ROSLAN", "990519146954"],
      ["KHAIRUL ANUAR BIN MAT", "910905015065"], ["VIJAY A/L KRISHNAN", "870614085177"],
    ],
    employees: [["NG SIEW LAN", "860923105288"], ["FAIZAL BIN ABDULLAH", "920707145399"], ["HAZWAN BIN SULAIMAN", "980225036411"], ["ROSMAH BINTI ISA", "900411065522"]],
  },
  {
    volume: 0.7,
    dispatchers: [
      ["SHAHRUL NIZAM BIN HASHIM", "940129035631"], ["TEOH JIA HUI", "970605106742"],
      ["MUHAMMAD AFIQ BIN RAZALI", "960318145853"], ["AINUL MARDHIAH BINTI SAID", "930810086964"],
      ["IZZAT BIN KAMARUDDIN", "990206015075"], ["DANIEL A/L JOSEPH", "920724145187"],
    ],
    employees: [["GOH BOON KIAT", "880516105291"], ["SALMAH BINTI YUNUS", "910830036302"], ["ZULKIFLI BIN DAUD", "010104146413"], ["NORHAYATI BINTI MOHD", "950219085524"]],
  },
];

/** Branch code for sample branch `index` (0 → DEMO01). */
export function demoBranchCode(index: number): string {
  return `DEMO${String(index + 1).padStart(2, "0")}`;
}

export const MAX_DEMO_BRANCHES = EXTRA_BRANCHES.length + 1;

export interface DemoDispatcherMonth {
  year: number;
  month: number;
  rows: ParsedRow[];
  penalty: number;
  advance: number;
}

export interface DemoDispatcher {
  extId: string;
  name: string;
  icNo: string;
  petrolEligible: boolean;
  months: DemoDispatcherMonth[];
}

export interface DemoEmployeeMonth {
  year: number;
  month: number;
  workingHours: number;
  penalty: number;
  advance: number;
}

export type DemoEmployee = (typeof EMPLOYEES)[number] & {
  extId: string;
  months: DemoEmployeeMonth[];
};

export interface DemoDataset {
  code: string;
  months: { year: number; month: number }[];
  dispatchers: DemoDispatcher[];
  employees: DemoEmployee[];
}

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The `count` complete months before `now`, oldest first. */
export function lastCompleteMonths(now: Date, count: number) {
  const out: { year: number; month: number }[] = [];
  for (let i = count; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return out;
}

function randomWeight(rand: () => number): number {
  const r = rand();
  const kg = r < 0.78 ? 0.1 + rand() * 4.9 : r < 0.95 ? 5.01 + rand() * 4.99 : 10.01 + rand() * 15;
  return Math.round(kg * 100) / 100;
}

export function buildDemoDataset(now: Date, branch = 0): DemoDataset {
  if (branch < 0 || branch >= MAX_DEMO_BRANCHES) throw new Error(`No sample branch ${branch}`);
  const code = demoBranchCode(branch);
  const extra = branch > 0 ? EXTRA_BRANCHES[branch - 1] : null;
  const rand = mulberry32(379 + branch);
  const months = lastCompleteMonths(now, DEMO_MONTHS);
  const pick = (chance: number, min: number, max: number, step: number) =>
    rand() < chance ? Math.round((min + rand() * (max - min)) / step) * step : 0;

  const people = DISPATCHERS.map((d, di) => {
    const [name, icNo] = extra ? extra.dispatchers[di] : [d.name, d.icNo];
    return { ...d, name, icNo, dailyAvg: d.dailyAvg * (extra?.volume ?? 1) };
  });

  const dispatchers = people.map((d, di) => ({
    extId: `${code}${String(di + 1).padStart(3, "0")}`,
    name: d.name,
    icNo: d.icNo,
    petrolEligible: d.petrol,
    months: months.map(({ year, month }, mi) => {
      const rows: ParsedRow[] = [];
      const daysInMonth = new Date(year, month, 0).getDate();
      // ~1.5% month-on-month growth so the trend charts have a shape.
      const avg = d.dailyAvg * (1 + 0.015 * mi);
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day, 10);
        if (date.getDay() === 0) continue; // Sundays off
        const count = Math.max(0, Math.round(avg + (rand() - 0.5) * 24));
        for (let p = 0; p < count; p++) {
          rows.push({
            waybillNumber: `DM${branch || ""}${String(year).slice(2)}${String(month).padStart(2, "0")}${di + 1}${String(rows.length + 1).padStart(5, "0")}`,
            branchName: code,
            deliveryDate: date,
            dispatcherId: `${code}${String(di + 1).padStart(3, "0")}`,
            dispatcherName: d.name,
            billingWeight: randomWeight(rand),
          });
        }
      }
      return { year, month, rows, penalty: pick(0.2, 10, 50, 10), advance: pick(0.15, 100, 300, 50) };
    }),
  }));

  const employees = EMPLOYEES.map((e, ei) => ({
    ...e,
    ...(extra && { name: extra.employees[ei][0], icNo: extra.employees[ei][1] }),
    extId: `${code}E${ei + 1}`,
    months: months.map(({ year, month }) => ({
      year,
      month,
      workingHours: e.hourlyWage ? 180 + Math.round(rand() * 30) : 0,
      penalty: 0,
      advance: pick(0.1, 100, 200, 50),
    })),
  }));

  return { code, months, dispatchers, employees };
}
