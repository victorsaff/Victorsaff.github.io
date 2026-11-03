const REPO = "victorsaff/Victorsaff.github.io";

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
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
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

  for (const platform of data.platforms) {
    for (const room of data.rooms) {
      const overlapping = data.stays.filter((stay) => {
        return stay.platform === platform.id && stay.roomId === room.id && nightsOverlapping(stay, range.start, range.end).length > 0;
      });
      const nights = overlapping.reduce((count, stay) => count + nightsOverlapping(stay, range.start, range.end).length, 0);
      confirmed += nights;
      const stat = roomStats.find((item) => item.room.id === room.id);
      stat.confirmed += nights;
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
    "This repository is public. Do not add door codes, Wi-Fi passwords, card numbers, phone numbers, emails, reservation numbers, or payout batch ids.",
  ].join("\n");
  const url = new URL(`https://github.com/${REPO}/issues/new`);
  url.searchParams.set("title", title);
  url.searchParams.set("labels", "decision");
  url.searchParams.set("body", body);
  return url.toString();
}

export function matchDecisions(decisions, issues) {
  const map = new Map(decisions.map((decision) => [decision.id, []]));
  for (const issue of issues || []) {
    const match = /^DECISION: (APPROVE|SKIP) ([A-Za-z0-9._-]+)\s*$/.exec(String(issue.title || "").trim());
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

export function derive(data, today) {
  const calendar = data.meta.calendar;
  return {
    today,
    tomorrow: nextDay(today),
    todayRoster: dayRoster(data, today, today),
    tomorrowRoster: dayRoster(data, nextDay(today), today),
    turnovers: turnovers(data, calendar.start, calendar.end),
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
  return `${(Math.round((part / whole) * 1000) / 10).toFixed(1)}%`;
}

function listingLines(room) {
  const lines = [];
  if (room.listings.airbnb) lines.push(`Airbnb · ${room.listings.airbnb}`);
  if (room.listings.booking) lines.push(`Booking listing ${room.listings.booking}`);
  if (room.listings.agoda) lines.push(`Agoda listing ${room.listings.agoda}`);
  return lines.map((line) => `<p>${esc(line)}</p>`).join("");
}

function stayCard(data, stay, tags) {
  const room = roomOf(data, stay.roomId);
  const tagHtml = tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join("");
  const note = stay.notes ? `<p class="note">${esc(stay.notes)}</p>` : "";
  const color = safeColor(room.color);
  return `<article class="stay" style="border-left-color:${color};background:color-mix(in srgb, ${color} 14%, var(--card))">
    <header><strong>${esc(stay.guest)}</strong>${badge(data, stay.platform)}${roomName(room)}</header>
    <p>${staySpan(stay)} · ${esc(party(stay))}</p>
    <p class="money">Stated ${pendingOr(stay.statedAmount)} · Gross ${pendingOr(stay.gross)} · Fees ${pendingOr(stay.fees)} · Net ${pendingOr(stay.net)}</p>
    <p class="tags">${tagHtml}</p>
    ${note}
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

function rosterHtml(data, roster, iso, today) {
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
      ? guests.map((stay) => stayCard(data, stay, tagsFor(stay, iso, today))).join("")
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
      const labelText = `${formatPretty(cell.iso)}. ${names.length ? [...new Set(names)].join(", ") : "No occupied rooms"}${turnover ? ". Same-day turnover" : ""}`;
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

function periodHtml(data, period) {
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
    <td>${pendingOr(row.gross)}</td>
    <td>${pendingOr(row.fees)}</td>
    <td>${pendingOr(row.net)}</td>
    <td>${pendingOr(row.adr)}</td>
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
    <p class="occ"><strong>${period.confirmed} / ${period.available}</strong> confirmed room-nights · ${percent(period.confirmed, period.available)} occupancy</p>
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
  return data.decisions.map((decision) => {
    const found = matches.get(decision.id) || [];
    const recorded = found.length
      ? `<ul class="choice">${found.map((issue) => `<li>${esc(issue.choice)} recorded${issue.url ? ` · <a href="${esc(issue.url)}">issue ${esc(issue.number || "")}</a>` : ""}</li>`).join("")}</ul>`
      : `<p class="note">No open issue for this decision yet.</p>`;
    return `<article class="card decision">
      <h3>${esc(decision.title)}</h3>
      <p>${esc(decision.detail)}</p>
      ${recorded}
      <div class="actions">
        <a class="btn approve" href="${esc(decisionUrl(decision, "APPROVE"))}" target="_blank" rel="noopener noreferrer">Approve</a>
        <a class="btn skip" href="${esc(decisionUrl(decision, "SKIP"))}" target="_blank" rel="noopener noreferrer">Skip</a>
      </div>
    </article>`;
  }).join("");
}

function changelogHtml(data) {
  const rows = [...(data.changelog || [])].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  if (!rows.length) return `<p class="empty">No changes logged.</p>`;
  return `<ul class="list">${rows.map((row) => `<li class="card log"><strong>${esc(formatChecked(row.at))}</strong><p>${esc(row.note)}</p></li>`).join("")}</ul>`;
}

function gapsHtml(data) {
  const gaps = data.stays.filter((stay) => stay.status !== "cancelled" && (!stay.checkIn || !stay.checkOut));
  if (!gaps.length) return "";
  return `<div class="gaps"><h3>Dates still open</h3><ul>${gaps.map((stay) => {
    const room = stay.roomId ? roomOf(data, stay.roomId).name : "Room pending";
    return `<li>${esc(stay.guest)} · ${esc(room)} · ${staySpan(stay)}</li>`;
  }).join("")}</ul></div>`;
}

function renderBoard(data, view, selected, matches) {
  const checked = formatChecked(data.meta.lastChecked);
  const rooms = data.rooms.map((room) => {
    const color = safeColor(room.color);
    return `<article class="card room-card" style="border-top:4px solid ${color};background:color-mix(in srgb, ${color} 16%, var(--card))">
    <h2>${roomName(room)}</h2>
    ${listingLines(room)}
  </article>`;
  }).join("");
  const platforms = data.platforms.map((platform) => badge(data, platform.id)).join("");
  return `<header class="hero">
      <div class="stripes" aria-hidden="true"><span style="background:#6ea8fe"></span><span style="background:#e879f9"></span><span style="background:#2dd4bf"></span></div>
      <p class="eyebrow">20 Puritan Road · Somerville</p>
      <h1>Rental Command Center</h1>
      <p class="checked">Last checked <time datetime="${esc(data.meta.lastChecked)}">${esc(checked)}</time></p>
      <p class="sub">Today is ${esc(formatPretty(view.today))}, America/New_York. A room is occupied when check-in is on or before the date and check-out is after it.</p>
      <div class="platforms">${platforms}</div>
    </header>
    <nav class="jumps" aria-label="Sections">
      <a href="#now">Now</a>
      <a href="#tomorrow">Tomorrow</a>
      <a href="#calendar">Calendar</a>
      <a href="#turnovers">Turnovers</a>
      <a href="#revenue">Revenue</a>
      <a href="#chats">Chats</a>
      <a href="#health">Health</a>
      <a href="#decisions">Decisions</a>
      <a href="#log">Log</a>
    </nav>
    <div class="room-grid">${rooms}</div>
    <section id="now" class="panel">
      <h2>In house now and today</h2>
      <p class="range">${esc(formatPretty(view.today))}</p>
      ${rosterHtml(data, view.todayRoster, view.today, view.today)}
      ${gapsHtml(data)}
    </section>
    <section id="tomorrow" class="panel">
      <h2>Tomorrow</h2>
      <p class="tomorrow-date">${esc(formatPretty(view.tomorrow))}</p>
      ${rosterHtml(data, view.tomorrowRoster, view.tomorrow, view.today)}
    </section>
    <section id="calendar">
      <h2>Calendar</h2>
      <p class="note">Tap a day from ${esc(formatShort(data.meta.calendar.start))} through ${esc(formatShort(data.meta.calendar.end))}. Bars are occupied rooms. ↔ is a same-day turnover.</p>
      <div class="legend">${data.rooms.map((room) => roomName(room)).join("")}</div>
      ${calendarHtml(data, view, selected)}
      ${detailHtml(data, selected, view.today)}
      <h3>Cancellations</h3>
      ${cancellationsHtml(data)}
    </section>
    <section id="turnovers">
      <h2>Turnovers</h2>
      <p class="note">A turnover is a checkout. Same-day means the next guest arrives that day.</p>
      ${turnoverHtml(data, view.turnovers, view.today)}
    </section>
    <section id="revenue">
      <h2>Revenue</h2>
      <p class="note">Gross, fees, net, and ADR stay pending until those figures are in the data file. Occupancy counts confirmed nights only. Stated amounts are shown beside the tables and are not treated as gross.</p>
      ${view.periods.map((period) => periodHtml(data, period)).join("")}
      ${payoutHtml(data)}
    </section>
    <section id="chats">
      <h2>Guest chats</h2>
      ${chatsHtml(data)}
    </section>
    <section id="health">
      <h2>Account health</h2>
      <div class="health-grid">${healthHtml(data)}</div>
    </section>
    <section id="decisions">
      <h2>Pending decisions</h2>
      <p class="note">Approve and Skip open a public GitHub issue titled DECISION: APPROVE or DECISION: SKIP, with the decision label. Don't add private details.</p>
      ${decisionsHtml(data, matches)}
    </section>
    <section id="log">
      <h2>Change log</h2>
      ${changelogHtml(data)}
    </section>
    <p class="foot">Last checked <time datetime="${esc(data.meta.lastChecked)}">${esc(checked)}</time>. This page is on a public GitHub Pages site. Names are first name and last initial. No door codes, Wi-Fi passwords, card numbers, phone numbers, emails, reservation numbers, or payout batch ids are stored.
      <a href="../">Business dashboard</a></p>`;
}

const state = {
  data: null,
  today: "",
  selected: "",
  issues: [],
};

function paint(scrollDetail) {
  const app = document.querySelector("#app");
  const y = window.scrollY;
  const view = derive(state.data, state.today);
  app.innerHTML = renderBoard(state.data, view, state.selected, matchDecisions(state.data.decisions, state.issues));
  app.querySelectorAll("[data-date]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selected = button.dataset.date;
      paint(true);
    });
  });
  if (scrollDetail) document.getElementById("day-detail")?.scrollIntoView({ block: "nearest" });
  else window.scrollTo(0, y);
}

async function loadData() {
  const response = await fetch(`data.json?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`data.json ${response.status}`);
  return response.json();
}

async function loadIssues() {
  const query = "repo:victorsaff/Victorsaff.github.io is:issue is:open DECISION: in:title";
  const response = await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(query)}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) return [];
  const payload = await response.json();
  return payload.items || [];
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
        if (next.meta.lastChecked !== state.data.meta.lastChecked || today !== state.today) {
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
