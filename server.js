const express  = require("express");
const path     = require("path");
const http     = require("http");
const fs       = require("fs");
const { spawn } = require("child_process");
const { createProxyMiddleware } = require("http-proxy-middleware");

const PORT = 3000;
const CONFIG_PATH = path.join(__dirname, "config.json");

function getConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")); }
  catch { return { camera:{ ip:"192.168.100.41", user:"admin", password:"ABCD1234", port:80 } }; }
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Cache de status ──────────────────────────────────────────────────────────
let cachedStatus = { connected:false, loading:true, lastUpdate:null };
let fetching = false;

function fetchStatus() {
  if (fetching) return;
  fetching = true;
  const proc = spawn("node", [path.join(__dirname,"z190-status.js"),"--json"], { cwd:__dirname });
  let out = "", err = "";
  proc.stdout.on("data", d => out += d.toString());
  proc.stderr.on("data", d => err += d.toString());
  proc.on("close", code => {
    fetching = false;
    if (code === 0 && out.trim()) {
      try {
        cachedStatus = { ...JSON.parse(out.trim()), connected:true, loading:false, lastUpdate:new Date().toISOString() };
      } catch {
        cachedStatus = { connected:false, loading:false, error:"Parse error", lastUpdate:new Date().toISOString() };
      }
    } else {
      cachedStatus = { connected:false, loading:false, error:err.trim()||"Camera inacessivel", lastUpdate:new Date().toISOString() };
    }
  });
}

fetchStatus();
setInterval(fetchStatus, 4000);

// ── Rotas API ────────────────────────────────────────────────────────────────
app.get("/api/camera/status", (req, res) => res.json(cachedStatus));

app.post("/api/camera/refresh", (req, res) => {
  cachedStatus = { ...cachedStatus, loading:true };
  fetchStatus();
  setTimeout(() => res.json(cachedStatus), 500);
});

app.get("/api/config/full", (req, res) => res.json(getConfig()));

app.post("/api/config", (req, res) => {
  try {
    const cfg = { ...getConfig(), ...req.body };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
    res.json({ ok:true });
  } catch(e) { res.json({ ok:false, message:e.message }); }
});

app.post("/api/config/test", async (req, res) => {
  const cfg = getConfig();
  const { ip=cfg.camera?.ip, user=cfg.camera?.user, password=cfg.camera?.password } = req.body;
  const auth = "Basic " + Buffer.from(`${user}:${password}`).toString("base64");
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(`http://${ip}/rmt.html`, { headers:{ Authorization:auth }, signal:ctrl.signal });
    clearTimeout(t);
    res.json({ ok:r.ok, message:r.ok?"Camera acessivel!":`HTTP ${r.status}` });
  } catch(e) { res.json({ ok:false, message:e.message }); }
});

// ── Proxy camera ─────────────────────────────────────────────────────────────
const cfg0 = getConfig();
const auth0 = "Basic " + Buffer.from(`${cfg0.camera.user}:${cfg0.camera.password}`).toString("base64");
const cameraProxy = createProxyMiddleware({
  target:`http://${cfg0.camera.ip}`, changeOrigin:true, ws:true, logLevel:"silent",
  onProxyReq: r => r.setHeader("Authorization", auth0),
  onProxyReqWs: r => r.setHeader("Authorization", auth0),
});
app.use("/sony", cameraProxy);

// ── Server ───────────────────────────────────────────────────────────────────
const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`\n  Z190 Control Pro  →  http://localhost:${PORT}\n`);
});
server.on("upgrade", cameraProxy.upgrade);
