import { describe, it, expect } from "vitest";
import { selectAvatarTarget } from "../avatar-target";

describe("selectAvatarTarget", () => {
  it("returns the employee avatar API when dispatcherId is null", () => {
    const result = selectAvatarTarget({ employeeId: "emp_abc", dispatcherId: null });
    expect(result.apiBasePath).toBe("/api/employees/emp_abc/avatar");
    expect(result.subjectId).toBe("emp_abc");
  });

  it("returns the dispatcher avatar API when dispatcherId is set", () => {
    const result = selectAvatarTarget({ employeeId: "emp_abc", dispatcherId: "disp_xyz" });
    expect(result.apiBasePath).toBe("/api/staff/disp_xyz/avatar");
    expect(result.subjectId).toBe("disp_xyz");
  });

  it("treats an empty-string dispatcherId as null (defensive)", () => {
    const result = selectAvatarTarget({ employeeId: "emp_abc", dispatcherId: "" });
    expect(result.apiBasePath).toBe("/api/employees/emp_abc/avatar");
    expect(result.subjectId).toBe("emp_abc");
  });

  it("is idempotent — same input always yields the same target", () => {
    const a = selectAvatarTarget({ employeeId: "e1", dispatcherId: "d1" });
    const b = selectAvatarTarget({ employeeId: "e1", dispatcherId: "d1" });
    expect(a).toEqual(b);
  });
});
