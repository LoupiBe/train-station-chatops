/**
 * functions/api/confirm.js
 * POST /api/confirm
 * Validates proposed action against schema, checks Git blob SHA concurrency,
 * mutates schedule.json, and commits update to GitHub via PUT.
 */

import { fetchScheduleFromGitHub, commitScheduleToGitHub, generateCommitMessage } from "./_lib/github.js";
import { validateAction, applyScheduleAction } from "./_lib/validation.js";
import { jsonResponse, errorResponse, optionsResponse } from "./_lib/http.js";

export async function onRequestOptions() {
  return optionsResponse();
}

export async function onRequestPost(context) {
  const { request, env } = context || {};

  // 1. Parse JSON body
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Corps de requête JSON invalide", 400, { code: "BAD_REQUEST" });
  }

  const { action, payload, sha } = body || {};

  if (!action || typeof action !== "string") {
    return errorResponse("Le champ 'action' est obligatoire", 400, { code: "BAD_REQUEST" });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return errorResponse("Le champ 'payload' est obligatoire", 400, { code: "BAD_REQUEST" });
  }
  if (!sha || typeof sha !== "string") {
    return errorResponse("Le champ 'sha' du fichier d'origine est obligatoire", 400, {
      code: "BAD_REQUEST",
    });
  }

  // 2. Strict validation of action and parameters (executed before calling GitHub)
  const validation = validateAction(action, payload);
  if (!validation.valid) {
    return errorResponse(validation.error, 400, { code: "INVALID_ACTION_PAYLOAD" });
  }

  // 3. Fetch latest schedule and SHA from GitHub to verify freshness
  let currentSchedule;
  let latestSha;
  try {
    const fetched = await fetchScheduleFromGitHub(env);
    currentSchedule = fetched.schedule;
    latestSha = fetched.sha;
  } catch (err) {
    if (err.code === "CONFIG_ERROR") {
      return errorResponse("Configuration serveur incomplète (variables GitHub manquantes)", 500, {
        code: "CONFIG_ERROR",
      });
    }
    return errorResponse(
      "Petit accroc technique dans la salle des machines 🚂 Impossible d'enregistrer pour l'instant. Pas d'inquiétude, le planning actuel reste inchangé.",
      502,
      { code: "GITHUB_ERROR", details: err.message }
    );
  }

  // 4. Pre-commit concurrency check: verify SHA matches
  if (latestSha !== sha) {
    return errorResponse(
      "Petit accroc technique dans la salle des machines 🚂 Impossible d'enregistrer pour l'instant. Pas d'inquiétude, le planning actuel reste inchangé.",
      409,
      { code: "SHA_CONFLICT", conflict: true, details: "Le fichier schedule.json a été modifié en parallèle." }
    );
  }

  // 5. Apply schedule mutation
  const updatedSchedule = applyScheduleAction(currentSchedule, action, payload);

  // 6. Generate commit message with optional Access email attribution
  const userEmail = request.headers?.get ? request.headers.get("cf-access-authenticated-user-email") : null;
  const commitMessage = generateCommitMessage(action, payload, userEmail);

  // 7. Commit to GitHub via PUT
  try {
    const commitResult = await commitScheduleToGitHub(env, {
      updatedSchedule,
      sha,
      message: commitMessage,
    });

    return jsonResponse({
      success: true,
      message: "Horaires mis à jour et enregistrés avec succès sur GitHub.",
      commit: {
        sha: commitResult.commitSha,
        message: commitMessage,
      },
      newFileSha: commitResult.newFileSha,
    });
  } catch (err) {
    if (err.conflict || err.status === 409) {
      return errorResponse(
        "Petit accroc technique dans la salle des machines 🚂 Impossible d'enregistrer pour l'instant. Pas d'inquiétude, le planning actuel reste inchangé.",
        409,
        { code: "SHA_CONFLICT", conflict: true }
      );
    }

    return errorResponse(
      "Petit accroc technique dans la salle des machines 🚂 Impossible d'enregistrer pour l'instant. Pas d'inquiétude, le planning actuel reste inchangé.",
      502,
      { code: "GITHUB_COMMIT_FAILED", details: err.message }
    );
  }
}
