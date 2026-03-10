import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Circle, Wifi, WifiOff, AlertCircle } from "lucide-react";

export default function StatusMonitor() {
  const [statusData, setStatusData] = useState<any>(null);

  // Queries
  const cameraPing = trpc.camera.ping.useQuery(undefined, { refetchInterval: 5000 });
  const cameraStatus = trpc.camera.status.useQuery(undefined, { refetchInterval: 3000 });
  const recordingStatus = trpc.recording.status.useQuery(undefined, { refetchInterval: 1000 });

  useEffect(() => {
    if (cameraStatus.data) {
      setStatusData(cameraStatus.data);
    }
  }, [cameraStatus.data]);

  const isConnected = cameraPing.data?.reachable ?? false;
  const isRecording = recordingStatus.data?.recording ?? false;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Connection Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Conexão</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            {isConnected ? (
              <>
                <Wifi className="h-5 w-5 text-green-500" />
                <div>
                  <p className="font-semibold text-green-600">Conectado</p>
                  <p className="text-xs text-muted-foreground">Câmera acessível</p>
                </div>
              </>
            ) : (
              <>
                <WifiOff className="h-5 w-5 text-red-500" />
                <div>
                  <p className="font-semibold text-red-600">Desconectado</p>
                  <p className="text-xs text-muted-foreground">Verifique a rede</p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recording Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Gravação</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Circle
              className={`h-5 w-5 ${isRecording ? "fill-red-500 text-red-500 animate-pulse" : "text-muted-foreground"}`}
            />
            <div>
              <p className={`font-semibold ${isRecording ? "text-red-600" : "text-muted-foreground"}`}>
                {isRecording ? "Gravando" : "Parado"}
              </p>
              <p className="text-xs text-muted-foreground">
                {recordingStatus.data?.status || "Status desconhecido"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Sistema</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {statusData?.system?.connected ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Modelo:</span>
                  <span className="font-medium">Sony Z190</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant="outline">Ativo</Badge>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-amber-600">
                <AlertCircle className="h-4 w-4" />
                <span>Informações indisponíveis</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
