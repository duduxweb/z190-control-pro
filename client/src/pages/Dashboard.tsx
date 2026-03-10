import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Circle, Radio, Mic2, Settings, Save } from "lucide-react";
import { toast } from "sonner";
import StatusMonitor from "@/components/StatusMonitor";

export default function Dashboard() {
  const [cameraStatus, setCameraStatus] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Queries
  const cameraPing = trpc.camera.ping.useQuery(undefined, { refetchInterval: 5000 });
  const cameraStatusQuery = trpc.camera.status.useQuery(undefined, { refetchInterval: 3000 });
  const recordingStatus = trpc.recording.status.useQuery(undefined, { refetchInterval: 1000 });

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
    if (cameraStatusQuery.data) {
      setCameraStatus(cameraStatusQuery.data);
    }
  }, [cameraStatusQuery.data]);

  useEffect(() => {
    setIsConnected(cameraPing.data?.reachable ?? false);
  }, [cameraPing.data]);

  const handleZoomChange = async (value: number[]) => {
    try {
      await lensZoomMut.mutateAsync({ position: value[0] });
    } catch (err) {
      toast.error("Falha ao ajustar zoom");
    }
  };

  const handleFocusChange = async (value: number[]) => {
    try {
      await lensFocusPosMut.mutateAsync({ position: value[0] });
    } catch (err) {
      toast.error("Falha ao ajustar foco");
    }
  };

  const handleIrisChange = async (value: number[]) => {
    try {
      await lensIrisMut.mutateAsync({ position: value[0] });
    } catch (err) {
      toast.error("Falha ao ajustar íris");
    }
  };

  const handleGainChange = async (value: number[]) => {
    try {
      await imageGainMut.mutateAsync({ value: value[0] });
    } catch (err) {
      toast.error("Falha ao ajustar ganho");
    }
  };

  const handleRecordStart = async () => {
    try {
      await recordStartMut.mutateAsync();
      toast.success("Gravação iniciada");
    } catch (err) {
      toast.error("Falha ao iniciar gravação");
    }
  };

  const handleRecordStop = async () => {
    try {
      await recordStopMut.mutateAsync();
      toast.success("Gravação parada");
    } catch (err) {
      toast.error("Falha ao parar gravação");
    }
  };

  const handleAudioLevel = async (channel: number, level: number) => {
    try {
      await audioLevelMut.mutateAsync({ channel, level });
    } catch (err) {
      toast.error(`Falha ao ajustar áudio canal ${channel}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Status Monitor */}
      <StatusMonitor />

      {/* Header com Status */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sony Z190 Control</h1>
          <p className="text-muted-foreground mt-1">Controle remoto profissional da câmera</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Circle
              className={`h-3 w-3 ${isConnected ? "fill-green-500 text-green-500" : "fill-red-500 text-red-500"}`}
            />
            <span className="text-sm font-medium">
              {isConnected ? "Conectado" : "Desconectado"}
            </span>
          </div>
          {cameraPing.isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        </div>
      </div>

      {/* Tabs Principais */}
      <Tabs defaultValue="lens" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="lens">Lente</TabsTrigger>
          <TabsTrigger value="image">Imagem</TabsTrigger>
          <TabsTrigger value="recording">Gravação</TabsTrigger>
          <TabsTrigger value="audio">Áudio</TabsTrigger>
        </TabsList>

        {/* ─── Lens Controls ─── */}
        <TabsContent value="lens" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Zoom */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Zoom</CardTitle>
                <CardDescription>Controle de zoom óptico</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Posição: 0 - 16384</label>
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
                    onClick={() => lensZoomMut.mutateAsync({ position: 0 })}
                  >
                    Wide
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => lensZoomMut.mutateAsync({ position: 16384 })}
                  >
                    Tele
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Focus */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Foco</CardTitle>
                <CardDescription>Controle de foco manual e automático</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Modo</label>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => lensFocusModeMut.mutateAsync({ mode: "auto" })}
                    >
                      Auto
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => lensFocusModeMut.mutateAsync({ mode: "manual" })}
                    >
                      Manual
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Posição: 0 - 16384</label>
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
                <CardTitle className="text-lg">Íris</CardTitle>
                <CardDescription>Controle de abertura</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Posição: 0 - 255</label>
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
                <CardTitle className="text-lg">Balanço de Branco</CardTitle>
                <CardDescription>Presets e ajuste manual</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select onValueChange={(value) => imageWBMut.mutateAsync({ mode: value })}>
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
                <CardTitle className="text-lg">Ganho</CardTitle>
                <CardDescription>Sensibilidade do sensor</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Valor: -6 a 33 dB</label>
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
                <CardTitle className="text-lg">Velocidade do Obturador</CardTitle>
                <CardDescription>Controle de exposição</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select
                  onValueChange={(value) => imageShutterMut.mutateAsync({ value })}
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
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* ND Filter */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Filtro ND</CardTitle>
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
                    <SelectItem value="1">ND1</SelectItem>
                    <SelectItem value="2">ND2</SelectItem>
                    <SelectItem value="3">ND3</SelectItem>
                    <SelectItem value="4">ND4</SelectItem>
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
              <CardTitle className="text-lg">Controle de Gravação</CardTitle>
              <CardDescription>Iniciar e parar gravação de vídeo</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <Radio
                      className={`h-6 w-6 ${
                        recordingStatus.data?.recording
                          ? "fill-red-500 text-red-500"
                          : "text-muted-foreground"
                      }`}
                    />
                    <div>
                      <p className="font-semibold">
                        {recordingStatus.data?.recording ? "Gravando" : "Parado"}
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
                  className="flex-1 bg-red-600 hover:bg-red-700"
                  onClick={handleRecordStart}
                  disabled={recordStartMut.isPending || recordingStatus.data?.recording}
                >
                  {recordStartMut.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Radio className="mr-2 h-4 w-4" />
                  )}
                  Iniciar Gravação
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="flex-1"
                  onClick={handleRecordStop}
                  disabled={recordStopMut.isPending || !recordingStatus.data?.recording}
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
                    <Mic2 className="h-4 w-4" />
                    Canal {channel}
                  </CardTitle>
                  <CardDescription>Nível de entrada de áudio</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Nível: 0 - 100</label>
                    <Slider
                      min={0}
                      max={100}
                      step={1}
                      defaultValue={[50]}
                      onValueChange={(value) => handleAudioLevel(channel, value[0])}
                      disabled={audioLevelMut.isPending}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAudioLevel(channel, 0)}
                    >
                      Mudo
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
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
