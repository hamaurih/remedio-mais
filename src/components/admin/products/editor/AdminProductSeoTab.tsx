import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  editing: any;
  setEditing: React.Dispatch<React.SetStateAction<any>>;
};

export function AdminProductSeoTab({ editing, setEditing }: Props) {
  return (
    <div className="space-y-3 pt-3">
      <div className="space-y-1">
        <Label>Título SEO</Label>
        <Input value={editing.seo_title || ""} onChange={(event) => setEditing({ ...editing, seo_title: event.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>Descrição SEO</Label>
        <Textarea rows={3} value={editing.seo_description || ""} onChange={(event) => setEditing({ ...editing, seo_description: event.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>Palavras-chave</Label>
        <Input
          value={editing.seo_keywords || ""}
          onChange={(event) => setEditing({ ...editing, seo_keywords: event.target.value })}
          placeholder="medicamento, farmácia, ..."
        />
      </div>
    </div>
  );
}
