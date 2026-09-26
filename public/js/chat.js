/**
 * public/js/chat.js
 * Chat State Manager, Gemini API Communication, and Action Confirmation Workflow
 */

export const ERROR_MESSAGES = {
  offline: "Oups, pas de connexion Internet ! 📡 Vérifiez votre réseau pour papoter avec le bot et mettre à jour les horaires.",
  aiTimeout: "Le bot prend un petit café ☕ (ou le réseau fait une pause). Réessayez dans quelques instants !",
  githubCommitFail: "Petit accroc technique dans la salle des machines 🚂 Impossible d'enregistrer pour l'instant. Pas d'inquiétude, le planning actuel reste inchangé.",
  ambiguousDates: "Je ne suis pas tout à fait sûr d'avoir bien compris les dates 🧐 Pouvez-vous me préciser ça ? (Ex: 'fermer du 14 au 17 mai') ",
  appUpdate: "Une nouvelle version toute fraîche est prête ! 🚀 Cliquez pour recharger.",
};

let globalChatManager = null;

export class ChatManager {
  /**
   * @param {object} [options={}]
   * @param {HTMLElement} [options.messagesContainer]
   * @param {HTMLFormElement} [options.chatForm]
   * @param {HTMLInputElement} [options.chatInput]
   * @param {HTMLButtonElement} [options.chatSubmit]
   * @param {Function} [options.onScheduleUpdated]
   * @param {Function} [options.getScheduleSha]
   */
  constructor(options = {}) {
    this.messagesContainer = options.messagesContainer || (typeof document !== 'undefined' ? document.getElementById("chat-messages") : null);
    this.chatForm = options.chatForm || (typeof document !== 'undefined' ? document.getElementById("chat-form") : null);
    this.chatInput = options.chatInput || (typeof document !== 'undefined' ? document.getElementById("chat-input") : null);
    this.chatSubmit = options.chatSubmit || (typeof document !== 'undefined' ? document.getElementById("chat-submit") : null);
    this.onScheduleUpdated = options.onScheduleUpdated;
    this.getScheduleSha = options.getScheduleSha;

    this.history = []; // Sliding window of max 10 messages sent to Gemini
    this.currentSha = null;
    this.isSubmitting = false;
  }

  init() {
    if (!this.chatForm) return;

    this.chatForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const message = this.chatInput ? this.chatInput.value.trim() : "";
      if (!message || this.isSubmitting) return;
      this.sendMessage(message);
    });
  }

  /**
   * Sets the latest Git blob SHA for optimistic locking.
   * @param {string} sha
   */
  setSha(sha) {
    if (sha) this.currentSha = sha;
  }

  /**
   * Sends user message to /api/chat and handles response.
   * @param {string} messageText
   */
  async sendMessage(messageText) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.appendBotMessage(ERROR_MESSAGES.offline);
      return;
    }

    // 1. Render User Message
    this.appendUserMessage(messageText);
    if (this.chatInput) this.chatInput.value = "";
    this.setSubmittingState(true);

    // 2. Show Typing Indicator
    const typingIndicatorEl = this.showTypingIndicator();
    this.scrollToBottom();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText,
          history: this.history.slice(-10),
        }),
      });

      if (typingIndicatorEl) typingIndicatorEl.remove();

      if (!response.ok) {
        let errData = {};
        try {
          errData = await response.json();
        } catch {
          // ignore json parse error
        }

        const isTimeout = response.status === 504 || response.status === 502;
        const errMsg = errData.error || (isTimeout ? ERROR_MESSAGES.aiTimeout : ERROR_MESSAGES.aiTimeout);
        this.appendBotErrorWithRetry(errMsg, messageText);
        return;
      }

      const data = await response.json();
      const { reply, proposedAction, currentSha } = data;

      if (currentSha) {
        this.currentSha = currentSha;
      }

      // 3. Update Conversation History (sliding window)
      this.history.push({ role: "user", parts: [{ text: messageText }] });
      this.history.push({ role: "model", parts: [{ text: reply }] });
      if (this.history.length > 10) {
        this.history = this.history.slice(-10);
      }

      // 4. Render Bot Reply & Action Confirmation Card
      this.appendBotMessage(reply, proposedAction, currentSha);

    } catch {
      if (typingIndicatorEl) typingIndicatorEl.remove();
      this.appendBotErrorWithRetry(ERROR_MESSAGES.aiTimeout, messageText);
    } finally {
      this.setSubmittingState(false);
      this.scrollToBottom();
    }
  }

  /**
   * Appends user message bubble to chat feed.
   * @param {string} text
   */
  appendUserMessage(text) {
    if (!this.messagesContainer) return;
    const row = document.createElement("div");
    row.className = "message-row message-user";
    row.innerHTML = `
      <div class="message-bubble">
        <div class="message-header">
          <span class="message-sender">Vous</span>
          <time class="message-time">${this.formatBrusselsTime()}</time>
        </div>
        <div class="message-body">
          <p>${this.escapeHtml(text)}</p>
        </div>
      </div>
    `;
    this.messagesContainer.appendChild(row);
    this.scrollToBottom();
  }

  /**
   * Appends assistant message bubble with optional action card.
   * @param {string} text
   * @param {object|null} [proposedAction=null]
   * @param {string|null} [actionSha=null]
   */
  appendBotMessage(text, proposedAction = null, actionSha = null) {
    if (!this.messagesContainer) return;
    const row = document.createElement("div");
    row.className = "message-row message-bot";

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";

    const header = document.createElement("div");
    header.className = "message-header";
    header.innerHTML = `
      <span class="message-sender">Assistant Kiosque</span>
      <time class="message-time">${this.formatBrusselsTime()}</time>
    `;
    bubble.appendChild(header);

    const body = document.createElement("div");
    body.className = "message-body";
    body.innerHTML = this.renderMarkdown(text);
    bubble.appendChild(body);

    // If Gemini proposed an action, append interactive card
    if (proposedAction && proposedAction.name) {
      const card = this.createActionCard(proposedAction, actionSha || this.currentSha);
      bubble.appendChild(card);
    }

    row.innerHTML = `<div class="message-avatar" aria-hidden="true">🤖</div>`;
    row.appendChild(bubble);
    this.messagesContainer.appendChild(row);
    this.scrollToBottom();
  }

  /**
   * Appends an error message bubble with an inline [Réessayer 🔄] button.
   * @param {string} errorText
   * @param {string} originalMessage
   */
  appendBotErrorWithRetry(errorText, originalMessage) {
    if (!this.messagesContainer) return;
    const row = document.createElement("div");
    row.className = "message-row message-bot";

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.style.borderColor = "var(--color-amber-border)";
    bubble.style.backgroundColor = "var(--color-amber-bg)";

    bubble.innerHTML = `
      <div class="message-header">
        <span class="message-sender" style="color: var(--color-amber-text);">Assistant (Erreur)</span>
        <time class="message-time" style="color: var(--color-amber-text);">${this.formatBrusselsTime()}</time>
      </div>
      <div class="message-body" style="color: var(--color-amber-text);">
        <p>${this.escapeHtml(errorText)}</p>
      </div>
      <div style="margin-top: 8px;">
        <button type="button" class="btn-action-retry">
          <span>Réessayer 🔄</span>
        </button>
      </div>
    `;

    const retryBtn = bubble.querySelector(".btn-action-retry");
    if (retryBtn) {
      retryBtn.addEventListener("click", () => {
        row.remove();
        this.sendMessage(originalMessage);
      });
    }

    row.innerHTML = `<div class="message-avatar" style="background-color: var(--color-amber-warning);">☕</div>`;
    row.appendChild(bubble);
    this.messagesContainer.appendChild(row);
    this.scrollToBottom();
  }

  /**
   * Creates the Interactive Action Confirmation Card element.
   * @param {object} action
   * @param {string} sha
   * @returns {HTMLElement}
   */
  createActionCard(action, sha) {
    const card = document.createElement("div");
    card.className = "action-confirmation-card action-card confirmation-card";

    const actionBadgeLabel = this.getActionTitle(action.name);
    const summary = action.summary || `${action.name}: ${JSON.stringify(action.args)}`;
    const detailsHtml = this.formatActionDetails(action.name, action.args);

    card.innerHTML = `
      <div class="action-card-header">
        <span aria-hidden="true">🗓️</span>
        <span>${actionBadgeLabel}</span>
      </div>
      <div class="action-card-body">
        <div class="action-card-summary">${this.escapeHtml(summary)}</div>
        <div class="action-card-details">
          ${detailsHtml}
        </div>
      </div>
      <div class="action-card-footer">
        <button type="button" class="btn-action-confirm btn-confirm">
          <span class="btn-text">Confirmer</span>
        </button>
        <button type="button" class="btn-action-cancel btn-cancel">
          <span class="btn-text">Annuler</span>
        </button>
      </div>
    `;

    const confirmBtn = card.querySelector(".btn-action-confirm");
    const cancelBtn = card.querySelector(".btn-action-cancel");
    const footer = card.querySelector(".action-card-footer");

    // Handle Confirm Click
    if (confirmBtn) {
      confirmBtn.addEventListener("click", async () => {
        await this.executeConfirm(card, action, sha, footer);
      });
    }

    // Handle Cancel Click
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        footer.innerHTML = `
          <div class="action-status-badge badge-canceled">
            <span>❌ Action annulée (planning inchangé).</span>
          </div>
        `;
      });
    }

    return card;
  }

  /**
   * Executes the confirmation request to /api/confirm and updates the action card footer.
   * Reusable across initial confirm and subsequent retry clicks.
   * @param {HTMLElement} card
   * @param {object} action
   * @param {string|null} sha
   * @param {HTMLElement} footer
   */
  async executeConfirm(card, action, sha, footer) {
    const confirmBtn = footer.querySelector(".btn-action-confirm");
    const cancelBtn = footer.querySelector(".btn-action-cancel");
    const retryBtn = footer.querySelector(".btn-action-retry");

    if (confirmBtn) {
      confirmBtn.disabled = true;
      const textSpan = confirmBtn.querySelector(".btn-text");
      if (textSpan) textSpan.textContent = "Enregistrement sur GitHub...";
    }
    if (cancelBtn) {
      cancelBtn.disabled = true;
    }
    if (retryBtn) {
      retryBtn.disabled = true;
      retryBtn.textContent = "Nouvelle tentative... ⏳";
    }

    const targetSha = (this.getScheduleSha ? this.getScheduleSha() : null) || this.currentSha || sha;

    try {
      const res = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: action.name,
          payload: action.args,
          sha: targetSha,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        if (data.newFileSha) this.currentSha = data.newFileSha;
        footer.innerHTML = `
          <div class="action-status-badge badge-success">
            <span>✅ Horaires mis à jour et enregistrés avec succès sur GitHub.</span>
          </div>
        `;
        if (this.onScheduleUpdated) {
          this.onScheduleUpdated();
        }
      } else {
        // GitHub commit failure / Conflict (HTTP 409)
        const errMsg = data.error || ERROR_MESSAGES.githubCommitFail;
        this.renderConfirmError(card, action, sha, footer, errMsg);
      }
    } catch {
      this.renderConfirmError(card, action, sha, footer, ERROR_MESSAGES.githubCommitFail);
    }
  }

  /**
   * Renders the error badge in the action card footer with operational [Réessayer 🔄] and [Fermer] buttons.
   * @param {HTMLElement} card
   * @param {object} action
   * @param {string|null} sha
   * @param {HTMLElement} footer
   * @param {string} errMsg
   */
  renderConfirmError(card, action, sha, footer, errMsg) {
    footer.innerHTML = `
      <div class="action-status-badge badge-error">
        <span>${this.escapeHtml(errMsg)}</span>
        <div style="margin-top: 6px; display: flex; gap: 8px;">
          <button type="button" class="btn-action-retry">Réessayer 🔄</button>
          <button type="button" class="btn-action-cancel btn-cancel">Fermer</button>
        </div>
      </div>
    `;

    const retryBtn = footer.querySelector(".btn-action-retry");
    const closeBtn = footer.querySelector(".btn-action-cancel");

    if (retryBtn) {
      retryBtn.addEventListener("click", async () => {
        await this.executeConfirm(card, action, sha, footer);
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        footer.innerHTML = `
          <div class="action-status-badge badge-canceled">
            <span>❌ Action non appliquée. Le planning reste inchangé.</span>
          </div>
        `;
      });
    }

    return card;
  }

  getActionTitle(name) {
    switch (name) {
      case "propose_holiday": return "Fermeture Exceptionnelle (Congés)";
      case "propose_remove_holiday": return "Réouverture de la Gare";
      case "propose_whitelist": return "Ouverture Exceptionnelle (Férié)";
      case "propose_schedule_change": return "Modification des Horaires Habituels";
      case "propose_special_schedule":
      case "propose_exceptional_schedule": return "Horaire Particulier Exceptionnel";
      case "propose_remove_special_schedule":
      case "propose_remove_exceptional_schedule": return "Suppression d'Horaire Exceptionnel";
      default: return "Proposition d'Action";
    }
  }

  formatActionDetails(name, args = {}) {
    if (!args) return "";
    switch (name) {
      case "propose_holiday":
      case "propose_remove_holiday": {
        const start = args.start || "";
        const end = args.end || "";
        const desc = args.description ? `<div class="detail-row"><span class="detail-label">Motif :</span><span class="detail-value">${this.escapeHtml(args.description)}</span></div>` : "";
        return `
          <div class="detail-row"><span class="detail-label">Début :</span><span class="detail-value">${this.escapeHtml(start)}</span></div>
          <div class="detail-row"><span class="detail-label">Fin :</span><span class="detail-value">${this.escapeHtml(end)}</span></div>
          ${desc}
        `;
      }
      case "propose_whitelist": {
        const date = args.date || "";
        const reason = args.reason ? `<div class="detail-row"><span class="detail-label">Motif :</span><span class="detail-value">${this.escapeHtml(args.reason)}</span></div>` : "";
        return `
          <div class="detail-row"><span class="detail-label">Date :</span><span class="detail-value">${this.escapeHtml(date)}</span></div>
          ${reason}
        `;
      }
      case "propose_schedule_change": {
        const dayFr = this.getFrenchDay(args.day);
        return `
          <div class="detail-row"><span class="detail-label">Jour :</span><span class="detail-value">${this.escapeHtml(dayFr)} (${this.escapeHtml(args.day)})</span></div>
          <div class="detail-row"><span class="detail-label">Horaires :</span><span class="detail-value">${this.escapeHtml(args.on)} — ${this.escapeHtml(args.off)}</span></div>
        `;
      }
      case "propose_special_schedule":
      case "propose_exceptional_schedule": {
        const start = args.start || args.date || "";
        const end = args.end || args.date || start;
        const isSingleDay = start === end;
        const desc = args.description ? `<div class="detail-row"><span class="detail-label">Motif :</span><span class="detail-value">${this.escapeHtml(args.description)}</span></div>` : "";
        const dateHtml = isSingleDay
          ? `<div class="detail-row"><span class="detail-label">Date :</span><span class="detail-value">${this.escapeHtml(start)}</span></div>`
          : `<div class="detail-row"><span class="detail-label">Période :</span><span class="detail-value">Du ${this.escapeHtml(start)} au ${this.escapeHtml(end)}</span></div>`;
        const hoursHtml = (args.on === "00:00" && args.off === "00:00")
          ? `<div class="detail-row"><span class="detail-label">Horaires :</span><span class="detail-value"><em>Fermé toute la journée</em></span></div>`
          : `<div class="detail-row"><span class="detail-label">Horaires :</span><span class="detail-value"><code>${this.escapeHtml(args.on)}</code> — <code>${this.escapeHtml(args.off)}</code></span></div>`;
        return `
          ${dateHtml}
          ${hoursHtml}
          ${desc}
        `;
      }
      case "propose_remove_special_schedule":
      case "propose_remove_exceptional_schedule": {
        const start = args.start || args.date || "";
        const end = args.end || args.date || start;
        const isSingleDay = start === end;
        return isSingleDay
          ? `<div class="detail-row"><span class="detail-label">Date :</span><span class="detail-value">${this.escapeHtml(start)}</span></div>`
          : `<div class="detail-row"><span class="detail-label">Période :</span><span class="detail-value">Du ${this.escapeHtml(start)} au ${this.escapeHtml(end)}</span></div>`;
      }
      default:
        return `<pre style="font-size: 11px;">${this.escapeHtml(JSON.stringify(args, null, 2))}</pre>`;
    }
  }

  getFrenchDay(day) {
    const days = {
      monday: "Lundi",
      tuesday: "Mardi",
      wednesday: "Mercredi",
      thursday: "Jeudi",
      friday: "Vendredi",
      saturday: "Samedi",
      sunday: "Dimanche"
    };
    return days[day?.toLowerCase()] || day;
  }

  showTypingIndicator() {
    if (!this.messagesContainer) return null;
    const row = document.createElement("div");
    row.className = "message-row message-bot";
    row.id = "typing-indicator-row";
    row.innerHTML = `
      <div class="message-avatar" aria-hidden="true">🤖</div>
      <div class="message-bubble">
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    `;
    this.messagesContainer.appendChild(row);
    return row;
  }

  setSubmittingState(isSubmitting) {
    this.isSubmitting = isSubmitting;
    const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (this.chatInput) {
      this.chatInput.disabled = isSubmitting || !online;
      if (!isSubmitting && online) {
        this.chatInput.focus();
      }
    }
    if (this.chatSubmit) {
      this.chatSubmit.disabled = isSubmitting || !online;
    }
  }

  scrollToBottom() {
    if (!this.messagesContainer) return;
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
      });
    } else {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  renderMarkdown(text) {
    if (!text) return "";
    let safe = this.escapeHtml(text);

    // Bold **text**
    safe = safe.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    // Italic *text*
    safe = safe.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");

    // Inline code `code`
    safe = safe.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Unordered lists (- item)
    const lines = safe.split("\n");
    let inList = false;
    const result = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
        if (!inList) {
          result.push("<ul class=\"chat-list\">");
          inList = true;
        }
        result.push(`<li>${trimmed.substring(2)}</li>`);
      } else {
        if (inList) {
          result.push("</ul>");
          inList = false;
        }
        if (trimmed.length > 0) {
          result.push(`<p>${line}</p>`);
        }
      }
    }
    if (inList) {
      result.push("</ul>");
    }

    return result.join("");
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

  formatBrusselsTime() {
    try {
      return new Intl.DateTimeFormat("fr-BE", {
        timeZone: "Europe/Brussels",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date());
    } catch {
      return "";
    }
  }
}

/**
 * Functional convenience helper for initializing chat
 */
export function initChat(options = {}) {
  if (!globalChatManager) {
    globalChatManager = new ChatManager(options);
    globalChatManager.init();
  }
  return globalChatManager;
}
