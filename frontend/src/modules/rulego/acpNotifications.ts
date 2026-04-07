export type ACPNotificationChannel = "desktop-native" | "web" | "none";

export function resolveACPNotificationChannel(input: {
  hasDesktopBridge: boolean;
  hasWebNotification: boolean;
}): ACPNotificationChannel {
  if (input.hasDesktopBridge) return "desktop-native";
  if (input.hasWebNotification) return "web";
  return "none";
}

export function buildACPNotificationBody(added: number, total: number): string {
  return `新增 ${added} 条待处理任务（当前共 ${total} 条）`;
}

export function buildACPStickyReminderText(total: number): string {
  return `Cursor ACP 有 ${total} 条待处理任务`;
}

export function shouldShowACPStickyReminder(input: {
  pendingCount: number;
  drawerOpen: boolean;
  dismissed: boolean;
}): boolean {
  return input.pendingCount > 0 && !input.drawerOpen && !input.dismissed;
}

export function updateACPStickyReminderDismissed(input: {
  currentDismissed: boolean;
  addedCount: number;
  pendingCount: number;
}): boolean {
  if (input.pendingCount <= 0) return false;
  if (input.addedCount > 0) return false;
  return input.currentDismissed;
}

const ACP_NOTIFICATION_ENABLED_KEY = "cursor-acp-notify-enabled";

export function loadACPNotificationEnabled(storage: Pick<Storage, "getItem"> | null | undefined): boolean {
  try {
    return storage?.getItem(ACP_NOTIFICATION_ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveACPNotificationEnabled(storage: Pick<Storage, "setItem" | "removeItem"> | null | undefined, enabled: boolean): void {
  try {
    if (!storage) return;
    if (enabled) storage.setItem(ACP_NOTIFICATION_ENABLED_KEY, "true");
    else storage.removeItem(ACP_NOTIFICATION_ENABLED_KEY);
  } catch {
    // ignore storage failures and keep feature best-effort
  }
}
