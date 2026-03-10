import { useState, useEffect } from "react";
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
  Settings2,
  Network,
  Shield,
} from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const [form, setForm] = useState({
    ip: "192.168.100.41",
    user: "admin",
    password: "",
    port: 80,
  });
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  // Load current config
  const configQuery = trpc.config.get.useQuery();

  useEffect(() => {
    if (configQuery.data) {
      setForm({
        ip: configQuery.data.ip,
        user: configQuery.data.user,
        password: "",
        port: configQuery.data.port,
      });
    }
  }, [configQuery.data]);

  // Mutations
  const saveMut = trpc.config.save.useMutation({
    onSuccess: () => {
      configQuery.refetch();
      toast.success("Configuração salva com sucesso");
    },
    onError: () => {
      toast.error("Erro ao salvar configuração");
    },
  });

  const testMut = trpc.config.testConnection.useMutation({
    onSuccess: (result) => {
      setTestResult(result);
      setIsTesting(false);
      if (result.ok) {
        toast.success("Conexão com a câmera estabelecida!");
      } else {
        toast.error(result.message);
      }
    },
    onError: (err) => {
      setTestResult({ ok: false, message: err.message });
      setIsTesting(false);
      toast.error("Erro ao testar conexão");
    },
  });

  const handleSave = () => {
    saveMut.mutate({
      ip: form.ip,
      user: form.user,
      password: form.password || undefined,
      port: form.port,
    });
  };

  const handleTest = () => {
    if (!form.ip || !form.user) {
      toast.error("Preencha IP e usuário");
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    const passwordToTest =
      form.password || (configQuery.data?.hasPassword ? "use-saved" : "");
    testMut.mutate({
      ip: form.ip,
      user: form.user,
      password: passwordToTest,
      port: form.port,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configuração</h1>
        <p className="text-muted-foreground mt-1">
          Configurar conexão com a câmera Sony Z190
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Connection Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5" />
                Conexão da Câmera
              </CardTitle>
              <CardDescription>
                Configure o endereço IP e credenciais de acesso à câmera na rede
                local
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* IP Address */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Endereço IP
                </label>
                <Input
                  placeholder="192.168.100.41"
                  value={form.ip}
                  onChange={(e) => setForm({ ...form, ip: e.target.value })}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Endereço IP da câmera na rede local
                </p>
              </div>

              {/* Port */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Porta
                </label>
                <Input
                  type="number"
                  placeholder="80"
                  value={form.port}
                  onChange={(e) =>
                    setForm({ ...form, port: parseInt(e.target.value) || 80 })
                  }
                  className="font-mono w-32"
                />
                <p className="text-xs text-muted-foreground">
                  Porta HTTP da câmera (padrão: 80)
                </p>
              </div>

              {/* Credentials */}
              <div className="border-t pt-5">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Credenciais</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Usuário
                    </label>
                    <Input
                      placeholder="admin"
                      value={form.user}
                      onChange={(e) =>
                        setForm({ ...form, user: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Senha
                    </label>
                    <Input
                      type="password"
                      placeholder={
                        configQuery.data?.hasPassword
                          ? "••••••••  (salva)"
                          : "Digite a senha"
                      }
                      value={form.password}
                      onChange={(e) =>
                        setForm({ ...form, password: e.target.value })
                      }
                    />
                    {configQuery.data?.hasPassword && !form.password && (
                      <p className="text-xs text-muted-foreground">
                        Senha já configurada. Deixe em branco para manter a
                        atual.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-4 border-t">
                <Button
                  onClick={handleTest}
                  variant="outline"
                  disabled={isTesting || !form.ip}
                >
                  {isTesting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Wifi className="mr-2 h-4 w-4" />
                  )}
                  Testar Conexão
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saveMut.isPending || !form.ip || !form.user}
                >
                  {saveMut.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Salvar Configuração
                </Button>
              </div>

              {/* Test Result */}
              {testResult && (
                <div
                  className={`flex items-center gap-3 p-4 rounded-lg border ${
                    testResult.ok
                      ? "bg-green-500/10 border-green-500/30 text-green-400"
                      : "bg-red-500/10 border-red-500/30 text-red-400"
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0" />
                  ) : (
                    <XCircle className="h-5 w-5 shrink-0" />
                  )}
                  <span className="text-sm font-medium">
                    {testResult.message}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Status Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Status Atual
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">IP</span>
                  <span className="text-sm font-mono font-medium">
                    {configQuery.data?.ip || "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Porta</span>
                  <span className="text-sm font-mono font-medium">
                    {configQuery.data?.port || "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Usuário
                  </span>
                  <span className="text-sm font-medium">
                    {configQuery.data?.user || "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Senha</span>
                  <Badge
                    variant={
                      configQuery.data?.hasPassword ? "default" : "destructive"
                    }
                  >
                    {configQuery.data?.hasPassword
                      ? "Configurada"
                      : "Não definida"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Informações
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  A câmera Sony PXW-Z190 deve estar conectada na mesma rede
                  local que este servidor.
                </p>
                <p>
                  As credenciais padrão de fábrica são: usuário{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">
                    admin
                  </code>{" "}
                  e senha definida no menu da câmera.
                </p>
                <p>
                  Após salvar, a configuração é persistida em{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">
                    config.json
                  </code>{" "}
                  no servidor.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
