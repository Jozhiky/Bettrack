import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from './context';
import { enqueueCaptures } from '../data/captures';

export function useCaptureInput(onAdded: () => void) {
  const { notify } = useApp();
  const fileInput = useRef<HTMLInputElement>(null),
    cameraInput = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false),
    [dragging, setDragging] = useState(false);
  const [uploadLabel, setUploadLabel] = useState('');
  const [failedFiles, setFailedFiles] = useState<{ file: File; error: string }[]>([]);
  const uploading = useRef(false);
  const callback = useRef(onAdded);
  callback.current = onAdded;
  const add = useCallback(
    async (files: File[]) => {
      if (uploading.current) {
        notify('Espera a que termine de subir este lote.', true);
        return;
      }
      const accepted = files.filter(
        (f) =>
          ['image/png', 'image/jpeg', 'image/webp'].includes(f.type) && f.size <= 15 * 1024 * 1024,
      );
      if (accepted.length !== files.length)
        notify('Usa PNG, JPEG o WebP de hasta 15 MB por imagen.', true);
      if (!accepted.length) return;
      uploading.current = true;
      setAdding(true);
      callback.current();
      try {
        const result = await enqueueCaptures(accepted, undefined, setUploadLabel);
        setFailedFiles((previous) => [
          ...previous.filter((item) => !accepted.includes(item.file)),
          ...result.failed,
        ]);
        if (result.failed.length)
          notify(
            `${result.added} capturas recibidas; ${result.failed.length} no se pudieron subir. Puedes reintentar solo las fallidas.`,
            true,
          );
      } catch (error) {
        notify(error instanceof Error ? error.message : String(error), true);
      } finally {
        setAdding(false);
        uploading.current = false;
        setUploadLabel('');
      }
    },
    [notify],
  );
  useEffect(() => {
    let depth = 0;
    const blocked = () => !!document.querySelector('[role="dialog"]');
    const paste = (e: ClipboardEvent) => {
      if (
        blocked() ||
        (e.target instanceof HTMLElement &&
          e.target.closest('input,textarea,[contenteditable=true]'))
      )
        return;
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
        .map((i) => i.getAsFile())
        .filter((f): f is File => !!f);
      if (files.length) {
        e.preventDefault();
        void add(files);
      }
    };
    const enter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files') && !blocked()) {
        e.preventDefault();
        depth++;
        setDragging(true);
      }
    };
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (!blocked()) void add(Array.from(e.dataTransfer.files));
    };
    window.addEventListener('paste', paste);
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('paste', paste);
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [add]);
  return {
    fileInput,
    cameraInput,
    add,
    adding,
    dragging,
    uploadLabel,
    failedFiles,
    retryUploads: () => add(failedFiles.map((item) => item.file)),
    dismissFailures: () => setFailedFiles([]),
  };
}
