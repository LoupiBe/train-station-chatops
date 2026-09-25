/**
 * functions/api/_lib/brussels.js
 * Pure JS Europe/Brussels Timezone and Date Formatting Helpers
 */

export const BRUSSELS_TIMEZONE = "Europe/Brussels";

export const FRENCH_DAYS = {
  monday: "lundi",
  tuesday: "mardi",
  wednesday: "mercredi",
  thursday: "jeudi",
  friday: "vendredi",
  saturday: "samedi",
  sunday: "dimanche",
};

export const BE_WEEKDAYS_MAP = {
  monday: "Lundi",
  tuesday: "Mardi",
  wednesday: "Mercredi",
  thursday: "Jeudi",
  friday: "Vendredi",
  saturday: "Samedi",
  sunday: "Dimanche",
};

const brusselsFormatter = new Intl.DateTimeFormat("fr-BE", {
  timeZone: BRUSSELS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  weekday: "long",
});

const englishDayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BRUSSELS_TIMEZONE,
  weekday: "long",
});

/**
 * Returns comprehensive Brussels date and time information.
 * Handles CET/CEST daylight saving time natively via Intl.DateTimeFormat.
 * @param {Date|string|number} [baseDate=new Date()]
 * @returns {{
 *   isoDate: string,
 *   time: string,
 *   weekday: string,
 *   dayKey: string,
 *   fullFormatted: string,
 *   year: number,
 *   month: number,
 *   day: number,
 *   hour: number,
 *   minute: number,
 *   second: number,
 *   parts: Record<string, string>
 * }}
 */
export function getBrusselsDateTime(baseDate = new Date()) {
  const d = new Date(baseDate);
  const partMap = {};
  for (const part of brusselsFormatter.formatToParts(d)) {
    if (part.type !== "literal") {
      partMap[part.type] = part.value;
    }
  }

  const hour = partMap.hour === "24" ? "00" : (partMap.hour || "00");
  const minute = partMap.minute || "00";
  const isoDate = `${partMap.year}-${partMap.month}-${partMap.day}`;
  const time = `${hour}:${minute}`;
  const dayKey = englishDayFormatter.format(d).toLowerCase();
  const weekday = partMap.weekday || "";
  const fullFormatted = `${weekday} ${partMap.day}/${partMap.month}/${partMap.year} à ${time}`;

  return {
    isoDate,
    time,
    weekday,
    dayKey,
    fullFormatted,
    year: parseInt(partMap.year, 10),
    month: parseInt(partMap.month, 10),
    day: parseInt(partMap.day, 10),
    hour: parseInt(hour, 10),
    minute: parseInt(minute, 10),
    second: parseInt(partMap.second || "0", 10),
    parts: partMap,
  };
}

/**
 * Alias for getBrusselsDateTime
 */
export const getBrusselsTime = getBrusselsDateTime;

/**
 * Formats an ISO date string (YYYY-MM-DD) into French European display format (DD/MM/YYYY).
 * @param {string} isoString
 * @returns {string}
 */
export function formatDateFr(isoString) {
  if (!isoString || typeof isoString !== "string") return "";
  const parts = isoString.split("-");
  if (parts.length !== 3) return isoString;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/**
 * Alias for formatDateFr
 */
export const formatDateEuro = formatDateFr;

/**
 * Parses a European date string (DD/MM/YYYY) into ISO format (YYYY-MM-DD).
 * @param {string} euroString
 * @returns {string}
 */
export function parseDateEuro(euroString) {
  if (!euroString || typeof euroString !== "string") return "";
  const parts = euroString.split("/");
  if (parts.length !== 3) return euroString;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

/**
 * Translates an English day name to French capitalized.
 * @param {string} dayEn
 * @returns {string}
 */
export function translateDayFr(dayEn) {
  return BE_WEEKDAYS_MAP[dayEn?.toLowerCase()] || dayEn;
}
