/**
 * public/js/sw-register.js
 * Service Worker Registration & Network Connectivity Coordinator
 * Handles PWA registration, update prompts, and online/offline UI states.
 */

export const OFFLINE_BANNER_MESSAGE = "Oups, pas de connexion Internet ! 📡 Vérifiez votre réseau pour papoter avec le bot et mettre à jour les horaires.";
export const UPDATE_PROMPT_MESSAGE = "Une nouvelle version toute fraîche est prête ! 🚀 Cliquez pour recharger.";

let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
let swRegistration = null;
let refreshing = false;

/**
 * Register Service Worker and configure update lifecycle
 */
export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', async () => {
    try {
      swRegistration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

      // 1. If an updated worker is already waiting, prompt immediately
      if (swRegistration.waiting) {
        showUpdateToast(swRegistration.waiting);
        return;
      }

      // 2. If a worker is installing, wait until it reaches 'installed'
      if (swRegistration.installing) {
        trackInstallingWorker(swRegistration.installing);
      }

      // 3. Listen for future updates
      swRegistration.addEventListener('updatefound', () => {
        trackInstallingWorker(swRegistration.installing);
      });
    } catch {
      // Service worker registration error in development or restricted context
    }
  });

  // Safe reload once new worker claims controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

/**
 * Track installing worker and trigger update toast once ready
 */
function trackInstallingWorker(worker) {
  if (!worker) return;
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      // Existing active controller means this is an app update
      showUpdateToast(worker);
    }
  });
}

/**
 * Display update prompt toast
 */
function showUpdateToast(waitingWorker) {
  const toast = document.getElementById('update-toast');
  const toastText = document.getElementById('update-toast-text');
  const toastBtn = document.getElementById('update-toast-btn') || document.getElementById('toast-reload-btn');

  if (toastText) {
    toastText.textContent = UPDATE_PROMPT_MESSAGE;
  }

  if (toast) {
    toast.hidden = false;
    toast.classList.add('visible');
  }

  const triggerUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
  };

  if (toastBtn) {
    toastBtn.onclick = triggerUpdate;
  }
}

/**
 * Initialize online/offline network listeners and UI synchronization
 * @param {Object} [options={}]
 * @param {Function} [options.onOnline] - Callback triggered when back online
 * @param {Function} [options.onOffline] - Callback triggered when offline
 */
export function initConnectivityListeners(options = {}) {
  const { onOnline, onOffline } = options;

  const offlineBanner = document.getElementById('offline-banner');
  const offlineBannerText = document.getElementById('offline-banner-text');
  const connectionPill = document.getElementById('connection-pill');
  const chatInput = document.getElementById('chat-input');
  const chatSubmit = document.getElementById('chat-submit');
  const offlineHint = document.getElementById('offline-input-hint');

  function updateUI(online) {
    isOnline = online;

    if (online) {
      // Hide top amber warning banner
      if (offlineBanner) {
        offlineBanner.hidden = true;
        offlineBanner.classList.remove('visible');
      }

      if (offlineHint) {
        offlineHint.hidden = true;
      }

      // Re-enable chat input and send button
      if (chatInput) {
        chatInput.disabled = false;
        chatInput.removeAttribute('aria-disabled');
        chatInput.placeholder = "Écrivez un message en français (ex: Fermer la gare du 14 au 17 mai)...";
      }
      if (chatSubmit) {
        chatSubmit.disabled = false;
        chatSubmit.removeAttribute('aria-disabled');
        chatSubmit.classList.remove('disabled');
      }

      // Update connection indicator
      if (connectionPill) {
        connectionPill.classList.remove('offline', 'pill-offline');
        connectionPill.classList.add('online', 'pill-online');
        const label = connectionPill.querySelector('.pill-label');
        if (label) label.textContent = 'En ligne';
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('app:network-online'));
      }

      // Invoke optional callback (e.g. background schedule refresh)
      if (typeof onOnline === 'function') {
        onOnline();
      }
    } else {
      // Show top amber warning banner with verbatim text
      if (offlineBanner) {
        if (offlineBannerText) {
          offlineBannerText.textContent = OFFLINE_BANNER_MESSAGE;
        }
        offlineBanner.hidden = false;
        offlineBanner.classList.add('visible');
      }

      if (offlineHint) {
        offlineHint.hidden = false;
      }

      // Disable chat input and send button
      if (chatInput) {
        chatInput.disabled = true;
        chatInput.setAttribute('aria-disabled', 'true');
        chatInput.placeholder = "Pas de connexion Internet (chat désactivé)...";
      }
      if (chatSubmit) {
        chatSubmit.disabled = true;
        chatSubmit.setAttribute('aria-disabled', 'true');
        chatSubmit.classList.add('disabled');
      }

      // Update connection indicator
      if (connectionPill) {
        connectionPill.classList.remove('online', 'pill-online');
        connectionPill.classList.add('offline', 'pill-offline');
        const label = connectionPill.querySelector('.pill-label');
        if (label) label.textContent = 'Hors ligne';
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('app:network-offline'));
      }

      // Invoke optional callback
      if (typeof onOffline === 'function') {
        onOffline();
      }
    }
  }

  // Network event listeners
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => updateUI(true));
    window.addEventListener('offline', () => updateUI(false));
  }

  // Run initial state check
  const initialOnline = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
  updateUI(initialOnline);
}

/**
 * Returns current connectivity status
 */
export function getConnectivityStatus() {
  return isOnline;
}

export const PWA_DISMISS_KEY = 'pwa_install_dismissed';
export const PWA_DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
export const IOS_INSTALL_INSTRUCTIONS = "Pour installer l'app : touchez Partager ⎋ puis Sur l'écran d'accueil ➕";

let deferredPrompt = null;

/**
 * Checks if the PWA is already running in standalone mode (already installed)
 */
export function isPwaInstalled() {
  if (typeof window === 'undefined') return false;
  const isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  const isNavigatorStandalone = typeof navigator !== 'undefined' && Boolean(navigator.standalone);
  return Boolean(isStandalone || isNavigatorStandalone);
}

/**
 * Checks if user recently dismissed the install banner within the last 7 days
 */
export function isInstallDismissed() {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(PWA_DISMISS_KEY);
    if (!raw) return false;
    const dismissedAt = parseInt(raw, 10);
    if (isNaN(dismissedAt)) return false;
    return (Date.now() - dismissedAt) < PWA_DISMISS_DURATION_MS;
  } catch {
    return false;
  }
}

/**
 * Persists the install dismissal timestamp in localStorage for 7 days
 */
export function dismissInstallPrompt() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PWA_DISMISS_KEY, Date.now().toString());
  } catch {
    // Gracefully handle storage errors
  }
}

/**
 * Detects if the current client is an iOS device (iPhone/iPad/iPod or iPad OS 13+)
 */
export function isIosDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return isIos;
}

/**
 * Initializes PWA install banner listeners and state management
 */
export function initInstallPrompt(options = {}) {
  if (typeof window === 'undefined') return;

  const banner = document.getElementById('pwa-install-banner');
  const bannerText = document.getElementById('install-banner-text');
  const installBtn = document.getElementById('btn-pwa-install');
  const dismissBtn = document.getElementById('btn-pwa-dismiss');

  // If already installed or dismissed within 7 days, keep hidden
  if (isPwaInstalled() || isInstallDismissed()) {
    if (banner) {
      banner.hidden = true;
      banner.classList.remove('visible');
    }
    return;
  }

  const hideBanner = () => {
    if (banner) {
      banner.hidden = true;
      banner.classList.remove('visible');
    }
  };

  const showBanner = () => {
    if (banner) {
      banner.hidden = false;
      banner.classList.add('visible');
    }
  };

  // Dismiss button handler (7 days retention)
  const handleDismiss = () => {
    dismissInstallPrompt();
    hideBanner();
  };

  if (dismissBtn) {
    dismissBtn.onclick = handleDismiss;
  }

  // 1. Android / Chromium / Desktop: beforeinstallprompt event
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    if (isPwaInstalled() || isInstallDismissed()) return;

    showBanner();

    if (installBtn) {
      installBtn.style.display = '';
      installBtn.textContent = 'Installer';
      installBtn.onclick = async () => {
        if (!deferredPrompt) return;
        try {
          await deferredPrompt.prompt();
          const choice = await deferredPrompt.userChoice;
          if (choice && choice.outcome === 'accepted') {
            hideBanner();
          }
        } catch {
          // Ignore prompt errors
        } finally {
          deferredPrompt = null;
        }
      };
    }
  });

  // 2. Track when app is installed
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideBanner();
  });

  // 3. iOS Safari: Tailored manual installation instructions
  if (isIosDevice() && !isPwaInstalled() && !isInstallDismissed()) {
    showBanner();
    if (bannerText) {
      bannerText.innerHTML = `Pour installer : touchez <strong>Partager</strong> <span aria-hidden="true">⎋</span> puis <strong>Sur l'écran d'accueil</strong> ➕`;
    }
    if (installBtn) {
      installBtn.textContent = 'Compris';
      installBtn.onclick = handleDismiss;
    }
  }
}
