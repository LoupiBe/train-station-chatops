/**
 * public/js/chat.js
 * Chat State Manager, Gemini API Communication, and Action Confirmation Workflow
 */

import { hardPurgeAndReload } from "./sw-register.js";
import {
  createCanvas,
  fitWithMargins,
  cropFill,
  isImageOpaque,
  ensureFontLoaded,
  sanitizeSlug,
  buildAdFilename,
  generateTextBanner,
} from "./image-processor.js";

export const ERROR_MESSAGES = {
  offline: "Oups, pas de connexion Internet ! 📡 Vérifiez votre réseau pour papoter avec le bot et mettre à jour les horaires.",
  aiTimeout: "Le bot prend un petit café ☕ (ou le réseau fait une pause). Réessayez dans quelques instants !",
  githubCommitFail: "Petit accroc technique dans la salle des machines 🚂 Impossible d'enregistrer pour l'instant. Pas d'inquiétude, le planning actuel reste inchangé.",
  ambiguousDates: "Je ne suis pas tout à fait sûr d'avoir bien compris les dates 🧐 Pouvez-vous me préciser ça ? (Ex: 'fermer du 14 au 17 mai') ",
  appUpdate: "Une nouvelle version toute fraîche est prête ! 🚀 Cliquez pour recharger.",
  shaConflict: "⚠️ Le planning a été modifié entre-temps par un autre collaborateur. Les horaires viennent d'être rafraîchis. Veuillez revérifier les horaires actuels avant de renouveler votre demande.",
};

export const RELOAD_MESSAGES = {
  hardReloadExecuting: "C'est parti ! Vidage complet des caches et rechargement forcé de La Station en cours... 🔄",
  dataRefreshSuccess: "C'est fait ! Les horaires et le planning viennent d'être synchronisés et rafraîchis en direct ☕",
  dataRefreshError: "Petit accroc technique lors de la synchronisation des horaires 📡 Veuillez vérifier votre connexion.",
};

/**
 * Checks if user message requests a forced application reload or cache purge.
 * Matches explicit French & English synonyms: "rafraîchissement forcé", "force le refresh",
 * "hard reload", "vide le cache et recharge", "purger le cache", "mode forcé", etc.
 * @param {string} text
 * @returns {boolean}
 */
export function isForcedReloadRequest(text) {
  if (!text || typeof text !== "string") return false;
  const normalized = text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

  return (
    /\b(forc(?:e|er|e|ee|ement)?\s+(?:le\s+)?(?:rafraich(?:issement|er)?|recharg(?:ement|er)?|refresh|reload))\b/.test(normalized) ||
    /\b(?:rafraich(?:issement|er)?|recharg(?:ement|er)?|refresh|reload)\s+forc(?:e|ee)?\b/.test(normalized) ||
    /\b(?:hard\s*reload|force\s*refresh|hard\s*refresh)\b/.test(normalized) ||
    /\b(?:vid(?:e|er|ez)?|purg(?:e|er|ez)?|nettoy(?:e|er|ez)?|reinitialis(?:e|er|ez)?)\s+(?:le\s+)?cache\b/.test(normalized) ||
    /\bcache\s+(?:vid(?:e|ee)?|purg(?:e|ee)?|nettoy(?:e|ee)?)\b/.test(normalized) ||
    /\bmode\s+forc(?:e|ee)?\b/.test(normalized)
  );
}

/**
 * Checks if user message requests a live schedule/data refresh without full page reload.
 * Matches synonyms: "rafraîchis les horaires", "synchronise le planning", "actualise les données", "mets à jour l'affichage", etc.
 * @param {string} text
 * @returns {boolean}
 */
export function isDataRefreshRequest(text) {
  if (!text || typeof text !== "string") return false;
  if (isForcedReloadRequest(text)) return false;

  const normalized = text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

  return (
    /\b(?:rafraich(?:ir|is|it|er|e)?|actualis(?:er|e)?|synchronis(?:er|e)?|sync|recharg(?:er|e)?)\s+(?:les?\s+|la\s+|l'|du\s+)?(?:horaires|planning|donnees|affichage)\b/.test(normalized) ||
    /\b(?:mets?|mettre)\s+a\s+jour\s+(?:les?\s+|la\s+|l'|du\s+)?(?:horaires|planning|l'affichage|affichage|donnees)\b/.test(normalized) ||
    /\b(?:verifi(?:er|e)?)\s+(?:les?\s+|le\s+)?(?:horaires|planning)\s+(?:en\s+direct|sur\s+github|a\s+jour)\b/.test(normalized)
  );
}

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
   * @param {Function} [options.onHardReload]
   */
  constructor(options = {}) {
    this.messagesContainer = options.messagesContainer || (typeof document !== 'undefined' ? document.getElementById("chat-messages") : null);
    this.chatForm = options.chatForm || (typeof document !== 'undefined' ? document.getElementById("chat-form") : null);
    this.chatInput = options.chatInput || (typeof document !== 'undefined' ? document.getElementById("chat-input") : null);
    this.chatSubmit = options.chatSubmit || (typeof document !== 'undefined' ? document.getElementById("chat-submit") : null);
    this.onScheduleUpdated = options.onScheduleUpdated;
    this.getScheduleSha = options.getScheduleSha;
    this.onHardReload = options.onHardReload || hardPurgeAndReload;

    this.history = []; // Sliding window of max 10 messages sent to Gemini
    this.currentSha = null;
    this.isSubmitting = false;
  }

  init() {
    if (this.chatForm) {
      this.chatForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const message = this.chatInput ? this.chatInput.value.trim() : "";
        if (!message || this.isSubmitting) return;
        this.sendMessage(message);
      });
    }

    // Wire Upload Button & Hidden File Input
    const uploadBtn = typeof document !== "undefined" ? document.getElementById("btn-upload-ad") : null;
    const fileInput = typeof document !== "undefined" ? document.getElementById("ad-file-input") : null;
    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (file) {
          this.handleImageFile(file);
          e.target.value = "";
        }
      });
    }

    // Wire Drag and Drop
    if (typeof document !== "undefined") {
      document.addEventListener("dragover", (e) => {
        if (e.dataTransfer?.types?.includes("Files")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      });

      document.addEventListener("drop", (e) => {
        if (e.dataTransfer?.files?.length) {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) {
            this.handleImageFile(file);
          }
        }
      });

      // Wire Clipboard Paste
      document.addEventListener("paste", (e) => {
        const items = e.clipboardData?.items;
        if (items) {
          for (let i = 0; i < items.length; i++) {
            if (items[i].type?.startsWith("image/")) {
              const file = items[i].getAsFile();
              if (file) {
                e.preventDefault();
                this.handleImageFile(file);
                break;
              }
            }
          }
        }
      });
    }
  }

  /**
   * Processes an uploaded image File and renders an Interactive Action Card for it.
   * @param {File|Blob} file 
   */
  handleImageFile(file) {
    if (!file) return;

    if (!file.type?.startsWith("image/")) {
      const row = document.createElement("div");
      row.className = "message-row message-bot";
      const bubble = document.createElement("div");
      bubble.className = "message-bubble";
      bubble.innerHTML = `
        <div class="message-header">
          <span class="message-sender">Assistant La Station</span>
          <time class="message-time">En direct</time>
        </div>
        <div class="message-body">
          <p>⚠️ Le fichier sélectionné (<code>${this.escapeHtml(file.name || "fichier")}</code>) n'est pas une image valide. Veuillez sélectionner un fichier image (.webp, .png, .jpg).</p>
        </div>
      `;
      row.innerHTML = `<div class="message-avatar" aria-hidden="true">🤖</div>`;
      row.appendChild(bubble);
      if (this.messagesContainer) {
        this.messagesContainer.appendChild(row);
        this.scrollToBottom();
      }
      return;
    }

    if (typeof FileReader === "undefined" || typeof Image === "undefined") return;

    const renderError = (msg) => {
      const row = document.createElement("div");
      row.className = "message-row message-bot";
      const bubble = document.createElement("div");
      bubble.className = "message-bubble";
      bubble.innerHTML = `
        <div class="message-header">
          <span class="message-sender">Assistant La Station</span>
          <time class="message-time">En direct</time>
        </div>
        <div class="message-body">
          <p>⚠️ ${this.escapeHtml(msg)}</p>
        </div>
      `;
      row.innerHTML = `<div class="message-avatar" aria-hidden="true">🤖</div>`;
      row.appendChild(bubble);
      if (this.messagesContainer) {
        this.messagesContainer.appendChild(row);
        this.scrollToBottom();
      }
    };

    const reader = new FileReader();
    reader.onerror = () => {
      renderError("Impossible de lire ce fichier image depuis votre appareil.");
    };
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => {
        renderError(`Impossible de décoder l'image '${file.name}'. Le fichier semble endommagé ou corrompu.`);
      };
      img.onload = () => {
        const row = document.createElement("div");
        row.className = "message-row message-bot";
        const bubble = document.createElement("div");
        bubble.className = "message-bubble";
        bubble.innerHTML = `
          <div class="message-header">
            <span class="message-sender">Assistant La Station</span>
            <time class="message-time">En direct</time>
          </div>
          <div class="message-body">
            <p>Voici l'affiche que vous venez d'importer. Choisissez le mode de cadrage et vérifiez les métadonnées ci-dessous avant de publier sur le kiosque :</p>
          </div>
        `;
        const card = this.createImageAdCard(img, file.name);
        bubble.appendChild(card);
        row.innerHTML = `<div class="message-avatar" aria-hidden="true">🤖</div>`;
        row.appendChild(bubble);
        if (this.messagesContainer) {
          this.messagesContainer.appendChild(row);
          this.scrollToBottom();
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
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
    const trimmed = (messageText || "").trim();
    if (!trimmed) return;

    // Fast-path 1: Forced application reload & cache purge
    if (isForcedReloadRequest(trimmed)) {
      this.appendUserMessage(trimmed);
      if (this.chatInput) this.chatInput.value = "";
      this.appendBotMessage(RELOAD_MESSAGES.hardReloadExecuting);
      this.scrollToBottom();
      setTimeout(async () => {
        if (typeof this.onHardReload === "function") {
          await this.onHardReload();
        }
      }, 300);
      return;
    }

    // Fast-path 2: Live data & schedule refresh (without full page reload)
    if (isDataRefreshRequest(trimmed)) {
      this.appendUserMessage(trimmed);
      if (this.chatInput) this.chatInput.value = "";
      this.setSubmittingState(true);
      const typingIndicatorEl = this.showTypingIndicator();
      this.scrollToBottom();
      try {
        if (typeof this.onScheduleUpdated === "function") {
          await this.onScheduleUpdated();
        }
        if (typingIndicatorEl) typingIndicatorEl.remove();
        this.appendBotMessage(RELOAD_MESSAGES.dataRefreshSuccess);
        this.history.push({ role: "user", parts: [{ text: trimmed }] });
        this.history.push({ role: "model", parts: [{ text: RELOAD_MESSAGES.dataRefreshSuccess }] });
        if (this.history.length > 10) this.history = this.history.slice(-10);
      } catch {
        if (typingIndicatorEl) typingIndicatorEl.remove();
        this.appendBotMessage(RELOAD_MESSAGES.dataRefreshError);
      } finally {
        this.setSubmittingState(false);
        this.scrollToBottom();
      }
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.appendBotMessage(ERROR_MESSAGES.offline);
      return;
    }

    // 1. Render User Message
    this.appendUserMessage(trimmed);
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
          message: trimmed,
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
        this.appendBotErrorWithRetry(errMsg, trimmed);
        return;
      }

      const data = await response.json();
      const { reply, proposedAction, currentSha } = data;

      if (currentSha) {
        this.currentSha = currentSha;
      }

      // Check for hard reload action returned by Gemini
      if (proposedAction && proposedAction.name === "hard_reload_app") {
        const botReply = reply || RELOAD_MESSAGES.hardReloadExecuting;
        this.appendBotMessage(botReply);
        this.scrollToBottom();
        setTimeout(async () => {
          if (typeof this.onHardReload === "function") {
            await this.onHardReload();
          }
        }, 300);
        return;
      }

      // Check for data refresh action returned by Gemini
      if (proposedAction && (proposedAction.name === "refresh_schedule_data" || proposedAction.name === "refresh_data")) {
        if (typeof this.onScheduleUpdated === "function") {
          await this.onScheduleUpdated().catch(() => {});
        }
        const botReply = reply || RELOAD_MESSAGES.dataRefreshSuccess;
        this.appendBotMessage(botReply);
        this.history.push({ role: "user", parts: [{ text: trimmed }] });
        this.history.push({ role: "model", parts: [{ text: botReply }] });
        if (this.history.length > 10) this.history = this.history.slice(-10);
        return;
      }

      // 3. Update Conversation History (sliding window)
      this.history.push({ role: "user", parts: [{ text: trimmed }] });
      this.history.push({ role: "model", parts: [{ text: reply }] });
      if (this.history.length > 10) {
        this.history = this.history.slice(-10);
      }

      // 4. Render Bot Reply & Action Confirmation Card
      this.appendBotMessage(reply, proposedAction, currentSha);

    } catch {
      if (typingIndicatorEl) typingIndicatorEl.remove();
      this.appendBotErrorWithRetry(ERROR_MESSAGES.aiTimeout, trimmed);
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

    // If Gemini proposed an action, append interactive card (except for direct auto-actions)
    if (
      proposedAction &&
      proposedAction.name &&
      proposedAction.name !== "hard_reload_app" &&
      proposedAction.name !== "refresh_schedule_data" &&
      proposedAction.name !== "refresh_data" &&
      proposedAction.name !== "list_ads"
    ) {
      if (proposedAction.name === "propose_generate_text_ad") {
        this.createTextAdCard(proposedAction, actionSha || this.currentSha).then((card) => {
          bubble.appendChild(card);
          this.scrollToBottom();
        });
      } else {
        const card = this.createActionCard(proposedAction, actionSha || this.currentSha);
        bubble.appendChild(card);
      }
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
   * Creates an Interactive Action Card for an uploaded image banner.
   * @param {HTMLImageElement|ImageBitmap} img 
   * @param {string} [sourceName="affiche"] 
   * @returns {HTMLElement}
   */
  createImageAdCard(img, sourceName = "affiche") {
    const card = document.createElement("div");
    card.className = "action-confirmation-card action-card confirmation-card action-card-image-ad";

    const imgW = img.naturalWidth || img.width || 1280;
    const imgH = img.naturalHeight || img.height || 200;
    const isExact = imgW === 1280 && imgH === 200;

    const canvas = createCanvas(1280, 200);
    canvas.className = "ad-canvas-preview";

    let initialMode = "fit-blur";
    let initialOpaque = true;

    // Sample the source image directly to determine whether it has transparent pixels
    const sampleW = Math.min(imgW, 320);
    const sampleH = Math.min(imgH, 200);
    const sampleCanvas = createCanvas(sampleW, sampleH);
    const sampleCtx = sampleCanvas.getContext ? sampleCanvas.getContext("2d") : null;
    let isSourceOpaque = true;
    if (sampleCtx) {
      sampleCtx.drawImage(img, 0, 0, sampleW, sampleH);
      isSourceOpaque = isImageOpaque(sampleCtx, sampleW, sampleH);
    }

    if (isExact) {
      initialMode = "fill-center";
      cropFill(img, "center", { canvas });
      initialOpaque = isSourceOpaque;
    } else if (isSourceOpaque) {
      initialMode = "fit-blur";
      fitWithMargins(img, { blurBackground: true, canvas });
      initialOpaque = true;
    } else {
      initialMode = "fit-transparent";
      fitWithMargins(img, { blurBackground: false, canvas });
      initialOpaque = false;
    }

    const defaultSlug = sanitizeSlug(sourceName.replace(/\.[^/.]+$/, "")) || "affiche";

    card.innerHTML = `
      <div class="action-card-header">
        <span aria-hidden="true">🖼️</span>
        <span>Affiche Publicitaire (Upload)</span>
      </div>
      <div class="action-card-body">
        <div class="ad-preview-wrapper"></div>

        <div class="ad-preset-bar" role="group" aria-label="Mode de cadrage de l'image">
          <span class="preset-group-title">Cadrage :</span>
          <button type="button" class="btn-preset ${initialMode === 'fit-blur' ? 'active' : ''}" data-mode="fit-blur">Ajuster + Flou</button>
          <button type="button" class="btn-preset ${initialMode === 'fit-transparent' ? 'active' : ''}" data-mode="fit-transparent">Ajuster + Transparent</button>
          <div class="preset-fill-group">
            <span class="preset-sublabel">Remplir :</span>
            <button type="button" class="btn-preset ${initialMode === 'fill-top' ? 'active' : ''}" data-mode="fill-top">Haut</button>
            <button type="button" class="btn-preset ${initialMode === 'fill-center' ? 'active' : ''}" data-mode="fill-center">Centre</button>
            <button type="button" class="btn-preset ${initialMode === 'fill-bottom' ? 'active' : ''}" data-mode="fill-bottom">Bas</button>
          </div>
        </div>

        <div class="ad-meta-grid">
          <div class="ad-meta-field">
            <label class="ad-meta-label">Durée (secondes)</label>
            <input type="number" class="ad-meta-input ad-duration" value="15" min="1" max="120">
          </div>
          <div class="ad-meta-field">
            <label class="ad-meta-label">Date d'expiration</label>
            <input type="date" class="ad-meta-input ad-expiry">
          </div>
          <div class="ad-meta-field">
            <label class="ad-meta-label">Identifiant (slug)</label>
            <input type="text" class="ad-meta-input ad-slug" value="${this.escapeHtml(defaultSlug)}">
          </div>
        </div>

        <div class="tag-checkbox-container">
          <label class="tag-checkbox-label">
            <input type="checkbox" class="tag-checkbox ad-tag-f" ${initialOpaque ? 'checked' : ''}>
            <div>
              <span class="tag-checkbox-title">Fond opaque (Tag F)</span>
              <span class="tag-checkbox-desc">Cochez si le visuel a un fond opaque afin de relever les crédits du kiosque. Laissez décoché si le fond est transparent.</span>
            </div>
          </label>
        </div>

        <div class="ad-filename-preview-row">
          <span class="ad-meta-label">Nom du fichier final :</span>
          <span class="ad-filename-preview"></span>
        </div>
      </div>
      <div class="action-card-footer">
        <button type="button" class="btn-action-confirm btn-confirm">
          <span class="btn-text">Publier sur GitHub 🚀</span>
        </button>
        <button type="button" class="btn-action-cancel btn-cancel">
          <span class="btn-text">Annuler</span>
        </button>
      </div>
    `;

    const previewWrapper = card.querySelector(".ad-preview-wrapper");
    previewWrapper.appendChild(canvas);

    const presetBtns = card.querySelectorAll(".btn-preset");
    const durationInput = card.querySelector(".ad-duration");
    const expiryInput = card.querySelector(".ad-expiry");
    const slugInput = card.querySelector(".ad-slug");
    const tagFCheckbox = card.querySelector(".ad-tag-f");
    const filenamePreview = card.querySelector(".ad-filename-preview");
    const confirmBtn = card.querySelector(".btn-action-confirm");
    const cancelBtn = card.querySelector(".btn-action-cancel");
    const footer = card.querySelector(".action-card-footer");

    const updateFilenamePreview = () => {
      const dur = durationInput.value;
      const expiry = expiryInput.value;
      const isOpaque = tagFCheckbox.checked;
      const slugVal = sanitizeSlug(slugInput.value) || "affiche";
      const filename = buildAdFilename({
        duration: dur,
        expiryDate: expiry,
        isOpaque,
        slug: slugVal,
      });
      filenamePreview.textContent = filename;
      return filename;
    };

    updateFilenamePreview();

    slugInput.addEventListener("input", () => {
      slugInput.value = sanitizeSlug(slugInput.value);
      updateFilenamePreview();
    });

    durationInput.addEventListener("input", updateFilenamePreview);
    expiryInput.addEventListener("input", updateFilenamePreview);
    let isTagFUserModified = false;
    tagFCheckbox.addEventListener("change", () => {
      isTagFUserModified = true;
      updateFilenamePreview();
    });

    presetBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        presetBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const mode = btn.dataset.mode;

        if (mode === "fit-blur") {
          fitWithMargins(img, { blurBackground: true, canvas });
        } else if (mode === "fit-transparent") {
          fitWithMargins(img, { blurBackground: false, canvas });
        } else if (mode === "fill-top") {
          cropFill(img, "top", { canvas });
        } else if (mode === "fill-center") {
          cropFill(img, "center", { canvas });
        } else if (mode === "fill-bottom") {
          cropFill(img, "bottom", { canvas });
        }

        // Recalculate Tag F state on preset click unless manually overridden by user
        if (!isTagFUserModified) {
          const isOpaque = isImageOpaque(canvas.getContext("2d"), 1280, 200);
          tagFCheckbox.checked = isOpaque;
        }
        updateFilenamePreview();
      });
    });

    confirmBtn.addEventListener("click", async () => {
      // Preserves manual checkbox edit upon submission
      const filename = updateFilenamePreview();
      let contentBase64 = "";
      if (typeof canvas.toDataURL === "function") {
        const dataUrl = canvas.toDataURL("image/webp", 0.92);
        contentBase64 = dataUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "").trim();
      }
      await this.executeConfirm(
        card,
        {
          name: "upload_ad",
          args: { filename, content: contentBase64 },
          summary: `Mise en ligne de l'affiche : ${filename}`,
        },
        null,
        footer
      );
    });

    cancelBtn.addEventListener("click", () => {
      footer.innerHTML = `
        <div class="action-status-badge badge-canceled">
          <span>❌ Téléversement annulé.</span>
        </div>
      `;
    });

    return card;
  }

  /**
   * Creates an Interactive Action Card for a generated text banner.
   * @param {object} action 
   * @param {string|null} sha 
   * @returns {Promise<HTMLElement>}
   */
  async createTextAdCard(action, sha) {
    const card = document.createElement("div");
    card.className = "action-confirmation-card action-card confirmation-card action-card-text-ad";

    const initialArgs = action.args || {};
    let currentStyle = initialArgs.style === "official" ? "official" : "cafe";
    let currentBg = currentStyle === "cafe" ? "#2c1810" : "#1a365d";
    let currentFg = currentStyle === "cafe" ? "#fef3c7" : "#ffffff";
    const initialText = (initialArgs.text || "").slice(0, 140);
    const defaultSlug = sanitizeSlug(initialArgs.slug || initialArgs.text?.slice(0, 20) || "annonce") || "annonce";

    await ensureFontLoaded('700 48px "Quicksand"');

    const canvas = createCanvas(1280, 200);
    canvas.className = "ad-canvas-preview";

    generateTextBanner({
      text: initialText,
      style: currentStyle,
      bgColor: currentBg,
      textColor: currentFg,
      canvas,
    });

    card.innerHTML = `
      <div class="action-card-header">
        <span aria-hidden="true">🎨</span>
        <span>Bandeau d'Annonce Textuel</span>
      </div>
      <div class="action-card-body">
        <div class="ad-preview-wrapper"></div>

        <div class="text-ad-controls">
          <textarea class="text-ad-textarea" maxlength="140" placeholder="Texte de l'annonce (140 caractères max)...">${this.escapeHtml(initialText)}</textarea>
          <div class="char-counter">${initialText.length} / 140</div>

          <div class="ad-preset-bar" role="group" aria-label="Style typographique">
            <span class="preset-group-title">Style :</span>
            <button type="button" class="btn-style ${currentStyle === 'cafe' ? 'active' : ''}" data-style="cafe">Ambiance Café ☕</button>
            <button type="button" class="btn-style ${currentStyle === 'official' ? 'active' : ''}" data-style="official">Panneau officiel 🚂</button>
          </div>

          <div class="color-controls-row">
            <label class="color-control-item">
              <span>Fond :</span>
              <input type="color" class="ad-color-bg" value="${currentBg}">
            </label>
            <label class="color-control-item">
              <span>Texte :</span>
              <input type="color" class="ad-color-fg" value="${currentFg}">
            </label>
          </div>
        </div>

        <div class="ad-meta-grid">
          <div class="ad-meta-field">
            <label class="ad-meta-label">Durée (secondes)</label>
            <input type="number" class="ad-meta-input ad-duration" value="${initialArgs.duration || 15}" min="1" max="120">
          </div>
          <div class="ad-meta-field">
            <label class="ad-meta-label">Date d'expiration</label>
            <input type="date" class="ad-meta-input ad-expiry" value="${this.escapeHtml(initialArgs.endDate || '')}">
          </div>
          <div class="ad-meta-field">
            <label class="ad-meta-label">Identifiant (slug)</label>
            <input type="text" class="ad-meta-input ad-slug" value="${this.escapeHtml(defaultSlug)}">
          </div>
        </div>

        <div class="tag-checkbox-container">
          <label class="tag-checkbox-label">
            <input type="checkbox" class="tag-checkbox ad-tag-f" checked>
            <div>
              <span class="tag-checkbox-title">Fond opaque (Tag F)</span>
              <span class="tag-checkbox-desc">Cochez si le bandeau a un fond opaque afin de relever les crédits du kiosque.</span>
            </div>
          </label>
        </div>

        <div class="ad-filename-preview-row">
          <span class="ad-meta-label">Nom du fichier final :</span>
          <span class="ad-filename-preview"></span>
        </div>
      </div>
      <div class="action-card-footer">
        <button type="button" class="btn-action-confirm btn-confirm">
          <span class="btn-text">Publier sur GitHub 🚀</span>
        </button>
        <button type="button" class="btn-action-cancel btn-cancel">
          <span class="btn-text">Annuler</span>
        </button>
      </div>
    `;

    const previewWrapper = card.querySelector(".ad-preview-wrapper");
    previewWrapper.appendChild(canvas);

    const textarea = card.querySelector(".text-ad-textarea");
    const charCounter = card.querySelector(".char-counter");
    const styleBtns = card.querySelectorAll(".btn-style");
    const bgPicker = card.querySelector(".ad-color-bg");
    const fgPicker = card.querySelector(".ad-color-fg");
    const durationInput = card.querySelector(".ad-duration");
    const expiryInput = card.querySelector(".ad-expiry");
    const slugInput = card.querySelector(".ad-slug");
    const tagFCheckbox = card.querySelector(".ad-tag-f");
    const filenamePreview = card.querySelector(".ad-filename-preview");
    const confirmBtn = card.querySelector(".btn-action-confirm");
    const cancelBtn = card.querySelector(".btn-action-cancel");
    const footer = card.querySelector(".action-card-footer");

    const reRender = () => {
      const text = textarea.value;
      charCounter.textContent = `${text.length} / 140`;
      generateTextBanner({
        text,
        style: currentStyle,
        bgColor: bgPicker.value,
        textColor: fgPicker.value,
        canvas,
      });
      updateFilenamePreview();
    };

    const updateFilenamePreview = () => {
      const dur = durationInput.value;
      const expiry = expiryInput.value;
      const isOpaque = tagFCheckbox.checked;
      const slugVal = sanitizeSlug(slugInput.value) || "annonce";
      const filename = buildAdFilename({
        duration: dur,
        expiryDate: expiry,
        isOpaque,
        slug: slugVal,
      });
      filenamePreview.textContent = filename;
      return filename;
    };

    updateFilenamePreview();

    textarea.addEventListener("input", reRender);
    bgPicker.addEventListener("input", reRender);
    fgPicker.addEventListener("input", reRender);
    durationInput.addEventListener("input", updateFilenamePreview);
    expiryInput.addEventListener("input", updateFilenamePreview);
    tagFCheckbox.addEventListener("change", updateFilenamePreview);

    slugInput.addEventListener("input", () => {
      slugInput.value = sanitizeSlug(slugInput.value);
      updateFilenamePreview();
    });

    styleBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        styleBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        currentStyle = btn.dataset.style;
        if (currentStyle === "cafe") {
          bgPicker.value = "#2c1810";
          fgPicker.value = "#fef3c7";
        } else {
          bgPicker.value = "#1a365d";
          fgPicker.value = "#ffffff";
        }
        reRender();
      });
    });

    confirmBtn.addEventListener("click", async () => {
      // Preserves manual user checkbox edits
      const filename = updateFilenamePreview();
      let contentBase64 = "";
      if (typeof canvas.toDataURL === "function") {
        const dataUrl = canvas.toDataURL("image/webp", 0.92);
        contentBase64 = dataUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "").trim();
      }
      await this.executeConfirm(
        card,
        {
          name: "upload_ad",
          args: { filename, content: contentBase64 },
          summary: `Mise en ligne du bandeau : ${filename}`,
        },
        null,
        footer
      );
    });

    cancelBtn.addEventListener("click", () => {
      footer.innerHTML = `
        <div class="action-status-badge badge-canceled">
          <span>❌ Génération annulée.</span>
        </div>
      `;
    });

    return card;
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
        const isAd = action.name === "upload_ad" || action.name === "disable_ad";
        const cancelMsg = isAd
          ? "❌ Action annulée (affiche inchangée)."
          : "❌ Action annulée (planning inchangé).";
        footer.innerHTML = `
          <div class="action-status-badge badge-canceled">
            <span>${cancelMsg}</span>
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
    if (card && card._isConfirming) return;
    if (card) card._isConfirming = true;

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

    try {
      if (this._pendingScheduleUpdate) {
        try {
          const updateResult = await this._pendingScheduleUpdate;
          if (updateResult) {
            if (typeof updateResult === "string") {
              this.currentSha = updateResult;
            } else if (typeof updateResult.sha === "string") {
              this.currentSha = updateResult.sha;
            }
          }
        } catch {
          // ignore background refresh failure
        }
        this._pendingScheduleUpdate = null;
      }

      let fetchedSha = null;
      if (typeof this.getScheduleSha === "function") {
        try {
          fetchedSha = this.getScheduleSha();
        } catch {
          // ignore error in getScheduleSha
        }
      }
      const targetSha = fetchedSha || this.currentSha || sha;

      try {
        const isAdAction = action.name === "upload_ad" || action.name === "disable_ad";
        const reqBody = {
          action: action.name,
          payload: action.args,
        };
        if (!isAdAction) {
          reqBody.sha = targetSha;
        }

        const res = await fetch("/api/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reqBody),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok && data.success) {
          if (data.newFileSha) this.currentSha = data.newFileSha;
          const successMsg = action.name === "upload_ad"
            ? "✅ Affiche publiée avec succès sur GitHub ! 🌙 Prise en compte sur le kiosque physique."
            : (action.name === "disable_ad"
              ? "✅ Affiche désactivée avec succès sur GitHub."
              : "✅ Modification enregistrée avec succès ! 🌙 Prise en compte sur le kiosque physique cette nuit.");
          footer.innerHTML = `
            <div class="action-status-badge badge-success">
              <span>${successMsg}</span>
            </div>
          `;
          if (this.onScheduleUpdated && !isAdAction) {
            try {
              this._pendingScheduleUpdate = Promise.resolve(this.onScheduleUpdated()).catch(() => null);
            } catch {
              this._pendingScheduleUpdate = null;
            }
          }
        } else {
          // Intercept concurrency conflicts (HTTP 409, SHA_CONFLICT) (R3)
          const isConflict = res.status === 409 || data.code === "SHA_CONFLICT" || data.conflict === true;
          if (isConflict) {
            const conflictMsg = ERROR_MESSAGES.shaConflict;
            this.renderConfirmError(card, action, sha, footer, conflictMsg, true);
            if (this.onScheduleUpdated) {
              try {
                this._pendingScheduleUpdate = Promise.resolve(this.onScheduleUpdated()).catch(() => null);
              } catch {
                this._pendingScheduleUpdate = null;
              }
            }
          } else {
            // GitHub commit failure
            const errMsg = data.error || ERROR_MESSAGES.githubCommitFail;
            this.renderConfirmError(card, action, sha, footer, errMsg, false);
          }
        }
      } catch {
        this.renderConfirmError(card, action, sha, footer, ERROR_MESSAGES.githubCommitFail, false);
      }
    } finally {
      if (card) card._isConfirming = false;
    }
  }

  /**
   * Renders the error badge in the action card footer with operational [Réessayer 🔄] and [Fermer] buttons.
   * @param {HTMLElement} card
   * @param {object} action
   * @param {string|null} sha
   * @param {HTMLElement} footer
   * @param {string} errMsg
   * @param {boolean} [isConflict=false]
   */
  renderConfirmError(card, action, sha, footer, errMsg, isConflict = false) {
    const badgeClass = isConflict ? "action-status-badge badge-error badge-conflict" : "action-status-badge badge-error";
    footer.innerHTML = `
      <div class="${badgeClass}">
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
        const isAd = action.name === "upload_ad" || action.name === "disable_ad";
        const cancelMsg = isAd
          ? "❌ Action non appliquée (affiche inchangée)."
          : "❌ Action non appliquée. Le planning reste inchangé.";
        footer.innerHTML = `
          <div class="action-status-badge badge-canceled">
            <span>${cancelMsg}</span>
          </div>
        `;
      });
    }

    return card;
  }

  getActionTitle(name) {
    switch (name) {
      case "propose_holiday": return "Fermeture Exceptionnelle (Congés)";
      case "propose_remove_holiday": return "Réouverture de La Station";
      case "propose_whitelist": return "Ouverture Exceptionnelle (Férié)";
      case "propose_schedule_change": return "Modification des Horaires Habituels";
      case "propose_special_schedule":
      case "propose_exceptional_schedule": return "Horaire Particulier Exceptionnel";
      case "propose_remove_special_schedule":
      case "propose_remove_exceptional_schedule": return "Suppression d'Horaire Exceptionnel";
      case "upload_ad": return "Publication d'Affiche";
      case "disable_ad": return "Désactivation d'Affiche";
      case "propose_generate_text_ad": return "Bandeau d'Annonce Textuel";
      case "list_ads": return "Affiches du Kiosque";
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
      case "upload_ad": {
        const fn = args.filename || "";
        return `<div class="detail-row"><span class="detail-label">Fichier :</span><span class="detail-value"><code>${this.escapeHtml(fn)}</code></span></div>`;
      }
      case "disable_ad": {
        const fn = args.filename || "";
        return `<div class="detail-row"><span class="detail-label">Affiche :</span><span class="detail-value"><code>${this.escapeHtml(fn)}</code></span></div>`;
      }
      case "propose_generate_text_ad": {
        const text = args.text || "";
        const style = args.style === "official" ? "Panneau officiel 🚂" : "Ambiance Café ☕";
        return `
          <div class="detail-row"><span class="detail-label">Texte :</span><span class="detail-value">${this.escapeHtml(text)}</span></div>
          <div class="detail-row"><span class="detail-label">Style :</span><span class="detail-value">${this.escapeHtml(style)}</span></div>
        `;
      }
      case "list_ads": {
        return `<div class="detail-row"><span class="detail-value">Consultation des affiches du kiosque</span></div>`;
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
      if (!isSubmitting && online && typeof this.chatInput.focus === 'function') {
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
