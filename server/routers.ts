import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { cameraPresets } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { ENV } from "./_core/env";
import { bridgeManager } from "./bridge";

// ─── Bridge Router (status e info do bridge) ────────────────────

const bridgeRouter = router({
  status: publicProcedure.query(() => {
    return bridgeManager.getStatus();
  }),
  info: publicProcedure.query(() => {
    return bridgeManager.getBridgeInfo();
  }),
  token: publicProcedure.query(() => {
    // Retorna o token para configurar o bridge local
    const token = process.env.BRIDGE_TOKEN || ENV.cookieSecret || "z190-bridge-default";
    return { token };
  }),
});

// ─── Camera Control Router (via Bridge) ─────────────────────────

const cameraRouter = router({
  ping: publicProcedure.query(async () => {
    const status = bridgeManager.getStatus();
    return {
      reachable: status.bridgeConnected && status.connected,
      bridgeConnected: status.bridgeConnected,
      timestamp: Date.now(),
    };
  }),
  status: publicProcedure.query(async () => {
    const status = bridgeManager.getStatus();
    return {
      ...status,
      timestamp: Date.now(),
    };
  }),
  // Comando genérico para enviar qualquer ação ao bridge
  command: publicProcedure
    .input(
      z.object({
        action: z.string().min(1),
        params: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await bridgeManager.sendCommand(
        input.action,
        input.params as Record<string, any>
      );
      return { success: true, data: result };
    }),
});

// ─── Lens Control Router (via Bridge) ───────────────────────────

const lensRouter = router({
  setZoom: publicProcedure
    .input(z.object({ position: z.number().min(0).max(16384) }))
    .mutation(async ({ input }) => {
      await bridgeManager.sendCommand("setZoom", { position: input.position });
      return { success: true };
    }),
  zoomContinuous: publicProcedure
    .input(z.object({ speed: z.number().min(-7).max(7) }))
    .mutation(async ({ input }) => {
      await bridgeManager.sendCommand("zoomContinuous", {
        speed: input.speed,
      });
      return { success: true };
    }),
  setFocusMode: publicProcedure
    .input(z.object({ mode: z.enum(["auto", "manual"]) }))
    .mutation(async ({ input }) => {
      await bridgeManager.sendCommand("setFocusMode", { mode: input.mode });
      return { success: true };
    }),
  setFocusPosition: publicProcedure
    .input(z.object({ position: z.number().min(0).max(16384) }))
    .mutation(async ({ input }) => {
      await bridgeManager.sendCommand("setFocusPosition", {
        position: input.position,
      });
      return { success: true };
    }),
  focusContinuous: publicProcedure
    .input(z.object({ speed: z.number().min(-7).max(7) }))
    .mutation(async ({ input }) => {
      await bridgeManager.sendCommand("focusContinuous", {
        speed: input.speed,
      });
      return { success: true };
    }),
  onePushFocus: publicProcedure.mutation(async () => {
    await bridgeManager.sendCommand("onePushFocus");
    return { success: true };
  }),
  setIris: publicProcedure
    .input(z.object({ position: z.number().min(0).max(255) }))
    .mutation(async ({ input }) => {
      await bridgeManager.sendCommand("setIris", {
        position: input.position,
      });
      return { success: true };
    }),
});

// ─── Image Control Router (via Bridge) ──────────────────────────

const imageRouter = router({
  setWhiteBalance: publicProcedure
    .input(z.object({ mode: z.string() }))
    .mutation(async ({ input }) => {
      await bridgeManager.sendCommand("setWhiteBalance", { mode: input.mode });
      return { success: true };
    }),
  setGain: publicProcedure
    .input(z.object({ value: z.number().min(-6).max(33) }))
    .mutation(async ({ input }) => {
      await bridgeManager.sendCommand("setGain", { value: input.value });
      return { success: true };
    }),
  setShutter: publicProcedure
    .input(z.object({ value: z.string() }))
    .mutation(async ({ input }) => {
      await bridgeManager.sendCommand("setShutter", { value: input.value });
      return { success: true };
    }),
  setNDFilter: publicProcedure
    .input(z.object({ position: z.number().min(0).max(4) }))
    .mutation(async ({ input }) => {
      await bridgeManager.sendCommand("setNDFilter", {
        position: input.position,
      });
      return { success: true };
    }),
  setColorBars: publicProcedure
    .input(z.object({ enabled: z.boolean(), type: z.string().optional() }))
    .mutation(async ({ input }) => {
      await bridgeManager.sendCommand("setColorBars", {
        enabled: input.enabled,
        type: input.type,
      });
      return { success: true };
    }),
});

// ─── Recording Control Router (via Bridge) ──────────────────────

const recordingRouter = router({
  start: publicProcedure.mutation(async () => {
    await bridgeManager.sendCommand("startRecording");
    return { success: true, timestamp: Date.now() };
  }),
  stop: publicProcedure.mutation(async () => {
    await bridgeManager.sendCommand("stopRecording");
    return { success: true, timestamp: Date.now() };
  }),
  status: publicProcedure.query(async () => {
    const status = bridgeManager.getStatus();
    return {
      recording: status.recording?.active ?? false,
      timecode: status.recording?.timecode ?? "",
      status: status.recording?.active ? "recording" : "stopped",
      timestamp: Date.now(),
    };
  }),
});

// ─── Audio Control Router (via Bridge) ──────────────────────────

const audioRouter = router({
  setLevel: publicProcedure
    .input(
      z.object({
        channel: z.number().min(1).max(4),
        level: z.number().min(0).max(100),
      })
    )
    .mutation(async ({ input }) => {
      await bridgeManager.sendCommand("setAudioLevel", {
        channel: input.channel,
        level: input.level,
      });
      return { success: true };
    }),
  setInputSource: publicProcedure
    .input(
      z.object({
        channel: z.number().min(1).max(4),
        source: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      await bridgeManager.sendCommand("setAudioInputSource", {
        channel: input.channel,
        source: input.source,
      });
      return { success: true };
    }),
});

// ─── Presets Router ─────────────────────────────────────────────

const presetsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(cameraPresets)
      .where(eq(cameraPresets.userId, ctx.user.id))
      .orderBy(cameraPresets.name);
  }),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128),
        description: z.string().optional(),
        category: z.string().optional(),
        settings: z.record(z.string(), z.unknown()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const result = await db.insert(cameraPresets).values({
        userId: ctx.user.id,
        name: input.name,
        description: input.description ?? null,
        category: input.category ?? "general",
        settings: input.settings,
      });
      return { success: true, id: result[0].insertId };
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(128).optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        settings: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const updateData: Record<string, unknown> = {};
      if (input.name) updateData.name = input.name;
      if (input.description !== undefined)
        updateData.description = input.description;
      if (input.category) updateData.category = input.category;
      if (input.settings) updateData.settings = input.settings;
      await db
        .update(cameraPresets)
        .set(updateData)
        .where(
          and(
            eq(cameraPresets.id, input.id),
            eq(cameraPresets.userId, ctx.user.id)
          )
        );
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db
        .delete(cameraPresets)
        .where(
          and(
            eq(cameraPresets.id, input.id),
            eq(cameraPresets.userId, ctx.user.id)
          )
        );
      return { success: true };
    }),
  // Aplicar preset: envia todas as configurações para a câmera via bridge
  applyPreset: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const presets = await db
        .select()
        .from(cameraPresets)
        .where(
          and(
            eq(cameraPresets.id, input.id),
            eq(cameraPresets.userId, ctx.user.id)
          )
        )
        .limit(1);
      if (!presets.length) throw new Error("Preset not found");
      const settings = presets[0].settings as Record<string, any>;
      await bridgeManager.sendCommand("applyPreset", { settings });
      return { success: true };
    }),
});

// ─── Main App Router ────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  bridge: bridgeRouter,
  camera: cameraRouter,
  lens: lensRouter,
  image: imageRouter,
  recording: recordingRouter,
  audio: audioRouter,
  presets: presetsRouter,
});

export type AppRouter = typeof appRouter;
