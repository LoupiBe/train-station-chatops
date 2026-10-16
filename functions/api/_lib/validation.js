/**
 * functions/api/_lib/validation.js
 * ISO Calendar Date Validation, Military Time Validation, and Schedule Mutation Engine
 */

import { generateCommitMessage } from "./github.js";

export { generateCommitMessage };

export const VALID_DAYS = new Set([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

/**
 * Validates whether a string is a real calendar date in YYYY-MM-DD format.
 * Uses Date.UTC round-trip to reject invalid leap years (e.g. 2026-02-29) and 30-day months (e.g. 2026-04-31).
 * @param {string} str
 * @returns {boolean}
 */
export function isValidDate(str) {
  if (typeof str !== "string") return false;
  const match = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(str);
  if (!match) return false;

  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const d = parseInt(match[3], 10);

  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && (dt.getUTCMonth() + 1) === m && dt.getUTCDate() === d;
}

/**
 * Validates 24-hour military time format HH:mm (00:00 to 23:59).
 * @param {string} str
 * @returns {boolean}
 */
export function isValidTime(str) {
  if (typeof str !== "string") return false;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(str);
}

/**
 * Validates the filename of a newly uploaded ad banner (strict lowercase and .webp).
 * Pattern: [duration]-[date]-[F]-[slug].webp
 * @param {string} filename 
 * @returns {boolean}
 */
export function validateNewAdFilename(filename) {
  if (!filename || typeof filename !== "string") return false;
  const trimmed = filename.trim();
  // Strict lowercase (no 'i' flag): requires lowercase slug and .webp extension
  return /^\d+(?:-\d{8})?-(?:F-)?[a-z0-9-_]+\.webp$/.test(trimmed);
}

/**
 * Validates the filename of an existing ad to disable (tolerant of historical formats,
 * strictly rejects already disabled files and path traversal).
 * @param {string} filename 
 * @returns {boolean}
 */
export function validateExistingAdFilename(filename) {
  if (!filename || typeof filename !== "string") return false;
  const trimmed = filename.trim();
  const lower = trimmed.toLowerCase();
  // Strictly reject already disabled files to avoid disabled-disabled-...
  if (lower.startsWith("disabled-") || lower.startsWith("off-") || lower.startsWith("_")) {
    return false;
  }
  // Reject any path traversal attempts
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) {
    return false;
  }
  // Tolerates .webp, .png, .jpg, .jpeg, case-insensitive, and historical tags (F or FULL)
  return /^\d+(?:-\d{8})?-(?:F-|FULL-)?[a-zA-Z0-9-_\.]+\.(?:webp|png|jpe?g)$/i.test(trimmed);
}

/**
 * Validates that a base64 string begins with the WebP/RIFF header.
 * @param {string} b64 
 * @returns {boolean}
 */
export function isWebPBase64(b64) {
  if (typeof b64 !== "string") return false;
  const clean = b64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "").trim();
  if (clean.length < 16) return false;
  try {
    const binary = typeof atob === "function"
      ? atob(clean.slice(0, 16))
      : Buffer.from(clean.slice(0, 16), "base64").toString("binary");
    return (
      binary.charCodeAt(0) === 0x52 && // R
      binary.charCodeAt(1) === 0x49 && // I
      binary.charCodeAt(2) === 0x46 && // F
      binary.charCodeAt(3) === 0x46 && // F
      binary.charCodeAt(8) === 0x57 && // W
      binary.charCodeAt(9) === 0x45 && // E
      binary.charCodeAt(10) === 0x42 && // B
      binary.charCodeAt(11) === 0x50 // P
    );
  } catch {
    return false;
  }
}

/**
 * Validates an action type and its associated payload before execution.
 * @param {string} action
 * @param {object} payload
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateAction(action, payload) {
  if (!action || typeof action !== "string") {
    return { valid: false, error: "Type d'action manquant ou invalide" };
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, error: "Payload d'action manquant ou invalide" };
  }

  switch (action) {
    case "propose_holiday":
    case "propose_remove_holiday": {
      const { start, end } = payload;
      if (!start || typeof start !== "string") {
        return { valid: false, error: "La date de début (start) est obligatoire" };
      }
      if (!isValidDate(start)) {
        return { valid: false, error: `La date de début (${start}) est invalide dans le calendrier (format attendu: YYYY-MM-DD)` };
      }
      if (!end || typeof end !== "string") {
        return { valid: false, error: "La date de fin (end) est obligatoire" };
      }
      if (!isValidDate(end)) {
        return { valid: false, error: `La date de fin (${end}) est invalide dans le calendrier (format attendu: YYYY-MM-DD)` };
      }
      if (start > end) {
        return {
          valid: false,
          error: `La date de début (${start}) doit être antérieure ou égale à la date de fin (${end})`,
        };
      }
      return { valid: true };
    }

    case "propose_whitelist": {
      const { date } = payload;
      if (!date || typeof date !== "string") {
        return { valid: false, error: "La date d'ouverture exceptionnelle (date) est obligatoire" };
      }
      if (!isValidDate(date)) {
        return { valid: false, error: `La date (${date}) est invalide dans le calendrier (format attendu: YYYY-MM-DD)` };
      }
      return { valid: true };
    }

    case "propose_schedule_change": {
      const { day, on, off } = payload;
      if (!day || typeof day !== "string" || !VALID_DAYS.has(day.toLowerCase())) {
        return { valid: false, error: `Jour invalide (${day}) : doit être l'un de monday..sunday` };
      }
      if (!on || typeof on !== "string" || !isValidTime(on)) {
        return { valid: false, error: `Heure d'ouverture invalide (${on}) : doit être au format 24h (HH:mm, 00:00 à 23:59)` };
      }
      if (!off || typeof off !== "string" || !isValidTime(off)) {
        return { valid: false, error: `Heure de fermeture invalide (${off}) : doit être au format 24h (HH:mm, 00:00 à 23:59)` };
      }
      return { valid: true };
    }

    case "propose_special_schedule":
    case "propose_exceptional_schedule": {
      const start = payload.start || payload.date;
      const end = payload.end || payload.date || start;
      const { on, off } = payload;
      if (!start || typeof start !== "string") {
        return { valid: false, error: "La date de début (start) est obligatoire" };
      }
      if (!isValidDate(start)) {
        return { valid: false, error: `La date de début (${start}) est invalide dans le calendrier (format attendu: YYYY-MM-DD)` };
      }
      if (!end || typeof end !== "string") {
        return { valid: false, error: "La date de fin (end) est obligatoire" };
      }
      if (!isValidDate(end)) {
        return { valid: false, error: `La date de fin (${end}) est invalide dans le calendrier (format attendu: YYYY-MM-DD)` };
      }
      if (start > end) {
        return {
          valid: false,
          error: `La date de début (${start}) doit être antérieure ou égale à la date de fin (${end})`,
        };
      }
      if (!on || typeof on !== "string" || !isValidTime(on)) {
        return { valid: false, error: `Heure d'ouverture invalide (${on}) : doit être au format 24h (HH:mm, 00:00 à 23:59)` };
      }
      if (!off || typeof off !== "string" || !isValidTime(off)) {
        return { valid: false, error: `Heure de fermeture invalide (${off}) : doit être au format 24h (HH:mm, 00:00 à 23:59)` };
      }
      return { valid: true };
    }

    case "propose_remove_special_schedule":
    case "propose_remove_exceptional_schedule": {
      const start = payload.start || payload.date;
      const end = payload.end || payload.date || start;
      if (!start || typeof start !== "string") {
        return { valid: false, error: "La date de début (start) est obligatoire" };
      }
      if (!isValidDate(start)) {
        return { valid: false, error: `La date de début (${start}) est invalide dans le calendrier (format attendu: YYYY-MM-DD)` };
      }
      if (!end || typeof end !== "string") {
        return { valid: false, error: "La date de fin (end) est obligatoire" };
      }
      if (!isValidDate(end)) {
        return { valid: false, error: `La date de fin (${end}) est invalide dans le calendrier (format attendu: YYYY-MM-DD)` };
      }
      if (start > end) {
        return {
          valid: false,
          error: `La date de début (${start}) doit être antérieure ou égale à la date de fin (${end})`,
        };
      }
      return { valid: true };
    }

    case "upload_ad": {
      const { filename, content } = payload;
      if (!validateNewAdFilename(filename)) {
        return {
          valid: false,
          error: "Nom de fichier d'affiche invalide. Format attendu : [durée]-[date]-[F]-[slug].webp en minuscules strictes.",
        };
      }
      if (!content || typeof content !== "string") {
        return { valid: false, error: "Le contenu Base64 de l'image est obligatoire." };
      }
      const cleanContent = content.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "").trim();
      const approxBytes = Math.floor((cleanContent.length * 3) / 4);
      if (approxBytes > 1024 * 1024) {
        return { valid: false, error: "Le fichier image dépasse la taille maximale autorisée (1 Mo)." };
      }
      if (!isWebPBase64(cleanContent)) {
        return { valid: false, error: "Le contenu fourni n'est pas une image WebP valide (en-tête RIFF/WEBP manquant)." };
      }
      return { valid: true };
    }

    case "disable_ad": {
      const { filename } = payload;
      if (!validateExistingAdFilename(filename)) {
        return {
          valid: false,
          error: "Nom d'affiche existante invalide ou fichier déjà désactivé.",
        };
      }
      return { valid: true };
    }

    default:
      return { valid: false, error: `Action non reconnue : ${action}` };
  }
}

/**
 * Pure mutation engine that applies an action to a schedule object.
 * Returns a new cloned and modified schedule.
 * @param {object} currentSchedule
 * @param {string} action
 * @param {object} payload
 * @returns {object} Updated schedule
 */
export function applyScheduleAction(currentSchedule, action, payload) {
  const updated = JSON.parse(JSON.stringify(currentSchedule || {}));

  if (!Array.isArray(updated.holidays)) updated.holidays = [];
  if (!Array.isArray(updated.whitelist)) updated.whitelist = [];
  if (!Array.isArray(updated.special_schedules)) {
    updated.special_schedules = Array.isArray(updated.exceptional_schedules) ? updated.exceptional_schedules : [];
  }

  switch (action) {
    case "propose_holiday": {
      const { start, end, description, reason } = payload || {};
      const desc = description || reason;
      const holidayItem = { start, end };
      if (desc && typeof desc === "string" && desc.trim()) {
        holidayItem.description = desc.trim();
      }

      const exists = updated.holidays.some(h =>
        (typeof h === "object" && h !== null && h.start === start && h.end === end) ||
        (typeof h === "string" && h === start && start === end)
      );

      if (!exists) {
        updated.holidays.push(holidayItem);
      }

      updated.holidays.sort((a, b) => {
        const dateA = typeof a === "string" ? a : a.start;
        const dateB = typeof b === "string" ? b : b.start;
        return dateA.localeCompare(dateB);
      });
      break;
    }

    case "propose_remove_holiday": {
      const { start, end } = payload || {};
      updated.holidays = updated.holidays.filter(h => {
        if (typeof h === "string") {
          return !(h >= start && h <= end);
        }
        if (typeof h === "object" && h !== null && h.start && h.end) {
          return !(h.start >= start && h.end <= end);
        }
        return true;
      });
      break;
    }

    case "propose_whitelist": {
      const { date } = payload || {};
      if (date && !updated.whitelist.includes(date)) {
        updated.whitelist.push(date);
        updated.whitelist.sort();
      }
      break;
    }

    case "propose_schedule_change": {
      const { day, on, off } = payload || {};
      if (day) {
        updated[day.toLowerCase()] = { on, off };
      }
      break;
    }

    case "propose_special_schedule":
    case "propose_exceptional_schedule": {
      const start = payload.start || payload.date;
      const end = payload.end || payload.date || start;
      const { on, off, description, reason } = payload || {};
      const desc = description || reason;
      const item = { start, end, on, off };
      if (desc && typeof desc === "string" && desc.trim()) {
        item.description = desc.trim();
      }

      updated.special_schedules = updated.special_schedules.filter(s => {
        const sStart = s.start || s.date;
        const sEnd = s.end || s.date || sStart;
        return !(sStart === start && sEnd === end);
      });

      updated.special_schedules.push(item);
      updated.special_schedules.sort((a, b) => {
        const dateA = a.start || a.date;
        const dateB = b.start || b.date;
        return dateA.localeCompare(dateB);
      });
      break;
    }

    case "propose_remove_special_schedule":
    case "propose_remove_exceptional_schedule": {
      const start = payload.start || payload.date;
      const end = payload.end || payload.date || start;
      updated.special_schedules = updated.special_schedules.filter(s => {
        const sStart = s.start || s.date;
        const sEnd = s.end || s.date || sStart;
        return !(sStart >= start && sEnd <= end);
      });
      break;
    }
  }

  return updated;
}

/**
 * Validates that an object satisfies the full schedule.json schema.
 * @param {object} schedule
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateScheduleStructure(schedule) {
  if (!schedule || typeof schedule !== "object") {
    return { valid: false, error: "Structure de planning invalide (non-objet)" };
  }

  for (const day of VALID_DAYS) {
    const dayConfig = schedule[day];
    if (!dayConfig || typeof dayConfig !== "object") {
      return { valid: false, error: `Jour manquant ou invalide : ${day}` };
    }
    if (!isValidTime(dayConfig.on) || !isValidTime(dayConfig.off)) {
      return { valid: false, error: `Horaires invalides pour ${day} : on=${dayConfig.on}, off=${dayConfig.off}` };
    }
  }

  if (!Array.isArray(schedule.holidays)) {
    return { valid: false, error: "La propriété holidays doit être un tableau" };
  }

  for (const h of schedule.holidays) {
    if (typeof h === "string") {
      if (!isValidDate(h)) return { valid: false, error: `Date de vacances invalide : ${h}` };
    } else if (h && typeof h === "object") {
      if (!isValidDate(h.start) || !isValidDate(h.end) || h.start > h.end) {
        return { valid: false, error: `Période de vacances invalide : ${JSON.stringify(h)}` };
      }
    } else {
      return { valid: false, error: "Élément de vacances invalide" };
    }
  }

  if (!Array.isArray(schedule.whitelist)) {
    return { valid: false, error: "La propriété whitelist doit être un tableau" };
  }

  for (const d of schedule.whitelist) {
    if (!isValidDate(d)) {
      return { valid: false, error: `Date whitelist invalide : ${d}` };
    }
  }

  const specialList = schedule.special_schedules || schedule.exceptional_schedules;
  if (specialList !== undefined) {
    if (!Array.isArray(specialList)) {
      return { valid: false, error: "La propriété special_schedules doit être un tableau" };
    }
    for (const item of specialList) {
      if (!item || typeof item !== "object") {
        return { valid: false, error: "Élément d'horaire particulier invalide" };
      }
      const start = item.start || item.date;
      const end = item.end || item.date || start;
      if (!isValidDate(start) || !isValidDate(end) || start > end) {
        return { valid: false, error: `Dates invalides pour horaire particulier : ${JSON.stringify(item)}` };
      }
      if (!isValidTime(item.on) || !isValidTime(item.off)) {
        return { valid: false, error: `Horaires invalides pour horaire particulier : on=${item.on}, off=${item.off}` };
      }
    }
  }

  return { valid: true };
}
