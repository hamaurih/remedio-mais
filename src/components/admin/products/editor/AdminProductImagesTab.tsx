import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminProductEditorValue } from "./AdminProductBasicTab";

type AdminProductImagesTabProps = {
  value: AdminProductEditorValue;
  mainFile: File | null;
  galleryFiles: File[];
  onMainFileChange: (file: File | null) => void;
  onGalleryFilesChange: (files: File[]) => void;
  onChange: (next: AdminProductEditorValue) => void;
};

export function AdminProductImagesTab({
  value,
  mainFile,
  galleryFiles,
  onMainFileChange,
  onGalleryFilesChange,
  onChange,
}: AdminProductImagesTabProps) {
  const removeGalleryImage = (url: string) => {
    onChange({
      ...value,
      gallery_images: (value.gallery_images || []).filter((item: string) => item !== url),
    });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Imagem principal</Label>
        {value.image_url && (
          <img src={value.image_url} alt="" className="w-32 h-32 object-contain border rounded" />
        )}
        <Input
          type="file"
          accept="image/*"
          onChange={(event) => onMainFileChange(event.target.files?.[0] || null)}
        />
        {mainFile && <div className="text-xs text-muted-foreground">Nova imagem: {mainFile.name}</div>}
      </div>

      <div className="space-y-2 border-t pt-3">
        <Label>Galeria de imagens</Label>
        <div className="flex flex-wrap gap-2">
          {(value.gallery_images || []).map((url: string) => (
            <div key={url} className="relative">
              <img src={url} alt="" className="w-20 h-20 object-contain border rounded" />
              <button
                type="button"
                onClick={() => removeGalleryImage(url)}
                className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full p-0.5"
                aria-label="Remover imagem da galeria"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        <Input
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => onGalleryFilesChange(Array.from(event.target.files || []))}
        />
        {galleryFiles.length > 0 && (
          <div className="text-xs text-muted-foreground">{galleryFiles.length} nova(s) imagem(ns)</div>
        )}
      </div>
    </div>
  );
}
