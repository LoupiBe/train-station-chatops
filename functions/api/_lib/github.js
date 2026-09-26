/**
 * functions/api/_lib/github.js
 * GitHub REST API v3 Contents Helper and UTF-8 Base64 Conversion
 */

/**
 * UTF-8 safe Base64 encoder using standard Web APIs.
 * Supports French diacritics and emojis without InvalidCharacterError.
 * @param {string} str
 * @returns {string}
 */
export function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * UTF-8 safe Base64 decoder.
 * Strips whitespace and linebreaks returned by GitHub API.
 * @param {string} b64
 * @returns {string}
 */
export function base64ToUtf8(b64) {
  const cleanB64 = b64.replace(/\s+/g, "");
  const binary = atob(cleanB64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Generates standard GitHub REST API v3 headers.
 * @param {string} token
 * @returns {Record<string, string>}
 */
export function getGitHubHeaders(token) {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "User-Agent": "TrainStation-ChatOps/0.1.2",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/**
 * Generates an informative French commit message for GitHub history.
 * @param {string} action
 * @param {object} payload
 * @param {string} [authorEmail]
 * @returns {string}
 */
export function generateCommitMessage(action, payload, authorEmail) {
  let message = "";
  const desc = payload?.description || payload?.reason;
  const descSuffix = desc ? ` (${desc})` : "";

  switch (action) {
    case "propose_holiday": {
      if (payload.start === payload.end) {
        message = `Mise à jour des horaires : fermeture le ${payload.start}${descSuffix}`;
      } else {
        message = `Mise à jour des horaires : fermeture du ${payload.start} au ${payload.end}${descSuffix}`;
      }
      break;
    }
    case "propose_remove_holiday": {
      if (payload.start === payload.end) {
        message = `Mise à jour des horaires : réouverture / suppression fermeture le ${payload.start}`;
      } else {
        message = `Mise à jour des horaires : réouverture / suppression fermeture du ${payload.start} au ${payload.end}`;
      }
      break;
    }
    case "propose_whitelist": {
      message = `Mise à jour des horaires : ouverture exceptionnelle le ${payload.date}${descSuffix}`;
      break;
    }
    case "propose_schedule_change": {
      const day = (payload.day || "").toLowerCase();
      message = `Mise à jour des horaires : ${day} (${payload.on} - ${payload.off})`;
      break;
    }
    case "propose_special_schedule":
    case "propose_exceptional_schedule": {
      const start = payload.start || payload.date;
      const end = payload.end || payload.date || start;
      const hours = payload.on === "00:00" && payload.off === "00:00" ? "fermé" : `${payload.on} - ${payload.off}`;
      if (start === end) {
        message = `Mise à jour des horaires : horaire exceptionnel le ${start} (${hours})${descSuffix}`;
      } else {
        message = `Mise à jour des horaires : horaire exceptionnel du ${start} au ${end} (${hours})${descSuffix}`;
      }
      break;
    }
    case "propose_remove_special_schedule":
    case "propose_remove_exceptional_schedule": {
      const start = payload.start || payload.date;
      const end = payload.end || payload.date || start;
      if (start === end) {
        message = `Mise à jour des horaires : suppression horaire exceptionnel le ${start}`;
      } else {
        message = `Mise à jour des horaires : suppression horaire exceptionnel du ${start} au ${end}`;
      }
      break;
    }
    default:
      message = `Mise à jour des horaires : ${action}`;
  }

  if (authorEmail && typeof authorEmail === "string") {
    message += `\n\nDemandé par : ${authorEmail.trim()}`;
  }

  return message;
}

/**
 * Fetches and parses schedule.json from the GitHub repository.
 * @param {object} env Cloudflare environment bindings
 * @returns {Promise<{ schedule: object, sha: string, raw?: object }>}
 */
export async function fetchScheduleFromGitHub(env) {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH = "main" } = env || {};

  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    const err = new Error("Configuration GitHub incomplète (GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO requis)");
    err.code = "CONFIG_ERROR";
    throw err;
  }

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/schedule.json?ref=${encodeURIComponent(GITHUB_BRANCH)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: getGitHubHeaders(GITHUB_TOKEN),
  });

  if (!response.ok) {
    if (response.status === 404) {
      // Resilient fallback: if schedule.json is not yet initialized on GitHub, try schedule.default.json
      const fallbackUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/schedule.default.json?ref=${encodeURIComponent(GITHUB_BRANCH)}`;
      const fallbackRes = await fetch(fallbackUrl, {
        method: "GET",
        headers: getGitHubHeaders(GITHUB_TOKEN),
      });

      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        if (fallbackData.content) {
          const rawContent = base64ToUtf8(fallbackData.content);
          return {
            schedule: JSON.parse(rawContent),
            sha: "INITIAL_NEW_FILE",
            raw: fallbackData,
            isDefault: true,
          };
        }
      }

      const err = new Error("Le fichier schedule.json est introuvable sur le dépôt GitHub.");
      err.status = 404;
      err.code = "NOT_FOUND";
      throw err;
    }
    if (response.status === 401 || response.status === 403) {
      const err = new Error("Accès GitHub refusé : vérifiez GITHUB_TOKEN et les permissions du dépôt.");
      err.status = response.status;
      err.code = "GITHUB_ERROR";
      throw err;
    }
    const errText = await response.text().catch(() => "");
    const err = new Error(`Erreur GitHub API (${response.status}) : ${errText}`);
    err.status = response.status;
    err.code = "GITHUB_ERROR";
    throw err;
  }

  const data = await response.json();
  if (!data.content || !data.sha) {
    const err = new Error("Format de réponse GitHub contents invalide");
    err.code = "GITHUB_FORMAT_ERROR";
    throw err;
  }

  const rawContent = base64ToUtf8(data.content);
  const schedule = JSON.parse(rawContent);

  return {
    schedule,
    sha: data.sha,
    raw: data,
  };
}

/**
 * Commits updated schedule.json to GitHub with optimistic SHA locking.
 * Supports both options object and positional arguments.
 * @param {object} env Cloudflare environment bindings
 * @param {object} scheduleOrOptions Options object { updatedSchedule, sha, message } or schedule object
 * @param {string} [originalSha] SHA if calling with positional arguments
 * @param {string} [commitMessage] Commit message if calling with positional arguments
 * @returns {Promise<{ success: boolean, commitSha: string, newFileSha: string, data?: object }>}
 */
export async function commitScheduleToGitHub(env, scheduleOrOptions, originalSha, commitMessage) {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH = "main" } = env || {};

  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    const err = new Error("Configuration GitHub incomplète");
    err.code = "CONFIG_ERROR";
    throw err;
  }

  let newSchedule;
  let sha;
  let message;

  if (scheduleOrOptions && typeof scheduleOrOptions === "object" && "updatedSchedule" in scheduleOrOptions) {
    newSchedule = scheduleOrOptions.updatedSchedule;
    sha = scheduleOrOptions.sha;
    message = scheduleOrOptions.message;
  } else {
    newSchedule = scheduleOrOptions;
    sha = originalSha;
    message = commitMessage;
  }

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/schedule.json`;
  const contentBase64 = utf8ToBase64(JSON.stringify(newSchedule, null, 2) + "\n");

  const body = {
    message,
    content: contentBase64,
    branch: GITHUB_BRANCH,
  };

  if (sha && sha !== "INITIAL_NEW_FILE") {
    body.sha = sha;
  }

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      ...getGitHubHeaders(GITHUB_TOKEN),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (response.status === 409) {
    const conflictError = new Error("Conflit de modification concurrente sur GitHub (SHA périmé)");
    conflictError.status = 409;
    conflictError.conflict = true;
    conflictError.code = "SHA_CONFLICT";
    throw conflictError;
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    const error = new Error(`Échec du commit GitHub (${response.status}) : ${errText}`);
    error.status = response.status;
    error.code = "GITHUB_ERROR";
    throw error;
  }

  const data = await response.json();
  return {
    success: true,
    commitSha: data.commit?.sha || "",
    newFileSha: data.content?.sha || "",
    data,
  };
}
