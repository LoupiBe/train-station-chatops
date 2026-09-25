/**
 * functions/api/status.js
 * GET /api/status
 * Fetches and parses the current schedule.json and blob SHA from GitHub,
 * computes current Brussels date/time, and returns JSON payload.
 */

import { getBrusselsDateTime } from "./_lib/brussels.js";
import { fetchScheduleFromGitHub } from "./_lib/github.js";
import { jsonResponse, errorResponse, optionsResponse } from "./_lib/http.js";

export async function onRequestOptions() {
  return optionsResponse();
}

export async function onRequestGet(context) {
  const { env } = context || {};

  // 1. Compute Brussels real-time clock
  const brusselsTime = getBrusselsDateTime();

  // 2. Fetch current schedule from GitHub
  try {
    const { schedule, sha } = await fetchScheduleFromGitHub(env);

    return jsonResponse({
      schedule,
      sha,
      brusselsTime: {
        isoDate: brusselsTime.isoDate,
        time: brusselsTime.time,
        weekday: brusselsTime.weekday,
        fullFormatted: brusselsTime.fullFormatted,
      },
    });
  } catch (err) {
    if (err.code === "CONFIG_ERROR") {
      return errorResponse("Configuration serveur incomplète (variables GitHub manquantes)", 500, {
        code: "CONFIG_ERROR",
      });
    }

    if (err.status === 404) {
      return errorResponse("Fichier schedule.json introuvable sur le dépôt GitHub", 404, {
        code: "NOT_FOUND",
      });
    }

    // GitHub upstream failure: return empathetic French message
    return errorResponse(
      "Petit accroc technique dans la salle des machines 🚂 Impossible d'enregistrer pour l'instant. Pas d'inquiétude, le planning actuel reste inchangé.",
      502,
      { code: "GITHUB_ERROR", details: err.message }
    );
  }
}
