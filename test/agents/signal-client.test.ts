import { expect } from "chai";

describe("signal-client: session state machine", function () {
  let sc: typeof import("../../agents/lib/signal-client");

  beforeEach(() => {
    delete require.cache[require.resolve("../../agents/lib/signal-client")];
    sc = require("../../agents/lib/signal-client");
  });

  it("getSessionInfo returns inactive when no session exists", () => {
    const info = sc.getSessionInfo();
    expect(info.active).to.be.false;
    expect(info.sessionId).to.be.null;
    expect(info.remaining).to.equal(0);
    expect(info.expiresAt).to.equal(0);
  });

  it("getSignalAgentStatus returns null when agent is offline", async function () {
    this.timeout(10_000);
    // Port 19999 is almost certainly not listening
    process.env.SIGNAL_AGENT_URL = "http://localhost:19999";
    const status = await sc.getSignalAgentStatus();
    expect(status).to.be.null;
    delete process.env.SIGNAL_AGENT_URL;
  });
});
