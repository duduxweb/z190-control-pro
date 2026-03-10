import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Save,
  Wifi,
  WifiOff,
  CheckCircle2,
  XCircle,
  Network,
  Shield,
  Cable,
  Copy,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const [showToken, setShowToken] = useState(false);

  // Bridge info
  const bridgeInfo = trpc.bridge.info.useQuery(undefined, {
    refetchInterval: 5000,
  });
  const bridgeStatus = trpc.bridge.status.useQuery(undefined, {
    refetchInterval: 3000,
  });
  const bridgeToken = trpc.bridge.token.useQuery(undefined, {
    enabled: showToken,
  });

  const isConnected = bridgeInfo.data?.connected ?? false;
  const uptime = bridgeInfo.data?.uptime ?? 0;

  const formatUptime = (ms: number) => {
    if (ms <= 0) return "—";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const copyToken = () => {
    if (bridgeToken.data?.token) {
      navigator.clipboard.writeText(bridgeToken.data.token);
      toast.success("Token copiado para a área de transferência");
    }
  };

  // Determine the WebSocket URL for the bridge
  const wsUrl =
    typeof window !== "undefined"
      ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/bridge`
      : "ws://localhost:3000/ws/bridge";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configuração</h1>
        <p className="text-muted-foreground mt-1">
          Configurar conexão Bridge com a câmera Sony Z190
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bridge Status */}
        <div className="lg:col-span-2 space-y-6">
          {/* Connection Status Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cable className="h-5 w-5" />
                Status do Bridge
              </CardTitle>
              <CardDescription>
                O Bridge é um agente local que roda na mesma rede da câmera e se
                conecta a este painel via WebSocket
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Status Indicator */}
              <div
                className={`flex items-center gap-4 p-4 rounded-lg border ${
                  isConnected
                    ? "bg-green-500/10 border-green-500/30"
                    : "bg-yellow-500/10 border-yellow-500/30"
                }`}
              >
                <div
                  className={`h-4 w-4 rounded-full ${
                    isConnected
                      ? "bg-green-500 shadow-lg shadow-green-500/50"
                      : "bg-yellow-500 animate-pulse"
                  }`}
                />
                <div className="flex-1">
                  <p
                    className={`font-semibold ${isConnected ? "text-green-400" : "text-yellow-400"}`}
                  >
                    {isConnected
                      ? "Bridge Conectado"
                      : "Aguardando conexão do Bridge..."}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isConnected
                      ? `Versão ${bridgeInfo.data?.version || "?"} | Uptime: ${formatUptime(uptime)}`
                      : "Inicie o bridge local na rede da câmera"}
                  </p>
                </div>
                {isConnected ? (
                  <Wifi className="h-6 w-6 text-green-500" />
                ) : (
                  <WifiOff className="h-6 w-6 text-yellow-500" />
                )}
              </div>

              {/* Camera Status from Bridge */}
              {isConnected && bridgeStatus.data && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">
                      Câmera
                    </span>
                    <p className="text-sm font-medium">
                      {bridgeStatus.data.connected
                        ? "Conectada"
                        : "Desconectada"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">
                      Modelo
                    </span>
                    <p className="text-sm font-medium">
                      {bridgeStatus.data.system?.model || "PXW-Z190"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">
                      Firmware
                    </span>
                    <p className="text-sm font-medium">
                      {bridgeStatus.data.system?.firmware || "—"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">
                      Comandos pendentes
                    </span>
                    <p className="text-sm font-medium">
                      {bridgeInfo.data?.pendingCommands ?? 0}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Setup Instructions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                Como Instalar o Bridge
              </CardTitle>
              <CardDescription>
                Siga estes passos para configurar o bridge na rede local da
                câmera
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Step 1 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="h-6 w-6 p-0 justify-center text-xs">
                    1
                  </Badge>
                  <span className="font-medium text-sm">
                    Clone o repositório no computador da rede local
                  </span>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs overflow-x-auto">
                  <code>git clone https://github.com/duduxweb/z190-control-pro.git</code>
                  <br />
                  <code>cd z190-control-pro/bridge</code>
                  <br />
                  <code>npm install</code>
                </div>
              </div>

              {/* Step 2 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="h-6 w-6 p-0 justify-center text-xs">
                    2
                  </Badge>
                  <span className="font-medium text-sm">
                    Configure as variáveis de ambiente
                  </span>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs overflow-x-auto">
                  <code>
                    # Crie o arquivo .env no diretório bridge/
                  </code>
                  <br />
                  <code>CAMERA_IP=192.168.100.41</code>
                  <br />
                  <code>CAMERA_USER=admin</code>
                  <br />
                  <code>CAMERA_PASSWORD=SuaSenha</code>
                  <br />
                  <code>BRIDGE_SERVER_URL={wsUrl}</code>
                  <br />
                  <code>BRIDGE_TOKEN=</code>
                  <span className="text-muted-foreground">
                    (veja token abaixo)
                  </span>
                </div>
              </div>

              {/* Step 3 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="h-6 w-6 p-0 justify-center text-xs">
                    3
                  </Badge>
                  <span className="font-medium text-sm">
                    Inicie o bridge
                  </span>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs">
                  <code>node bridge.mjs</code>
                </div>
              </div>

              {/* Token Section */}
              <div className="border-t pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    Token de Autenticação
                  </span>
                </div>
                {showToken && bridgeToken.data ? (
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={bridgeToken.data.token}
                      className="font-mono text-xs"
                    />
                    <Button size="icon" variant="outline" onClick={copyToken}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowToken(true)}
                  >
                    Mostrar Token
                  </Button>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Use este token no arquivo .env do bridge para autenticação
                  segura.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Arquitetura
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Diagram */}
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2 p-2 rounded bg-blue-500/10 border border-blue-500/20">
                    <div className="h-2 w-2 rounded-full bg-blue-500" />
                    <span className="text-blue-400 font-medium">
                      Painel Web (Nuvem)
                    </span>
                  </div>
                  <div className="flex justify-center">
                    <span className="text-muted-foreground">↕ WebSocket</span>
                  </div>
                  <div
                    className={`flex items-center gap-2 p-2 rounded border ${isConnected ? "bg-green-500/10 border-green-500/20" : "bg-muted/50 border-border"}`}
                  >
                    <div
                      className={`h-2 w-2 rounded-full ${isConnected ? "bg-green-500" : "bg-muted-foreground"}`}
                    />
                    <span
                      className={`font-medium ${isConnected ? "text-green-400" : "text-muted-foreground"}`}
                    >
                      Bridge Local
                    </span>
                  </div>
                  <div className="flex justify-center">
                    <span className="text-muted-foreground">↕ HTTP/CGI</span>
                  </div>
                  <div
                    className={`flex items-center gap-2 p-2 rounded border ${isConnected && bridgeStatus.data?.connected ? "bg-red-500/10 border-red-500/20" : "bg-muted/50 border-border"}`}
                  >
                    <div
                      className={`h-2 w-2 rounded-full ${isConnected && bridgeStatus.data?.connected ? "bg-red-500" : "bg-muted-foreground"}`}
                    />
                    <span
                      className={`font-medium ${isConnected && bridgeStatus.data?.connected ? "text-red-400" : "text-muted-foreground"}`}
                    >
                      Sony PXW-Z190
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Atualização Automática
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  O bridge pode ser atualizado automaticamente via GitHub. Na
                  máquina local, configure um cron job:
                </p>
                <div className="bg-muted/50 rounded p-2 font-mono text-xs">
                  <code>cd /path/to/bridge && git pull</code>
                </div>
                <p>
                  Ou use o script de auto-update incluso no diretório do bridge.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
