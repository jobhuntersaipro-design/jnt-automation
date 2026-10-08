// Synthetic dispatchers for the design review page. Deterministic, no real people or rates.

export type Vehicle = "bike" | "car" | "lorry";
export type Employment = "ft" | "pt";

export interface SampleDispatcher {
  id: string;
  name: string;
  outlet: string;
  vehicle: Vehicle;
  employment: Employment;
  parcels: number;
  basePay: number;
  kpi: number;
  fuel: number;
  scRtn: number;
  penalty: number;
}

const FIRST = ["Ahmad", "Siti", "Tan", "Lim", "Muthu", "Nur", "Wong", "Raj", "Farah", "Lee", "Hafiz", "Chong", "Kumar", "Aina", "Ong"];
const LAST = ["Faiz", "Aminah", "Wei Ming", "Kok Leong", "Raj", "Izzati", "Jia Hui", "Kumar", "Hana", "Chee Keong", "Rahman", "Mei Ling", "Selvam", "Sofea", "Boon Hock"];
const OUTLETS = ["KUL4602", "SGR350", "SGR470", "SGR7553", "SGR7555"];
const VEHICLES: Vehicle[] = ["bike", "bike", "bike", "car", "lorry"];
const PARCEL_RATE: Record<Vehicle, number> = { bike: 1.0, car: 1.2, lorry: 1.5 };
const FUEL_RATE: Record<Vehicle, number> = { bike: 0.15, car: 0.25, lorry: 0.35 };

const round2 = (n: number) => Math.round(n * 100) / 100;

export function sampleDispatchers(count: number): SampleDispatcher[] {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];

  return Array.from({ length: count }, (_, i) => {
    const vehicle = pick(VEHICLES);
    const employment: Employment = rand() < 0.6 ? "ft" : "pt";
    const parcels = Math.round(400 + rand() * 2800);
    return {
      id: `D${String(i + 1).padStart(4, "0")}`,
      name: `${pick(FIRST)} ${pick(LAST)}`,
      outlet: pick(OUTLETS),
      vehicle,
      employment,
      parcels,
      basePay: round2(parcels * PARCEL_RATE[vehicle]),
      kpi: employment === "ft" && parcels > 1400 ? round2((parcels - 1400) * 0.3) : 0,
      fuel: round2(parcels * FUEL_RATE[vehicle]),
      scRtn: round2(Math.floor(rand() * 40) * 0.6),
      penalty: rand() < 0.2 ? round2(10 + rand() * 140) : 0,
    };
  });
}

export const netPay = (d: SampleDispatcher) => round2(d.basePay + d.kpi + d.fuel + d.scRtn - d.penalty);
