import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseScheduleSearchQuery,
  getEasterSunday,
  addDays,
  toIsoDate,
  getWeekdayKeyFromIso,
  getWeekdaysInRange,
  FWB_SCHOOL_HOLIDAYS,
  ScheduleViewController,
} from "../../public/js/schedule-view.js";

describe("Intelligent Temporal Schedule Search & Belgian Holiday Resolution", () => {
  describe("Easter & Mobile Holiday Algorithm", () => {
    test("calculates Easter Sunday accurately for 2025, 2026, 2027", () => {
      const easter2025 = getEasterSunday(2025);
      assert.equal(toIsoDate(easter2025), "2025-04-20");

      const easter2026 = getEasterSunday(2026);
      assert.equal(toIsoDate(easter2026), "2026-04-05");

      const easter2027 = getEasterSunday(2027);
      assert.equal(toIsoDate(easter2027), "2027-03-28");
    });

    test("calculates Ascension Day (Easter + 39 days) as Thursday", () => {
      const asc2026 = addDays(getEasterSunday(2026), 39);
      assert.equal(toIsoDate(asc2026), "2026-05-14");
      assert.equal(getWeekdayKeyFromIso("2026-05-14"), "thursday");

      const asc2027 = addDays(getEasterSunday(2027), 39);
      assert.equal(toIsoDate(asc2027), "2027-05-06");
      assert.equal(getWeekdayKeyFromIso("2027-05-06"), "thursday");
    });

    test("calculates Easter Monday and Pentecost Monday", () => {
      const em2026 = addDays(getEasterSunday(2026), 1);
      assert.equal(toIsoDate(em2026), "2026-04-06");
      assert.equal(getWeekdayKeyFromIso("2026-04-06"), "monday");

      const pm2026 = addDays(getEasterSunday(2026), 50);
      assert.equal(toIsoDate(pm2026), "2026-05-25");
      assert.equal(getWeekdayKeyFromIso("2026-05-25"), "monday");
    });
  });

  describe("parseScheduleSearchQuery - Date Formats", () => {
    test("parses ISO date YYYY-MM-DD", () => {
      const q = parseScheduleSearchQuery("2026-05-14", [2026]);
      assert.equal(q.isMonth, false);
      assert.deepEqual(q.dates, ["2026-05-14"]);
      assert.ok(q.targetWeekdays.has("thursday"));
    });

    test("parses European date DD/MM/YYYY", () => {
      const q = parseScheduleSearchQuery("14/05/2026", [2026]);
      assert.deepEqual(q.dates, ["2026-05-14"]);
      assert.ok(q.targetWeekdays.has("thursday"));
    });

    test("parses short European date DD/MM (ex: 28/12, 15/08)", () => {
      const qDec = parseScheduleSearchQuery("28/12", [2026]);
      assert.ok(qDec.dates.includes("2026-12-28"));
      assert.ok(qDec.targetWeekdays.has("monday"));

      const qAug = parseScheduleSearchQuery("15/08", [2026]);
      assert.ok(qAug.dates.includes("2026-08-15"));
      assert.ok(qAug.targetWeekdays.has("saturday"));
    });

    test("parses French text date 'JJ mois' (ex: 14 mai, 28 décembre, 1er mai)", () => {
      const qMai = parseScheduleSearchQuery("14 mai", [2026]);
      assert.ok(qMai.dates.includes("2026-05-14"));
      assert.ok(qMai.targetWeekdays.has("thursday"));

      const qDec = parseScheduleSearchQuery("28 décembre", [2026]);
      assert.ok(qDec.dates.includes("2026-12-28"));
      assert.ok(qDec.targetWeekdays.has("monday"));

      const qMayFirst = parseScheduleSearchQuery("1er mai", [2026]);
      assert.ok(qMayFirst.dates.includes("2026-05-01"));
      assert.ok(qMayFirst.targetWeekdays.has("friday"));
    });

    test("parses French text range 'du JJ au JJ mois'", () => {
      const qRange = parseScheduleSearchQuery("du 14 au 17 mai", [2026]);
      assert.equal(qRange.ranges.length, 1);
      assert.equal(qRange.ranges[0].start, "2026-05-14");
      assert.equal(qRange.ranges[0].end, "2026-05-17");
      assert.ok(qRange.targetWeekdays.has("thursday"));
      assert.ok(qRange.targetWeekdays.has("friday"));
      assert.ok(qRange.targetWeekdays.has("saturday"));
      assert.ok(qRange.targetWeekdays.has("sunday"));
    });

    test("parses month name alone in French (ex: mai, décembre, août)", () => {
      const qMai = parseScheduleSearchQuery("mai", [2026]);
      assert.equal(qMai.isMonth, true);
      assert.equal(qMai.month, 5);
      assert.equal(qMai.isAllWeekdays, true);

      const qDec = parseScheduleSearchQuery("décembre", [2026]);
      assert.equal(qDec.isMonth, true);
      assert.equal(qDec.month, 12);

      const qAout = parseScheduleSearchQuery("août", [2026]);
      assert.equal(qAout.isMonth, true);
      assert.equal(qAout.month, 8);
    });
  });

  describe("parseScheduleSearchQuery - Belgian & FWB Holidays", () => {
    test("resolves 'ascension' to Ascension Thursday (2026-05-14)", () => {
      const q = parseScheduleSearchQuery("ascension", [2026]);
      assert.equal(q.matchedHolidayName, "Ascension");
      assert.ok(q.dates.includes("2026-05-14"));
      assert.ok(q.targetWeekdays.has("thursday"));
    });

    test("resolves 'pâques' to Easter Sunday and Monday", () => {
      const q = parseScheduleSearchQuery("pâques", [2026]);
      assert.equal(q.matchedHolidayName, "Pâques");
      assert.ok(q.dates.includes("2026-04-05"));
      assert.ok(q.dates.includes("2026-04-06"));
      assert.ok(q.targetWeekdays.has("sunday"));
      assert.ok(q.targetWeekdays.has("monday"));
    });

    test("resolves 'carnaval' and 'détente' to FWB school vacation period", () => {
      const qCarnaval = parseScheduleSearchQuery("carnaval", [2026]);
      assert.equal(qCarnaval.matchedHolidayName, "Détente");
      assert.ok(qCarnaval.ranges.some(r => r.start === "2026-02-16" && r.end === "2026-02-27"));

      const qDetente = parseScheduleSearchQuery("détente", [2026]);
      assert.equal(qDetente.matchedHolidayName, "Détente");
      assert.ok(qDetente.ranges.some(r => r.start === "2026-02-16" && r.end === "2026-02-27"));
    });

    test("resolves 'printemps' to FWB spring vacation period", () => {
      const q = parseScheduleSearchQuery("printemps", [2026]);
      assert.equal(q.matchedHolidayName, "Printemps");
      assert.ok(q.ranges.some(r => r.start === "2026-04-27" && r.end === "2026-05-08"));
    });

    test("resolves 'toussaint' to Nov 1st holiday and autumn vacation period", () => {
      const q = parseScheduleSearchQuery("toussaint", [2026]);
      assert.equal(q.matchedHolidayName, "Toussaint");
      assert.ok(q.dates.includes("2026-11-01"));
      assert.ok(q.ranges.some(r => r.start === "2026-10-19" && r.end === "2026-10-30"));
    });

    test("resolves 'noël' to Dec 25th holiday and winter vacation period", () => {
      const q = parseScheduleSearchQuery("noël", [2026]);
      assert.equal(q.matchedHolidayName, "Noël");
      assert.ok(q.dates.includes("2026-12-25"));
      assert.ok(q.ranges.some(r => r.start === "2026-12-21" && r.end === "2027-01-01"));
    });

    test("resolves Belgian national holidays (1er mai, 21 juillet, 15 août, 11 novembre)", () => {
      const qMai = parseScheduleSearchQuery("1er mai", [2026]);
      assert.ok(qMai.dates.includes("2026-05-01"));

      const qNat = parseScheduleSearchQuery("21 juillet", [2026]);
      assert.ok(qNat.dates.includes("2026-07-21"));
      assert.ok(qNat.targetWeekdays.has("tuesday"));

      const qAssomption = parseScheduleSearchQuery("assomption", [2026]);
      assert.ok(qAssomption.dates.includes("2026-08-15"));
      assert.ok(qAssomption.targetWeekdays.has("saturday"));

      const qArmistice = parseScheduleSearchQuery("armistice", [2026]);
      assert.ok(qArmistice.dates.includes("2026-11-11"));
      assert.ok(qArmistice.targetWeekdays.has("wednesday"));
    });
  });

  describe("ScheduleViewController - In-Range Date and Period Matching", () => {
    test("doesRangeOverlapMonth checks single and multi-month bounds", () => {
      const ctrl = new ScheduleViewController();
      // Holiday in December
      assert.equal(ctrl.doesRangeOverlapMonth("2026-12-25", "2026-12-31", 12), true);
      assert.equal(ctrl.doesRangeOverlapMonth("2026-12-25", "2026-12-31", 11), false);

      // Holiday spanning April to May
      assert.equal(ctrl.doesRangeOverlapMonth("2026-04-27", "2026-05-08", 4), true);
      assert.equal(ctrl.doesRangeOverlapMonth("2026-04-27", "2026-05-08", 5), true);
      assert.equal(ctrl.doesRangeOverlapMonth("2026-04-27", "2026-05-08", 6), false);

      // Holiday spanning year boundary Dec -> Jan
      assert.equal(ctrl.doesRangeOverlapMonth("2026-12-21", "2027-01-01", 12), true);
      assert.equal(ctrl.doesRangeOverlapMonth("2026-12-21", "2027-01-01", 1), true);
      assert.equal(ctrl.doesRangeOverlapMonth("2026-12-21", "2027-01-01", 2), false);
    });

    test("doesRangeOverlapMonth checks year boundaries and multi-year coverage", () => {
      const ctrl = new ScheduleViewController();
      // Specific year matching
      assert.equal(ctrl.doesRangeOverlapMonth("2026-05-14", "2026-05-17", 5, 2026), true);
      assert.equal(ctrl.doesRangeOverlapMonth("2026-05-14", "2026-05-17", 5, 2027), false);
      assert.equal(ctrl.doesRangeOverlapMonth("2026-05-14", "2026-05-17", 4, 2026), false);

      // Multi-year closure (e.g. 2025-11-01 to 2027-02-01 encompasses all months of 2026)
      assert.equal(ctrl.doesRangeOverlapMonth("2025-11-01", "2027-02-01", 6), true);
      assert.equal(ctrl.doesRangeOverlapMonth("2025-11-01", "2027-02-01", 6, 2026), true);
      assert.equal(ctrl.doesRangeOverlapMonth("2025-11-01", "2027-02-01", 6, 2025), false);
      assert.equal(ctrl.doesRangeOverlapMonth("2025-11-01", "2027-02-01", 6, 2027), false);
    });

    test("extracts candidate years from schedule data dynamically", () => {
      const ctrl = new ScheduleViewController();
      ctrl.schedule = {
        holidays: [{ start: "2027-03-01", end: "2027-03-05" }],
        whitelist: ["2028-05-01"],
        special_schedules: [{ start: "2029-01-01", end: "2029-01-01" }],
      };
      const years = ctrl.getScheduleYears();
      assert.ok(years.includes(2026));
      assert.ok(years.includes(2027));
      assert.ok(years.includes(2028));
      assert.ok(years.includes(2029));
    });

    test("disambiguates weekday for single date search across candidate years", () => {
      const ctrl = new ScheduleViewController();
      ctrl.schedule = {
        holidays: [{ start: "2026-12-25", end: "2026-12-31", description: "Fêtes de fin d'année" }]
      };
      // When candidate years has both 2026 and 2027, 28/12 matches 2026-12-28 in the schedule
      assert.equal(ctrl.isDateCoveredInSchedule("2026-12-28"), true);
      assert.equal(ctrl.isDateCoveredInSchedule("2027-12-28"), false);
    });
  });

  describe("parseScheduleSearchQuery - Extended Edge Cases & Variations", () => {
    test("parses dates with dot separator (DD.MM and DD.MM.YYYY)", () => {
      const qDotShort = parseScheduleSearchQuery("15.08", [2026]);
      assert.ok(qDotShort.dates.includes("2026-08-15"));
      assert.ok(qDotShort.targetWeekdays.has("saturday"));

      const qDotFull = parseScheduleSearchQuery("28.12.2026", [2026]);
      assert.deepEqual(qDotFull.dates, ["2026-12-28"]);
      assert.ok(qDotFull.targetWeekdays.has("monday"));
    });

    test("parses numeric date ranges (du 25/12 au 31/12, 25/12 - 31/12)", () => {
      const qRangeSlash = parseScheduleSearchQuery("du 25/12 au 31/12", [2026]);
      assert.equal(qRangeSlash.ranges.length, 1);
      assert.equal(qRangeSlash.ranges[0].start, "2026-12-25");
      assert.equal(qRangeSlash.ranges[0].end, "2026-12-31");

      const qRangeDash = parseScheduleSearchQuery("25/12 - 31/12", [2026]);
      assert.equal(qRangeDash.ranges.length, 1);
      assert.equal(qRangeDash.ranges[0].start, "2026-12-25");
      assert.equal(qRangeDash.ranges[0].end, "2026-12-31");
    });

    test("parses multi-month text ranges (du 28 avril au 3 mai)", () => {
      const qMulti = parseScheduleSearchQuery("du 28 avril au 3 mai 2026", [2026]);
      assert.equal(qMulti.ranges.length, 1);
      assert.equal(qMulti.ranges[0].start, "2026-04-28");
      assert.equal(qMulti.ranges[0].end, "2026-05-03");
      assert.ok(qMulti.targetWeekdays.has("tuesday"));
      assert.ok(qMulti.targetWeekdays.has("sunday"));
    });

    test("parses French text date with weekday prefix (jeudi 14 mai, le jeudi 14 mai)", () => {
      const qJeudi = parseScheduleSearchQuery("jeudi 14 mai", [2026]);
      assert.ok(qJeudi.dates.includes("2026-05-14"));
      assert.ok(qJeudi.targetWeekdays.has("thursday"));

      const qLeJeudi = parseScheduleSearchQuery("le jeudi 14 mai", [2026]);
      assert.ok(qLeJeudi.dates.includes("2026-05-14"));
      assert.ok(qLeJeudi.targetWeekdays.has("thursday"));
    });

    test("parses month name with explicit year (mai 2027)", () => {
      const qMai2027 = parseScheduleSearchQuery("mai 2027", [2026]);
      assert.equal(qMai2027.isMonth, true);
      assert.equal(qMai2027.month, 5);
      assert.equal(qMai2027.year, 2027);

      const qAuMoisDeMai = parseScheduleSearchQuery("au mois de mai", [2026]);
      assert.equal(qAuMoisDeMai.isMonth, true);
      assert.equal(qAuMoisDeMai.month, 5);
      assert.equal(qAuMoisDeMai.year, null);
    });

    test("parses French weekday alone with articles and plurals (le lundi, les lundis)", () => {
      const qLeLundi = parseScheduleSearchQuery("le lundi", [2026]);
      assert.ok(qLeLundi.targetWeekdays.has("monday"));

      const qLesLundis = parseScheduleSearchQuery("les lundis", [2026]);
      assert.ok(qLesLundis.targetWeekdays.has("monday"));
    });

    test("swaps inverted date ranges automatically (du 17 au 14 mai, 31/12 - 25/12, du 3 mai au 28 avril)", () => {
      const qInvText = parseScheduleSearchQuery("du 17 au 14 mai", [2026]);
      assert.equal(qInvText.ranges.length, 1);
      assert.equal(qInvText.ranges[0].start, "2026-05-14");
      assert.equal(qInvText.ranges[0].end, "2026-05-17");
      assert.equal(qInvText.targetWeekdays.size, 4);

      const qInvNum = parseScheduleSearchQuery("31/12 - 25/12", [2026]);
      assert.equal(qInvNum.ranges[0].start, "2026-12-25");
      assert.equal(qInvNum.ranges[0].end, "2026-12-31");

      const qInvMulti = parseScheduleSearchQuery("du 3 mai au 28 avril", [2026]);
      assert.equal(qInvMulti.ranges[0].start, "2026-04-28");
      assert.equal(qInvMulti.ranges[0].end, "2026-05-03");
    });

    test("handles cross-year date ranges crossing December to January (du 25/12 au 01/01, du 25 decembre au 1er janvier)", () => {
      const qCrossNum = parseScheduleSearchQuery("du 25/12 au 01/01", [2026]);
      assert.equal(qCrossNum.ranges.length, 1);
      assert.equal(qCrossNum.ranges[0].start, "2026-12-25");
      assert.equal(qCrossNum.ranges[0].end, "2027-01-01");
      assert.equal(qCrossNum.targetWeekdays.size, 7);

      const qCrossText = parseScheduleSearchQuery("du 25 decembre au 1er janvier", [2026]);
      assert.equal(qCrossText.ranges.length, 1);
      assert.equal(qCrossText.ranges[0].start, "2026-12-25");
      assert.equal(qCrossText.ranges[0].end, "2027-01-01");
      assert.equal(qCrossText.targetWeekdays.size, 7);
    });

    test("resolves FWB vacation phrased queries (vacances d automne, conge d hiver, vacances de paques)", () => {
      const qAutomne = parseScheduleSearchQuery("vacances d automne", [2026]);
      assert.equal(qAutomne.matchedHolidayName, "Toussaint");
      assert.ok(qAutomne.ranges.some(r => r.start === "2026-10-19" && r.end === "2026-10-30"));

      const qHiver = parseScheduleSearchQuery("conge d hiver", [2026]);
      assert.equal(qHiver.matchedHolidayName, "Noël");
      assert.ok(qHiver.ranges.some(r => r.start === "2026-12-21" && r.end === "2027-01-01"));

      const qPaquesVac = parseScheduleSearchQuery("vacances de paques", [2026]);
      assert.equal(qPaquesVac.matchedHolidayName, "Pâques");
      assert.ok(qPaquesVac.ranges.some(r => r.start === "2026-04-27" && r.end === "2026-05-08"));
    });

    test("distinguishes fete from ete and supports Communauté française FWB", () => {
      const qFete = parseScheduleSearchQuery("fete nationale", [2026]);
      assert.equal(qFete.matchedHolidayName, "Fête Nationale");

      const qEte = parseScheduleSearchQuery("vacances d ete", [2026]);
      assert.equal(qEte.matchedHolidayName, "Été");

      const qFwb = parseScheduleSearchQuery("communaute francaise", [2026]);
      assert.equal(qFwb.matchedHolidayName, "Fête de la Communauté française");
      assert.ok(qFwb.dates.includes("2026-09-27"));
    });

    test("supports holiday defined with date shorthand in ScheduleViewController and renders DOM correctly", () => {
      class MockEl { constructor() { this.innerHTML = ""; } }
      const listEl = new MockEl();
      const countEl = new MockEl();
      const origDoc = global.document;
      global.document = {
        getElementById: (id) => {
          if (id === "holidays-list") return listEl;
          if (id === "holidays-count-badge") return countEl;
          return new MockEl();
        },
      };

      const ctrl = new ScheduleViewController();
      ctrl.schedule = {
        holidays: [{ date: "2026-08-15", description: "Assomption" }],
      };
      assert.equal(ctrl.isDateCoveredInSchedule("2026-08-15"), true);
      assert.ok(ctrl.getExplicitScheduleYears().includes(2026));

      ctrl.renderHolidays();
      assert.ok(listEl.innerHTML.includes("15/08/2026"), "Rendered holiday must display formatted date 15/08/2026 and not empty 'Le '");
      assert.ok(!listEl.innerHTML.includes("<span>Le </span>"), "Must not render blank 'Le ' date");
      assert.equal(countEl.textContent, "1");

      global.document = origDoc;
    });

    test("resolves lundi de paques and dimanche de paques to distinct weekdays", () => {
      const qLundi = parseScheduleSearchQuery("lundi de paques", [2026]);
      assert.ok(qLundi.dates.includes("2026-04-06"));
      assert.ok(!qLundi.dates.includes("2026-04-05"));
      assert.equal(qLundi.targetWeekdays.has("monday"), true);
      assert.equal(qLundi.targetWeekdays.has("sunday"), false);

      const qDimanche = parseScheduleSearchQuery("dimanche de paques", [2026]);
      assert.ok(qDimanche.dates.includes("2026-04-05"));
      assert.ok(!qDimanche.dates.includes("2026-04-06"));
      assert.equal(qDimanche.targetWeekdays.has("sunday"), true);
      assert.equal(qDimanche.targetWeekdays.has("monday"), false);
    });

    test("renderWeeklyTable preserves both Sunday and Monday for general paques query", () => {
      class MockEl { constructor() { this.innerHTML = ""; } }
      const tbody = new MockEl();
      const origDoc = global.document;
      global.document = { getElementById: (id) => id === "weekly-table-body" ? tbody : new MockEl() };

      const ctrl = new ScheduleViewController();
      ctrl.schedule = {
        monday: { on: "06:50", off: "14:10" },
        tuesday: { on: "06:50", off: "14:10" },
        wednesday: { on: "06:50", off: "14:40" },
        thursday: { on: "06:50", off: "14:10" },
        friday: { on: "06:50", off: "14:10" },
        saturday: { on: "00:00", off: "00:00" },
        sunday: { on: "00:00", off: "00:00" },
        holidays: [],
      };

      ctrl.searchQuery = "paques";
      ctrl.renderWeeklyTable();
      assert.ok(tbody.innerHTML.includes("Dimanche"), "Easter search must show Dimanche");
      assert.ok(tbody.innerHTML.includes("Lundi"), "Easter search must show Lundi (Lundi de Pâques)");

      global.document = origDoc;
    });

    test("renderWeeklyTable preserves full vacation week when schedule has cross-year closure", () => {
      class MockEl { constructor() { this.innerHTML = ""; } }
      const tbody = new MockEl();
      const origDoc = global.document;
      global.document = { getElementById: (id) => id === "weekly-table-body" ? tbody : new MockEl() };

      const ctrl = new ScheduleViewController();
      ctrl.schedule = {
        monday: { on: "06:50", off: "14:10" },
        tuesday: { on: "06:50", off: "14:10" },
        wednesday: { on: "06:50", off: "14:40" },
        thursday: { on: "06:50", off: "14:10" },
        friday: { on: "06:50", off: "14:10" },
        saturday: { on: "00:00", off: "00:00" },
        sunday: { on: "00:00", off: "00:00" },
        holidays: [{ start: "2026-12-21", end: "2027-01-01", description: "Fêtes de fin d'année" }],
      };

      ctrl.searchQuery = "vacances de noel";
      ctrl.renderWeeklyTable();
      const rowCount = (tbody.innerHTML.match(/<tr/g) || []).length;
      assert.equal(rowCount, 7, "Vacation search must keep all 7 days of the vacation visible in weekly table");

      global.document = origDoc;
    });

    test("filters weekly table to exact weekday on specific date search with explicit year", () => {
      class MockEl { constructor() { this.innerHTML = ""; } }
      const tbody = new MockEl();
      const origDoc = global.document;
      global.document = { getElementById: (id) => id === "weekly-table-body" ? tbody : new MockEl() };

      const ctrl = new ScheduleViewController();
      ctrl.schedule = {
        monday: { on: "06:50", off: "14:10" },
        tuesday: { on: "06:50", off: "14:10" },
        wednesday: { on: "06:50", off: "14:40" },
        thursday: { on: "06:50", off: "14:10" },
        friday: { on: "06:50", off: "14:10" },
        saturday: { on: "00:00", off: "00:00" },
        sunday: { on: "00:00", off: "00:00" },
        holidays: [{ start: "2026-12-21", end: "2027-01-01", description: "Fêtes de fin d'année" }],
      };

      ctrl.searchQuery = "25 decembre 2026";
      ctrl.renderWeeklyTable();
      const rowCount = (tbody.innerHTML.match(/<tr/g) || []).length;
      assert.equal(rowCount, 1, "Specific date 25 décembre 2026 must filter weekly table to exactly 1 day");
      assert.ok(tbody.innerHTML.includes("Vendredi"), "25 décembre 2026 is Friday");

      global.document = origDoc;
    });

    test("supports French article 'le' on numeric dates and ISO dates", () => {
      const qShort = parseScheduleSearchQuery("le 28/12", [2026]);
      assert.ok(qShort.dates.includes("2026-12-28"));
      assert.ok(qShort.targetWeekdays.has("monday"));

      const qFull = parseScheduleSearchQuery("le 14/05/2026", [2026]);
      assert.ok(qFull.dates.includes("2026-05-14"));
      assert.ok(qFull.targetWeekdays.has("thursday"));

      const qIso = parseScheduleSearchQuery("le 2026-12-28", [2026]);
      assert.ok(qIso.dates.includes("2026-12-28"));
    });

    test("parses multi-month text range with two explicit years", () => {
      const q = parseScheduleSearchQuery("du 25 decembre 2026 au 1er janvier 2027", [2026]);
      assert.equal(q.ranges.length, 1);
      assert.equal(q.ranges[0].start, "2026-12-25");
      assert.equal(q.ranges[0].end, "2027-01-01");
      assert.equal(q.targetWeekdays.size, 7);
    });

    test("parses month queries with vowel elisions (mois d'août, au mois d'août, le mois de mai)", () => {
      const qAout1 = parseScheduleSearchQuery("mois d aout", [2026]);
      assert.equal(qAout1.isMonth, true);
      assert.equal(qAout1.month, 8);

      const qAout2 = parseScheduleSearchQuery("au mois d aout", [2026]);
      assert.equal(qAout2.isMonth, true);
      assert.equal(qAout2.month, 8);

      const qMai = parseScheduleSearchQuery("le mois de mai", [2026]);
      assert.equal(qMai.isMonth, true);
      assert.equal(qMai.month, 5);
    });

    test("rejects invalid calendar dates (99/99, 32/13, 2026-02-30)", () => {
      const qInvalid = parseScheduleSearchQuery("99/99", [2026]);
      assert.equal(qInvalid.dates.length, 0);
      assert.equal(qInvalid.targetWeekdays.size, 0);

      const qFeb30 = parseScheduleSearchQuery("2026-02-30", [2026]);
      assert.equal(qFeb30.dates.length, 0);
      assert.equal(qFeb30.targetWeekdays.size, 0);
    });

    test("resolves Christmas Eve and New Year Eve holiday eves", () => {
      const qEve = parseScheduleSearchQuery("veille de noel", [2026]);
      assert.equal(qEve.matchedHolidayName, "Veille de Noël");
      assert.ok(qEve.dates.includes("2026-12-24"));
      assert.ok(qEve.targetWeekdays.has("thursday"));

      const qSylvestre = parseScheduleSearchQuery("saint sylvestre", [2026]);
      assert.equal(qSylvestre.matchedHolidayName, "Saint-Sylvestre");
      assert.ok(qSylvestre.dates.includes("2026-12-31"));
      assert.ok(qSylvestre.targetWeekdays.has("thursday"));
    });

    test("renderWeeklyTable preserves both Sunday and Monday for paques when schedule contains Lundi de Paques holiday", () => {
      class MockEl { constructor() { this.innerHTML = ""; } }
      const tbody = new MockEl();
      const origDoc = global.document;
      global.document = { getElementById: (id) => id === "weekly-table-body" ? tbody : new MockEl() };

      const ctrl = new ScheduleViewController();
      ctrl.schedule = {
        monday: { on: "06:50", off: "14:10" },
        tuesday: { on: "06:50", off: "14:10" },
        wednesday: { on: "06:50", off: "14:40" },
        thursday: { on: "06:50", off: "14:10" },
        friday: { on: "06:50", off: "14:10" },
        saturday: { on: "00:00", off: "00:00" },
        sunday: { on: "00:00", off: "00:00" },
        holidays: [{ start: "2026-04-06", end: "2026-04-06", description: "Lundi de Pâques" }],
      };

      ctrl.searchQuery = "paques";
      ctrl.renderWeeklyTable();
      assert.ok(tbody.innerHTML.includes("Dimanche"), "Easter search must show Dimanche even when schedule has Lundi de Pâques");
      assert.ok(tbody.innerHTML.includes("Lundi"), "Easter search must show Lundi");

      ctrl.searchQuery = "pentecote";
      ctrl.schedule.holidays = [{ start: "2026-05-25", end: "2026-05-25", description: "Lundi de Pentecôte" }];
      ctrl.renderWeeklyTable();
      assert.ok(tbody.innerHTML.includes("Dimanche"), "Pentecost search must show Dimanche even when schedule has Lundi de Pentecôte");
      assert.ok(tbody.innerHTML.includes("Lundi"), "Pentecost search must show Lundi");

      global.document = origDoc;
    });

    test("resolves French word premier in dates and ranges", () => {
      const qJan = parseScheduleSearchQuery("premier janvier", [2026]);
      assert.ok(qJan.dates.includes("2026-01-01"));
      assert.equal(qJan.matchedHolidayName, "Nouvel An");

      const qNov = parseScheduleSearchQuery("premier novembre", [2026]);
      assert.ok(qNov.dates.includes("2026-11-01"));
      assert.equal(qNov.matchedHolidayName, "Toussaint");

      const qRange = parseScheduleSearchQuery("du premier au 5 mai", [2026]);
      assert.equal(qRange.ranges.length, 1);
      assert.equal(qRange.ranges[0].start, "2026-05-01");
      assert.equal(qRange.ranges[0].end, "2026-05-05");

      const qCrossYear = parseScheduleSearchQuery("du 25 decembre au premier janvier", [2026]);
      assert.equal(qCrossYear.ranges.length, 1);
      assert.equal(qCrossYear.ranges[0].start, "2026-12-25");
      assert.equal(qCrossYear.ranges[0].end, "2027-01-01");
    });

    test("resolves FWB aliases including federation wallonie bruxelles and mardi gras", () => {
      const qFwb1 = parseScheduleSearchQuery("fete de la federation wallonie bruxelles", [2026]);
      assert.ok(qFwb1.dates.includes("2026-09-27"));
      assert.equal(qFwb1.matchedHolidayName, "Fête de la Communauté française");

      const qFwb2 = parseScheduleSearchQuery("wallonie bruxelles", [2026]);
      assert.ok(qFwb2.dates.includes("2026-09-27"));

      const qMardiGras = parseScheduleSearchQuery("mardi gras", [2026]);
      assert.equal(qMardiGras.matchedHolidayName, "Détente");
      assert.equal(qMardiGras.ranges.length, 1);
      assert.equal(qMardiGras.ranges[0].start, "2026-02-16");
    });

    test("supports whitelist date ranges in isDateCoveredInSchedule and getExplicitScheduleYears", () => {
      const ctrl = new ScheduleViewController();
      ctrl.schedule = {
        whitelist: [
          { start: "2026-07-21", end: "2026-07-23", reason: "Festivités nationales" },
        ],
      };
      assert.equal(ctrl.isDateCoveredInSchedule("2026-07-22"), true);
      assert.equal(ctrl.isDateCoveredInSchedule("2026-07-20"), false);
      const years = ctrl.getExplicitScheduleYears();
      assert.ok(years.includes(2026));
    });

    test("matches generic status queries in renderHolidays, renderWhitelist and renderSpecialSchedules", () => {
      class MockEl { constructor() { this.innerHTML = ""; } }
      const holidaysList = new MockEl();
      const whitelistList = new MockEl();
      const specialList = new MockEl();
      const origDoc = global.document;
      global.document = {
        getElementById: (id) => {
          if (id === "holidays-list") return holidaysList;
          if (id === "whitelist-list") return whitelistList;
          if (id === "special-schedules-list") return specialList;
          return new MockEl();
        },
      };

      const ctrl = new ScheduleViewController();
      ctrl.schedule = {
        holidays: [{ start: "2026-05-14", end: "2026-05-17", description: "Pont de l'Ascension" }],
        whitelist: [{ date: "2026-07-21", reason: "Fête Nationale" }],
        special_schedules: [{ start: "2026-12-24", end: "2026-12-24", on: "08:00", off: "12:00", description: "Veille" }],
      };

      ctrl.searchQuery = "fermeture";
      ctrl.renderHolidays();
      assert.ok(holidaysList.innerHTML.includes("Pont de l&#039;Ascension"));

      ctrl.searchQuery = "ouvert";
      ctrl.renderWhitelist();
      assert.ok(whitelistList.innerHTML.includes("Fête Nationale"));

      ctrl.searchQuery = "special";
      ctrl.renderSpecialSchedules();
      assert.ok(specialList.innerHTML.includes("Veille"));

      global.document = origDoc;
    });
  });
});
