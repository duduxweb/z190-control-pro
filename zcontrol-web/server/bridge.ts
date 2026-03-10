/**
 * Bridge WebSocket Server
 *
 * Gerencia a conexão WebSocket entre o painel na nuvem e o bridge local.
 * O bridge local conecta-se a este servidor e funciona como ponte para a câmera.
 *
 * Protocolo:
 * - Bridge conecta via ws:// com token de autenticação
 * - Painel envia comandos via tRPC → bridge.sendCommand()
 * - Bridge executa na câmera e devolve resultado via WebSocket
 * - Status da câmera é atualizado periodicamente pelo bridge
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { nanoid } from "nanoid";
import { ENV } from "./_core/env";

// ─── Types ──────────────────────────────────────────────────────

interface BridgeCommand {
  id: string;
  type: "command";
  action: string;
  params?: Record<string, any>;
}

interface BridgeResponse {
  id: string;
  type: "response";
  success: boolean;
  data?: any;
  error?: string;
}

interface BridgeStatusUpdate {
  type: "status";
  data: CameraFullStatus;
  timestamp: number;
}

interface BridgeAuth {
  type: "auth";
  token: string;
  version?: string;
}

export interface CameraFullStatus {
  connected: boolean;
  whiteBalance?: { mode?: string; colorTemperature?: number };
  exposure?: { iris?: string; gain?: string; shutter?: string; mode?: string };
  ndFilter?: { position?: string; mode?: string };
  recording?: { active: boolean; timecode?: string; mediaRemaining?: string };
  audio?: { ch1Level?: number; ch2Level?: number };
  system?: { model?: string; firmware?: string; serial?: string };
  lens?: { zoom?: number; focus?: number; focusMode?: string };
}

// ─── Bridge Manager (Singleton) ─────────────────────────────────

class BridgeManager {
  private wss: WebSocketServer | null = null;
  private bridgeSocket: WebSocket | null = null;
  private pendingCommands: Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (reason: any) => void;
      timeout: NodeJS.Timeout;
    }
  > = new Map();
  private lastStatus: CameraFullStatus = { connected: false };
  private lastStatusTimestamp: number = 0;
  private bridgeVersion: string = "";
  private bridgeConnectedAt: number = 0;

  /**
   * Inicializa o WebSocket Server no mesmo HTTP server do Express
   */
  init(server: Server) {
    this.wss = new WebSocketServer({ server, path: "/ws/bridge" });

    this.wss.on("connection", (ws, req) => {
      console.log(
        `[Bridge] Nova conexão WebSocket de ${req.socket.remoteAddress}`
      );

      // Aguarda autenticação dentro de 10 segundos
      const authTimeout = setTimeout(() => {
        console.log("[Bridge] Timeout de autenticação, desconectando");
        ws.close(4001, "Auth timeout");
      }, 10000);

      let authenticated = false;

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());

          // Autenticação
          if (!authenticated && msg.type === "auth") {
            clearTimeout(authTimeout);
            if (this.validateToken(msg.token)) {
              authenticated = true;
              this.registerBridge(ws, msg.version);
              ws.send(
                JSON.stringify({ type: "auth_ok", timestamp: Date.now() })
              );
              console.log(
                `[Bridge] Autenticado com sucesso (v${msg.version || "?"})`
              );
            } else {
              console.log("[Bridge] Token inválido, desconectando");
              ws.close(4003, "Invalid token");
            }
            return;
          }

          if (!authenticated) {
            ws.close(4001, "Not authenticated");
            return;
          }

          // Processar mensagens do bridge autenticado
          this.handleBridgeMessage(msg);
        } catch (err) {
          console.error("[Bridge] Erro ao processar mensagem:", err);
        }
      });

      ws.on("close", (code, reason) => {
        if (authenticated && ws === this.bridgeSocket) {
          console.log(
            `[Bridge] Desconectado (code: ${code}, reason: ${reason})`
          );
          this.unregisterBridge();
        }
      });

      ws.on("error", (err) => {
        console.error("[Bridge] Erro WebSocket:", err.message);
      });
    });

    console.log("[Bridge] WebSocket Server iniciado em /ws/bridge");
  }

  private validateToken(token: string): boolean {
    // Usa JWT_SECRET como token de autenticação do bridge
    // Em produção, pode ser um token dedicado via env
    const validToken = process.env.BRIDGE_TOKEN || ENV.cookieSecret || "z190-bridge-default";
    return token === validToken;
  }

  private registerBridge(ws: WebSocket, version?: string) {
    // Se já existe um bridge conectado, desconecta o anterior
    if (this.bridgeSocket && this.bridgeSocket.readyState === WebSocket.OPEN) {
      console.log("[Bridge] Substituindo bridge anterior");
      this.bridgeSocket.close(4000, "Replaced by new bridge");
    }
    this.bridgeSocket = ws;
    this.bridgeVersion = version || "";
    this.bridgeConnectedAt = Date.now();
    this.lastStatus = { connected: true };
  }

  private unregisterBridge() {
    this.bridgeSocket = null;
    this.bridgeVersion = "";
    this.bridgeConnectedAt = 0;
    this.lastStatus = { connected: false };
    this.lastStatusTimestamp = Date.now();

    // Rejeitar todos os comandos pendentes
    this.pendingCommands.forEach((pending, id) => {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Bridge desconectado"));
    });
    this.pendingCommands.clear();
  }

  private handleBridgeMessage(msg: any) {
    // Atualização de status da câmera
    if (msg.type === "status") {
      this.lastStatus = { ...msg.data, connected: true };
      this.lastStatusTimestamp = msg.timestamp || Date.now();
      return;
    }

    // Resposta a um comando
    if (msg.type === "response" && msg.id) {
      const pending = this.pendingCommands.get(msg.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingCommands.delete(msg.id);
        if (msg.success) {
          pending.resolve(msg.data);
        } else {
          pending.reject(new Error(msg.error || "Comando falhou"));
        }
      }
      return;
    }

    // Ping/pong para keep-alive
    if (msg.type === "pong") {
      return;
    }
  }

  /**
   * Envia um comando para o bridge e aguarda resposta
   */
  async sendCommand(
    action: string,
    params?: Record<string, any>,
    timeoutMs: number = 10000
  ): Promise<any> {
    if (
      !this.bridgeSocket ||
      this.bridgeSocket.readyState !== WebSocket.OPEN
    ) {
      throw new Error("Bridge não conectado");
    }

    const id = nanoid(12);
    const command: BridgeCommand = { id, type: "command", action, params };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(id);
        reject(new Error(`Timeout ao executar comando: ${action}`));
      }, timeoutMs);

      this.pendingCommands.set(id, { resolve, reject, timeout });
      this.bridgeSocket!.send(JSON.stringify(command));
    });
  }

  /**
   * Retorna o status atual da câmera (último recebido do bridge)
   */
  getStatus(): CameraFullStatus & { bridgeConnected: boolean; lastUpdate: number; bridgeVersion: string } {
    return {
      ...this.lastStatus,
      bridgeConnected: this.isBridgeConnected(),
      lastUpdate: this.lastStatusTimestamp,
      bridgeVersion: this.bridgeVersion,
    };
  }

  /**
   * Verifica se o bridge está conectado
   */
  isBridgeConnected(): boolean {
    return (
      this.bridgeSocket !== null &&
      this.bridgeSocket.readyState === WebSocket.OPEN
    );
  }

  /**
   * Informações do bridge
   */
  getBridgeInfo() {
    return {
      connected: this.isBridgeConnected(),
      version: this.bridgeVersion,
      connectedAt: this.bridgeConnectedAt,
      uptime: this.bridgeConnectedAt
        ? Date.now() - this.bridgeConnectedAt
        : 0,
      pendingCommands: this.pendingCommands.size,
    };
  }
}

// Singleton
export const bridgeManager = new BridgeManager();
