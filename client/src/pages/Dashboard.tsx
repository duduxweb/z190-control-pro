import { useEffect, useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Circle,
  Radio,
  Mic2,
  Camera,
  Aperture,
  Sun,
  Thermometer,
  Gauge,
  Timer,
  Filter,
  Wifi,
  WifiOff,
  Eye,
  ZoomIn,
  Focus,
} from "lucide-react";
import { toast } from "sonner";

// ─── Status Display Component ───────────────────────────────────

function StatusValue({
  label,
  value,
  icon: Icon,
  unit,
}: {
  label: string;
  value: string | number | null | undefined;
  icon?: any;
  unit?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2 text-muted-foreground">
        {Icon && <Icon className="h-4 w-4" />}
        <span className="text-sm">{label}</span>
      </div>
      <span className="text-sm font-semibold tabular-nums">
        {value !== null && value !== undefined ? (
          <>
            {value}
            {unit && (
              <span className="text-xs text-muted-foreground ml-1">
                {unit}
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>
    </div>
  );
}

export default function Dashboard() {
  const [isConnected, setIsConnected] = useState(false);

  // Queries - polling em tempo real
  const bridgeInfo = trpc.bridge.info.useQuery(undefined, {
    refetchInterval: 5000,
  });
  const cameraPing = trpc.camera.ping.useQuery(undefined, {
    refetchInterval: 5000,
  });
  const cameraStatus = trpc.camera.status.useQuery(undefined, {
    refetchInterval: 3000,
  });
  const recordingStatus = trpc.recording.status.useQuery(undefined, {
    refetchInterval: 1000,
  });

  const bridgeConnected = bridgeInfo.data?.connected ?? false;

  // Mutations
  const lensZoomMut = trpc.lens.setZoom.useMutation();
  const lensFocusModeMut = trpc.lens.setFocusMode.useMutation();
  const lensFocusPosMut = trpc.lens.setFocusPosition.useMutation();
  const lensIrisMut = trpc.lens.setIris.useMutation();
  const imageWBMut = trpc.image.setWhiteBalance.useMutation();
  const imageGainMut = trpc.image.setGain.useMutation();
  const imageShutterMut = trpc.image.setShutter.useMutation();
  const imageNDMut = trpc.image.setNDFilter.useMutation();
  const recordStartMut = trpc.recording.start.useMutation();
  const recordStopMut = trpc.recording.stop.useMutation();
  const audioLevelMut = trpc.audio.setLevel.useMutation();

  useEffect(() => {
    setIsConnected(cameraPing.data?.reachable ?? false);
  }, [cameraPing.data]);

  const statusData = cameraStatus.data;
  const isRecording = recordingStatus.data?.recording ?? false;

  const handleZoomChange = async (value: number[]) => {
    try {
      await lensZoomMut.mutateAsync({ position: value[0] });
    } catch {
      toast.error("Falha ao ajustar zoom");
    }
  };

  const handleFocusChange = async (value: number[]) => {
    try {
      await lensFocusPosMut.mutateAsync({ position: value[0] });
    } catch {
      toast.error("Falha ao ajustar foco");
    }
  };

  const handleIrisChange = async (value: number[]) => {
    try {
      await lensIrisMut.mutateAsync({ position: value[0] });
    } catch {
      toast.error("Falha ao ajustar íris");
    }
  };

  const handleGainChange = async (value: number[]) => {
    try {
      await imageGainMut.mutateAsync({ value: value[0] });
    } catch {
      toast.error("Falha ao ajustar ganho");
    }
  };

  const handleRecordStart = async () => {
    try {
      await recordStartMut.mutateAsync();
      toast.success("Gravação iniciada");
    } catch {
      toast.error("Falha ao iniciar gravação");
    }
  };

  const handleRecordStop = async () => {
    try {
      await recordStopMut.mutateAsync();
      toast.success("Gravação parada");
    } catch {
      toast.error("Falha ao parar gravação");
    }
  };

  const handleAudioLevel = async (channel: number, level: number) => {
    try {
      await audioLevelMut.mutateAsync({ channel, level });
    } catch {
      toast.error(`Falha ao ajustar áudio canal ${channel}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── Header com Status ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Sony Z190 Control
          </h1>
          <p className="text-muted-foreground mt-1">
            Controle remoto profissional da câmera
          </p>
        </div>
          <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {bridgeConnected ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-500" />
            )}
            <Badge variant={bridgeConnected ? "default" : "destructive"}>
              {bridgeConnected
                ? isConnected
                  ? "Bridge + Câmera"
                  : "Bridge OK"
                : "Bridge Offline"}
            </Badge>
          </div>
          {isRecording && (
            <Badge variant="destructive" className="animate-pulse gap-1.5">
              <Circle className="h-2 w-2 fill-current" />
              REC
            </Badge>
          )}
          {cameraPing.isLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      {/* ─── Status Cards (Valores Atuais da Câmera) ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* White Balance */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Thermometer className="h-4 w-4 text-blue-400" />
              Balanço de Branco
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              <StatusValue
                label="Modo"
                value={statusData?.whiteBalance?.mode}
              />
              <StatusValue
                label="Kelvin"
                value={statusData?.whiteBalance?.colorTemperature}
                unit="K"
              />
            </div>
          </CardContent>
        </Card>

        {/* Exposure */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sun className="h-4 w-4 text-yellow-400" />
              Exposição
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              <StatusValue
                label="Íris"
                value={statusData?.exposure?.iris}
              />
              <StatusValue
                label="Ganho"
                value={statusData?.exposure?.gain}
                unit="dB"
              />
              <StatusValue
                label="Shutter"
                value={statusData?.exposure?.shutter}
              />
            </div>
          </CardContent>
        </Card>

        {/* ND Filter */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Filter className="h-4 w-4 text-purple-400" />
              Filtro ND
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              <StatusValue
                label="Posição"
                value={statusData?.ndFilter?.position}
              />
              <StatusValue
                label="Modo"
                value={statusData?.ndFilter?.mode || "—"}
              />
            </div>
          </CardContent>
        </Card>

        {/* Recording / System */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Camera className="h-4 w-4 text-red-400" />
              Gravação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              <StatusValue
                label="Status"
                value={isRecording ? "Gravando" : "Parado"}
              />
              <StatusValue
                label="Modelo"
                value={statusData?.system?.model || "PXW-Z190"}
              />
              <StatusValue
                label="Firmware"
                value={statusData?.system?.firmware}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Tabs de Controle ─── */}
      <Tabs defaultValue="lens" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="lens" className="gap-1.5">
            <ZoomIn className="h-3.5 w-3.5" />
            Lente
          </TabsTrigger>
          <TabsTrigger value="image" className="gap-1.5">
            <Sun className="h-3.5 w-3.5" />
            Imagem
          </TabsTrigger>
          <TabsTrigger value="recording" className="gap-1.5">
            <Radio className="h-3.5 w-3.5" />
            Gravação
          </TabsTrigger>
          <TabsTrigger value="audio" className="gap-1.5">
            <Mic2 className="h-3.5 w-3.5" />
            Áudio
          </TabsTrigger>
        </TabsList>

        {/* ─── Lens Controls ─── */}
        <TabsContent value="lens" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Zoom */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ZoomIn className="h-5 w-5" />
                  Zoom
                </CardTitle>
                <CardDescription>Controle de zoom óptico</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Wide</span>
                    <span className="text-muted-foreground">Tele</span>
                  </div>
                  <Slider
                    min={0}
                    max={16384}
                    step={100}
                    defaultValue={[8192]}
                    onValueChange={handleZoomChange}
                    disabled={lensZoomMut.isPending}
                    className="w-full"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => lensZoomMut.mutateAsync({ position: 0 })}
                  >
                    Wide
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() =>
                      lensZoomMut.mutateAsync({ position: 16384 })
                    }
                  >
                    Tele
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Focus */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Focus className="h-5 w-5" />
                  Foco
                </CardTitle>
                <CardDescription>
                  Controle de foco manual e automático
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() =>
                      lensFocusModeMut.mutateAsync({ mode: "auto" })
                    }
                  >
                    Auto
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() =>
                      lensFocusModeMut.mutateAsync({ mode: "manual" })
                    }
                  >
                    Manual
                  </Button>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Perto</span>
                    <span className="text-muted-foreground">Longe</span>
                  </div>
                  <Slider
                    min={0}
                    max={16384}
                    step={100}
                    defaultValue={[8192]}
                    onValueChange={handleFocusChange}
                    disabled={lensFocusPosMut.isPending}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Iris */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Aperture className="h-5 w-5" />
                  Íris
                </CardTitle>
                <CardDescription>Controle de abertura</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Fechada</span>
                    <span className="text-muted-foreground">Aberta</span>
                  </div>
                  <Slider
                    min={0}
                    max={255}
                    step={5}
                    defaultValue={[128]}
                    onValueChange={handleIrisChange}
                    disabled={lensIrisMut.isPending}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Image Controls ─── */}
        <TabsContent value="image" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* White Balance */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Thermometer className="h-5 w-5" />
                  Balanço de Branco
                </CardTitle>
                <CardDescription>Presets e ajuste manual</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select
                  onValueChange={(value) =>
                    imageWBMut.mutateAsync({ mode: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione preset" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automático</SelectItem>
                    <SelectItem value="daylight">Luz do dia</SelectItem>
                    <SelectItem value="cloudy">Nublado</SelectItem>
                    <SelectItem value="tungsten">Tungstênio</SelectItem>
                    <SelectItem value="fluorescent">Fluorescente</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Gain */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Gauge className="h-5 w-5" />
                  Ganho
                </CardTitle>
                <CardDescription>Sensibilidade do sensor</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">-6 dB</span>
                    <span className="text-muted-foreground">33 dB</span>
                  </div>
                  <Slider
                    min={-6}
                    max={33}
                    step={1}
                    defaultValue={[0]}
                    onValueChange={handleGainChange}
                    disabled={imageGainMut.isPending}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Shutter Speed */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Timer className="h-5 w-5" />
                  Velocidade do Obturador
                </CardTitle>
                <CardDescription>Controle de exposição</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select
                  onValueChange={(value) =>
                    imageShutterMut.mutateAsync({ value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione velocidade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1/24">1/24</SelectItem>
                    <SelectItem value="1/30">1/30</SelectItem>
                    <SelectItem value="1/50">1/50</SelectItem>
                    <SelectItem value="1/60">1/60</SelectItem>
                    <SelectItem value="1/100">1/100</SelectItem>
                    <SelectItem value="1/120">1/120</SelectItem>
                    <SelectItem value="1/250">1/250</SelectItem>
                    <SelectItem value="1/500">1/500</SelectItem>
                    <SelectItem value="1/1000">1/1000</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* ND Filter */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Filtro ND
                </CardTitle>
                <CardDescription>Densidade neutra</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select
                  onValueChange={(value) =>
                    imageNDMut.mutateAsync({ position: parseInt(value) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione filtro" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Desligado</SelectItem>
                    <SelectItem value="1">ND 1/4</SelectItem>
                    <SelectItem value="2">ND 1/16</SelectItem>
                    <SelectItem value="3">ND 1/64</SelectItem>
                    <SelectItem value="4">ND 1/128</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Recording Controls ─── */}
        <TabsContent value="recording" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Radio className="h-5 w-5" />
                Controle de Gravação
              </CardTitle>
              <CardDescription>
                Iniciar e parar gravação de vídeo
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-4 w-4 rounded-full ${
                        isRecording
                          ? "bg-red-500 animate-pulse shadow-lg shadow-red-500/50"
                          : "bg-muted-foreground/30"
                      }`}
                    />
                    <div>
                      <p className="font-semibold text-lg">
                        {isRecording ? "Gravando" : "Parado"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {recordingStatus.data?.status || "Status desconhecido"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  size="lg"
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  onClick={handleRecordStart}
                  disabled={
                    recordStartMut.isPending || isRecording
                  }
                >
                  {recordStartMut.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Circle className="mr-2 h-4 w-4 fill-current" />
                  )}
                  Iniciar Gravação
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="flex-1"
                  onClick={handleRecordStop}
                  disabled={
                    recordStopMut.isPending || !isRecording
                  }
                >
                  {recordStopMut.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Parar Gravação
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Audio Controls ─── */}
        <TabsContent value="audio" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[1, 2].map((channel) => (
              <Card key={channel}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Mic2 className="h-5 w-5" />
                    Canal {channel}
                  </CardTitle>
                  <CardDescription>
                    Nível de entrada de áudio
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">0</span>
                      <span className="text-muted-foreground">100</span>
                    </div>
                    <Slider
                      min={0}
                      max={100}
                      step={1}
                      defaultValue={[50]}
                      onValueChange={(value) =>
                        handleAudioLevel(channel, value[0])
                      }
                      disabled={audioLevelMut.isPending}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleAudioLevel(channel, 0)}
                    >
                      Mudo
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleAudioLevel(channel, 100)}
                    >
                      Máximo
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
