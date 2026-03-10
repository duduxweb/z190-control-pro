import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Edit2 } from "lucide-react";
import { toast } from "sonner";

export default function Presets() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editingPreset, setEditingPreset] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "general",
  });

  // Queries
  const presetsQuery = trpc.presets.list.useQuery();

  // Mutations
  const createMut = trpc.presets.create.useMutation({
    onSuccess: () => {
      presetsQuery.refetch();
      setFormData({ name: "", description: "", category: "general" });
      setIsCreateOpen(false);
      toast.success("Preset criado com sucesso");
    },
    onError: () => {
      toast.error("Erro ao criar preset");
    },
  });

  const updateMut = trpc.presets.update.useMutation({
    onSuccess: () => {
      presetsQuery.refetch();
      setEditingPreset(null);
      setIsEditOpen(false);
      toast.success("Preset atualizado com sucesso");
    },
    onError: () => {
      toast.error("Erro ao atualizar preset");
    },
  });

  const deleteMut = trpc.presets.delete.useMutation({
    onSuccess: () => {
      presetsQuery.refetch();
      setDeleteId(null);
      toast.success("Preset deletado com sucesso");
    },
    onError: () => {
      toast.error("Erro ao deletar preset");
    },
  });

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error("Nome do preset é obrigatório");
      return;
    }
    await createMut.mutateAsync({
      name: formData.name,
      description: formData.description || undefined,
      category: formData.category,
      settings: {
        timestamp: Date.now(),
        // Aqui você adicionaria as configurações reais da câmera
      },
    });
  };

  const handleEdit = async () => {
    if (!editingPreset.name.trim()) {
      toast.error("Nome do preset é obrigatório");
      return;
    }
    await updateMut.mutateAsync({
      id: editingPreset.id,
      name: editingPreset.name,
      description: editingPreset.description || undefined,
      category: editingPreset.category,
      settings: editingPreset.settings,
    });
  };

  const handleDelete = async () => {
    if (deleteId) {
      await deleteMut.mutateAsync({ id: deleteId });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Presets</h1>
          <p className="text-muted-foreground mt-1">Gerenciar configurações salvas da câmera</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Novo Preset
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Novo Preset</DialogTitle>
              <DialogDescription>
                Salve as configurações atuais da câmera como um preset reutilizável
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Nome</label>
                <Input
                  placeholder="Ex: Estúdio Dia"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Descrição</label>
                <Textarea
                  placeholder="Descrição do preset..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Categoria</label>
                <Input
                  placeholder="Ex: Estúdio, Externo, etc"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={createMut.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={createMut.isPending}
                >
                  {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Criar Preset
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Presets Grid */}
      {presetsQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : presetsQuery.data?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">Nenhum preset criado ainda</p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Criar Primeiro Preset
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {presetsQuery.data?.map((preset) => (
            <Card key={preset.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{preset.name}</CardTitle>
                    <Badge className="mt-2">{preset.category}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                {preset.description && (
                  <p className="text-sm text-muted-foreground">{preset.description}</p>
                )}
              </CardContent>
              <div className="px-6 py-4 border-t flex gap-2">
                <Dialog open={isEditOpen && editingPreset?.id === preset.id} onOpenChange={setIsEditOpen}>
                  <DialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingPreset(preset)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  {editingPreset?.id === preset.id && (
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Editar Preset</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm font-medium">Nome</label>
                          <Input
                            value={editingPreset.name}
                            onChange={(e) =>
                              setEditingPreset({ ...editingPreset, name: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Descrição</label>
                          <Textarea
                            value={editingPreset.description || ""}
                            onChange={(e) =>
                              setEditingPreset({
                                ...editingPreset,
                                description: e.target.value,
                              })
                            }
                            rows={3}
                          />
                        </div>
                        <div className="flex gap-3 pt-4">
                          <Button
                            variant="outline"
                            onClick={() => setIsEditOpen(false)}
                            disabled={updateMut.isPending}
                          >
                            Cancelar
                          </Button>
                          <Button
                            onClick={handleEdit}
                            disabled={updateMut.isPending}
                          >
                            {updateMut.isPending && (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Salvar
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  )}
                </Dialog>
                <AlertDialog open={deleteId === preset.id} onOpenChange={(open) => !open && setDeleteId(null)}>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeleteId(preset.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Deletar Preset?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Tem certeza que deseja deletar o preset "{preset.name}"? Esta ação não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="flex gap-3">
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        disabled={deleteMut.isPending}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {deleteMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Deletar
                      </AlertDialogAction>
                    </div>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
