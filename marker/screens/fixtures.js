(()=>{
// Documentation snapshot from willyros01/marker main 9b6cc89 (0.6.4).
// No live service, sign-in, browser storage, or action listeners. Fictional fixtures only.
const model=(()=>{
/* model.js — the domain, with no Firebase in it.
 *
 * Everything here is a pure function. That is deliberate: it can be unit tested
 * without a network, a browser or a Firebase project, and the same code runs
 * unchanged if the storage layer is ever replaced.
 *
 * Nothing in this file reads or writes anything.
 */

/* ---------------- ids ---------------- */

const newId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* Join codes are read aloud and typed by people, so the alphabet excludes
   characters that are confused in speech or print: I, O, 0, 1, S, 5. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRTUVWXYZ2346789";
function newJoinCode(length = 6) {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}
const normalizeJoinCode = (code) =>
  String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/* ---------------- handicap math (World Handicap System) ---------------- */

const round1 = (n) => Math.round(n * 10) / 10;

const differential = (adjustedGross, courseRating, slopeRating) =>
  round1((113 / Number(slopeRating)) * (Number(adjustedGross) - Number(courseRating)));

/* Rule 5.2a — how many of the lowest differentials count, and the adjustment,
   when fewer than 20 rounds have been posted. */
const SCALE = {
  3: [1, -2], 4: [1, -1], 5: [1, 0], 6: [2, -1], 7: [2, 0], 8: [2, 0],
  9: [3, 0], 10: [3, 0], 11: [3, 0], 12: [4, 0], 13: [4, 0], 14: [4, 0],
  15: [5, 0], 16: [5, 0], 17: [6, 0], 18: [6, 0], 19: [7, 0], 20: [8, 0],
};

/* Takes differentials in chronological order. Returns null below three rounds,
   which is the point at which an index cannot yet be established. */
function handicapIndex(differentialsChronological) {
  const recent = differentialsChronological.slice(-20);
  if (recent.length < 3) return null;
  const [count, adjustment] = SCALE[Math.min(recent.length, 20)];
  const lowest = [...recent].sort((a, b) => a - b).slice(0, count);
  const average = lowest.reduce((a, b) => a + b, 0) / count;
  return Math.min(54, round1(average + adjustment));
}

/* How many of the lowest differentials are counting towards the index right
   now. Used by the trend chart to show which rounds actually moved the number
   and which are only sitting in the window — the same distinction a handicap
   card makes between counting and non-counting scores. */
function countingRounds(howManyRounds) {
  const n = Math.min(Math.max(0, Number(howManyRounds) || 0), 20);
  if (n < 3) return 0;
  return SCALE[n][0];
}

const courseHandicap_ = (index, slopeRating, courseRating, par) =>
  Math.round(index * (slopeRating / 113) + (courseRating - par));

const courseHandicap = (index, slopeRating, courseRating, par) =>
  Math.round(Number(index) * (Number(slopeRating) / 113) + (Number(courseRating) - Number(par)));

/* ---------------- the recent-differential window ---------------- */

/* Each golfer document carries its own window of the 20 most recent
   differentials, so posting a round never has to query a round history.
   Entries are { roundId, date, differential }, held newest first. */

/* Entries carry their group. A rebuild triggered in one group replaces only
   that group's entries and leaves the rest alone — without this, editing a
   round in group one would silently drop every round played in group two. */
function insertIntoWindow(window, entry, limit = 20) {
  const without = (window || []).filter((e) => e.roundId !== entry.roundId);
  const merged = [...without, entry].sort(
    (a, b) => b.date.localeCompare(a.date) || String(b.roundId).localeCompare(String(a.roundId))
  );
  return merged.slice(0, limit);
}

function removeFromWindow(window, roundId) {
  return (window || []).filter((e) => e.roundId !== roundId);
}

/* The window is newest-first; the index calculation wants oldest-first. */
const windowFromOtherGroups = (window, assocId) =>
  (window || []).filter((e) => e.assocId && e.assocId !== assocId);

function mergeWindow(kept, fresh, limit = 20) {
  const merged = [...kept, ...fresh].sort(
    (a, b) => b.date.localeCompare(a.date) || String(b.roundId).localeCompare(String(a.roundId))
  );
  return merged.slice(0, limit);
}

const windowToChronological = (window) =>
  [...(window || [])].sort((a, b) => a.date.localeCompare(b.date)).map((e) => e.differential);

const indexFromWindow = (window) => handicapIndex(windowToChronological(window));

/* Guards against a window holding entries whose rounds no longer exist.
 *
 * This produced negative indexes: rounds deleted from a group that later became
 * unreachable left their differentials in the window forever, and the fewer-
 * than-20 adjustment (minus 2.0 at three rounds) was then applied to a handful
 * of stale numbers. An index can also never be negative in the World Handicap
 * System — the scale runs from +54 downward to 0 for a scratch player, and
 * better than scratch is written as a plus handicap, which this app does not
 * model. So anything below zero is a bug, not a very good golfer. */
function sanitizeWindow(window, knownRoundIds) {
  const known = knownRoundIds instanceof Set ? knownRoundIds : new Set(knownRoundIds || []);
  return (window || []).filter((e) =>
    e && e.roundId && known.has(e.roundId)
    /* Number(null) is 0, which is finite — so null slipped through and was
       treated as a differential of zero, dragging the index down. */
    && e.differential != null && Number.isFinite(Number(e.differential))
    && typeof e.date === "string" && e.date.length >= 10
  );
}

/* The number shown to people. Null until three rounds exist, and never below
   zero. Use this rather than indexFromWindow anywhere it reaches a screen. */
/* Keeps a typed-in figure inside the range the World Handicap System allows. */
const clampIndex = (value) => {
  /* Empty string and null both become 0 through Number(), which would silently
     turn "no index" into "scratch golfer" — the same trap that once read a
     missing differential as zero. Reject them explicitly. */
  if (value === "" || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(54, Math.max(0, Math.round(n * 10) / 10));
};

/* The index to use for a golfer, and where it came from.
 *
 * Real rounds win as soon as there are three. Below that the manual figure
 * stands in, so somebody with a known handicap is not treated as unrated. */
function effectiveIndex(golfer) {
  if (!golfer) return { index: null, source: "none" };
  /* A regular member sees other golfers only through the group directory
     (Version 2.0, Phase A): the published index, nothing to recompute from. */
  if (golfer.fromDirectory) {
    const v = golfer.directoryIndex;
    return Number.isFinite(v) ? { index: v, source: "directory" } : { index: null, source: "none" };
  }
  const fromRounds = displayIndex(golfer.recentWindow);
  if (fromRounds != null) return { index: fromRounds, source: "rounds" };
  const manual = clampIndex(golfer.manualIndex);
  if (manual != null) return { index: manual, source: "manual" };
  return { index: null, source: "none" };
}

function displayIndex(window) {
  const list = window || [];
  if (list.length < 3) return null;
  const value = indexFromWindow(list);
  if (value == null) return null;
  return value < 0 ? 0 : value;
}

/* A round older than every entry in a full window cannot affect the index —
   worth knowing, because it means a backdated round is often a no-op. */
function affectsWindow(window, date, limit = 20) {
  const list = window || [];
  if (list.length < limit) return true;
  const oldest = list[list.length - 1];
  return !oldest || date.localeCompare(oldest.date) >= 0;
}

/* ---------------- document shapes ---------------- */

/* Course and tee details are copied onto every round on purpose. When a course
   is re-rated, rounds already played must keep the rating that applied on the
   day — a round is a record of what happened, not a live lookup. */
function buildRound({
  assocId, golferId, gameId = null, date, course, tee,
  gross, adjusted, notes = "", enteredBy, handicapIndexAtEntry = null, id = newId(),
}) {
  const adjustedGross = Number(adjusted || gross);
  const rating = Number(tee.rating);
  const slope = Number(tee.slope);
  const par = Number(tee.par);
  return {
    id,
    assocId,
    golferId,
    gameId,
    date,
    courseId: course.id,
    courseName: course.name,
    teeId: tee.id,
    teeName: tee.name,
    rating, slope, par,
    gross: Number(gross),
    adjusted: adjustedGross,
    differential: differential(adjustedGross, rating, slope),
    /* Frozen at entry so a result never changes retrospectively when a late
       round shifts somebody's index. */
    courseHandicap:
      handicapIndexAtEntry == null ? null : courseHandicap(handicapIndexAtEntry, slope, rating, par),
    indexAtEntry: handicapIndexAtEntry,
    notes: String(notes || "").trim(),
    enteredBy,
    /* enteredAt is set by the server on write — the 24-hour edit window is
       enforced against it in the security rules, so a device clock cannot
       be used to extend it. */
  };
}

/* A golfer is a person, not a group member.
 *
 * One record, one handicap index, however many groups they play in. This is
 * not a convenience: the World Handicap System defines an index over a
 * player's last twenty rounds, full stop. Splitting those rounds across groups
 * and averaging each pile separately produces two indexes, neither of which is
 * the player's handicap. It would look tidy and be wrong.
 */
/* manualIndex is a STARTING POINT, not an override.
 *
 * A golfer joining a tournament may already have a handicap from elsewhere and
 * no rounds here yet — without this they would have no index at all, and no
 * fair net score. Once they have three rounds of their own, those rounds take
 * over completely and the manual figure is ignored. That is the honest way
 * round: a real index always beats a remembered one. */
const buildGolfer = ({ name, linkedUid = null, manualIndex = null, id = newId() }) => ({
  id,
  name: String(name).trim(),
  nameKey: nameKey(name),
  linkedUid,
  manualIndex: manualIndex == null ? null : clampIndex(manualIndex),
  handicapIndex: null,
  roundCount: 0,
  recentWindow: [],
});

/* Names are matched on this, so "Willy  Rosales" and "willy rosales" are the
   same person. It is also the key of the uniqueness index. */
const nameKey = (name) => {
  /* Deliberately tolerant. It is handed values from documents written by older
     versions, where the field may be missing entirely — passing null or a
     number here used to throw "null is not an object" and break renaming. */
  if (name == null) return "";
  return String(name).trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const buildCourse = ({ name, club = "", location = "", country = "", tees, createdBy, id = newId() }) => ({
  id,
  name: String(name).trim(),
  club, location, country,
  tees: (tees || []).map((t) => ({
    id: t.id || newId(),
    name: String(t.name).trim(),
    rating: Number(t.rating),
    slope: Number(t.slope),
    par: Number(t.par),
  })),
  createdBy,
});

/* A game can span days. endDate is optional and absent for the ordinary
   one-day case, so nothing about a normal Saturday changes — a tournament is
   just a game whose window happens to be wider. */
const buildGame = ({ assocId, date, endDate = null, courseId, name = "", createdBy, id = newId() }) => ({
  id, assocId, date,
  /* Optional, and absent for an ordinary one-day game, so nothing about a
     normal Saturday changes — a tournament is simply a game with a wider
     window. A backwards end date is ignored rather than accepted. */
  endDate: endDate && endDate > date ? endDate : null,
  courseId, name: String(name).trim(), createdBy,
});

/* Whether a date falls inside a game's window, inclusive at both ends. */
const gameCovers = (game, date) => {
  if (!game || typeof date !== "string" || !date) return false;
  const from = game.date;
  if (typeof from !== "string") return false;
  return date >= from && date <= (game.endDate || from);
};

/* How many days a game covers, inclusive. */
function gameDays(game) {
  if (!game || !game.date) return 0;
  const to = game.endDate || game.date;
  const from = Date.parse(`${game.date}T00:00:00Z`);
  const until = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(until)) return 1;
  return Math.max(1, Math.round((until - from) / 86400000) + 1);
}

/* A multi-day game's standing: every player's rounds day by day, plus their
   running totals.
 *
 * A tournament is not just a bag of rounds — you want to see who is leading
 * after two days, and what each day cost them. Players are ranked on total net
 * where everyone has one, otherwise on total gross. */
function gameStandings(rounds, golfers, game) {
  const days = [...new Set((rounds || [])
    .map((r) => r && r.date)
    .filter((d) => typeof d === "string"))].sort();

  const board = gameLeaderboard(rounds, golfers);
  const byRound = new Map(board.map((row) => [row.roundId, row]));

  const players = new Map();
  for (const r of rounds || []) {
    if (!r || !r.golferId) continue;
    if (!players.has(r.golferId)) {
      players.set(r.golferId, {
        golferId: r.golferId,
        name: (golfers.find((g) => g.id === r.golferId) || {}).name || "Unknown",
        byDay: {}, totalGross: 0, totalNet: 0, netKnown: true, played: 0,
      });
    }
    const p = players.get(r.golferId);
    const row = byRound.get(r.id) || {};
    p.byDay[r.date] = { gross: r.gross, net: row.net };
    p.played++;
    if (Number.isFinite(+r.gross)) p.totalGross += +r.gross;
    if (row.net == null) p.netKnown = false;
    else p.totalNet += row.net;
  }

  const list = [...players.values()];
  const everyoneHasNet = list.length > 0 && list.every((p) => p.netKnown);
  list.sort((a, b) => everyoneHasNet ? a.totalNet - b.totalNet : a.totalGross - b.totalGross);

  let place = 0, seen = 0, previous = null;
  for (const p of list) {
    seen++;
    const key = everyoneHasNet ? p.totalNet : p.totalGross;
    if (key !== previous) { place = seen; previous = key; }
    p.place = place;
  }

  return { days, players: list, rankedOnNet: everyoneHasNet };
}

const gameSpanLabel = (game) => {
  if (!game || !game.date) return "";
  return !game.endDate || game.endDate === game.date
    ? game.date
    : `${game.date} to ${game.endDate}`;
};

/* Two codes, not one.
 *
 * An invitation that merely SAYS role=admin would let anyone holding the link
 * claim admin — the rules cannot tell an honest link from an edited one. So an
 * admin invitation carries a different secret, and the rules grant the admin
 * role only when that second code matches. A guest link cannot be altered into
 * an admin one. */
/* Version 2.0 Phase D: the admin code is no longer on the group document,
   which every member can read. It lives in associations/{id}/secrets/admin,
   which only the owner can read (store.js ensureAdminCode). */
const buildAssociation = ({ name, ownerUid, joinCode = newJoinCode(), id = newId() }) => ({
  id,
  name: String(name).trim(),
  ownerUid,
  joinCode,
  settings: { minRoundsForRanking: 3 },
});

const buildMember = ({ uid, displayName, role = "member", joinCode }) => ({
  uid,
  displayName: String(displayName || "").trim(),
  role,
  joinCode,   /* proof of entry, checked by the rules on create */
});

/* ---------------- migrating a version 1 scorecard ---------------- */

/* Version 1 held everything in one document: { golfers: [names], courses: [...],
   rounds: [...] }. This turns that into the version 2 collections.
 *
 * It is deterministic: the same input always produces the same ids, so running
 * the import twice writes the same documents instead of duplicating them.
 */
function migrateFromV1(v1, { assocId, assocName, ownerUid, joinCode, existingByNameKey = {} }) {
  const stableId = (kind, key) =>
    `v1-${kind}-${String(key).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

  const association = buildAssociation({
    id: assocId, name: assocName, ownerUid, joinCode,
  });

  const courses = (v1.courses || []).map((c) =>
    buildCourse({
      id: stableId("course", c.id || c.name),
      name: c.name,
      tees: (c.tees || []).map((t) => ({
        id: stableId("tee", `${c.name}-${t.name}`),
        name: t.name, rating: t.rating, slope: t.slope, par: t.par,
      })),
      createdBy: ownerUid,
    })
  );
  const courseByOldId = new Map((v1.courses || []).map((c, i) => [c.id, courses[i]]));

  /* If a golfer with this name already exists — because they were added by
     hand, or play in another of your groups — reuse that record rather than
     creating a second person with a second handicap. */
  const golfers = (v1.golfers || []).map((name) => {
    const key = nameKey(name);
    const already = existingByNameKey[key];
    if (already) return { ...already, name: String(name).trim(), nameKey: key };
    return buildGolfer({ id: stableId("golfer", name), name });
  });
  const golferByName = new Map(golfers.map((g) => [g.name, g]));

  /* Chronological, so each golfer's window ends up in the right order. */
  const sourceRounds = [...(v1.rounds || [])].sort((a, b) => a.date.localeCompare(b.date));

  const rounds = sourceRounds.map((r) => {
    const golfer = golferByName.get(r.golfer);
    const course = courseByOldId.get(r.courseId);
    const tee = course && course.tees.find((t) => t.name === r.teeName);
    return {
      id: stableId("round", r.id),
      assocId,
      golferId: golfer ? golfer.id : stableId("golfer", r.golfer),
      gameId: null,
      date: r.date,
      courseId: course ? course.id : stableId("course", r.courseName),
      courseName: r.courseName,
      teeId: tee ? tee.id : stableId("tee", `${r.courseName}-${r.teeName}`),
      teeName: r.teeName,
      /* The rating and slope recorded on the day are kept, not re-looked-up. */
      rating: Number(r.rating),
      slope: Number(r.slope),
      par: Number(r.par),
      gross: Number(r.gross),
      adjusted: Number(r.adjusted),
      differential: Number(r.differential),
      courseHandicap: null,
      indexAtEntry: null,
      notes: r.notes || "",
      enteredBy: ownerUid,
      migratedFromV1: true,
    };
  });

  /* Rebuild each golfer's window and index from the migrated rounds. */
  for (const golfer of golfers) {
    const theirs = rounds.filter((r) => r.golferId === golfer.id);
    let window = [];
    for (const r of theirs) {
      window = insertIntoWindow(window, { roundId: r.id, date: r.date, differential: r.differential, assocId });
    }
    golfer.recentWindow = window;
    golfer.roundCount = theirs.length;
    golfer.handicapIndex = indexFromWindow(window);
  }

  return { association, courses, golfers, rounds };
}

/* ---------------- rankings ---------------- */

/* Net is gross minus the course handicap frozen onto the round when it was
   entered. Using the stored value rather than recomputing means a result never
   changes afterwards because somebody posted a late round and shifted an index.
   That property matters more in a competitive group than it sounds. */
const netScore = (round) =>
  round.courseHandicap == null ? null : round.gross - round.courseHandicap;

const byName = (golfers) => {
  const map = new Map();
  (golfers || []).forEach((g) => map.set(g.id, g));
  return map;
};

/* One outing. Returns every player with both placings worked out. */
/* The leaderboard.
 *
 * A round stores the course handicap that applied when it was entered, so a
 * result never changes retrospectively. But rounds imported or restored from
 * elsewhere often have nothing stored — and showing those players no net score
 * at all makes them look as though they did badly, when really the app simply
 * did not know their handicap yet. So when nothing was frozen, the golfer's
 * index today is used and the round is marked as estimated. */
function gameLeaderboard(rounds, golfers) {
  const lookup = byName(golfers);
  const rows = (rounds || []).map((r) => {
    const golfer = lookup.get(r.golferId);

    /* Use what was frozen at entry when there is one — that is what keeps a
       past result from shifting. Otherwise work it out from the golfer's index
       today, so somebody with a perfectly good handicap is not left with a
       blank net score merely because their round was imported. */
    let courseHandicap = r.courseHandicap;
    let estimated = false;
    if (courseHandicap == null && Number.isFinite(+r.slope) && Number.isFinite(+r.rating)) {
      /* effectiveIndex, so a golfer carrying only a starting figure still gets
         a fair net score rather than a blank. */
      const { index } = effectiveIndex(golfer);
      if (index != null) {
        const worked = courseHandicap_(index, +r.slope, +r.rating, +r.par);
        if (Number.isFinite(worked)) { courseHandicap = worked; estimated = true; }
      }
    }

    const adjusted = r.adjusted != null ? r.adjusted : r.gross;
    return {
      roundId: r.id,
      golferId: r.golferId,
      name: (golfer || {}).name || "Unknown",
      gross: r.gross,
      courseHandicap,
      estimated,
      net: courseHandicap == null || adjusted == null ? null : adjusted - courseHandicap,
      teeName: r.teeName,
    };
  });

  const place = (list, key) => {
    const ranked = list.filter((r) => r[key] != null).sort((a, b) => a[key] - b[key]);
    let position = 0, seen = 0, previous = null;
    for (const row of ranked) {
      seen++;
      if (row[key] !== previous) { position = seen; previous = row[key]; }
      row[`${key}Place`] = position;   /* ties share a place, as they should */
    }
  };
  place(rows, "gross");
  place(rows, "net");

  return rows.sort((a, b) => (a.netPlace || 99) - (b.netPlace || 99) || a.gross - b.gross);
}

/* A month or a year. Ranked on average net, because that rewards playing well
   rather than playing often — but rounds played and best net come along so the
   picture is not hidden behind one number. */
function periodRanking(rounds, golfers, { minRounds = 3 } = {}) {
  const lookup = byName(golfers);
  const grouped = new Map();

  for (const r of rounds || []) {
    if (!grouped.has(r.golferId)) grouped.set(r.golferId, []);
    grouped.get(r.golferId).push(r);
  }

  const rows = [];
  for (const [golferId, theirs] of grouped) {
    const nets = theirs.map(netScore).filter((n) => n != null);
    const golfer = lookup.get(golferId) || {};
    rows.push({
      golferId,
      name: golfer.name || "Unknown",
      handicapIndex: golfer.handicapIndex == null ? null : golfer.handicapIndex,
      played: theirs.length,
      avgGross: round1(theirs.reduce((a, r) => a + r.gross, 0) / theirs.length),
      avgNet: nets.length ? round1(nets.reduce((a, b) => a + b, 0) / nets.length) : null,
      bestNet: nets.length ? Math.min(...nets) : null,
      bestGross: Math.min(...theirs.map((r) => r.gross)),
      /* Below the threshold they still appear, marked, rather than vanishing
         with no explanation. */
      ranked: theirs.length >= minRounds && nets.length > 0,
    });
  }

  const ranked = rows.filter((r) => r.ranked).sort((a, b) => a.avgNet - b.avgNet);
  ranked.forEach((row, i) => { row.place = i + 1; });
  const unranked = rows.filter((r) => !r.ranked).sort((a, b) => b.played - a.played);
  return [...ranked, ...unranked];
}

const inPeriod = (round, { year, month }) =>
  /* A round with no date belongs to no period, so it is excluded from a
     filtered ranking rather than throwing. Restored and imported rounds can
     arrive without one, and a single missing date used to take down the whole
     Summary screen. */
  (typeof round.date === "string")
    ? ((!year || round.date.slice(0, 4) === year) && (!month || round.date.slice(5, 7) === month))
    : (!year && !month);

return {newId,newJoinCode,normalizeJoinCode,differential,handicapIndex,countingRounds,courseHandicap,insertIntoWindow,removeFromWindow,windowFromOtherGroups,mergeWindow,windowToChronological,indexFromWindow,sanitizeWindow,clampIndex,effectiveIndex,displayIndex,affectsWindow,buildRound,buildGolfer,nameKey,buildCourse,buildGame,gameCovers,gameDays,gameStandings,gameSpanLabel,buildAssociation,buildMember,migrateFromV1,netScore,gameLeaderboard,periodRanking,inPeriod};})();
const card=(()=>{
/* card.js — the scoring card, with no Firebase and no screen in it.
 *
 * Pure functions only, so every rule of play is unit tested without a browser.
 * The handicap arithmetic itself comes from The Scorecard's own model.js (a
 * copy, kept identical), so both apps always agree on a course handicap.
 */

const PICKED_UP = "X";

/* Which holes are played, in playing order.
 *   holes: "18" | "front" | "back"; start: the first hole played (1-18).
 * An 18-hole round started on 10 goes 10..18 then 1..9. A nine started on a
 * hole outside it starts at that nine's first hole. */
function holeOrder(holes, start) {
  const set = holes === "front" ? [1, 2, 3, 4, 5, 6, 7, 8, 9]
    : holes === "back" ? [10, 11, 12, 13, 14, 15, 16, 17, 18]
    : Array.from({ length: 18 }, (_, i) => i + 1);
  const s = set.includes(Number(start)) ? Number(start) : set[0];
  const i = set.indexOf(s);
  return [...set.slice(i), ...set.slice(0, i)];
}

/* The starting holes allowed for a choice of holes. */
const startChoices = (holes) => holeOrder(holes, 0).slice().sort((a, b) => a - b);

/* Course handicap for a player on this tee, or null when it cannot be known
   (no index, or the tee has no rating and slope). */
function courseHandicapFor(index, tee) {
  if (index == null || !Number.isFinite(Number(index))) return null;
  if (!tee || !Number(tee.rating) || !Number(tee.slope) || !Number(tee.par)) return null;
  return model.courseHandicap(Number(index), Number(tee.slope), Number(tee.rating), Number(tee.par));
}

/* Strokes received on a hole of stroke index si (1 = hardest), World Handicap
   System allocation over 18 holes. A plus handicap gives strokes back on the
   easiest holes. */
function strokesOn(ch, si) {
  if (ch == null) return 0;
  /* No stroke index known (a course entered by hand without one): spread the
     strokes evenly, the fairest guess there is. */
  if (!si) return Number(ch) > 0 ? Math.round(Number(ch) / 18) : 0;
  const n = Number(ch);
  if (n >= 0) return Math.floor(n / 18) + ((n % 18) >= si ? 1 : 0);
  const give = Math.abs(n);
  return -(Math.floor(give / 18) + ((19 - si) <= (give % 18) ? 1 : 0)) || 0;
}

/* The most a hole can count for the handicap: net double bogey; without an
   index, par plus five (Rule 3.1). */
function holeCap(par, ch, si) {
  if (ch == null) return Number(par) + 5;
  return Number(par) + 2 + strokesOn(ch, si);
}

/* What a score on a hole counts as. A picked-up hole counts as its cap. */
function grossOn(score, cap) {
  if (score === PICKED_UP) return cap;
  return Number(score);
}

const entered = (s) => s === PICKED_UP || (Number.isInteger(s) && s >= 1 && s <= 20);

/* The hole details for a hole number on the card's tee. */
function holeInfo(card, n) {
  const h = (card.tee.holes || [])[n - 1] || {};
  return { n, par: Number(h.par) || 4, yards: h.yards ? Number(h.yards) : null, si: h.si ? Number(h.si) : null };
}

/* Running totals for one player. */
function totals(card, p) {
  const player = card.players[p];
  let gross = 0, adjusted = 0, toPar = 0, done = 0, pickedUp = 0;
  for (const n of card.order) {
    const s = player.scores[n];
    if (!entered(s)) continue;
    const h = holeInfo(card, n);
    const cap = holeCap(h.par, player.ch, h.si);
    const g = grossOn(s, cap);
    gross += g;
    adjusted += Math.min(g, cap);
    toPar += g - h.par;
    done++;
    if (s === PICKED_UP) pickedUp++;
  }
  const complete = done === card.order.length;
  const net = complete && player.ch != null ? gross - player.ch : null;
  return { gross, adjusted, toPar, done, pickedUp, complete, net };
}

const formatToPar = (d) => (d === 0 ? "E" : d > 0 ? `+${d}` : `−${Math.abs(d)}`);

const holeComplete = (card, n) => card.players.every((p) => entered(p.scores[n]));
const cardComplete = (card) => card.order.every((n) => holeComplete(card, n));
const isEntered = entered;

/* A new card. Each player: { name, golferId|null, assocId|null, guest, index|null }. */
function newCard({ id = model.newId(), mode, date, course, tee, holes, start, entry, game = null, players }) {
  const order = holeOrder(holes, start);
  return {
    id, v: 1, mode, date, holes, start: order[0], entry,
    course: { providerId: course.providerId || null, name: course.name, where: course.where || "" },
    tee: {
      name: tee.name, rating: tee.rating == null ? null : Number(tee.rating),
      slope: tee.slope == null ? null : Number(tee.slope), par: Number(tee.par) || 72,
      holes: (tee.holes || []).map((h) => ({ par: Number(h.par) || 4, yards: h.yards ? Number(h.yards) : null, si: h.si ? Number(h.si) : null })),
    },
    order, pos: 0, who: 0,
    game: game ? { id: game.id, name: game.name, assocId: game.assocId } : null,
    players: players.map((p) => ({
      name: String(p.name).trim(),
      golferId: p.golferId || null,
      assocId: p.assocId || null,
      groupName: p.groupName || "",
      guest: !p.golferId,
      index: p.index == null ? null : Number(p.index),
      ch: courseHandicapFor(p.index, tee),
      scores: {},
    })),
    state: "playing",       /* playing | finished | posting | posted | failed */
    createdAt: Date.now(),
  };
}

/* Setting a score returns a new card (nothing is changed in place). */
function setScore(card, p, n, value) {
  if (!(value === PICKED_UP || (Number.isInteger(value) && value >= 1 && value <= 20))) {
    throw new Error("A score is a whole number from 1 to 20, or picked up.");
  }
  const players = card.players.map((pl, i) => (i === p ? { ...pl, scores: { ...pl.scores, [n]: value } } : pl));
  return { ...card, players };
}

/* Can this card be posted to The Scorecard, and if not, why. */
function postable(card) {
  const members = card.players.filter((p) => !p.guest);
  if (card.mode !== "member") return { ok: false, why: "Played without an account: the card is kept and shared, not posted." };
  if (!members.length) return { ok: false, why: "Nobody on this card is a member of a group, so there is nothing to post." };
  if (card.holes !== "18") return { ok: false, why: "The Scorecard keeps 18-hole rounds only, so a 9-hole card is shared, not posted." };
  if (!Number(card.tee.rating) || !Number(card.tee.slope)) return { ok: false, why: "This tee has no rating and slope, which a handicap needs. Share the card instead." };
  const missing = members.filter((p) => card.order.some((n) => !entered(p.scores[n])));
  if (missing.length) return { ok: false, why: `Every hole needs a score first (${missing.map((p) => p.name).join(", ")}).` };
  return { ok: true, members };
}

/* May this kept card be deleted? Never once posted (it lives in The Scorecard
   then), and never while The Scorecard is checking it (it may still be posted). */
const canDelete = (c) => !!c && c.state !== "posted" && !(c.state === "posting" && c.sent);

/* The text sent by WhatsApp, email or text message. */
function shareText(card) {
  const lines = [];
  const holesWord = card.holes === "18" ? "18 holes" : card.holes === "front" ? "front 9" : "back 9";
  lines.push(`${card.course.name} · ${card.tee.name} · ${card.date} · ${holesWord}`);
  if (card.game) lines.push(`Game: ${card.game.name}`);
  lines.push("");
  const sorted = card.order.slice().sort((a, b) => a - b);
  const nines = [sorted.filter((n) => n <= 9), sorted.filter((n) => n >= 10)].filter((x) => x.length);
  card.players.forEach((pl, i) => {
    const t = totals(card, i);
    const head = `${pl.name}${pl.guest ? " (guest)" : ""}: ${t.gross}` +
      (t.done ? ` (${formatToPar(t.toPar)}${t.complete ? "" : ` thru ${t.done}`})` : "") +
      (t.net != null ? `, net ${t.net}` : "");
    lines.push(head);
    for (const nine of nines) {
      const cells = nine.map((n) => {
        const s = pl.scores[n];
        return entered(s) ? String(s) : "-";
      });
      lines.push(`  ${nine[0]}-${nine[nine.length - 1]}: ${cells.join(" ")}`);
    }
  });
  lines.push("");
  lines.push("Par: " + sorted.map((n) => holeInfo(card, n).par).join(" "));
  lines.push("Scored with The Marker");
  return lines.join("\n");
}

/* The Scorecard's round for one member player, built with The Scorecard's own
   buildRound so the record is exactly what its Enter screen makes. */
function roundFor(card, p, { uid, courseId, teeId, roundId = model.newId() }) {
  const pl = card.players[p];
  const t = totals(card, p);
  const r = model.buildRound({
    id: roundId,
    assocId: pl.assocId,
    golferId: pl.golferId,
    gameId: card.game && card.game.assocId === pl.assocId ? card.game.id : null,
    date: card.date,
    course: { id: courseId, name: card.course.name },
    tee: { id: teeId, name: card.tee.name, rating: card.tee.rating, slope: card.tee.slope, par: card.tee.par },
    gross: t.gross,
    adjusted: t.adjusted,
    notes: "Scored hole by hole with The Marker",
    enteredBy: uid,
    handicapIndexAtEntry: pl.index,
  });
  return {
    ...r,
    cardId: card.id,
    holes: card.order.slice().sort((a, b) => a - b).map((n) => {
      const s = pl.scores[n];
      return s === PICKED_UP ? "X" : s;
    }),
  };
}

return {PICKED_UP,holeOrder,startChoices,courseHandicapFor,strokesOn,holeCap,grossOn,holeInfo,totals,formatToPar,holeComplete,cardComplete,isEntered,newCard,setScore,postable,canDelete,shareText,roundFor};})();
const check=(()=>{
/* cardcheck.js — putting the pictures of a club's scorecard together, and
 * deciding whether the result is a VERIFIED card (Willy, 16 Oct 2026).
 *
 * Shared by the app (to show the scorer what is still missing) and the worker
 * (which decides, from the readings it stored itself, never from values the
 * phone sends). Pure functions only.
 *
 * A reading (worker/src/search.js normalizeScan) covers one or both nines:
 *   { course, holesRead:[n], parOut, parIn,
 *     tees:[{ name, rating, slope, out, in, holes:[18 x {par, yards, si}] }] }
 * mergeReadings() lays later pictures over earlier ones, hole by hole, so a
 * picture of holes 10-18 completes a picture of holes 1-9, and a retaken
 * picture replaces the holes it shows.
 */

/* Yards do not affect handicaps; a card whose printed yard totals do not
   match its holes (a misprint) may still be verified when this is true.
   Decided by Willy: see the design document. */
const LENIENT_YARDS = true;

const teeKey = (name) => String(name || "").trim().toLowerCase().replace(/[^a-z]/g, "");
const FRONT = [1, 2, 3, 4, 5, 6, 7, 8, 9], BACK = [10, 11, 12, 13, 14, 15, 16, 17, 18];
const sum = (arr, holes) => holes.reduce((a, n) => a + (arr[n - 1] == null ? NaN : arr[n - 1]), 0);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function apply(tee, t, holes, withRating) {
  if (withRating && t.rating != null) tee.rating = t.rating;
  if (withRating && t.slope != null) tee.slope = t.slope;
  if (holes.some((n) => n <= 9) && t.out != null) tee.out = t.out;
  if (holes.some((n) => n >= 10) && t.in != null) tee.in = t.in;
  if (t.total != null) tee.total = t.total;
  for (const n of holes) tee.yards[n - 1] = t.holes && t.holes[n - 1] ? t.holes[n - 1].yards : null;
}

function mergeReadings(readings) {
  const m = { course: "", read: [], par: Array(18).fill(null), hcp: Array(18).fill(null), parOut: null, parIn: null, tees: [] };
  const byKey = new Map();
  const pendingPlain = new Map();
  for (const r of readings || []) {
    if (!r || !Array.isArray(r.holesRead)) continue;
    if (r.course && !m.course) m.course = r.course;
    const holes = r.holesRead.filter((n) => Number.isInteger(n) && n >= 1 && n <= 18);
    const first = r.tees && r.tees[0] && r.tees[0].holes ? r.tees[0].holes : [];
    for (const n of holes) {
      m.par[n - 1] = first[n - 1] ? first[n - 1].par : null;
      m.hcp[n - 1] = first[n - 1] ? first[n - 1].si : null;
    }
    if (holes.some((n) => n <= 9) && r.parOut != null) m.parOut = r.parOut;
    if (holes.some((n) => n >= 10) && r.parIn != null) m.parIn = r.parIn;
    for (const t of r.tees || []) {
      const k = teeKey(t.name);
      if (!k) continue;
      const base = t.base || k;
      /* A picture with a men's and a ladies' rating splits a colour into two
         tees; another picture of the same colour (often the other nine, with
         no ratings) fills both. */
      if (k === base && !byKey.has(k) && m.tees.some((x) => x.base === base && x.key !== base)) {
        for (const x of m.tees.filter((x) => x.base === base)) apply(x, t, holes, false);
        continue;
      }
      if (k !== base && byKey.has(base)) {
        const plain = byKey.get(base);
        byKey.delete(base);
        m.tees.splice(m.tees.indexOf(plain), 1);
        for (const label of [k]) {
          const tee = { ...plain, key: label, name: t.name, base, yards: plain.yards.slice() };
          byKey.set(label, tee); m.tees.push(tee);
        }
        pendingPlain.set(base, plain);
      }
      let tee = byKey.get(k);
      if (!tee) {
        const from = pendingPlain.get(base);
        tee = from ? { ...from, key: k, name: t.name, base, yards: from.yards.slice() }
          : { key: k, base, name: t.name, rating: null, slope: null, out: null, in: null, total: null, yards: Array(18).fill(null) };
        byKey.set(k, tee);
        m.tees.push(tee);
      }
      apply(tee, t, holes, true);
    }
    m.read = [...new Set([...m.read, ...holes])].sort((a, b) => a - b);
  }
  /* A tee name in capitals from one picture and in plain letters from the
     other is the same tee; show it the way the first picture had it, tidied. */
  for (const t of m.tees) t.name = t.name.replace(/\b([A-Z])([A-Z]{2,})\b/g, (_, a, b) => a + b.toLowerCase());
  return m;
}

/* Is the card complete and consistent? Stringent on purpose: every tee printed
 * on the card must be complete, not only the one being played. Returns
 *   { ok, problems: [plain words], front, back (each true when that nine's
 *     pars add up), holes: { par:[n], hcp:[n] } to mark, tees: { key: { ok, problems, yards:[n] } } } */
function verifyCard(m, { lenientYards = false } = {}) {
  const problems = [];
  const mark = { par: [], hcp: [] };
  const missing = [...FRONT, ...BACK].filter((n) => !m.read.includes(n));
  if (missing.length) problems.push(missing.every((n) => n >= 10) ? "Holes 10 to 18 have not been read yet." : missing.every((n) => n <= 9) ? "Holes 1 to 9 have not been read yet." : `Holes ${missing.join(", ")} have not been read.`);
  if (!String(m.course || "").trim()) problems.push("The course name was not read.");

  m.par.forEach((p, i) => { if (m.read.includes(i + 1) && !(Number.isInteger(p) && p >= 3 && p <= 6)) mark.par.push(i + 1); });
  const nine = (holes, total, label) => {
    if (!holes.every((n) => m.read.includes(n))) return false;
    if (!isNum(total)) { problems.push(`The par total for ${label} was not read.`); return false; }
    if (sum(m.par, holes) !== total) { problems.push(`The pars of ${label} do not add up to ${total}.`); holes.forEach((n) => mark.par.includes(n) || mark.par.push(n)); return false; }
    return true;
  };
  const front = nine(FRONT, m.parOut, "holes 1 to 9");
  const back = nine(BACK, m.parIn, "holes 10 to 18");
  if (mark.par.length && !problems.some((p) => /pars of/.test(p))) problems.push("Some pars were not read.");

  const seen = {};
  m.hcp.forEach((h, i) => { if (m.read.includes(i + 1)) { if (!(Number.isInteger(h) && h >= 1 && h <= 18)) mark.hcp.push(i + 1); else (seen[h] = seen[h] || []).push(i + 1); } });
  Object.values(seen).filter((l) => l.length > 1).forEach((l) => l.forEach((n) => mark.hcp.push(n)));
  if (mark.hcp.length) problems.push("The handicap numbers must run from 1 to 18, each once. Some were not read or repeat.");

  const tees = {};
  if (!m.tees.length) problems.push("No tee was read.");
  for (const t of m.tees) {
    const tp = [];
    const warn = [];
    const yards = [];
    t.yards.forEach((y, i) => { if (m.read.includes(i + 1) && !(Number.isInteger(y) && y >= 50 && y <= 800)) yards.push(i + 1); });
    if (yards.length) tp.push("some yards were not read");
    /* A nine whose yards do not add up to its printed total is accepted only
       when the card's own 18-hole TOTAL proves the printed nine total wrong:
       the other nine adds up and both nines together make the TOTAL. (Royal
       Ontario's card prints Gold IN 3457; the holes add up to 3467, and the
       card's TOTAL 6786 = OUT 3319 + 3467.) */
    const fOk = isNum(t.out) && sum(t.yards, FRONT) === t.out;
    const bOk = isNum(t.in) && sum(t.yards, BACK) === t.in;
    const allOk = isNum(t.total) && sum(t.yards, [...FRONT, ...BACK]) === t.total;
    const check = (holes, total, word, ok, otherOk) => {
      if (!holes.every((n) => m.read.includes(n))) return;
      if (!isNum(total)) { tp.push(`its ${word} total was not read`); return; }
      if (ok) return;
      if (otherOk && allOk) { (tees.notes = tees.notes || []).push(`${t.name}: the card prints ${word} ${total}, but its holes add up to ${sum(t.yards, holes)}, which the card's own total ${t.total} confirms; the holes are used.`); return; }
      if (lenientYards) { warn.push(`the card prints ${word} ${total}, but its holes add up to ${sum(t.yards, holes)}`); return; }
      tp.push(`its yards do not add up to the ${word} total ${total}`); holes.forEach((n) => yards.includes(n) || yards.push(n));
    };
    check(FRONT, t.out, "OUT", fOk, bOk);
    check(BACK, t.in, "IN", bOk, fOk);
    if (!(isNum(t.rating) && t.rating >= 55 && t.rating <= 85)) tp.push("its rating was not read");
    if (!(Number.isInteger(t.slope) && t.slope >= 55 && t.slope <= 155)) tp.push("its slope was not read");
    tees[t.key] = { ok: !tp.length && m.read.length === 18, problems: tp, warnings: warn, yards: yards.sort((a, b) => a - b) };
    if (tp.length) problems.push(`${t.name}: ${tp.join(", ")}.`);
  }
  const par = sum(m.par, [...FRONT, ...BACK]);
  const notes = tees.notes || [];
  delete tees.notes;
  return {
    ok: !problems.length, problems, notes, front, back, holes: mark, tees,
    par: Number.isFinite(par) ? par : null,
  };
}

/* The course as The Marker keeps it: every tee, with its holes. */
function courseFromCard(m, { where = "" } = {}) {
  const par = m.par.reduce((a, b) => a + (b || 0), 0);
  return {
    name: String(m.course || "").trim(),
    where,
    tees: m.tees.map((t) => ({
      name: t.name, rating: t.rating, slope: t.slope, par,
      holes: m.par.map((p, i) => ({ par: p, yards: t.yards[i], si: m.hcp[i] })),
    })),
  };
}

return {LENIENT_YARDS,teeKey,mergeReadings,verifyCard,courseFromCard};})();
const W=(()=>{
/* withdrawn.js — which course details may no longer be used.
 *
 * An administrator of The Scorecard withdraws a course whose details may be
 * wrong (Willy, 16 Oct 2026). A withdrawn course is never used or edited
 * again; it stays only because posted rounds point to it. There may be any
 * number of withdrawn versions of the same course.
 *
 * Shared by the worker and the app, so both judge a tee the same way:
 *   - a tee with the same course name and the same rating and slope (and par,
 *     when both have one) as a tee of a withdrawn course carries the withdrawn
 *     details, and is never used, whoever offers it;
 *   - anything else is new details (a corrected entry from the golf course
 *     database, or a course entered by hand) and may be used.
 * `list` is [{ id, name, tees: [{ name, rating, slope, par }] }].
 */
const lower = (s) => String(s || "").trim().toLowerCase();

const isWithdrawnCourse = (c) => !!c && (c.withdrawn === true || c.deleted === true || !!c.deletedAt);

function teeWithdrawn(list, courseName, tee) {
  if (!tee) return false;
  const name = lower(courseName);
  return (list || []).some((w) => lower(w.name) === name && (w.tees || []).some((t) =>
    Number(t.rating) === Number(tee.rating) && Number(t.slope) === Number(tee.slope)
    && (!Number(t.par) || !Number(tee.par) || Number(t.par) === Number(tee.par))));
}

/* A course entered by hand and kept in The Marker's library is "m-" + the id
   of the Scorecard course made from it. */
const scorecardIdOf = (providerId) => (/^m-/.test(String(providerId || "")) ? String(providerId).slice(2) : "");

function nameWithdrawn(list, courseName) {
  const name = lower(courseName);
  return (list || []).some((w) => lower(w.name) === name);
}

/* What the worker hands the app: names, figures and ids only. */
const summary = (docs) => docs.filter((d) => isWithdrawnCourse(d.data)).map((d) => ({
  id: d.id, name: d.data.name || "",
  tees: (d.data.tees || []).map((t) => ({ name: t.name || "", rating: Number(t.rating), slope: Number(t.slope), par: Number(t.par) || null })),
}));

return {lower,isWithdrawnCourse,teeWithdrawn,scorecardIdOf,nameWithdrawn,summary};})();
const courses=(()=>{
/* courses.js — course search at GolfCourseAPI, with the holes.
 *
 * Runs on the worker only (worker/src/search.js), where the key is a secret.
 * The app uses explain() for the messages; it never holds the key.
 *
 * Search results carry no tees; the course record fetched by id has every
 * tee with its holes: par, yardage and "handicap" (the stroke index).
 * The provider has changed shapes before, so nothing here assumes one.
 */
const BASE = "https://api.golfcourseapi.com";
const AUTH = (key) => ({ Authorization: "Key " + key });

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

function asList(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  if ("course_rating" in value || "tee_name" in value || "rating" in value) return [value];
  return Object.values(value);
}

function holesFrom(raw) {
  return asList(raw).filter((h) => h && typeof h === "object").map((h) => ({
    par: num(h.par) || 4,
    yards: num(h.yardage ?? h.yards ?? h.length),
    si: num(h.handicap ?? h.stroke_index ?? h.si ?? h.hcp),
  }));
}

/* Every tee, men's and women's, with holes. A tee with no rating or slope is
   still kept (it can be scored and shared), marked so posting refuses it. */
function teesFrom(raw) {
  const out = [];
  const add = (value, tag) => {
    for (const t of asList(value)) {
      if (!t || typeof t !== "object") continue;
      const name = String(t.tee_name ?? t.name ?? "Tee").trim() + (tag ? ` (${tag})` : "");
      const holes = holesFrom(t.holes);
      out.push({
        name,
        rating: num(t.course_rating ?? t.rating),
        slope: num(t.slope_rating ?? t.slope),
        par: num(t.par_total ?? t.par) || (holes.length ? holes.reduce((a, h) => a + h.par, 0) : 72),
        yards: num(t.total_yards),
        holes,
      });
    }
  };
  if (Array.isArray(raw)) add(raw, "");
  else if (raw && typeof raw === "object") {
    add(raw.male, "M");
    add(raw.female, "W");
    for (const [k, v] of Object.entries(raw)) {
      if (k === "male" || k === "female") continue;
      add(v, /wom|female|ladies/i.test(k) ? "W" : /men|male/i.test(k) ? "M" : "");
    }
  }
  const seen = new Set();
  return out.filter((t) => {
    const key = `${t.name}|${t.rating}|${t.slope}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function courseFrom(c) {
  const club = String(c.club_name || "").trim();
  const course = String(c.course_name || "").trim();
  const name = !course || course === club ? club || course : `${club} — ${course}`;
  const loc = c.location || {};
  const where = String(loc.address || [loc.city, loc.state, loc.country].filter(Boolean).join(", ") || "");
  return { providerId: String(c.id ?? "").trim(), name: name || "Unnamed course", where, tees: teesFrom(c.tees) };
}

async function call(url, key) {
  if (!key) throw new Error("NO_KEY");
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("OFFLINE");
  let res;
  try { res = await fetch(url, { headers: AUTH(key) }); }
  catch { throw new Error("UNREACHABLE"); }
  if (res.status === 401 || res.status === 403) throw new Error("BAD_KEY");
  if (res.status === 429) throw new Error("RATE");
  if (res.status === 404) throw new Error("NO_MATCH");
  if (!res.ok) throw new Error("HTTP_" + res.status);
  try { return await res.json(); } catch { throw new Error("BAD_RESPONSE"); }
}

/* Names matching the words typed. Tried as typed, then without filler words. */
async function search(query, key) {
  const raw = String(query || "").trim();
  if (raw.length < 3) throw new Error("TOO_SHORT");
  const trimmed = raw.replace(/\b(golf|club|course|country|links|and|the|&|cc|gc|g&cc)\b/gi, " ").replace(/\s+/g, " ").trim();
  const attempts = [raw];
  if (trimmed && trimmed.toLowerCase() !== raw.toLowerCase() && trimmed.length >= 3) attempts.push(trimmed);
  const seen = new Set();
  const found = [];
  let lastError = null;
  for (const q of attempts) {
    try {
      const data = await call(`${BASE}/v1/search?search_query=${encodeURIComponent(q)}`, key);
      const list = Array.isArray(data) ? data : data.courses || data.results || [];
      for (const c of list.map(courseFrom)) {
        if (!c.providerId || seen.has(c.providerId)) continue;
        seen.add(c.providerId);
        found.push(c);
      }
    } catch (e) { lastError = e; }
  }
  if (!found.length) throw lastError || new Error("NO_MATCH");
  return found.slice(0, 12);
}

/* One course with all its tees and holes. */
async function byId(id, key) {
  const data = await call(`${BASE}/v1/courses/${encodeURIComponent(String(id))}`, key);
  const record = data && (data.course || data.data || data);
  const course = courseFrom(record || {});
  if (!course.tees.length) throw new Error("NO_TEES");
  return course;
}

function explain(code) {
  switch (String(code && code.message ? code.message : code)) {
    case "NO_KEY":
    case "NOT_SET_UP": return "Course search is not set up yet. Enter the course yourself — it takes a minute.";
    case "SIGN_IN": return "Course search needs a moment of signal to sign in. Try again, or enter the course yourself.";
    case "TRY_LATER": return "The course search is having a problem. Try again shortly, or enter the course yourself.";
    case "TOO_SHORT": return "Type at least three letters of the course or club name.";
    case "OFFLINE": return "No signal, so search is not available. Choose a saved course, or enter one yourself.";
    case "UNREACHABLE": return "The course search could not be reached. Try again, or enter the course yourself.";
    case "BAD_KEY": return "The course search key was refused. Willy needs to check it.";
    case "RATE": return "The course search is busy or its daily limit is reached. Try later, or enter the course yourself.";
    case "NO_MATCH": return "No course matched. Try the club name, or just the town.";
    case "NO_TEES": return "That course has no tee details. Enter the course yourself.";
    case "LIMIT": return "Today's searches without an account are used up. Choose a saved course, or enter one yourself.";
    case "SCAN_LIMIT": return "Today's photo readings are used up. Type the course in below.";
    case "SCAN_BUSY": return "Photo reading has reached its free allowance for today. Type the course in below.";
    case "SCAN_UNREADABLE": return "The photo could not be read. Try again with the whole card flat, in good light and in focus, or type it in below.";
    case "SCAN_BAD_PHOTO": return "That file is not a photo the app can read. Take a picture of the card instead.";
    case "SCAN_TOO_BIG": return "That photo is too large. Take a new picture of the card.";
    case "SCAN_FAILED": return "Reading the photo did not work this time. Try again, or type the course in below.";
    case "AI_LICENCE": return "Photo reading is not switched on yet. Willy needs to finish setting it up. Type the course in below.";
    case "BAD_RESPONSE": return "The course search sent something unreadable. Try again, or enter the course yourself.";
    default: return `Course search did not work (${String(code && code.message ? code.message : code)}). Enter the course yourself.`;
  }
}

return {teesFrom,courseFrom,search,byId,explain};})();
let demoUser={uid:'example',email:'alex@example.invalid',anonymous:false};
let current=null,kept=[],recent=[];
const local={currentCard:()=>current,finishedCards:()=>kept,recentCourses:()=>recent,prefs:()=>({entry:'one'})};
const db={currentUser:()=>demoUser,waitingToPost:()=>0};
self.APP_VERSION='0.6.4';
/* app.js — The Marker's screens.
 *
 * One function per screen, each returning HTML; one click handler for the
 * whole page (data-act). Every score is saved on the phone the moment it is
 * entered, checked by reading it back, before the screen moves on.
 */

const VERSION = self.APP_VERSION || "dev";
const app = document.getElementById("app");

/* ---------------- state ---------------- */

const S = {
  screen: "start",
  busy: "",
  flash: "",               /* a message shown once at the top of the body */
  error: "",
  /* setting up a round */
  setup: null,             /* { date, course, tee, holes, start, entry, game } */
  groups: [], groupTab: "", golfers: {}, games: [],
  picked: [],              /* players chosen: { name, golferId, assocId, groupName, index } */
  guestName: "",
  /* course choice */
  cs: { query: "", results: [], library: [], error: "", manual: null, withdrawn: [], scan: null, readings: [], pickTee: false },
  /* play */
  typing: false, typed: "", typeError: "",
  view: null,              /* a finished card being looked at */
  mine: null,              /* from The Scorecard: { correctable, editable } */
  share: null,             /* text for the share screen */
};

const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const shiftDate = (iso, days) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const daysIn = (y, m) => new Date(y, m, 0).getDate();
/* A round is never dated after today (The Scorecard refuses future cards). */
const notFuture = (d) => (d > today() ? today() : d);
/* The Scorecard's own calendar, the same on every phone and tablet (the
   iPad's built-in date picker could not change month or year reliably). */
const cal = { open: false, month: null, pick: null, typed: "" };
function shiftMonth(ym, by) {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + by;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}
function dayGrid(ym) {
  const [y, m] = ym.split("-").map(Number);
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;   /* Monday first */
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysIn(y, m); d++) cells.push(d);
  return cells;
}
function datePicker(value) {
  const btn = `<button class="datebtn" data-act="cal-open"><span>${esc(niceDate(value))}</span><span class="datebtn-hint">${cal.open ? "▲" : "▾"}</span></button>`;
  if (!cal.open) return btn;
  const showing = cal.month || value.slice(0, 7);
  const now = today();
  const thisYear = Number(now.slice(0, 4));
  const years = []; for (let y = thisYear; y >= thisYear - 9; y--) years.push(y);
  return `${btn}<div class="cal">
    <div class="cal-head">
      <button class="cal-arrow" data-act="cal-prev" aria-label="Previous month">‹</button>
      <div class="cal-title">
        <button class="cal-jump" data-act="cal-months">${MONTHS[Number(showing.slice(5, 7)) - 1]}</button>
        <button class="cal-jump" data-act="cal-years">${showing.slice(0, 4)}</button>
      </div>
      <button class="cal-arrow" data-act="cal-next" aria-label="Next month">›</button>
    </div>
    ${cal.pick === "months" ? `<div class="cal-pick">${MONTHS.map((n, i) => {
      const ym = `${showing.slice(0, 4)}-${String(i + 1).padStart(2, "0")}`;
      return `<button class="cal-pick-btn ${ym === showing ? "picked" : ""}" data-act="cal-month" data-v="${ym}">${n.slice(0, 3)}</button>`;
    }).join("")}</div>` : ""}
    ${cal.pick === "years" ? `<div class="cal-pick">${years.map((y) => {
      const ym = `${y}-${showing.slice(5, 7)}`;
      return `<button class="cal-pick-btn ${String(y) === showing.slice(0, 4) ? "picked" : ""}" data-act="cal-month" data-v="${ym}">${y}</button>`;
    }).join("")}</div>` : ""}
    <div class="cal-week">${["M", "T", "W", "T", "F", "S", "S"].map((d) => `<span>${d}</span>`).join("")}</div>
    <div class="cal-grid">${dayGrid(showing).map((d) => {
      if (d === null) return `<span class="cal-blank"></span>`;
      const day = `${showing}-${String(d).padStart(2, "0")}`;
      return `<button class="cal-day ${day === value ? "picked" : ""} ${day === now ? "today" : ""}" data-act="cal-day" data-v="${day}" ${day > now ? "disabled" : ""}>${d}</button>`;
    }).join("")}</div>
    <div class="cal-typed">
      <span class="label">Or type it</span>
      <input class="input" id="caltyped" inputmode="numeric" placeholder="2025 05 18" value="${esc(cal.typed)}" autocomplete="off">
      <button class="btn" data-act="cal-typed">Use what I typed</button>
    </div>
    <div class="cal-foot">
      <button class="btn" data-act="cal-today">Today</button>
      <button class="btn primary" data-act="cal-close">Use this date</button>
    </div>
  </div>`;
}
function setRoundDate(d) {
  S.setup.date = notFuture(d); S.setup.game = null;
  cal.open = false; cal.month = null; cal.pick = null; cal.typed = "";
  render(); loadGames();
}
const niceDate = (iso) => { try { return new Date(iso + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); } catch { return iso; } };
const first = (name) => String(name || "").split(" ")[0];
const user = () => db.currentUser();
const member = () => !!(user() && !user().anonymous);

function go(screen) { S.screen = screen; S.error = ""; render(); window.scrollTo(0, 0); }
function fail(e) { S.busy = ""; S.error = String((e && e.message) || e); render(); }

/* Saving the card being played. Throws if the phone would not keep it. */
function saveCard(c) {
  local.saveCurrent(c);
  return c;
}

/* ---------------- shared pieces ---------------- */

function top(title, sub = "", right = "") {
  return `<header class="top"><div class="row"><div class="sub">${esc(sub)}</div><div class="row">${right}</div></div>
    <div class="title">${esc(title)}</div></header>`;
}
const banner = () => (S.error ? `<div class="banner bad" role="alert">${esc(S.error)}</div>` : "")
  + (S.flash ? `<div class="banner ok">${esc(S.flash)}</div>` : "");
const netPill = () => {
  const waiting = db.waitingToPost();
  if (navigator.onLine === false) return `<span class="pill">No signal${waiting ? ` · ${waiting} waiting` : ""}</span>`;
  return waiting ? `<span class="pill">${waiting} waiting to post</span>` : "";
};

/* ---------------- 0 · start ---------------- */

function screenStart() {
  const cur = local.currentCard();
  const u = user();
  const cards = local.finishedCards();
  const signedIn = !!(u && !u.anonymous);
  const what = cur && cur.correcting ? "Continue your correction" : cur && cur.repostOf ? "Continue your re-post" : "Continue your round";
  const resume = cur && (cur.state === "playing" || cur.state === "finished")
    ? `<button class="btn primary tall" data-act="resume"><span>${what}</span><small>${esc(cur.course.name)} · ${esc(niceDate(cur.date))}${cur.correcting || cur.state === "finished" ? "" : ` · hole ${esc(cur.order[cur.pos])}`}</small></button>` : "";
  const editable = signedIn && S.mine ? S.mine.editable.filter((x) => !x.hidden).length : 0;
  let main;
  if (signedIn) {
    main = `<button class="btn ${resume ? "" : "primary"} tall big" data-act="new-round"><span>⛳ Start a new round</span><small>Rounds are posted to The Scorecard.</small></button>
      <button class="btn split" data-act="history"><span>Your cards</span>${editable ? `<span class="badge">${editable} editable</span>` : ""}</button>`;
  } else {
    main = `<button class="btn ${resume ? "" : "primary"} tall" data-act="go-signin"><span>Sign in with The Scorecard</span><small>Pick golfers from your groups. Scores are posted for them.</small></button>
      <button class="btn outline tall" data-act="play-anon"><span>Play without an account</span><small>Type the players' names. Keep and share the card; nothing is posted.</small></button>
      ${cards.length ? `<button class="btn split" data-act="history"><span>Your cards</span></button>` : ""}`;
  }
  return `${top("The Marker", "Hole-by-hole scorecard", netPill())}
    <main class="body">${banner()}${resume}${main}</main>
    <footer class="foot">${signedIn ? `<div class="who">Signed in as ${esc(u.email)}</div><button class="btn" data-act="sign-out">Sign out</button>` : ""}
      <div class="links">
      <a href="https://www.cuberoot-systems.com/scorecard/support/" target="_blank" rel="noopener">Support</a>
      <a href="https://www.cuberoot-systems.com/scorecard/privacy/" target="_blank" rel="noopener">Privacy</a>
      <span class="muted">v${esc(VERSION)}</span></div></footer>`;
}

/* The Your cards lists from The Scorecard: asked for again at most once a
   minute (or at once when `force`), kept until the next answer. */
let mineAt = 0;
async function refreshMine(force = false) {
  const u = user();
  if (!u || u.anonymous) { S.mine = null; return; }
  if (navigator.onLine === false) return;
  if (!force && Date.now() - mineAt < 60000) return;
  mineAt = Date.now();
  try { S.mine = await db.myCards(); } catch { /* the last list stays */ }
  if (["start", "history"].includes(S.screen)) render();
}

/* ---------------- sign in ---------------- */

function screenSignIn() {
  return `${top("Sign in", "With your Scorecard account")}
    <main class="body">${banner()}
      <p>Use the same email and password as The Scorecard.</p>
      <label class="field"><span class="label">Email</span><input class="input" id="email" type="email" autocomplete="username" inputmode="email" autocapitalize="off"></label>
      <label class="field"><span class="label">Password</span><input class="input" id="password" type="password" autocomplete="current-password"></label>
      <button class="btn primary" data-act="sign-in" ${S.busy ? "disabled" : ""}>${S.busy ? "Signing in…" : "Sign in"}</button>
      <button class="btn dashed" data-act="reset">Forgot the password? Send a reset email</button>
    </main>
    <footer class="foot"><button class="btn" data-act="home">← Back</button></footer>`;
}

/* ---------------- 1 · set up the round ---------------- */

function newSetup() {
  const p = local.prefs();
  return { date: today(), course: null, tee: null, holes: "18", start: 1, entry: p.entry || "one", game: null };
}

function screenSetup() {
  const s = S.setup;
  const c = s.course;
  const tees = c ? c.tees : [];
  const holesCount = s.tee ? (s.tee.holes || []).length : 18;
  const nineOnly = holesCount > 0 && holesCount < 18;
  const holeBtn = (v, label) => `<button class="choice ${s.holes === v ? "on" : ""}" data-act="holes" data-v="${v}" ${nineOnly && v !== "front" ? "disabled" : ""}>${label}</button>`;
  const games = member() ? S.games : [];
  return `${top("Set up the round", member() ? user().email : "Playing without an account", netPill())}
    <main class="body">${banner()}
      <div class="field"><span class="label">Date</span>
        ${datePicker(s.date)}</div>
      <div class="field"><span class="label">Course</span>
        <button class="btn" style="justify-content:flex-start" data-act="go-course">${c ? esc(c.name) : "Choose a course"} ▸</button></div>
      ${c ? `<div class="field"><span class="label">Tee</span><div class="list">${tees.map((t, i) => t.withdrawn ? `
        <button class="item" disabled><span class="box"></span>
          <span class="txt"><span class="name">${esc(t.name)} · withdrawn</span><span class="meta">These details were withdrawn from The Scorecard and cannot be used.</span></span></button>` : `
        <button class="item ${s.tee && s.tee.name === t.name && s.tee.rating === t.rating ? "on" : ""}" data-act="tee" data-v="${i}">
          <span class="box">${s.tee && s.tee.name === t.name && s.tee.rating === t.rating ? "✓" : ""}</span>
          <span class="txt"><span class="name">${esc(t.name)}</span><span class="meta">${t.rating && t.slope ? `${esc(t.rating)} / ${esc(t.slope)}` : "No rating"} · par ${esc(t.par)}${(t.holes || []).length ? "" : " · no hole details"}</span></span></button>`).join("")}</div></div>` : ""}
      ${c && s.tee && (s.tee.holes || []).length ? `<button class="btn" data-act="check-holes">Check the holes (par, yards, handicap)</button>` : ""}
      <div class="field"><span class="label">Holes</span><div class="row3">${holeBtn("18", "18 holes")}${holeBtn("front", "Front 9")}${holeBtn("back", "Back 9")}</div></div>
      <div class="field"><span class="label">Starting hole</span>
        <div class="stepper"><button data-act="start" data-v="-1" aria-label="Earlier hole">−</button><div class="val">${esc(s.start)}</div><button data-act="start" data-v="1" aria-label="Later hole">+</button></div>
        <span class="muted">For a shotgun start, choose the hole you begin on.</span></div>
      <div class="field"><span class="label">Score entry</span><div class="row2">
        <button class="choice ${s.entry === "one" ? "on" : ""}" data-act="entry" data-v="one">One golfer at a time</button>
        <button class="choice ${s.entry === "all" ? "on" : ""}" data-act="entry" data-v="all">All four together</button></div></div>
      ${games.length ? `<div class="field"><span class="label">Part of a game</span><div class="list">
        <button class="item ${!s.game ? "on" : ""}" data-act="game" data-v=""><span class="box">${!s.game ? "✓" : ""}</span><span class="txt"><span class="name">Not part of a game</span></span></button>
        ${games.map((g) => `<button class="item ${s.game && s.game.id === g.id ? "on" : ""}" data-act="game" data-v="${esc(g.id)}"><span class="box">${s.game && s.game.id === g.id ? "✓" : ""}</span><span class="txt"><span class="name">${esc(g.name)}</span><span class="meta">${esc(g.groupName)}</span></span></button>`).join("")}
      </div></div>` : ""}
    </main>
    <footer class="foot"><button class="btn primary" data-act="go-players" ${c && s.tee ? "" : "disabled"}>Choose the players →</button>
      <button class="btn" data-act="home">← Back</button></footer>`;
}

/* ---------------- choosing a course ---------------- */

function screenCourse() {
  const cs = S.cs;
  const q = cs.query.trim().toLowerCase();
  const seen = new Set();
  /* One entry per course: a confirmed card (verified for everybody, or
     confirmed on this phone) hides every other course of the same name. */
  const all = [...cs.library, ...local.recentCourses()];
  const confirmedNames = new Set(all.filter((c) => c.source === "verified" || c.confirmed).map((c) => String(c.name).trim().toLowerCase()));
  const saved = all.filter((c) => !confirmedNames.has(String(c.name).trim().toLowerCase()) || c.source === "verified" || c.confirmed).filter((c) => {
    const k = c.providerId || `manual:${c.name.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return !q || c.name.toLowerCase().includes(q) || String(c.where || "").toLowerCase().includes(q);
  }).slice(0, 25);
  if (cs.manual) return screenManualCourse();
  return `${top("Choose a course", "Saved courses, or search")}
    <main class="body">${banner()}${cs.error ? `<div class="banner warn">${esc(cs.error)}</div>` : ""}
      <label class="field"><span class="label">Course or club name</span>
        <input class="input" id="cq" value="${esc(cs.query)}" placeholder="e.g. Royal Ontario" autocomplete="off"></label>
      <div class="row2"><button class="btn" data-act="filter">Show saved</button><button class="btn primary" data-act="search" ${S.busy ? "disabled" : ""}>${S.busy === "search" ? "Searching…" : "Search online"}</button></div>
      ${cs.results.length ? `<span class="label">Found online</span><div class="list">${cs.results.map((c, i) => `
        <button class="item" data-act="pick-online" data-v="${i}"><span class="txt"><span class="name">${esc(c.name)}</span><span class="meta">${esc(c.where)}</span></span></button>`).join("")}</div>` : ""}
      <span class="label">Saved courses</span>
      ${saved.length ? `<div class="list">${saved.map((c) => {
        const st = courseState(c);
        const meta = st === "blocked" ? "Withdrawn · cannot be used"
          : st === "check" ? "Withdrawn in The Scorecard · tap to look for corrected details"
          : [esc(c.where || ""), `${c.tees.length} tee${c.tees.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ");
        const key = c.providerId || "manual:" + c.name;
        /* Only a course kept on this device can be deleted; the shared list
           changes only through a verified card. */
        const mine = !cs.library.some((x) => (x.providerId || "manual:" + x.name) === key);
        return `<div class="saved-row">
        <button class="item" data-act="pick-saved" data-v="${esc(key)}"><span class="txt"><span class="name">${esc(c.name)}</span><span class="meta"${st ? ' style="color:var(--over)"' : ""}>${meta}</span></span></button>
        ${mine ? `<button class="btn del" data-act="forget-course" data-v="${esc(key)}" aria-label="Delete ${esc(c.name)} from this device">Delete</button>` : ""}</div>`;
      }).join("")}</div>`
        : `<p class="muted">${q ? "No saved course matches. Search online, or enter the course yourself." : "No saved courses yet. Search online, or enter the course yourself."}</p>`}
      <button class="btn dashed" data-act="manual">Enter a course yourself</button>
    </main>
    <footer class="foot"><button class="btn" data-act="back-setup">← Back</button></footer>`;
}

/* The two picture buttons, or the spinning wheel while a picture is read. */
function photoButtons(label = "") {
  if (S.busy === "scan") return `<div class="reading" role="status"><span class="wheel" aria-hidden="true"></span>
      <span><b>Reading the picture…</b><br>This can take up to half a minute.</span></div>`;
  const st = S.scanStatus;
  if (st && st.left === 0) {
    return `<div class="banner warn"><b>No more pictures can be read today.</b><br>${st.why === "allowance"
      ? "The free daily allowance for reading pictures is used up for everybody. It renews at 8 pm (Toronto time)."
      : "You have used today's pictures. More tomorrow."} Meanwhile you can type the course in below.</div>`;
  }
  const left = st && Number.isFinite(st.left) ? `<p class="muted" style="margin-top:6px">${st.left === 1 ? "1 picture" : `About ${st.left} pictures`} left today.</p>` : "";
  return `${label ? `<span class="label">${esc(label)}</span>` : ""}${left}<div class="row2">
        <label class="btn dashed" style="position:relative">📷 Take a photo
          <input type="file" id="scanfile" accept="image/*" capture="environment" ${S.busy ? "disabled" : ""}
            style="position:absolute;inset:0;opacity:0;width:100%;height:100%"></label>
        <label class="btn dashed" style="position:relative">🖼 Photos or Files
          <input type="file" id="scanpick" accept="image/*" ${S.busy ? "disabled" : ""}
            style="position:absolute;inset:0;opacity:0;width:100%;height:100%"></label>
      </div>`;
}

/* ---------------- checking a card read from pictures ---------------- */

const TEE_COLOURS = {
  black: ["#1d1d1b", "#fff"], gold: ["#a8781f", "#fff"], blue: ["#1f3b8f", "#fff"], white: ["#ffffff", "#1d1d1b"],
  red: ["#8b1c1c", "#fff"], green: ["#2e6b3a", "#fff"], silver: ["#a7adb3", "#1d1d1b"], yellow: ["#e3c443", "#1d1d1b"],
  orange: ["#d9822b", "#fff"], copper: ["#b05c2c", "#fff"], bronze: ["#8c6239", "#fff"], purple: ["#5b2b82", "#fff"],
};
const teeColour = (name) => {
  const k = Object.keys(TEE_COLOURS).find((c) => String(name).toLowerCase().includes(c));
  return k ? TEE_COLOURS[k] : ["#efe9dc", "#1d1d1b"];
};

function reviewState() {
  const m = check.mergeReadings(S.cs.readings || []);
  if (S.cs.manual && S.cs.manual.name) m.course = S.cs.manual.name;
  const v = check.verifyCard(m, { lenientYards: check.LENIENT_YARDS });
  return { m, v };
}

function nineTable(m, v, holes, word) {
  const read = holes.every((n) => m.read.includes(n));
  if (!read) return "";
  const totalCol = word === "OUT" ? "out" : "in";
  const parTotal = word === "OUT" ? m.parOut : m.parIn;
  const parOk = word === "OUT" ? v.front : v.back;
  const bad = (n, list) => list.includes(n);
  const cell = (val, wrong) => `<td class="${wrong ? "bad" : ""}">${val == null ? "?" : esc(val)}</td>`;
  const rows = m.tees.map((t) => {
    const [bg, fg] = teeColour(t.name);
    const tv = v.tees[t.key] || { yards: [], warnings: [] };
    const nineBad = holes.some((n) => bad(n, tv.yards) || t.yards[n - 1] == null);
    const warn = (tv.warnings || []).some((w) => w.includes(word));
    const total = t[totalCol];
    const mark = nineBad || total == null ? "✗" : warn ? "!" : "✓";
    const rating = t.rating != null ? Number(t.rating).toFixed(1) : "?";
    return `<tr style="background:${bg};color:${fg}"><th><span class="tick t${mark === "✓" ? "ok" : mark === "!" ? "warn" : "bad"}">${mark}</span>${esc(t.name)}${word === "OUT" ? `<small>${rating} / ${t.slope != null ? esc(t.slope) : "?"}</small>` : ""}</th>
      ${holes.map((n) => cell(t.yards[n - 1], bad(n, tv.yards) || t.yards[n - 1] == null)).join("")}
      <td class="tot ${warn ? "warnc" : total == null ? "bad" : ""}">${total == null ? "?" : esc(total)}</td></tr>`;
  }).join("");
  return `<div class="cardwrap"><table class="clubcard">
    <tr class="hd"><th>Hole</th>${holes.map((n) => `<td>${n}</td>`).join("")}<td>${word}</td></tr>
    ${rows}
    <tr class="hcp"><th><span class="tick ${holes.some((n) => bad(n, v.holes.hcp)) ? "tbad" : "tok"}">${holes.some((n) => bad(n, v.holes.hcp)) ? "✗" : "✓"}</span>Handicap</th>${holes.map((n) => cell(m.hcp[n - 1], bad(n, v.holes.hcp))).join("")}<td></td></tr>
    <tr class="par"><th><span class="tick ${parOk ? "tok" : "tbad"}">${parOk ? "✓" : "✗"}</span>Par</th>${holes.map((n) => cell(m.par[n - 1], bad(n, v.holes.par))).join("")}<td class="tot ${parOk ? "" : "bad"}">${parTotal == null ? "?" : esc(parTotal)}</td></tr>
  </table></div>`;
}

function screenReview() {
  const { m, v } = reviewState();
  const front = [1, 2, 3, 4, 5, 6, 7, 8, 9], back = [10, 11, 12, 13, 14, 15, 16, 17, 18];
  const has = (holes) => holes.every((n) => m.read.includes(n));
  const missingNine = !has(front) ? "holes 1 to 9" : !has(back) ? "holes 10 to 18" : "";
  const warnings = Object.entries(v.tees).flatMap(([k, t]) => (t.warnings || []).map((w) => `${m.tees.find((x) => x.key === k).name}: ${w}.`));
  const status = v.ok
    ? `<div class="verdict ok"><span class="big">✓</span><div><b>Everything on the card was read, and it all adds up.</b><br>${m.tees.length} tees, par ${v.par}. Compare it with the card one last time.</div></div>`
    : missingNine
      ? `<div class="verdict next"><span class="big">${has(front) || has(back) ? "½" : "?"}</span><div><b>Now take a picture of ${missingNine}.</b><br>${has(front) || has(back) ? "Half of the card is read. A close picture of the other half finishes it." : ""}</div></div>`
      : `<div class="verdict bad"><span class="big">✗</span><div><b>Not everything could be read or adds up.</b><br>${v.problems.map(esc).join("<br>")}</div></div>`;
  const pick = S.cs.pickTee ? `<span class="label">Which tee do you want to correct by hand?</span><div class="list">${m.tees.map((t, i) => `
      <button class="item" data-act="review-hand-tee" data-v="${i}"><span class="txt"><span class="name">${esc(t.name)}</span></span></button>`).join("")}</div>` : "";
  const member = !!(user() && !user().anonymous);
  return `${top("Check against the card", m.course || "The club's scorecard")}
    <main class="body">${banner()}${S.cs.error ? `<div class="banner warn">${esc(S.cs.error)}</div>` : ""}
      ${status}
      ${warnings.length ? `<div class="banner warn"><b>The club's card itself does not add up here:</b><br>${warnings.map(esc).join("<br>")}<br>Check that these yards are exactly as printed.</div>` : ""}
      ${nineTable(m, v, front, "OUT")}${nineTable(m, v, back, "IN")}
      ${v.notes && v.notes.length ? `<p class="muted">${v.notes.map(esc).join(" ")}</p>` : ""}
      ${missingNine ? photoButtons(`Picture of ${missingNine}`)
        : !v.ok ? photoButtons("Take a closer picture of the half with red marks")
        : `<details class="retake"><summary>Take a picture again</summary>${photoButtons()}</details>`}
      ${pick}
    </main>
    <footer class="foot">
      ${v.ok ? `<button class="btn primary tall" data-act="review-ok" ${S.busy ? "disabled" : ""}><span>${S.busy === "verify" ? "Saving…" : "✓ This matches the card"}</span><small>${member ? "It becomes the course for every scorer." : "Used on this phone. Sign in to share it with every scorer."}</small></button>` : ""}
      <button class="btn" data-act="review-hand">Correct it by hand instead</button>
      <button class="btn" data-act="review-back">← Back</button></footer>`;
}

function screenManualCourse() {
  const m = S.cs.manual;
  const sc = S.cs.scan;
  const miss = m.miss || { par: [], si: [] };
  const red = (on) => (on ? ' style="outline:3px solid var(--over);outline-offset:1px"' : "");
  const photo = `
      <span class="label">Read it from a picture of the club's scorecard</span>
      <p class="muted">Take one picture of the whole card: all 18 holes and every tee. Lay it flat, in good light. If part of it cannot be read, you are asked for a closer picture of just that half.</p>
      ${photoButtons()}
      ${S.cs.error ? `<div class="banner warn">${esc(S.cs.error)}</div>` : ""}
      ${sc && sc.tees.length > 1 && !sc.applied ? `<span class="label">The photo shows ${sc.tees.length} tees. Which one are you playing?</span>
        <div class="list">${sc.tees.map((t, i) => `<button class="item" data-act="scan-pick" data-v="${i}"><span class="txt"><span class="name">${esc(t.name)}</span>
          <span class="meta">${t.rating && t.slope ? `${t.rating} / ${t.slope}` : "No rating read"}</span></span></button>`).join("")}</div>` : ""}
      ${sc && sc.applied ? (() => {
        const got = m.scanned || [];
        const nines = [[1, 9], [10, 18]].filter(([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => a + k).every((n) => got.includes(n)));
        const done = nines.map(([a, b]) => `holes ${a} to ${b}`).join(" and ") || "some holes";
        const next = nines.length === 1 ? ` Now take a picture of holes ${nines[0][0] === 1 ? "10 to 18" : "1 to 9"}.` : "";
        return `<div class="banner ${sc.missing ? "warn" : "ok"}">Read ${done} from the picture.${sc.totalsOff ? " Some numbers do not add up to the totals printed on the card; those holes are marked in red." : ""}${sc.missing ? ` ${sc.missing} value${sc.missing === 1 ? " is" : "s are"} marked in red: fill in or check ${sc.missing === 1 ? "it" : "them"}.` : ""} Check every value against the card before using it.${next}</div>`;
      })() : ""}`;
  return `${top("Enter a course", "From the scorecard at the club")}
    <main class="body">${banner()}${photo}
      <label class="field"><span class="label">Course name</span><input class="input" id="m-name" value="${esc(m.name)}"></label>
      <label class="field"><span class="label">Tee</span><input class="input" id="m-tee" value="${esc(m.tee)}" placeholder="e.g. White"></label>
      <div class="row2">
        <label class="field"><span class="label">Rating</span><input class="input" id="m-rating"${red(miss.rating)} inputmode="decimal" value="${esc(m.rating)}" placeholder="e.g. 70.1"></label>
        <label class="field"><span class="label">Slope</span><input class="input" id="m-slope"${red(miss.slope)} inputmode="numeric" value="${esc(m.slope)}" placeholder="e.g. 125"></label></div>
      <p class="muted">Rating and slope are needed only to post rounds to The Scorecard.</p>
      <span class="label">Each hole: par, yards and handicap number (HCP)</span>
      <div class="hole-rows"><div class="hole-row hd"><span>Hole</span><span>Par</span><span>Yards</span><span>HCP</span></div>${m.pars.map((p, i) => `<div class="hole-row"><b>${i + 1}</b>
        <select data-hole="${i}"${red(miss.par.includes(i))} aria-label="Par of hole ${i + 1}">${[3, 4, 5, 6].map((v) => `<option ${v === p ? "selected" : ""}>${v}</option>`).join("")}</select>
        <input class="input" data-yds="${i}"${red((miss.yards || []).includes(i))} inputmode="numeric" value="${m.yards && m.yards[i] != null ? esc(m.yards[i]) : ""}" placeholder="–" aria-label="Yards of hole ${i + 1}">
        <select data-si="${i}"${red(miss.si.includes(i))} aria-label="Handicap number of hole ${i + 1}"><option value="">–</option>${Array.from({ length: 18 }, (_, k) => k + 1).map((v) => `<option ${v === m.sis[i] ? "selected" : ""}>${v}</option>`).join("")}</select></div>`).join("")}</div>
      <p class="muted">The handicap number of each hole is on the club's scorecard, marked HCP, Handicap or S.I. (1 is the hardest hole). It decides where strokes are given. Yards are optional.</p>
    </main>
    <footer class="foot"><button class="btn primary" data-act="manual-save">Use this course</button><button class="btn" data-act="manual-cancel">← Back</button></footer>`;
}

/* ---------------- 2 · the players ---------------- */

function screenPlayers() {
  const s = S.setup;
  const count = S.picked.length;
  const full = count >= 4;
  let groupPart = "";
  if (member()) {
    const tab = S.groupTab;
    const list = S.golfers[tab];
    if (!S.groups.length) groupPart = `<div class="banner warn">You are not a member of any group yet, so golfers cannot be chosen. Add players as guests below.</div>`;
    else groupPart = `<label class="field"><span class="label">Group</span>
        <select class="input groupsel" id="groupsel" aria-label="Group">${S.groups.map((g) => {
          const n = S.picked.filter((p) => p.assocId === g.id).length;
          return `<option value="${esc(g.id)}" ${g.id === tab ? "selected" : ""}>${esc(g.name)}${n ? ` (${n} chosen)` : ""}</option>`;
        }).join("")}</select></label>
      ${list === undefined ? `<p class="muted">Loading golfers…</p>` : `<div class="list">${list.map((g) => {
        const on = S.picked.some((p) => p.golferId === g.golferId);
        const off = full && !on;
        return `<button class="item ${on ? "on" : ""}" data-act="pick" data-v="${esc(g.golferId)}" ${off ? "disabled" : ""}><span class="box">${on ? "✓" : ""}</span>
          <span class="txt"><span class="name">${esc(g.name)}</span><span class="meta">${off ? "The foursome is full" : g.index == null ? "No index yet" : `Index ${esc(g.index)}`}</span></span></button>`;
      }).join("") || `<p class="muted">No golfers in this group yet.</p>`}</div>`}
      <p class="muted">Only golfers already in your groups can be posted. Anyone else: add them below as a guest.</p>`;
  }
  const guests = S.picked.filter((p) => !p.golferId);
  return `${top("Who's playing?", `${s.course.name} · ${s.tee.name}`, `<span class="pill">${count} of 4</span>`)}
    <main class="body">${banner()}${groupPart}
      <span class="label">${member() ? "Guests · scored and shared, not posted" : "Players"}</span>
      ${guests.map((g) => `<div class="item on"><span class="box">✓</span><span class="txt"><span class="name">${esc(g.name)}</span><span class="meta">${member() ? "Guest" : "Player"}</span></span><button class="btn" style="min-height:44px" data-act="unguest" data-v="${esc(g.name)}">Remove</button></div>`).join("")}
      ${full ? "" : `<div class="row2" style="grid-template-columns: minmax(0,1fr) auto"><input class="input" id="guest" placeholder="${member() ? "Guest's name" : "Player's name"}" value="${esc(S.guestName)}" autocomplete="off"><button class="btn" data-act="add-guest">Add</button></div>`}
    </main>
    <footer class="foot"><button class="btn primary" data-act="tee-off" ${count ? "" : "disabled"}>Tee off on hole ${esc(s.start)} →</button>
      <button class="btn" data-act="back-setup">← Back</button></footer>`;
}

/* ---------------- 3 · playing ---------------- */

function holeHeader(c, n) {
  const h = card.holeInfo(c, n);
  const pos = c.order.indexOf(n) + 1;
  return `<header class="top"><div class="row"><div class="sub">${esc(c.course.name)} · ${esc(c.tee.name)} · hole ${pos} of ${c.order.length}</div>
      <div class="row"><span class="pill">✓ Saved</span><button class="pill light" data-act="menu">Menu</button></div></div>
    <div class="hole-title"><span class="big">Hole ${n}</span><span class="par">Par ${h.par}</span></div>
    <div class="hole-meta"><span>${h.yards ? `${h.yards} yards` : "Yards not known"}</span><span>${h.si ? `Handicap ${h.si}` : "No handicap number"}</span></div></header>`;
}

function playerNote(c, pi, n) {
  const pl = c.players[pi];
  const h = card.holeInfo(c, n);
  const k = card.strokesOn(pl.ch, h.si);
  const cap = card.holeCap(h.par, pl.ch, h.si);
  const guest = pl.guest ? (c.mode === "member" ? "Guest · not posted · " : "") : "";
  if (pl.ch == null) return `${guest}No index · handicap limit ${cap}`;
  const strokes = !h.si ? `About ${k} stroke${k === 1 ? "" : "s"} a hole (no handicap numbers)` : k === 0 ? "No stroke here" : k > 0 ? `Gets ${k} stroke${k === 1 ? "" : "s"} here` : `Gives ${-k} stroke back here`;
  return `${guest}${strokes} · handicap limit ${cap}`;
}

function footPlay(c, n) {
  const last = c.order.indexOf(n) === c.order.length - 1;
  const done = card.holeComplete(c, n);
  const left = c.players.filter((p) => !card.isEntered(p.scores[n])).length;
  const next = done
    ? (last ? `<button class="btn primary" data-act="finish">Finish</button>` : `<button class="btn primary" data-act="next">Hole ${c.order[c.order.indexOf(n) + 1]} →</button>`)
    : `<div class="btn dashed" style="color:var(--ink-3)">${left} to go</div>`;
  /* Fixing a score after the round: once the change is made, straight back
     to the finish screen instead of walking through the remaining holes. */
  const fixing = c.fixing && card.cardComplete(c)
    ? `<button class="btn primary" data-act="finish">✓ Done fixing — back to the totals</button>` : "";
  return `<footer class="foot">${fixing}<div class="row3">
      <button class="btn" data-act="prev" ${c.pos === 0 ? "disabled" : ""}>← Back</button>
      <button class="btn" data-act="card">Card</button>${next}</div></footer>`;
}

function screenPlayOne(c) {
  const n = c.order[c.pos];
  const h = card.holeInfo(c, n);
  const who = Math.min(c.who || 0, c.players.length - 1);
  const pl = c.players[who];
  const s = pl.scores[n];
  const has = card.isEntered(s);
  const words = { "-3": "Albatross", "-2": "Eagle", "-1": "Birdie", 0: "Par", 1: "Bogey", 2: "Double", 3: "Triple" };
  const lo = Math.max(1, h.par - 2);
  const tiles = [];
  for (let v = lo; v < lo + 9; v++) {
    const d = v - h.par;
    tiles.push(`<button class="tile ${s === v ? "on" : ""}" data-act="score" data-v="${v}"><b>${v}</b><span>${s === v ? "✓ Entered" : words[d] || `+${d}`}</span></button>`);
  }
  const names = c.players.map((p, i) => {
    const e = p.scores[n];
    const cls = i === who ? "now" : card.isEntered(e) ? "done" : "";
    return `<button class="${cls}" data-act="who" data-v="${i}">${esc(first(p.name))}${card.isEntered(e) ? ` ${esc(e)}` : ""}</button>`;
  }).join("");
  const status = has
    ? `<div class="status done">Entered: ${s === card.PICKED_UP ? "picked up" : esc(s)}. Tap another number to change it, or tap the next name above.</div>`
    : `<div class="status empty">No score yet. Tap the number of strokes.</div>`;
  const body = S.typing
    ? `<label class="field"><span class="label">Strokes on this hole</span>
        <input class="input" id="typed" type="number" inputmode="numeric" min="1" max="20" value="${esc(S.typed)}" style="height:96px;font-size:52px;font-weight:800;text-align:center;border:3px solid var(--green)"></label>
       ${S.typeError ? `<div class="banner bad">${esc(S.typeError)}</div>` : ""}
       <div class="row2"><button class="btn" data-act="type-cancel">Cancel</button><button class="btn primary" data-act="type-save">Save score</button></div>`
    : `<div class="tiles">${tiles.join("")}</div>
       <div class="row2"><button class="btn dashed" data-act="type">Type a score</button><button class="btn dashed ${s === card.PICKED_UP ? "outline" : ""}" data-act="score" data-v="X">${s === card.PICKED_UP ? "✓ Picked up" : "Picked up"}</button></div>`;
  return `${holeHeader(c, n)}<nav class="names">${names}</nav>
    <main class="body">${banner()}
      <div class="who"><div class="step">Golfer ${who + 1} of ${c.players.length}</div><div class="name">${esc(pl.name)}</div><div class="muted">${esc(playerNote(c, who, n))}</div></div>
      ${status}${body}
    </main>${footPlay(c, n)}`;
}

function screenPlayAll(c) {
  const n = c.order[c.pos];
  const h = card.holeInfo(c, n);
  const rows = c.players.map((pl, i) => {
    const s = pl.scores[n];
    const t = card.totals(c, i);
    const shown = s === card.PICKED_UP ? "X" : card.isEntered(s) ? s : "";
    const cls = card.isEntered(s) && s !== card.PICKED_UP ? (s < h.par ? "under" : s > h.par ? "over" : "") : "";
    return `<div class="player"><div class="head"><b>${esc(pl.name)}</b><span>${t.done ? `${card.formatToPar(t.toPar)} thru ${t.done}` : ""}</span></div>
      <div class="ctl"><button class="minus" data-act="minus" data-v="${i}" aria-label="One stroke fewer for ${esc(pl.name)}">−</button>
        <input class="${cls}" data-score="${i}" type="text" inputmode="numeric" value="${esc(shown)}" placeholder="–" aria-label="Score for ${esc(pl.name)}">
        <button class="plus" data-act="plus" data-v="${i}" aria-label="One stroke more for ${esc(pl.name)}">+</button></div>
      <div class="note">${esc(playerNote(c, i, n))}</div></div>`;
  }).join("");
  return `${holeHeader(c, n)}<main class="body">${banner()}${rows}
    <p class="muted">Tap + to start at par. Tap a number to type it; X means picked up.</p></main>${footPlay(c, n)}`;
}

/* ---------------- the round's menu ---------------- */

function screenMenu(c) {
  const other = c.entry === "all" ? "one" : "all";
  return `${top("Menu", `${c.course.name} · ${c.tee.name} · hole ${c.order[c.pos]}`)}
    <main class="body">${banner()}
      <button class="btn tall" data-act="switch-entry"><span>${other === "all" ? "Switch to all four together" : "Switch to one golfer at a time"}</span><small>The scores already entered stay as they are.</small></button>
      <button class="btn tall" data-act="card"><span>See the whole card</span><small>Every hole, with par, yards and handicap number. Tap a hole to go to it.</small></button>
      <button class="btn tall" data-act="share-card"><span>Share the card</span><small>WhatsApp, email or text message.</small></button>
      <button class="btn tall" data-act="to-start"><span>Go to the start screen</span><small>The round stays on this phone. "Continue your round" brings you back to this hole.</small></button>
      ${c.correcting ? `<button class="btn tall" data-act="cancel-correction" style="color:var(--over)"><span>Cancel the correction</span><small>Nothing is changed in The Scorecard.</small></button>`
        : `<button class="btn tall" data-act="end-round" style="color:var(--over)"><span>End this round without posting</span><small>The card is kept under "Your cards" and is never posted.</small></button>`}
    </main>
    <footer class="foot"><button class="btn primary" data-act="back-play">Back to hole ${esc(c.order[c.pos])} →</button></footer>`;
}

/* The chosen tee's holes, to check against the club's card before playing. */
function screenHoles() {
  const s = S.setup;
  const t = s.tee;
  const holes = Array.from({ length: 18 }, (_, i) => (t.holes || [])[i] || null);
  const rows = holes.map((h, i) => `<div class="crow ${i % 2 ? "zebra" : "plain"}"><div style="font-weight:800">${i + 1}</div>
      <div>${h ? h.par : "?"}</div><div>${h && h.yards ? h.yards : ""}</div><div>${h && h.si ? h.si : ""}</div></div>`).join("");
  return `${top("Check the holes", `${s.course.name} · ${t.name}`)}
    <main class="body" style="padding:10px">${banner()}
      <p class="muted">Compare with the club's scorecard: the par, yards and handicap number (HCP) of every hole.</p>
      <div class="cgrid" style="--n:0"><div class="crow"><div class="hd">HOLE</div><div class="hd">PAR</div><div class="hd">YDS</div><div class="hd">HCP</div></div>${rows}
        <div class="crow total"><div style="grid-column: span 2">Par ${t.par}</div><div style="grid-column: span 2">${t.rating && t.slope ? `${t.rating} / ${t.slope}` : "No rating"}</div></div></div>
    </main>
    <footer class="foot"><button class="btn primary" data-act="holes-ok">All correct ✓</button>
      <button class="btn" data-act="holes-fix">Something is wrong: correct it</button></footer>`;
}

/* ---------------- 4 · the whole card ---------------- */

function cardGrid(c, interactive) {
  const cur = c.order[c.pos];
  const head = `<div class="crow"><div class="hd">HOLE</div><div class="hd">PAR</div><div class="hd">YDS</div><div class="hd">HCP</div>${c.players.map((p) => `<div class="hd">${esc(first(p.name).toUpperCase())}</div>`).join("")}</div>`;
  const rows = c.order.map((n, k) => {
    const h = card.holeInfo(c, n);
    const cls = interactive && n === cur ? "now-row" : k % 2 ? "zebra" : "plain";
    const cells = c.players.map((p) => {
      const s = p.scores[n];
      const t = s === card.PICKED_UP ? "X" : card.isEntered(s) ? s : "·";
      const col = card.isEntered(s) && s !== card.PICKED_UP ? (s < h.par ? "under" : s > h.par ? "over" : "") : "";
      return `<div class="${col}" style="font-weight:700">${esc(t)}</div>`;
    }).join("");
    const inner = `<div style="font-weight:800">${n}</div><div>${h.par}</div><div style="color:var(--ink-3)">${h.yards || ""}</div><div style="color:var(--ink-3)">${h.si || ""}</div>${cells}`;
    return interactive ? `<button class="crow ${cls}" data-act="jump" data-v="${k}" aria-label="Go to hole ${n}">${inner}</button>` : `<div class="crow ${cls}">${inner}</div>`;
  }).join("");
  const tot = c.players.map((p, i) => { const t = card.totals(c, i); return `<div>${t.done ? card.formatToPar(t.toPar) : "–"}</div>`; }).join("");
  const done = Math.max(...c.players.map((p, i) => card.totals(c, i).done));
  return `<div class="cgrid" style="--n:${c.players.length}">${head}${rows}<div class="crow total"><div style="grid-column: span 4">Thru ${done}</div>${tot}</div></div>`;
}

function screenCard(c) {
  const howTo = c.state === "finished" || c.fixing
    ? `<div class="banner" style="font-size:21px;font-weight:700">To fix a score, tap that hole's row. Change the score, then tap ✓ Done fixing.</div>` : "";
  return `${top("The card", "Tap a hole to go back and change it")}
    <main class="body" style="padding:10px">${banner()}${howTo}${cardGrid(c, true)}</main>
    <footer class="foot"><button class="btn primary" data-act="back-play">Back to hole ${esc(c.order[c.pos])} →</button>
      <button class="btn" data-act="share-card">Share the card</button></footer>`;
}

/* ---------------- 5 · finish, post, share ---------------- */

function summaries(c) {
  return c.players.map((p, i) => {
    const t = card.totals(c, i);
    const where = p.guest ? (c.mode === "member" ? "Guest · shared only, not posted" : "") : p.groupName;
    return `<div class="sum"><b style="font-size:19px">${esc(p.name)}</b>${where ? `<span class="muted">${esc(where)}</span>` : ""}
      <div class="stats"><div><b>${t.gross}</b><span>Gross${t.complete ? "" : ` thru ${t.done}`}</span></div>
      <div><b>${p.guest && c.mode === "member" ? "—" : t.adjusted}</b><span>Adjusted</span></div>
      <div><b style="color:var(--green)">${t.net == null ? "—" : t.net}</b><span>${p.ch == null ? "No index" : `Net (CH ${p.ch})`}</span></div></div></div>`;
  }).join("");
}

function screenFinish(c) {
  if (c.correcting) return screenCorrectFinish(c);
  const check = card.postable(c);
  const n = c.players.filter((p) => !p.guest).length;
  const postBtn = check.ok
    ? `<button class="btn primary" data-act="post">Post ${n} round${n === 1 ? "" : "s"} to The Scorecard</button>`
    : `<div class="banner warn">${esc(check.why)}</div>`;
  const intro = c.repostOf
    ? `<div class="banner" style="font-size:20px;font-weight:700">Re-posting a card whose rounds were deleted in The Scorecard. Fix the wrong scores with ✎ Fix a score, then post it as a new card.</div>`
    : `<p class="muted">Check the totals before posting. Adjusted applies net double bogey on each hole, worked out for you.</p>`;
  return `${top(c.repostOf ? "Re-post the card" : "Round finished", `${c.course.name} · ${niceDate(c.date)}`)}
    <main class="body">${banner()}${intro}
      ${summaries(c)}</main>
    <footer class="foot">${postBtn}<div class="row2"><button class="btn" data-act="share-card">Share the card</button><button class="btn" data-act="card">Review card</button></div>
      <button class="btn" data-act="fix-score">✎ Fix a score</button>
      ${c.repostOf ? `<button class="btn" data-act="cancel-repost" style="color:var(--over)">Cancel the re-post</button>` : check.ok ? "" : `<button class="btn" data-act="done">Done</button>`}</footer>`;
}

/* ---------------- correcting a posted card ---------------- */

const correctionWhy = (e) => {
  const m = String((e && e.message) || e);
  if (m === "OFFLINE") return "No signal. A correction needs a connection. Nothing was changed; try again when you have signal.";
  if (m === "UNREACHABLE" || m === "TRY_LATER") return "The Scorecard could not be reached. Nothing was changed. Try again in a moment.";
  if (m === "SIGN_IN") return "Sign in again with your Scorecard account, then try again.";
  return m;
};

function screenCorrections() {
  const list = S.corrections;
  const rows = !list ? `<p class="muted">Looking for cards you can correct…</p>`
    : !list.length ? `<p>No posted card can be corrected by you right now.</p><p class="muted">The scorer can correct a card for 24 hours after posting it. An owner or admin of the group can correct any card of the group, at any time.</p>`
    : `<div class="list">${list.map((x) => `
      <button class="item" data-act="correct-card" data-v="${esc(x.cardId)}"><span class="txt"><span class="name">${esc(x.course)} · ${esc(niceDate(x.date))}</span>
        <span class="meta">${esc(x.players.join(", "))}<br>${x.as === "scorer" ? `Your card · until ${esc(new Date(x.until).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }))}` : "As owner or admin of the group"}${x.corrections ? ` · corrected ${x.corrections}×` : ""}</span></span></button>`).join("")}</div>`;
  return `${top("Correct a posted card", "Cards already in The Scorecard")}
    <main class="body">${banner()}${rows}</main>
    <footer class="foot"><button class="btn" data-act="history">← Back</button></footer>`;
}

function screenCorrectFinish(c) {
  return `${top("Correct the card", `${c.course.name} · ${niceDate(c.date)}`)}
    <main class="body">${banner()}
      <div class="banner" style="font-size:20px;font-weight:700">This card is already in The Scorecard. Fix the wrong scores, then tap Save the correction. Each golfer's round and handicap index are corrected together, in one save.</div>
      ${summaries(c)}</main>
    <footer class="foot"><button class="btn primary" data-act="save-correction" ${S.busy ? "disabled" : ""}>${S.busy === "correct" ? "Saving…" : "Save the correction"}</button>
      <button class="btn" data-act="fix-score">✎ Fix a score</button>
      <button class="btn" data-act="cancel-correction" style="color:var(--over)">Cancel the correction</button></footer>`;
}

function screenStatus(c) {
  const posted = c.state === "posted";
  const failed = c.state === "failed";
  const rows = c.players.filter((p) => !p.guest).map((p) => {
    const t = card.totals(c, c.players.indexOf(p));
    return `<div class="item"><span class="txt"><span class="name">${esc(p.name)} · ${t.gross}</span><span class="meta">${esc(p.groupName)}</span></span>
      <b style="color:${posted ? "var(--green)" : failed ? "var(--over)" : "#8A5A12"}">${posted ? "Posted ✓" : failed ? "Not posted" : c.sent ? "Checking" : "Waiting"}</b></div>`;
  }).join("");
  const head = posted ? "Posted to The Scorecard"
    : failed ? "Not posted"
    : c.sent ? "Sent to The Scorecard"
    : "Saved on this phone";
  const text = posted ? "The rounds are in The Scorecard now, and the handicap indexes are up to date."
    : failed ? c.postError
    : c.sent ? "The Scorecard is checking the card and posting it. This usually takes seconds, at most a few minutes. You can close the app."
    : navigator.onLine === false ? "There is no signal right now. The card is sent by itself as soon as the phone is back online. You can close the app."
    : "Sending… This takes a moment. If the signal drops, the card is sent by itself later.";
  return `${top("The Marker", "Posting")}
    <main class="body">${banner()}<h2>${esc(head)}</h2><p>${esc(text)}</p><div class="list">${rows}</div>
      <p class="muted">Each one shows "Posted" only once The Scorecard has actually saved it.</p></main>
    <footer class="foot"><button class="btn primary" data-act="done">Done</button><button class="btn" data-act="share-card">Share the card</button></footer>`;
}

/* ---------------- your cards ---------------- */

function screenHistory() {
  const cards = local.finishedCards();
  const signedIn = !!(user() && !user().anonymous);
  const editable = signedIn && S.mine ? S.mine.editable.filter((x) => !x.hidden) : [];
  const gone = editable.length ? `<h3 class="sec">Deleted in The Scorecard</h3><div class="list">${editable.map((x) => `
      <div class="item amb"><span class="txt"><span class="name">${esc(x.course)} · ${esc(niceDate(x.date))}</span>
        <span class="meta">${x.gone.length === x.players.length ? "Rounds deleted." : `Rounds deleted: ${esc(x.gone.join(", "))}.`}</span>
        <span class="row2"><button class="btn primary" data-act="repost-card" data-v="${esc(x.cardId)}" ${S.busy ? "disabled" : ""}>Re-post</button>
        <button class="btn" data-act="hide-editable" data-v="${esc(x.cardId)}" ${S.busy ? "disabled" : ""}>Hide</button></span></span></div>`).join("")}</div>` : "";
  const list = cards.length ? `<div class="list">${cards.map((c) => `
      <button class="item" data-act="view" data-v="${esc(c.id)}"><span class="txt"><span class="name">${esc(c.course.name)} · ${esc(niceDate(c.date))}</span>
        <span class="meta">${esc(c.players.map((p) => p.name).join(", "))} · ${c.state === "posted" ? "posted" : c.state === "posting" ? (c.sent ? "being checked" : "waiting to send") : "not posted"}</span></span></button>`).join("")}</div>`
    : `<p class="muted">No cards on this phone yet.</p>`;
  return `${top("Your cards", "The Marker")}
    <main class="body">${banner()}${gone}${gone ? `<h3 class="sec">On this phone</h3>` : ""}${list}
      ${signedIn ? `<button class="btn" data-act="go-corrections">✎ Correct a posted card</button>` : ""}</main>
    <footer class="foot"><button class="btn" data-act="home">← Back</button></footer>`;
}

function screenView(c) {
  return `${top(c.course.name, `${niceDate(c.date)} · ${c.tee.name}`)}
    <main class="body" style="padding:10px">${banner()}${cardGrid(c, false)}${summaries(c)}
      ${c.state === "failed" && c.postError ? `<div class="banner warn">${esc(c.postError)}</div>` : ""}</main>
    <footer class="foot"><button class="btn primary" data-act="share-view">Share the card</button>
      ${c.state === "posted" && user() && !user().anonymous
        ? (S.mine && S.mine.editable.some((x) => x.cardId === c.id)
          ? `<button class="btn" data-act="repost-card" data-v="${esc(c.id)}">✎ Edit and re-post</button>`
          : `<button class="btn" data-act="correct-card" data-v="${esc(c.id)}">✎ Correct this card</button>`) : ""}
      ${card.canDelete(c) ? `<button class="btn" data-act="delete-card" style="color:var(--over)">Delete this card</button>` : ""}
      <button class="btn" data-act="history">← Back</button></footer>`;
}

/* ---------------- sharing ---------------- */

function screenShare() {
  const t = S.share || "";
  const enc = encodeURIComponent(t);
  return `${top("Share the card", "WhatsApp, email, text or copy")}
    <main class="body">${banner()}
      <a class="btn primary" href="https://wa.me/?text=${enc}" target="_blank" rel="noopener">WhatsApp</a>
      <a class="btn" href="mailto:?subject=${encodeURIComponent("Golf scorecard")}&body=${enc}">Email</a>
      <a class="btn" href="sms:?&body=${enc}">Text message</a>
      <button class="btn" data-act="copy">Copy</button>
      <pre style="white-space:pre-wrap;font-size:16px;background:#fff;border:1.5px solid var(--line);border-radius:12px;padding:12px">${esc(t)}</pre></main>
    <footer class="foot"><button class="btn" data-act="share-back">← Back</button></footer>`;
}

async function share(text, back) {
  S.shareBack = back;
  if (navigator.share) {
    try { await navigator.share({ title: "Golf scorecard", text }); return; }
    catch (e) { if (e && e.name === "AbortError") return; }
  }
  S.share = text;
  go("share");
}

/* ---------------- render ---------------- */

function render() {
  const c = local.currentCard();
  let html;
  switch (S.screen) {
    case "signin": html = screenSignIn(); break;
    case "setup": html = screenSetup(); break;
    case "course": html = screenCourse(); break;
    case "players": html = screenPlayers(); break;
    case "play": html = c ? (c.entry === "all" ? screenPlayAll(c) : screenPlayOne(c)) : screenStart(); break;
    case "card": html = c ? screenCard(c) : screenStart(); break;
    case "menu": html = c ? screenMenu(c) : screenStart(); break;
    case "review": html = S.cs.manual ? screenReview() : screenSetup(); break;
    case "holes": html = S.setup && S.setup.tee ? screenHoles() : screenSetup(); break;
    case "finish": html = c ? screenFinish(c) : screenStart(); break;
    case "corrections": html = screenCorrections(); break;
    case "status": html = c ? screenStatus(c) : screenStart(); break;
    case "history": html = screenHistory(); break;
    case "view": html = S.view ? screenView(S.view) : screenHistory(); break;
    case "share": html = screenShare(); break;
    default: html = screenStart();
  }
  app.innerHTML = html;
  S.flash = "";
  if (S.screen === "play" && S.typing) { const t = document.getElementById("typed"); if (t) t.focus(); }
}

/* ---------------- actions ---------------- */

async function loadGroupsAndGames() {
  if (!member()) { S.groups = []; S.games = []; return; }
  try {
    S.groups = await db.myGroups();
    if (!S.groupTab && S.groups[0]) S.groupTab = S.groups[0].id;
  } catch (e) { S.error = e.message; }
  await loadGames();
}

async function loadGames() {
  S.games = [];
  if (!member() || !S.setup) return;
  const date = S.setup.date;
  const lists = await Promise.all(S.groups.map((g) => db.gamesOn(g, date).catch(() => [])));
  if (S.setup && S.setup.date === date) { S.games = lists.flat(); render(); }
}

async function loadGolfers(assocId) {
  if (!assocId || S.golfers[assocId]) return;
  try { S.golfers[assocId] = await db.groupGolfers(assocId); }
  catch (e) { S.golfers[assocId] = []; S.error = e.message; }
  render();
}

function updateCard(fn) {
  const c = local.currentCard();
  if (!c) return;
  try { saveCard(fn(c)); S.error = ""; }
  catch (e) { S.error = e.message; }
  render();
}

function setScoreNow(pi, value) {
  updateCard((c) => card.setScore(c, pi, c.order[c.pos], value));
}

const actions = {
  home() { go("start"); refreshMine(); },
  "go-signin"() { go("signin"); },
  async "sign-in"() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    if (!email || !password) { S.error = "Type your email and password."; render(); return; }
    S.busy = "signin"; render();
    try { await db.signIn(email, password); S.busy = ""; S.flash = "Signed in."; go("start"); }
    catch (e) { fail(e); }
  },
  async reset() {
    const email = (document.getElementById("email") || {}).value;
    if (!email) { S.error = "Type your email first, then tap this again."; render(); return; }
    try { await db.sendReset(email); S.flash = `If ${email} has an account, a reset email is on its way.`; S.error = ""; render(); }
    catch { S.error = "The reset email could not be sent. Check the signal and try again."; render(); }
  },
  async "sign-out"() { await db.signOut(); S.groups = []; S.golfers = {}; S.mine = null; mineAt = 0; S.flash = "Signed out."; go("start"); },
  async "play-anon"() {
    /* Not awaited: with a poor signal the anonymous sign-in can take a while,
       and nothing on the next screens needs it except searching online. */
    db.playWithoutAccount().catch(() => {});
    S.setup = newSetup(); S.picked = []; S.games = [];
    go("setup");
  },
  async "new-round"() {
    const cur = local.currentCard();
    if (cur && cur.state === "playing" && !confirmLeave(cur)) return;
    S.setup = newSetup(); S.picked = []; S.golfers = {};
    go("setup");
    await loadGroupsAndGames();
    render();
  },
  resume() { const c = local.currentCard(); go(c.state === "finished" ? "finish" : "play"); },
  date(el) { S.setup.date = notFuture(shiftDate(S.setup.date, Number(el.dataset.v))); S.setup.game = null; render(); loadGames(); },
  "cal-open"() { cal.open = !cal.open; cal.month = null; cal.pick = null; cal.typed = ""; render(); },
  "cal-prev"() { cal.month = shiftMonth(cal.month || S.setup.date.slice(0, 7), -1); cal.pick = null; render(); },
  "cal-next"() { cal.month = shiftMonth(cal.month || S.setup.date.slice(0, 7), 1); cal.pick = null; render(); },
  "cal-months"() { cal.pick = cal.pick === "months" ? null : "months"; render(); },
  "cal-years"() { cal.pick = cal.pick === "years" ? null : "years"; render(); },
  "cal-month"(el) { cal.month = el.dataset.v; cal.pick = null; render(); },
  "cal-day"(el) { setRoundDate(el.dataset.v); },
  "cal-today"() { setRoundDate(today()); },
  "cal-close"() { cal.open = false; cal.month = null; cal.pick = null; render(); },
  "cal-typed"() {
    /* Any separator, or none: year, month, day. Only a real date, not in the future. */
    const digits = cal.typed.replace(/\D/g, "");
    const t = digits.length === 8 ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}` : "";
    const [y, m, d] = t ? t.split("-").map(Number) : [];
    const real = t && new Date(Date.UTC(y, m - 1, d));
    if (!t) { S.error = "Type the date as year, month, day — for example 2025 05 18."; render(); return; }
    if (real.getUTCFullYear() !== y || real.getUTCMonth() !== m - 1 || real.getUTCDate() !== d) { S.error = "That is not a real date."; render(); return; }
    if (t > today()) { S.error = "A round cannot have been played in the future."; render(); return; }
    S.error = ""; setRoundDate(t);
  },
  "go-course"() {
    S.cs.error = ""; S.cs.results = []; S.cs.withdrawn = db.withdrawnSaved(); go("course");
    db.library().then((l) => { S.cs.library = l; if (S.screen === "course" && !S.cs.manual) render(); });
    db.withdrawnCourses().then((w) => { S.cs.withdrawn = w; if (S.screen === "course" && !S.cs.manual) render(); });
  },
  "back-setup"() { S.cs.manual = null; go("setup"); },
  tee(el) {
    const t = S.setup.course.tees[Number(el.dataset.v)];
    if (!(t.holes || []).length) {
      /* The provider has no holes for this tee: take them off the club's card. */
      S.cs.manual = { name: S.setup.course.name, tee: t.name, rating: t.rating == null ? "" : String(t.rating), slope: t.slope == null ? "" : String(t.slope), pars: Array(18).fill(4), sis: Array(18).fill(""), yards: Array(18).fill(null), providerId: S.setup.course.providerId || null, where: S.setup.course.where || "" };
      S.flash = "This tee has no hole details. Copy the par, yards and handicap number of each hole from the club's scorecard.";
      go("course");
      return;
    }
    S.setup.tee = t;
    if ((t.holes || []).length && t.holes.length < 18) { S.setup.holes = "front"; }
    S.setup.start = card.holeOrder(S.setup.holes, S.setup.start)[0];
    render();
  },
  holes(el) { S.setup.holes = el.dataset.v; S.setup.start = card.holeOrder(S.setup.holes, S.setup.start)[0]; render(); },
  start(el) {
    const choices = card.startChoices(S.setup.holes);
    const i = choices.indexOf(S.setup.start);
    S.setup.start = choices[(i + Number(el.dataset.v) + choices.length) % choices.length];
    render();
  },
  entry(el) { S.setup.entry = el.dataset.v; try { local.savePrefs({ entry: el.dataset.v }); } catch {} render(); },
  game(el) { S.setup.game = S.games.find((g) => g.id === el.dataset.v) || null; render(); },
  filter() { S.cs.query = document.getElementById("cq").value; render(); },
  async search() {
    const q = document.getElementById("cq").value.trim();
    S.cs.query = q; S.cs.error = ""; S.cs.results = [];
    if (q.length < 3) { S.cs.error = courses.explain("TOO_SHORT"); render(); return; }
    S.busy = "search"; render();
    try { S.cs.results = await db.searchCourses(q); }
    catch (e) { S.cs.error = courses.explain(e); }
    S.busy = ""; render();
  },
  async "pick-online"(el) {
    const found = S.cs.results[Number(el.dataset.v)];
    S.busy = "course"; S.cs.error = ""; S.flash = "Getting the holes…"; render();
    try {
      const full = await db.courseById(found.providerId);
      if (!full || !Array.isArray(full.tees) || !full.tees.length) throw new Error("NO_TEES");
      try { local.rememberCourse(full); } catch {}
      chooseCourse(full);
    } catch (e) {
      S.busy = ""; S.cs.error = courses.explain(e); render();
    }
  },
  async "pick-saved"(el) {
    const id = el.dataset.v;
    const all = [...S.cs.library, ...local.recentCourses()];
    const c = all.find((x) => (x.providerId || "manual:" + x.name) === id);
    if (!c) return;
    const st = courseState(c);
    if (st === "blocked") { needHandEntry(c.name, c.providerId || null); return; }
    if (st === "check") {
      /* Withdrawn in The Scorecard: ask the golf course database again, its
         details may have been corrected since. */
      S.busy = "course"; S.flash = "Looking for corrected details…"; render();
      try { chooseCourse(await db.courseById(c.providerId)); }
      catch (e) { S.busy = ""; S.cs.error = courses.explain(e); render(); }
      return;
    }
    try { local.rememberCourse(c); } catch {}
    chooseCourse(c);
  },
  "forget-course"(el) {
    const key = el.dataset.v;
    const c = local.recentCourses().find((x) => local.courseKey(x) === key);
    if (!c) return;
    if (!window.confirm(`Delete ${c.name} (${c.tees.length} tee${c.tees.length === 1 ? "" : "s"}) from the saved courses on this device? The shared course list is not changed.`)) return;
    try { local.forgetCourse(key); }
    catch (e) { fail(e); return; }
    S.flash = `${c.name} is deleted from this device.`;
    render();
  },
  manual() {
    S.cs.manual = newManual(S.cs.query || ""); S.cs.error = ""; S.cs.scan = null; S.cs.readings = [];
    render();
  },
  "manual-cancel"() { S.cs.manual = null; S.cs.scan = null; S.cs.readings = []; render(); },
  "review-back"() { go("course"); },
  "review-hand"() { S.cs.pickTee = true; render(); },
  "review-hand-tee"(el) {
    /* Copied into the hand-entry screen; from there it is a hand entry. */
    const { m } = reviewState();
    const t = m.tees[Number(el.dataset.v)];
    const mm = S.cs.manual;
    mm.name = m.course || mm.name; mm.tee = t.name;
    mm.rating = t.rating == null ? "" : String(t.rating); mm.slope = t.slope == null ? "" : String(t.slope);
    mm.pars = m.par.map((p) => p || 4); mm.sis = m.hcp.map((h) => h || ""); mm.yards = t.yards.slice();
    mm.miss = { rating: t.rating == null, slope: t.slope == null, par: m.par.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0), si: m.hcp.map((h, i) => (h ? -1 : i)).filter((i) => i >= 0), yards: [] };
    S.cs.pickTee = false; S.cs.readings = [];
    go("course");
  },
  async "review-ok"() {
    const { m, v } = reviewState();
    if (!v.ok) return;
    let course = { ...check.courseFromCard(m, { where: "" }), providerId: null };
    if (user() && !user().anonymous) {
      S.busy = "verify"; render();
      try {
        const saved = await db.verifyCourse({ scanIds: S.cs.readings.map((r) => r.scanId).filter(Boolean), replaceId: S.cs.manual.from || null, name: m.course });
        course = saved;
      } catch (e) {
        S.busy = "";
        S.cs.error = String(e && e.message) === "NOT_VERIFIED"
          ? "The Scorecard could not confirm this card from the pictures. Take the pictures again, or correct it by hand."
          : "The card could not be saved for everybody just now (no signal?). Try again, or correct it by hand.";
        render(); return;
      }
      S.busy = "";
    }
    try { local.rememberConfirmed(course); } catch (e) { fail(e); return; }
    S.cs.library = (S.cs.library || []).filter((c) => String(c.name).trim().toLowerCase() !== String(course.name).trim().toLowerCase()).concat([course]);
    S.cs.manual = null; S.cs.readings = [];
    chooseCourse(course);
    S.flash = "Card confirmed. Choose your tee.";
    render();
  },
  "scan-pick"(el) { applyScan(S.cs.scan.tees[Number(el.dataset.v)]); },
  "manual-save"() {
    const m = S.cs.manual;
    m.name = document.getElementById("m-name").value.trim();
    m.tee = document.getElementById("m-tee").value.trim() || "Tee";
    m.rating = document.getElementById("m-rating").value.trim();
    m.slope = document.getElementById("m-slope").value.trim();
    document.querySelectorAll("[data-hole]").forEach((s) => { m.pars[Number(s.dataset.hole)] = Number(s.value); });
    document.querySelectorAll("[data-si]").forEach((s) => { m.sis[Number(s.dataset.si)] = s.value ? Number(s.value) : ""; });
    if (!m.yards) m.yards = Array(18).fill(null);
    document.querySelectorAll("[data-yds]").forEach((el) => { const v = Number(el.value); m.yards[Number(el.dataset.yds)] = el.value.trim() && Number.isInteger(v) && v >= 50 && v <= 800 ? v : null; });
    const given = m.sis.filter((x) => x !== "");
    if (given.length && (given.length !== 18 || new Set(given).size !== 18)) {
      S.error = "Each handicap number from 1 to 18 is used once. Fill in all 18, or leave them all empty.";
      render(); return;
    }
    if (m.name.length < 2) { S.error = "Type the course name."; render(); return; }
    const rating = m.rating ? Number(m.rating) : null;
    const slope = m.slope ? Number(m.slope) : null;
    if ((m.rating && !(rating > 50 && rating < 90)) || (m.slope && !(slope >= 55 && slope <= 155))) {
      S.error = "The rating is usually between 60 and 80, and the slope between 55 and 155. Check them, or leave both empty.";
      render(); return;
    }
    const par = m.pars.reduce((a, b) => a + b, 0);
    if (rating != null && slope != null && W.teeWithdrawn(S.cs.withdrawn, m.name, { rating, slope, par })) {
      S.error = "These are the details that were withdrawn from The Scorecard, so they cannot be used. Copy the rating and slope from the club's current scorecard.";
      render(); return;
    }
    const yards = m.yards || [];
    const course = { providerId: m.providerId && !W.scorecardIdOf(m.providerId) ? m.providerId : null, name: m.name, where: m.where || "Entered by hand",
      tees: [{ name: m.tee, rating, slope, par, holes: m.pars.map((p, i) => ({ par: p, yards: yards[i] == null ? null : yards[i], si: m.sis[i] === "" ? null : m.sis[i] })) }] };
    S.cs.scan = null;
    try { local.rememberCourse(course); } catch {}
    S.cs.manual = null;
    chooseCourse(course);
  },
  async "go-players"() {
    go("players");
    if (member()) {
      if (!S.groups.length) await loadGroupsAndGames();
      await loadGolfers(S.groupTab);
    }
  },
  async tab(el) { S.groupTab = el.dataset.v; render(); await loadGolfers(S.groupTab); },
  pick(el) {
    const g = (S.golfers[S.groupTab] || []).find((x) => x.golferId === el.dataset.v);
    if (!g) return;
    const i = S.picked.findIndex((p) => p.golferId === g.golferId);
    if (i >= 0) S.picked.splice(i, 1);
    else if (S.picked.length < 4) {
      const group = S.groups.find((x) => x.id === S.groupTab);
      S.picked.push({ name: g.name, golferId: g.golferId, assocId: S.groupTab, groupName: group ? group.name : "", index: g.index });
    }
    render();
  },
  "add-guest"() {
    const name = document.getElementById("guest").value.trim().replace(/\s+/g, " ");
    if (name.length < 2) { S.error = "Type the player's name."; render(); return; }
    if (S.picked.some((p) => p.name.toLowerCase() === name.toLowerCase())) { S.error = `${name} is already on the card.`; render(); return; }
    if (S.picked.length >= 4) return;
    S.picked.push({ name, golferId: null, assocId: null, groupName: "", index: null });
    S.guestName = ""; S.error = ""; render();
  },
  unguest(el) { S.picked = S.picked.filter((p) => p.golferId || p.name !== el.dataset.v); render(); },
  "tee-off"() {
    const s = S.setup;
    const c = card.newCard({ mode: member() ? "member" : "guest", date: s.date, course: s.course, tee: s.tee, holes: s.holes, start: s.start, entry: s.entry, game: s.game, players: S.picked });
    try { saveCard(c); } catch (e) { fail(e); return; }
    S.typing = false;
    go("play");
    keepAwake();
  },
  who(el) { S.typing = false; updateCard((c) => ({ ...c, who: Number(el.dataset.v) })); },
  score(el) {
    const v = el.dataset.v === "X" ? card.PICKED_UP : Number(el.dataset.v);
    const c = local.currentCard();
    setScoreNow(Math.min(c.who || 0, c.players.length - 1), v);
  },
  type() { S.typing = true; S.typed = ""; S.typeError = ""; render(); },
  "type-cancel"() { S.typing = false; S.typeError = ""; render(); },
  "type-save"() {
    const raw = document.getElementById("typed").value.trim();
    const v = Number(raw);
    if (!/^\d{1,2}$/.test(raw) || v < 1 || v > 20) { S.typed = raw; S.typeError = "Type a whole number from 1 to 20."; render(); return; }
    S.typing = false; S.typeError = "";
    const c = local.currentCard();
    setScoreNow(Math.min(c.who || 0, c.players.length - 1), v);
  },
  plus(el) {
    const c = local.currentCard(); const n = c.order[c.pos]; const i = Number(el.dataset.v);
    const s = c.players[i].scores[n];
    const par = card.holeInfo(c, n).par;
    setScoreNow(i, !card.isEntered(s) || s === card.PICKED_UP ? par : Math.min(20, s + 1));
  },
  minus(el) {
    const c = local.currentCard(); const n = c.order[c.pos]; const i = Number(el.dataset.v);
    const s = c.players[i].scores[n];
    const par = card.holeInfo(c, n).par;
    setScoreNow(i, !card.isEntered(s) || s === card.PICKED_UP ? Math.max(1, par - 1) : Math.max(1, s - 1));
  },
  next() { S.typing = false; updateCard((c) => ({ ...c, pos: Math.min(c.order.length - 1, c.pos + 1), who: 0 })); window.scrollTo(0, 0); },
  prev() { S.typing = false; updateCard((c) => ({ ...c, pos: Math.max(0, c.pos - 1), who: 0 })); window.scrollTo(0, 0); },
  card() { go("card"); },
  menu() { S.typing = false; go("menu"); },
  "switch-entry"() {
    const c = local.currentCard();
    const entry = c.entry === "all" ? "one" : "all";
    updateCard((x) => ({ ...x, entry, who: 0 }));
    try { local.savePrefs({ entry }); } catch {}
    go("play");
  },
  "to-start"() { go("start"); },
  "end-round"() {
    const c = local.currentCard();
    if (!c) { go("start"); return; }
    if (c.correcting) { actions["cancel-correction"](); return; }
    if (!window.confirm(`End the round at ${c.course.name} without posting? The card is kept under "Your cards".`)) return;
    try { local.keepFinished({ ...c, state: "ended" }); local.clearCurrent(); }
    catch (e) { fail(e); return; }
    go("start");
  },
  "check-holes"() { go("holes"); },
  "holes-ok"() { go("setup"); },
  "holes-fix"() {
    /* The holes are copied into the hand-entry screen; whatever is corrected
       there becomes a course entered by hand, which is posted as entered. */
    const s = S.setup, t = s.tee;
    const hs = Array.from({ length: 18 }, (_, i) => (t.holes || [])[i] || {});
    S.cs.manual = { ...newManual(s.course.name), tee: t.name, rating: t.rating == null ? "" : String(t.rating), slope: t.slope == null ? "" : String(t.slope),
      pars: hs.map((h) => Number(h.par) || 4), sis: hs.map((h) => (h.si ? Number(h.si) : "")), yards: hs.map((h) => (h.yards ? Number(h.yards) : null)), where: s.course.where || "" };
    S.cs.manual.from = s.course.providerId || null;
    S.cs.scan = null; S.cs.error = ""; S.cs.readings = [];
    go("course");
    S.flash = "Correct what is wrong, then tap Use this course. Or read the club's card from pictures.";
    render();
  },
  "back-play"() { const c = local.currentCard(); go(c && c.state === "finished" && card.cardComplete(c) ? "finish" : "play"); },
  jump(el) { updateCard((c) => ({ ...c, pos: Number(el.dataset.v), who: 0, state: "playing", fixing: c.fixing || c.state === "finished" })); go("play"); },
  async "go-corrections"() {
    S.corrections = null; go("corrections");
    try { S.corrections = await db.correctableCards(); }
    catch (e) { S.corrections = []; S.error = correctionWhy(e); }
    render();
  },
  async "correct-card"(el) {
    /* Rounds deleted in The Scorecard since: the card is edited and re-posted
       instead (Willy, 18 Oct 2026). */
    if (!(S.mine && S.mine.editable.some((x) => x.cardId === el.dataset.v))) await refreshMine(true);
    if (S.mine && S.mine.editable.some((x) => x.cardId === el.dataset.v)) return actions["repost-card"](el);
    const cur = local.currentCard();
    if (cur && !cur.correcting && (cur.state === "playing" || cur.state === "finished")) {
      S.error = "A round is in progress on this phone. Finish it (or end it from its Menu) before correcting another card.";
      render(); return;
    }
    S.busy = "load"; S.flash = "Opening the card…"; render();
    try {
      const x = await db.cardForCorrection(el.dataset.v);
      const k = x.card;
      let c = card.newCard({
        id: k.id, mode: "member", date: k.date, course: k.course, tee: k.tee, holes: k.holes, start: k.start,
        entry: (local.prefs().entry || "one"), game: k.game,
        players: k.players.map((p) => ({ name: p.name, golferId: p.golferId, assocId: p.assocId, groupName: "", index: (x.handicaps.find((h) => h.golferId === p.golferId) || {}).index ?? null })),
      });
      c = { ...c, order: k.order.map(Number), players: c.players.map((p, i) => ({ ...p, scores: Object.fromEntries(Object.entries(k.players[i].scores).map(([n, v]) => [Number(n), v])) })) };
      c = { ...c, state: "finished", correcting: { cardId: k.id, as: x.as, until: x.until } };
      local.saveCurrent(c);
      S.busy = ""; S.flash = ""; go("finish");
    } catch (e) { S.busy = ""; S.flash = ""; S.error = correctionWhy(e); render(); }
  },
  async "save-correction"() {
    const c = local.currentCard();
    if (!c || !c.correcting || S.busy) return;
    const scores = Object.fromEntries(c.players.map((p) => [p.golferId, Object.fromEntries(c.order.map((n) => [String(n), p.scores[n]]))]));
    S.busy = "correct"; render();
    try {
      const r = await db.saveCorrection(c.correcting.cardId, scores);
      S.busy = "";
      if (r.status === "unchanged") { S.flash = "No score was changed, so nothing was saved."; render(); return; }
      /* The card kept on this phone shows the corrected scores too. */
      const kept = local.finishedCards().find((x) => x.id === c.correcting.cardId);
      if (kept) {
        try {
          local.keepFinished({ ...kept, players: kept.players.map((p) => {
            const f = c.players.find((q) => q.golferId && q.golferId === p.golferId);
            return f ? { ...p, scores: f.scores } : p;
          }) });
        } catch {}
      }
      local.clearCurrent();
      go("start");
      S.flash = `Corrected in The Scorecard: ${r.changed.join(", ")}. Their rounds and handicap indexes are up to date.`;
      render();
    } catch (e) { S.busy = ""; S.error = correctionWhy(e); render(); }
  },
  "cancel-correction"() {
    if (!window.confirm("Cancel the correction? Nothing is changed in The Scorecard.")) return;
    local.clearCurrent(); go("start");
  },
  "fix-score"() { updateCard((c) => ({ ...c, fixing: true })); go("card"); },
  finish() { updateCard((c) => ({ ...c, state: "finished", fixing: false })); go("finish"); },
  post() {
    const c = local.currentCard();
    try { db.queuePost(c); } catch (e) { fail(e); return; }
    go("status");
  },
  done() {
    const c = local.currentCard();
    if (c && c.correcting) { local.clearCurrent(); go("start"); return; }
    if (c) { try { local.keepFinished(c.state === "finished" ? { ...c } : c); } catch {} }
    local.clearCurrent();
    go("start");
    refreshMine(true);
  },
  "share-card"() { const c = local.currentCard(); if (c) share(card.shareText(c), S.screen); },
  "share-view"() { if (S.view) share(card.shareText(S.view), "view"); },
  "share-back"() { go(S.shareBack || "start"); },
  async copy() {
    try { await navigator.clipboard.writeText(S.share || ""); S.flash = "Copied. Paste it into any message."; }
    catch { S.error = "This browser would not copy. Press and hold the text below, then choose Copy."; }
    render();
  },
  history() { db.dropReplaced(); go("history"); refreshMine(true); },
  async "repost-card"(el) {
    const x = S.mine && S.mine.editable.find((k) => k.cardId === el.dataset.v);
    if (!x) return;
    const cur = local.currentCard();
    if (cur && (cur.state === "playing" || cur.state === "finished")) {
      S.error = "A round is in progress on this phone. Finish it (or end it from its Menu) before re-posting a card.";
      render(); return;
    }
    const k = x.card;
    let c = card.newCard({
      mode: "member", date: k.date, course: k.course, tee: k.tee, holes: k.holes, start: k.start,
      entry: (local.prefs().entry || "one"), game: k.game,
      players: k.players.map((p) => ({ name: p.name, golferId: p.golferId, assocId: p.assocId, groupName: "", index: p.index })),
    });
    c = { ...c, order: k.order.map(Number), players: c.players.map((p, i) => ({ ...p, scores: Object.fromEntries(Object.entries(k.players[i].scores).map(([n, v]) => [Number(n), v])) })) };
    c = { ...c, state: "finished", repostOf: x.cardId };
    local.saveCurrent(c);
    go("finish");
  },
  async "hide-editable"(el) {
    if (S.busy) return;
    if (!window.confirm("Hide this card? It is only taken off this list. Nothing changes in The Scorecard.")) return;
    S.busy = "hide"; render();
    try {
      await db.hideEditable(el.dataset.v);
      S.mine = { ...S.mine, editable: S.mine.editable.map((k) => (k.cardId === el.dataset.v ? { ...k, hidden: true } : k)) };
      S.busy = ""; S.flash = "The card is hidden."; render();
    } catch (e) { S.busy = ""; S.error = correctionWhy(e); render(); }
  },
  "cancel-repost"() {
    if (!window.confirm("Cancel the re-post? Nothing is posted.")) return;
    local.clearCurrent(); go("history");
  },
  view(el) { S.view = local.finishedCards().find((c) => c.id === el.dataset.v) || null; go("view"); refreshMine(); },
  "delete-card"() {
    const c = S.view;
    if (!c) return;
    if (!window.confirm(`Delete the card from ${c.course.name}, ${niceDate(c.date)}? It was never posted, and it cannot be brought back.`)) return;
    try { db.deleteCard(c.id); }
    catch (e) { fail(e); return; }
    S.view = null;
    go("history");
    S.flash = "The card is deleted.";
    render();
  },
};

/* A course in a list: "" usable, "check" withdrawn in The Scorecard but the
   golf course database may have corrected details, "blocked" never usable. */
function courseState(c) {
  const list = S.cs.withdrawn || [];
  const own = W.scorecardIdOf(c.providerId);
  if (own) return list.some((w) => w.id === own) ? "blocked" : "";
  if (!c.providerId) return (c.tees || []).length && c.tees.every((t) => W.teeWithdrawn(list, c.name, t)) ? "blocked" : "";
  return W.nameWithdrawn(list, c.name) ? "check" : "";
}

/* How many pictures can still be read today; shown with the picture buttons. */
function refreshScanStatus() {
  db.scanStatus().then((st) => { S.scanStatus = st; if (["course", "review"].includes(S.screen)) render(); }).catch(() => {});
}

function newManual(name) {
  refreshScanStatus();
  return { name, tee: "White", rating: "", slope: "", pars: Array(18).fill(4), sis: Array(18).fill(""), yards: Array(18).fill(null), providerId: null, where: "" };
}

function needHandEntry(name, from = null) {
  S.busy = "";
  S.cs.manual = { ...newManual(name), from };
  S.cs.readings = [];
  go("course");
  S.error = `${name} has been withdrawn from The Scorecard because its details may be wrong, and it cannot be used. Enter the course from the club's scorecard: type it in, or read it from a photo.`;
  render();
}

function chooseCourse(c) {
  const list = S.cs.withdrawn || [];
  c = { ...c, tees: (c.tees || []).map((t) => ({ ...t, withdrawn: !!t.withdrawn || W.teeWithdrawn(list, c.name, t) })) };
  if (c.tees.length && c.tees.every((t) => t.withdrawn)) { needHandEntry(c.name, c.providerId || null); return; }
  S.busy = "";
  S.setup.course = c;
  const usable = c.tees.filter((t) => !t.withdrawn);
  S.setup.tee = usable.length === 1 ? usable[0] : null;
  if (S.setup.tee && (S.setup.tee.holes || []).length && S.setup.tee.holes.length < 18) S.setup.holes = "front";
  S.setup.start = card.holeOrder(S.setup.holes, S.setup.start)[0];
  S.cs.results = [];
  go("setup");
}

/* ---------------- a photo of the club's scorecard ---------------- */

/* The picture is made smaller on the phone first (long side 1600 pixels),
   which is plenty to read a scorecard and quick to send. */
function shrink(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(img.naturalWidth * k));
        cv.height = Math.max(1, Math.round(img.naturalHeight * k));
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL("image/jpeg", 0.85));
      } catch { reject(new Error("SCAN_BAD_PHOTO")); }
      finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("SCAN_BAD_PHOTO")); };
    img.src = url;
  });
}

async function readPhoto(file) {
  if (!file || !S.cs.manual) return;
  S.cs.error = ""; S.error = ""; S.cs.scan = null; S.busy = "scan"; render();
  try {
    const image = await shrink(file);
    const result = await db.scanCard(image);
    S.busy = "";
    S.cs.readings = [...(S.cs.readings || []), result];
    refreshScanStatus();
    S.cs.pickTee = false;
    if (result.course && !S.cs.manual.name) S.cs.manual.name = result.course;
    go("review");
  } catch (e) {
    S.busy = ""; S.cs.error = courses.explain(e); refreshScanStatus(); render();
  }
}

/* Fills the hand-entry screen from one tee read off the picture: only the
   holes the picture shows, so the other nine can come from a second picture.
   Anything not read, or not adding up to the card's own totals, is marked red. */
function applyScan(t) {
  const m = S.cs.manual;
  if (!m || !t) return;
  const sc = S.cs.scan || {};
  const read = sc.holesRead && sc.holesRead.length ? sc.holesRead : Array.from({ length: 18 }, (_, i) => i + 1);
  const first = !m.scanned;
  if (first || !m.miss) m.miss = { rating: false, slope: false, par: [], si: [], yards: [] };
  if (!m.miss.yards) m.miss.yards = [];
  const doubt = t.doubt || { par: [], yards: [], si: [] };
  m.tee = t.name || m.tee;
  /* Rating and slope: taken when read; on the first picture an unread one is
     emptied (never left from an earlier course) and marked. */
  if (t.rating != null) { m.rating = String(t.rating); m.miss.rating = false; }
  else if (first) { m.rating = ""; m.miss.rating = true; }
  if (t.slope != null) { m.slope = String(t.slope); m.miss.slope = false; }
  else if (first) { m.slope = ""; m.miss.slope = true; }
  const drop = (list, i) => list.filter((x) => x !== i);
  for (const n of read) {
    const i = n - 1, h = t.holes[i] || {};
    m.miss.par = drop(m.miss.par, i); m.miss.si = drop(m.miss.si, i); m.miss.yards = drop(m.miss.yards, i);
    if (h.par != null) m.pars[i] = h.par; else m.miss.par.push(i);
    if (h.si != null) m.sis[i] = h.si; else { m.sis[i] = ""; m.miss.si.push(i); }
    m.yards[i] = h.yards == null ? null : h.yards;
    if (doubt.par.includes(n) && !m.miss.par.includes(i)) m.miss.par.push(i);
    if (doubt.si.includes(n) && !m.miss.si.includes(i)) m.miss.si.push(i);
    if (doubt.yards.includes(n)) m.miss.yards.push(i);
  }
  m.scanned = [...new Set([...(m.scanned || []), ...read])].sort((a, b) => a - b);
  const missing = m.miss.par.length + m.miss.si.length + m.miss.yards.length + (m.miss.rating ? 1 : 0) + (m.miss.slope ? 1 : 0);
  const totalsOff = doubt.par.length + doubt.yards.length > 0;
  S.cs.scan = { ...sc, applied: true, missing, totalsOff };
  render();
}

function confirmLeave(cur) {
  return window.confirm(`You have a round in progress at ${cur.course.name}. Start a new one? The unfinished card is kept under "Your cards".`)
    && (() => { try { local.keepFinished({ ...cur, state: "finished" }); local.clearCurrent(); } catch {} return true; })();
}


const view=new URLSearchParams(location.search).get('view')||'choose';
const holes=Array.from({length:18},(_,i)=>({par:[4,5,3,4,4,5,3,4,4][i%9],yards:[384,501,158,362,330,489,169,341,378][i%9],si:i+1}));
const tee={name:'White',rating:70.1,slope:125,par:72,holes};
const course={providerId:'example-course',name:'Sample Links Golf Club',where:'Documentation example',tees:[tee,{...tee,name:'Blue',rating:72.2,slope:130}]};
const names=['Alex Green','Sam Reed','Pat Morris','Jordan Lee'];
const players=names.map((name,i)=>({name,golferId:'g'+i,assocId:'group',groupName:'Weekend Golfers',index:[12.4,18.1,null,9.8][i]}));
current=card.newCard({id:'example-card',mode:'member',date:'2026-10-18',course,tee,holes:'18',start:1,entry:'one',players});
current.players=current.players.map((p,i)=>({...p,scores:Object.fromEntries(holes.map((h,n)=>[n+1,h.par+(i===1?1:0)]))}));
S.setup={date:'2026-10-18',course,tee,holes:'18',start:1,entry:'one',game:null};
S.groups=[{id:'group',name:'Weekend Golfers',role:'member'}];S.groupTab='group';S.golfers={group:players};S.picked=players.slice(0,3);
S.games=[{id:'game',name:'Weekend Medal',assocId:'group',groupName:'Weekend Golfers'}];
S.cs.library=[course];recent=[{...course,providerId:'local-example',name:'River Bend Golf Course',tees:[tee]}];
const manual={name:course.name,tee:'White',rating:'70.1',slope:'125',pars:holes.map(h=>h.par),sis:holes.map(h=>h.si),yards:holes.map(h=>h.yards),providerId:null,where:''};
S.scanStatus={left:8};
let html;
switch(view){
case 'choose':demoUser=null;current=null;html=screenStart();break;
case 'start-member':current=null;S.mine={editable:[{hidden:false}],correctable:[]};html=screenStart();break;
case 'signin':html=screenSignIn();break;
case 'setup':html=screenSetup();break;
case 'date':cal.open=true;cal.month='2026-10';html=screenSetup();break;
case 'course':html=screenCourse();break;
case 'manual':case 'photo':S.cs.manual=manual;html=screenManualCourse();break;
case 'verify':S.cs.manual=manual;S.cs.readings=[{course:course.name,holesRead:holes.map((_,i)=>i+1),parOut:36,parIn:36,tees:course.tees.map(t=>({...t,out:holes.slice(0,9).reduce((s,h)=>s+h.yards,0),in:holes.slice(9).reduce((s,h)=>s+h.yards,0),total:holes.reduce((s,h)=>s+h.yards,0)}))}];html=screenReview();break;
case 'players':html=screenPlayers();break;
case 'games':S.setup.game=S.games[0];html=screenSetup();break;
case 'one':html=screenPlayOne(current);break;
case 'all':current.entry='all';html=screenPlayAll(current);break;
case 'typed':S.typing=true;S.typed='11';html=screenPlayOne(current);break;
case 'menu':html=screenMenu(current);break;
case 'card':current.state='finished';html=screenCard(current);break;
case 'fixing':current.fixing=true;html=screenPlayOne(current);break;
case 'totals':case 'post':current.state='finished';html=screenFinish(current);break;
case 'status':current.state='posted';html=screenStatus(current);break;
case 'help':current.state='failed';current.postError='The Scorecard could not be reached. Keep your card and check your connection.';html=screenStatus(current);break;
case 'history':current.state='posted';kept=[current];S.mine={editable:[{cardId:current.id,course:course.name,date:current.date,players:names,gone:[names[0]],hidden:false}],correctable:[]};html=screenHistory();break;
case 'corrections':S.corrections=[{cardId:current.id,course:course.name,date:current.date,players:names,as:'scorer',until:Date.parse('2026-10-19T18:00:00Z'),corrections:0}];html=screenCorrections();break;
case 'correct':current.state='finished';current.correcting={cardId:current.id,as:'scorer'};html=screenCorrectFinish(current);break;
case 'repost':current.state='finished';current.repostOf='original-example';current.players=current.players.slice(0,1);html=screenFinish(current);break;
case 'share':S.share=card.shareText(current);html=screenShare();break;
default:throw new Error('Unknown documentation view: '+view);
}
app.innerHTML=html;
document.title='The Marker '+view+' - documentation example (0.6.4)';

})();
