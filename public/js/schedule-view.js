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
    this.searchQuery = "";
    this.isOpen = false;
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
        this.searchQuery = (e.target.value || "").trim().toLowerCase();
        if (this.clearSearchBtn) {
          this.clearSearchBtn.hidden = !this.searchQuery;
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
      }
    } catch {
      // Network failed: fallback to offline cache
      this.loadFromCache();
    } finally {
      if (this.refreshBtn) {
        this.refreshBtn.disabled = false;
        const label = this.refreshBtn.querySelector(".refresh-label");
        if (label) label.textContent = "Actualiser";
      }
    }
  }

  render(isCached = false, brusselsTime = null) {
    if (!this.schedule) return;

    this.renderMeta(isCached);
    this.renderWeeklyTable(brusselsTime);
    this.renderHolidays();
    this.renderWhitelist();
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

    // Determine current day of week in Brussels
    let currentBrusselsDay = "";
    try {
      currentBrusselsDay = (
        brusselsTime?.weekday ||
        new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Brussels", weekday: "long" }).format(new Date())
      ).toLowerCase();
    } catch {
      currentBrusselsDay = "monday";
    }

    const query = this.searchQuery;
    let html = "";
    let visibleCount = 0;

    for (const d of days) {
      const dayData = this.schedule[d.key] || { on: "00:00", off: "00:00" };
      const isClosed = dayData.on === "00:00" && dayData.off === "00:00";
      const isToday = d.key === currentBrusselsDay;

      // Filter check
      if (query) {
        const matchName = d.label.toLowerCase().includes(query);
        const matchHours = `${dayData.on} ${dayData.off}`.includes(query);
        const matchStatus = (isClosed ? "fermé" : "ouvert").includes(query);
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
          <td><strong>${d.label}</strong> ${todayBadge}</td>
          <td><code>${dayData.on}</code></td>
          <td><code>${dayData.off}</code></td>
          <td>${statusBadge}</td>
        </tr>
      `;
    }

    if (visibleCount === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Aucun jour ne correspond au filtre "${this.escapeHtml(query)}"</td></tr>`;
    } else {
      tbody.innerHTML = html;
    }
  }

  renderHolidays() {
    if (typeof document === 'undefined') return;
    const listEl = document.getElementById("holidays-list");
    const countBadge = document.getElementById("holidays-count-badge");
    if (!listEl) return;

    const holidays = Array.isArray(this.schedule.holidays) ? this.schedule.holidays : [];
    const query = this.searchQuery;

    const filtered = holidays.filter((h) => {
      if (!query) return true;
      const str = `${h.start} ${h.end} ${h.description || ""}`.toLowerCase();
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
          ? `Le ${this.formatFrDate(h.start)}`
          : `Du ${this.formatFrDate(h.start)} au ${this.formatFrDate(h.end)}`;
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

    const whitelist = Array.isArray(this.schedule.whitelist) ? this.schedule.whitelist : [];
    const query = this.searchQuery;

    const filtered = whitelist.filter((item) => {
      const dateStr = typeof item === "string" ? item : (item.date || "");
      const reason = typeof item === "object" ? (item.reason || "") : "";
      if (!query) return true;
      return `${dateStr} ${reason}`.toLowerCase().includes(query);
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
              <span>Le ${this.formatFrDate(dateStr)}</span>
              <span class="status-badge open">Ouvert</span>
            </div>
            ${reason}
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
