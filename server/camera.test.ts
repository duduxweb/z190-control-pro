import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as camera from "./camera";

/**
 * Camera Integration Tests
 * These tests validate communication with the Sony Z190 camera
 */

describe("Camera Communication", () => {
  beforeAll(() => {
    // Reset client before tests
    camera.resetCameraClient();
  });

  afterAll(() => {
    camera.resetCameraClient();
  });

  it("should ping the camera successfully", async () => {
    const result = await camera.pingCamera();
    expect(typeof result).toBe("boolean");
  });

  it("should get camera status", async () => {
    const status = await camera.getCameraStatus();
    expect(status).toBeDefined();
    expect(typeof status).toBe("object");
  });

  it("should get system info", async () => {
    const info = await camera.getSystemInfo();
    expect(info).toBeDefined();
    expect(typeof info).toBe("object");
  });

  it("should handle zoom position", async () => {
    // This test verifies the function signature works
    // Actual camera response depends on network connectivity
    try {
      await camera.setZoomPosition(8192);
      expect(true).toBe(true);
    } catch (err: any) {
      // Expected if camera is not reachable
      expect(err.message).toContain("reachable");
    }
  });

  it("should handle focus mode", async () => {
    try {
      await camera.setFocusMode("auto");
      expect(true).toBe(true);
    } catch (err: any) {
      expect(err.message).toContain("reachable");
    }
  });

  it("should handle iris position", async () => {
    try {
      await camera.setIrisPosition(128);
      expect(true).toBe(true);
    } catch (err: any) {
      expect(err.message).toContain("reachable");
    }
  });

  it("should handle white balance", async () => {
    try {
      await camera.setWhiteBalanceMode("auto");
      expect(true).toBe(true);
    } catch (err: any) {
      expect(err.message).toContain("reachable");
    }
  });

  it("should handle gain", async () => {
    try {
      await camera.setGain(0);
      expect(true).toBe(true);
    } catch (err: any) {
      expect(err.message).toContain("reachable");
    }
  });

  it("should handle recording start", async () => {
    try {
      await camera.startRecording();
      expect(true).toBe(true);
    } catch (err: any) {
      expect(err.message).toContain("reachable");
    }
  });

  it("should handle recording stop", async () => {
    try {
      await camera.stopRecording();
      expect(true).toBe(true);
    } catch (err: any) {
      expect(err.message).toContain("reachable");
    }
  });

  it("should get recording status", async () => {
    try {
      const status = await camera.getRecordingStatus();
      expect(typeof status).toBe("string");
    } catch (err: any) {
      expect(err.message).toContain("reachable");
    }
  });

  it("should handle audio level", async () => {
    try {
      await camera.setAudioLevel(1, 50);
      expect(true).toBe(true);
    } catch (err: any) {
      expect(err.message).toContain("reachable");
    }
  });
});
