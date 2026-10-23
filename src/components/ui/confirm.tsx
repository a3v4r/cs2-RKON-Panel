"use client";

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// Promise-based confirm on the app's own dialog (native confirm() looked alien and
// could not style the destructive action). Destructive dialogs focus Cancel, not Confirm,
// so an accidental Enter does nothing dangerous.

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

const ConfirmContext = React.createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

export function useConfirm() {
  const fn = React.useContext(ConfirmContext);
  if (!fn) throw new Error('useConfirm must be used within <ConfirmProvider>');
  return fn;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = React.useState<ConfirmOptions | null>(null);
  const resolveRef = React.useRef<((value: boolean) => void) | null>(null);

  const confirm = React.useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const settle = (value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={options !== null} onOpenChange={(open) => { if (!open) settle(false); }}>
        <DialogContent className="sm:max-w-[425px] bg-[#09090b] border-border text-white">
          <DialogHeader>
            <DialogTitle>{options?.title}</DialogTitle>
            {options?.description && (
              <DialogDescription className="text-left">{options.description}</DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter className="pt-4">
            <Button
              variant="ghost"
              onClick={() => settle(false)}
              autoFocus={options?.destructive === true}
            >
              {options?.cancelLabel ?? 'Отмена'}
            </Button>
            <Button
              onClick={() => settle(true)}
              autoFocus={options?.destructive !== true}
              className={
                options?.destructive
                  ? 'bg-red-500 text-white hover:bg-red-500/90'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }
            >
              {options?.confirmLabel ?? 'ОК'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}
