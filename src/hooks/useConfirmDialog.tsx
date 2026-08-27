import { useCallback, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmOptions = {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type PendingConfirm = ConfirmOptions & { open: boolean };

export function useConfirmDialog() {
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const [state, setState] = useState<PendingConfirm>({
    open: false,
    title: "Confirmar ação",
    description: "Deseja continuar?",
    confirmLabel: "Confirmar",
    cancelLabel: "Cancelar",
    destructive: false,
  });

  const settle = useCallback((value: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setState((current) => ({ ...current, open: false }));
    resolve?.(value);
  }, []);

  const confirm = useCallback((options: ConfirmOptions | string) => {
    if (resolverRef.current) resolverRef.current(false);
    const normalized: ConfirmOptions = typeof options === "string" ? { description: options } : options;
    setState({
      open: true,
      title: normalized.title ?? "Confirmar ação",
      description: normalized.description,
      confirmLabel: normalized.confirmLabel ?? "Confirmar",
      cancelLabel: normalized.cancelLabel ?? "Cancelar",
      destructive: normalized.destructive ?? false,
    });
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const dialog = (
    <AlertDialog open={state.open} onOpenChange={(open) => { if (!open) settle(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state.title}</AlertDialogTitle>
          <AlertDialogDescription>{state.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>{state.cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => settle(true)}
            className={state.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
          >
            {state.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, dialog };
}
