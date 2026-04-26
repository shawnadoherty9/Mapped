import { describe, it, expect } from "vitest";
import { resolveNavGroups } from "./AppLayout";

function labels(groups: ReturnType<typeof resolveNavGroups>) {
  return groups.flatMap((g) => g.links.map((l) => l.label));
}

describe("resolveNavGroups (sidebar role-based nav)", () => {
  it("policymaker DB role shows Policymaker Dashboard, Risk Heat Map, and Country Configuration", () => {
    const groups = resolveNavGroups({ email: "minister@gov.example", role: "policymaker" });
    const ls = labels(groups);
    expect(ls).toContain("Policymaker Dashboard");
    expect(ls).toContain("Risk Heat Map");
    expect(ls).toContain("Country Configuration");
    // and must not bleed in job-seeker tabs
    expect(ls).not.toContain("Profile Input");
    expect(ls).not.toContain("Skills Signal");
    expect(ls).not.toContain("Opportunity Match");
  });

  it("individual DB role shows job-seeker tabs, not policymaker tabs", () => {
    const ls = labels(resolveNavGroups({ email: "user@example.com", role: "individual" }));
    expect(ls).toEqual(
      expect.arrayContaining(["Profile Input", "Skills Signal", "Opportunity Match", "Country Configuration"])
    );
    expect(ls).not.toContain("Policymaker Dashboard");
    expect(ls).not.toContain("Risk Heat Map");
  });

  it("policymaker demo persona email overrides any role and shows policymaker nav", () => {
    const ls = labels(resolveNavGroups({ email: "demo+policy-ke@unmapped.app", role: "individual" }));
    expect(ls).toContain("Policymaker Dashboard");
    expect(ls).toContain("Risk Heat Map");
    expect(ls).toContain("Country Configuration");
    expect(ls).not.toContain("Profile Input");
  });

  it("job-seeker demo persona email shows job-seeker nav even if role is policymaker", () => {
    const ls = labels(resolveNavGroups({ email: "demo+aisha@unmapped.app", role: "policymaker" }));
    expect(ls).toContain("Profile Input");
    expect(ls).toContain("Skills Signal");
    expect(ls).not.toContain("Policymaker Dashboard");
    expect(ls).not.toContain("Risk Heat Map");
  });

  it("missing email and missing role falls back to job-seeker nav", () => {
    const ls = labels(resolveNavGroups({ email: null, role: null }));
    expect(ls).toContain("Profile Input");
    expect(ls).not.toContain("Policymaker Dashboard");
  });
});
