import { beforeEach, describe, expect, it, vi } from "vitest";

const getEffectiveAgentId = vi.fn();
const findUnique = vi.fn();

vi.mock("@/lib/impersonation", () => ({ getEffectiveAgentId: () => getEffectiveAgentId() }));
vi.mock("@/lib/prisma", () => ({ prisma: { agent: { findUnique: (a: unknown) => findUnique(a) } } }));

import { getV2Agent } from "./ui-version";

describe("getV2Agent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is null when signed out or not approved", async () => {
    getEffectiveAgentId.mockResolvedValue(null);
    expect(await getV2Agent()).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("is null for a v1 account", async () => {
    getEffectiveAgentId.mockResolvedValue({ agentId: "a1", impersonating: false });
    findUnique.mockResolvedValue({ uiVersion: "V1" });
    expect(await getV2Agent()).toBeNull();
  });

  it("returns the agent for a v2 account", async () => {
    const effective = { agentId: "a2", impersonating: false };
    getEffectiveAgentId.mockResolvedValue(effective);
    findUnique.mockResolvedValue({ uiVersion: "V2", ownerId: null });
    expect(await getV2Agent()).toEqual({ ...effective, member: null });
  });

  it("puts a team member in their owner's account, limited to their branches", async () => {
    getEffectiveAgentId.mockResolvedValue({ agentId: "sup", impersonating: false });
    findUnique.mockResolvedValue({ uiVersion: "V2", ownerId: "owner", teamBranchIds: ["b1"], owner: { uiVersion: "V2", isApproved: true } });
    expect(await getV2Agent()).toEqual({ agentId: "owner", impersonating: false, member: { id: "sup", branchIds: ["b1"] } });
  });

  it("locks a team member out when the owner's account is disabled", async () => {
    getEffectiveAgentId.mockResolvedValue({ agentId: "sup", impersonating: false });
    findUnique.mockResolvedValue({ uiVersion: "V2", ownerId: "owner", teamBranchIds: ["b1"], owner: { uiVersion: "V2", isApproved: false } });
    expect(await getV2Agent()).toBeNull();
  });

  it("checks the impersonated agent's version, not the admin's", async () => {
    getEffectiveAgentId.mockResolvedValue({ agentId: "v2-agent", impersonating: true, impersonatedName: "V" });
    findUnique.mockResolvedValue({ uiVersion: "V2" });
    expect(await getV2Agent()).toMatchObject({ agentId: "v2-agent" });
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "v2-agent" } }));
  });

  it("is null when the agent row is gone", async () => {
    getEffectiveAgentId.mockResolvedValue({ agentId: "deleted", impersonating: false });
    findUnique.mockResolvedValue(null);
    expect(await getV2Agent()).toBeNull();
  });
});
