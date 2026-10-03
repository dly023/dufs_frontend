type ToastKind = "info" | "success" | "warning" | "error";

export interface ToastAction {
  label: string;
  handler: () => void;
}

export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
  action?: ToastAction;
}

let seq = 0;

class ToastStore {
  items = $state<ToastItem[]>([]);

  push(message: string, kind: ToastKind = "info", action?: ToastAction) {
    const id = ++seq;
    // Actions are one-shot: the first click runs it and dismisses the toast;
    // any later click (double click, stale toast) does nothing.
    let used = false;
    const once = action && {
      label: action.label,
      handler: () => {
        if (used) return;
        used = true;
        this.dismiss(id);
        action.handler();
      },
    };
    this.items = [...this.items, { id, message, kind, action: once }];
    setTimeout(() => this.dismiss(id), action ? 8000 : 2800);
  }

  dismiss(id: number) {
    this.items = this.items.filter((t) => t.id !== id);
  }

  success(message: string, action?: ToastAction) {
    this.push(message, "success", action);
  }
  error(message: string) {
    this.push(message, "error");
  }
  warning(message: string) {
    this.push(message, "warning");
  }
}

export const toasts = new ToastStore();
