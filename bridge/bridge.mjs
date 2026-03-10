/**
 * Z190 Bridge Local
 *
 * Este script roda na rede local da câmera e funciona como ponte entre
 * o painel web na nuvem e a câmera Sony PXW-Z190.
 *
 * Fluxo:
 * 1. Conecta-se ao servidor WebSocket do painel (nuvem)
 * 2. Autentica com token
 * 3. Faz polling periódico do status da câmera via HTTP/CGI
 * 4. Envia atualizações de status para o painel
 * 5. Recebe comandos do painel e executa na câmera
 *
 * Uso:
 *   node bridge.mjs
 *
 * Variáveis de ambiente (.env):
 *   CAMERA_IP=192.168.100.41
 *   CAMERA_USER=admin
 *   CAMERA_PASSWORD=SuaSenha
 *   CAMERA_PORT=80
 *   BRIDGE_SERVER_URL=wss://seudominio.manus.space/ws/bridge
 *   BRIDGE_TOKEN=seu-token-aqui
 *   STATUS_INTERVAL=2000
 */

import { config } from "dotenv";
import WebSocket from "ws";
import axios from "axios";

config(); // Carrega .env

// ─── Configuração ───────────────────────────────────────────────

const CAMERA_IP = process.env.CAMERA_IP || "192.168.100.41";
const CAMERA_USER = process.env.CAMERA_USER || "admin";
const CAMERA_PASSWORD = process.env.CAMERA_PASSWORD || "";
const CAMERA_PORT = parseInt(process.env.CAMERA_PORT || "80");
const BRIDGE_SERVER_URL =
  process.env.BRIDGE_SERVER_URL || "ws://localhost:3000/ws/bridge";
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || "";
const STATUS_INTERVAL = parseInt(process.env.STATUS_INTERVAL || "2000");
const BRIDGE_VERSION = "1.0.0";

const CAMERA_BASE = `http://${CAMERA_IP}:${CAMERA_PORT}`;
const AUTH_HEADER = `Basic ${Buffer.from(`${CAMERA_USER}:${CAMERA_PASSWORD}`).toString("base64")}`;

// ─── Logging ────────────────────────────────────────────────────

function log(level, msg, data) {
  const ts = new Date().toISOString();
  const prefix = { info: "ℹ", warn: "⚠", error: "✖", ok: "✔" }[level] || "•";
  console.log(`[${ts}] ${prefix} ${msg}`, data !== undefined ? data : "");
}

// ─── HTTP Client para a Câmera ──────────────────────────────────

const cameraHttp = axios.create({
  baseURL: CAMERA_BASE,
  headers: { Authorization: AUTH_HEADER },
  timeout: 5000,
  validateStatus: () => true,
});

/**
 * Faz uma requisição CGI para a câmera
 */
async function cameraRequest(path, method = "GET", data = null) {
  try {
    const opts = { method, url: path };
    if (data) opts.data = data;
    const resp = await cameraHttp(opts);
    return { ok: resp.status >= 200 && resp.status < 300, data: resp.data, status: resp.status };
  } catch (err) {
    return { ok: false, data: null, status: 0, error: err.message };
  }
}

/**
 * Faz uma requisição VISCA-over-IP (CGI command endpoint)
 */
async function sendCGICommand(endpoint, params = {}) {
  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  const url = query ? `/command/${endpoint}?${query}` : `/command/${endpoint}`;
  return cameraRequest(url);
}

// ─── Funções de Leitura de Status ───────────────────────────────

async function getCameraStatus() {
  const result = {
    connected: false,
    whiteBalance: { mode: null, colorTemperature: null },
    exposure: { iris: null, gain: null, shutter: null, mode: null },
    ndFilter: { position: null, mode: null },
    recording: { active: false, timecode: null, mediaRemaining: null },
    audio: { ch1Level: null, ch2Level: null },
    system: { model: "PXW-Z190", firmware: null, serial: null },
    lens: { zoom: null, focus: null, focusMode: null },
  };

  try {
    // Tenta acessar a câmera para verificar conectividade
    const ping = await cameraRequest("/");
    if (!ping.ok && ping.status !== 401) {
      return result;
    }
    result.connected = true;

    // Buscar informações via CGI endpoints da Sony
    // Endpoint de inquiry geral
    const [inquiryResp, recResp] = await Promise.allSettled([
      cameraRequest("/command/inquiry.cgi?inq=camera"),
      cameraRequest("/command/inquiry.cgi?inq=system"),
    ]);

    // Parse inquiry response (formato key=value por linha)
    if (inquiryResp.status === "fulfilled" && inquiryResp.value.ok) {
      const data = parseInquiryResponse(inquiryResp.value.data);
      // White Balance
      if (data.WhiteBalanceMode) result.whiteBalance.mode = data.WhiteBalanceMode;
      if (data.ColorTemperature) result.whiteBalance.colorTemperature = parseInt(data.ColorTemperature);
      // Exposure
      if (data.IrisPosition || data.Iris) result.exposure.iris = data.IrisPosition || data.Iris;
      if (data.GainValue || data.Gain) result.exposure.gain = data.GainValue || data.Gain;
      if (data.ShutterSpeed || data.Shutter) result.exposure.shutter = data.ShutterSpeed || data.Shutter;
      if (data.ExposureMode) result.exposure.mode = data.ExposureMode;
      // ND Filter
      if (data.NDFilter || data.NDFilterPosition) result.ndFilter.position = data.NDFilter || data.NDFilterPosition;
      if (data.NDFilterMode) result.ndFilter.mode = data.NDFilterMode;
      // Lens
      if (data.ZoomPosition) result.lens.zoom = parseInt(data.ZoomPosition);
      if (data.FocusPosition) result.lens.focus = parseInt(data.FocusPosition);
      if (data.FocusMode) result.lens.focusMode = data.FocusMode;
    }

    // System info
    if (recResp.status === "fulfilled" && recResp.value.ok) {
      const sysData = parseInquiryResponse(recResp.value.data);
      if (sysData.ModelName || sysData.Model) result.system.model = sysData.ModelName || sysData.Model;
      if (sysData.Version || sysData.Firmware) result.system.firmware = sysData.Version || sysData.Firmware;
      if (sysData.Serial) result.system.serial = sysData.Serial;
    }

    // Recording status
    try {
      const recStatus = await cameraRequest("/command/inquiry.cgi?inq=record");
      if (recStatus.ok) {
        const recData = parseInquiryResponse(recStatus.data);
        result.recording.active =
          recData.Recording === "true" ||
          recData.RecordStatus === "recording" ||
          recData.Status === "recording";
        if (recData.Timecode) result.recording.timecode = recData.Timecode;
        if (recData.MediaRemaining) result.recording.mediaRemaining = recData.MediaRemaining;
      }
    } catch {}

  } catch (err) {
    log("error", "Erro ao ler status da câmera:", err.message);
  }

  return result;
}

/**
 * Parse resposta de inquiry (pode ser text/plain key=value ou JSON)
 */
function parseInquiryResponse(data) {
  if (!data) return {};

  // Se já é objeto JSON
  if (typeof data === "object") return data;

  // Se é string, tenta JSON primeiro
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {}

    // Tenta formato key=value (um por linha)
    const result = {};
    const lines = data.split(/[\r\n]+/);
    for (const line of lines) {
      const idx = line.indexOf("=");
      if (idx > 0) {
        const key = line.substring(0, idx).trim();
        const val = line.substring(idx + 1).trim();
        result[key] = val;
      }
    }
    return result;
  }

  return {};
}

// ─── Funções de Comando ─────────────────────────────────────────

const commandHandlers = {
  // Lens
  setZoom: async (params) => sendCGICommand("camera.cgi", { Zoom: params.position }),
  zoomContinuous: async (params) => sendCGICommand("camera.cgi", { ZoomDirect: params.speed }),
  setFocusMode: async (params) => sendCGICommand("camera.cgi", { FocusMode: params.mode }),
  setFocusPosition: async (params) => sendCGICommand("camera.cgi", { Focus: params.position }),
  focusContinuous: async (params) => sendCGICommand("camera.cgi", { FocusDirect: params.speed }),
  onePushFocus: async () => sendCGICommand("camera.cgi", { OnePushFocus: "trigger" }),
  setIris: async (params) => sendCGICommand("camera.cgi", { Iris: params.position }),

  // Image
  setWhiteBalance: async (params) => sendCGICommand("camera.cgi", { WhiteBalance: params.mode }),
  setGain: async (params) => sendCGICommand("camera.cgi", { Gain: params.value }),
  setShutter: async (params) => sendCGICommand("camera.cgi", { Shutter: params.value }),
  setNDFilter: async (params) => sendCGICommand("camera.cgi", { NDFilter: params.position }),
  setColorBars: async (params) => sendCGICommand("camera.cgi", { ColorBars: params.enabled ? "on" : "off" }),

  // Recording
  startRecording: async () => sendCGICommand("recording.cgi", { Record: "start" }),
  stopRecording: async () => sendCGICommand("recording.cgi", { Record: "stop" }),

  // Audio
  setAudioLevel: async (params) => sendCGICommand("audio.cgi", { [`Ch${params.channel}Level`]: params.level }),
  setAudioInputSource: async (params) => sendCGICommand("audio.cgi", { [`Ch${params.channel}Input`]: params.source }),

  // Preset
  applyPreset: async (params) => {
    const results = [];
    const settings = params.settings || {};
    for (const [key, value] of Object.entries(settings)) {
      const result = await sendCGICommand("camera.cgi", { [key]: value });
      results.push({ key, ...result });
    }
    return { ok: true, results };
  },
};

// ─── WebSocket Connection Manager ───────────────────────────────

let ws = null;
let statusInterval = null;
let reconnectTimeout = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30000;

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  log("info", `Conectando ao servidor: ${BRIDGE_SERVER_URL}`);

  try {
    ws = new WebSocket(BRIDGE_SERVER_URL);
  } catch (err) {
    log("error", "Erro ao criar WebSocket:", err.message);
    scheduleReconnect();
    return;
  }

  ws.on("open", () => {
    log("ok", "Conexão WebSocket estabelecida");
    reconnectDelay = 1000; // Reset delay

    // Autenticar
    ws.send(
      JSON.stringify({
        type: "auth",
        token: BRIDGE_TOKEN,
        version: BRIDGE_VERSION,
      })
    );
  });

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      // Auth confirmada
      if (msg.type === "auth_ok") {
        log("ok", "Autenticação confirmada pelo servidor");
        startStatusPolling();
        return;
      }

      // Comando do painel
      if (msg.type === "command") {
        log("info", `Comando recebido: ${msg.action}`, msg.params);
        await handleCommand(msg);
        return;
      }

      // Ping
      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }
    } catch (err) {
      log("error", "Erro ao processar mensagem:", err.message);
    }
  });

  ws.on("close", (code, reason) => {
    log("warn", `Desconectado (code: ${code}, reason: ${reason})`);
    stopStatusPolling();
    scheduleReconnect();
  });

  ws.on("error", (err) => {
    log("error", "Erro WebSocket:", err.message);
  });
}

async function handleCommand(msg) {
  const handler = commandHandlers[msg.action];
  if (!handler) {
    sendResponse(msg.id, false, null, `Comando desconhecido: ${msg.action}`);
    return;
  }

  try {
    const result = await handler(msg.params || {});
    sendResponse(msg.id, result.ok !== false, result.data || result);
    log("ok", `Comando executado: ${msg.action}`);
  } catch (err) {
    sendResponse(msg.id, false, null, err.message);
    log("error", `Falha no comando ${msg.action}:`, err.message);
  }
}

function sendResponse(id, success, data, error) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        id,
        type: "response",
        success,
        data: data || undefined,
        error: error || undefined,
      })
    );
  }
}

function startStatusPolling() {
  stopStatusPolling();
  log("info", `Iniciando polling de status a cada ${STATUS_INTERVAL}ms`);

  // Enviar status imediatamente
  sendStatus();

  statusInterval = setInterval(sendStatus, STATUS_INTERVAL);
}

function stopStatusPolling() {
  if (statusInterval) {
    clearInterval(statusInterval);
    statusInterval = null;
  }
}

async function sendStatus() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  try {
    const status = await getCameraStatus();
    ws.send(
      JSON.stringify({
        type: "status",
        data: status,
        timestamp: Date.now(),
      })
    );
  } catch (err) {
    log("error", "Erro ao enviar status:", err.message);
  }
}

function scheduleReconnect() {
  if (reconnectTimeout) return;

  log("info", `Reconectando em ${reconnectDelay / 1000}s...`);
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    connect();
  }, reconnectDelay);
}

// ─── Startup ────────────────────────────────────────────────────

function printBanner() {
  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║       Z190 Bridge Local v" + BRIDGE_VERSION + "              ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log(`║  Câmera: ${CAMERA_IP}:${CAMERA_PORT}`.padEnd(47) + "║");
  console.log(`║  Usuário: ${CAMERA_USER}`.padEnd(47) + "║");
  console.log(`║  Servidor: ${BRIDGE_SERVER_URL.substring(0, 33)}`.padEnd(47) + "║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");
}

printBanner();

// Verificar câmera antes de conectar
log("info", "Verificando conexão com a câmera...");
cameraRequest("/").then((result) => {
  if (result.ok || result.status === 200 || result.status === 401) {
    log("ok", `Câmera acessível em ${CAMERA_BASE} (status: ${result.status})`);
  } else {
    log("warn", `Câmera pode não estar acessível (status: ${result.status}). Continuando mesmo assim...`);
  }

  // Conectar ao servidor
  connect();
});

// Graceful shutdown
process.on("SIGINT", () => {
  log("info", "Encerrando bridge...");
  stopStatusPolling();
  if (ws) ws.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  log("info", "Encerrando bridge...");
  stopStatusPolling();
  if (ws) ws.close();
  process.exit(0);
});
