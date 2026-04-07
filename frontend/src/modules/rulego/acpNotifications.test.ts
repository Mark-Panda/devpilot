import { describe, expect, it } from "vitest";
import {
  buildACPNotificationBody,
  buildACPStickyReminderText,
  resolveACPNotificationChannel,
  shouldShowACPStickyReminder,
  updateACPStickyReminderDismissed,
} from "./acpNotifications";

describe("acpNotifications", () => {
  it("prefers desktop native notifications when web notifications are unavailable", () => {
    expect(
      resolveACPNotificationChannel({
        hasDesktopBridge: true,
        hasWebNotification: false,
      }),
    ).toBe("desktop-native");
  });

  it("falls back to web notifications when desktop bridge is unavailable", () => {
    expect(
      resolveACPNotificationChannel({
        hasDesktopBridge: false,
        hasWebNotification: true,
      }),
    ).toBe("web");
  });

  it("builds ACP notification body text", () => {
    expect(buildACPNotificationBody(2, 5)).toBe("新增 2 条待处理任务（当前共 5 条）");
  });

  it("shows sticky reminder when there are pending items and it was not dismissed", () => {
    expect(
      shouldShowACPStickyReminder({
        pendingCount: 3,
        drawerOpen: false,
        dismissed: false,
      }),
    ).toBe(true);
  });

  it("hides sticky reminder after user dismisses it until new work arrives", () => {
    expect(
      shouldShowACPStickyReminder({
        pendingCount: 3,
        drawerOpen: false,
        dismissed: true,
      }),
    ).toBe(false);
    expect(
      updateACPStickyReminderDismissed({
        currentDismissed: true,
        addedCount: 1,
        pendingCount: 4,
      }),
    ).toBe(false);
  });

  it("clears dismissed state when all pending items are gone", () => {
    expect(
      updateACPStickyReminderDismissed({
        currentDismissed: true,
        addedCount: 0,
        pendingCount: 0,
      }),
    ).toBe(false);
  });

  it("builds sticky reminder text", () => {
    expect(buildACPStickyReminderText(2)).toBe("Cursor ACP 有 2 条待处理任务");
  });
});
