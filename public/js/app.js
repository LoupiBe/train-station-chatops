/**
 * public/js/app.js
 * Main PWA Coordinator, Brussels Clock Loop, and Network State Coordination
 */

import { ChatManager } from "./chat.js";
import { ScheduleViewController } from "./schedule-view.js";
import { registerServiceWorker, initConnectivityListeners, initInstallPrompt } from "./sw-register.js";

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
  });
  scheduleView.init();

  // 2. Initialize Chat Manager
  const chatManager = new ChatManager({
    messagesContainer: document.getElementById("chat-messages"),
    chatForm: document.getElementById("chat-form"),
    chatInput: document.getElementById("chat-input"),
    chatSubmit: document.getElementById("chat-submit"),
    onScheduleUpdated: () => {
      scheduleView.fetchSchedule(true);
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

  // 5. PWA Service Worker Registration
  registerServiceWorker();

  // 6. PWA Install Prompt Bar
  initInstallPrompt();
});

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
