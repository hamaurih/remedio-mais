import { AlertTriangle, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SHELVES = [
  { slug: "ofertas-da-semana", label: "Ofertas da Semana" },
  { slug: "mais-vendidos", label: "Mais Vendidos" },
  { slug: "medicamentos-populares", label: "Medicamentos Populares" },
  { slug: "higiene-e-beleza", label: "Higiene e Beleza" },
  { slug: "mamaes-e-bebes", label: "Mamães e Bebês" },
  { slug: "vitaminas-e-suplementos", label: "Vitaminas e Suplementos" },
  { slug: "primeiros-socorros", label: "Primeiros Socorros" },
];

const BADGES = ["oferta", "mais-vendido", "generico", "novo", "leve-mais"];

type Props = {
  editing: any;
  setEditing: React.Dispatch<React.SetStateAction<any>>;
};

export function AdminProductDisplayTab({ editing, setEditing }: Props) {
  const toggleShelf = (slug: string) => {
    const current: string[] = editing.shelves || [];
    setEditing({
      ...editing,
      shelves: current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug],
    });
  };

  return (
    <div className="space-y-3 pt-3">
      <div className="flex items-center gap-2">
        <Switch checked={!!editing.featured} onCheckedChange={(value) => setEditing({ ...editing, featured: value })} />
        <Label>Destaque na home</Label>
      </div>

      <div>
        <Label className="font-bold text-base">Exibição na Home</Label>
        <p className="text-xs text-muted-foreground mb-2">Marque em quais prateleiras este produto deve aparecer na home.</p>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {SHELVES.map((shelf) => (
            <label key={shelf.slug} className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded hover:bg-secondary border">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={(editing.shelves || []).includes(shelf.slug)}
                onChange={() => toggleShelf(shelf.slug)}
              />
              Mostrar em {shelf.label}
            </label>
          ))}
        </div>
        {(editing.shelves || []).includes("ofertas-da-semana") && !editing.promo_price && (
          <div className="mt-3 bg-primary/10 text-primary text-xs p-2 rounded flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Para aparecer em "Ofertas da Semana" com desconto, defina um preço promocional na aba Preço.
          </div>
        )}
      </div>

      <div className="space-y-1 pt-2 border-t">
        <Label>Selo do produto</Label>
        <Select
          value={editing.product_badge || "none"}
          onValueChange={(value) => setEditing({ ...editing, product_badge: value === "none" ? "" : value })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nenhum</SelectItem>
            {BADGES.map((badge) => <SelectItem key={badge} value={badge}>{badge}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1 pt-2 border-t">
        <Label className="flex items-center gap-2"><Star className="h-4 w-4 text-primary" /> Posição em "Mais Vendidos"</Label>
        <Input
          type="number"
          min="1"
          placeholder="Vazio = não aparece"
          value={editing.bestseller_rank ?? ""}
          onChange={(event) => setEditing({ ...editing, bestseller_rank: event.target.value ? Number(event.target.value) : null })}
        />
        <p className="text-[11px] text-muted-foreground">
          Menor número aparece primeiro. A ordenação visual continua sendo feita pela ferramenta específica de Mais Vendidos.
        </p>
      </div>
    </div>
  );
}
