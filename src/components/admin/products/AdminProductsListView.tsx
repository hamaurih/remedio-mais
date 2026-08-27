import { Search, Edit, Trash2, Power, AlertTriangle, Zap } from "lucide-react";
import { productAvailabilityStatus } from "@/lib/availability";
import { formatBRL } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type AdminProductsListViewProps = {
  search: string;
  onSearchChange: (value: string) => void;
  catFilter: string;
  onCatFilterChange: (value: string) => void;
  manuFilter: string;
  onManuFilterChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  cats?: any[];
  manufacturers: string[];
  pageRows: any[];
  trierAdjust: Record<string, any>;
  page: number;
  pageSize: number;
  effTotal: number;
  effTotalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onToggleForceActive: (product: any) => void;
  onToggleActive: (product: any) => void;
  onEdit: (product: any) => void;
  onRemove: (id: string) => void;
};

export function AdminProductsListView({
  search,
  onSearchChange,
  catFilter,
  onCatFilterChange,
  manuFilter,
  onManuFilterChange,
  statusFilter,
  onStatusFilterChange,
  cats,
  manufacturers,
  pageRows,
  trierAdjust,
  page,
  pageSize,
  effTotal,
  effTotalPages,
  onPageChange,
  onPageSizeChange,
  onToggleForceActive,
  onToggleActive,
  onEdit,
  onRemove,
}: AdminProductsListViewProps) {
  return (
    <>
      <div className="bg-card border rounded-xl p-3 mb-4 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-2 top-3 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar por nome..." value={search} onChange={(e) => onSearchChange(e.target.value)} />
        </div>
        <Select value={catFilter} onValueChange={onCatFilterChange}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {cats?.map((category: any) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={manuFilter} onValueChange={onManuFilterChange}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Fabricante" /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">Todos fabricantes</SelectItem>
            {manufacturers.map((manufacturer) => <SelectItem key={manufacturer} value={manufacturer}>{manufacturer}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={onStatusFilterChange}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
            <SelectItem value="sale">Em oferta</SelectItem>
            <SelectItem value="low">Estoque baixo</SelectItem>
            <SelectItem value="negative_stock">Estoque negativo (&lt; 0)</SelectItem>
            <SelectItem value="stock_inactive">Stock&gt;0 mas inativos</SelectItem>
            <SelectItem value="no_barcode_stock">Sem EAN + stock&gt;0</SelectItem>
            <SelectItem value="no_image_stock">Sem imagem + stock&gt;0</SelectItem>
            <SelectItem value="readjusted">Reajuste do Trier (7d)</SelectItem>
            <SelectItem value="readjusted_up">Reajuste ▲ (aumentou)</SelectItem>
            <SelectItem value="readjusted_down">Reajuste ▼ (baixou)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border rounded-xl shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left">
            <tr>
              <th className="p-3">Foto</th><th className="p-3">Nome</th><th className="p-3">Categoria</th>
              <th className="p-3">Fabricante</th><th className="p-3">Preço</th><th className="p-3">Promo</th>
              <th className="p-3">Estoque</th><th className="p-3">Vitrines</th><th className="p-3">Status</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((product: any) => {
              const low = product.stock <= (product.minimum_stock ?? 5);
              const onSale = product.on_sale || product.promo_price;
              const adjustment = trierAdjust[product.id];
              const adjustmentDiff = adjustment ? Number(adjustment.new_price ?? 0) - Number(adjustment.old_price ?? 0) : 0;
              const adjustmentPct = adjustment && Number(adjustment.old_price ?? 0) > 0
                ? (adjustmentDiff / Number(adjustment.old_price)) * 100
                : 0;
              const availability = productAvailabilityStatus(product);

              return (
                <tr key={product.id} className={`border-t hover:bg-secondary/40 ${adjustment ? "bg-amber-50/60 dark:bg-amber-500/5" : ""}`}>
                  <td className="p-2">{product.image_url ? <img src={product.image_url} alt="" loading="lazy" decoding="async" className="w-10 h-10 object-contain rounded border" /> : <div className="w-10 h-10 bg-secondary rounded" />}</td>
                  <td className="p-3 font-medium max-w-[220px]">
                    {product.name}
                    {adjustment && (
                      <span
                        title={`Reajuste do Trier em ${new Date(adjustment.changed_at).toLocaleString("pt-BR")}: ${formatBRL(adjustment.old_price)} → ${formatBRL(adjustment.new_price)}`}
                        className="ml-2 inline-flex items-center gap-1 rounded bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 align-middle"
                      >
                        REAJUSTE {adjustmentDiff > 0 ? "▲" : "▼"} {Math.abs(adjustmentPct).toFixed(0)}%
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">{product.categories?.name || "—"}</td>
                  <td className="p-3 text-muted-foreground">{product.manufacturer || "—"}</td>
                  <td className="p-3">{formatBRL(product.price)}</td>
                  <td className="p-3">{product.promo_price ? <span className="text-primary font-bold">{formatBRL(product.promo_price)}</span> : "—"}</td>
                  <td className={`p-3 font-semibold ${low ? "text-primary" : ""}`}>
                    {low && <AlertTriangle className="inline h-3 w-3 mr-1" />}{product.stock}
                  </td>
                  <td className="p-3 text-xs">{(product.shelves || []).length} {onSale && <span className="ml-1 bg-primary text-primary-foreground px-1.5 py-0.5 rounded text-[10px]">OFERTA</span>}</td>
                  <td className="p-3">
                    {availability.available
                      ? <span className="text-whatsapp text-xs font-semibold">Disponível</span>
                      : <span className="text-muted-foreground text-xs">{availability.label}</span>}
                    {product.force_active && <span className="block text-[10px] font-bold text-highlight-foreground bg-highlight rounded px-1 mt-1 w-fit">ATIVAÇÃO FORÇADA</span>}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {(product.trier_active === false || product.force_active) && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onToggleForceActive(product)}
                        title={product.force_active ? "Remover ativação forçada" : "Forçar ativação (ignorar inativo no Trier)"}
                      >
                        <Zap className={`h-4 w-4 ${product.force_active ? "text-highlight" : "text-amber-500"}`} />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => onToggleActive(product)} title={product.active ? "Desativar" : "Ativar"}><Power className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => onEdit(product)}><Edit className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => onRemove(product.id)}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              );
            })}
            {pageRows.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">Nenhum produto encontrado.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
        <div className="text-sm text-muted-foreground">
          {effTotal > 0 ? (
            <>Mostrando <strong>{(page - 1) * pageSize + 1}</strong>–<strong>{Math.min(page * pageSize, effTotal)}</strong> de <strong>{effTotal}</strong> produtos</>
          ) : "Sem resultados"}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Por página:</span>
          <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
            <SelectTrigger className="w-[90px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[25, 50, 100, 200].map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(1)}>«</Button>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>Anterior</Button>
          <span className="text-sm px-2">Página <strong>{page}</strong> de <strong>{effTotalPages}</strong></span>
          <Button variant="outline" size="sm" disabled={page >= effTotalPages} onClick={() => onPageChange(Math.min(effTotalPages, page + 1))}>Próxima</Button>
          <Button variant="outline" size="sm" disabled={page >= effTotalPages} onClick={() => onPageChange(effTotalPages)}>»</Button>
        </div>
      </div>
    </>
  );
}
