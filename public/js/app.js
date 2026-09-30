/**
 * public/js/app.js
 * Main PWA Coordinator, Brussels Clock Loop, and Network State Coordination
 */

import { ChatManager } from "./chat.js";
import { ScheduleViewController } from "./schedule-view.js";
import { registerServiceWorker, initConnectivityListeners, initInstallPrompt } from "./sw-register.js";

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    // 1. Initialize Schedule View Controller
    const scheduleView = new ScheduleViewController({
      drawerElement: document.getElementById("schedule-drawer"),
      backdropElement: document.getElementById("drawer-backdrop"),
      toggleButton: document.getElementById("toggle-schedule-btn"),
      closeButton: document.getElementById("close-schedule-btn"),
      searchInput: document.getElementById("schedule-search-input"),
      clearSearchButton: document.getElementById("clear-search-btn"),
      refreshButton: document.getElementById("refresh-schedule-btn"),
      warningBanner: document.getElementById("sync-warning-banner"),
      warningText: document.getElementById("sync-warning-text"),
      warningRetryBtn: document.getElementById("sync-warning-retry-btn"),
      warningCloseBtn: document.getElementById("sync-warning-close-btn"),
    });
    scheduleView.init();

    // 2. Initialize Chat Manager
    const chatManager = new ChatManager({
      messagesContainer: document.getElementById("chat-messages"),
      chatForm: document.getElementById("chat-form"),
      chatInput: document.getElementById("chat-input"),
      chatSubmit: document.getElementById("chat-submit"),
      onScheduleUpdated: () => {
        return scheduleView.fetchSchedule(true);
      },
      getScheduleSha: () => scheduleView.getSha(),
    });
    chatManager.init();

    // 3. Live Brussels Clock Loop
    initBrusselsClock();

    // 4. Online / Offline Network Monitoring
    initConnectivityListeners({
      onOnline: () => {
        scheduleView.fetchSchedule(true);
      },
    });

    // 5. Automatic tab freshness check on focus & visibilitychange (10s throttling - R1)
    initFreshnessListeners(scheduleView, 10000);

    // 6. PWA Service Worker Registration
    registerServiceWorker();

    // 7. PWA Install Prompt Bar
    initInstallPrompt();
  });
}

/**
 * Starts continuous live clock ticking in Europe/Brussels timezone.
 */
export function initBrusselsClock() {
  const clockTimeEl = document.getElementById("brussels-clock-time");
  if (!clockTimeEl) return;

  function update() {
    try {
      const now = new Date();
      const formatted = new Intl.DateTimeFormat("fr-BE", {
        timeZone: "Europe/Brussels",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(now);
      clockTimeEl.textContent = formatted;
    } catch {
      // Fallback
    }
  }

  update();
  setInterval(update, 1000);
}

/**
 * Coordinates tab focus & visibility freshness checking with throttling (R1).
 * Listens to document visibilitychange and window focus events.
 * @param {ScheduleViewController} scheduleView
 * @param {number} [throttleMs=10000]
 */
export function initFreshnessListeners(scheduleView, throttleMs = 10000) {
  if (!scheduleView) return;

  if (typeof scheduleView.setupFreshnessListeners === "function") {
    return scheduleView.setupFreshnessListeners(throttleMs);
  }

  let lastFetchTime = 0;
  const handleFreshness = () => {
    if (typeof document !== 'undefined' && document.visibilityState && document.visibilityState !== "visible") {
      return Promise.resolve(null);
    }
    const now = Date.now();
    if (lastFetchTime && (now - lastFetchTime < throttleMs)) {
      return Promise.resolve(null);
    }
    lastFetchTime = now;

    if (typeof scheduleView.checkFreshness === "function") {
      return Promise.resolve(scheduleView.checkFreshness(throttleMs)).catch(() => null);
    } else if (typeof scheduleView.fetchSchedule === "function") {
      return Promise.resolve(scheduleView.fetchSchedule(true)).catch(() => null);
    }
    return Promise.resolve(null);
  };

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener("visibilitychange", handleFreshness);
  }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener("focus", handleFreshness);
  }

  return handleFreshness;
}
