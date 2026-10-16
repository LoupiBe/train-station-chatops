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
    "User-Agent": "TrainStation-ChatOps/0.4.1",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/**
 * Parses GitHub API error responses, extracting status codes and descriptive error reasons.
 * Differentiates 401 (Auth error), 403 (Rate limit, Branch protection, Forbidden), 404 (Not Found).
 * @param {Response} response
 * @param {string} [defaultMsg]
 * @returns {Promise<Error>}
 */
export async function parseGitHubApiError(response, defaultMsg) {
  const status = response.status;
  const rawText = await response.text().catch(() => "");
  let jsonMsg = "";
  try {
    const parsed = JSON.parse(rawText);
    jsonMsg = parsed.message || "";
  } catch {
    jsonMsg = rawText;
  }

  let code = "GITHUB_ERROR";
  let message = defaultMsg || `Erreur GitHub (${status}) : ${jsonMsg}`;

  if (status === 401) {
    code = "GITHUB_AUTH_ERROR";
    message = "Authentification GitHub échouée : vérifiez la validité de GITHUB_TOKEN.";
  } else if (status === 403) {
    if (/rate\s*limit/i.test(jsonMsg || rawText)) {
      code = "GITHUB_RATE_LIMIT";
      message = "Limite de requêtes GitHub dépassée (rate limit). Veuillez patienter quelques instants avant de réessayer.";
    } else if (/protected/i.test(jsonMsg || rawText)) {
      code = "GITHUB_BRANCH_PROTECTED";
      message = "Impossible d'écrire sur la branche : elle est protégée par des règles de révision ou d'organisation sur GitHub.";
    } else {
      code = "GITHUB_FORBIDDEN";
      message = "Accès GitHub refusé : vérifiez les permissions d'écriture du token sur le dépôt.";
    }
  } else if (status === 404) {
    code = "NOT_FOUND";
    message = defaultMsg || "Dépôt, branche ou ressource GitHub introuvable.";
  } else if (status === 409) {
    if (/protected/i.test(jsonMsg || rawText)) {
      code = "GITHUB_BRANCH_PROTECTED";
      message = "Impossible d'écrire sur la branche : elle est protégée par des règles de protection sur GitHub.";
    }
  }

  const err = new Error(message);
  err.status = status;
  err.code = code;
  err.details = jsonMsg || rawText;
  return err;
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
    case "upload_ad": {
      message = `Mise en ligne de l'affiche : ${payload?.filename || "nouvelle affiche"}`;
      break;
    }
    case "disable_ad": {
      message = `Désactivation de l'affiche : ${payload?.filename || "affiche"}`;
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
    throw await parseGitHubApiError(response, `Échec du commit GitHub (${response.status})`);
  }

  const data = await response.json();
  return {
    success: true,
    commitSha: data.commit?.sha || "",
    newFileSha: data.content?.sha || "",
    data,
  };
}

/**
 * Commits a new advertisement WebP banner to public/ads/[filename] via GitHub REST API.
 * @param {object} env Cloudflare environment bindings
 * @param {object} options
 * @param {string} options.filename
 * @param {string} options.contentBase64
 * @param {string} [options.authorEmail]
 * @returns {Promise<{ success: boolean, commitSha: string, fileSha: string, filename: string, data?: object }>}
 */
export async function uploadAdToGitHub(env, { filename, contentBase64, authorEmail }) {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH = "main" } = env || {};

  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    const err = new Error("Configuration GitHub incomplète (GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO requis)");
    err.code = "CONFIG_ERROR";
    throw err;
  }

  const cleanContent = (contentBase64 || "")
    .replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "")
    .replace(/\s+/g, "");
  const commitMessage = generateCommitMessage("upload_ad", { filename }, authorEmail);
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/public/ads/${encodeURIComponent(filename)}`;

  // Check if file already exists on GitHub to obtain its SHA for updating
  let existingSha = undefined;
  try {
    const checkRes = await fetch(url + `?ref=${encodeURIComponent(GITHUB_BRANCH)}`, {
      method: "GET",
      headers: getGitHubHeaders(GITHUB_TOKEN),
    });
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      if (checkData?.sha) {
        existingSha = checkData.sha;
      }
    }
  } catch {
    // ignore network check error
  }

  const body = {
    message: commitMessage,
    content: cleanContent,
    branch: GITHUB_BRANCH,
  };
  if (existingSha) {
    body.sha = existingSha;
  }

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      ...getGitHubHeaders(GITHUB_TOKEN),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await parseGitHubApiError(response, `Échec du téléversement GitHub (${response.status})`);
  }

  const data = await response.json();
  return {
    success: true,
    commitSha: data.commit?.sha || "",
    fileSha: data.content?.sha || "",
    filename,
    data,
  };
}

/**
 * Safely disables an existing ad banner by committing a new public/ads/disabled-[filename]
 * and deleting the active public/ads/[filename] file via GitHub REST API.
 * @param {object} env Cloudflare environment bindings
 * @param {object} options
 * @param {string} options.filename
 * @param {string} [options.authorEmail]
 * @returns {Promise<{ success: boolean, oldFilename: string, newFilename: string, commitSha?: string }>}
 */
export async function disableAdOnGitHub(env, { filename, authorEmail }) {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH = "main" } = env || {};

  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    const err = new Error("Configuration GitHub incomplète (GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO requis)");
    err.code = "CONFIG_ERROR";
    throw err;
  }

  // 1. Fetch current file to retrieve its content and SHA
  const getUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/public/ads/${encodeURIComponent(filename)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;
  const getRes = await fetch(getUrl, {
    method: "GET",
    headers: getGitHubHeaders(GITHUB_TOKEN),
  });

  if (!getRes.ok) {
    if (getRes.status === 404) {
      const err = new Error(`L'affiche '${filename}' est introuvable sur le dépôt GitHub.`);
      err.status = 404;
      err.code = "NOT_FOUND";
      throw err;
    }
    throw await parseGitHubApiError(getRes, `Erreur lors de la récupération de l'affiche (${getRes.status})`);
  }

  const existingFile = await getRes.json();
  let fileContent = existingFile.content ? existingFile.content.replace(/\s+/g, "") : "";
  if (!fileContent && existingFile.download_url) {
    try {
      const rawRes = await fetch(existingFile.download_url, {
        headers: getGitHubHeaders(GITHUB_TOKEN),
      });
      if (rawRes.ok) {
        const arrayBuf = await rawRes.arrayBuffer();
        if (typeof Buffer !== "undefined") {
          fileContent = Buffer.from(arrayBuf).toString("base64");
        } else if (typeof btoa === "function") {
          const bytes = new Uint8Array(arrayBuf);
          let binary = "";
          const len = bytes.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          fileContent = btoa(binary);
        }
      }
    } catch {
      // fallback
    }
  }

  if (!existingFile.sha || !fileContent) {
    const err = new Error("Format de réponse GitHub contents invalide pour l'affiche existante");
    err.code = "GITHUB_FORMAT_ERROR";
    throw err;
  }

  const newFilename = `disabled-${filename}`;
  const disabledUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/public/ads/${encodeURIComponent(newFilename)}`;
  const disableMessage = generateCommitMessage("disable_ad", { filename }, authorEmail);

  // Check if disabled file already exists to supply its sha if updating
  let existingDisabledSha = undefined;
  try {
    const checkDisabled = await fetch(disabledUrl + `?ref=${encodeURIComponent(GITHUB_BRANCH)}`, {
      method: "GET",
      headers: getGitHubHeaders(GITHUB_TOKEN),
    });
    if (checkDisabled.ok) {
      const disabledData = await checkDisabled.json();
      if (disabledData?.sha) {
        existingDisabledSha = disabledData.sha;
      }
    }
  } catch {
    // ignore
  }

  // 2. Commit the disabled file with identical content
  const putBody = {
    message: disableMessage,
    content: fileContent,
    branch: GITHUB_BRANCH,
  };
  if (existingDisabledSha) {
    putBody.sha = existingDisabledSha;
  }

  const putRes = await fetch(disabledUrl, {
    method: "PUT",
    headers: {
      ...getGitHubHeaders(GITHUB_TOKEN),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(putBody),
  });

  if (!putRes.ok) {
    throw await parseGitHubApiError(putRes, `Échec de l'archivage de l'affiche désactivée (${putRes.status})`);
  }

  const putData = await putRes.json();

  // 3. Delete the old active file
  const deleteUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/public/ads/${encodeURIComponent(filename)}`;
  const deleteRes = await fetch(deleteUrl, {
    method: "DELETE",
    headers: {
      ...getGitHubHeaders(GITHUB_TOKEN),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: `Suppression de l'affiche active (archivée sous ${newFilename})`,
      sha: existingFile.sha,
      branch: GITHUB_BRANCH,
    }),
  });

  if (!deleteRes.ok) {
    throw await parseGitHubApiError(deleteRes, `Échec de la suppression de l'ancienne affiche active (${deleteRes.status})`);
  }

  return {
    success: true,
    oldFilename: filename,
    newFilename,
    commitSha: putData.commit?.sha || "",
  };
}

/**
 * Lists all advertisement files from public/ads in GitHub repository.
 * @param {object} env Cloudflare environment bindings
 * @returns {Promise<Array<{ name: string, path: string, size: number, active: boolean, disabled: boolean, downloadUrl: string }>>}
 */
export async function listAdsFromGitHub(env) {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH = "main" } = env || {};

  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    const err = new Error("Configuration GitHub incomplète (GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO requis)");
    err.code = "CONFIG_ERROR";
    throw err;
  }

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/public/ads?ref=${encodeURIComponent(GITHUB_BRANCH)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: getGitHubHeaders(GITHUB_TOKEN),
  });

  if (res.status === 404) {
    return [];
  }

  if (!res.ok) {
    throw await parseGitHubApiError(res, `Échec de la récupération des affiches (${res.status})`);
  }

  const items = await res.json();
  if (!Array.isArray(items)) return [];

  return items
    .filter((item) => item.type === "file")
    .map((item) => {
      const isDisabled = item.name.startsWith("disabled-") || item.name.startsWith("off-") || item.name.startsWith("_");
      return {
        name: item.name,
        path: item.path,
        size: item.size,
        downloadUrl: item.download_url,
        active: !isDisabled,
        disabled: isDisabled,
      };
    });
}

