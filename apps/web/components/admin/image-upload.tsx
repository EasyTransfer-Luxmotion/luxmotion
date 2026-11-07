"use client";

import * as React from "react";
import { usePublicarImagem } from "@/hooks/use-publicar-imagem";
import { Upload, X, Loader2 } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

interface ImageUploadProps {
  value?: string | null;
  onChange: (imagem: string | undefined, previewUrl?: string | null) => void;
  disabled?: boolean;
}

export function ImageUpload({ value, onChange, disabled }: ImageUploadProps) {
  const [isUploading, setIsUploading] = React.useState(false);
  const [localPreview, setLocalPreview] = React.useState<string | null>(null);
  const publicarImagem = usePublicarImagem();

  React.useEffect(() => {
    if (!value) {
      setLocalPreview(null);
    }
  }, [value]);

  const onUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);

      const localUrl = URL.createObjectURL(file);
      setLocalPreview(localUrl);

      const { caminho } = await publicarImagem(file);
      // Pass the local object URL too, so callers can reflect the new image in a live
      // preview immediately instead of waiting for a save + refetch.
      onChange(caminho, localUrl);
    } catch (error) {
      console.error("Upload failed:", error);
      setLocalPreview(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = () => {
    setLocalPreview(null);
    onChange(undefined, null);
  };

  const displayUrl = localPreview || value;

  return (
    <div className="space-y-4 w-full">
      <div
        className={cn(
          "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border transition-all hover:bg-accent",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        {displayUrl ? (
          <div className="relative aspect-video w-full max-h-64 overflow-hidden rounded-lg">
            <div className="absolute right-2 top-2 z-10">
              <button
                type="button"
                onClick={handleRemove}
                className="rounded-full bg-destructive p-1 text-white hover:bg-destructive/90 transition-colors"
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <img
              src={displayUrl}
              alt="Upload preview"
              className="w-full h-full object-contain"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 px-6">
            <div className="mb-4 rounded-full bg-muted p-3">
              {isUploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <Upload className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">
                {isUploading ? "Uploading..." : "Click to upload image"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                PNG, JPG or WebP (max. 5MB)
              </p>
            </div>
            <input
              type="file"
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={onUpload}
              disabled={disabled || isUploading}
              accept="image/*"
            />
          </div>
        )}
      </div>
    </div>
  );
}
