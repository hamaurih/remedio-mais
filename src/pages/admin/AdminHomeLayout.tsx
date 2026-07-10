import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Save, RotateCcw } from "lucide-react";

type Row = {
  id: string;
  section_key: string;
  label: string;
  position: number;
  enabled: boolean;
};

function SortableRow({ row, onToggle }: { row: Row; onToggle: (id: string, v: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm ${
        isDragging ? "opacity-60 ring-2 ring-primary" : ""
      }`}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
        aria-label="Arrastar"
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <div className="flex-1">
        <div className="font-medium">{row.label}</div>
        <div className="text-xs text-muted-foreground">{row.section_key}</div>
      </div>
      <Switch checked={row.enabled} onCheckedChange={(v) => onToggle(row.id, v)} />
      <span className="w-16 text-right text-xs text-muted-foreground">
        {row.enabled ? "Visível" : "Oculto"}
      </span>
    </div>
  );
}

export default function AdminHomeLayout() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("home_layout")
      .select("*")
      .order("position");
    if (error) toast.error("Erro ao carregar layout");
    setRows((data as Row[]) || []);
    setLoading(false);
    setDirty(false);
  };

  useEffect(() => {
    load();
  }, []);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    setRows(arrayMove(rows, oldIndex, newIndex));
    setDirty(true);
  };

  const onToggle = (id: string, v: boolean) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: v } : r)));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const updates = rows.map((r, idx) => ({
        id: r.id,
        section_key: r.section_key,
        label: r.label,
        position: (idx + 1) * 10,
        enabled: r.enabled,
      }));
      const { error } = await (supabase as any).from("home_layout").upsert(updates);
      if (error) throw error;
      toast.success("Layout salvo!");
      setDirty(false);
      load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container max-w-3xl py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Layout da Home</h1>
          <p className="text-sm text-muted-foreground">
            Arraste para reordenar. Use o botão para ocultar temporariamente uma seção.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={saving || loading}>
            <RotateCcw className="mr-2 h-4 w-4" /> Recarregar
          </Button>
          <Button onClick={save} disabled={!dirty || saving}>
            <Save className="mr-2 h-4 w-4" /> {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-muted-foreground">Carregando...</div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {rows.map((r) => (
                <SortableRow key={r.id} row={r} onToggle={onToggle} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {dirty && (
        <div className="fixed bottom-6 right-6 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg">
          Alterações não salvas
        </div>
      )}
    </div>
  );
}
