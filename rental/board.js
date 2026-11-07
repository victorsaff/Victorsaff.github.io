const REPO = "victorsaff/Victorsaff.github.io";

const EASTERN = "America/New_York";

export function newYorkToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function parseDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function fmtDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function addDays(date, count) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + count);
  return next;
}

export function nextDay(iso) {
  return fmtDate(addDays(parseDate(iso), 1));
}

export function eachDate(start, end) {
  const dates = [];
  for (let cursor = parseDate(start); fmtDate(cursor) <= end; cursor = addDays(cursor, 1)) {
    dates.push(fmtDate(cursor));
  }
  return dates;
}

export function formatPretty(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatShort(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatChecked(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "pending";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function clockMinutes(hour, minute, meridiem) {
  let value = Number(hour) % 12;
  if (meridiem === "pm") value += 12;
  return value * 60 + Number(minute || 0);
}

export function parseSchedule(schedule) {
  const text = String(schedule || "").trim().toLowerCase().replace(/[–—]/g, "-");
  let match = text.match(/^daily\s+~?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (match) return { kind: "daily", minutes: clockMinutes(match[1], match[2], match[3]) };
  match = text.match(/^hourly\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (match) {
    return {
      kind: "hourly",
      start: clockMinutes(match[1], match[2], match[3]),
      end: clockMinutes(match[4], match[5], match[6]),
    };
  }
  match = text.match(/^every\s+(\d+)\s+hours?$/);
  if (match) return { kind: "interval", hours: Number(match[1]) };
  return null;
}

function easternOffsetMinutes(date) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: EASTERN, timeZoneName: "shortOffset" })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value || "GMT-5";
  const match = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return -300;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] || 0));
}

function easternWallTime(year, month, day, hour, minute) {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let pass = 0; pass < 2; pass += 1) {
    utc = Date.UTC(year, month - 1, day, hour, minute, 0) - easternOffsetMinutes(new Date(utc)) * 60000;
  }
  return new Date(utc);
}

function slotsOnDate(spec, iso) {
  const [year, month, day] = iso.split("-").map(Number);
  if (spec.kind === "daily") {
    return [easternWallTime(year, month, day, Math.floor(spec.minutes / 60), spec.minutes % 60)];
  }
  if (spec.kind === "hourly") {
    const slots = [];
    for (let minute = spec.start; minute <= spec.end; minute += 60) {
      slots.push(easternWallTime(year, month, day, Math.floor(minute / 60), minute % 60));
    }
    return slots;
  }
  return [];
}

function nextInterval(hours, lastRun, now) {
  const step = hours * 3600000;
  const anchor = lastRun ? new Date(lastRun) : easternWallTime(...newYorkToday(now).split("-").map(Number), 0, 0);
  if (Number.isNaN(anchor.getTime())) return null;
  if (anchor > now) return anchor;
  const jumps = Math.floor((now.getTime() - anchor.getTime()) / step) + 1;
  return new Date(anchor.getTime() + jumps * step);
}

export function taskNextRun(task, now = new Date()) {
  if (!task) return null;
  if (task.nextRun) {
    const explicit = new Date(task.nextRun);
    if (!Number.isNaN(explicit.getTime())) return explicit;
  }
  const spec = parseSchedule(task.schedule);
  if (!spec) return null;
  if (spec.kind === "interval") return nextInterval(spec.hours, task.lastRun, now);
  const today = newYorkToday(now);
  const tomorrow = nextDay(today);
  const slots = [...slotsOnDate(spec, today), ...slotsOnDate(spec, tomorrow)].filter((slot) => slot > now);
  return slots[0] || null;
}

export function upcomingRunsToday(task, now = new Date()) {
  if (!task || String(task.status || "").toLowerCase() === "paused") return [];
  const today = newYorkToday(now);
  if (task.nextRun) {
    const explicit = new Date(task.nextRun);
    return !Number.isNaN(explicit.getTime()) && explicit > now && newYorkToday(explicit) === today ? [explicit] : [];
  }
  const spec = parseSchedule(task.schedule);
  if (!spec) return [];
  if (spec.kind === "interval") {
    const runs = [];
    let cursor = nextInterval(spec.hours, task.lastRun, new Date(now.getTime() - 1));
    while (cursor && newYorkToday(cursor) === today && runs.length < 48) {
      if (cursor > now) runs.push(cursor);
      cursor = new Date(cursor.getTime() + spec.hours * 3600000);
    }
    return runs;
  }
  return slotsOnDate(spec, today).filter((slot) => slot > now);
}

export function money(value) {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export function isOccupied(stay, iso) {
  if (!stay || stay.status === "cancelled") return false;
  if (!stay.checkIn || !stay.checkOut) return false;
  return stay.checkIn <= iso && iso < stay.checkOut;
}

export function nightsOverlapping(stay, start, end) {
  if (!stay || stay.status === "cancelled" || !stay.checkIn || !stay.checkOut) return [];
  return eachDate(start, end).filter((iso) => stay.checkIn <= iso && iso < stay.checkOut);
}

function unknownMightOverlap(stay, range) {
  if (!stay || stay.status === "cancelled") return false;
  if (stay.checkIn && stay.checkOut) return false;
  if (stay.checkOut && !stay.checkIn) return stay.checkOut > range.start;
  if (stay.checkIn && !stay.checkOut) return stay.checkIn <= range.end;
  return true;
}

function sumField(stays, field) {
  if (!stays.length) return null;
  let total = 0;
  for (const stay of stays) {
    if (stay[field] === null || stay[field] === undefined || stay[field] === "") return null;
    const amount = Number(stay[field]);
    if (!Number.isFinite(amount)) return null;
    total += amount;
  }
  return total;
}

export function monthToDate(today) {
  return { start: `${today.slice(0, 7)}-01`, end: today };
}

export function next30(today) {
  return { start: today, end: fmtDate(addDays(parseDate(today), 29)) };
}

export function periodReport(data, range, label) {
  const days = eachDate(range.start, range.end);
  const available = days.length * data.rooms.length;
  const excluded = data.stays.filter((stay) => unknownMightOverlap(stay, range));
  const rows = [];
  const stated = [];
  let confirmed = 0;

  const roomStats = data.rooms.map((room) => ({
    room,
    confirmed: 0,
    available: days.length,
  }));
  const occupied = new Set();
  const roomDates = new Map(data.rooms.map((room) => [room.id, new Set()]));

  for (const platform of data.platforms) {
    for (const room of data.rooms) {
      const overlapping = data.stays.filter((stay) => {
        return stay.platform === platform.id && stay.roomId === room.id && nightsOverlapping(stay, range.start, range.end).length > 0;
      });
      const nights = overlapping.reduce((count, stay) => count + nightsOverlapping(stay, range.start, range.end).length, 0);
      for (const stay of overlapping) {
        for (const iso of nightsOverlapping(stay, range.start, range.end)) {
          occupied.add(`${room.id}|${iso}`);
          roomDates.get(room.id)?.add(iso);
        }
      }
      const gross = sumField(overlapping, "gross");
      const fees = sumField(overlapping, "fees");
      const net = sumField(overlapping, "net");
      rows.push({
        platform,
        room,
        nights,
        gross,
        fees,
        net,
        adr: gross !== null && nights > 0 ? gross / nights : null,
      });
      for (const stay of overlapping) {
        if (stay.statedAmount === null || stay.statedAmount === undefined) continue;
        const whollyInside = stay.checkIn >= range.start && stay.checkOut <= nextDay(range.end);
        stated.push({ stay, whollyInside });
      }
    }
  }

  confirmed = occupied.size;
  for (const stat of roomStats) stat.confirmed = roomDates.get(stat.room.id)?.size || 0;

  return {
    label,
    start: range.start,
    end: range.end,
    days: days.length,
    available,
    confirmed,
    roomStats,
    excluded,
    rows,
    stated,
  };
}

export function dayRoster(data, iso, today) {
  return data.rooms.map((room) => {
    const stays = data.stays.filter((stay) => stay.roomId === room.id);
    const active = stays.filter((stay) => stay.status !== "cancelled");
    return {
      room,
      occupied: active.filter((stay) => isOccupied(stay, iso)),
      arriving: active.filter((stay) => stay.checkIn === iso),
      departing: active.filter((stay) => stay.checkOut === iso),
      cancelled: stays.filter((stay) => {
        return stay.status === "cancelled" && stay.checkIn && stay.checkOut && stay.checkIn <= iso && iso < stay.checkOut;
      }),
      presentIncomplete: iso === today
        ? active.filter((stay) => stay.presentUntilCheckout && !stay.checkIn && stay.checkOut && iso < stay.checkOut)
        : [],
    };
  });
}

export function turnovers(data, start, end) {
  const events = [];
  for (const room of data.rooms) {
    const stays = data.stays.filter((stay) => stay.roomId === room.id && stay.status !== "cancelled");
    for (const iso of eachDate(start, end)) {
      const departing = stays.filter((stay) => stay.checkOut === iso);
      if (!departing.length) continue;
      const arriving = stays.filter((stay) => stay.checkIn === iso);
      events.push({ date: iso, room, departing, arriving, sameDay: arriving.length > 0 });
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.room.name.localeCompare(b.room.name));
  return events;
}

export function monthsInRange(start, end) {
  const months = [];
  let year = Number(start.slice(0, 4));
  let month = Number(start.slice(5, 7));
  const endYear = Number(end.slice(0, 4));
  const endMonth = Number(end.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push({ year, month });
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

export function monthCells(year, month, rangeStart, rangeEnd) {
  const lead = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ iso, day, inRange: iso >= rangeStart && iso <= rangeEnd });
  }
  while (cells.length % 7) cells.push(null);
  return cells;
}

const PUBLIC_WARNING = "This repository is public. Do not add door codes, Wi-Fi passwords, card numbers, phone numbers, emails, reservation numbers, or payout batch ids.";

function decisionIssueUrl(title, body) {
  const url = new URL(`https://github.com/${REPO}/issues/new`);
  url.searchParams.set("title", title);
  url.searchParams.set("labels", "decision");
  url.searchParams.set("body", body);
  return url.toString();
}

export function decisionUrl(decision, choice) {
  const title = `DECISION: ${choice} ${decision.id}`;
  const body = [
    `Decision id: ${decision.id}`,
    `Choice: ${choice}`,
    "",
    decision.title,
    decision.detail,
    "",
    "Sent from the Rental Command Center.",
    PUBLIC_WARNING,
  ].join("\n");
  return decisionIssueUrl(title, body);
}

export function decisionCommentUrl(decision, message) {
  const title = `DECISION: COMMENT ${decision.id}`;
  const body = [
    String(message || "").trim(),
    "",
    `Decision id: ${decision.id}`,
    "",
    "Sent from the Rental Command Center.",
    PUBLIC_WARNING,
  ].join("\n");
  return decisionIssueUrl(title, body);
}

export function stayNoteUrl(stay, room, message) {
  const title = `NOTE: ${stay.id}`;
  const roomLabel = room?.name || "Room pending";
  const checkIn = stay.checkIn || "check-in pending";
  const body = [
    String(message || "").trim(),
    "",
    `Stay: ${stay.guest}, ${roomLabel}, ${checkIn}`,
    "",
    "Sent from the Rental Command Center.",
    PUBLIC_WARNING,
  ].join("\n");
  const url = new URL(`https://github.com/${REPO}/issues/new`);
  url.searchParams.set("title", title);
  url.searchParams.set("labels", "note");
  url.searchParams.set("body", body);
  return url.toString();
}

export function priceRoomKey(room) {
  const match = String(room?.id || "").match(/(\d+)/);
  return match ? `room${match[1]}` : "";
}

export function nightPrices(data, room, iso) {
  const row = data.prices?.rooms?.[priceRoomKey(room)]?.[iso] || {};
  return {
    airbnb: row.airbnb ?? null,
    booking: row.booking ?? null,
    agoda: row.agoda ?? null,
  };
}

export function priceText(value) {
  if (value === null || value === undefined || value === "") return "—";
  const formatted = money(value);
  return formatted === null ? "—" : formatted;
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dayHeadParts(iso, previousIso) {
  const [year, month, day] = String(iso || "").split("-");
  const monthName = MONTH_ABBR[Number(month) - 1] || "";
  const previousYear = previousIso ? String(previousIso).slice(0, 4) : "";
  const showYear = !previousIso || year !== previousYear || month === "01";
  return {
    iso,
    month: monthName,
    day: String(Number(day)),
    year: showYear ? year : "",
    label: `${monthName}${showYear ? ` ${year}` : ""} ${Number(day)}`.trim(),
  };
}

function pricePlatformInfo(data, platformId, roomKey) {
  return data.prices?.platforms?.[platformId]?.rooms?.[roomKey] || null;
}

function coverageLabel(info) {
  if (!info?.coverageStart || !info?.coverageEnd) return "";
  const start = `${formatShort(info.coverageStart)}, ${info.coverageStart.slice(0, 4)}`;
  const end = `${formatShort(info.coverageEnd)}, ${info.coverageEnd.slice(0, 4)}`;
  return `${start}–${end}`;
}

function checkedLabel(info) {
  const stamps = (info?.observedSpans || []).map((span) => span.observedAt).filter(Boolean).sort();
  if (!stamps.length) return "";
  return formatChecked(stamps[stamps.length - 1]);
}

export function priceIssueUrl({ roomNumber, start, end, price, platforms }) {
  const platformList = platforms.join(",");
  const title = `PRICE: room${roomNumber} ${start}..${end} ${price} ${platformList}`;
  const body = [
    `Room: Room ${roomNumber}`,
    `Start: ${start}`,
    `End: ${end}`,
    `Price: ${price}`,
    `Platforms: ${platforms.join(", ")}`,
    "",
    "Sent from the Rental Command Center.",
    PUBLIC_WARNING,
  ].join("\n");
  return decisionIssueUrl(title, body);
}

export function matchPriceIssues(issues) {
  const found = [];
  for (const issue of issues || []) {
    const match = /^PRICE: room(\d+) (\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2}) (\S+) (\S+)\s*$/.exec(String(issue.title || "").trim());
    if (!match) continue;
    found.push({
      roomNumber: match[1],
      start: match[2],
      end: match[3],
      price: match[4],
      platforms: match[5],
      title: issue.title,
      url: issue.html_url || "",
      number: issue.number,
    });
  }
  return found;
}

export function matchStayNotes(stays, issues) {
  const map = new Map((stays || []).map((stay) => [stay.id, []]));
  for (const issue of issues || []) {
    const match = /^NOTE: ([A-Za-z0-9._-]+)\s*$/.exec(String(issue.title || "").trim());
    if (!match || !map.has(match[1])) continue;
    map.get(match[1]).push({
      title: issue.title,
      url: issue.html_url || "",
      number: issue.number,
    });
  }
  return map;
}

export function matchDecisions(decisions, issues) {
  const map = new Map(decisions.map((decision) => [decision.id, []]));
  for (const issue of issues || []) {
    const match = /^DECISION: (APPROVE|SKIP|COMMENT) ([A-Za-z0-9._-]+)\s*$/.exec(String(issue.title || "").trim());
    if (!match || !map.has(match[2])) continue;
    map.get(match[2]).push({
      choice: match[1],
      title: issue.title,
      url: issue.html_url || "",
      number: issue.number,
    });
  }
  return map;
}

export function platformTotals(data) {
  return data.platforms.map((platform) => {
    const stays = data.stays.filter((stay) => stay.platform === platform.id);
    const confirmed = stays.filter((stay) => stay.status !== "cancelled");
    return {
      platform,
      confirmed: confirmed.length,
      cancelled: stays.length - confirmed.length,
      byRoom: data.rooms.map((room) => ({
        room,
        count: confirmed.filter((stay) => stay.roomId === room.id).length,
      })),
    };
  });
}

export function staysAfterCalendar(data) {
  const end = data.meta.calendar.end;
  const dayAfter = nextDay(end);
  return data.stays
    .filter((stay) => {
      if (stay.checkIn && stay.checkIn > end) return true;
      return Boolean(stay.checkOut && stay.checkOut > dayAfter);
    })
    .sort((a, b) => String(a.checkIn || "").localeCompare(String(b.checkIn || "")) || String(a.id).localeCompare(String(b.id)));
}

export function derive(data, today) {
  const calendar = data.meta.calendar;
  return {
    today,
    tomorrow: nextDay(today),
    todayRoster: dayRoster(data, today, today),
    tomorrowRoster: dayRoster(data, nextDay(today), today),
    turnovers: turnovers(data, calendar.start, calendar.end),
    later: staysAfterCalendar(data),
    platformTotals: platformTotals(data),
    periods: [
      periodReport(data, monthToDate(today), "Month to date"),
      periodReport(data, data.meta.november, "All of November"),
      periodReport(data, next30(today), "Next 30 days"),
    ],
  };
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function safeColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(color || "") ? color : "#8fa3bf";
}

function platformOf(data, id) {
  return data.platforms.find((platform) => platform.id === id);
}

function roomOf(data, id) {
  return data.rooms.find((room) => room.id === id);
}

function badge(data, platformId) {
  const platform = platformOf(data, platformId);
  if (!platform) return "";
  const ink = platform.id === "agoda" ? "#1c1004" : "#fff";
  return `<span class="badge" style="background:${safeColor(platform.color)};color:${ink}">${esc(platform.short || platform.label)}</span>`;
}

function roomName(room) {
  return `<span class="room-name"><i style="background:${safeColor(room.color)}"></i>${esc(room.name)}</span>`;
}

function pendingOr(value) {
  const formatted = money(value);
  return formatted === null ? '<span class="pending">pending</span>' : esc(formatted);
}

function party(stay) {
  if (Number.isInteger(stay.adults)) return stay.adults === 1 ? "1 adult" : `${stay.adults} adults`;
  return "Party size pending";
}

function staySpan(stay) {
  const start = stay.checkIn ? formatShort(stay.checkIn) : "check-in pending";
  const end = stay.checkOut ? formatShort(stay.checkOut) : "checkout pending";
  return `${esc(start)} → ${esc(end)}`;
}

function percent(part, whole) {
  if (!whole) return "pending";
  const value = Math.min(100, Math.max(0, (part / whole) * 100));
  return `${(Math.round(value * 10) / 10).toFixed(1)}%`;
}

function listingLines(room) {
  const lines = [];
  if (room.listings.airbnb) lines.push(`Airbnb · ${room.listings.airbnb}`);
  if (room.listings.booking) lines.push(`Booking listing ${room.listings.booking}`);
  if (room.listings.agoda) lines.push(`Agoda listing ${room.listings.agoda}`);
  return lines.map((line) => `<p>${esc(line)}</p>`).join("");
}

function threadHref(path) {
  if (typeof path !== "string") return null;
  const clean = path.trim();
  if (!clean || clean.includes("..") || clean.includes("\\") || clean.includes("?") || clean.includes("#")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.startsWith("//")) return null;
  if (!/^[\w./-]+$/.test(clean)) return null;
  if (clean.startsWith("/")) return clean;
  if (clean.startsWith("rental/")) return `/${clean}`;
  return clean;
}

function threadLink(stay) {
  const href = threadHref(stay.threadPhoto);
  if (!href) return "";
  return `<p class="thread-row"><a class="btn skip" href="${esc(href)}" target="_blank" rel="noopener noreferrer">View thread</a></p>`;
}

function stayNoteBox(stay) {
  const found = state.stayNotes?.get(stay.id) || [];
  const recorded = found.length
    ? `<ul class="choice">${found.map((issue) => `<li>NOTE recorded${issue.url ? ` · <a href="${esc(issue.url)}">issue ${esc(issue.number || "")}</a>` : ""}</li>`).join("")}</ul>`
    : "";
  return `${recorded}
    <label style="display:block;margin-top:10px;font-size:13px;font-weight:700">Message about this stay
      <textarea class="stay-note" rows="2" style="display:block;width:100%;box-sizing:border-box;margin-top:6px;font:inherit;padding:8px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink)"></textarea>
    </label>
    <p class="note">This site is public. Don't add door codes, Wi-Fi passwords, card numbers, phone numbers, emails, reservation numbers, or payout batch ids.</p>
    <button type="button" class="btn stay-note-send" data-stay-id="${esc(stay.id)}" style="background:#93c5fd;color:#0f172a;flex:none;display:inline-block;margin-top:8px">Send note</button>`;
}

function stayCard(data, stay, tags, options = {}) {
  const room = roomOf(data, stay.roomId);
  const tagHtml = tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join("");
  const note = stay.notes ? `<p class="note">${esc(stay.notes)}</p>` : "";
  const color = safeColor(room.color);
  const cancelled = stay.status === "cancelled" ? " cancelled-card" : "";
  const thread = options.showThread && tags.includes("Arrives") ? threadLink(stay) : "";
  return `<article class="stay${cancelled}" style="border-left-color:${color};background:color-mix(in srgb, ${color} 14%, var(--card))">
    <header><strong>${esc(stay.guest)}</strong>${badge(data, stay.platform)}${roomName(room)}</header>
    <p>${staySpan(stay)} · ${esc(party(stay))}</p>
    <p class="money">Stated ${pendingOr(stay.statedAmount)} · Gross ${pendingOr(stay.gross)} · Fees ${pendingOr(stay.fees)} · Net ${pendingOr(stay.net)}</p>
    ${tags.includes("Arrives") ? `<p><strong>Check-in time:</strong> ${esc(stay.arrivalTime || "unknown")} · <strong>Driving / parking:</strong> ${esc(stay.driving || "unknown")} · <strong>Contact:</strong> ${esc(stay.contactChannel || "unknown")} · <strong>Phone on file:</strong> ${esc(stay.phoneOnFile || "unknown")}</p>` : ""}
    ${thread}
    <p class="tags">${tagHtml}</p>
    ${note}
    ${stayNoteBox(stay)}
  </article>`;
}

function tagsFor(stay, iso, today) {
  const tags = [];
  if (stay.checkIn === iso) tags.push("Arrives");
  if (stay.checkOut === iso) tags.push("Departs");
  if (isOccupied(stay, iso)) tags.push("In house tonight");
  if (iso === today && stay.presentUntilCheckout && !stay.checkIn && stay.checkOut && iso < stay.checkOut) {
    tags.push("In house · check-in pending");
  }
  return tags;
}

function threadShots(entry, group, large) {
  return (group.images || []).map((path, index) => {
    const href = threadHref(path);
    if (!href) return "";
    const label = `Enlarge ${group.label || "thread"} image ${index + 1} for ${entry.guest || "this guest"}`;
    const cls = large ? "thread-large" : "thread-thumb";
    return `<button type="button" class="${cls}" data-full="${esc(href)}" aria-label="${esc(label)}"><img src="${esc(href)}" alt=""></button>`;
  }).join("");
}

function guestThreadCard(entry, large) {
  const groups = (entry.groups || []).map((group) => {
    const shots = threadShots(entry, group, large);
    if (!shots) return "";
    const wrap = large ? shots : `<div class="thread-shots">${shots}</div>`;
    return `<div class="thread-group"><p class="note">${esc(group.label || "Thread")}</p>${wrap}</div>`;
  }).join("");
  if (!groups) return "";
  return `<article class="card thread-card"><h3>${esc(entry.guest || "Guest")}</h3>${groups}</article>`;
}

function guestThreadsHtml(data, iso) {
  const entries = (Array.isArray(data.guestThreads) ? data.guestThreads : []).filter((entry) => entry && entry.date === iso);
  const blocks = entries.map((entry) => guestThreadCard(entry, false)).join("");
  if (!blocks) return "";
  return `<h3>Guest threads</h3>${blocks}`;
}

function guestThreadsTabHtml(data) {
  const entries = (Array.isArray(data.guestThreads) ? data.guestThreads : []).filter((entry) => entry);
  if (!entries.length) return `<p class="empty">No guest threads in the data file yet.</p>`;
  const byDate = new Map();
  for (const entry of entries) {
    const date = entry.date || "";
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(entry);
  }
  const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));
  return dates.map((date) => {
    const heading = date ? formatPretty(date) : "Date pending";
    const cards = byDate.get(date).map((entry) => guestThreadCard(entry, true)).join("");
    return `<section class="thread-day"><h3>${esc(heading)}</h3>${cards}</section>`;
  }).join("");
}

function viewThreadsButton(data) {
  const entries = Array.isArray(data.guestThreads) ? data.guestThreads : [];
  if (!entries.length) return "";
  return `<button type="button" class="btn view-threads" data-tab="threads">View guest threads</button>`;
}

function rosterHtml(data, roster, iso, today, options = {}) {
  return roster.map((lane) => {
    const seen = new Set();
    const guests = [];
    for (const stay of [...lane.occupied, ...lane.arriving, ...lane.departing, ...lane.presentIncomplete]) {
      if (seen.has(stay.id)) continue;
      seen.add(stay.id);
      guests.push(stay);
    }
    const sameDay = lane.arriving.length > 0 && lane.departing.length > 0;
    const guestHtml = guests.length
      ? guests.map((stay) => stayCard(data, stay, tagsFor(stay, iso, today), options)).join("")
      : `<p class="empty">Open</p>`;
    const cancelled = lane.cancelled.map((stay) => `<p class="cancelled">${esc(stay.guest)} cancelled · ${staySpan(stay)}</p>`).join("");
    const flag = sameDay ? `<p class="same">Same-day turnover</p>` : "";
    return `<section class="lane">${roomName(lane.room)}${flag}${guestHtml}${cancelled}</section>`;
  }).join("");
}

function calendarHtml(data, view, selected) {
  const { start, end } = data.meta.calendar;
  const months = monthsInRange(start, end).map(({ year, month }) => {
    const label = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" })
      .format(new Date(Date.UTC(year, month - 1, 1)));
    const cells = monthCells(year, month, start, end).map((cell) => {
      if (!cell) return `<span class="day pad"></span>`;
      if (!cell.inRange) return `<span class="day out"><span class="num">${cell.day}</span></span>`;
      const lanes = dayRoster(data, cell.iso, view.today);
      const occupiedRooms = lanes.filter((lane) => lane.occupied.length).map((lane) => lane.room);
      const hollowRooms = lanes
        .filter((lane) => !lane.occupied.length && (lane.arriving.length || lane.presentIncomplete.length))
        .map((lane) => lane.room);
      const turnover = lanes.some((lane) => lane.arriving.length && lane.departing.length);
      const conflict = lanes.some((lane) => lane.occupied.length > 1);
      const names = lanes.flatMap((lane) => [...lane.occupied, ...lane.presentIncomplete, ...lane.arriving].map((stay) => `${stay.guest} ${lane.room.name}`));
      const priceBits = (data.rooms || []).map((room) => {
        const prices = nightPrices(data, room, cell.iso);
        return `${room.name} Airbnb ${priceText(prices.airbnb)}, Booking ${priceText(prices.booking)}, Agoda ${priceText(prices.agoda)}`;
      });
      const openRequest = (state.priceIssues || []).some((request) => request.start <= cell.iso && cell.iso <= request.end);
      const labelText = `${formatPretty(cell.iso)}. ${names.length ? [...new Set(names)].join(", ") : "No occupied rooms"}${turnover ? ". Same-day turnover" : ""}. ${priceBits.join(". ")}`;
      const bars = [
        ...occupiedRooms.map((room) => `<i style="background:${safeColor(room.color)}"></i>`),
        ...hollowRooms.map((room) => `<i class="hollow" style="color:${safeColor(room.color)}"></i>`),
      ].join("");
      const classes = [
        "day",
        cell.iso === view.today ? "is-today" : "",
        cell.iso === selected ? "is-selected" : "",
        turnover ? "is-turnover" : "",
        conflict ? "is-conflict" : "",
        openRequest ? "has-price-request" : "",
      ].filter(Boolean).join(" ");
      return `<button type="button" class="${classes}" data-date="${cell.iso}" aria-pressed="${cell.iso === selected}" aria-label="${esc(labelText)}">
        <span class="num">${cell.day}</span>
        ${turnover ? `<span class="mark" aria-hidden="true">↔</span>` : ""}
        <span class="bars">${bars}</span>
      </button>`;
    }).join("");
    return `<div class="month"><h3>${esc(label)}</h3><div class="weekdays"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div><div class="week">${cells}</div></div>`;
  }).join("");
  return months;
}

function guestCountLabel(info) {
  if (!info || info.occupancy === null || info.occupancy === undefined || info.occupancy === "") return "guest count not shown";
  const guests = Number(info.occupancy);
  if (!Number.isFinite(guests) || guests <= 0) return "guest count not shown";
  return `${guests} guest${guests === 1 ? "" : "s"}`;
}

function rateBasisLine(data, room) {
  const info = pricePlatformInfo(data, "booking", priceRoomKey(room));
  if (!info) return `<p class="note">Booking.com not read for this room.</p>`;
  const when = checkedLabel(info);
  const product = info.product ? `${info.product}, ` : "";
  const plan = info.ratePlan || "rate plan not stored";
  return `<p class="note">Booking.com ${esc(product)}${esc(plan)} · ${esc(guestCountLabel(info))} · ${esc(info.currency || "USD")} · ${esc(coverageLabel(info))}${when ? ` · checked ${esc(when)}` : ""}. Host-calendar rate, not a guest all-in price.</p>`;
}

function airbnbBasisLine(data, room, iso) {
  const info = pricePlatformInfo(data, "airbnb", priceRoomKey(room));
  if (!info) return `<p class="note">Airbnb not read for this room.</p>`;
  const when = checkedLabel(info);
  const money = info.currencyVerified ? esc(info.currency || "USD") : "$ shown; USD inferred, not verified";
  const unknown = info.unknownDates?.[iso];
  const price = nightPrices(data, room, iso).airbnb;
  const thisNight = price != null ? "" : unknown?.reason ? ` This night: ${unknown.reason}` : " This night has no stored Airbnb price.";
  return `<p class="note">Airbnb calendar cell · ${esc(guestCountLabel(info))} · pricing model not identified · ${money} · ${esc(coverageLabel(info))}${when ? ` · checked ${esc(when)}` : ""}. Not a guest all-in quote.${esc(thisNight)}</p>`;
}

function nightlyPricesHtml(data, iso) {
  const parts = dayHeadParts(iso, "");
  const cards = (data.rooms || []).map((room) => {
    const prices = nightPrices(data, room, iso);
    return `<article class="price-room" style="border-top:4px solid ${safeColor(room.color)}">
      <strong>${esc(room.name)}</strong>
      ${airbnbBasisLine(data, room, iso)}
      ${rateBasisLine(data, room)}
      <p>Airbnb ${esc(priceText(prices.airbnb))}</p>
      <p>Booking.com ${esc(priceText(prices.booking))}</p>
      <p>Agoda ${esc(priceText(prices.agoda))}</p>
    </article>`;
  }).join("");
  return `<h3>Nightly prices</h3><p class="note" data-price-date="${esc(iso)}">${esc(parts.label)}. A dash means no verified price for that platform. It is not $0. A stored rate can show on a closed night and is not a guest all-in quote.</p><div class="price-board">${cards}</div>`;
}

function priceFormHtml(data, selected) {
  const rooms = (data.rooms || []).map((room) => `<option value="${esc(room.id)}">${esc(room.name)}</option>`).join("");
  const checks = (data.platforms || []).map((platform) => `<label><input type="checkbox" name="platform" value="${esc(platform.id)}" checked> ${esc(platform.short || platform.label)}</label>`).join("");
  return `<form class="price-form" id="price-form">
    <h3>Change price</h3>
    <label>Room<select name="room">${rooms}</select></label>
    <label>Start<input type="date" name="start" value="${esc(selected)}" required></label>
    <label>End<input type="date" name="end" value="${esc(selected)}" required></label>
    <label>New price<input type="number" name="price" min="0" step="0.01" inputmode="decimal" required></label>
    <fieldset class="price-checks"><legend>Platforms</legend>${checks}</fieldset>
    <p class="note">This site is public. Don't add door codes, Wi-Fi passwords, card numbers, phone numbers, emails, reservation numbers, or payout batch ids.</p>
    <button type="submit" class="btn" style="background:#93c5fd;color:#0f172a;flex:none;display:inline-block">Change price</button>
    <p class="price-error" hidden></p>
  </form>`;
}

function openPriceHtml(requests, iso) {
  if (!requests.length) return `<h3>Open price requests</h3><p class="empty">No open price requests.</p>`;
  const items = requests.map((request) => {
    const covers = request.start <= iso && iso <= request.end ? " · covers this date" : "";
    const link = request.url ? ` · <a href="${esc(request.url)}">issue ${esc(request.number || "")}</a>` : "";
    return `<li class="card">Room ${esc(request.roomNumber)} · ${esc(request.start)}–${esc(request.end)} · ${esc(request.price)} · ${esc(request.platforms)}${esc(covers)}${link}</li>`;
  }).join("");
  return `<h3>Open price requests</h3><ul class="list">${items}</ul>`;
}

function detailHtml(data, iso, today) {
  const lanes = dayRoster(data, iso, today);
  return `<div class="detail" id="day-detail"><h3>${esc(formatPretty(iso))}</h3>${rosterHtml(data, lanes, iso, today)}</div>`;
}

function cancellationsHtml(data) {
  const rows = data.stays.filter((stay) => stay.status === "cancelled");
  if (!rows.length) return `<p class="empty">No cancellations logged.</p>`;
  return rows.map((stay) => {
    const room = stay.roomId ? roomOf(data, stay.roomId) : null;
    return `<article class="stay cancelled-card">
      <header><strong>${esc(stay.guest)}</strong>${badge(data, stay.platform)}${room ? roomName(room) : `<span class="pending">Room pending</span>`}</header>
      <p>${staySpan(stay)}</p>
      <p class="note">${esc(stay.notes || "Cancelled.")}</p>
      ${stayNoteBox(stay)}
    </article>`;
  }).join("");
}

function turnoverHtml(data, events, today) {
  const upcoming = events.filter((event) => event.date >= today);
  const earlier = events.filter((event) => event.date < today);
  const item = (event) => {
    const out = event.departing.map((stay) => esc(stay.guest)).join(", ");
    const inn = event.arriving.length ? event.arriving.map((stay) => esc(stay.guest)).join(", ") : `<span class="pending">nobody in</span>`;
    return `<li class="card turnover">
      <div><strong>${esc(formatShort(event.date))}</strong> ${roomName(event.room)} ${event.sameDay ? `<span class="same-pill">Same-day</span>` : `<span class="gap-pill">Checkout</span>`}</div>
      <p>${out} out · ${inn} in</p>
    </li>`;
  };
  const upcomingHtml = upcoming.length ? `<ul class="list">${upcoming.map(item).join("")}</ul>` : `<p class="empty">No turnovers left in this calendar.</p>`;
  const earlierHtml = earlier.length ? `<details><summary>Earlier turnovers (${earlier.length})</summary><ul class="list">${earlier.map(item).join("")}</ul></details>` : "";
  return upcomingHtml + earlierHtml;
}

function summaryRevenueHtml(data, today) {
  const periods = data.revenueSummary?.periods;
  if (!periods) return "";
  const financialWhen = financialAsOfLabel(data);
  return REVENUE_PERIODS.map(([key, label]) => {
    if (!periodIsCurrent(data, today, key)) {
      return `<article class="card period">
        <h3>${esc(label)}</h3>
        <p class="card-gross">${pendingOr(null)} <span>gross</span></p>
        <p class="card-net">${pendingOr(null)} <span>net</span></p>
        <p class="note">Not verified for ${esc(formatShort(today))}. Financial figures remain as of ${esc(financialWhen)}.</p>
      </article>`;
    }
    const period = periods[key] || {};
    const start = period.start ? formatShort(String(period.start).slice(0, 10)) : "";
    const end = period.end ? formatShort(String(period.end).slice(0, 10)) : "";
    const since = key === "ytd" ? occupancySinceBookings(data, today) : null;
    const fromDaily = since ? null : occupancyWindow(data, period.start, period.end);
    const counted = since || fromDaily;
    const occ = counted?.pct != null ? counted.pct : fractionPercent(period.occupancy);
    const sinceLabel = since?.start ? ` since ${formatShort(since.start)}` : "";
    const nights = Number.isFinite(Number(period.nights)) ? Number(period.nights) : null;
    const available = Number.isFinite(Number(period.availableNights)) ? Number(period.availableNights) : null;
    const nightLine = counted
      ? `${counted.occupied} / ${counted.available} room-nights`
      : (nights == null ? "" : (available == null ? `${nights} night${nights === 1 ? "" : "s"}` : `${Math.min(nights, available)} / ${available} room-nights`));
    const occText = occ == null ? "" : `Occupancy ${occ.toFixed(1)}%${sinceLabel}`;
    const platformLines = (data.platforms || []).map((platform) => {
      const row = period.byPlatform?.[platform.id];
      if (!row) return "";
      return `<div class="kpi-plat">${esc(platform.short || platform.label)} ${pendingOr(row.gross)} <span>gross</span> · ${pendingOr(row.net)} <span>net</span>${Number.isFinite(Number(row.nights)) ? ` · ${row.nights} nights` : ""}</div>`;
    }).join("");
    const roomLines = (data.rooms || []).map((room) => {
      const row = period.byRoom?.[room.id];
      if (!row) return "";
      return `<div class="kpi-plat">${roomName(room)} ${pendingOr(row.net)} <span>net</span>${Number.isFinite(Number(row.nights)) ? ` · ${row.nights} nights` : ""}</div>`;
    }).join("");
    const checkIn = (key === "today" || key === "yesterday") && data.revenueSummary?.checkInBasis?.[key];
    return `<article class="card period">
      <h3>${esc(label)}</h3>
      ${start && end ? `<p class="range">${esc(start)} – ${esc(end)}</p>` : ""}
      ${period.grossBookingOnly ? `<p class="note">Booking.com only; Airbnb gross pending</p>` : ""}
      <p class="card-gross">${pendingOr(period.gross)} <span>gross</span></p>
      <p class="card-net">${pendingOr(period.net)} <span>net</span></p>
      ${occText || nightLine ? `<p class="occ">${esc([occText, nightLine].filter(Boolean).join(" · "))}</p>` : ""}
      <p class="note">ADR ${pendingOr(period.adr)} · net ADR ${pendingOr(period.netAdr)}${checkIn ? " · full stay on the check-in date" : ""}${key === "lastMonth" && revenueAsOfDay(data) !== today ? ` · as of ${esc(financialWhen)}` : ""}</p>
      ${platformLines}
      ${roomLines}
    </article>`;
  }).join("");
}

function periodHtml(data, period) {
  const withholdMoney = String(period.end || "") > revenueAsOfDay(data);
  const excluded = period.excluded.length
    ? `<p class="note">Not counted, dates incomplete: ${period.excluded.map((stay) => esc(stay.guest)).join(", ")}.</p>`
    : `<p class="note">Every confirmed stay touching this window has both dates.</p>`;
  const meters = period.roomStats.map((stat) => {
    const width = stat.available ? Math.min(100, (stat.confirmed / stat.available) * 100) : 0;
    return `<div class="meter"><span>${roomName(stat.room)}</span><div class="track"><div class="fill" style="width:${width}%;background:${safeColor(stat.room.color)}"></div></div><span>${stat.confirmed}/${stat.available}</span></div>`;
  }).join("");
  const body = period.rows.map((row) => `<tr>
    <td>${badge(data, row.platform.id)}</td>
    <td>${roomName(row.room)}</td>
    <td>${row.nights}</td>
    <td>${withholdMoney ? pendingOr(null) : pendingOr(row.gross)}</td>
    <td>${withholdMoney ? pendingOr(null) : pendingOr(row.fees)}</td>
    <td>${withholdMoney ? pendingOr(null) : pendingOr(row.net)}</td>
    <td>${withholdMoney ? pendingOr(null) : pendingOr(row.adr)}</td>
  </tr>`).join("");
  const stated = period.stated.length
    ? `<ul class="stated">${period.stated.map(({ stay, whollyInside }) => {
      const scope = whollyInside ? "whole stay falls in this window" : "whole-stay figure, nights also fall outside this window";
      return `<li>${esc(stay.guest)} · ${roomName(roomOf(data, stay.roomId))} · ${badge(data, stay.platform)} · ${esc(money(stay.statedAmount))} · ${esc(scope)}. Not entered as gross.</li>`;
    }).join("")}</ul>`
    : `<p class="note">No stated amounts in this window.</p>`;
  return `<article class="card period">
    <h3>${esc(period.label)}</h3>
    <p class="range">${esc(formatShort(period.start))} – ${esc(formatShort(period.end))}</p>
    <p class="occ"><strong>${period.confirmed} / ${period.available}</strong> room-nights on file · ${percent(period.confirmed, period.available)} of the calendar on file</p>
    ${withholdMoney ? `<p class="note">Dollar totals are withheld. Amounts on file were checked ${esc(financialAsOfLabel(data))}, and this window runs past that check.</p>` : ""}
    ${meters}
    ${excluded}
    <div class="table-wrap"><table>
      <tr><th>Platform</th><th>Room</th><th>Nights</th><th>Gross</th><th>Fees</th><th>Net</th><th>ADR</th></tr>
      ${body}
    </table></div>
    <h4>Stated amounts</h4>
    ${stated}
  </article>`;
}

function payoutHtml(data) {
  if (!data.payouts.length) return "";
  return data.payouts.map((payout) => {
    return `<p class="callout">${badge(data, payout.platform)} payout ${esc(money(payout.amount))} · ${esc(payout.state)}. ${esc(payout.note)} It is not added to gross, fees, or net.</p>`;
  }).join("");
}

function chatsHtml(data) {
  if (!data.chats.length) return `<p class="empty">No guest chats logged at the last check.</p>`;
  return data.chats.map((chat) => `<article class="card chat">
    <header><strong>${esc(chat.guest || "Guest")}</strong>${badge(data, chat.platform)}<time>${esc(chat.at ? formatChecked(chat.at) : "time pending")}</time></header>
    <p>${esc(chat.summary || "")}</p>
  </article>`).join("");
}

function healthHtml(data) {
  return data.accountHealth.map((item) => `<article class="card health ${item.level === "attention" ? "is-attention" : "is-clear"}">
    <header>${badge(data, item.platform)}<span class="${item.level === "attention" ? "pending" : "good"}">${item.level === "attention" ? "Needs attention" : "Clear"}</span></header>
    <p>${esc(item.summary)}</p>
  </article>`).join("");
}

function decisionsHtml(data, matches) {
  const open = data.decisions.filter((d) => d.status !== "done");
  const done = data.decisions.filter((d) => d.status === "done");
  const resolved = done.length
    ? `<details><summary>Resolved (${done.length})</summary><ul class="list">${done.map((d) => `<li class="card"><strong class="good">✓ ${esc(d.title)}</strong><p class="note">${esc(d.detail)}</p></li>`).join("")}</ul></details>`
    : "";
  return (open.length ? openDecisionsHtml(open, matches) : `<p class="empty">No open decisions.</p>`) + resolved;
}

function openDecisionsHtml(decisions, matches) {
  return decisions.map((decision) => {
    const found = matches.get(decision.id) || [];
    const recorded = found.length
      ? `<ul class="choice">${found.map((issue) => `<li>${esc(issue.choice)} recorded${issue.url ? ` · <a href="${esc(issue.url)}">issue ${esc(issue.number || "")}</a>` : ""}</li>`).join("")}</ul>`
      : `<p class="note">No open issue for this decision yet.</p>`;
    return `<article class="card decision">
      <h3>${esc(decision.title)}</h3>
      <p>${esc(decision.detail)}</p>
      ${recorded}
      <label style="display:block;margin-top:10px;font-size:13px;font-weight:700">Message about this decision
        <textarea class="decision-note" rows="3" style="display:block;width:100%;box-sizing:border-box;margin-top:6px;font:inherit;padding:8px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink)"></textarea>
      </label>
      <p class="note">This site is public. Don't add door codes, Wi-Fi passwords, card numbers, phone numbers, emails, reservation numbers, or payout batch ids.</p>
      <div class="actions">
        <a class="btn approve" href="${esc(decisionUrl(decision, "APPROVE"))}" target="_blank" rel="noopener noreferrer">Approve</a>
        <a class="btn skip" href="${esc(decisionUrl(decision, "SKIP"))}" target="_blank" rel="noopener noreferrer">Skip</a>
        <button type="button" class="btn note-send" data-decision-id="${esc(decision.id)}" style="background:#93c5fd;color:#0f172a">Send note</button>
      </div>
    </article>`;
  }).join("");
}

function changelogHtml(data) {
  const rows = [...(data.changelog || [])].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  if (!rows.length) return `<p class="empty">No changes logged.</p>`;
  return `<ul class="list">${rows.map((row) => `<li class="card log"><strong>${esc(formatChecked(row.at))}</strong><p>${esc(row.note)}</p></li>`).join("")}</ul>`;
}

function laterHtml(data) {
  const end = formatShort(data.meta.calendar.end);
  const totals = platformTotals(data).map((item) => {
    const rooms = item.byRoom.map((row) => `${esc(row.room.name)} ${row.count}`).join(" · ");
    const cancelled = item.cancelled ? `<span class="pending">${item.cancelled} cancelled</span>` : "";
    return `<li><strong>${esc(item.platform.label)} ${item.confirmed} confirmed</strong> · ${rooms}${cancelled ? ` · ${cancelled}` : ""}</li>`;
  }).join("");
  const later = staysAfterCalendar(data);
  const cards = later.length
    ? later.map((stay) => {
      const tags = [];
      if (stay.status === "cancelled") tags.push("Cancelled");
      tags.push(stay.checkIn && stay.checkIn > data.meta.calendar.end ? "After the calendar" : "Continues past the calendar");
      return stayCard(data, stay, tags);
    }).join("")
    : `<p class="empty">No stays after ${esc(end)}.</p>`;
  return `<h3>Stays on the books</h3>
    <ul class="stated">${totals}</ul>
    <p class="note">Confirmed totals leave cancelled stays out. Cancelled counts are labeled separately. Stays after ${esc(end)} are included.</p>
    <h3 id="later">Later</h3>
    <p class="occ">${later.length} stays</p>
    <p class="note">These stays have a check-in or a night after ${esc(end)}, so the grid above does not show the whole stay. Cancelled stays are included.</p>
    ${cards}`;
}

function gapsHtml(data) {
  const gaps = data.stays.filter((stay) => stay.status !== "cancelled" && (!stay.checkIn || !stay.checkOut));
  if (!gaps.length) return "";
  return `<div class="gaps"><h3>Dates still open</h3><ul>${gaps.map((stay) => {
    const room = stay.roomId ? roomOf(data, stay.roomId).name : "Room pending";
    return `<li>${esc(stay.guest)} · ${esc(room)} · ${staySpan(stay)}</li>`;
  }).join("")}</ul></div>`;
}

const REVENUE_PERIODS = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["last7", "Last 7 days"],
  ["mtd", "MTD"],
  ["last30", "Last 30 days"],
  ["lastMonth", "Last month"],
  ["ytd", "YTD"],
  ["next30", "Next 30 days (booked)"],
];

function windowFor(today, key) {
  if (key === "today") return { start: today, end: today };
  if (key === "yesterday") { const y = fmtDate(addDays(parseDate(today), -1)); return { start: y, end: y }; }
  if (key === "last7") return { start: fmtDate(addDays(parseDate(today), -6)), end: today };
  if (key === "mtd") return monthToDate(today);
  if (key === "last30") return { start: fmtDate(addDays(parseDate(today), -29)), end: today };
  if (key === "lastMonth") {
    const [y, m] = today.split("-").map(Number);
    const start = fmtDate(new Date(y, m - 2, 1));
    const end = fmtDate(new Date(y, m - 1, 0));
    return { start, end };
  }
  if (key === "ytd") return { start: `${today.slice(0, 4)}-01-01`, end: today };
  if (key === "next30") return { start: nextDay(today), end: fmtDate(addDays(parseDate(today), 30)) };
  return null;
}

function revenueAsOfDay(data) {
  return String(data.meta?.financialAsOf || data.revenueSummary?.asOf || "").slice(0, 10);
}

function financialAsOfLabel(data) {
  const raw = data.meta?.financialAsOf || data.revenueSummary?.asOf || data.meta?.lastChecked || "";
  return raw ? formatChecked(raw) : "the last financial check";
}

function opsAsOfLabel(data) {
  const raw = data.meta?.opsAsOf || "";
  return raw ? formatChecked(raw) : "";
}

function periodIsCurrent(data, today, key) {
  const asOf = revenueAsOfDay(data);
  const expected = windowFor(today, key);
  if (!asOf || !expected) return false;
  const period = data.revenueSummary?.periods?.[key] || {};
  if (period.start && period.end) {
    const start = String(period.start).slice(0, 10);
    const end = String(period.end).slice(0, 10);
    if (start !== expected.start || end !== expected.end) return false;
    if (key === "lastMonth") return end <= asOf;
    return asOf === today;
  }
  if (key !== "today" && key !== "yesterday") return false;
  const stamped = String(data.revenueSummary?.checkInBasis?.[key]?.date || "");
  const want = key === "today" ? today : fmtDate(addDays(parseDate(today), -1));
  return Boolean(stamped) && stamped === want && asOf === today;
}

function ringGauge(label, percent, caption, amber) {
  const radius = 46;
  const circ = 2 * Math.PI * radius;
  const known = Number.isFinite(percent);
  const clamped = known ? Math.max(0, Math.min(100, percent)) : 0;
  const offset = circ * (1 - clamped / 100);
  return `<figure class="gauge${amber ? " amber" : ""}">
    <svg viewBox="0 0 120 120" role="img" aria-label="${esc(label)} ${known ? `${clamped.toFixed(0)} percent` : "pending"}">
      <circle class="gauge-track" cx="60" cy="60" r="46"></circle>
      <circle class="gauge-value" cx="60" cy="60" r="46" data-circ="${circ}" data-offset="${offset}" style="stroke-dasharray:${circ};stroke-dashoffset:${circ}"></circle>
      <text class="gauge-num" x="60" y="58" text-anchor="middle">${known ? "0%" : "—"}</text>
      <text class="gauge-sub" x="60" y="74" text-anchor="middle">${esc(label)}</text>
    </svg>
    <figcaption>${esc(caption)}</figcaption>
  </figure>`;
}

function kpiMoney(value) {
  if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return pendingOr(null);
  return `<span class="count" data-count="${Number(value)}" data-money="1">${esc(money(0))}</span>`;
}

function asOfDate(data, today) {
  return String(data.revenueSummary?.asOf || today || "").slice(0, 10);
}

function dailyRows(data) {
  return (data.revenueSummary?.daily || []).filter((row) => row && row.date);
}

function bookingsStart(data) {
  const dates = dailyRows(data).map((row) => row.date).sort();
  return dates[0] || null;
}

function fractionPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const pct = number <= 1.5 ? number * 100 : number;
  return Math.max(0, Math.min(100, pct));
}

function roomIds(data) {
  const ids = (data.rooms || []).map((room) => room.id).filter(Boolean);
  return ids.length ? ids : ["room-1", "room-2", "room-3"];
}

function uniqueRoomsOnRow(row, ids) {
  const bucket = row.byRoom || {};
  const marked = ids.filter((id) => {
    const value = Number(bucket[id]);
    return Number.isFinite(value) && value !== 0;
  }).length;
  if (marked) return Math.min(marked, ids.length);
  const nights = Number(row.nights);
  if (!Number.isFinite(nights) || nights <= 0) return 0;
  return Math.min(nights, ids.length);
}

function occupancyWindow(data, start, end) {
  start = String(start || "").slice(0, 10);
  end = String(end || "").slice(0, 10);
  if (!start || !end || start > end) return null;
  const ids = roomIds(data);
  const rows = dailyRows(data).filter((row) => row.date >= start && row.date <= end);
  const expected = eachDate(start, end).length;
  if (!rows.length || rows.length !== expected) return null;
  const occupied = rows.reduce((sum, row) => sum + uniqueRoomsOnRow(row, ids), 0);
  const available = rows.length * ids.length;
  return { start, end, occupied, available, pct: available ? Math.min(100, (occupied / available) * 100) : null };
}

function occupancySinceBookings(data, today) {
  const start = bookingsStart(data);
  const end = asOfDate(data, today);
  if (!start || !end) return null;
  const span = occupancyWindow(data, start, end);
  return span ? { ...span, start } : null;
}

function kpiExtra(data, today, key) {
  const period = data.revenueSummary?.periods?.[key] || {};
  const storedAdr = period.adr;
  const gross = period.gross;
  const range = windowFor(today, key);
  const report = range ? periodReport(data, range, key) : null;
  const adr = storedAdr !== null && storedAdr !== undefined && Number.isFinite(Number(storedAdr))
    ? Number(storedAdr)
    : (gross === null || gross === undefined || !report?.confirmed ? null : Number(gross) / report.confirmed);
  if (key === "ytd") {
    const since = occupancySinceBookings(data, today);
    const occHtml = since?.pct == null ? pendingOr(null) : `<span class="count" data-count="${since.pct.toFixed(1)}" data-suffix="%">0%</span>`;
    const sinceLabel = since?.start ? ` since ${formatShort(since.start)}` : "";
    return `<p class="kpi-extra">Occupancy ${occHtml}${esc(sinceLabel)} · ADR ${pendingOr(adr)}</p>`;
  }
  if (key !== "mtd" && key !== "next30") return "";
  const fromDaily = occupancyWindow(data, period.start, period.end);
  const storedOcc = fractionPercent(period.occupancy);
  const recounted = report?.available ? Math.min(100, (report.confirmed / report.available) * 100) : null;
  const occ = fromDaily?.pct ?? storedOcc ?? recounted;
  const occHtml = occ === null ? pendingOr(null) : `<span class="count" data-count="${occ.toFixed(1)}" data-suffix="%">0%</span>`;
  return `<p class="kpi-extra">Occupancy ${occHtml} · ADR ${pendingOr(adr)}</p>`;
}

function revenueChart(data) {
  const daily = Array.isArray(data.revenueSummary?.daily) ? data.revenueSummary.daily : [];
  const points = daily.filter((row) => Number.isFinite(Number(row?.net)));
  if (!points.length) {
    return `<div class="chart-card"><div class="card-label">Daily net, last 30 days</div><p class="empty">Pending until daily revenue is filled in.</p></div>`;
  }
  const max = Math.max(...points.map((row) => Number(row.net)), 1);
  const bars = points.slice(-30).map((row, index, list) => {
    const height = Math.max(2, (Number(row.net) / max) * 70);
    const width = 100 / list.length;
    return `<rect class="bar" x="${index * width}" y="${80 - height}" width="${Math.max(width - 0.4, 0.2)}" height="${height}" rx="1"><title>${esc(row.date)}: net ${esc(money(row.net) || "")}</title></rect>`;
  }).join("");
  return `<div class="chart-card"><div class="card-label">Daily net, last 30 days</div><svg viewBox="0 0 100 84" preserveAspectRatio="none" role="img" aria-label="Daily net, last 30 days">${bars}</svg></div>`;
}

function occupancyChart(data, today) {
  const range = { start: fmtDate(addDays(parseDate(today), -29)), end: today };
  const bars = (data.rooms || []).map((room) => {
    const nights = data.stays.filter((stay) => stay.roomId === room.id && stay.status !== "cancelled")
      .reduce((count, stay) => count + nightsOverlapping(stay, range.start, range.end).length, 0);
    const width = Math.round((nights / 30) * 100);
    return `<div class="meter"><span>${roomName(room)}</span><div class="track"><div class="fill" style="width:${width}%;background:${safeColor(room.color)}"></div></div><span>${nights}/30</span></div>`;
  }).join("");
  return `<div class="chart-card"><div class="card-label">Occupancy by room, last 30 nights</div>${bars}</div>`;
}

function signPills(data) {
  const signIn = data.signIn || {};
  return (data.platforms || []).map((platform) => {
    const raw = signIn[platform.id];
    const record = raw && typeof raw === "object" ? raw : null;
    const state = String(record ? record.state || "" : raw ?? "").trim().toLowerCase();
    const at = record?.at || (!record ? signIn.asOf : "") || "";
    const when = at ? formatChecked(at) : "";
    const signedOut = raw === false || state === "signed out";
    const reverify = state.includes("re-verify") || state.includes("reverify");
    const verified = raw === true || state === "signed in" || state === "verified" || state === "signed_in";
    let cls = "";
    let text = "Verification time pending";
    if (reverify) text = when ? `Needs re-verify · ${when}` : "Needs re-verify";
    else if (signedOut) {
      cls = "bad";
      text = when ? `Signed out · ${when}` : "Signed out";
    } else if (verified && when) {
      cls = "ok";
      text = `Verified ${when}`;
    } else if (state && when) text = `${state.charAt(0).toUpperCase()}${state.slice(1)} ${when}`;
    else if (when) text = `Last checked ${when}`;
    return `<span class="pill ${cls}"><i></i>${esc(platform.short || platform.label)} ${esc(text)}</span>`;
  }).join("");
}

function bookingCoverageHtml(data) {
  const row = data.bookingCoverage;
  if (!row) return "";
  const when = row.checkedAt ? formatChecked(row.checkedAt) : "time pending";
  const days = Array.isArray(row.days) ? row.days : [];
  const dayLines = days.map((day) => {
    const label = formatShort(String(day.date || "").slice(0, 10));
    const payment = day.payment == null ? "payment pending" : money(day.payment);
    const commission = day.commission == null ? "commission pending" : money(day.commission);
    const after = day.afterCommission == null ? "pending" : money(day.afterCommission);
    const count = Number.isFinite(Number(day.okReservations)) ? `${day.okReservations} OK · ` : "";
    const who = day.guests ? ` ${esc(day.guests)}` : "";
    return `<li><strong>Check-in ${esc(label)}</strong> · ${esc(count)}Booking.com only, full stay on the check-in date. ${esc(payment)} total stay payment · ${esc(commission)} commission · ${esc(after)} payment minus commission. Not a payout.${who}</li>`;
  }).join("");
  return `<section class="callout">
    <h3>Verified Booking.com only</h3>
    <p>Checked ${esc(when)}. ${esc(row.okReservations)} OK reservations across all three rooms, check-in on Nov 6 or Nov 7 only. Not an all-platform total.</p>
    ${dayLines ? `<ul class="list">${dayLines}</ul>` : `<p class="note">Payment and commission subtotals are not on this page yet.</p>`}
    <p class="note">The Jan 2026 through Dec 2027 download did not finish. A screen figure of 293 counts every status and is not a confirmed count. Yesterday and the older windows stay dated Nov 3.</p>
  </section>`;
}

function kpiHtml(data, today) {
  const summary = data.revenueSummary || {};
  const periods = summary.periods || {};
  const financialWhen = financialAsOfLabel(data);
  const cards = REVENUE_PERIODS.map(([key, label]) => {
    if (!periodIsCurrent(data, today, key)) {
      const day = key === "yesterday" ? formatShort(fmtDate(addDays(parseDate(today), -1))) : formatShort(today);
      const why = key === "yesterday"
        ? `Not verified for ${day}. The Nov 3 check-in figure is not this day.`
        : key === "today"
          ? `All-platform total not verified for ${day}. Booking.com only is listed above.`
          : `Not verified for ${day}. Older figures remain as of ${financialWhen}.`;
      return `<article class="kpi-card">
        <div class="card-label">${esc(label)}</div>
        <div class="card-gross">${pendingOr(null)} <span>gross</span></div>
        <div class="card-net">${pendingOr(null)} <span>net</span></div>
        <p class="note">${esc(why)}</p>
      </article>`;
    }
    const checkIn = (key === "today" || key === "yesterday") ? summary.checkInBasis?.[key] : null;
    const period = checkIn || periods[key] || {};
    const byPlatform = period.byPlatform || {};
    const lines = checkIn && !period.byPlatform ? "" : (data.platforms || []).map((platform) => {
      const row = byPlatform[platform.id] || {};
      return `<div class="kpi-plat">${esc(platform.short || platform.label)} ${pendingOr(row.gross)} <span>gross</span> · ${pendingOr(row.net)} <span>net</span></div>`;
    }).join("");
    const checkIns = Number(period.checkIns);
    const dated = key === "lastMonth" && revenueAsOfDay(data) !== today ? `<p class="note">As of ${esc(financialWhen)}</p>` : "";
    const checkInLine = checkIn
      ? `<p class="kpi-extra">${Number.isFinite(checkIns) ? `${checkIns} check-in${checkIns === 1 ? "" : "s"}` : pendingOr(null)}</p><p class="note">Full stay on the check-in date</p>`
      : kpiExtra(data, today, key);
    return `<article class="kpi-card">
      <div class="card-label">${esc(label)}</div>
      <div class="card-gross">${kpiMoney(period.gross)} <span>gross</span></div>
      ${period.grossBookingOnly ? `<p class="note">Booking.com only; Airbnb gross pending</p>` : ""}
      <div class="card-net">${kpiMoney(period.net)} <span>net</span></div>
      ${dated}
      ${checkInLine}
      ${lines}
    </article>`;
  }).join("");
  const mtdCurrent = periodIsCurrent(data, today, "mtd");
  const mtd = periodReport(data, monthToDate(today), "mtd");
  const fromDaily = occupancyWindow(data, summary.periods?.mtd?.start, summary.periods?.mtd?.end);
  const storedMtd = fractionPercent(summary.periods?.mtd?.occupancy);
  const recounted = mtd.available ? Math.min(100, (mtd.confirmed / mtd.available) * 100) : null;
  const occ = mtdCurrent ? (fromDaily?.pct ?? storedMtd ?? recounted) : null;
  const goal = summary.mtdGoal;
  const goalNumber = Number(goal);
  const gross = mtdCurrent ? summary.periods?.mtd?.gross : null;
  const grossNumber = Number(gross);
  const goalKnown = mtdCurrent && goal !== null && goal !== undefined && goal !== "" && Number.isFinite(goalNumber) && goalNumber > 0;
  const goalPct = goalKnown && gross !== null && gross !== undefined && Number.isFinite(grossNumber) ? (grossNumber / goalNumber) * 100 : null;
  const gauges = `<div class="gauges">
      ${ringGauge("Occupancy", occ, mtdCurrent ? "Month to date" : "Not verified", false)}
      ${ringGauge("MTD vs goal", goalPct, goalKnown ? `Goal ${money(goalNumber)}` : "Not verified", true)}
    </div>`;
  return `<div class="kpi-head"><p class="kpi-note">Today and yesterday count the full stay on the check-in date. Longer windows are night-stayed. Unverified windows stay pending. Financial figures as of ${esc(financialWhen)}.</p><button type="button" class="btn skip" id="platform-toggle" style="flex:none">By platform</button></div>
    ${bookingCoverageHtml(data)}
    <div class="kpi-cards${state.showPlatforms ? " show-platforms" : ""}">${cards}</div>
    ${gauges}
    <div class="charts">
      <div class="chart-card">
        <div class="card-label">Daily net through ${esc(revenueAsOfDay(data) ? formatShort(revenueAsOfDay(data)) : "the last financial check")}</div>
        <div class="chart-tools">
          <button type="button" class="btn skip range-toggle${state.chartDays === 90 ? " is-on" : ""}" data-range="90" style="flex:none;min-height:36px">Last 90</button>
          <button type="button" class="btn skip range-toggle${state.chartDays === 120 ? " is-on" : ""}" data-range="120" style="flex:none;min-height:36px">90 + next 30</button>
        </div>
        <div class="chart-box"><canvas id="chart-revenue"></canvas></div>
      </div>
      <div class="chart-card"><div class="card-label">Net by platform</div><div class="chart-box short"><canvas id="chart-share"></canvas></div></div>
      <div class="chart-card"><div class="card-label">Net by room</div><div class="chart-box short"><canvas id="chart-rooms"></canvas></div></div>
      <div class="chart-card"><div class="card-label">Next 30 net by platform</div><div class="chart-box"><canvas id="chart-next30"></canvas></div></div>
      <div class="chart-card"><div class="card-label">Occupancy by room</div><div class="chart-box short"><canvas id="chart-occupancy"></canvas></div></div>
      <div class="chart-card"><div class="card-label">ADR trend</div><div class="chart-box"><canvas id="chart-adr"></canvas></div></div>
      <div class="chart-card"><div class="card-label">Booking lead time</div><div class="chart-box"><canvas id="chart-lead"></canvas></div></div>
    </div>`;
}

function horizonGrid(data, view, selected) {
  const days = eachDate(view.today, fmtDate(addDays(parseDate(view.today), 59)));
  const head = [`<div class="ghead corner"></div>`, ...days.map((iso, index) => {
    const parts = dayHeadParts(iso, index ? days[index - 1] : "");
    return `<div class="ghead" data-iso="${esc(iso)}"><span class="gmonth">${esc(parts.month)}${parts.year ? ` ${esc(parts.year)}` : ""}</span><span class="gday">${esc(parts.day)}</span></div>`;
  })].join("");
  const rows = (data.rooms || []).map((room) => {
    const cells = days.map((iso) => {
      const stay = data.stays.find((item) => item.roomId === room.id && isOccupied(item, iso));
      const platform = stay ? platformOf(data, stay.platform) : null;
      const prices = nightPrices(data, room, iso);
      const openRequest = (state.priceIssues || []).some((request) => request.roomNumber === priceRoomKey(room).replace("room", "") && request.start <= iso && iso <= request.end);
      const classes = ["gcell", iso === selected ? "is-selected" : "", openRequest ? "has-price-request" : ""].filter(Boolean).join(" ");
      const label = `${room.name} ${formatShort(iso)}. Airbnb ${priceText(prices.airbnb)}, Booking ${priceText(prices.booking)}, Agoda ${priceText(prices.agoda)}`;
      return `<button type="button" class="${classes}" data-date="${iso}" aria-label="${esc(label)}">
        <span class="gbar" style="background:${platform ? safeColor(platform.color) : "transparent"}"></span>
        <span class="gprices">${esc(priceText(prices.airbnb))}<br>${esc(priceText(prices.booking))}<br>${esc(priceText(prices.agoda))}</span>
      </button>`;
    }).join("");
    return `<div class="groom">${roomName(room)}</div>${cells}`;
  }).join("");
  return `<div class="gscroll" id="gscroll"><div class="ggrid" style="grid-template-columns: 92px repeat(${days.length}, 54px)">${head}${rows}</div></div>
    <p class="note">Next 60 days, ${esc(dayHeadParts(days[0], "").label)} through ${esc(dayHeadParts(days[days.length - 1], days[days.length - 2]).label)}. The bar is the booked platform. Each cell lists Airbnb, Booking.com, then Agoda. A dash means that platform was not read, not a $0 rate.</p>`;
}

function reservationList(data) {
  const filters = state.filters || { q: "", room: "", platform: "", date: "" };
  const q = filters.q.trim().toLowerCase();
  const rows = data.stays.filter((stay) => {
    if (filters.room && stay.roomId !== filters.room) return false;
    if (filters.platform && stay.platform !== filters.platform) return false;
    if (filters.date && !(stay.checkIn && stay.checkOut && stay.checkIn <= filters.date && filters.date < stay.checkOut)) return false;
    if (q && !`${stay.guest} ${stay.id}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const cards = rows.map((stay) => stayCard(data, stay, stay.status === "cancelled" ? ["Cancelled"] : [])).join("");
  return cards || `<p class="empty">No reservations match.</p>`;
}

function marketHtml(data) {
  const market = data.market || { comps: [], summary: {} };
  const comps = Array.isArray(market.comps) ? market.comps : [];
  const summary = market.summary || {};
  const rows = comps.map((comp) => {
    const price = comp.nightlyPrice == null || !Number.isFinite(Number(comp.nightlyPrice)) ? "—" : money(comp.nightlyPrice) || "—";
    const when = comp.date ? formatShort(String(comp.date).slice(0, 10)) : "date pending";
    const rating = comp.rating == null ? "—" : esc(comp.rating);
    const reviews = comp.reviews == null ? "—" : esc(comp.reviews);
    const distance = comp.distanceMi == null ? "—" : `${esc(comp.distanceMi)} mi`;
    return `<li class="card"><strong>${esc(comp.name || "Comp")}</strong> ${esc(comp.platform || "")}<p class="note">${esc(comp.type || "")} · ${distance} · ${rating} · ${reviews} reviews · ${esc(when)} · ${esc(price)}${safeHttp(comp.url) ? ` · <a href="${esc(safeHttp(comp.url))}">listing</a>` : ""}</p></li>`;
  }).join("");
  const values = [["Our avg", summary.ourAvg], ["Median", summary.median], ["25th", summary.p25], ["75th", summary.p75]];
  const finite = values.filter(([, value]) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))).map(([, value]) => Number(value));
  const max = Math.max(...finite, 1);
  const bars = values.map(([label, value]) => {
    const known = value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
    const width = known ? Math.round((Number(value) / max) * 100) : 0;
    return `<div class="meter"><span>${esc(label)}</span><div class="track"><div class="fill" style="width:${width}%;background:${label === "Our avg" ? "#ffb020" : "#3ee0ff"}"></div></div><span>${known ? esc(money(value) || "—") : "—"}</span></div>`;
  }).join("");
  const asOf = market.asOf ? formatShort(String(market.asOf).slice(0, 10)) : "";
  return `<p class="note">${asOf ? `As of ${esc(asOf)}. ` : ""}${esc(market.source || "Public listing prices. Our average stays blank until it is filled in.")}</p>
    ${bars}
    <div class="chart-card"><div class="chart-box" style="height:${Math.max(220, comps.length * 28)}px"><canvas id="chart-market"></canvas></div></div>
    ${rows ? `<ul class="list">${rows}</ul>` : `<p class="empty">No comps logged.</p>`}`;
}

function safeHttp(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url) ? url : "";
}

function taskChip(kind, label) {
  return `<span class="chip ${kind}">${esc(label)}</span>`;
}

function statusChip(status) {
  const value = String(status || "").toLowerCase();
  if (value === "active") return taskChip("ok", "Active");
  if (value === "paused") return taskChip("warn", "Paused");
  return taskChip("warn", status || "Unknown");
}

function resultChip(result) {
  if (result === "succeeded") return taskChip("ok", "Succeeded");
  if (result === "failed") return taskChip("bad", "Failed");
  return taskChip("warn", "No result");
}

function scheduledTasksHtml(data, now) {
  const tasks = Array.isArray(data.scheduledTasks) ? data.scheduledTasks : [];
  if (!tasks.length) return `<p class="empty">No scheduled tasks in the data file.</p>`;
  const views = tasks.map((task, index) => ({
    task,
    index,
    next: taskNextRun(task, now),
    upcoming: upcomingRunsToday(task, now),
  })).sort((a, b) => {
    const rank = (view) => (String(view.task.status || "").toLowerCase() === "active" ? 0 : 1);
    const byStatus = rank(a) - rank(b);
    if (byStatus) return byStatus;
    const at = a.next ? a.next.getTime() : Number.POSITIVE_INFINITY;
    const bt = b.next ? b.next.getTime() : Number.POSITIVE_INFINITY;
    return at - bt || a.index - b.index;
  });
  const timeline = views.flatMap((view) => view.upcoming.map((when) => ({ when, name: view.task.name })))
    .sort((a, b) => a.when - b.when);
  const timelineHtml = timeline.length
    ? `<ol class="timeline">${timeline.map((item) => `<li><time datetime="${item.when.toISOString()}">${esc(formatChecked(item.when))}</time>${esc(item.name || "Task")}</li>`).join("")}</ol>`
    : `<p class="empty">No runs left today.</p>`;
  const cards = views.map(({ task, next }) => `<article class="card task-card">
      <h3>${esc(task.name || "Untitled task")}</h3>
      <p class="note">${esc(task.schedule || "Schedule pending")}</p>
      <div class="chips">${statusChip(task.status)}${resultChip(task.lastResult)}</div>
      <p>Last run ${task.lastRun ? esc(formatChecked(task.lastRun)) : pendingOr(null)}</p>
      <p>Next run ${next ? `<strong>${esc(formatChecked(next))}</strong>` : pendingOr(null)}</p>
      ${task.detail ? `<p class="note">${esc(task.detail)}</p>` : ""}
    </article>`).join("");
  return `<h3>Today</h3>
    <p class="note">Upcoming runs left today, America/New_York. Next run is calculated from the schedule when the file leaves it empty.</p>
    ${timelineHtml}
    <div class="task-list">${cards}</div>`;
}

function renderBoard(data, view, selected, matches) {
  const checked = formatChecked(data.meta.lastChecked);
  const filters = state.filters;
  const roomOptions = [`<option value="">All rooms</option>`, ...(data.rooms || []).map((room) => `<option value="${esc(room.id)}"${filters.room === room.id ? " selected" : ""}>${esc(room.name)}</option>`)].join("");
  const platformOptions = [`<option value="">All platforms</option>`, ...(data.platforms || []).map((platform) => `<option value="${esc(platform.id)}"${filters.platform === platform.id ? " selected" : ""}>${esc(platform.label)}</option>`)].join("");
  const todayTurns = view.turnovers.filter((event) => event.date === view.today);
  const tomorrowTurns = view.turnovers.filter((event) => event.date === view.tomorrow);
  return `<header class="hero">
      <div class="stripes" aria-hidden="true"><span style="background:#6ea8fe"></span><span style="background:#e879f9"></span><span style="background:#2dd4bf"></span></div>
      <p class="eyebrow">20 Puritan Road · Somerville</p>
      <h1>Rental Command Center</h1>
      <p class="checked">Ops checked <time datetime="${esc(data.meta.opsAsOf || "")}">${esc(opsAsOfLabel(data) || "time pending")}</time></p>
      <p class="checked">Financial figures as of <time datetime="${esc(data.meta.financialAsOf || data.revenueSummary?.asOf || data.meta.lastChecked)}">${esc(financialAsOfLabel(data))}</time></p>
      <div class="pills">${signPills(data)}</div>
    </header>
    <nav class="jumps" aria-label="Dashboard tabs">
      ${[["decisions", "Decisions"], ["overview", "Overview"], ["threads", "Guest Threads"], ["revenue", "Revenue"], ["calendar", "Calendar & Prices"], ["reservations", "Reservations"], ["market", "Market"], ["operations", "Operations"], ["tasks", "Scheduled Tasks"]].map(([id, label]) => `<button type="button" data-tab="${id}" class="${[state.tab === id ? "is-on" : "", id === "threads" ? "tab-threads" : ""].filter(Boolean).join(" ")}">${esc(label)}</button>`).join("")}
    </nav>
    <div class="tab-panel${state.tab === "overview" ? " is-on" : ""}" data-panel="overview"><section id="kpis">${kpiHtml(data, view.today)}</section></div>
    <div class="tab-panel${state.tab === "threads" ? " is-on" : ""}" data-panel="threads">
    <section id="guest-threads" class="panel">
      <h2>Guest threads</h2>
      <p class="note">Newest day first. Tap a screenshot to enlarge it. Add another day by appending to guestThreads in the data file.</p>
      ${guestThreadsTabHtml(data)}
    </section></div>
    <div class="tab-panel${state.tab === "decisions" ? " is-on" : ""}" data-panel="decisions"><section id="decisions" class="panel">
      <h2>Pending decisions</h2>
      <p class="note">Approve, Skip, and Send note open a public GitHub issue titled DECISION: APPROVE, DECISION: SKIP, or DECISION: COMMENT, with the decision label. This site is public. Don't add private details.</p>
      ${decisionsHtml(data, matches)}
    </section></div>
    <div class="tab-panel${state.tab === "operations" ? " is-on" : ""}" data-panel="operations">
    <section id="now" class="panel">
      <h2>Today</h2>
      <p class="range">${esc(formatPretty(view.today))}. Arrivals, departures, and who is in house tonight.</p>
      ${rosterHtml(data, view.todayRoster, view.today, view.today)}
      ${todayTurns.length ? `<h3>Turnovers</h3>${turnoverHtml(data, todayTurns, view.today)}` : ""}
      ${gapsHtml(data)}
    </section>
    <section id="tomorrow" class="panel">
      <h2>Tomorrow</h2>
      <p class="tomorrow-date">${esc(formatPretty(view.tomorrow))}</p>
      ${viewThreadsButton(data)}
      ${rosterHtml(data, view.tomorrowRoster, view.tomorrow, view.today, { showThread: true })}
      ${guestThreadsHtml(data, view.tomorrow)}
      ${tomorrowTurns.length ? `<h3>Turnovers</h3>${turnoverHtml(data, tomorrowTurns, view.today)}` : ""}
    </section>
    <section id="chats" class="panel">
      <h2>Guest chats</h2>
      ${chatsHtml(data)}
    </section>
    <section id="health" class="panel">
      <h2>Account health</h2>
      ${healthHtml(data)}
    </section>
    <section id="log" class="panel">
      <h2>Change log</h2>
      ${changelogHtml(data)}
    </section>
    </div>
    <div class="tab-panel${state.tab === "tasks" ? " is-on" : ""}" data-panel="tasks">
    <section id="tasks" class="panel">
      <h2>Scheduled tasks</h2>
      ${scheduledTasksHtml(data, new Date())}
    </section></div>
    <div class="tab-panel${state.tab === "calendar" ? " is-on" : ""}" data-panel="calendar">
    <section id="calendar" class="panel">
      <h2>Calendar</h2>
      ${horizonGrid(data, view, selected)}
      ${detailHtml(data, selected, view.today)}
      ${nightlyPricesHtml(data, selected)}
      ${priceFormHtml(data, selected)}
      ${openPriceHtml(state.priceIssues || [], selected)}
    </section></div>
    <div class="tab-panel${state.tab === "reservations" ? " is-on" : ""}" data-panel="reservations">
    <section id="reservations" class="panel">
      <h2>Reservations</h2>
      <div class="filters">
        <input id="res-search" type="search" placeholder="Search guest" value="${esc(filters.q)}" aria-label="Search guest">
        <select id="res-room" aria-label="Room">${roomOptions}</select>
        <select id="res-platform" aria-label="Platform">${platformOptions}</select>
        <input id="res-date" type="date" value="${esc(filters.date)}" aria-label="Occupied on">
      </div>
      <div id="res-list">${reservationList(data)}</div>
      <h3>Later</h3>
      ${staysAfterCalendar(data).map((stay) => stayCard(data, stay, ["After the calendar"])).join("") || `<p class="empty">No stays after the calendar.</p>`}
      <h3>Cancellations</h3>
      ${cancellationsHtml(data)}
    </section></div>
    <div class="tab-panel${state.tab === "market" ? " is-on" : ""}" data-panel="market">
    <section id="market" class="panel">
      <h2>Nearby prices</h2>
      ${marketHtml(data)}
    </section></div>
    <div class="tab-panel${state.tab === "revenue" ? " is-on" : ""}" data-panel="revenue">
    <section id="revenue" class="panel">
      <h2>Revenue</h2>
      <p class="note">Today and yesterday use the full stay on the check-in date once that day's reservations are covered. Longer windows are night-stayed. Windows that are not verified for ${esc(formatShort(view.today))} stay pending. Financial figures as of ${esc(financialAsOfLabel(data))}. Occupancy in the ledger counts each room and date once. Stated amounts are not treated as gross.</p>
      ${summaryRevenueHtml(data, view.today)}
      <h3>Stay ledger</h3>
      ${view.periods.map((period) => periodHtml(data, period)).join("")}
      ${payoutHtml(data)}
    </section></div>
    <p class="foot">Ops checked <time datetime="${esc(data.meta.opsAsOf || "")}">${esc(opsAsOfLabel(data) || "time pending")}</time>. Financial figures as of <time datetime="${esc(data.meta.financialAsOf || data.meta.lastChecked)}">${esc(financialAsOfLabel(data))}</time>. This page is on a public GitHub Pages site. Names are first name and last initial. No door codes, Wi-Fi passwords, card numbers, phone numbers, emails, reservation numbers, or payout batch ids are stored.
      <a href="../">Business dashboard</a></p>`;
}

const state = {
  data: null,
  today: "",
  selected: "",
  issues: [],
  stayNotes: new Map(),
  priceIssues: [],
  showPlatforms: false,
  tab: "overview",
  chartDays: 120,
  gridScroll: 0,
  filters: { q: "", room: "", platform: "", date: "" },
};

function nightlyValue(data, iso, field, platformId) {
  let sum = 0;
  let any = false;
  for (const stay of data.stays || []) {
    if (stay.status === "cancelled" || !isOccupied(stay, iso)) continue;
    if (platformId && stay.platform !== platformId) continue;
    const nights = stay.checkIn && stay.checkOut ? Math.max(1, eachDate(stay.checkIn, fmtDate(addDays(parseDate(stay.checkOut), -1))).length) : 0;
    const value = Number(stay[field]);
    if (!nights || !Number.isFinite(value)) continue;
    sum += value / nights;
    any = true;
  }
  return any ? sum : null;
}

function seriesFor(data, today, days, field) {
  const dates = eachDate(fmtDate(addDays(parseDate(today), 1 - days)), today);
  return dates.map((iso) => ({ iso, value: nightlyValue(data, iso, field) }));
}

function dailyWindow(data, today, mode) {
  const asOf = asOfDate(data, today);
  if (!asOf) return [];
  const start = fmtDate(addDays(parseDate(asOf), -89));
  const end = mode === 90 ? asOf : fmtDate(addDays(parseDate(asOf), 30));
  return dailyRows(data).filter((row) => row.date >= start && row.date <= end);
}

function sumDailyMap(rows, key, ids) {
  const totals = Object.fromEntries(ids.map((id) => [id, 0]));
  let any = false;
  for (const row of rows) {
    const bucket = row[key] || {};
    for (const id of ids) {
      const value = Number(bucket[id]);
      if (!Number.isFinite(value)) continue;
      totals[id] += value;
      any = true;
    }
  }
  return any ? totals : null;
}

const liveCharts = [];

function clearCharts() {
  liveCharts.splice(0).forEach((chart) => chart.destroy());
}

function chartMessage(id, message) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  canvas.style.display = message ? "none" : "";
  let note = canvas.parentElement.querySelector(".chart-empty");
  if (message) {
    if (!note) {
      note = document.createElement("p");
      note.className = "chart-empty empty";
      canvas.parentElement.appendChild(note);
    }
    note.textContent = message;
  } else if (note) note.remove();
}

function baseChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 800, easing: "easeOutQuart" },
    plugins: {
      legend: { position: "bottom", labels: { boxWidth: 12, usePointStyle: true } },
      tooltip: {
        callbacks: {
          label(context) {
            const value = context.parsed.y ?? context.parsed;
            const number = typeof value === "number" ? value : value?.r;
            const label = context.dataset.label || context.label || "Value";
            if (!Number.isFinite(number)) return `${label}: pending`;
            const countChart = ["chart-occupancy", "chart-lead"].includes(context.chart.canvas.id);
            return `${label}: ${countChart ? number : (money(number) || "pending")}`;
          },
        },
      },
    },
  };
}

function mountCharts() {
  clearCharts();
  if (!window.Chart || !state.data) return;
  const data = state.data;
  const today = state.today;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  Chart.defaults.color = "#8fd0e0";
  Chart.defaults.borderColor = "rgba(0, 229, 255, .2)";
  Chart.defaults.font.family = "Rajdhani, Segoe UI, sans-serif";
  Chart.defaults.animation = reduce ? false : { duration: 800, easing: "easeOutQuart" };
  const windowRows = dailyWindow(data, today, state.chartDays === 90 ? 90 : 120);
  const revenue = document.getElementById("chart-revenue");
  if (revenue) {
    const points = windowRows.filter((row) => Number.isFinite(Number(row.net)));
    if (!points.length) chartMessage("chart-revenue", "Pending until daily revenue is filled in.");
    else {
      chartMessage("chart-revenue", "");
      liveCharts.push(new Chart(revenue, {
        type: "line",
        data: {
          labels: points.map((row) => formatShort(row.date)),
          datasets: [{
            label: "Net",
            data: points.map((row) => Number(row.net)),
            borderColor: "#4ade80",
            backgroundColor: "rgba(62,224,255,.18)",
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            pointHoverRadius: 4,
          }],
        },
        options: baseChartOptions(),
      }));
    }
  }
  const share = document.getElementById("chart-share");
  if (share) {
    const totals = sumDailyMap(windowRows, "byPlatform", (data.platforms || []).map((platform) => platform.id));
    const rows = (data.platforms || []).map((platform) => ({ platform, value: totals ? totals[platform.id] : null })).filter((row) => Number.isFinite(row.value) && row.value > 0);
    if (!rows.length) chartMessage("chart-share", "Pending until daily platform net is filled in.");
    else {
      chartMessage("chart-share", "");
      liveCharts.push(new Chart(share, {
        type: "doughnut",
        data: { labels: rows.map((row) => row.platform.label), datasets: [{ data: rows.map((row) => row.value), backgroundColor: rows.map((row) => row.platform.color) }] },
        options: baseChartOptions(),
      }));
    }
  }
  const rooms = document.getElementById("chart-rooms");
  if (rooms) {
    const totals = sumDailyMap(windowRows, "byRoom", (data.rooms || []).map((room) => room.id));
    const rows = (data.rooms || []).map((room) => ({ room, value: totals ? totals[room.id] : null })).filter((row) => Number.isFinite(row.value) && row.value > 0);
    if (!rows.length) chartMessage("chart-rooms", "Pending until daily room net is filled in.");
    else {
      chartMessage("chart-rooms", "");
      liveCharts.push(new Chart(rooms, {
        type: "pie",
        data: { labels: rows.map((row) => row.room.name), datasets: [{ data: rows.map((row) => row.value), backgroundColor: rows.map((row) => row.room.color) }] },
        options: baseChartOptions(),
      }));
    }
  }
  const next30 = document.getElementById("chart-next30");
  if (next30) {
    const asOf = asOfDate(data, today);
    const future = dailyRows(data).filter((row) => asOf && row.date > asOf && row.date <= fmtDate(addDays(parseDate(asOf), 30)));
    const totals = sumDailyMap(future, "byPlatform", (data.platforms || []).map((platform) => platform.id));
    if (!totals) chartMessage("chart-next30", "Pending until next-30 daily net is filled in.");
    else {
      chartMessage("chart-next30", "");
      liveCharts.push(new Chart(next30, {
        type: "bar",
        data: {
          labels: (data.platforms || []).map((platform) => platform.short || platform.label),
          datasets: [{ label: "Net", data: (data.platforms || []).map((platform) => totals[platform.id]), backgroundColor: (data.platforms || []).map((platform) => platform.color) }],
        },
        options: { ...baseChartOptions(), scales: { y: { beginAtZero: true } } },
      }));
    }
  }
  const occupancy = document.getElementById("chart-occupancy");
  if (occupancy) {
    const range = { start: fmtDate(addDays(parseDate(today), -29)), end: today };
    const nights = (data.rooms || []).map((room) => {
      const dates = new Set();
      for (const stay of data.stays || []) {
        if (stay.roomId !== room.id || stay.status === "cancelled") continue;
        for (const iso of nightsOverlapping(stay, range.start, range.end)) dates.add(iso);
      }
      return dates.size;
    });
    chartMessage("chart-occupancy", "");
    liveCharts.push(new Chart(occupancy, {
      type: "bar",
      data: { labels: data.rooms.map((room) => room.name), datasets: [{ label: "Nights booked", data: nights, backgroundColor: data.rooms.map((room) => room.color), money: false }] },
      options: { ...baseChartOptions(), scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    }));
  }
  const adr = document.getElementById("chart-adr");
  if (adr) {
    const points = seriesFor(data, today, 30, "gross").map((point) => {
      if (point.value === null) return { ...point, adr: null };
      const occupied = (data.stays || []).filter((stay) => stay.status !== "cancelled" && isOccupied(stay, point.iso) && Number.isFinite(Number(stay.gross))).length;
      return { ...point, adr: occupied ? point.value / occupied : null };
    });
    if (!points.some((point) => point.adr !== null)) chartMessage("chart-adr", "Pending until nightly gross is on file.");
    else {
      chartMessage("chart-adr", "");
      liveCharts.push(new Chart(adr, {
        type: "line",
        data: { labels: points.map((point) => formatShort(point.iso)), datasets: [{ label: "Known ADR", data: points.map((point) => point.adr), borderColor: "#6ea8fe", tension: 0.3, spanGaps: false, pointRadius: 0 }] },
        options: baseChartOptions(),
      }));
    }
  }
  const lead = document.getElementById("chart-lead");
  if (lead) {
    const buckets = [0, 0, 0, 0, 0, 0];
    let counted = 0;
    for (const stay of data.stays || []) {
      if (stay.status === "cancelled" || !stay.bookedOn || !stay.checkIn) continue;
      const days = Math.round((parseDate(stay.checkIn) - parseDate(stay.bookedOn)) / 86400000);
      if (!Number.isFinite(days) || days < 0) continue;
      counted += 1;
      buckets[days <= 1 ? 0 : days <= 7 ? 1 : days <= 14 ? 2 : days <= 30 ? 3 : days <= 60 ? 4 : 5] += 1;
    }
    if (!counted) chartMessage("chart-lead", "Pending. Stays do not have a booking date yet.");
    else {
      chartMessage("chart-lead", "");
      liveCharts.push(new Chart(lead, {
        type: "bar",
        data: { labels: ["0–1d", "2–7d", "8–14d", "15–30d", "31–60d", "61d+"], datasets: [{ label: "Bookings", data: buckets, backgroundColor: "#f0b35e", money: false }] },
        options: { ...baseChartOptions(), scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
      }));
    }
  }
  const market = document.getElementById("chart-market");
  if (market) {
    const comps = (data.market?.comps || []).filter((comp) => Number.isFinite(Number(comp.nightlyPrice)));
    const rawOurs = data.market?.summary?.ourAvg;
    const ours = rawOurs === null || rawOurs === undefined || rawOurs === "" ? null : Number(rawOurs);
    if (!comps.length && !Number.isFinite(ours)) chartMessage("chart-market", "Pending until nearby prices are filled in.");
    else {
      chartMessage("chart-market", "");
      const labels = [...comps.map((comp) => comp.name || "Comp")];
      const values = [...comps.map((comp) => Number(comp.nightlyPrice))];
      if (Number.isFinite(ours)) { labels.push("Our avg"); values.push(ours); }
      liveCharts.push(new Chart(market, {
        type: "bar",
        data: { labels, datasets: [{ label: "Nightly price", data: values, backgroundColor: labels.map((label, index) => index === labels.length - 1 && Number.isFinite(ours) ? "#4ade80" : "#6ea8fe") }] },
        options: { ...baseChartOptions(), indexAxis: "y", scales: { x: { beginAtZero: true } } },
      }));
    }
  }
}

function animateCounts(root) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.querySelectorAll(".count").forEach((el) => {
    const target = Number(el.dataset.count);
    if (!Number.isFinite(target)) return;
    const paint = (value) => {
      el.textContent = el.dataset.money === "1" ? (money(value) || "") : `${value.toFixed(1)}${el.dataset.suffix || ""}`;
    };
    if (reduce) { paint(target); return; }
    const started = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - started) / 700);
      const eased = 1 - (1 - progress) ** 3;
      paint(target * eased);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  root.querySelectorAll(".gauge").forEach((figure) => {
    const ring = figure.querySelector(".gauge-value");
    const num = figure.querySelector(".gauge-num");
    if (!ring) return;
    const offset = Number(ring.dataset.offset);
    const circ = Number(ring.dataset.circ);
    if (!Number.isFinite(offset) || !Number.isFinite(circ) || circ === 0) return;
    const pct = Math.round((1 - offset / circ) * 100);
    if (num && num.textContent !== "—") num.textContent = `${pct}%`;
    if (reduce) { ring.style.strokeDashoffset = String(offset); return; }
    requestAnimationFrame(() => { ring.style.transition = "stroke-dashoffset .9s ease"; ring.style.strokeDashoffset = String(offset); });
  });
}

function bindThreadZoom(root) {
  let dialog = document.getElementById("thread-zoom");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "thread-zoom";
    dialog.className = "thread-zoom";
    dialog.innerHTML = `<button type="button" class="btn skip thread-close">Close</button><img alt="">`;
    document.body.appendChild(dialog);
    dialog.querySelector(".thread-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  }
  const image = dialog.querySelector("img");
  root.querySelectorAll(".thread-thumb, .thread-large").forEach((button) => {
    button.addEventListener("click", () => {
      image.src = button.dataset.full || "";
      image.alt = button.getAttribute("aria-label") || "Guest thread";
      if (typeof dialog.showModal === "function") dialog.showModal();
    });
  });
}

function bindStayNotes(root) {
  root.querySelectorAll(".stay-note-send").forEach((button) => {
    button.addEventListener("click", () => {
      const stay = state.data.stays.find((item) => item.id === button.dataset.stayId);
      if (!stay) return;
      const message = button.closest(".stay")?.querySelector(".stay-note")?.value || "";
      window.open(stayNoteUrl(stay, roomOf(state.data, stay.roomId), message), "_blank", "noopener");
    });
  });
}

function paint(scrollDetail) {
  const app = document.querySelector("#app");
  const y = window.scrollY;
  state.gridScroll = document.querySelector("#gscroll")?.scrollLeft || state.gridScroll;
  const view = derive(state.data, state.today);
  state.stayNotes = matchStayNotes(state.data.stays, state.issues);
  state.priceIssues = matchPriceIssues(state.issues);
  app.innerHTML = renderBoard(state.data, view, state.selected, matchDecisions(state.data.decisions, state.issues));
  const scroller = document.querySelector("#gscroll");
  if (scroller) scroller.scrollLeft = state.gridScroll || 0;
  app.querySelectorAll("[data-date]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selected = button.dataset.date;
      paint(true);
    });
  });
  app.querySelectorAll(".note-send").forEach((button) => {
    button.addEventListener("click", () => {
      const decision = state.data.decisions.find((item) => item.id === button.dataset.decisionId);
      if (!decision) return;
      const message = button.closest(".decision")?.querySelector(".decision-note")?.value || "";
      window.open(decisionCommentUrl(decision, message), "_blank", "noopener");
    });
  });
  app.querySelector("#price-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = form.querySelector(".price-error");
    const room = roomOf(state.data, new FormData(form).get("room"));
    const start = form.start.value;
    const end = form.end.value;
    const price = form.price.value.trim();
    const platforms = [...form.querySelectorAll('input[name="platform"]:checked')].map((box) => box.value);
    const roomNumber = priceRoomKey(room).replace("room", "");
    const amount = Number(price);
    if (!roomNumber || !start || !end || end < start || !Number.isFinite(amount) || amount < 0 || !platforms.length) {
      error.hidden = false;
      error.textContent = "Choose a room, a start date on or before the end date, a price, and at least one platform.";
      return;
    }
    error.hidden = true;
    window.open(priceIssueUrl({ roomNumber, start, end, price, platforms }), "_blank", "noopener");
  });
  bindStayNotes(app);
  bindThreadZoom(app);
  animateCounts(app);
  mountCharts();
  app.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tab = button.dataset.tab;
      app.querySelectorAll("[data-tab]").forEach((tab) => tab.classList.toggle("is-on", tab.dataset.tab === state.tab));
      app.querySelectorAll("[data-panel]").forEach((panel) => panel.classList.toggle("is-on", panel.dataset.panel === state.tab));
      if (button.classList.contains("view-threads") || state.tab === "threads") window.scrollTo(0, 0);
      mountCharts();
    });
  });
  app.querySelectorAll("[data-range]").forEach((button) => {
    button.addEventListener("click", () => {
      state.chartDays = Number(button.dataset.range);
      app.querySelectorAll("[data-range]").forEach((item) => item.classList.toggle("is-on", item === button));
      mountCharts();
    });
  });
  document.querySelector("#platform-toggle")?.addEventListener("click", () => {
    state.showPlatforms = !state.showPlatforms;
    document.querySelector(".kpi-cards")?.classList.toggle("show-platforms", state.showPlatforms);
  });
  const refreshReservations = () => {
    const list = document.querySelector("#res-list");
    if (!list) return;
    list.innerHTML = reservationList(state.data);
    bindStayNotes(list);
  };
  document.querySelector("#res-search")?.addEventListener("input", (event) => {
    state.filters.q = event.target.value;
    refreshReservations();
  });
  document.querySelector("#res-room")?.addEventListener("change", (event) => {
    state.filters.room = event.target.value;
    refreshReservations();
  });
  document.querySelector("#res-platform")?.addEventListener("change", (event) => {
    state.filters.platform = event.target.value;
    refreshReservations();
  });
  document.querySelector("#res-date")?.addEventListener("change", (event) => {
    state.filters.date = event.target.value;
    refreshReservations();
  });
  if (scrollDetail) document.getElementById("day-detail")?.scrollIntoView({ block: "nearest" });
  else window.scrollTo(0, y);
}

async function loadData() {
  const response = await fetch(`data.json?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`data.json ${response.status}`);
  return response.json();
}

async function searchIssues(term) {
  const query = `repo:victorsaff/Victorsaff.github.io is:issue is:open ${term} in:title`;
  const response = await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(query)}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) return [];
  const payload = await response.json();
  return payload.items || [];
}

async function loadIssues() {
  const lists = await Promise.all(["DECISION:", "NOTE:", "PRICE:"].map((term) => searchIssues(term).catch(() => [])));
  const seen = new Set();
  const items = [];
  for (const list of lists) {
    for (const issue of list) {
      if (seen.has(issue.id)) continue;
      seen.add(issue.id);
      items.push(issue);
    }
  }
  return items;
}

async function boot() {
  const app = document.querySelector("#app");
  try {
    state.data = await loadData();
    state.today = newYorkToday();
    const { start, end } = state.data.meta.calendar;
    state.selected = state.today >= start && state.today <= end ? state.today : start;
    paint(false);
    try {
      state.issues = await loadIssues();
      paint(false);
    } catch (error) {
      /* Approve and Skip still open a prefilled issue if the search call fails. */
    }
    setInterval(async () => {
      try {
        const next = await loadData();
        const today = newYorkToday();
        const changedPrices = (next.prices?.updatedAt || "") !== (state.data.prices?.updatedAt || "");
        const changedOps = (next.meta.opsAsOf || "") !== (state.data.meta.opsAsOf || "");
        const changedFinancial = (next.meta.financialAsOf || "") !== (state.data.meta.financialAsOf || "");
        if (next.meta.lastChecked !== state.data.meta.lastChecked || changedPrices || changedOps || changedFinancial || today !== state.today) {
          state.data = next;
          state.today = today;
          state.issues = await loadIssues();
          paint(false);
        }
      } catch (error) {
        /* keep the board that is already on screen */
      }
    }, 60000);
  } catch (error) {
    app.innerHTML = `<p class="error">The board could not load data.json. ${esc(error.message)}</p>`;
  }
}

if (typeof document !== "undefined") boot();
