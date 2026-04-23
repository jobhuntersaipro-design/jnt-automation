"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { EmployeeDrawer } from "@/components/staff/employee-drawer";

interface AddEmployeeButtonProps {
  branchCode: string;
  branchCodes: string[];
}

/**
 * Branch-detail CTA that opens the shared EmployeeDrawer pre-filled with the
 * current branch. Saved via POST /api/employees, then router.refresh() so the
 * server-rendered branch page picks up the new row.
 */
export function AddEmployeeButton({ branchCode, branchCodes }: AddEmployeeButtonProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.82rem] font-medium text-white bg-brand rounded-[0.375rem] hover:bg-brand/90 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand/40 focus:ring-offset-2"
      >
        <UserPlus size={14} />
        Add employee
      </button>

      {open && (
        <EmployeeDrawer
          employee={null}
          branchCodes={branchCodes}
          initialBranchCode={branchCode}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            toast.success("Employee added");
            router.refresh();
          }}
        />
      )}
    </>
  );
}
