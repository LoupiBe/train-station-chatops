/**
 * functions/api/chat.js
 * POST /api/chat
 * Conversational endpoint interfacing with Google Gemini API via native fetch.
 * Injects Brussels time and current schedule.json into systemInstruction,
 * parses tools and function calling, and returns bot reply and proposed action.
 */

import { getBrusselsDateTime } from "./_lib/brussels.js";
import { fetchScheduleFromGitHub, listAdsFromGitHub } from "./_lib/github.js";
import { queryGemini } from "./_lib/gemini.js";
import { jsonResponse, errorResponse, optionsResponse } from "./_lib/http.js";

export async function onRequestOptions() {
  return optionsResponse();
}

export async function onRequestPost(context) {
  const { request, env } = context || {};

  // 1. Parse request body
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Corps de requête JSON invalide", 400, { code: "BAD_REQUEST" });
  }

  const { message, history = [] } = body || {};
  if (!message || typeof message !== "string" || !message.trim()) {
    return errorResponse("Le paramètre 'message' est requis et ne peut être vide", 400, {
      code: "BAD_REQUEST",
    });
  }

  // 2. Fetch current schedule and Brussels time for context
  let currentSchedule = {};
  let currentSha = "";
  try {
    const ghData = await fetchScheduleFromGitHub(env);
    currentSchedule = ghData.schedule;
    currentSha = ghData.sha;
  } catch (err) {
    if (err.code === "CONFIG_ERROR") {
      return errorResponse("Configuration serveur incomplète (variables GitHub)", 500, {
        code: "CONFIG_ERROR",
      });
    }
    return errorResponse(
      "Petit accroc technique dans la salle des machines 🚂 Impossible de lire le planning actuel pour l'instant.",
      502,
      { code: "GITHUB_ERROR", details: err.message }
    );
  }

  const brusselsInfo = getBrusselsDateTime();

  // 3. Query Gemini API
  try {
    const geminiResult = await queryGemini(env, {
      message: message.trim(),
      history,
      brusselsInfo,
      currentSchedule,
    });

    // Handle read-only list_ads action immediately from GitHub
    if (geminiResult.proposedAction?.name === "list_ads") {
      try {
        const ads = await listAdsFromGitHub(env);
        if (!ads || ads.length === 0) {
          geminiResult.reply = "Aucune affiche n'est actuellement configurée dans le dossier des affiches du kiosque.";
        } else {
          const activeAds = ads.filter((a) => a.active);
          const disabledAds = ads.filter((a) => a.disabled);
          let listText = "Voici les affiches actuellement configurées pour le kiosque de la gare :";
          if (activeAds.length > 0) {
            listText += "\n\n**Affiches actives :**\n" + activeAds.map((a) => `- 🖼️ \`${a.name}\``).join("\n");
          } else {
            listText += "\n\n*(Aucune affiche active)*";
          }
          if (disabledAds.length > 0) {
            listText += "\n\n**Affiches désactivées / archivées :**\n" + disabledAds.map((a) => `- 📁 \`${a.name}\``).join("\n");
          }
          geminiResult.reply = listText;
        }
        geminiResult.proposedAction = null;
      } catch {
        // preserve original reply if listing fails
      }
    }

    return jsonResponse({
      reply: geminiResult.reply,
      proposedAction: geminiResult.proposedAction,
      currentSha,
    });
  } catch (err) {
    if (err.code === "CONFIG_ERROR") {
      return errorResponse("Configuration serveur incomplète (GEMINI_API_KEY manquante)", 500, {
        code: "CONFIG_ERROR",
      });
    }

    // AI unavailable or timeout: return empathetic French message
    const status = err.status === 504 ? 504 : 502;
    return errorResponse(
      "Le bot prend un petit café ☕ (ou le réseau fait une pause). Réessayez dans quelques instants !",
      status,
      { code: err.code || "GEMINI_ERROR", details: err.message }
    );
  }
}
