/**
 * public/js/schedule-view.js
 * Schedule Consultation Drawer Controller, Search Filter, and Offline Caching
 */

const STORAGE_KEYS = {
  SCHEDULE: "kiosk_schedule_data_v1",
  SHA: "kiosk_schedule_sha_v1",
  TIMESTAMP: "kiosk_schedule_timestamp_v1",
};

let globalController = null;

export class ScheduleViewController {
  /**
   * @param {object} [options={}]
   * @param {HTMLElement} [options.drawerElement]
   * @param {HTMLElement} [options.backdropElement]
   * @param {HTMLButtonElement} [options.toggleButton]
   * @param {HTMLButtonElement} [options.closeButton]
   * @param {HTMLInputElement} [options.searchInput]
   * @param {HTMLButtonElement} [options.clearSearchButton]
   * @param {HTMLButtonElement} [options.refreshButton]
   */
  constructor(options = {}) {
    this.drawer = options.drawerElement || (typeof document !== 'undefined' ? document.getElementById("schedule-drawer") : null);
    this.backdrop = options.backdropElement || (typeof document !== 'undefined' ? document.getElementById("drawer-backdrop") : null);
    this.toggleBtn = options.toggleButton || (typeof document !== 'undefined' ? document.getElementById("toggle-schedule-btn") : null);
    this.closeBtn = options.closeButton || (typeof document !== 'undefined' ? document.getElementById("close-schedule-btn") : null);
    this.searchInput = options.searchInput || (typeof document !== 'undefined' ? document.getElementById("schedule-search-input") : null);
    this.clearSearchBtn = options.clearSearchButton || (typeof document !== 'undefined' ? document.getElementById("clear-search-btn") : null);
    this.refreshBtn = options.refreshButton || (typeof document !== 'undefined' ? document.getElementById("refresh-schedule-btn") : null);

    this.schedule = null;
    this.sha = null;
    this.rawSearchQuery = "";
    this.searchQuery = "";
    this.isOpen = false;
  }

  /**
   * Normalizes strings by removing diacritics and converting to lowercase.
   * @param {string} str
   * @returns {string}
   */
  normalize(str) {
    return (str || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  }

  init() {
    // 1. Drawer open/close events
    if (this.toggleBtn) {
      this.toggleBtn.addEventListener("click", () => this.toggle());
    }
    if (this.closeBtn) {
      this.closeBtn.addEventListener("click", () => this.close());
    }
    if (this.backdrop) {
      this.backdrop.addEventListener("click", () => this.close());
    }

    // 2. Keyboard Escape listener
    if (typeof window !== 'undefined') {
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.isOpen) {
          this.close();
        }
      });
    }

    // 3. Search and filter listeners
    if (this.searchInput) {
      this.searchInput.addEventListener("input", (e) => {
        this.rawSearchQuery = (e.target.value || "").trim();
        this.searchQuery = this.normalize(this.rawSearchQuery);
        if (this.clearSearchBtn) {
          this.clearSearchBtn.hidden = !this.rawSearchQuery;
        }
        this.render();
      });
    }

    if (this.clearSearchBtn) {
      this.clearSearchBtn.addEventListener("click", () => {
        if (this.searchInput) {
          this.searchInput.value = "";
          this.searchInput.focus();
        }
        this.rawSearchQuery = "";
        this.searchQuery = "";
        this.clearSearchBtn.hidden = true;
        this.render();
      });
    }

    // 4. Refresh button listener
    if (this.refreshBtn) {
      this.refreshBtn.addEventListener("click", () => {
        this.fetchSchedule(false);
      });
    }

    // 5. Initial schedule fetch (from cache immediately, then network)
    this.loadFromCache();
    this.fetchSchedule(true);
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    this.isOpen = true;
    if (this.drawer) {
      this.drawer.hidden = false;
      this.drawer.classList.add("open");
    }
    if (this.backdrop) {
      this.backdrop.hidden = false;
    }
    if (this.toggleBtn) {
      this.toggleBtn.setAttribute("aria-expanded", "true");
    }
    if (this.searchInput) {
      setTimeout(() => this.searchInput.focus(), 150);
    }
  }

  close() {
    this.isOpen = false;
    if (this.drawer) {
      this.drawer.classList.remove("open");
    }
    if (this.backdrop) {
      this.backdrop.hidden = true;
    }
    if (this.toggleBtn) {
      this.toggleBtn.setAttribute("aria-expanded", "false");
    }
    setTimeout(() => {
      if (!this.isOpen && this.drawer) {
        this.drawer.hidden = true;
      }
    }, 300);
    if (this.toggleBtn) {
      this.toggleBtn.focus();
    }
  }

  getSha() {
    return this.sha;
  }

  loadFromCache() {
    try {
      if (typeof localStorage === 'undefined') return;
      const cached = localStorage.getItem(STORAGE_KEYS.SCHEDULE);
      const cachedSha = localStorage.getItem(STORAGE_KEYS.SHA);
      if (cached) {
        this.schedule = JSON.parse(cached);
        this.sha = cachedSha;
        this.render(true);
      }
    } catch {
      // ignore storage access error
    }
  }

  saveToCache(schedule, sha) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(schedule));
      if (sha) localStorage.setItem(STORAGE_KEYS.SHA, sha);
      localStorage.setItem(STORAGE_KEYS.TIMESTAMP, new Date().toISOString());
    } catch {
      // ignore storage quota error
    }
  }

  async fetchSchedule(silent = false) {
    if (this.refreshBtn && !silent) {
      this.refreshBtn.disabled = true;
      const label = this.refreshBtn.querySelector(".refresh-label");
      if (label) label.textContent = "Chargement...";
    }

    try {
      const res = await fetch("/api/status");
      if (res.ok) {
        const data = await res.json();
        this.schedule = data.schedule;
        this.sha = data.sha;
        this.saveToCache(data.schedule, data.sha);
        this.render(false, data.brusselsTime);
      } else {
        // Fallback to cache if network returned error
        this.loadFromCache();
        if (!this.schedule) this.render(true);
      }
    } catch {
      // Network failed: fallback to offline cache
      this.loadFromCache();
      if (!this.schedule) this.render(true);
    } finally {
      if (this.refreshBtn) {
        this.refreshBtn.disabled = false;
        const label = this.refreshBtn.querySelector(".refresh-label");
        if (label) label.textContent = "Actualiser";
      }
    }
  }

  render(isCached = false, brusselsTime = null) {
    if (!this.schedule) {
      this.renderMeta(isCached);
      this.renderEmptyOfflineState();
      return;
    }

    this.renderMeta(isCached);
    this.renderWeeklyTable(brusselsTime);
    this.renderHolidays();
    this.renderWhitelist();
    this.renderSpecialSchedules();
  }

  /**
   * Renders explicit empty state when launched offline for the first time without cache.
   */
  renderEmptyOfflineState() {
    if (typeof document === 'undefined') return;
    const tbody = document.getElementById("weekly-table-body");
    const holidaysList = document.getElementById("holidays-list");
    const whitelistList = document.getElementById("whitelist-list");
    const specialList = document.getElementById("special-schedules-list");
    const offlineMsg = "Aucun horaire en cache local. Connectez-vous à Internet pour synchroniser les horaires.";

    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state">${offlineMsg}</td></tr>`;
    }
    if (holidaysList) {
      holidaysList.innerHTML = `<li class="empty-state">${offlineMsg}</li>`;
    }
    if (whitelistList) {
      whitelistList.innerHTML = `<li class="empty-state">${offlineMsg}</li>`;
    }
    if (specialList) {
      specialList.innerHTML = `<li class="empty-state">${offlineMsg}</li>`;
    }
  }

  renderMeta(isCached) {
    if (typeof document === 'undefined') return;
    const syncTimeEl = document.getElementById("schedule-sync-time");
    const sourcePill = document.getElementById("schedule-cache-pill");

    if (syncTimeEl) {
      try {
        const now = new Date();
        const timeStr = new Intl.DateTimeFormat("fr-BE", {
          timeZone: "Europe/Brussels",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(now);
        syncTimeEl.textContent = `Dernière sync : ${timeStr}`;
      } catch {
        syncTimeEl.textContent = "Dernière sync : Récente";
      }
    }

    if (sourcePill) {
      const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
      if (isCached || !online) {
        sourcePill.textContent = "Cache local (hors ligne)";
        sourcePill.style.backgroundColor = "var(--color-amber-bg)";
        sourcePill.style.color = "var(--color-amber-text)";
      } else {
        sourcePill.textContent = "GitHub direct";
        sourcePill.style.backgroundColor = "var(--color-rail-blue-subtle)";
        sourcePill.style.color = "var(--color-rail-navy)";
      }
    }
  }

  renderWeeklyTable(brusselsTime) {
    if (typeof document === 'undefined') return;
    const tbody = document.getElementById("weekly-table-body");
    if (!tbody) return;

    const days = [
      { key: "monday", label: "Lundi" },
      { key: "tuesday", label: "Mardi" },
      { key: "wednesday", label: "Mercredi" },
      { key: "thursday", label: "Jeudi" },
      { key: "friday", label: "Vendredi" },
      { key: "saturday", label: "Samedi" },
      { key: "sunday", label: "Dimanche" },
    ];

    const frenchToEnglishDays = {
      lundi: "monday",
      mardi: "tuesday",
      mercredi: "wednesday",
      jeudi: "thursday",
      vendredi: "friday",
      samedi: "saturday",
      dimanche: "sunday",
    };

    // Determine current day of week in Brussels (maps French weekday or English fallback to key)
    let currentBrusselsDay = "";
    try {
      const rawWeekday = (
        brusselsTime?.weekday ||
        new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Brussels", weekday: "long" }).format(new Date())
      ).toLowerCase().trim();
      currentBrusselsDay = frenchToEnglishDays[rawWeekday] || rawWeekday;
    } catch {
      currentBrusselsDay = "monday";
    }

    const query = this.searchQuery;
    let html = "";
    let visibleCount = 0;

    for (const d of days) {
      const dayData = this.schedule[d.key] || { on: "00:00", off: "00:00" };
      const isClosed = dayData.on === "00:00" && dayData.off === "00:00";
      const isToday = d.key === currentBrusselsDay || d.label.toLowerCase() === (brusselsTime?.weekday || "").toLowerCase();

      // Diacritic-insensitive filter check
      if (query) {
        const matchName = this.normalize(d.label).includes(query);
        const matchHours = `${dayData.on} ${dayData.off}`.includes(query);
        const matchStatus = this.normalize(isClosed ? "fermé" : "ouvert").includes(query);
        if (!matchName && !matchHours && !matchStatus) {
          continue;
        }
      }

      visibleCount++;
      const todayBadge = isToday ? '<span class="day-badge-today">Aujourd\'hui</span>' : "";
      const statusBadge = isClosed
        ? '<span class="status-badge closed">Fermé</span>'
        : '<span class="status-badge open">Ouvert</span>';

      html += `
        <tr class="${isToday ? "row-today" : ""}">
          <td><strong>${this.escapeHtml(d.label)}</strong> ${todayBadge}</td>
          <td><code>${this.escapeHtml(dayData.on)}</code></td>
          <td><code>${this.escapeHtml(dayData.off)}</code></td>
          <td>${statusBadge}</td>
        </tr>
      `;
    }

    if (visibleCount === 0) {
      const displayQuery = this.rawSearchQuery || this.searchQuery;
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Aucun jour ne correspond au filtre "${this.escapeHtml(displayQuery)}"</td></tr>`;
    } else {
      tbody.innerHTML = html;
    }
  }

  renderHolidays() {
    if (typeof document === 'undefined') return;
    const listEl = document.getElementById("holidays-list");
    const countBadge = document.getElementById("holidays-count-badge");
    if (!listEl) return;

    const holidays = Array.isArray(this.schedule?.holidays) ? this.schedule.holidays : [];
    const query = this.searchQuery;

    const filtered = holidays.filter((h) => {
      if (!query) return true;
      const str = this.normalize(`${h.start} ${h.end} ${h.description || ""}`);
      return str.includes(query);
    });

    if (countBadge) {
      countBadge.textContent = holidays.length.toString();
    }

    if (filtered.length === 0) {
      listEl.innerHTML = `<li class="empty-state">${query ? "Aucun congé correspondant" : "Aucune fermeture programmée"}</li>`;
      return;
    }

    listEl.innerHTML = filtered
      .map((h) => {
        const isSingleDay = h.start === h.end;
        const dateDisplay = isSingleDay
          ? `Le ${this.escapeHtml(this.formatFrDate(h.start))}`
          : `Du ${this.escapeHtml(this.formatFrDate(h.start))} au ${this.escapeHtml(this.formatFrDate(h.end))}`;
        const desc = h.description ? `<span class="item-desc">${this.escapeHtml(h.description)}</span>` : "";

        return `
          <li class="drawer-list-item">
            <div class="item-date-row">
              <span>${dateDisplay}</span>
              <span class="status-badge closed">Fermé</span>
            </div>
            ${desc}
          </li>
        `;
      })
      .join("");
  }

  renderWhitelist() {
    if (typeof document === 'undefined') return;
    const listEl = document.getElementById("whitelist-list");
    const countBadge = document.getElementById("whitelist-count-badge");
    if (!listEl) return;

    const whitelist = Array.isArray(this.schedule?.whitelist) ? this.schedule.whitelist : [];
    const query = this.searchQuery;

    const filtered = whitelist.filter((item) => {
      const dateStr = typeof item === "string" ? item : (item.date || "");
      const reason = typeof item === "object" ? (item.reason || "") : "";
      if (!query) return true;
      return this.normalize(`${dateStr} ${reason}`).includes(query);
    });

    if (countBadge) {
      countBadge.textContent = whitelist.length.toString();
    }

    if (filtered.length === 0) {
      listEl.innerHTML = `<li class="empty-state">${query ? "Aucune exception correspondante" : "Aucune exception enregistrée"}</li>`;
      return;
    }

    listEl.innerHTML = filtered
      .map((item) => {
        const dateStr = typeof item === "string" ? item : (item.date || "");
        const reason = typeof item === "object" && item.reason ? `<span class="item-desc">${this.escapeHtml(item.reason)}</span>` : "";

        return `
          <li class="drawer-list-item">
            <div class="item-date-row">
              <span>Le ${this.escapeHtml(this.formatFrDate(dateStr))}</span>
              <span class="status-badge open">Ouvert</span>
            </div>
            ${reason}
          </li>
        `;
      })
      .join("");
  }

  renderSpecialSchedules() {
    if (typeof document === 'undefined') return;
    const listEl = document.getElementById("special-schedules-list");
    const countBadge = document.getElementById("special-count-badge");
    if (!listEl) return;

    const specialList = Array.isArray(this.schedule?.special_schedules)
      ? this.schedule.special_schedules
      : (Array.isArray(this.schedule?.exceptional_schedules) ? this.schedule.exceptional_schedules : []);
    const query = this.searchQuery;

    const filtered = specialList.filter((item) => {
      if (!query) return true;
      const start = item.start || item.date || "";
      const end = item.end || item.date || start;
      const desc = item.description || item.reason || "";
      const hours = `${item.on || ""} ${item.off || ""}`;
      const str = this.normalize(`${start} ${end} ${hours} ${desc}`);
      return str.includes(query);
    });

    if (countBadge) {
      countBadge.textContent = specialList.length.toString();
    }

    if (filtered.length === 0) {
      listEl.innerHTML = `<li class="empty-state">${query ? "Aucun horaire particulier correspondant" : "Aucun horaire particulier programmé"}</li>`;
      return;
    }

    listEl.innerHTML = filtered
      .map((item) => {
        const start = item.start || item.date || "";
        const end = item.end || item.date || start;
        const isSingleDay = start === end;
        const dateDisplay = isSingleDay
          ? `Le ${this.escapeHtml(this.formatFrDate(start))}`
          : `Du ${this.escapeHtml(this.formatFrDate(start))} au ${this.escapeHtml(this.formatFrDate(end))}`;
        const isClosed = item.on === "00:00" && item.off === "00:00";
        const statusBadge = isClosed
          ? '<span class="status-badge closed">Fermé</span>'
          : '<span class="status-badge open">Ouvert</span>';
        const hoursDisplay = isClosed
          ? "Fermé toute la journée"
          : `${this.escapeHtml(item.on)} — ${this.escapeHtml(item.off)}`;
        const desc = item.description ? `<span class="item-desc">${this.escapeHtml(item.description)}</span>` : "";

        return `
          <li class="drawer-list-item">
            <div class="item-date-row">
              <span>${dateDisplay}</span>
              ${statusBadge}
            </div>
            <div class="item-hours-row" style="margin-top: 4px; font-size: 0.9em;">
              <span>Horaires : <code>${hoursDisplay}</code></span>
            </div>
            ${desc}
          </li>
        `;
      })
      .join("");
  }

  formatFrDate(isoStr) {
    if (!isoStr || typeof isoStr !== "string") return isoStr;
    const parts = isoStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return isoStr;
  }

  escapeHtml(str) {
    if (typeof str !== "string") return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

/**
 * Functional convenience helper for initializing schedule view
 */
export function initScheduleView(options = {}) {
  if (!globalController) {
    globalController = new ScheduleViewController(options);
    globalController.init();
  }
  return globalController;
}

/**
 * Functional convenience helper for fetching and rendering schedule
 */
export function fetchAndRenderSchedule(silent = false) {
  if (globalController) {
    return globalController.fetchSchedule(silent);
  }
}
