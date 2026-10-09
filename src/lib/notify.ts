import type { DailyCombo } from "./combo";
import { formatComboBody, formatComboTitle } from "./combo";
import type { NotifySettings } from "./storage";
import { loadLastNotifyDate, saveLastNotifyDate, todayKey } from "./storage";

const MAX_TIMEOUT = 2_147_000_000;
let timerId: number | null = null;

export function notificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!notificationSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!notificationSupported()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function nextNotifyAt(time: string, from = new Date()): Date {
  const [hh, mm] = time.split(":").map((n) => Number(n));
  const hour = Number.isFinite(hh) ? hh : 7;
  const minute = Number.isFinite(mm) ? mm : 30;
  const next = new Date(from);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= from.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

export function shouldFireToday(settings: NotifySettings, now = new Date()): boolean {
  if (!settings.enabled) return false;
  const [hh, mm] = settings.time.split(":").map((n) => Number(n));
  const scheduled = new Date(now);
  scheduled.setHours(hh, mm, 0, 0);
  return now.getTime() >= scheduled.getTime() && loadLastNotifyDate() !== todayKey(now);
}

export async function showComboNotification(combo: DailyCombo, markShown = true): Promise<boolean> {
  if (notificationPermission() !== "granted") return false;
  const title = formatComboTitle(combo);
  const body = formatComboBody(combo);
  const options: NotificationOptions & { renotify?: boolean } = {
    body,
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    tag: "sikdan-daily",
    renotify: true,
    data: { url: "./?today=1" },
  };

  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, options);
    } else {
      new Notification(title, options);
    }
    if (markShown) saveLastNotifyDate(todayKey());
    return true;
  } catch {
    try {
      new Notification(title, options);
      if (markShown) saveLastNotifyDate(todayKey());
      return true;
    } catch {
      return false;
    }
  }
}

export function clearNotifySchedule(): void {
  if (timerId !== null) {
    window.clearTimeout(timerId);
    timerId = null;
  }
}

export function armNotifySchedule(settings: NotifySettings, combo: DailyCombo): void {
  clearNotifySchedule();
  if (!settings.enabled || notificationPermission() !== "granted") return;

  if (shouldFireToday(settings)) {
    void showComboNotification(combo);
  }

  const delay = Math.min(nextNotifyAt(settings.time).getTime() - Date.now(), MAX_TIMEOUT);
  timerId = window.setTimeout(() => {
    void showComboNotification(combo).finally(() => {
      armNotifySchedule(settings, combo);
    });
  }, Math.max(delay, 1_000));
}
