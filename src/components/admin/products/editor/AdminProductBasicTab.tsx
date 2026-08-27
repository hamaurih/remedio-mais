import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type AdminProductEditorValue = Record<string, any>;

type AdminProductBasicTabProps = {
  value: AdminProductEditorValue;
  categories?: any[];
  onChange: (next: AdminProductEditorValue) => void;
  slugify: (value: string) => string;
};

export function AdminProductBasicTab({ value, categories, onChange, slugify }: AdminProductBasicTabProps) {
  const patch = (changes: Record<string, any>) => onChange({ ...value, ...changes });

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2 space-y-1">
        <Label>Nome *</Label>
        <Input value={value.name || ""} onChange={(event) => patch({ name: event.target.value })} />
      </div>

      <div className="space-y-1">
        <Label>Slug (auto se vazio)</Label>
        <Input
          value={value.slug || ""}
          onChange={(event) => patch({ slug: event.target.value })}
          placeholder={value.name ? slugify(value.name) : ""}
        />
      </div>

      <div className="space-y-1">
        <Label>Categoria</Label>
        <Select value={value.category_id || ""} onValueChange={(categoryId) => patch({ category_id: categoryId })}>
          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {categories?.map((category: any) => (
              <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label>Fabricante / Laboratório</Label>
        <Input value={value.manufacturer || ""} onChange={(event) => patch({ manufacturer: event.target.value })} />
      </div>

      <div className="space-y-1">
        <Label>Princípio ativo</Label>
        <Input value={value.active_ingredient || ""} onChange={(event) => patch({ active_ingredient: event.target.value })} />
      </div>

      <div className="space-y-1">
        <Label>SKU</Label>
        <Input value={value.sku || ""} onChange={(event) => patch({ sku: event.target.value })} />
      </div>

      <div className="space-y-1">
        <Label>Código de barras</Label>
        <Input value={value.barcode || ""} onChange={(event) => patch({ barcode: event.target.value })} />
      </div>

      <div className="col-span-2 space-y-1">
        <Label>Descrição curta</Label>
        <Input
          value={value.short_description || ""}
          onChange={(event) => patch({ short_description: event.target.value })}
          placeholder="Aparece em destaques"
        />
      </div>

      <div className="col-span-2 space-y-1">
        <Label>Descrição completa</Label>
        <Textarea rows={4} value={value.description || ""} onChange={(event) => patch({ description: event.target.value })} />
      </div>
    </div>
  );
}
