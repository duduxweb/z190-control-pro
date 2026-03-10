import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as camera from "./camera";
import { getDb } from "./db";
import { cameraPresets } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

// ─── Camera Control Router ───────────────────────────────────────

const cameraRouter = router({
  ping: publicProcedure.query(async () => {
    const reachable = await camera.pingCamera();
    return { reachable, timestamp: Date.now() };
  }),
  status: publicProcedure.query(async () => {
    const [status, systemInfo, lensStatus] = await Promise.allSettled([
      camera.getCameraStatus(),
      camera.getSystemInfo(),
      camera.getLensStatus(),
    ]);
    return {
      camera: status.status === "fulfilled" ? status.value : { connected: false },
      system: systemInfo.status === "fulfilled" ? systemInfo.value : {},
      lens: lensStatus.status === "fulfilled" ? lensStatus.value : {},
      timestamp: Date.now(),
    };
  }),
});

// ─── Lens Control Router ─────────────────────────────────────────

const lensRouter = router({
  setZoom: publicProcedure
    .input(z.object({ position: z.number().min(0).max(16384) }))
    .mutation(async ({ input }) => {
      await camera.setZoomPosition(input.position);
      return { success: true };
    }),
  zoomContinuous: publicProcedure
    .input(z.object({ speed: z.number().min(-7).max(7) }))
    .mutation(async ({ input }) => {
      await camera.setZoomDirect(input.speed);
      return { success: true };
    }),
  setFocusMode: publicProcedure
    .input(z.object({ mode: z.enum(["auto", "manual"]) }))
    .mutation(async ({ input }) => {
      await camera.setFocusMode(input.mode);
      return { success: true };
    }),
  setFocusPosition: publicProcedure
    .input(z.object({ position: z.number().min(0).max(16384) }))
    .mutation(async ({ input }) => {
      await camera.setFocusPosition(input.position);
      return { success: true };
    }),
  focusContinuous: publicProcedure
    .input(z.object({ speed: z.number().min(-7).max(7) }))
    .mutation(async ({ input }) => {
      await camera.setFocusContinuous(input.speed);
      return { success: true };
    }),
  onePushFocus: publicProcedure.mutation(async () => {
    await camera.triggerOnePushFocus();
    return { success: true };
  }),
  setIris: publicProcedure
    .input(z.object({ position: z.number().min(0).max(255) }))
    .mutation(async ({ input }) => {
      await camera.setIrisPosition(input.position);
      return { success: true };
    }),
});

// ─── Image Control Router ────────────────────────────────────────

const imageRouter = router({
  setWhiteBalance: publicProcedure
    .input(z.object({ mode: z.string() }))
    .mutation(async ({ input }) => {
      await camera.setWhiteBalanceMode(input.mode);
      return { success: true };
    }),
  setGain: publicProcedure
    .input(z.object({ value: z.number().min(-6).max(33) }))
    .mutation(async ({ input }) => {
      await camera.setGain(input.value);
      return { success: true };
    }),
  setShutter: publicProcedure
    .input(z.object({ value: z.string() }))
    .mutation(async ({ input }) => {
      await camera.setShutterSpeed(input.value);
      return { success: true };
    }),
  setNDFilter: publicProcedure
    .input(z.object({ position: z.number().min(0).max(4) }))
    .mutation(async ({ input }) => {
      await camera.setNDFilter(input.position);
      return { success: true };
    }),
  setColorBars: publicProcedure
    .input(z.object({ enabled: z.boolean(), type: z.string().optional() }))
    .mutation(async ({ input }) => {
      await camera.setColorBars(input.enabled, input.type);
      return { success: true };
    }),
});

// ─── Recording Control Router ────────────────────────────────────

const recordingRouter = router({
  start: publicProcedure.mutation(async () => {
    await camera.startRecording();
    return { success: true, timestamp: Date.now() };
  }),
  stop: publicProcedure.mutation(async () => {
    await camera.stopRecording();
    return { success: true, timestamp: Date.now() };
  }),
  status: publicProcedure.query(async () => {
    try {
      const text = await camera.getRecordingStatus();
      return { recording: text.includes("recording"), status: text, timestamp: Date.now() };
    } catch {
      return { recording: false, status: "unknown", timestamp: Date.now() };
    }
  }),
});

// ─── Audio Control Router ────────────────────────────────────────

const audioRouter = router({
  setLevel: publicProcedure
    .input(z.object({ channel: z.number().min(1).max(4), level: z.number().min(0).max(100) }))
    .mutation(async ({ input }) => {
      await camera.setAudioLevel(input.channel, input.level);
      return { success: true };
    }),
  setInputSource: publicProcedure
    .input(z.object({ channel: z.number().min(1).max(4), source: z.string() }))
    .mutation(async ({ input }) => {
      await camera.setAudioInputSelect(input.channel, input.source);
      return { success: true };
    }),
});

// ─── Presets Router ──────────────────────────────────────────────

const presetsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(cameraPresets).where(eq(cameraPresets.userId, ctx.user.id)).orderBy(cameraPresets.name);
  }),
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(128),
      description: z.string().optional(),
      category: z.string().optional(),
      settings: z.record(z.string(), z.unknown()),
    }))
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
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(128).optional(),
      description: z.string().optional(),
      category: z.string().optional(),
      settings: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const updateData: Record<string, unknown> = {};
      if (input.name) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.category) updateData.category = input.category;
      if (input.settings) updateData.settings = input.settings;
      await db.update(cameraPresets).set(updateData)
        .where(and(eq(cameraPresets.id, input.id), eq(cameraPresets.userId, ctx.user.id)));
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.delete(cameraPresets)
        .where(and(eq(cameraPresets.id, input.id), eq(cameraPresets.userId, ctx.user.id)));
      return { success: true };
    }),
});

// ─── Main App Router ─────────────────────────────────────────────

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
  camera: cameraRouter,
  lens: lensRouter,
  image: imageRouter,
  recording: recordingRouter,
  audio: audioRouter,
  presets: presetsRouter,
});

export type AppRouter = typeof appRouter;
