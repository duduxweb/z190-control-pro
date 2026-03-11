const express = require("express");
const path = require("path");
const http = require("http");
const fs = require("fs");
const { spawn } = require("child_process");
const { createProxyMiddleware } = require("http-proxy-middleware");
const { ensureLogsDir, writeLog } = require("./logger");

const PORT = 3000;
const CONFIG_PATH = path.join(__dirname, "config.json");
const DASHBOARD_DIST_PATH = path.join(__dirname, "camera-dashboard-control", "dist");
const FALLBACK_PUBLIC_PATH = path.join(__dirname, "public");
const STATIC_ROOT = fs.existsSync(DASHBOARD_DIST_PATH) ? DASHBOARD_DIST_PATH : FALLBACK_PUBLIC_PATH;

ensureLogsDir();

function logServer(step, details) {
  writeLog("server", step, details);
}

function slugify(value) {
  return String(value || "camera")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "camera";
}

function defaultCamera(raw = {}) {
  return {
    id: raw.id || slugify(raw.name || raw.ip || "camera"),
    name: raw.name || `Camera ${raw.ip || "Nova"}`,
    ip: raw.ip || "192.168.100.41",
    user: raw.user || "admin",
    password: raw.password || raw.pass || "ABCD1234",
    port: Number(raw.port || 80),
  };
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {
      camera: { ip: "192.168.100.41", user: "admin", password: "ABCD1234", port: 80 },
      server: { port: PORT },
    };
  }
}

function normalizeConfig(raw = readConfig()) {
  const migratedCamera = raw.camera ? defaultCamera({ ...raw.camera, id: "camera-1", name: raw.camera.name || "Camera 1" }) : null;
  const cameras = Array.isArray(raw.cameras) && raw.cameras.length > 0
    ? raw.cameras.map(defaultCamera)
    : (migratedCamera ? [migratedCamera] : []);

  const presets = Array.isArray(raw.presets) ? raw.presets.map((preset, index) => ({
    id: preset.id || `preset-${index + 1}`,
    name: preset.name || `Preset ${index + 1}`,
    cameraIds: Array.isArray(preset.cameraIds) ? preset.cameraIds : [],
  })) : [];

  return {
    cameras,
    presets,
    activeCameraId: raw.activeCameraId || cameras[0]?.id || null,
    server: {
      port: Number(raw.server?.port || PORT),
    },
  };
}

function saveConfig(config) {
  const normalized = {
    cameras: config.cameras.map(defaultCamera),
    presets: config.presets || [],
    activeCameraId: config.activeCameraId || config.cameras[0]?.id || null,
    server: {
      port: Number(config.server?.port || PORT),
    },
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(normalized, null, 2));
  return normalized;
}

function getConfig() {
  return normalizeConfig(readConfig());
}

function getCameraById(cameraId) {
  const config = getConfig();
  const camera = config.cameras.find((item) => item.id === cameraId);
  if (!camera) throw new Error(`Camera nao encontrada: ${cameraId}`);
  return { camera, config };
}

function runNodeScript(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", [path.join(__dirname, scriptName), ...args], { cwd: __dirname });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
    proc.on("error", reject);
  });
}

function parseMultiOutput(stdout) {
  const marker = "\nDETALHES:\n";
  const index = stdout.lastIndexOf(marker);
  if (index === -1) throw new Error("Saida do z190-multi sem bloco DETALHES.");

  const parsed = JSON.parse(stdout.slice(index + marker.length).trim());
  const first = parsed[0];
  if (!first?.ok) throw new Error(first?.error || "Comando retornou falha.");
  return first;
}

function argsForCamera(camera) {
  return [
    "--ip", camera.ip,
    "--user", camera.user,
    "--password", camera.password,
    "--port", String(camera.port || 80),
  ];
}

async function readStatusForCamera(camera) {
  const result = await runNodeScript("z190-status.js", [...argsForCamera(camera), "--json", "--fast"]);
  if (result.stderr.trim()) logServer(`z190-status stderr ${camera.id}`, result.stderr.trim());
  if (result.code !== 0) throw new Error(result.stderr.trim() || `z190-status saiu com codigo ${result.code}`);
  return JSON.parse(result.stdout.trim());
}

async function runCommandForCamera(camera, commandArgs) {
  logServer(`executando z190-multi ${camera.id}`, commandArgs);
  const result = await runNodeScript("z190-multi.js", [...argsForCamera(camera), ...commandArgs]);
  logServer(`z190-multi stdout ${camera.id}`, result.stdout.trim());
  if (result.stderr.trim()) logServer(`z190-multi stderr ${camera.id}`, result.stderr.trim());
  if (result.code !== 0) throw new Error(result.stderr.trim() || `z190-multi saiu com codigo ${result.code}`);
  return parseMultiOutput(result.stdout);
}

const statusCache = new Map();
const cameraActionQueues = new Map();
const inFlightStatus = new Map();
const actionInFlight = new Set();
const STATUS_REFRESH_INTERVAL_MS = 2000;
const STATUS_MAX_STALE_MS = 2000;

function isFreshStatus(status) {
  if (!status || !status.lastUpdate) return false;
  const ts = Date.parse(String(status.lastUpdate));
  if (!Number.isFinite(ts)) return false;
  return (Date.now() - ts) <= STATUS_MAX_STALE_MS;
}

function runCameraActionTask(cameraId, label, task) {
  const currentQueue = cameraActionQueues.get(cameraId) || Promise.resolve();
  const next = currentQueue.then(async () => {
    logServer(`fila camera -> ${cameraId} -> ${label}`);
    return task();
  });
  cameraActionQueues.set(cameraId, next.catch(() => {}));
  return next;
}

async function fetchCameraStatus(camera) {
  if (actionInFlight.has(camera.id)) {
    return statusCache.get(camera.id) || {
      connected: false,
      loading: false,
      error: null,
      lastUpdate: null,
    };
  }

  if (inFlightStatus.has(camera.id)) {
    return inFlightStatus.get(camera.id);
  }

  const current = statusCache.get(camera.id) || {};
  statusCache.set(camera.id, { ...current, loading: true });

  const pending = (async () => {
    try {
      const status = await readStatusForCamera(camera);
      const merged = {
        ...status,
        connected: true,
        loading: false,
        error: null,
        lastUpdate: new Date().toISOString(),
      };
      statusCache.set(camera.id, merged);
      return merged;
    } catch (error) {
      const failed = {
        ...current,
        connected: false,
        loading: false,
        error: error.message,
        lastUpdate: new Date().toISOString(),
      };
      statusCache.set(camera.id, failed);
      logServer(`erro ao atualizar status ${camera.id}`, error.message);
      return failed;
    } finally {
      inFlightStatus.delete(camera.id);
    }
  })();

  inFlightStatus.set(camera.id, pending);
  return pending;
}

async function refreshAllStatuses() {
  const { cameras } = getConfig();
  await Promise.all(cameras.map((camera) => fetchCameraStatus(camera)));
}

function dashboardPayload() {
  const { cameras, presets, activeCameraId } = getConfig();
  return {
    activeCameraId,
    presets,
    cameras: cameras.map((camera) => ({
      ...camera,
      status: statusCache.get(camera.id) || {
        connected: false,
        loading: true,
        error: null,
        lastUpdate: null,
      },
    })),
  };
}

function mergedStatusFromAction(current, action, payload, result) {
  const next = {
    ...(current || {}),
    connected: true,
    loading: false,
    error: null,
    lastUpdate: new Date().toISOString(),
  };
  const after = result?.data?.after || {};

  const readAfter = (key) => after[key];

  switch (action) {
    case "ndMode":
      next.nd_mode = payload.mode === "Auto" ? "Auto" : "Manual";
      next.nd_method = payload.mode === "Auto" ? "Automatic" : "Manual";
      break;
    case "ndValue":
      next.nd_method = "Manual";
      next.nd_mode = "Manual";
      break;
    case "irisMode":
      next.iris_method = payload.mode === "Auto" ? "Automatic" : "Manual";
      break;
    case "irisValue":
      next.iris_method = "Manual";
      next.iris = payload.value;
      break;
    case "focusMode":
      next.focus_method = payload.mode === "Auto" ? "Automatic" : "Manual";
      break;
    case "shutterMode":
      if (payload.mode === "Off") {
        next.shutter_enabled = false;
      } else if (payload.mode === "Auto") {
        next.shutter_enabled = true;
        next.shutter_method = "Automatic";
      } else {
        next.shutter_enabled = true;
        next.shutter_method = "Manual";
      }
      break;
    case "shutter":
      next.shutter_enabled = true;
      next.shutter_method = "Manual";
      next.shutter = String(payload.value);
      break;
    case "gain":
      next.gain = String(payload.value || "6dB");
      break;
    case "wbMode":
      next.wb_mode = String(payload.mode || next.wb_mode || "Preset");
      break;
    case "wbKelvin":
      next.wb_mode = String(payload.mode || next.wb_mode || "Memory A");
      next.wb_kelvin = Number(payload.value) || next.wb_kelvin || null;
      break;
    case "gammaEnabled":
      next.gamma_enabled = Boolean(payload.enabled);
      break;
    case "gammaType":
      next.gamma_type = String(payload.value || next.gamma_type || "-");
      break;
    case "gammaValue":
      next.gamma_value = String(payload.value || next.gamma_value || "-");
      break;
    case "gammaSet":
      next.gamma_type = String(payload.type || next.gamma_type || "-");
      next.gamma_value = String(payload.value || next.gamma_value || "-");
      break;
    case "blackBalance":
      next.black_status = "Executando...";
      break;
    case "outputShootingMode":
      next.shooting_mode = String(payload.value || next.shooting_mode || "-");
      break;
    case "outputRecOut":
      next.output_recout = String(payload.value || next.output_recout || "-");
      break;
    case "colorbars":
      next.colorbars = Boolean(payload.enabled);
      next.colorbars_type = String(payload.type || next.colorbars_type || "100%");
      break;
    case "recording":
      next.rec_main = payload.start ? "REC" : "STOP";
      break;
    case "zoom":
      next.zoom_velocity = Number(payload.velocity || 0);
      break;
    default:
      break;
  }

  if (readAfter("Camera.WhiteBalance.Mode") != null) {
    next.wb_mode = readAfter("Camera.WhiteBalance.Mode");
  }
  if (readAfter("Camera.Shutter.Enabled") != null) {
    next.shutter_enabled = readAfter("Camera.Shutter.Enabled");
  }
  if (readAfter("Camera.Shutter.SettingMethod") != null) {
    next.shutter_method = readAfter("Camera.Shutter.SettingMethod");
  }
  if (readAfter("Camera.Shutter.Value") != null) {
    next.shutter = readAfter("Camera.Shutter.Value");
  }
  if (readAfter("Paint.Gamma.Enabled") != null) {
    next.gamma_enabled = readAfter("Paint.Gamma.Enabled");
  }
  if (readAfter("Paint.Gamma.Type") != null) {
    next.gamma_type = readAfter("Paint.Gamma.Type");
  }
  if (readAfter("Paint.Gamma.Value") != null) {
    next.gamma_value = readAfter("Paint.Gamma.Value");
  }
  if (readAfter("P.Control.u2x500.AutoBlackBalance") != null) {
    next.black_status = readAfter("P.Control.u2x500.AutoBlackBalance");
  }
  if (readAfter("Camera.ShootingMode") != null) {
    next.shooting_mode = readAfter("Camera.ShootingMode");
  }
  if (readAfter("Camera.ShootingMode.QFHD.RecOut") != null) {
    next.output_recout = readAfter("Camera.ShootingMode.QFHD.RecOut");
  }

  return next;
}

function commandArgsFromAction(action, payload) {
  switch (action) {
    case "colorbars":
      return ["colorbars", payload.enabled ? "on" : "off"];
    case "recording":
      return ["rec", payload.start ? "on" : "off"];
    case "ndMode":
      return payload.mode === "Auto" ? ["nd", "auto"] : ["nd", "manual"];
    case "ndValue":
      return ["nd", "manual", String(payload.value)];
    case "irisMode":
      return payload.mode === "Auto" ? ["iris", "auto"] : ["iris", "manual"];
    case "irisValue":
      return ["iris", "manual", String(payload.value).replace(/[^\d.]/g, "")];
    case "focusMode":
      return payload.mode === "Auto" ? ["focus", "auto"] : ["focus", "manual"];
    case "shutterMode":
      if (payload.mode === "Off") return ["shutter-mode", "off"];
      return payload.mode === "Auto" ? ["shutter-mode", "auto"] : ["shutter-mode", "manual"];
    case "shutter":
      return ["shutter", String(payload.value)];
    case "gain":
      return ["gain", String(payload.value || "6dB")];
    case "wbMode":
      return ["wb-mode", String(payload.mode)];
    case "wbKelvin": {
      const targetMode = ["Memory A", "Memory B"].includes(String(payload.mode))
        ? String(payload.mode)
        : "Memory A";
      return ["wb-k-snap", String(payload.value), targetMode];
    }
    case "gammaEnabled":
      return ["gamma-enabled", payload.enabled ? "on" : "off"];
    case "gammaType":
      return ["gamma-type", String(payload.value)];
    case "gammaValue":
      return ["gamma-value", String(payload.value)];
    case "gammaSet":
      return ["gamma-set", String(payload.type || "STD"), String(payload.value || "Main")];
    case "blackBalance":
      return ["black-balance"];
    case "outputShootingMode":
      return ["output-shooting-mode", String(payload.value || "Normal")];
    case "outputRecOut":
      return ["output-recout", String(payload.value || "SDI+HDMI")];
    case "zoom":
      return ["zoom", String(payload.velocity || 0)];
    default:
      throw new Error(`Acao nao suportada: ${action}`);
  }
}

const app = express();
app.use(express.json());
app.use(express.static(STATIC_ROOT));

void refreshAllStatuses();
setInterval(() => {
  void refreshAllStatuses();
}, STATUS_REFRESH_INTERVAL_MS);

app.get("/api/dashboard/status", async (req, res) => {
  const { cameras } = getConfig();
  const staleCameras = cameras.filter((camera) => !isFreshStatus(statusCache.get(camera.id)));
  if (staleCameras.length > 0) {
    void Promise.all(staleCameras.map((camera) => fetchCameraStatus(camera)));
  }
  res.json(dashboardPayload());
});

app.get("/api/settings", (req, res) => {
  const { presets, activeCameraId } = getConfig();
  res.json({ presets, activeCameraId });
});

app.post("/api/settings", (req, res) => {
  const current = getConfig();
  const next = saveConfig({
    ...current,
    presets: Array.isArray(req.body?.presets) ? req.body.presets : current.presets,
    activeCameraId: req.body?.activeCameraId || current.activeCameraId,
  });
  logServer("configuracao de presets salva", next.presets);
  res.json({ ok: true, presets: next.presets, activeCameraId: next.activeCameraId });
});

app.get("/api/cameras", (req, res) => {
  const { cameras } = getConfig();
  res.json(cameras);
});

app.post("/api/cameras", (req, res) => {
  const current = getConfig();
  const body = req.body || {};
  const camera = defaultCamera({
    ...body,
    id: body.id || `${slugify(body.name || body.ip || "camera")}-${Date.now()}`,
  });

  const existingIndex = current.cameras.findIndex((item) => item.id === camera.id);
  const nextCameras = [...current.cameras];
  if (existingIndex >= 0) nextCameras[existingIndex] = camera;
  else nextCameras.push(camera);

  const next = saveConfig({
    ...current,
    cameras: nextCameras,
    activeCameraId: current.activeCameraId || camera.id,
  });

  logServer("camera salva", camera);
  res.json({ ok: true, camera, cameras: next.cameras });
});

app.put("/api/cameras/:cameraId", (req, res) => {
  const current = getConfig();
  const nextCameras = current.cameras.map((item) => (
    item.id === req.params.cameraId ? defaultCamera({ ...item, ...req.body, id: item.id }) : item
  ));
  const next = saveConfig({ ...current, cameras: nextCameras });
  const camera = next.cameras.find((item) => item.id === req.params.cameraId);
  logServer("camera atualizada", camera);
  res.json({ ok: true, camera });
});

app.delete("/api/cameras/:cameraId", (req, res) => {
  const current = getConfig();
  const nextCameras = current.cameras.filter((item) => item.id !== req.params.cameraId);
  const next = saveConfig({
    ...current,
    cameras: nextCameras,
    activeCameraId: current.activeCameraId === req.params.cameraId ? nextCameras[0]?.id || null : current.activeCameraId,
  });
  statusCache.delete(req.params.cameraId);
  logServer("camera removida", req.params.cameraId);
  res.json({ ok: true, cameras: next.cameras, activeCameraId: next.activeCameraId });
});

app.get("/api/cameras/:cameraId", async (req, res) => {
  try {
    const { camera } = getCameraById(req.params.cameraId);
    res.json(camera);
  } catch (error) {
    res.status(404).json({ ok: false, message: error.message });
  }
});

app.get("/api/cameras/:cameraId/status", async (req, res) => {
  try {
    const { camera } = getCameraById(req.params.cameraId);
    const cached = statusCache.get(camera.id);
    const status = isFreshStatus(cached) ? cached : await fetchCameraStatus(camera);
    res.json(status);
  } catch (error) {
    res.status(404).json({ ok: false, message: error.message });
  }
});

app.post("/api/cameras/:cameraId/refresh", async (req, res) => {
  try {
    const { camera } = getCameraById(req.params.cameraId);
    const status = await fetchCameraStatus(camera);
    res.json(status);
  } catch (error) {
    res.status(404).json({ ok: false, message: error.message });
  }
});

app.post("/api/cameras/:cameraId/read", async (req, res) => {
  try {
    const { camera } = getCameraById(req.params.cameraId);
    const status = await fetchCameraStatus(camera);
    res.json({ ok: true, result: status });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.post("/api/cameras/:cameraId/command", async (req, res) => {
  const { action, payload = {} } = req.body || {};
  try {
    const { camera } = getCameraById(req.params.cameraId);
    const cliArgs = commandArgsFromAction(action, payload);
    actionInFlight.add(camera.id);
    const result = await runCameraActionTask(camera.id, `action:${action}`, () => runCommandForCamera(camera, cliArgs));
    const cached = statusCache.get(camera.id) || { connected: true, loading: false };
    const merged = mergedStatusFromAction(cached, action, payload, result);
    statusCache.set(camera.id, merged);
    void fetchCameraStatus(camera);
    logServer("acao executada", { cameraId: camera.id, action, cliArgs, after: result?.data?.after || null });
    res.json({ ok: true, result, status: merged });
  } catch (error) {
    logServer("erro na acao", { cameraId: req.params.cameraId, action, message: error.message });
    res.status(500).json({ ok: false, message: error.message });
  } finally {
    actionInFlight.delete(req.params.cameraId);
  }
});

app.post("/api/cameras/:cameraId/test", async (req, res) => {
  try {
    const { camera } = getCameraById(req.params.cameraId);
    const auth = "Basic " + Buffer.from(`${camera.user}:${camera.password}`).toString("base64");
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 5000);
    const response = await fetch(`http://${camera.ip}:${camera.port || 80}/rmt.html`, {
      headers: { Authorization: auth },
      signal: ctrl.signal,
    });
    clearTimeout(timeout);
    const body = {
      ok: response.ok,
      message: response.ok ? "Camera acessivel!" : `HTTP ${response.status}`,
    };
    logServer("teste de conexao", { cameraId: camera.id, ...body });
    res.json(body);
  } catch (error) {
    logServer("erro no teste de conexao", { cameraId: req.params.cameraId, message: error.message });
    res.json({ ok: false, message: error.message });
  }
});

app.get("/api/config/full", (req, res) => {
  const config = getConfig();
  const activeCamera = config.cameras.find((item) => item.id === config.activeCameraId) || config.cameras[0] || null;
  res.json({
    camera: activeCamera,
    cameras: config.cameras,
    presets: config.presets,
    activeCameraId: config.activeCameraId,
  });
});

app.post("/api/config", (req, res) => {
  const current = getConfig();
  const next = saveConfig({
    ...current,
    activeCameraId: req.body?.activeCameraId || current.activeCameraId,
  });
  res.json({ ok: true, activeCameraId: next.activeCameraId });
});

const cameraProxy = createProxyMiddleware({
  target: "http://127.0.0.1",
  changeOrigin: true,
  ws: true,
  logLevel: "silent",
  router: (req) => {
    const config = getConfig();
    const cameraId = req.query.cameraId || config.activeCameraId;
    const camera = config.cameras.find((item) => item.id === cameraId) || config.cameras[0];
    return `http://${camera.ip}:${camera.port || 80}`;
  },
  onProxyReq: (proxyReq, req) => {
    const config = getConfig();
    const cameraId = req.query.cameraId || config.activeCameraId;
    const camera = config.cameras.find((item) => item.id === cameraId) || config.cameras[0];
    const auth = "Basic " + Buffer.from(`${camera.user}:${camera.password}`).toString("base64");
    proxyReq.setHeader("Authorization", auth);
  },
  onProxyReqWs: (proxyReq, req) => {
    const config = getConfig();
    const cameraId = req.query.cameraId || config.activeCameraId;
    const camera = config.cameras.find((item) => item.id === cameraId) || config.cameras[0];
    const auth = "Basic " + Buffer.from(`${camera.user}:${camera.password}`).toString("base64");
    proxyReq.setHeader("Authorization", auth);
  },
});

app.use("/sony", cameraProxy);

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/sony")) {
    next();
    return;
  }
  res.sendFile(path.join(STATIC_ROOT, "index.html"));
});

const server = http.createServer(app);
server.listen(PORT, () => {
  logServer("servidor iniciado", { url: `http://localhost:${PORT}`, staticRoot: STATIC_ROOT });
  console.log(`\n  Z190 Control Pro -> http://localhost:${PORT}\n`);
});
server.on("upgrade", cameraProxy.upgrade);
