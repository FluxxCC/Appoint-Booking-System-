import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/auth/access.server", () => ({ requireOwner: mocks.requireOwner }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  deleteEmptyBranchAction,
  saveAdminBranchMembershipAction,
  saveBranchAction,
  saveBranchServiceAction,
  saveStaffBranchAssignmentAction,
} from "@/features/branches/actions";
import { readOwnerBranches } from "@/features/branches/data.server";
import BranchesPage from "@/app/(admin)/admin/branches/page";
import { BranchManagementPanel } from "@/features/branches/panel";
import type { ManagedBranch } from "@/features/branches/data.server";

function branchForm() {
  const form = new FormData();
  for (const [name, value] of Object.entries({
    branch_id: "",
    expected_updated_at: "",
    name: "Draft Location",
    slug: "draft-location",
    address: "",
    contact_email: "",
    contact_phone: "",
    timezone: "Asia/Manila",
    public_visible: "false",
    booking_enabled: "false",
    is_active: "false",
    approval_mode: "ADMIN_APPROVAL",
    service_origin_latitude: "",
    service_origin_longitude: "",
    home_service_max_radius_km: "",
  })) form.set(name, value);
  return form;
}

function assignmentForm() {
  const form = new FormData();
  form.set("branch_id", "00000000-0000-4000-8000-000000000001");
  form.set("target_id", "00000000-0000-4000-8000-000000000002");
  form.set("active", "true");
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOwner.mockResolvedValue({ supabase: { rpc: mocks.rpc, from: mocks.from } });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.from.mockImplementation(() => queryResult({ data: [], error: null }));
});

function queryResult(result: { data: unknown; error: unknown }) {
  const promise = Promise.resolve(result);
  const query = {
    select: () => query,
    order: () => query,
    eq: () => query,
    maybeSingle: () => promise,
    then: (resolve: (value: typeof result) => unknown, reject?: (reason: unknown) => unknown) => promise.then(resolve, reject),
  };
  return query;
}

describe("OWNER branch management entry points", () => {
  it("keeps branch management focused on business locations", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const branch = {
      id, name: "Main branch", slug: "main-branch", address: "123 Business Street", contact_email: "owner@example.test",
      contact_phone: "+63 2 555 0100", timezone: "Asia/Manila", is_default: true, is_active: true,
      booking_enabled: true, public_visible: true, service_origin_latitude: null, service_origin_longitude: null,
      home_service_max_radius_km: null, home_service_enabled: true, created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z", approvalSettings: undefined,
    } as unknown as ManagedBranch;
    const draft = {
      ...branch, id: "00000000-0000-4000-8000-000000000003", name: "Staged location", slug: "staged-location", is_default: false,
      is_active: false, booking_enabled: false, public_visible: false,
    } as ManagedBranch;
    const html = renderToStaticMarkup(BranchManagementPanel({ branches: [branch, draft] }));

    expect(html).toContain("Business locations");
    expect(html).toContain("Business location address");
    expect(html).toContain("Customers provide a separate destination for every Home Service booking");
    expect(html).toContain("Services, staff assignments and administrator access are managed from their own menus.");
    expect(html).not.toContain("Branch rollout");
    expect(html).not.toContain("Services at this branch");
    expect(html).not.toContain("Staff assignments");
    expect(html).not.toContain("Administrator access</h2>");
    expect(html).not.toContain("business map pin");
    expect(html).toContain("Delete empty draft");
    expect(html).toContain("Audit records are retained.");
    expect(html.match(/Delete empty draft/g)).toHaveLength(1);
  });

  it("guards the page, data loader and every mutation before database access", async () => {
    mocks.requireOwner.mockRejectedValue(new Error("REDIRECT:/auth/access-denied"));

    await expect(BranchesPage()).rejects.toThrow("REDIRECT:/auth/access-denied");
    await expect(readOwnerBranches()).rejects.toThrow("REDIRECT:/auth/access-denied");
    for (const action of [saveBranchAction, deleteEmptyBranchAction, saveAdminBranchMembershipAction, saveStaffBranchAssignmentAction, saveBranchServiceAction]) {
      await expect(action({}, assignmentForm())).rejects.toThrow("REDIRECT:/auth/access-denied");
    }

    expect(mocks.requireOwner).toHaveBeenCalledTimes(7);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("saves a validated draft through the authenticated session client", async () => {
    const result = await saveBranchAction({}, branchForm());

    expect(result).toEqual({ success: "Draft branch created. It is not active or bookable yet." });
    expect(mocks.requireOwner).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("owner_save_branch", {
      p_branch: null,
      p_expected_updated_at: null,
      p_values: expect.objectContaining({
        name: "Draft Location",
        slug: "draft-location",
        timezone: "Asia/Manila",
        public_visible: false,
        booking_enabled: false,
        is_active: false,
      }),
    });
  });

  it("deletes a branch through the owner-only draft deletion RPC", async () => {
    const form = new FormData();
    form.set("branch_id", "00000000-0000-4000-8000-000000000003");

    await expect(deleteEmptyBranchAction({}, form)).resolves.toEqual({
      success: "Empty draft branch deleted. Its audit history has been retained.",
    });
    expect(mocks.requireOwner).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("owner_delete_empty_branch", {
      p_branch: "00000000-0000-4000-8000-000000000003",
    });
  });

  it("does not send an invalid delete request to the database", async () => {
    const form = new FormData();
    form.set("branch_id", "not-a-uuid");

    await expect(deleteEmptyBranchAction({}, form)).resolves.toEqual({ error: "Choose a branch." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("explains when branch history prevents deletion without leaking database details", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "55000", message: "private foreign key name" } });
    const form = new FormData();
    form.set("branch_id", "00000000-0000-4000-8000-000000000003");

    const result = await deleteEmptyBranchAction({}, form);

    expect(result).toEqual({ error: "Only an unpublished, inactive draft with no bookings or setup history can be deleted. Its records must stay attached to the branch." });
    expect(JSON.stringify(result)).not.toContain("private foreign key name");
  });

  it("reports clearly when the project does not have the branch deletion RPC yet", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "function missing" } });
    const form = new FormData();
    form.set("branch_id", "00000000-0000-4000-8000-000000000003");

    await expect(deleteEmptyBranchAction({}, form)).resolves.toEqual({
      error: "Branch deletion is unavailable until the database migration has been applied.",
    });
  });

  it("does not return internal database details to an action caller", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "sensitive database detail" } });

    const result = await saveBranchAction({}, branchForm());

    expect(result).toEqual({ error: "Branch details could not be saved. Check the fields and try again." });
    expect(JSON.stringify(result)).not.toContain("sensitive database detail");
  });

  it("keeps branch-read failures generic", async () => {
    mocks.from.mockImplementation((table: string) => queryResult({
      data: table === "business_settings" ? null : [],
      error: table === "branches" ? { message: "sensitive database detail" } : null,
    }));
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    await expect(readOwnerBranches()).rejects.toThrow("Branches could not be loaded. Refresh the page and try again.");
    await expect(readOwnerBranches()).rejects.not.toThrow("sensitive database detail");
  });
});
