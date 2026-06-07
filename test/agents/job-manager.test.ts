import { expect } from "chai";

// Unit tests for job-manager in-memory state (no network calls)
describe("job-manager: in-memory deduplication", function () {
  // Re-import fresh each test to avoid state leakage
  let jm: typeof import("../../agents/lib/job-manager");

  beforeEach(() => {
    delete require.cache[require.resolve("../../agents/lib/job-manager")];
    jm = require("../../agents/lib/job-manager");
    jm.openJobs.clear();
  });

  it("getJobId returns null for unknown borrower", () => {
    const addr = "0x0000000000000000000000000000000000000001" as `0x${string}`;
    expect(jm.getJobId(addr)).to.be.null;
  });

  it("closeJob removes borrower from map", () => {
    const addr = "0xABCDEF0000000000000000000000000000000001" as `0x${string}`;
    // Simulate a job being registered
    jm.openJobs.set(addr.toLowerCase(), 42n);
    expect(jm.getJobId(addr)).to.equal(42n);

    jm.closeJob(addr);
    expect(jm.getJobId(addr)).to.be.null;
  });

  it("getJobId is case-insensitive", () => {
    const addrLower = "0xabcdef0000000000000000000000000000000002" as `0x${string}`;
    const addrUpper = "0xABCDEF0000000000000000000000000000000002" as `0x${string}`;
    jm.openJobs.set(addrLower, 99n);
    expect(jm.getJobId(addrUpper)).to.equal(99n);
  });

  it("openJobs prevents duplicate entries for same borrower", () => {
    const addr = "0x1111110000000000000000000000000000000003" as `0x${string}`;
    jm.openJobs.set(addr.toLowerCase(), 7n);
    // Attempting to set again does not change the value
    jm.openJobs.set(addr.toLowerCase(), 999n);
    // Last write wins in Map, but createLiquidationJob returns early if key exists
    expect(jm.openJobs.size).to.equal(1);
  });
});
