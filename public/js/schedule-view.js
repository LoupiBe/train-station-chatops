/**
 * public/js/schedule-view.js
 * Schedule Consultation Drawer Controller, Search Filter, and Offline Caching
 */

const STORAGE_KEYS = {
  SCHEDULE: "kiosk_schedule_data_v1",
  SHA: "kiosk_schedule_sha_v1",
  TIMESTAMP: "kiosk_schedule_timestamp_v1",
};

export const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export const FRENCH_MONTHS = {
  janvier: 1, janv: 1, jan: 1,
  fevrier: 2, fevr: 2, fev: 2,
  mars: 3,
  avril: 4, avr: 4,
  mai: 5,
  juin: 6,
  juillet: 7, juil: 7,
  aout: 8,
  septembre: 9, sept: 9, sep: 9,
  octobre: 10, oct: 10,
  novembre: 11, nov: 11,
  decembre: 12, dec: 12,
};

export const FRENCH_WEEKDAYS = {
  lundi: "monday",
  mardi: "tuesday",
  mercredi: "wednesday",
  jeudi: "thursday",
  vendredi: "friday",
  samedi: "saturday",
  dimanche: "sunday",
};

/**
 * Calculates Easter Sunday for a given Gregorian year (Meeus/Jones/Butcher algorithm).
 * @param {number} year
 * @returns {Date} UTC Date representing Easter Sunday
 */
export function getEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function isValidIsoDate(isoStr) {
  if (!isoStr || typeof isoStr !== "string") return false;
  const parts = isoStr.split("-").map(Number);
  if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return false;
  const [y, m, d] = parts;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d >= 1 && d <= daysInMonth;
}

export function getWeekdayKeyFromIso(isoStr) {
  if (!isValidIsoDate(isoStr)) return "";
  const parts = isoStr.split("-").map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return WEEKDAY_KEYS[date.getUTCDay()] || "";
}

export function getWeekdaysInRange(startIso, endIso) {
  const keys = new Set();
  if (!startIso || typeof startIso !== "string") return [];
  const end = endIso || startIso;
  const p1 = startIso.split("-").map(Number);
  const p2 = end.split("-").map(Number);
  if (p1.length < 3 || p2.length < 3) return [];

  let cur = new Date(Date.UTC(p1[0], p1[1] - 1, p1[2]));
  const targetEnd = new Date(Date.UTC(p2[0], p2[1] - 1, p2[2]));
  while (cur <= targetEnd) {
    keys.add(WEEKDAY_KEYS[cur.getUTCDay()]);
    if (keys.size === 7) break;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return Array.from(keys);
}

// Official FWB school holidays
export const FWB_SCHOOL_HOLIDAYS = {
  2025: {
    detente: { start: "2025-02-24", end: "2025-03-07" },
    printemps: { start: "2025-04-28", end: "2025-05-09" },
    ete: { start: "2025-07-05", end: "2025-08-24" },
    automne: { start: "2025-10-20", end: "2025-10-31" },
    hiver: { start: "2025-12-22", end: "2026-01-02" },
  },
  2026: {
    detente: { start: "2026-02-16", end: "2026-02-27" },
    printemps: { start: "2026-04-27", end: "2026-05-08" },
    ete: { start: "2026-07-04", end: "2026-08-23" },
    automne: { start: "2026-10-19", end: "2026-10-30" },
    hiver: { start: "2026-12-21", end: "2027-01-01" },
  },
  2027: {
    detente: { start: "2027-02-22", end: "2027-03-05" },
    printemps: { start: "2027-04-26", end: "2027-05-07" },
    ete: { start: "2027-07-03", end: "2027-08-22" },
    automne: { start: "2027-10-18", end: "2027-10-29" },
    hiver: { start: "2027-12-20", end: "2027-12-31" },
  },
  2028: {
    detente: { start: "2028-02-21", end: "2028-03-03" },
    printemps: { start: "2028-04-24", end: "2028-05-05" },
    ete: { start: "2028-07-01", end: "2028-08-20" },
    automne: { start: "2028-10-23", end: "2028-11-03" },
    hiver: { start: "2028-12-18", end: "2028-12-29" },
  },
};

/**
 * Resolves dates, ranges, weekdays, and Belgian/FWB holidays from a search query.
 * @param {string} rawQuery
 * @param {number[]} [candidateYears=[2026]]
 */
export function parseScheduleSearchQuery(rawQuery, candidateYears = [2026]) {
  const normalize = (str) =>
    (str || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .trim();

  let q = normalize(rawQuery);
  q = q.replace(/\b1\s*er\b/g, "1er");
  q = q.replace(/\bpremier\b/g, "1er");
  const result = {
    raw: q,
    isMonth: false,
    month: null,
    year: null,
    dates: [],
    ranges: [],
    targetWeekdays: new Set(),
    isAllWeekdays: false,
    matchedHolidayName: null,
  };

  if (!q) return result;

  const years = Array.isArray(candidateYears) && candidateYears.length > 0 ? candidateYears : [2026];

  // 1. Month alone or with year: "mai", "décembre", "août", "en mai", "au mois de mai", "mois d'août", "mai 2026"
  const monthAloneMatch = q.match(/^(?:(?:le\s+|au\s+)?mois\s+(?:de\s+|d['\s]+)|en\s+)?([a-z]+)(?:\s+(\d{4}))?$/);
  if (monthAloneMatch && FRENCH_MONTHS[monthAloneMatch[1]]) {
    result.isMonth = true;
    result.month = FRENCH_MONTHS[monthAloneMatch[1]];
    result.year = monthAloneMatch[2] ? parseInt(monthAloneMatch[2], 10) : null;
    result.isAllWeekdays = true;
    return result;
  }

  // 2. ISO date: "YYYY-MM-DD" or "YYYY/MM/DD" or "YYYY.MM.DD" (optional "le ")
  const isoMatch = q.match(/^(?:le\s+)?(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = String(parseInt(isoMatch[2], 10)).padStart(2, "0");
    const d = String(parseInt(isoMatch[3], 10)).padStart(2, "0");
    const iso = `${y}-${m}-${d}`;
    if (isValidIsoDate(iso)) {
      result.dates.push(iso);
      const wk = getWeekdayKeyFromIso(iso);
      if (wk) result.targetWeekdays.add(wk);
      return result;
    }
  }

  // 3. Numeric date range: "du 25/12 au 31/12", "25/12 - 31/12", "du 25/12/2026 au 31/12/2026"
  const numRangeMatch = q.match(
    /^(?:du\s+)?(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{4}))?\s*(?:au|\-|a)\s*(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{4}))?$/
  );
  if (numRangeMatch) {
    const d1 = String(parseInt(numRangeMatch[1], 10)).padStart(2, "0");
    const m1 = String(parseInt(numRangeMatch[2], 10)).padStart(2, "0");
    const y1 = numRangeMatch[3] ? parseInt(numRangeMatch[3], 10) : null;
    const d2 = String(parseInt(numRangeMatch[4], 10)).padStart(2, "0");
    const m2 = String(parseInt(numRangeMatch[5], 10)).padStart(2, "0");
    const y2 = numRangeMatch[6] ? parseInt(numRangeMatch[6], 10) : (y1 || null);

    const targetYears = y1 && y2 && y1 === y2 ? [y1] : (y1 ? [y1] : years);
    for (const y of targetYears) {
      let endY = y2 || y;
      if (!y2 && parseInt(m1, 10) >= 11 && parseInt(m2, 10) <= 2) {
        endY = y + 1;
      }
      let startIso = `${y}-${m1}-${d1}`;
      let endIso = `${endY}-${m2}-${d2}`;
      if (isValidIsoDate(startIso) && isValidIsoDate(endIso)) {
        if (startIso > endIso) {
          const tmp = startIso;
          startIso = endIso;
          endIso = tmp;
        }
        result.ranges.push({ start: startIso, end: endIso });
        for (const w of getWeekdaysInRange(startIso, endIso)) {
          result.targetWeekdays.add(w);
        }
      }
    }
    if (result.ranges.length > 0) return result;
  }

  // 4. European date with year: "DD/MM/YYYY", "DD-MM-YYYY", "DD.MM.YYYY" (optional "le ")
  const euroWithYearMatch = q.match(/^(?:le\s+)?(\d{1,2})\s*[\/\-\.]\s*(\d{1,2})\s*[\/\-\.]\s*(\d{4})$/);
  if (euroWithYearMatch) {
    const d = String(parseInt(euroWithYearMatch[1], 10)).padStart(2, "0");
    const m = String(parseInt(euroWithYearMatch[2], 10)).padStart(2, "0");
    const y = parseInt(euroWithYearMatch[3], 10);
    const iso = `${y}-${m}-${d}`;
    if (isValidIsoDate(iso)) {
      result.dates.push(iso);
      const wk = getWeekdayKeyFromIso(iso);
      if (wk) result.targetWeekdays.add(wk);
      return result;
    }
  }

  // 5. European date without year: "28/12", "15/08", "14-05", "15.08" (optional "le ")
  const euroWithoutYearMatch = q.match(/^(?:le\s+)?(\d{1,2})\s*[\/\-\.]\s*(\d{1,2})$/);
  if (euroWithoutYearMatch) {
    const d = String(parseInt(euroWithoutYearMatch[1], 10)).padStart(2, "0");
    const m = String(parseInt(euroWithoutYearMatch[2], 10)).padStart(2, "0");
    for (const y of years) {
      const iso = `${y}-${m}-${d}`;
      if (isValidIsoDate(iso)) {
        result.dates.push(iso);
        const wk = getWeekdayKeyFromIso(iso);
        if (wk) result.targetWeekdays.add(wk);
      }
    }
    if (result.dates.length > 0) return result;
  }

  // 6. Range of days across two months: "du 28 avril au 3 mai [2026]", "du 25 decembre 2026 au 1er janvier 2027"
  const multiMonthRangeMatch = q.match(
    /^(?:du\s+)?(\d{1,2})\s*(?:er)?\s+([a-z]+)(?:\s+(\d{4}))?\s*(?:au|\-|a)\s*(\d{1,2})\s*(?:er)?\s+([a-z]+)(?:\s+(\d{4}))?$/
  );
  if (
    multiMonthRangeMatch &&
    FRENCH_MONTHS[multiMonthRangeMatch[2]] &&
    FRENCH_MONTHS[multiMonthRangeMatch[5]]
  ) {
    const d1 = String(parseInt(multiMonthRangeMatch[1], 10)).padStart(2, "0");
    const m1Num = FRENCH_MONTHS[multiMonthRangeMatch[2]];
    const m1 = String(m1Num).padStart(2, "0");
    const y1 = multiMonthRangeMatch[3] ? parseInt(multiMonthRangeMatch[3], 10) : null;
    const d2 = String(parseInt(multiMonthRangeMatch[4], 10)).padStart(2, "0");
    const m2Num = FRENCH_MONTHS[multiMonthRangeMatch[5]];
    const m2 = String(m2Num).padStart(2, "0");
    const y2 = multiMonthRangeMatch[6] ? parseInt(multiMonthRangeMatch[6], 10) : (y1 || null);

    const targetYears = y1 && y2 && y1 === y2 ? [y1] : (y1 ? [y1] : years);
    for (const y of targetYears) {
      let endY = y2 || y;
      if (!y2 && m1Num >= 11 && m2Num <= 2) {
        endY = y + 1;
      }
      let startIso = `${y}-${m1}-${d1}`;
      let endIso = `${endY}-${m2}-${d2}`;
      if (isValidIsoDate(startIso) && isValidIsoDate(endIso)) {
        if (startIso > endIso) {
          const tmp = startIso;
          startIso = endIso;
          endIso = tmp;
        }
        result.ranges.push({ start: startIso, end: endIso });
        for (const w of getWeekdaysInRange(startIso, endIso)) {
          result.targetWeekdays.add(w);
        }
      }
    }
    if (result.ranges.length > 0) return result;
  }

  // 7. Range of days in same month: "du 14 au 17 mai [2026]"
  const rangeMatch = q.match(
    /^(?:du\s+)?(\d{1,2})\s*(?:er)?\s*(?:au|\-|a)\s*(\d{1,2})\s*(?:er)?\s+([a-z]+)(?:\s+(\d{4}))?$/
  );
  if (rangeMatch && FRENCH_MONTHS[rangeMatch[3]]) {
    const d1 = String(parseInt(rangeMatch[1], 10)).padStart(2, "0");
    const d2 = String(parseInt(rangeMatch[2], 10)).padStart(2, "0");
    const m = String(FRENCH_MONTHS[rangeMatch[3]]).padStart(2, "0");
    const explicitYear = rangeMatch[4] ? parseInt(rangeMatch[4], 10) : null;
    const targetYears = explicitYear ? [explicitYear] : years;
    for (const y of targetYears) {
      let startIso = `${y}-${m}-${d1}`;
      let endIso = `${y}-${m}-${d2}`;
      if (isValidIsoDate(startIso) && isValidIsoDate(endIso)) {
        if (startIso > endIso) {
          const tmp = startIso;
          startIso = endIso;
          endIso = tmp;
        }
        result.ranges.push({ start: startIso, end: endIso });
        for (const w of getWeekdaysInRange(startIso, endIso)) {
          result.targetWeekdays.add(w);
        }
      }
    }
    if (result.ranges.length > 0) return result;
  }

  // 8. Day + French month name: "14 mai", "28 decembre", "1er mai", "1 er mai", "jeudi 14 mai", "le 14 mai", "15 aout", "21 juillet 2026"
  const textDateMatch = q.match(
    /^(?:(?:le\s+)?(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+)?(?:le\s+)?(\d{1,2})\s*(?:er|e)?\s+([a-z]+)(?:\s+(\d{4}))?$/
  );
  if (textDateMatch && FRENCH_MONTHS[textDateMatch[2]]) {
    const d = String(parseInt(textDateMatch[1], 10)).padStart(2, "0");
    const m = String(FRENCH_MONTHS[textDateMatch[2]]).padStart(2, "0");
    const explicitYear = textDateMatch[3] ? parseInt(textDateMatch[3], 10) : null;
    const targetYears = explicitYear ? [explicitYear] : years;
    for (const y of targetYears) {
      const iso = `${y}-${m}-${d}`;
      if (isValidIsoDate(iso)) {
        result.dates.push(iso);
        const wk = getWeekdayKeyFromIso(iso);
        if (wk) result.targetWeekdays.add(wk);
      }
    }
    const md = `${m}-${d}`;
    if (md === "01-01") result.matchedHolidayName = "Nouvel An";
    else if (md === "05-01") result.matchedHolidayName = "Fête du Travail";
    else if (md === "07-21") result.matchedHolidayName = "Fête Nationale";
    else if (md === "08-15") result.matchedHolidayName = "Assomption";
    else if (md === "09-27") result.matchedHolidayName = "Fête de la Communauté française";
    else if (md === "11-01") result.matchedHolidayName = "Toussaint";
    else if (md === "11-11") result.matchedHolidayName = "Armistice";
    else if (md === "12-25") result.matchedHolidayName = "Noël";

    if (result.dates.length > 0) return result;
  }

  // 7. Belgian legal holidays & FWB school holidays dictionary
  let holidayFound = false;

  // Ascension
  if (q.includes("ascension")) {
    result.matchedHolidayName = "Ascension";
    holidayFound = true;
    for (const y of years) {
      const easter = getEasterSunday(y);
      const asc = toIsoDate(addDays(easter, 39));
      result.dates.push(asc);
      result.targetWeekdays.add("thursday");
    }
  }

  // Pâques
  if (q.includes("paque")) {
    result.matchedHolidayName = "Pâques";
    holidayFound = true;
    for (const y of years) {
      const easter = getEasterSunday(y);
      const easterSun = toIsoDate(easter);
      const easterMon = toIsoDate(addDays(easter, 1));
      if (q.includes("lundi") && !q.includes("dimanche")) {
        result.dates.push(easterMon);
        result.targetWeekdays.add("monday");
      } else if (q.includes("dimanche") && !q.includes("lundi")) {
        result.dates.push(easterSun);
        result.targetWeekdays.add("sunday");
      } else {
        result.dates.push(easterSun, easterMon);
        result.targetWeekdays.add("sunday");
        result.targetWeekdays.add("monday");
      }

      if (q.includes("vacance") || q.includes("conge")) {
        const h = FWB_SCHOOL_HOLIDAYS[y]?.printemps;
        if (h) {
          result.ranges.push(h);
          for (const w of getWeekdaysInRange(h.start, h.end)) {
            result.targetWeekdays.add(w);
          }
        }
      }
    }
  }

  // Pentecôte
  if (q.includes("pentecote")) {
    result.matchedHolidayName = "Pentecôte";
    holidayFound = true;
    for (const y of years) {
      const easter = getEasterSunday(y);
      const pentSun = toIsoDate(addDays(easter, 49));
      const pentMon = toIsoDate(addDays(easter, 50));
      if (q.includes("dimanche") && !q.includes("lundi")) {
        result.dates.push(pentSun);
        result.targetWeekdays.add("sunday");
      } else if (q.includes("lundi") && !q.includes("dimanche")) {
        result.dates.push(pentMon);
        result.targetWeekdays.add("monday");
      } else {
        result.dates.push(pentSun, pentMon);
        result.targetWeekdays.add("sunday");
        result.targetWeekdays.add("monday");
      }
    }
  }

  // Veille de Noël / Réveillon de Noël (24 décembre)
  if (q.includes("veille de noel") || q.includes("reveillon de noel")) {
    result.matchedHolidayName = "Veille de Noël";
    holidayFound = true;
    for (const y of years) {
      const d = `${y}-12-24`;
      result.dates.push(d);
      const wk = getWeekdayKeyFromIso(d);
      if (wk) result.targetWeekdays.add(wk);
    }
    return result;
  }

  // Saint-Sylvestre / Réveillon de Nouvel An (31 décembre)
  if (
    q.includes("saint sylvestre") ||
    q.includes("reveillon de nouvel an") ||
    q.includes("reveillon du nouvel an") ||
    q.includes("reveillon de l an") ||
    q.includes("veille du nouvel an")
  ) {
    result.matchedHolidayName = "Saint-Sylvestre";
    holidayFound = true;
    for (const y of years) {
      const d = `${y}-12-31`;
      result.dates.push(d);
      const wk = getWeekdayKeyFromIso(d);
      if (wk) result.targetWeekdays.add(wk);
    }
    return result;
  }

  // Détente / Carnaval / Mardi Gras
  if (q.includes("carnaval") || q.includes("detente") || q.includes("mardi gras")) {
    result.matchedHolidayName = "Détente";
    holidayFound = true;
    for (const y of years) {
      const h = FWB_SCHOOL_HOLIDAYS[y]?.detente;
      if (h) {
        result.ranges.push(h);
        for (const w of getWeekdaysInRange(h.start, h.end)) {
          result.targetWeekdays.add(w);
        }
      }
    }
  }

  // Printemps
  if (q.includes("printemps")) {
    result.matchedHolidayName = "Printemps";
    holidayFound = true;
    for (const y of years) {
      const h = FWB_SCHOOL_HOLIDAYS[y]?.printemps;
      if (h) {
        result.ranges.push(h);
        for (const w of getWeekdaysInRange(h.start, h.end)) {
          result.targetWeekdays.add(w);
        }
      }
    }
  }

  // Toussaint / Automne
  if (q.includes("toussaint") || q.includes("automne")) {
    result.matchedHolidayName = "Toussaint";
    holidayFound = true;
    for (const y of years) {
      const tDate = `${y}-11-01`;
      result.dates.push(tDate);
      const wk = getWeekdayKeyFromIso(tDate);
      if (wk) result.targetWeekdays.add(wk);
      const h = FWB_SCHOOL_HOLIDAYS[y]?.automne;
      if (h) {
        result.ranges.push(h);
        for (const w of getWeekdaysInRange(h.start, h.end)) {
          result.targetWeekdays.add(w);
        }
      }
    }
  }

  // Noël / Hiver
  if (q.includes("noel") || q.includes("hiver")) {
    result.matchedHolidayName = "Noël";
    holidayFound = true;
    for (const y of years) {
      const nDate = `${y}-12-25`;
      result.dates.push(nDate);
      const wk = getWeekdayKeyFromIso(nDate);
      if (wk) result.targetWeekdays.add(wk);
      const h = FWB_SCHOOL_HOLIDAYS[y]?.hiver;
      if (h) {
        result.ranges.push(h);
        for (const w of getWeekdaysInRange(h.start, h.end)) {
          result.targetWeekdays.add(w);
        }
      }
    }
  }

  // 1er mai / Fête du Travail
  if (q.includes("1er mai") || q.includes("premier mai") || q.includes("fete du travail") || q === "travail") {
    result.matchedHolidayName = "Fête du Travail";
    holidayFound = true;
    for (const y of years) {
      const d = `${y}-05-01`;
      result.dates.push(d);
      const wk = getWeekdayKeyFromIso(d);
      if (wk) result.targetWeekdays.add(wk);
    }
  }

  // 21 juillet / Fête Nationale
  if (q.includes("21 juillet") || q.includes("fete nationale")) {
    result.matchedHolidayName = "Fête Nationale";
    holidayFound = true;
    for (const y of years) {
      const d = `${y}-07-21`;
      result.dates.push(d);
      const wk = getWeekdayKeyFromIso(d);
      if (wk) result.targetWeekdays.add(wk);
    }
  }

  // 15 août / Assomption
  if (q.includes("15 aout") || q.includes("assomption")) {
    result.matchedHolidayName = "Assomption";
    holidayFound = true;
    for (const y of years) {
      const d = `${y}-08-15`;
      result.dates.push(d);
      const wk = getWeekdayKeyFromIso(d);
      if (wk) result.targetWeekdays.add(wk);
    }
  }

  // 27 septembre / Communauté française (FWB)
  if (
    q.includes("communaute francaise") ||
    q.includes("fete de la communaute") ||
    q.includes("fwb") ||
    q.includes("federation wallonie") ||
    q.includes("wallonie bruxelles")
  ) {
    result.matchedHolidayName = "Fête de la Communauté française";
    holidayFound = true;
    for (const y of years) {
      const d = `${y}-09-27`;
      result.dates.push(d);
      const wk = getWeekdayKeyFromIso(d);
      if (wk) result.targetWeekdays.add(wk);
    }
  }

  // 11 novembre / Armistice
  if (q.includes("11 novembre") || q.includes("armistice")) {
    result.matchedHolidayName = "Armistice";
    holidayFound = true;
    for (const y of years) {
      const d = `${y}-11-11`;
      result.dates.push(d);
      const wk = getWeekdayKeyFromIso(d);
      if (wk) result.targetWeekdays.add(wk);
    }
  }

  // Nouvel An / 1er janvier
  if (q.includes("nouvel an") || q.includes("jour de l an") || q.includes("1er janvier")) {
    result.matchedHolidayName = "Nouvel An";
    holidayFound = true;
    for (const y of years) {
      const d = `${y}-01-01`;
      result.dates.push(d);
      const wk = getWeekdayKeyFromIso(d);
      if (wk) result.targetWeekdays.add(wk);
    }
  }

  // Été / Grandes vacances
  if (q === "ete" || /\bete\b/.test(q) || q.includes("grandes vacances")) {
    result.matchedHolidayName = "Été";
    holidayFound = true;
    for (const y of years) {
      const h = FWB_SCHOOL_HOLIDAYS[y]?.ete;
      if (h) {
        result.ranges.push(h);
        for (const w of getWeekdaysInRange(h.start, h.end)) {
          result.targetWeekdays.add(w);
        }
      }
    }
  }

  if (holidayFound) {
    return result;
  }

  // 8. French weekday alone: "lundi", "le lundi", "lundis", "les lundis"
  const singleWeekdayMatch = q.match(/^(?:le|les)?\s*(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)s?$/);
  if (singleWeekdayMatch && FRENCH_WEEKDAYS[singleWeekdayMatch[1]]) {
    result.targetWeekdays.add(FRENCH_WEEKDAYS[singleWeekdayMatch[1]]);
    return result;
  }

  return result;
}

let globalController = null;

export class ScheduleViewController {
  /**
   * @param {object} [options={}]
   * @param {HTMLElement} [options.drawerElement]
   * @param {HTMLElement} [options.backdropElement]
   * @param {HTMLButtonElement} [options.toggleButton]
   * @param {HTMLButtonElement} [options.closeButton]
   * @param {HTMLInputElement} [options.searchInput]
   * @param {HTMLButtonElement} [options.clearSearchButton]
   * @param {HTMLButtonElement} [options.refreshButton]
   */
  constructor(options = {}) {
    this.drawer = options.drawerElement || (typeof document !== 'undefined' ? document.getElementById("schedule-drawer") : null);
    this.backdrop = options.backdropElement || (typeof document !== 'undefined' ? document.getElementById("drawer-backdrop") : null);
    this.toggleBtn = options.toggleButton || (typeof document !== 'undefined' ? document.getElementById("toggle-schedule-btn") : null);
    this.closeBtn = options.closeButton || (typeof document !== 'undefined' ? document.getElementById("close-schedule-btn") : null);
    this.searchInput = options.searchInput || (typeof document !== 'undefined' ? document.getElementById("schedule-search-input") : null);
    this.clearSearchBtn = options.clearSearchButton || (typeof document !== 'undefined' ? document.getElementById("clear-search-btn") : null);
    this.refreshBtn = options.refreshButton || (typeof document !== 'undefined' ? document.getElementById("refresh-schedule-btn") : null);

    this.schedule = null;
    this.sha = null;
    this.rawSearchQuery = "";
    this.searchQuery = "";
    this.isOpen = false;
  }

  /**
   * Normalizes strings by removing diacritics and converting to lowercase.
   * @param {string} str
   * @returns {string}
   */
  normalize(str) {
    return (str || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  }

  init() {
    // 1. Drawer open/close events
    if (this.toggleBtn) {
      this.toggleBtn.addEventListener("click", () => this.toggle());
    }
    if (this.closeBtn) {
      this.closeBtn.addEventListener("click", () => this.close());
    }
    if (this.backdrop) {
      this.backdrop.addEventListener("click", () => this.close());
    }

    // 2. Keyboard Escape listener
    if (typeof window !== 'undefined') {
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.isOpen) {
          this.close();
        }
      });
    }

    // 3. Search and filter listeners
    if (this.searchInput) {
      this.searchInput.addEventListener("input", (e) => {
        this.rawSearchQuery = (e.target.value || "").trim();
        this.searchQuery = this.normalize(this.rawSearchQuery);
        if (this.clearSearchBtn) {
          this.clearSearchBtn.hidden = !this.rawSearchQuery;
        }
        this.render();
      });
    }

    if (this.clearSearchBtn) {
      this.clearSearchBtn.addEventListener("click", () => {
        if (this.searchInput) {
          this.searchInput.value = "";
          this.searchInput.focus();
        }
        this.rawSearchQuery = "";
        this.searchQuery = "";
        this.clearSearchBtn.hidden = true;
        this.render();
      });
    }

    // 4. Refresh button listener
    if (this.refreshBtn) {
      this.refreshBtn.addEventListener("click", () => {
        this.fetchSchedule(false);
      });
    }

    // 5. Initial schedule fetch (from cache immediately, then network)
    this.loadFromCache();
    this.fetchSchedule(true);
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    this.isOpen = true;
    if (this.drawer) {
      this.drawer.hidden = false;
      this.drawer.classList.add("open");
    }
    if (this.backdrop) {
      this.backdrop.hidden = false;
    }
    if (this.toggleBtn) {
      this.toggleBtn.setAttribute("aria-expanded", "true");
    }
    if (this.searchInput) {
      setTimeout(() => this.searchInput.focus(), 150);
    }
  }

  close() {
    this.isOpen = false;
    if (this.drawer) {
      this.drawer.classList.remove("open");
    }
    if (this.backdrop) {
      this.backdrop.hidden = true;
    }
    if (this.toggleBtn) {
      this.toggleBtn.setAttribute("aria-expanded", "false");
    }
    setTimeout(() => {
      if (!this.isOpen && this.drawer) {
        this.drawer.hidden = true;
      }
    }, 300);
    if (this.toggleBtn) {
      this.toggleBtn.focus();
    }
  }

  getSha() {
    return this.sha;
  }

  loadFromCache() {
    try {
      if (typeof localStorage === 'undefined') return;
      const cached = localStorage.getItem(STORAGE_KEYS.SCHEDULE);
      const cachedSha = localStorage.getItem(STORAGE_KEYS.SHA);
      if (cached) {
        this.schedule = JSON.parse(cached);
        this.sha = cachedSha;
        this.render(true);
      }
    } catch {
      // ignore storage access error
    }
  }

  saveToCache(schedule, sha) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(schedule));
      if (sha) localStorage.setItem(STORAGE_KEYS.SHA, sha);
      localStorage.setItem(STORAGE_KEYS.TIMESTAMP, new Date().toISOString());
    } catch {
      // ignore storage quota error
    }
  }

  async fetchSchedule(silent = false) {
    if (this.refreshBtn && !silent) {
      this.refreshBtn.disabled = true;
      const label = this.refreshBtn.querySelector(".refresh-label");
      if (label) label.textContent = "Chargement...";
    }

    try {
      const res = await fetch("/api/status");
      if (res.ok) {
        const data = await res.json();
        this.schedule = data.schedule;
        this.sha = data.sha;
        this.saveToCache(data.schedule, data.sha);
        this.render(false, data.brusselsTime);
      } else {
        // Fallback to cache if network returned error
        this.loadFromCache();
        if (!this.schedule) this.render(true);
      }
    } catch {
      // Network failed: fallback to offline cache
      this.loadFromCache();
      if (!this.schedule) this.render(true);
    } finally {
      if (this.refreshBtn) {
        this.refreshBtn.disabled = false;
        const label = this.refreshBtn.querySelector(".refresh-label");
        if (label) label.textContent = "Actualiser";
      }
    }
  }

  render(isCached = false, brusselsTime = null) {
    if (!this.schedule) {
      this.renderMeta(isCached);
      this.renderEmptyOfflineState();
      return;
    }

    this.renderMeta(isCached);
    this.renderWeeklyTable(brusselsTime);
    this.renderHolidays();
    this.renderWhitelist();
    this.renderSpecialSchedules();
  }

  /**
   * Renders explicit empty state when launched offline for the first time without cache.
   */
  renderEmptyOfflineState() {
    if (typeof document === 'undefined') return;
    const tbody = document.getElementById("weekly-table-body");
    const holidaysList = document.getElementById("holidays-list");
    const whitelistList = document.getElementById("whitelist-list");
    const specialList = document.getElementById("special-schedules-list");
    const offlineMsg = "Aucun horaire en cache local. Connectez-vous à Internet pour synchroniser les horaires.";

    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state">${offlineMsg}</td></tr>`;
    }
    if (holidaysList) {
      holidaysList.innerHTML = `<li class="empty-state">${offlineMsg}</li>`;
    }
    if (whitelistList) {
      whitelistList.innerHTML = `<li class="empty-state">${offlineMsg}</li>`;
    }
    if (specialList) {
      specialList.innerHTML = `<li class="empty-state">${offlineMsg}</li>`;
    }
  }

  renderMeta(isCached) {
    if (typeof document === 'undefined') return;
    const syncTimeEl = document.getElementById("schedule-sync-time");
    const sourcePill = document.getElementById("schedule-cache-pill");

    if (syncTimeEl) {
      try {
        const now = new Date();
        const timeStr = new Intl.DateTimeFormat("fr-BE", {
          timeZone: "Europe/Brussels",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(now);
        syncTimeEl.textContent = `Dernière sync : ${timeStr}`;
      } catch {
        syncTimeEl.textContent = "Dernière sync : Récente";
      }
    }

    if (sourcePill) {
      const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
      if (isCached || !online) {
        sourcePill.textContent = "Cache local (hors ligne)";
        sourcePill.style.backgroundColor = "var(--color-amber-bg)";
        sourcePill.style.color = "var(--color-amber-text)";
      } else {
        sourcePill.textContent = "GitHub direct";
        sourcePill.style.backgroundColor = "var(--color-rail-blue-subtle)";
        sourcePill.style.color = "var(--color-rail-navy)";
      }
    }
  }

  getExplicitScheduleYears() {
    const years = new Set();
    if (this.schedule) {
      const scanDate = (str) => {
        if (typeof str === "string" && /^\d{4}-\d{2}-\d{2}$/.test(str)) {
          years.add(parseInt(str.slice(0, 4), 10));
        }
      };
      if (Array.isArray(this.schedule.holidays)) {
        for (const h of this.schedule.holidays) {
          scanDate(h.start || h.date);
          scanDate(h.end || h.date);
        }
      }
      if (Array.isArray(this.schedule.whitelist)) {
        for (const w of this.schedule.whitelist) {
          if (typeof w === "string") {
            scanDate(w);
          } else if (w) {
            scanDate(w.date || w.start);
            scanDate(w.end || w.date);
          }
        }
      }
      const specials = this.schedule.special_schedules || this.schedule.exceptional_schedules;
      if (Array.isArray(specials)) {
        for (const s of specials) {
          scanDate(s.start || s.date);
          scanDate(s.end || s.date);
        }
      }
    }
    return Array.from(years);
  }

  getScheduleYears() {
    const years = new Set(this.getExplicitScheduleYears());
    const currentYear = new Date().getFullYear();
    years.add(currentYear);
    years.add(2026);
    return Array.from(years);
  }

  isDateCoveredInSchedule(date) {
    if (!date || !this.schedule) return false;
    if (Array.isArray(this.schedule.holidays)) {
      if (this.schedule.holidays.some((h) => (h.start || h.date || "") <= date && date <= (h.end || h.date || h.start || ""))) {
        return true;
      }
    }
    if (Array.isArray(this.schedule.whitelist)) {
      if (
        this.schedule.whitelist.some((w) => {
          const wStart = typeof w === "string" ? w : (w.date || w.start || "");
          const wEnd = typeof w === "string" ? w : (w.end || w.date || wStart);
          return wStart <= date && date <= wEnd;
        })
      ) {
        return true;
      }
    }
    const specials = this.schedule.special_schedules || this.schedule.exceptional_schedules;
    if (Array.isArray(specials)) {
      if (specials.some((s) => (s.start || s.date || "") <= date && date <= (s.end || s.date || s.start || ""))) {
        return true;
      }
    }
    return false;
  }

  getParsedQuery() {
    const q = this.normalize(this.searchQuery || this.rawSearchQuery || "");
    if (!q) return null;
    return parseScheduleSearchQuery(q, this.getScheduleYears());
  }

  doesRangeOverlapMonth(startIso, endIso, month, targetYear = null) {
    if (!startIso || typeof startIso !== "string") return false;
    const end = endIso || startIso;
    const m = parseInt(month, 10);
    const startParts = startIso.split("-").map(Number);
    const endParts = end.split("-").map(Number);
    if (startParts.length < 2 || endParts.length < 2) return false;

    const [sYear, sMonth] = startParts;
    const [eYear, eMonth] = endParts;

    if (targetYear !== null && targetYear !== undefined) {
      const y = parseInt(targetYear, 10);
      if (y < sYear || y > eYear) return false;
      if (y === sYear && y === eYear) {
        return sMonth <= m && m <= eMonth;
      }
      if (y === sYear) {
        return m >= sMonth;
      }
      if (y === eYear) {
        return m <= eMonth;
      }
      return true;
    }

    if (sYear === eYear) {
      return sMonth <= m && m <= eMonth;
    }
    if (eYear - sYear >= 2) {
      return true;
    }
    if (sYear < eYear) {
      return m >= sMonth || m <= eMonth;
    }
    return false;
  }

  renderWeeklyTable(brusselsTime) {
    if (typeof document === 'undefined') return;
    const tbody = document.getElementById("weekly-table-body");
    if (!tbody) return;

    const days = [
      { key: "monday", label: "Lundi" },
      { key: "tuesday", label: "Mardi" },
      { key: "wednesday", label: "Mercredi" },
      { key: "thursday", label: "Jeudi" },
      { key: "friday", label: "Vendredi" },
      { key: "saturday", label: "Samedi" },
      { key: "sunday", label: "Dimanche" },
    ];

    const frenchToEnglishDays = {
      lundi: "monday",
      mardi: "tuesday",
      mercredi: "wednesday",
      jeudi: "thursday",
      vendredi: "friday",
      samedi: "saturday",
      dimanche: "sunday",
    };

    // Determine current day of week in Brussels (maps French weekday or English fallback to key)
    let currentBrusselsDay = "";
    try {
      const rawWeekday = (
        brusselsTime?.weekday ||
        new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Brussels", weekday: "long" }).format(new Date())
      ).toLowerCase().trim();
      currentBrusselsDay = frenchToEnglishDays[rawWeekday] || rawWeekday;
    } catch {
      currentBrusselsDay = "monday";
    }

    const query = this.normalize(this.searchQuery || this.rawSearchQuery || "");
    const parsed = this.getParsedQuery();
    let html = "";
    let visibleCount = 0;

    for (const d of days) {
      const dayData = this.schedule[d.key] || { on: "00:00", off: "00:00" };
      const isClosed = dayData.on === "00:00" && dayData.off === "00:00";
      const isToday = d.key === currentBrusselsDay || d.label.toLowerCase() === (brusselsTime?.weekday || "").toLowerCase();

      // Diacritic-insensitive & temporal filter check
      if (query) {
        let isVisible = false;
        const matchName = this.normalize(d.label).includes(query);
        const matchHours = `${dayData.on} ${dayData.off}`.includes(query);
        const matchStatus = this.normalize(isClosed ? "fermé" : "ouvert").includes(query);

        if (matchName || matchHours || matchStatus) {
          isVisible = true;
        } else if (parsed) {
          if (parsed.isMonth || parsed.isAllWeekdays) {
            isVisible = true;
          } else if (parsed.targetWeekdays.size > 0) {
            let effectiveWeekdays = parsed.targetWeekdays;
            // Only disambiguate weekday when user searched a single date (same MM-DD across candidate years),
            // and NOT a multi-day holiday (e.g. Pâques / Pentecôte having distinct days like Sunday + Monday).
            const isSingleDateSearch =
              parsed.ranges.length === 0 &&
              parsed.dates.length > 1 &&
              parsed.dates.every((date) => date.slice(5) === parsed.dates[0].slice(5));

            if (isSingleDateSearch && parsed.targetWeekdays.size > 1 && this.schedule) {
              const matchedDates = parsed.dates.filter((date) => this.isDateCoveredInSchedule(date));
              if (matchedDates.length > 0) {
                const specificWk = new Set(matchedDates.map(getWeekdayKeyFromIso).filter(Boolean));
                if (specificWk.size > 0) {
                  effectiveWeekdays = specificWk;
                }
              } else {
                const schedYears = this.getExplicitScheduleYears();
                const currentYear = new Date().getFullYear();
                const primaryYear = schedYears.includes(currentYear) ? currentYear : (schedYears[0] || currentYear);
                const primaryDates = parsed.dates.filter((date) => date.startsWith(`${primaryYear}-`));
                if (primaryDates.length > 0) {
                  const wks = new Set(primaryDates.map(getWeekdayKeyFromIso).filter(Boolean));
                  if (wks.size > 0) effectiveWeekdays = wks;
                }
              }
            }
            if (effectiveWeekdays.has(d.key)) {
              isVisible = true;
            }
          }
        }

        if (!isVisible) {
          continue;
        }
      }

      visibleCount++;
      const todayBadge = isToday ? '<span class="day-badge-today">Aujourd\'hui</span>' : "";
      const statusBadge = isClosed
        ? '<span class="status-badge closed">Fermé</span>'
        : '<span class="status-badge open">Ouvert</span>';

      html += `
        <tr class="${isToday ? "row-today" : ""}">
          <td><strong>${this.escapeHtml(d.label)}</strong> ${todayBadge}</td>
          <td><code>${this.escapeHtml(dayData.on)}</code></td>
          <td><code>${this.escapeHtml(dayData.off)}</code></td>
          <td>${statusBadge}</td>
        </tr>
      `;
    }

    if (visibleCount === 0) {
      const displayQuery = this.rawSearchQuery || this.searchQuery;
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Aucun jour ne correspond au filtre "${this.escapeHtml(displayQuery)}"</td></tr>`;
    } else {
      tbody.innerHTML = html;
    }
  }

  renderHolidays() {
    if (typeof document === 'undefined') return;
    const listEl = document.getElementById("holidays-list");
    const countBadge = document.getElementById("holidays-count-badge");
    if (!listEl) return;

    const holidays = Array.isArray(this.schedule?.holidays) ? this.schedule.holidays : [];
    const query = this.normalize(this.searchQuery || this.rawSearchQuery || "");
    const parsed = this.getParsedQuery();

    const filtered = holidays.filter((h) => {
      if (!query) return true;

      const hStart = h.start || h.date || "";
      const hEnd = h.end || h.date || hStart;

      // 1. Text substring match & generic status match
      if (query.startsWith("ferme") || query.startsWith("conge") || query.startsWith("vacance")) {
        return true;
      }
      const str = this.normalize(`${hStart} ${hEnd} ${h.description || ""}`);
      if (str.includes(query)) return true;

      const frStart = this.normalize(this.formatFrDate(hStart));
      const frEnd = this.normalize(this.formatFrDate(hEnd));
      if (frStart.includes(query) || frEnd.includes(query)) return true;

      if (!parsed) return false;

      // 2. Specific dates coverage (start <= date <= end)
      if (parsed.dates.length > 0) {
        if (parsed.dates.some((date) => hStart <= date && date <= hEnd)) {
          return true;
        }
      }

      // 3. Date range overlap (hStart <= r.end && hEnd >= r.start)
      if (parsed.ranges.length > 0) {
        if (parsed.ranges.some((range) => hStart <= range.end && hEnd >= range.start)) {
          return true;
        }
      }

      // 4. Month coverage
      if (parsed.isMonth && parsed.month) {
        if (this.doesRangeOverlapMonth(hStart, hEnd, parsed.month, parsed.year)) {
          return true;
        }
      }

      return false;
    });

    if (countBadge) {
      countBadge.textContent = (query ? filtered.length : holidays.length).toString();
    }

    if (filtered.length === 0) {
      listEl.innerHTML = `<li class="empty-state">${query ? "Aucun congé correspondant" : "Aucune fermeture programmée"}</li>`;
      return;
    }

    listEl.innerHTML = filtered
      .map((h) => {
        const hStart = h.start || h.date || "";
        const hEnd = h.end || h.date || hStart;
        const isSingleDay = hStart === hEnd;
        const dateDisplay = isSingleDay
          ? `Le ${this.escapeHtml(this.formatFrDate(hStart))}`
          : `Du ${this.escapeHtml(this.formatFrDate(hStart))} au ${this.escapeHtml(this.formatFrDate(hEnd))}`;
        const desc = h.description ? `<span class="item-desc">${this.escapeHtml(h.description)}</span>` : "";

        return `
          <li class="drawer-list-item">
            <div class="item-date-row">
              <span>${dateDisplay}</span>
              <span class="status-badge closed">Fermé</span>
            </div>
            ${desc}
          </li>
        `;
      })
      .join("");
  }

  renderWhitelist() {
    if (typeof document === 'undefined') return;
    const listEl = document.getElementById("whitelist-list");
    const countBadge = document.getElementById("whitelist-count-badge");
    if (!listEl) return;

    const whitelist = Array.isArray(this.schedule?.whitelist) ? this.schedule.whitelist : [];
    const query = this.normalize(this.searchQuery || this.rawSearchQuery || "");
    const parsed = this.getParsedQuery();

    const filtered = whitelist.filter((item) => {
      const dateStr = typeof item === "string" ? item : (item.date || item.start || "");
      const endStr = typeof item === "object" ? (item.end || dateStr) : dateStr;
      const reason = typeof item === "object" ? (item.reason || item.description || "") : "";
      if (!query) return true;

      // 1. Text substring match & generic status match
      if (query.startsWith("ouvert") || query.startsWith("exception")) {
        return true;
      }
      if (this.normalize(`${dateStr} ${endStr} ${reason}`).includes(query)) return true;
      if (this.normalize(this.formatFrDate(dateStr)).includes(query)) return true;
      if (this.normalize(this.formatFrDate(endStr)).includes(query)) return true;

      if (!parsed) return false;

      // 2. Specific date coverage
      if (parsed.dates.length > 0) {
        if (parsed.dates.some((d) => dateStr <= d && d <= endStr)) return true;
      }

      // 3. Date range overlap
      if (parsed.ranges.length > 0) {
        if (parsed.ranges.some((range) => dateStr <= range.end && endStr >= range.start)) {
          return true;
        }
      }

      // 4. Month coverage
      if (parsed.isMonth && parsed.month) {
        if (this.doesRangeOverlapMonth(dateStr, endStr, parsed.month, parsed.year)) {
          return true;
        }
      }

      return false;
    });

    if (countBadge) {
      countBadge.textContent = (query ? filtered.length : whitelist.length).toString();
    }

    if (filtered.length === 0) {
      listEl.innerHTML = `<li class="empty-state">${query ? "Aucune exception correspondante" : "Aucune exception enregistrée"}</li>`;
      return;
    }

    listEl.innerHTML = filtered
      .map((item) => {
        const dateStr = typeof item === "string" ? item : (item.date || item.start || "");
        const endStr = typeof item === "object" ? (item.end || dateStr) : dateStr;
        const isSingleDay = dateStr === endStr;
        const dateDisplay = isSingleDay
          ? `Le ${this.escapeHtml(this.formatFrDate(dateStr))}`
          : `Du ${this.escapeHtml(this.formatFrDate(dateStr))} au ${this.escapeHtml(this.formatFrDate(endStr))}`;
        const reason = typeof item === "object" && (item.reason || item.description) ? `<span class="item-desc">${this.escapeHtml(item.reason || item.description)}</span>` : "";

        return `
          <li class="drawer-list-item">
            <div class="item-date-row">
              <span>${dateDisplay}</span>
              <span class="status-badge open">Ouvert</span>
            </div>
            ${reason}
          </li>
        `;
      })
      .join("");
  }

  renderSpecialSchedules() {
    if (typeof document === 'undefined') return;
    const listEl = document.getElementById("special-schedules-list");
    const countBadge = document.getElementById("special-count-badge");
    if (!listEl) return;

    const specialList = Array.isArray(this.schedule?.special_schedules)
      ? this.schedule.special_schedules
      : (Array.isArray(this.schedule?.exceptional_schedules) ? this.schedule.exceptional_schedules : []);
    const query = this.normalize(this.searchQuery || this.rawSearchQuery || "");
    const parsed = this.getParsedQuery();

    const filtered = specialList.filter((item) => {
      if (!query) return true;

      const start = item.start || item.date || "";
      const end = item.end || item.date || start;
      const desc = item.description || item.reason || "";
      const hours = `${item.on || ""} ${item.off || ""}`;

      // 1. Text substring match & generic status match
      if (query.startsWith("particulier") || query.startsWith("special") || query.startsWith("exceptionnel")) {
        return true;
      }
      const str = this.normalize(`${start} ${end} ${hours} ${desc}`);
      if (str.includes(query)) return true;
      if (this.normalize(this.formatFrDate(start)).includes(query)) return true;
      if (this.normalize(this.formatFrDate(end)).includes(query)) return true;

      if (!parsed) return false;

      // 2. Specific date coverage
      if (parsed.dates.length > 0) {
        if (parsed.dates.some((d) => start <= d && d <= end)) return true;
      }

      // 3. Date range overlap
      if (parsed.ranges.length > 0) {
        if (parsed.ranges.some((range) => start <= range.end && end >= range.start)) {
          return true;
        }
      }

      // 4. Month coverage
      if (parsed.isMonth && parsed.month) {
        if (this.doesRangeOverlapMonth(start, end, parsed.month, parsed.year)) {
          return true;
        }
      }

      return false;
    });

    if (countBadge) {
      countBadge.textContent = (query ? filtered.length : specialList.length).toString();
    }

    if (filtered.length === 0) {
      listEl.innerHTML = `<li class="empty-state">${query ? "Aucun horaire particulier correspondant" : "Aucun horaire particulier programmé"}</li>`;
      return;
    }

    listEl.innerHTML = filtered
      .map((item) => {
        const start = item.start || item.date || "";
        const end = item.end || item.date || start;
        const isSingleDay = start === end;
        const dateDisplay = isSingleDay
          ? `Le ${this.escapeHtml(this.formatFrDate(start))}`
          : `Du ${this.escapeHtml(this.formatFrDate(start))} au ${this.escapeHtml(this.formatFrDate(end))}`;
        const isClosed = item.on === "00:00" && item.off === "00:00";
        const statusBadge = isClosed
          ? '<span class="status-badge closed">Fermé</span>'
          : '<span class="status-badge open">Ouvert</span>';
        const hoursDisplay = isClosed
          ? "Fermé toute la journée"
          : `${this.escapeHtml(item.on)} — ${this.escapeHtml(item.off)}`;
        const desc = item.description ? `<span class="item-desc">${this.escapeHtml(item.description)}</span>` : "";

        return `
          <li class="drawer-list-item">
            <div class="item-date-row">
              <span>${dateDisplay}</span>
              ${statusBadge}
            </div>
            <div class="item-hours-row" style="margin-top: 4px; font-size: 0.9em;">
              <span>Horaires : <code>${hoursDisplay}</code></span>
            </div>
            ${desc}
          </li>
        `;
      })
      .join("");
  }

  formatFrDate(isoStr) {
    if (!isoStr || typeof isoStr !== "string") return isoStr;
    const parts = isoStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return isoStr;
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
}

/**
 * Functional convenience helper for initializing schedule view
 */
export function initScheduleView(options = {}) {
  if (!globalController) {
    globalController = new ScheduleViewController(options);
    globalController.init();
  }
  return globalController;
}

/**
 * Functional convenience helper for fetching and rendering schedule
 */
export function fetchAndRenderSchedule(silent = false) {
  if (globalController) {
    return globalController.fetchSchedule(silent);
  }
}
