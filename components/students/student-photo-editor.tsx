"use client";

import { ChangeEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SOURCE_SIZE = 8 * 1024 * 1024;
const MIN_SOURCE_DIMENSION = 128;
const OUTPUT_SIZE = 512;

export function validateStudentPhotoFile(file: Pick<File, "size" | "type">) {
  if (!ACCEPTED_TYPES.has(file.type)) return "Formato inválido. Use JPEG, PNG ou WebP.";
  if (file.size <= 0) return "O arquivo está vazio.";
  if (file.size > MAX_SOURCE_SIZE) return "A imagem deve ter no máximo 8MB.";
  return null;
}

export function StudentPhotoEditor({ name, currentSrc, onConfirm }: {
  name: string;
  currentSrc?: string | null;
  onConfirm: (file: File, previewUrl: string) => void;
}) {
  const [sourceUrl, setSourceUrl] = useState("");
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [error, setError] = useState("");
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); }, [sourceUrl]);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const validation = validateStudentPhotoFile(file);
    if (validation) { setError(validation); return; }
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceUrl(URL.createObjectURL(file));
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
    setError("");
    setOpen(true);
  }

  async function confirmCrop() {
    const image = imageRef.current;
    if (!image || !image.complete || image.naturalWidth < MIN_SOURCE_DIMENSION || image.naturalHeight < MIN_SOURCE_DIMENSION) {
      setError(`A imagem deve ter pelo menos ${MIN_SOURCE_DIMENSION} × ${MIN_SOURCE_DIMENSION} px.`);
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const context = canvas.getContext("2d");
    if (!context) { setError("Não foi possível preparar a imagem."); return; }

    const baseScale = Math.max(OUTPUT_SIZE / image.naturalWidth, OUTPUT_SIZE / image.naturalHeight);
    const scale = baseScale * zoom;
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    const overflowX = Math.max(0, width - OUTPUT_SIZE);
    const overflowY = Math.max(0, height - OUTPUT_SIZE);
    const x = (OUTPUT_SIZE - width) / 2 + (offsetX / 100) * (overflowX / 2);
    const y = (OUTPUT_SIZE - height) / 2 + (offsetY / 100) * (overflowY / 2);
    context.drawImage(image, x, y, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
    if (!blob) { setError("Não foi possível gerar a foto otimizada."); return; }
    const file = new File([blob], "avatar.webp", { type: "image/webp" });
    const previewUrl = URL.createObjectURL(blob);
    onConfirm(file, previewUrl);
    setOpen(false);
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    dragRef.current = { x: event.clientX, y: event.clientY, offsetX, offsetY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const start = dragRef.current;
    if (!start) return;
    setOffsetX(Math.max(-100, Math.min(100, start.offsetX + (event.clientX - start.x) * 0.8)));
    setOffsetY(Math.max(-100, Math.min(100, start.offsetY + (event.clientY - start.y) * 0.8)));
  }

  const transform = `translate(${offsetX * 0.45}px, ${offsetY * 0.45}px) scale(${zoom})`;
  return <>
    <div className="flex items-center gap-4 rounded-ds-xl border border-line bg-surface/60 p-3 md:col-span-2">
      <Avatar src={currentSrc} name={name || "Aluno"} size="xl" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">Foto do aluno</p>
        <p className="text-helper text-muted">JPEG, PNG ou WebP. Você poderá ajustar o enquadramento antes de confirmar.</p>
        <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-ds-md border border-line bg-card px-3 py-2 text-sm font-semibold text-ink hover:bg-surface">
          <Camera className="h-4 w-4" aria-hidden="true" /> Selecionar foto
          <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile} />
        </label>
      </div>
      {error && !open ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    </div>
    <Dialog open={open} onOpenChange={setOpen} title="Ajustar foto" description="Centralize o rosto e confirme o avatar final." className="max-w-lg" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={() => void confirmCrop()}>Confirmar foto</Button></>}>
      <div className="space-y-4">
        <div className="mx-auto h-72 w-72 max-w-full touch-none cursor-grab overflow-hidden rounded-full border-4 border-card bg-surface shadow-surface-md active:cursor-grabbing" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }} aria-label="Prévia da foto; arraste para reposicionar">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {sourceUrl ? <img ref={imageRef} src={sourceUrl} alt="Prévia para recorte" className="h-full w-full object-cover transition-transform" style={{ transform }} onLoad={(event) => { if (event.currentTarget.naturalWidth < MIN_SOURCE_DIMENSION || event.currentTarget.naturalHeight < MIN_SOURCE_DIMENSION) setError(`A imagem deve ter pelo menos ${MIN_SOURCE_DIMENSION} × ${MIN_SOURCE_DIMENSION} px.`); }} /> : null}
        </div>
        <FormField label="Zoom" htmlFor="student-photo-zoom"><Input id="student-photo-zoom" type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Posição horizontal" htmlFor="student-photo-x"><Input id="student-photo-x" type="range" min="-100" max="100" value={offsetX} onChange={(event) => setOffsetX(Number(event.target.value))} /></FormField>
          <FormField label="Posição vertical" htmlFor="student-photo-y"><Input id="student-photo-y" type="range" min="-100" max="100" value={offsetY} onChange={(event) => setOffsetY(Number(event.target.value))} /></FormField>
        </div>
        {error ? <p role="alert" className="text-sm font-medium text-danger">{error}</p> : null}
      </div>
    </Dialog>
  </>;
}
