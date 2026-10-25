"use client";

import { useCallback, useEffect, useState } from "react";
import { API_URL, apiFetch } from "../api";

export type WorkspaceNotification = {
  id: number;
  company_id: number | null;
  company_name: string | null;
  kind: string;
  title: string;
  message: string;
  related_action_id: number | null;
  created_at: string;
  read_at: string | null;
};

type NotificationCenterProps = {
  onOpen: (notification: WorkspaceNotification) => void;
};

export default function NotificationCenter({
  onOpen,
}: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<WorkspaceNotification[]>([]);

  const refresh = useCallback(async () => {
    try {
      const response = await apiFetch(`${API_URL}/notifications`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Unable to load notifications."
        );
      }
      setNotifications(data.notifications as WorkspaceNotification[]);
      setUnreadCount(data.unread_count as number);
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load notifications."
      );
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refresh(), 0);
    const poll = window.setInterval(() => void refresh(), 45_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(poll);
    };
  }, [refresh]);

  async function markAllRead() {
    setLoading(true);
    try {
      const response = await apiFetch(`${API_URL}/notifications/read-all`, {
        method: "POST",
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Unable to mark notifications as read.");
      }
      await refresh();
    } catch (markError) {
      setError(
        markError instanceof Error
          ? markError.message
          : "Unable to mark notifications as read."
      );
    } finally {
      setLoading(false);
    }
  }

  async function openNotification(notification: WorkspaceNotification) {
    if (!notification.read_at) {
      try {
        const response = await apiFetch(
          `${API_URL}/notifications/${notification.id}/read`,
          { method: "PATCH" }
        );
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.detail || "Unable to mark notification as read.");
        }
        await refresh();
      } catch (markError) {
        setError(
          markError instanceof Error
            ? markError.message
            : "Unable to mark notification as read."
        );
        return;
      }
    }
    setOpen(false);
    onOpen(notification);
  }

  async function dismissNotification(notificationId: number) {
    try {
      const response = await apiFetch(
        `${API_URL}/notifications/${notificationId}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Unable to dismiss notification.");
      }
      await refresh();
    } catch (dismissError) {
      setError(
        dismissError instanceof Error
          ? dismissError.message
          : "Unable to dismiss notification."
      );
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        onClick={() => {
          setOpen((visible) => !visible);
          void refresh();
        }}
        className="relative grid h-11 w-11 place-items-center rounded-xl border border-slate-700 bg-slate-900/80 text-slate-200 transition hover:border-cyan-700 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path
            d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <section
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-3 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl shadow-black/50"
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <div>
              <h2 className="font-semibold text-white">Notifications</h2>
              <p className="text-xs text-slate-400">
                {unreadCount} unread · refreshes automatically
              </p>
            </div>
            <button
              type="button"
              disabled={loading || unreadCount === 0}
              onClick={() => void markAllRead()}
              className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-cyan-700 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Mark all read
            </button>
          </div>

          {error && (
            <p role="alert" className="border-b border-rose-900/70 bg-rose-950/30 px-4 py-2 text-xs text-rose-200">
              {error}
            </p>
          )}

          <ul className="max-h-[min(65vh,30rem)] divide-y divide-slate-800 overflow-y-auto">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <div
                  className={`flex items-start gap-2 px-3 py-2 ${
                    notification.read_at ? "bg-slate-950" : "bg-cyan-950/20"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void openNotification(notification)}
                    className="min-w-0 flex-1 py-1 text-left transition hover:bg-slate-900"
                  >
                    <span className="flex items-start gap-3">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          notification.read_at ? "bg-slate-700" : "bg-cyan-300"
                        }`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-100">
                          {notification.title}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-slate-300">
                          {notification.message}
                        </span>
                        <span className="mt-1.5 block text-[11px] text-slate-500">
                          {notification.company_name
                            ? `${notification.company_name} · `
                            : ""}
                          {new Date(notification.created_at).toLocaleString()}
                        </span>
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Dismiss ${notification.title}`}
                    onClick={() => void dismissNotification(notification.id)}
                    className="shrink-0 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                  >
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {notifications.length === 0 && !error && (
            <p className="px-4 py-8 text-center text-sm text-slate-400">
              You’re all caught up. New assignments and workspace updates will appear here.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
