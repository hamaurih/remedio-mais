import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AdminProductsListView } from "@/components/admin/products/AdminProductsListView";
import { useAdminProductsList } from "@/hooks/admin/useAdminProductsList";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

export default function AdminProductsCanary() {
  const qc = useQueryClient();
  const { confirm: confirmAction, dialog: confirmDialog } = useConfirmDialog();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [manuFilter, setManuFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    setPage(1);
  }, [search, catFilter, manuFilter, statusFilter, pageSize]);

  const {
    cats,
    manufacturers,
    trierAdjust,
    pageRows,
    effTotal,
    effTotalPages,
  } = useAdminProductsList({
    search,
    catFilter,
    manuFilter,
    statusFilter,
    page,
    pageSize,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin_products"] });

  const toggleActive = async (product: any) => {
    const { error } = await supabase
      .from("products")
      .update({ active: !product.active })
      .eq("id", product.id);
    if (error) toast.error(error.message);
    else {
      toast.success(product.active ? "Desativado" : "Ativado");
      refresh();
    }
  };

  const toggleForceActive = async (product: any) => {
    const next = !product.force_active;
    const stock = Number(product.stock_quantity ?? product.stock ?? 0);
    const { error } = await supabase
      .from("products")
      .update({
        force_active: next,
        active: next ? stock > 0 && !product.manual_disabled && !product.archived_at : false,
      })
      .eq("id", product.id);
    if (error) toast.error(error.message);
    else {
      toast.success(next ? "Ativação forçada aplicada" : "Ativação forçada removida");
      refresh();
    }
  };

  const remove = async (id: string) => {
    const approved = await confirmAction({
      title: "Excluir produto definitivamente?",
      description: "O produto será removido do banco de dados. Esta ação é destrutiva e pode afetar vínculos, vitrines, campanhas e histórico operacional associado ao cadastro.",
      confirmLabel: "Excluir produto",
      destructive: true,
    });
    if (!approved) return;

    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Excluído");
      refresh();
    }
  };

  return (
    <div className="p-6">
      {confirmDialog}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-extrabold">Produtos — arquitetura modular</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Rota de validação da Etapa 6. A gestão oficial continua disponível em /admin/produtos.
          </p>
        </div>
        <Button asChild>
          <Link to="/admin/produtos"><Plus className="h-4 w-4 mr-2" />Abrir gestão completa</Link>
        </Button>
      </div>

      <AdminProductsListView
        search={search}
        onSearchChange={setSearch}
        catFilter={catFilter}
        onCatFilterChange={setCatFilter}
        manuFilter={manuFilter}
        onManuFilterChange={setManuFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        cats={cats}
        manufacturers={manufacturers}
        pageRows={pageRows}
        trierAdjust={trierAdjust}
        page={page}
        pageSize={pageSize}
        effTotal={effTotal}
        effTotalPages={effTotalPages}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onToggleForceActive={toggleForceActive}
        onToggleActive={toggleActive}
        onEdit={(product) => { window.location.href = `/admin/produtos?edit=${encodeURIComponent(product.id)}`; }}
        onRemove={remove}
      />
    </div>
  );
}
