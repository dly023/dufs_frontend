export type DialogKind = "confirm" | "prompt";

export interface DialogRequest {
  id: number;
  kind: DialogKind;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  promptLabel?: string;
  promptDefault?: string;
  resolve: (value: string | boolean | null) => void;
}

let seq = 0;

class DialogStore {
  current = $state<DialogRequest | null>(null);

  confirm(opts: {
    title: string;
    message: string;
    confirmText?: string;
    danger?: boolean;
  }): Promise<boolean> {
    return new Promise((resolve) => {
      this.current = {
        id: ++seq,
        kind: "confirm",
        title: opts.title,
        message: opts.message,
        confirmText: opts.confirmText,
        danger: opts.danger,
        resolve: (v) => resolve(v === true),
      };
    });
  }

  prompt(opts: {
    title: string;
    message: string;
    promptLabel?: string;
    promptDefault?: string;
    confirmText?: string;
  }): Promise<string | null> {
    return new Promise((resolve) => {
      this.current = {
        id: ++seq,
        kind: "prompt",
        title: opts.title,
        message: opts.message,
        promptLabel: opts.promptLabel,
        promptDefault: opts.promptDefault,
        confirmText: opts.confirmText,
        resolve: (v) => resolve(typeof v === "string" ? v : null),
      };
    });
  }

  close(value: string | boolean | null) {
    const cur = this.current;
    this.current = null;
    cur?.resolve(value);
  }
}

export const dialogs = new DialogStore();
