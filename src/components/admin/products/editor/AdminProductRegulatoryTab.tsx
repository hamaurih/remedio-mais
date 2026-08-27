import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TARJAS = ["vermelha", "preta"];

type Props = {
  editing: any;
  setEditing: React.Dispatch<React.SetStateAction<any>>;
};

export function AdminProductRegulatoryTab({ editing, setEditing }: Props) {
  return (
    <div className="space-y-3 pt-3">
      <div className="flex items-center gap-2">
        <Switch checked={!!editing.requires_prescription} onCheckedChange={(value) => setEditing({ ...editing, requires_prescription: value })} />
        <Label>Exige receita</Label>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={!!editing.controlled} onCheckedChange={(value) => setEditing({ ...editing, controlled: value })} />
        <Label>Medicamento controlado</Label>
      </div>
      <div className="space-y-1">
        <Label>Tarja</Label>
        <Select
          value={editing.tarja || "none"}
          onValueChange={(value) => setEditing({ ...editing, tarja: value === "none" ? "" : value })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem tarja</SelectItem>
            {TARJAS.map((tarja) => <SelectItem key={tarja} value={tarja}>Tarja {tarja}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Aviso personalizado</Label>
        <Textarea
          rows={2}
          value={editing.custom_warning || ""}
          onChange={(event) => setEditing({ ...editing, custom_warning: event.target.value })}
        />
      </div>
    </div>
  );
}
