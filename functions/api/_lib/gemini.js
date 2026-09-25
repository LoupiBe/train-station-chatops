/**
 * functions/api/_lib/gemini.js
 * Google Gemini API Integration, Function Calling Tools, and Response Parser
 */

import { formatDateFr } from "./brussels.js";

/**
 * Gemini OpenAPI 3.0 Function Declarations for Kiosk ChatOps
 */
export const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "propose_holiday",
        description: "Proposer l'ajout d'une fermeture exceptionnelle (vacances, travaux, jour férié) de la gare de Genval. Pour un jour unique, start et end sont identiques.",
        parameters: {
          type: "OBJECT",
          properties: {
            start: {
              type: "STRING",
              description: "Date de début de fermeture au format YYYY-MM-DD",
            },
            end: {
              type: "STRING",
              description: "Date de fin de fermeture au format YYYY-MM-DD (identique à start si un seul jour)",
            },
            description: {
              type: "STRING",
              description: "Motif ou désignation optionnel en français (ex: Pont de l'Ascension, Travaux)",
            },
          },
          required: ["start", "end"],
        },
      },
      {
        name: "propose_remove_holiday",
        description: "Proposer la suppression d'une période de fermeture exceptionnelle existante de la gare (réouverture).",
        parameters: {
          type: "OBJECT",
          properties: {
            start: {
              type: "STRING",
              description: "Date de début de la fermeture à retirer au format YYYY-MM-DD",
            },
            end: {
              type: "STRING",
              description: "Date de fin de la fermeture à retirer au format YYYY-MM-DD",
            },
          },
          required: ["start", "end"],
        },
      },
      {
        name: "propose_whitelist",
        description: "Proposer une ouverture exceptionnelle de la gare lors d'un jour férié officiel (ajoute la date à la whitelist).",
        parameters: {
          type: "OBJECT",
          properties: {
            date: {
              type: "STRING",
              description: "Date d'ouverture exceptionnelle au format YYYY-MM-DD",
            },
            reason: {
              type: "STRING",
              description: "Motif optionnel de l'ouverture exceptionnelle (ex: Fête nationale, Fête de la Musique)",
            },
          },
          required: ["date"],
        },
      },
      {
        name: "propose_schedule_change",
        description: "Proposer la modification des horaires habituels pour un jour de la semaine.",
        parameters: {
          type: "OBJECT",
          properties: {
            day: {
              type: "STRING",
              description: "Jour de la semaine en anglais minuscule",
              enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
            },
            on: {
              type: "STRING",
              description: "Heure d'allumage/ouverture au format HH:mm (ex: 06:50). Mettre 00:00 si fermé toute la journée.",
            },
            off: {
              type: "STRING",
              description: "Heure d'extinction/fermeture au format HH:mm (ex: 14:10). Mettre 00:00 si fermé toute la journée.",
            },
          },
          required: ["day", "on", "off"],
        },
      },
    ],
  },
];

/**
 * Builds the dynamic system instruction injecting Brussels time and the current schedule.
 * @param {object} brusselsInfo Output from getBrusselsDateTime()
 * @param {object} currentSchedule Current schedule.json
 * @returns {object}
 */
export function buildSystemInstruction(brusselsInfo, currentSchedule) {
  const formattedInfo = brusselsInfo?.fullFormatted || "inconnu";
  const isoDate = brusselsInfo?.isoDate || "";

  return {
    parts: [
      {
        text: `Tu es l'assistant ChatOps pour la gestion des horaires d'affichage de la gare de Genval (Belgique).
Contexte temporel actuel : ${formattedInfo} (date ISO : ${isoDate}, fuseau Europe/Brussels).

Horaires et fermetures actuels de la gare :
${JSON.stringify(currentSchedule, null, 2)}

Directives impératives :
1. Réponds toujours en français chaleureux, concis, bienveillant et professionnel.
2. Pour toute demande de congés, fermeture exceptionnelle, modification d'horaire ou ouverture exceptionnelle lors d'un jour férié, appelle immédiatement la fonction (tool) appropriée avec les arguments requis.
3. RÈGLE CRITIQUE D'ACTION : Ne prétends JAMAIS que la modification est enregistrée ou effective dans Git : tu proposes l'action via le tool, et l'utilisateur la confirmera via la carte d'action interactive.
4. Si les dates ou horaires demandés sont ambigus ou incomplets, ne devine pas : demande poliment des précisions à l'utilisateur (ex: "Je ne suis pas tout à fait sûr d'avoir bien compris les dates 🧐 Pouvez-vous me préciser ça ? (Ex: 'fermer du 14 au 17 mai')").
5. Les jours de la semaine dans les paramètres d'outils doivent être en anglais minuscule (monday, tuesday, wednesday, thursday, friday, saturday, sunday).
6. Les heures doivent respecter le format 24h HH:mm (ex: 06:50, 14:10, 00:00).
7. Pour une fermeture complète un jour de semaine, utilise on="00:00" et off="00:00".
8. Les jours fériés officiels belges sont fermés par défaut par le système de la gare. Pour ouvrir un jour férié, appelle propose_whitelist.`,
      },
    ],
  };
}

/**
 * Normalizes client message history into Gemini v1beta contents format.
 * @param {string} message
 * @param {Array<{ role: string, text?: string, content?: string, parts?: Array<{ text: string }> }>} [history=[]]
 * @returns {Array<{ role: string, parts: Array<{ text: string }> }>}
 */
export function formatGeminiContents(message, history = []) {
  const contents = [];

  if (Array.isArray(history)) {
    for (const item of history) {
      if (!item) continue;
      const role = item.role === "assistant" || item.role === "model" ? "model" : "user";
      const text = typeof item.text === "string" ? item.text : (typeof item.content === "string" ? item.content : (item.parts?.[0]?.text || ""));
      if (text && text.trim()) {
        contents.push({
          role,
          parts: [{ text: text.trim() }],
        });
      }
    }
  }

  if (message && typeof message === "string" && message.trim()) {
    contents.push({
      role: "user",
      parts: [{ text: message.trim() }],
    });
  }

  return contents;
}

/**
 * Generates a human-friendly French summary string for an action card.
 * @param {string} name Action name
 * @param {object} [args={}] Action arguments
 * @returns {string}
 */
export function formatActionSummary(name, args = {}) {
  if (!args) return name;
  switch (name) {
    case "propose_holiday": {
      const desc = args.description || args.reason;
      const descSuffix = desc ? ` (${desc})` : "";
      if (args.start === args.end) {
        return `Fermeture le ${formatDateFr(args.start)}${descSuffix}`;
      }
      return `Fermeture du ${formatDateFr(args.start)} au ${formatDateFr(args.end)}${descSuffix}`;
    }
    case "propose_remove_holiday": {
      if (args.start === args.end) {
        return `Suppression de la fermeture le ${formatDateFr(args.start)}`;
      }
      return `Suppression de la fermeture du ${formatDateFr(args.start)} au ${formatDateFr(args.end)}`;
    }
    case "propose_whitelist": {
      const desc = args.reason || args.description;
      const descSuffix = desc ? ` (${desc})` : "";
      return `Ouverture exceptionnelle le ${formatDateFr(args.date)}${descSuffix}`;
    }
    case "propose_schedule_change": {
      const day = args.day || "";
      return `${day} : ${args.on} - ${args.off}`;
    }
    default:
      return `${name}: ${JSON.stringify(args)}`;
  }
}

/**
 * Parses the raw Gemini API response candidate into a clean conversational reply and proposed action.
 * @param {object} apiResult Raw JSON response from Gemini API
 * @returns {{
 *   reply: string,
 *   proposedAction: { name: string, args: object, summary: string } | null
 * }}
 */
export function parseGeminiResponse(apiResult) {
  const candidate = apiResult?.candidates?.[0];
  if (!candidate || !candidate.content) {
    const errorMsg = apiResult?.promptFeedback?.blockReason
      ? `Requête bloquée par Gemini : ${apiResult.promptFeedback.blockReason}`
      : "Réponse de Gemini vide ou invalide";
    throw new Error(errorMsg);
  }

  const parts = candidate.content.parts || [];
  let text = "";
  let proposedAction = null;

  for (const part of parts) {
    if (typeof part.text === "string") {
      text += part.text;
    }
    if (part.functionCall) {
      const { name, args } = part.functionCall;
      const cleanArgs = args || {};
      proposedAction = {
        name,
        args: cleanArgs,
        summary: formatActionSummary(name, cleanArgs),
      };
    }
  }

  const trimmedText = text.trim();
  let reply = trimmedText;

  if (!reply && proposedAction) {
    switch (proposedAction.name) {
      case "propose_holiday":
        reply = "Je vous propose d'enregistrer cette fermeture exceptionnelle. Veuillez vérifier et confirmer ci-dessous :";
        break;
      case "propose_remove_holiday":
        reply = "Je vous propose de supprimer cette fermeture exceptionnelle. Veuillez confirmer la réouverture ci-dessous :";
        break;
      case "propose_whitelist":
        reply = "Je vous propose d'autoriser l'ouverture exceptionnelle pour ce jour férié. Veuillez confirmer ci-dessous :";
        break;
      case "propose_schedule_change":
        reply = "Je vous propose d'appliquer ces nouveaux horaires habituels. Veuillez vérifier et confirmer ci-dessous :";
        break;
      default:
        reply = "Voici la proposition de mise à jour des horaires. Veuillez la confirmer ci-dessous :";
    }
  }

  return {
    reply,
    proposedAction,
  };
}

/**
 * Sends request to Google Gemini REST API using native fetch.
 * @param {object} env Cloudflare environment bindings
 * @param {object} options
 * @param {string} options.message
 * @param {Array} [options.history=[]]
 * @param {object} options.brusselsInfo
 * @param {object} options.currentSchedule
 * @returns {Promise<{ reply: string, proposedAction: object | null }>}
 */
export async function queryGemini(env, { message, history = [], brusselsInfo, currentSchedule }) {
  const { GEMINI_API_KEY, GEMINI_MODEL = "gemini-2.0-flash" } = env || {};

  if (!GEMINI_API_KEY) {
    const err = new Error("Clé d'API Gemini manquante (GEMINI_API_KEY requis)");
    err.code = "CONFIG_ERROR";
    throw err;
  }

  const systemInstruction = buildSystemInstruction(brusselsInfo, currentSchedule);
  const contents = formatGeminiContents(message, history);

  const requestBody = {
    contents,
    systemInstruction,
    tools: GEMINI_TOOLS,
    toolConfig: {
      functionCallingConfig: {
        mode: "AUTO",
      },
    },
    generationConfig: {
      temperature: 0.2,
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      const timeoutErr = new Error("Délai d'attente dépassé avec l'API Gemini");
      timeoutErr.code = "GEMINI_TIMEOUT";
      timeoutErr.status = 504;
      throw timeoutErr;
    }
    const netErr = new Error(`Erreur réseau Gemini : ${err.message}`);
    netErr.code = "GEMINI_ERROR";
    netErr.status = 502;
    throw netErr;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    const err = new Error(`Erreur API Gemini (${response.status}) : ${errorText}`);
    err.status = response.status >= 500 ? 502 : response.status;
    err.code = "GEMINI_ERROR";
    throw err;
  }

  const resultData = await response.json();
  return parseGeminiResponse(resultData);
}

/**
 * Alias for queryGemini
 */
export const callGeminiApi = queryGemini;
