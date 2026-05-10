import { prisma } from "@/lib/prisma";
import type { EmployeeType, Gender, StoreKeeperSubtype } from "@/generated/prisma/client";
import { maskIc } from "./staff";

export type StaffEmployee = {
  id: string;
  extId: string;
  name: string;
  icNo: string;
  rawIcNo: string;
  gender: Gender;
  avatarUrl: string | null;
  type: EmployeeType;
  storeKeeperSubtype: StoreKeeperSubtype | null;
  adminSubtype: StoreKeeperSubtype | null;
  branchCode: string | null;
  basicPay: number | null;
  hourlyWage: number | null;
  petrolAllowance: number;
  kpiAllowance: number;
  otAllowance: number;
  otherAllowance: number;
  epfNo: string | null;
  socsoNo: string | null;
  incomeTaxNo: string | null;
  dispatcherId: string | null;
  dispatcherExtId: string | null;
  dispatcherBranch: string | null;
  /** Avatar of the linked dispatcher — takes precedence over `avatarUrl` when set. */
  dispatcherAvatarUrl: string | null;
  isComplete: boolean;
  isActive: boolean;
};

export async function getEmployees(
  agentId: string,
  filters: {
    type?: EmployeeType;
    search?: string;
    /**
     * Filter by subtype. Matches rows where either `storeKeeperSubtype` OR
     * `adminSubtype` equals the supplied value — so picking "Temporary"
     * surfaces both Temp SKs and Temp Admins. Does NOT auto-narrow type;
     * pair with the `type` filter explicitly when needed.
     */
    subtype?: StoreKeeperSubtype;
  },
): Promise<StaffEmployee[]> {
  const { type, search, subtype } = filters;

  const employees = await prisma.employee.findMany({
    where: {
      agentId,
      ...(type && { type }),
      ...(subtype && {
        OR: [{ storeKeeperSubtype: subtype }, { adminSubtype: subtype }],
      }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { icNo: { contains: search, mode: "insensitive" as const } },
          { extId: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    },
    include: {
      branch: { select: { code: true } },
      dispatcher: {
        select: { extId: true, avatarUrl: true, branch: { select: { code: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  return employees.map((e) => ({
    id: e.id,
    extId: e.extId ?? "",
    name: e.name,
    icNo: e.icNo ?? "",
    rawIcNo: e.icNo ?? "",
    gender: e.gender,
    avatarUrl: e.avatarUrl,
    type: e.type,
    storeKeeperSubtype: e.storeKeeperSubtype,
    adminSubtype: e.adminSubtype,
    branchCode: e.branch?.code ?? null,
    basicPay: e.basicPay,
    hourlyWage: e.hourlyWage,
    petrolAllowance: e.petrolAllowance,
    kpiAllowance: e.kpiAllowance,
    otAllowance: e.otAllowance,
    otherAllowance: e.otherAllowance,
    epfNo: e.epfNo,
    socsoNo: e.socsoNo,
    incomeTaxNo: e.incomeTaxNo,
    dispatcherId: e.dispatcherId,
    dispatcherExtId: e.dispatcher?.extId ?? null,
    dispatcherBranch: e.dispatcher?.branch?.code ?? null,
    dispatcherAvatarUrl: e.dispatcher?.avatarUrl ?? null,
    isComplete: !!e.icNo,
    isActive: e.isActive,
  }));
}
