const assert = require('assert');

// Simulasi logika format dan render yang ada di owner.html
function formatDisplayDate(value) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
  return `${String(date.getDate()).padStart(2, "0")}-${monthNames[date.getMonth()]}-${date.getFullYear()}`;
}

function parseDailyTrendItem(d, maxDaily) {
  const rev = Number(d.currentRevenue ?? d.daily_revenue ?? 0);
  const pct = Math.max(rev > 0 ? 6 : 2, Math.round((rev / maxDaily) * 100));
  const rawDate = d.date || d.operational_date;
  const dateLabel = d.dateLabel || formatDisplayDate(rawDate);
  const sessions = d.currentSessions ?? d.trx_count ?? 0;
  const hours = Number(d.currentRoomHours ?? d.daily_room_hours ?? 0);
  return { rev, pct, dateLabel, sessions, hours };
}

function parseHourlyItem(h, maxHourly) {
  const rev = Number(h.currentRevenue ?? h.hourly_revenue ?? 0);
  const pct = Math.max(rev > 0 ? 6 : 2, Math.round((rev / maxHourly) * 100));
  const hourNum = h.hour ?? h.hour_wib ?? 0;
  const hourText = h.hourLabel || `${String(hourNum).padStart(2, '0')}:00`;
  const sessions = h.currentSessions ?? h.session_count ?? 0;
  const hours = Number(h.currentRoomHours ?? h.hourly_room_hours ?? 0);
  return { rev, pct, hourText, sessions, hours };
}

function parseDowItem(d, maxDow) {
  const rev = Number(d.totalRevenue ?? d.total_revenue ?? 0);
  const pct = Math.max(rev > 0 ? 6 : 2, Math.round((rev / maxDow) * 100));
  const dayName = d.dayName || d.day_name || "";
  const sessions = d.totalSessions ?? d.total_sessions ?? 0;
  const hours = Number(d.totalRoomHours ?? d.total_room_hours ?? 0);
  return { rev, pct, dayName, sessions, hours };
}

function parseRoomLeaderboardItem(room, topMax) {
  const rev = Number(room.total_grand_revenue ?? room.total_revenue ?? 0);
  const pct = Math.max(5, Math.round((rev / topMax) * 100));
  const sessions = room.total_sessions ?? room.session_count ?? 0;
  const name = room.room_name || room.room_id || '';
  return { rev, pct, sessions, name };
}

function parseFnbLeaderboardItem(item, topMax) {
  const rev = Number(item.total_sales ?? item.total_revenue ?? 0);
  const pct = Math.max(5, Math.round((rev / topMax) * 100));
  const name = item.item_name || item.menu_name || 'Item';
  const qty = item.qty_sold ?? item.total_quantity ?? 0;
  return { rev, pct, qty, name };
}

console.log('🧪 Testing Owner Analytics Render Compatibility (Dual-Payload Support)...');

// Case 1: Payload live API (camelCase baru)
const camelDaily = {
  date: "2026-09-21",
  dateLabel: "21 Sep",
  currentRevenue: 2400000,
  currentRoomHours: 14.5,
  currentSessions: 6
};
const parsed1 = parseDailyTrendItem(camelDaily, 2400000);
assert.strictEqual(parsed1.rev, 2400000, 'Revenue must be 2,400,000');
assert.strictEqual(parsed1.pct, 100, 'Bar percentage must be 100%');
assert.strictEqual(parsed1.dateLabel, "21 Sep", 'Date label must be 21 Sep');
assert.strictEqual(parsed1.sessions, 6, 'Sessions must be 6');
assert.strictEqual(parsed1.hours, 14.5, 'Room hours must be 14.5');

// Case 2: Payload legacy / fallback (snake_case lama)
const snakeDaily = {
  operational_date: "2026-09-22",
  daily_revenue: 1200000,
  daily_room_hours: 8.0,
  trx_count: 3
};
const parsed2 = parseDailyTrendItem(snakeDaily, 2400000);
assert.strictEqual(parsed2.rev, 1200000, 'Revenue must be 1,200,000');
assert.strictEqual(parsed2.pct, 50, 'Bar percentage must be 50%');
assert.strictEqual(parsed2.dateLabel, "22-Sep-2026", 'Date label must be formatted 22-Sep-2026');
assert.strictEqual(parsed2.sessions, 3, 'Sessions must be 3');
assert.strictEqual(parsed2.hours, 8.0, 'Room hours must be 8.0');

// Case 3: Hourly Traffic
const camelHourly = { hour: 21, hourLabel: "21:00", currentRevenue: 1500000, currentSessions: 4, currentRoomHours: 7.5 };
const parsedHourly1 = parseHourlyItem(camelHourly, 1500000);
assert.strictEqual(parsedHourly1.rev, 1500000);
assert.strictEqual(parsedHourly1.hourText, "21:00");
assert.strictEqual(parsedHourly1.sessions, 4);

const snakeHourly = { hour_wib: 22, hourly_revenue: 800000, session_count: 2, hourly_room_hours: 4.0 };
const parsedHourly2 = parseHourlyItem(snakeHourly, 1500000);
assert.strictEqual(parsedHourly2.rev, 800000);
assert.strictEqual(parsedHourly2.hourText, "22:00");
assert.strictEqual(parsedHourly2.sessions, 2);

// Case 4: Day of Week
const camelDow = { dayNum: 6, dayName: "Sabtu", totalRevenue: 3500000, totalSessions: 10, totalRoomHours: 20 };
const parsedDow1 = parseDowItem(camelDow, 3500000);
assert.strictEqual(parsedDow1.rev, 3500000);
assert.strictEqual(parsedDow1.dayName, "Sabtu");
assert.strictEqual(parsedDow1.sessions, 10);

const snakeDow = { day_name: "Minggu", total_revenue: 2800000, total_sessions: 8, total_room_hours: 16 };
const parsedDow2 = parseDowItem(snakeDow, 3500000);
assert.strictEqual(parsedDow2.rev, 2800000);
assert.strictEqual(parsedDow2.dayName, "Minggu");
assert.strictEqual(parsedDow2.sessions, 8);

// Case 5: Leaderboards
const camelRoom = { room_id: "VIP1", room_name: "VIP 01", total_grand_revenue: 4000000, total_sessions: 8 };
const parsedRoom1 = parseRoomLeaderboardItem(camelRoom, 4000000);
assert.strictEqual(parsedRoom1.rev, 4000000);
assert.strictEqual(parsedRoom1.sessions, 8);
assert.strictEqual(parsedRoom1.name, "VIP 01");

const snakeRoom = { room_id: "R01", room_name: "Room 01", total_revenue: 1500000, session_count: 4 };
const parsedRoom2 = parseRoomLeaderboardItem(snakeRoom, 4000000);
assert.strictEqual(parsedRoom2.rev, 1500000);
assert.strictEqual(parsedRoom2.sessions, 4);
assert.strictEqual(parsedRoom2.name, "Room 01");

const camelFnb = { item_id: "MN-1", item_name: "Snack Combo", total_sales: 600000, qty_sold: 12 };
const parsedFnb1 = parseFnbLeaderboardItem(camelFnb, 600000);
assert.strictEqual(parsedFnb1.rev, 600000);
assert.strictEqual(parsedFnb1.qty, 12);
assert.strictEqual(parsedFnb1.name, "Snack Combo");

const snakeFnb = { menu_id: "MN-2", menu_name: "Es Teh", total_revenue: 200000, total_quantity: 20 };
const parsedFnb2 = parseFnbLeaderboardItem(snakeFnb, 600000);
assert.strictEqual(parsedFnb2.rev, 200000);
assert.strictEqual(parsedFnb2.qty, 20);
assert.strictEqual(parsedFnb2.name, "Es Teh");

console.log('  ✓ PASS: Both camelCase and snake_case payloads parse flawlessly into valid UI numbers & labels');
console.log('🎉 All Owner Analytics Render Compatibility Tests Passed!\n');
