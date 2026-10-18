// api/calendar.js — イベントカレンダー
//
// 載せるもの:
//   1. Discordのイベント（サーバーの「イベント」に登録したもの）… 自動
//   2. events.json に書いたイベント
//   3. 資源ワールドのリセット（毎月15日 0時）… 自動
//
//   GET /api/calendar             … JSON（サイトのカレンダーページ用）
//   GET /api/calendar?format=ics  … カレンダーアプリ用（iPhone・Googleカレンダーなどで購読できる）
//
// Vercel の環境変数（Discordのイベントを載せるときだけ）:
//   DISCORD_BOT_TOKEN … お知らせと同じボットのトークン
//   DISCORD_GUILD_ID  … DiscordサーバーのID（サーバー名を右クリック →「サーバーIDをコピー」）

const API = "https://discord.com/api/v10";
const RESET_DAY = 15;

function clean(text, max) {
  return String(text || "")
    .replace(/<a?:(\w+):\d+>/g, ":$1:")
    .replace(/<@[!&]?\d+>/g, "")
    .replace(/@(everyone|here)/g, "")
    .replace(/<#\d+>/g, "")
    .trim()
    .slice(0, max);
}

async function discordEvents() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guild = process.env.DISCORD_GUILD_ID;
  if (!token || !/^\d{5,25}$/.test(guild || "")) return { configured: false, events: [] };
  const r = await fetch(`${API}/guilds/${guild}/scheduled-events?with_user_count=true`, {
    headers: { Authorization: `Bot ${token}` },
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) {
    console.error("discord events", r.status, (await r.text()).slice(0, 200));
    return { configured: true, events: [] };
  }
  const list = await r.json();
  return {
    configured: true,
    events: (Array.isArray(list) ? list : [])
      .filter((e) => e && (e.status === 1 || e.status === 2))
      .map((e) => ({
        id: `discord-${e.id}`,
        source: "discord",
        title: clean(e.name, 100),
        description: clean(e.description, 600),
        start: e.scheduled_start_time,
        end: e.scheduled_end_time || null,
        place: clean((e.entity_metadata && e.entity_metadata.location) || (e.channel_id ? "Discordのボイスチャンネル" : ""), 100),
        live: e.status === 2,
        interested: e.user_count || 0,
        image: e.image ? `https://cdn.discordapp.com/guild-events/${e.id}/${e.image}.png?size=600` : "",
        url: `https://discord.com/events/${guild}/${e.id}`,
      })),
  };
}

// 日付だけ（2026-10-24）なら終日。日本時間の1日として扱う
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
function toIso(v, endOfDay) {
  const s = String(v || "");
  if (DATE_ONLY.test(s)) return new Date(`${s}T${endOfDay ? "23:59:59" : "00:00:00"}+09:00`).toISOString();
  return Number.isNaN(Date.parse(s)) ? null : new Date(s).toISOString();
}

async function siteEvents(origin) {
  try {
    const r = await fetch(`${origin}/events.json`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return [];
    const d = await r.json();
    return (Array.isArray(d.events) ? d.events : [])
      .filter((e) => e && e.title && toIso(e.start))
      .map((e, i) => {
        const allDay = DATE_ONLY.test(String(e.start));
        return {
          id: `site-${i}`,
          source: "site",
          title: clean(e.title, 100),
          title_en: clean(e.title_en, 100),
          description: clean(e.description, 600),
          description_en: clean(e.description_en, 600),
          start: toIso(e.start, false),
          end: e.end ? toIso(e.end, true) : allDay ? toIso(e.start, true) : null,
          allDay,
          dateStart: allDay ? String(e.start) : "",
          dateEnd: allDay ? String(e.end || e.start) : "",
          place: clean(e.place, 100),
          color: /^#[0-9a-fA-F]{6}$/.test(String(e.color || "")) ? e.color : "",
          url: /^(https:\/\/|\/|[\w-]+\.html)/.test(String(e.url || "")) ? e.url : "",
        };
      });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- iCalendar
function icsText(s) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function icsTime(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function fold(line) {
  // 1行は75バイトまで（日本語は3バイトなので、文字数で控えめに折る）
  const out = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > 73) {
      out.push(cur);
      cur = " " + ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n");
}
function ics(events, origin) {
  const now = icsTime(new Date().toISOString());
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//VIVA-MC//Calendar//JA", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:VIVA-MC イベント", "X-WR-TIMEZONE:Asia/Tokyo", "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "BEGIN:VEVENT", "UID:resource-reset@viva-mc.net", `DTSTAMP:${now}`,
    "DTSTART;VALUE=DATE:20260915", "RRULE:FREQ=MONTHLY;BYMONTHDAY=15",
    "SUMMARY:資源ワールドのリセット（0時）", `URL:${origin}/resource.html`,
    "DESCRIPTION:資源ワールドが作り直されます。置いたものは消えるので、前日までに持ち帰ってください。", "END:VEVENT",
  ];
  const dayAfter = (ymd) => {
    const d = new Date(`${ymd}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10).replace(/-/g, "");
  };
  for (const e of events) {
    const url = !e.url ? "" : /^https:/.test(e.url) ? e.url : `${origin}/${String(e.url).replace(/^\//, "")}`;
    lines.push("BEGIN:VEVENT", `UID:${e.id}@viva-mc.net`, `DTSTAMP:${now}`);
    if (e.allDay && e.dateStart) {
      lines.push(`DTSTART;VALUE=DATE:${e.dateStart.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${dayAfter(e.dateEnd || e.dateStart)}`);
    } else {
      const end = e.end || new Date(Date.parse(e.start) + 2 * 3600000).toISOString();
      lines.push(`DTSTART:${icsTime(e.start)}`, `DTEND:${icsTime(end)}`);
    }
    lines.push(`SUMMARY:${icsText(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
    if (e.place) lines.push(`LOCATION:${icsText(e.place)}`);
    if (url) lines.push(`URL:${url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export default async function handler(req, res) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const origin = `${proto}://${host}`;
  let discord = { configured: false, events: [] };
  try {
    discord = await discordEvents();
  } catch (e) {
    console.error("calendar discord failed", e);
  }
  const events = [...discord.events, ...(await siteEvents(origin))]
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");
  if (String(req.query.format) === "ics") {
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'inline; filename="viva-mc.ics"');
    return res.status(200).send(ics(events, "https://www.viva-mc.net"));
  }
  return res.status(200).json({ discord: discord.configured, resetDay: RESET_DAY, events });
}
