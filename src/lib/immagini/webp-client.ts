/** Sul browser: legge il canvas in WebP; se il browser non sa farlo (vecchi Safari) ripiega su JPEG. */
export function canvasInWebp(canvas: HTMLCanvasElement, qualita: number): string {
  const w = canvas.toDataURL("image/webp", qualita);
  return w.startsWith("data:image/webp") ? w : canvas.toDataURL("image/jpeg", qualita);
}

export function canvasInWebpBlob(canvas: HTMLCanvasElement, qualita: number): Promise<{ blob: Blob; est: string } | null> {
  return new Promise((ok) => canvas.toBlob((b) => {
    if (b && b.type === "image/webp") return ok({ blob: b, est: "webp" });
    canvas.toBlob((j) => ok(j ? { blob: j, est: "jpg" } : null), "image/jpeg", qualita);
  }, "image/webp", qualita));
}
