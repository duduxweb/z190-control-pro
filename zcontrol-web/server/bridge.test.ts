import { describe, expect, it } from "vitest";
import { bridgeManager } from "./bridge";

describe("bridgeManager", () => {
  it("should report bridge as disconnected initially", () => {
    const info = bridgeManager.getBridgeInfo();
    expect(info.connected).toBe(false);
    expect(info.version).toBe("");
    expect(info.uptime).toBe(0);
    expect(info.pendingCommands).toBe(0);
  });

  it("should return default status when no bridge connected", () => {
    const status = bridgeManager.getStatus();
    expect(status.bridgeConnected).toBe(false);
    expect(status.connected).toBe(false);
  });

  it("should reject commands when bridge is not connected", async () => {
    await expect(
      bridgeManager.sendCommand("setZoom", { position: 100 })
    ).rejects.toThrow("Bridge não conectado");
  });

  it("isBridgeConnected should return false when no bridge", () => {
    expect(bridgeManager.isBridgeConnected()).toBe(false);
  });
});
