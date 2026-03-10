/**
 * Sony Z190 Camera Communication Module
 * Handles JSON-RPC communication with the camera via HTTP
 */
import axios, { type AxiosInstance } from "axios";
import { ENV } from "./_core/env";

let cameraClient: AxiosInstance | null = null;

function getClient(): AxiosInstance {
  if (!cameraClient) {
    const baseURL = `http://${ENV.cameraIp}`;
    const auth = Buffer.from(`${ENV.cameraUser}:${ENV.cameraPassword}`).toString("base64");
    cameraClient = axios.create({
      baseURL,
      timeout: 5000,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
    });
  }
  return cameraClient;
}

/** Reset client (e.g. after config change) */
export function resetCameraClient() {
  cameraClient = null;
}

// ─── JSON-RPC helpers ────────────────────────────────────────────

let rpcId = 1;

interface JsonRpcRequest {
  method: string;
  params?: Record<string, unknown>;
  version?: string;
}

interface JsonRpcResponse {
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

/**
 * Send a JSON-RPC request to the camera
 */
export async function sendJsonRpc(
  endpoint: string,
  method: string,
  params: Record<string, unknown> = {},
  version = "1.0"
): Promise<unknown> {
  const client = getClient();
  const id = rpcId++;
  const body = { method, params: [params], id, version };

  try {
    const { data } = await client.post<JsonRpcResponse>(endpoint, body);
    if (data.error) {
      throw new Error(`Camera RPC error ${data.error.code}: ${data.error.message}`);
    }
    return data.result;
  } catch (err: any) {
    if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT") {
      throw new Error("Camera is not reachable. Check IP and network connection.");
    }
    throw err;
  }
}

/**
 * Send a CGI command to the camera (GET-based)
 */
export async function sendCgiCommand(path: string, params: Record<string, string> = {}): Promise<string> {
  const client = getClient();
  const queryString = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const url = queryString ? `${path}?${queryString}` : path;

  const { data } = await client.get(url, { responseType: "text" });
  return data;
}

// ─── Camera Property Helpers ─────────────────────────────────────

const CAMERA_ENDPOINT = "/sony/camera";

/** Get a camera property value */
export async function getProperty(property: string): Promise<unknown> {
  return sendJsonRpc(CAMERA_ENDPOINT, "getMethodTypes", { property });
}

/** Set a camera property value using the Sony CGI interface */
export async function setCgiProperty(group: string, param: string, value: string): Promise<string> {
  return sendCgiCommand("/command/inquiry.cgi", { inq: "camera" });
}

// ─── Lens Control ────────────────────────────────────────────────

export async function setZoomPosition(position: number): Promise<unknown> {
  return sendCgiCommand("/command/ptzf.cgi", { Zoom: String(position) });
}

export async function setZoomDirect(speed: number): Promise<unknown> {
  // speed: -7 (wide) to +7 (tele), 0 = stop
  return sendCgiCommand("/command/ptzf.cgi", { ZoomContinuous: String(speed) });
}

export async function setFocusMode(mode: "auto" | "manual"): Promise<unknown> {
  return sendCgiCommand("/command/ptzf.cgi", { FocusMode: mode === "auto" ? "auto" : "manual" });
}

export async function setFocusPosition(position: number): Promise<unknown> {
  return sendCgiCommand("/command/ptzf.cgi", { Focus: String(position) });
}

export async function setFocusContinuous(speed: number): Promise<unknown> {
  return sendCgiCommand("/command/ptzf.cgi", { FocusContinuous: String(speed) });
}

export async function triggerOnePushFocus(): Promise<unknown> {
  return sendCgiCommand("/command/ptzf.cgi", { OnePushFocus: "trigger" });
}

export async function setIrisPosition(position: number): Promise<unknown> {
  return sendCgiCommand("/command/imaging.cgi", { IrisPosition: String(position) });
}

// ─── Image Control ───────────────────────────────────────────────

export async function setWhiteBalanceMode(mode: string): Promise<unknown> {
  return sendCgiCommand("/command/imaging.cgi", { WhiteBalanceMode: mode });
}

export async function setGain(value: number): Promise<unknown> {
  return sendCgiCommand("/command/imaging.cgi", { GainValue: String(value) });
}

export async function setShutterSpeed(value: string): Promise<unknown> {
  return sendCgiCommand("/command/imaging.cgi", { ShutterSpeed: value });
}

export async function setNDFilter(position: number): Promise<unknown> {
  return sendCgiCommand("/command/imaging.cgi", { NDFilterPosition: String(position) });
}

export async function setColorBars(enabled: boolean, type?: string): Promise<unknown> {
  const params: Record<string, string> = { ColorBar: enabled ? "on" : "off" };
  if (type) params.ColorBarType = type;
  return sendCgiCommand("/command/imaging.cgi", params);
}

// ─── Recording Control ───────────────────────────────────────────

export async function startRecording(): Promise<unknown> {
  return sendCgiCommand("/command/rec.cgi", { Record: "start" });
}

export async function stopRecording(): Promise<unknown> {
  return sendCgiCommand("/command/rec.cgi", { Record: "stop" });
}

export async function getRecordingStatus(): Promise<string> {
  return sendCgiCommand("/command/inquiry.cgi", { inq: "recstatus" });
}

// ─── Audio Control ───────────────────────────────────────────────

export async function setAudioLevel(channel: number, level: number): Promise<unknown> {
  return sendCgiCommand("/command/audio.cgi", {
    [`AudioInputLevel${channel}`]: String(level),
  });
}

export async function setAudioInputSelect(channel: number, source: string): Promise<unknown> {
  return sendCgiCommand("/command/audio.cgi", {
    [`AudioInputSelect${channel}`]: source,
  });
}

// ─── Status / Inquiry ────────────────────────────────────────────

export async function getCameraStatus(): Promise<Record<string, unknown>> {
  try {
    const statusText = await sendCgiCommand("/command/inquiry.cgi", { inq: "camera" });
    return parseCgiResponse(statusText);
  } catch {
    return { connected: false, error: "Camera not reachable" };
  }
}

export async function pingCamera(): Promise<boolean> {
  try {
    const client = getClient();
    await client.get("/", { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

export async function getSystemInfo(): Promise<Record<string, unknown>> {
  try {
    const infoText = await sendCgiCommand("/command/inquiry.cgi", { inq: "system" });
    return parseCgiResponse(infoText);
  } catch {
    return { connected: false };
  }
}

export async function getLensStatus(): Promise<Record<string, unknown>> {
  try {
    const text = await sendCgiCommand("/command/inquiry.cgi", { inq: "lens" });
    return parseCgiResponse(text);
  } catch {
    return {};
  }
}

// ─── Utility ─────────────────────────────────────────────────────

/** Parse CGI key=value response into an object */
function parseCgiResponse(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!text) return result;
  const lines = text.split("\n");
  for (const line of lines) {
    const eqIdx = line.indexOf("=");
    if (eqIdx > 0) {
      const key = line.substring(0, eqIdx).trim();
      const value = line.substring(eqIdx + 1).trim();
      result[key] = value;
    }
  }
  result.connected = true;
  return result;
}
