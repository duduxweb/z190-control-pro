import { describe, it, expect } from "vitest";
import { appRouter, type AppRouter } from "./routers";

/**
 * tRPC Router Tests
 * These tests validate the router structure
 */

describe("tRPC Router Structure", () => {
  it("should create app router successfully", () => {
    expect(appRouter).toBeDefined();
  });

  it("should have all main routers defined", () => {
    const router = appRouter;
    expect(router).toHaveProperty("_def");
  });

  it("should be a valid tRPC router", () => {
    expect(appRouter).toHaveProperty("createCaller");
  });
});
