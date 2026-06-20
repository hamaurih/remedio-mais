import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const sb = supabase as any;

interface Props {
  productId: string | null;
}

export function CommercialClassificationTab({ productId }: Props) {
  const qc = useQueryClient();
  const [departmentId, setDepartmentId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [subcategoryId, setSubcategoryId] = useState<string>("");
  const [tags, setTags] = useState<string>("");
  const [showInMenu, setShowInMenu] = useState(true);
  const [showInFilters, setShowInFilters] = useState(true);

  const { data: depts = [] } = useQuery({
    queryKey: ["cc_depts"],
    queryFn: async () => (await sb.from("departments").select("id,name").order("position")).data || [],
  });
  const { data: cats = [] } = useQuery({
    queryKey: ["cc_cats", departmentId],
    queryFn: async () => {
      let q = sb.from("categories").select("id,name,department_id").order("name");
      if (departmentId) q = q.eq("department_id", departmentId);
      return (await q).data || [];
    },
  });
  const { data: subs = [] } = useQuery({
    queryKey: ["cc_subs", categoryId],
    queryFn: async () => {
      if (!categoryId) return [];
      return (await sb.from("subcategories").select("id,name").eq("category_id", categoryId).order("position")).data || [];
    },
    enabled: !!categoryId,
  });

  const { data: existing } = useQuery({
    queryKey: ["cc_existing", productId],
    queryFn: async () => {
      if (!productId) return null;
      const { data } = await sb.from("product_taxonomy").select("*").eq("product_id", productId).eq("is_primary", true).maybeSingle();
      return data;
    },
    enabled: !!productId,
  });

  const { data: productMeta } = useQuery({
    queryKey: ["cc_pmeta", productId],
    queryFn: async () => {
      if (!productId) return null;
      const { data } = await sb.from("products")
        .select("category_name,group_name,department_name,manual_category,commercial_tags,show_in_menu,show_in_filters")
        .eq("id", productId).maybeSingle();
      return data;
    },
    enabled: !!productId,
  });

  useEffect(() => {
    if (existing) {
      setDepartmentId(existing.department_id || "");
      setCategoryId(existing.category_id || "");
      setSubcategoryId(existing.subcategory_id || "");
    }
  }, [existing]);

  useEffect(() => {
    if (productMeta) {
      if (productMeta.commercial_tags) setTags(Array.isArray(productMeta.commercial_tags) ? productMeta.commercial_tags.join(", ") : "");
      if (typeof productMeta.show_in_menu === "boolean") setShowInMenu(productMeta.show_in_menu);
      if (typeof productMeta.show_in_filters === "boolean") setShowInFilters(productMeta.show_in_filters);
    }
  }, [productMeta]);

  const save = async () => {
    if (!productId) return toast.error("Salve o produto primeiro");
    try {
      // Upsert primary taxonomy row
      if (existing?.id) {
        const { error } = await sb.from("product_taxonomy").update({
          department_id: departmentId || null,
          category_id: categoryId || null,
          subcategory_id: subcategoryId || null,
          is_manual: true,
          source: "manual",
        }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("product_taxonomy").insert({
          product_id: productId,
          department_id: departmentId || null,
          category_id: categoryId || null,
          subcategory_id: subcategoryId || null,
          is_primary: true,
          is_manual: true,
          source: "manual",
        });
        if (error) throw error;
      }

      // Optional product flags (only if columns exist — silent if not)
      const tagsArr = tags.split(",").map((t) => t.trim()).filter(Boolean);
      const patch: any = {};
      // try the new fields; ignore failure silently
      patch.commercial_tags = tagsArr;
      patch.show_in_menu = showInMenu;
      patch.show_in_filters = showInFilters;
      patch.manual_category = true;
      const { error: pe } = await sb.from("products").update(patch).eq("id", productId);
      if (pe && !/column .* does not exist/i.test(pe.message)) {
        // non-fatal: still saved taxonomy
        console.warn("product flags skipped:", pe.message);
      }

      toast.success("Classificação comercial salva");
      qc.invalidateQueries({ queryKey: ["cc_existing", productId] });
      qc.invalidateQueries({ queryKey: ["taxonomy_diag"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (!productId) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground bg-secondary/40 rounded-xl">
        Salve o produto primeiro para definir sua classificação comercial.
      </div>
    );
  }

  const trierInfo = productMeta && (productMeta.department_name || productMeta.category_name || productMeta.group_name);

  return (
    <div className="space-y-4 pt-3">
      {trierInfo && (
        <div className="p-3 bg-muted/50 rounded-lg border text-xs space-y-1">
          <div className="font-semibold text-muted-foreground uppercase tracking-wide">Dados originais Trier</div>
          {productMeta?.department_name && <div><span className="text-muted-foreground">Departamento:</span> {productMeta.department_name}</div>}
          {productMeta?.category_name && <div><span className="text-muted-foreground">Categoria:</span> {productMeta.category_name}</div>}
          {productMeta?.group_name && <div><span className="text-muted-foreground">Grupo:</span> {productMeta.group_name}</div>}
          <div className="text-muted-foreground italic mt-1">Não controla o menu público. Defina abaixo onde aparece comercialmente.</div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {existing?.is_manual ? (
          <Badge className="bg-whatsapp text-white">Classificação manual</Badge>
        ) : existing ? (
          <Badge variant="secondary">Classificação automática (Trier)</Badge>
        ) : (
          <Badge variant="outline">Sem classificação</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>Departamento</Label>
          <Select value={departmentId || "none"} onValueChange={(v) => { setDepartmentId(v === "none" ? "" : v); setCategoryId(""); setSubcategoryId(""); }}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {depts.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Categoria</Label>
          <Select value={categoryId || "none"} onValueChange={(v) => { setCategoryId(v === "none" ? "" : v); setSubcategoryId(""); }}>
            <SelectTrigger><SelectValue placeholder={departmentId ? "—" : "Filtre por departamento ou escolha"} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {cats.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Subcategoria</Label>
          <Select value={subcategoryId || "none"} onValueChange={(v) => setSubcategoryId(v === "none" ? "" : v)} disabled={!categoryId}>
            <SelectTrigger><SelectValue placeholder={categoryId ? "—" : "Selecione categoria"} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {subs.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label>Tags comerciais (separadas por vírgula)</Label>
        <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="sem receita, promoção, dor de cabeça" />
      </div>

      <div className="flex flex-wrap gap-6">
        <div className="flex items-center gap-2">
          <Switch checked={showInMenu} onCheckedChange={setShowInMenu} />
          <Label>Aparece no menu</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={showInFilters} onCheckedChange={setShowInFilters} />
          <Label>Aparece em filtros</Label>
        </div>
      </div>

      <Button onClick={save} className="w-full">Salvar classificação comercial</Button>
    </div>
  );
}
