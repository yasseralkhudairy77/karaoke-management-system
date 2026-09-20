const db = require('../db');
const { successResponse, errorResponse } = require('../utils/response');
const { getOperationalDate, getOperationalDateRange } = require('../utils/operationalDate');

function toNumber(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function calculateDeltaPercent(current, compare) {
  const cur = toNumber(current, 0);
  const cmp = toNumber(compare, 0);
  if (cmp === 0) {
    return cur > 0 ? 100 : 0;
  }
  return Math.round(((cur - cmp) / cmp) * 1000) / 10;
}

function generateDateList(startStr, endStr) {
  const dates = [];
  const [sY, sM, sD] = startStr.split('-').map(Number);
  const [eY, eM, eD] = endStr.split('-').map(Number);
  let cur = new Date(Date.UTC(sY, sM - 1, sD));
  const end = new Date(Date.UTC(eY, eM - 1, eD));
  while (cur <= end) {
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const d = String(cur.getUTCDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
  const dayNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  return `${d} ${monthNames[m - 1]} (${dayNames[dt.getUTCDay()]})`;
}

/**
 * Calculates shift-adjusted start and end comparison dates
 */
function getComparisonRange(startDate, endDate, compareTo = 'previous_period') {
  const [sY, sM, sD] = startDate.split('-').map(Number);
  const [eY, eM, eD] = endDate.split('-').map(Number);

  const startMs = Date.UTC(sY, sM - 1, sD);
  const endMs = Date.UTC(eY, eM - 1, eD);
  const dayMs = 24 * 60 * 60 * 1000;
  const durationDays = Math.max(1, Math.round((endMs - startMs) / dayMs) + 1);

  if (compareTo === 'same_day_last_week') {
    const cmpStartMs = startMs - (7 * dayMs);
    const cmpEndMs = endMs - (7 * dayMs);
    const cmpStart = new Date(cmpStartMs);
    const cmpEnd = new Date(cmpEndMs);

    const csStr = `${cmpStart.getUTCFullYear()}-${String(cmpStart.getUTCMonth() + 1).padStart(2, '0')}-${String(cmpStart.getUTCDate()).padStart(2, '0')}`;
    const ceStr = `${cmpEnd.getUTCFullYear()}-${String(cmpEnd.getUTCMonth() + 1).padStart(2, '0')}-${String(cmpEnd.getUTCDate()).padStart(2, '0')}`;
    return { compareStartDate: csStr, compareEndDate: ceStr, durationDays };
  }

  // default: previous_period
  const cmpEndMs = startMs - dayMs;
  const cmpStartMs = cmpEndMs - ((durationDays - 1) * dayMs);
  const cmpStart = new Date(cmpStartMs);
  const cmpEnd = new Date(cmpEndMs);

  const csStr = `${cmpStart.getUTCFullYear()}-${String(cmpStart.getUTCMonth() + 1).padStart(2, '0')}-${String(cmpStart.getUTCDate()).padStart(2, '0')}`;
  const ceStr = `${cmpEnd.getUTCFullYear()}-${String(cmpEnd.getUTCMonth() + 1).padStart(2, '0')}-${String(cmpEnd.getUTCDate()).padStart(2, '0')}`;
  return { compareStartDate: csStr, compareEndDate: ceStr, durationDays };
}

/**
 * Main Analytics Aggregation Controller
 */
async function getOperationalAnalytics(req, res) {
  try {
    let period = String(req.query.period || 'today').trim();
    if (period === 'this_week') period = 'last7days';
    if (period === 'this_month') period = 'thismonth';
    const customStart = String(req.query.start_date || '').trim();
    const customEnd = String(req.query.end_date || '').trim();
    const compareTo = String(req.query.compare_to || 'previous_period').trim();
    const roomFilter = String(req.query.room_filter || 'all').trim();

    const { startDate, endDate } = getOperationalDateRange(period, customStart, customEnd);
    const { compareStartDate, compareEndDate, durationDays } = getComparisonRange(startDate, endDate, compareTo);

    // 1. Total rooms for RevPAH calculation
    const roomsRes = await db.query(`
      SELECT room_id, room_name, rate_per_hour 
      FROM rooms 
      WHERE room_id <> 'FNB-GENERAL'
    `);
    const totalRoomsCount = Math.max(1, roomsRes.rowCount || 1);
    const operationalHoursPerDay = 18; // 10:00 to 04:00 standard operational window
    const availableRoomHours = totalRoomsCount * operationalHoursPerDay * durationDays;

    // 2. Metrics for Current Period
    const currentTrxSql = `
      SELECT
        COUNT(*) AS trx_count,
        COALESCE(SUM(grand_total), 0) AS total_revenue,
        COALESCE(SUM(room_total), 0) AS room_revenue,
        COALESCE(SUM(fnb_total), 0) AS fnb_revenue,
        COALESCE(SUM(lc_total), 0) AS lc_revenue,
        COALESCE(SUM(duration_minutes), 0) AS total_room_minutes,
        COALESCE(SUM(COALESCE(promo_discount, 0) + COALESCE(manual_discount, 0) + COALESCE(room_discount_amount, 0)), 0) AS total_discounts,
        COALESCE(SUM(cash_amount), 0) AS total_cash,
        COALESCE(SUM(transfer_amount), 0) AS total_transfer,
        COUNT(CASE WHEN duration_minutes > 120 THEN 1 END) AS extended_sessions_count,
        COUNT(CASE WHEN lc_total > 0 THEN 1 END) AS lc_sessions_count
      FROM transactions
      WHERE operational_date >= $1 AND operational_date <= $2
        AND payment_status = 'paid'
        ${roomFilter !== 'all' ? 'AND room_id = $3' : ''}
    `;
    const currentTrxParams = roomFilter !== 'all' ? [startDate, endDate, roomFilter] : [startDate, endDate];
    const currentTrxRes = await db.query(currentTrxSql, currentTrxParams);
    const cur = currentTrxRes.rows[0] || {};

    // 3. Metrics for Compare Period
    const compareTrxSql = `
      SELECT
        COUNT(*) AS trx_count,
        COALESCE(SUM(grand_total), 0) AS total_revenue,
        COALESCE(SUM(room_total), 0) AS room_revenue,
        COALESCE(SUM(fnb_total), 0) AS fnb_revenue,
        COALESCE(SUM(lc_total), 0) AS lc_revenue,
        COALESCE(SUM(duration_minutes), 0) AS total_room_minutes,
        COALESCE(SUM(COALESCE(promo_discount, 0) + COALESCE(manual_discount, 0) + COALESCE(room_discount_amount, 0)), 0) AS total_discounts,
        COUNT(CASE WHEN duration_minutes > 120 THEN 1 END) AS extended_sessions_count,
        COUNT(CASE WHEN lc_total > 0 THEN 1 END) AS lc_sessions_count
      FROM transactions
      WHERE operational_date >= $1 AND operational_date <= $2
        AND payment_status = 'paid'
        ${roomFilter !== 'all' ? 'AND room_id = $3' : ''}
    `;
    const compareTrxParams = roomFilter !== 'all' ? [compareStartDate, compareEndDate, roomFilter] : [compareStartDate, compareEndDate];
    const compareTrxRes = await db.query(compareTrxSql, compareTrxParams);
    const cmp = compareTrxRes.rows[0] || {};

    // 4. F&B Margin & HPP calculation for Current Period
    const fnbMarginSql = `
      SELECT
        COALESCE(SUM(oi.quantity * oi.price), 0) AS fnb_gross_sales,
        COALESCE(SUM(oi.quantity * COALESCE(m.hpp, 0)), 0) AS fnb_total_hpp
      FROM fnb_order_items oi
      JOIN fnb_orders fo ON oi.order_id = fo.order_id
      LEFT JOIN menu m ON oi.menu_id = m.menu_id
      WHERE fo.order_status = 'billed'
        AND (oi.is_voided IS FALSE OR oi.is_voided IS NULL)
        AND fo.created_at >= ($1::date + TIME '10:00:00') AT TIME ZONE 'Asia/Jakarta'
        AND fo.created_at < (($2::date + 1) + TIME '10:00:00') AT TIME ZONE 'Asia/Jakarta'
    `;
    const fnbMarginRes = await db.query(fnbMarginSql, [startDate, endDate]);
    const fnbGrossSales = toNumber(fnbMarginRes.rows[0]?.fnb_gross_sales, 0);
    const fnbTotalHpp = toNumber(fnbMarginRes.rows[0]?.fnb_total_hpp, 0);
    const fnbGrossProfit = Math.max(0, fnbGrossSales - fnbTotalHpp);
    const fnbMarginPercent = fnbGrossSales > 0 ? Math.round((fnbGrossProfit / fnbGrossSales) * 1000) / 10 : 0;

    // 5. Hourly Peak Load Curve (24 Hours: 10:00 to 09:00 next day)
    const hourlyCurSql = `
      SELECT
        EXTRACT(HOUR FROM (COALESCE(start_time, created_at) AT TIME ZONE 'Asia/Jakarta'))::int AS hour_wib,
        COUNT(*) AS session_count,
        COALESCE(SUM(grand_total), 0) AS hourly_revenue,
        COALESCE(SUM(duration_minutes), 0) / 60.0 AS hourly_room_hours
      FROM transactions
      WHERE operational_date >= $1 AND operational_date <= $2
        AND payment_status = 'paid'
        ${roomFilter !== 'all' ? 'AND room_id = $3' : ''}
      GROUP BY hour_wib
    `;
    const hourlyCurRes = await db.query(hourlyCurSql, currentTrxParams);
    const hourlyCurMap = new Map(hourlyCurRes.rows.map(r => [r.hour_wib, r]));

    const hourlyCmpSql = `
      SELECT
        EXTRACT(HOUR FROM (COALESCE(start_time, created_at) AT TIME ZONE 'Asia/Jakarta'))::int AS hour_wib,
        COUNT(*) AS session_count,
        COALESCE(SUM(grand_total), 0) AS hourly_revenue,
        COALESCE(SUM(duration_minutes), 0) / 60.0 AS hourly_room_hours
      FROM transactions
      WHERE operational_date >= $1 AND operational_date <= $2
        AND payment_status = 'paid'
        ${roomFilter !== 'all' ? 'AND room_id = $3' : ''}
      GROUP BY hour_wib
    `;
    const hourlyCmpRes = await db.query(hourlyCmpSql, compareTrxParams);
    const hourlyCmpMap = new Map(hourlyCmpRes.rows.map(r => [r.hour_wib, r]));

    // Construct full 24-hour sequence starting at 10:00 AM
    const hourlySequence = [];
    for (let i = 0; i < 24; i++) {
      const h = (10 + i) % 24;
      const curRow = hourlyCurMap.get(h) || {};
      const cmpRow = hourlyCmpMap.get(h) || {};

      hourlySequence.push({
        hour: h,
        hourLabel: `${String(h).padStart(2, '0')}:00`,
        currentRevenue: toNumber(curRow.hourly_revenue, 0),
        compareRevenue: toNumber(cmpRow.hourly_revenue, 0),
        currentRoomHours: Math.round(toNumber(curRow.hourly_room_hours, 0) * 10) / 10,
        compareRoomHours: Math.round(toNumber(cmpRow.hourly_room_hours, 0) * 10) / 10,
        currentSessions: toNumber(curRow.session_count, 0),
        compareSessions: toNumber(cmpRow.session_count, 0),
      });
    }

    // 6. Daily Timeline Trend (Date by Date)
    const dailyCurSql = `
      SELECT
        operational_date::text AS date_str,
        COUNT(*) AS session_count,
        COALESCE(SUM(grand_total), 0) AS daily_revenue,
        COALESCE(SUM(duration_minutes), 0) / 60.0 AS daily_room_hours
      FROM transactions
      WHERE operational_date >= $1 AND operational_date <= $2
        AND payment_status = 'paid'
        ${roomFilter !== 'all' ? 'AND room_id = $3' : ''}
      GROUP BY operational_date
      ORDER BY operational_date ASC
    `;
    const dailyCurRes = await db.query(dailyCurSql, currentTrxParams);
    const dailyCurMap = new Map(dailyCurRes.rows.map(r => [String(r.date_str).slice(0, 10), r]));

    const dailyCmpSql = `
      SELECT
        operational_date::text AS date_str,
        COUNT(*) AS session_count,
        COALESCE(SUM(grand_total), 0) AS daily_revenue,
        COALESCE(SUM(duration_minutes), 0) / 60.0 AS daily_room_hours
      FROM transactions
      WHERE operational_date >= $1 AND operational_date <= $2
        AND payment_status = 'paid'
        ${roomFilter !== 'all' ? 'AND room_id = $3' : ''}
      GROUP BY operational_date
      ORDER BY operational_date ASC
    `;
    const dailyCmpRes = await db.query(dailyCmpSql, compareTrxParams);
    const dailyCmpMap = new Map(dailyCmpRes.rows.map(r => [String(r.date_str).slice(0, 10), r]));

    const curDates = generateDateList(startDate, endDate);
    const cmpDates = generateDateList(compareStartDate, compareEndDate);

    const dailySequence = curDates.map((dStr, idx) => {
      const curRow = dailyCurMap.get(dStr) || {};
      const cmpDateStr = cmpDates[idx] || '';
      const cmpRow = cmpDateStr ? (dailyCmpMap.get(cmpDateStr) || {}) : {};

      const curRev = toNumber(curRow.daily_revenue, 0);
      const cmpRev = toNumber(cmpRow.daily_revenue, 0);

      return {
        date: dStr,
        dateLabel: formatDateLabel(dStr),
        compareDate: cmpDateStr,
        compareDateLabel: cmpDateStr ? formatDateLabel(cmpDateStr) : '',
        currentRevenue: curRev,
        compareRevenue: cmpRev,
        currentRoomHours: Math.round(toNumber(curRow.daily_room_hours, 0) * 10) / 10,
        compareRoomHours: Math.round(toNumber(cmpRow.daily_room_hours, 0) * 10) / 10,
        currentSessions: toNumber(curRow.session_count, 0),
        compareSessions: toNumber(cmpRow.session_count, 0),
        deltaPercent: calculateDeltaPercent(curRev, cmpRev),
      };
    });

    // 7. Day of Week Pattern (Senin s/d Minggu)
    let dowStart = startDate;
    let dowEnd = endDate;
    let isDowSampled = false;
    if (durationDays < 7) {
      const [eY, eM, eD] = endDate.split('-').map(Number);
      const eMs = Date.UTC(eY, eM - 1, eD);
      const sDate = new Date(eMs - (27 * 24 * 60 * 60 * 1000));
      dowStart = `${sDate.getUTCFullYear()}-${String(sDate.getUTCMonth() + 1).padStart(2, '0')}-${String(sDate.getUTCDate()).padStart(2, '0')}`;
      dowEnd = endDate;
      isDowSampled = true;
    }

    const dowSql = `
      SELECT
        EXTRACT(ISODOW FROM operational_date)::int AS day_num,
        COUNT(DISTINCT operational_date) AS days_count,
        COUNT(*) AS total_sessions,
        COALESCE(SUM(grand_total), 0) AS total_revenue,
        COALESCE(SUM(duration_minutes), 0) / 60.0 AS total_room_hours
      FROM transactions
      WHERE operational_date >= $1 AND operational_date <= $2
        AND payment_status = 'paid'
        ${roomFilter !== 'all' ? 'AND room_id = $3' : ''}
      GROUP BY day_num
      ORDER BY day_num ASC
    `;
    const dowParams = roomFilter !== 'all' ? [dowStart, dowEnd, roomFilter] : [dowStart, dowEnd];
    const dowRes = await db.query(dowSql, dowParams);
    const dowMap = new Map(dowRes.rows.map(r => [toNumber(r.day_num, 0), r]));

    const dayNamesId = ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
    const dowList = [];
    let maxAvg = -1;
    let minAvg = Infinity;
    let peakDayNum = 6;
    let slowestDayNum = 2;
    let totalWeeklyRev = 0;

    for (let d = 1; d <= 7; d++) {
      const row = dowMap.get(d) || {};
      const rev = toNumber(row.total_revenue, 0);
      const dCount = Math.max(1, toNumber(row.days_count, 1));
      const avgRev = Math.round(rev / dCount);
      const sessions = toNumber(row.total_sessions, 0);
      const hours = Math.round(toNumber(row.total_room_hours, 0) * 10) / 10;
      totalWeeklyRev += rev;

      if (avgRev > maxAvg && rev > 0) {
        maxAvg = avgRev;
        peakDayNum = d;
      }
      if (avgRev < minAvg && rev > 0) {
        minAvg = avgRev;
        slowestDayNum = d;
      }

      dowList.push({
        dayNum: d,
        dayName: dayNamesId[d],
        totalRevenue: rev,
        avgRevenue: avgRev,
        daysCount: dCount,
        totalSessions: sessions,
        totalRoomHours: hours,
        percentOfTotal: 0,
        isPeak: false,
        isSlowest: false,
      });
    }

    dowList.forEach(item => {
      item.percentOfTotal = totalWeeklyRev > 0 ? Math.round((item.totalRevenue / totalWeeklyRev) * 1000) / 10 : 0;
      item.isPeak = item.dayNum === peakDayNum;
      item.isSlowest = item.dayNum === slowestDayNum && maxAvg > minAvg;
    });

    // 8. Room Leaderboard & Utilization
    const roomLeaderboardSql = `
      SELECT
        t.room_id,
        t.room_name,
        COUNT(*) AS total_sessions,
        COALESCE(SUM(t.duration_minutes), 0) / 60.0 AS total_hours,
        COALESCE(SUM(t.room_total), 0) AS total_room_revenue,
        COALESCE(SUM(t.grand_total), 0) AS total_grand_revenue,
        COUNT(CASE WHEN t.duration_minutes > 120 THEN 1 END) AS extended_sessions
      FROM transactions t
      WHERE t.operational_date >= $1 AND t.operational_date <= $2
        AND t.payment_status = 'paid'
      GROUP BY t.room_id, t.room_name
      ORDER BY total_hours DESC, total_room_revenue DESC
      LIMIT 10
    `;
    const roomLeaderboardRes = await db.query(roomLeaderboardSql, [startDate, endDate]);
    const roomLeaderboard = roomLeaderboardRes.rows.map(row => {
      const hours = Math.round(toNumber(row.total_hours, 0) * 10) / 10;
      const sessions = toNumber(row.total_sessions, 0);
      const extended = toNumber(row.extended_sessions, 0);
      const maxPossibleHours = operationalHoursPerDay * durationDays;
      const occupancyRate = maxPossibleHours > 0 ? Math.min(100, Math.round((hours / maxPossibleHours) * 1000) / 10) : 0;
      const extensionRate = sessions > 0 ? Math.round((extended / sessions) * 1000) / 10 : 0;

      return {
        room_id: row.room_id,
        room_name: row.room_name,
        total_sessions: sessions,
        total_hours: hours,
        occupancy_rate_percent: occupancyRate,
        total_room_revenue: toNumber(row.total_room_revenue, 0),
        total_grand_revenue: toNumber(row.total_grand_revenue, 0),
        extension_rate_percent: extensionRate,
      };
    });

    // 7. Top F&B Best Sellers
    const fnbLeaderboardSql = `
      SELECT
        oi.menu_id AS item_id,
        oi.menu_name AS item_name,
        COALESCE(m.category, oi.category, 'Lainnya') AS category,
        SUM(oi.quantity) AS qty_sold,
        SUM(oi.quantity * oi.price) AS total_sales,
        SUM(oi.quantity * COALESCE(m.hpp, 0)) AS total_hpp
      FROM fnb_order_items oi
      JOIN fnb_orders fo ON oi.order_id = fo.order_id
      LEFT JOIN menu m ON oi.menu_id = m.menu_id
      WHERE fo.order_status = 'billed'
        AND (oi.is_voided IS FALSE OR oi.is_voided IS NULL)
        AND fo.created_at >= ($1::date + TIME '10:00:00') AT TIME ZONE 'Asia/Jakarta'
        AND fo.created_at < (($2::date + 1) + TIME '10:00:00') AT TIME ZONE 'Asia/Jakarta'
      GROUP BY oi.menu_id, oi.menu_name, m.category, oi.category
      ORDER BY total_sales DESC
      LIMIT 10
    `;
    const fnbLeaderboardRes = await db.query(fnbLeaderboardSql, [startDate, endDate]);
    const fnbLeaderboard = fnbLeaderboardRes.rows.map(row => {
      const sales = toNumber(row.total_sales, 0);
      const hpp = toNumber(row.total_hpp, 0);
      const profit = Math.max(0, sales - hpp);
      const margin = sales > 0 ? Math.round((profit / sales) * 1000) / 10 : 0;
      return {
        item_id: row.item_id,
        item_name: row.item_name,
        category: row.category,
        qty_sold: toNumber(row.qty_sold, 0),
        total_sales: sales,
        total_profit: profit,
        margin_percent: margin,
      };
    });

    // 8. KPI Aggregation Calculations
    const curRevenue = toNumber(cur.total_revenue, 0);
    const cmpRevenue = toNumber(cmp.total_revenue, 0);
    const curRoomRev = toNumber(cur.room_revenue, 0);
    const cmpRoomRev = toNumber(cmp.room_revenue, 0);
    const curTrxCount = toNumber(cur.trx_count, 0);
    const cmpTrxCount = toNumber(cmp.trx_count, 0);

    // RevPAH
    const curRevPah = availableRoomHours > 0 ? Math.round(curRoomRev / availableRoomHours) : 0;
    const cmpRevPah = availableRoomHours > 0 ? Math.round(cmpRoomRev / availableRoomHours) : 0;

    // Average Order Value (Spend per Room)
    const curAov = curTrxCount > 0 ? Math.round(curRevenue / curTrxCount) : 0;
    const cmpAov = cmpTrxCount > 0 ? Math.round(cmpRevenue / cmpTrxCount) : 0;

    // Extension Rate
    const curExtSessions = toNumber(cur.extended_sessions_count, 0);
    const cmpExtSessions = toNumber(cmp.extended_sessions_count, 0);
    const curExtRate = curTrxCount > 0 ? Math.round((curExtSessions / curTrxCount) * 1000) / 10 : 0;
    const cmpExtRate = cmpTrxCount > 0 ? Math.round((cmpExtSessions / cmpTrxCount) * 1000) / 10 : 0;

    // LC Attachment Rate
    const curLcSessions = toNumber(cur.lc_sessions_count, 0);
    const cmpLcSessions = toNumber(cmp.lc_sessions_count, 0);
    const curLcRate = curTrxCount > 0 ? Math.round((curLcSessions / curTrxCount) * 1000) / 10 : 0;
    const cmpLcRate = cmpTrxCount > 0 ? Math.round((cmpLcSessions / cmpTrxCount) * 1000) / 10 : 0;

    // Discount Leakage
    const curDiscounts = toNumber(cur.total_discounts, 0);
    const cmpDiscounts = toNumber(cmp.total_discounts, 0);

    return successResponse(res, {
      filters: {
        period,
        startDate,
        endDate,
        compareTo,
        compareStartDate,
        compareEndDate,
        roomFilter,
        durationDays,
      },
      kpi: {
        totalRevenue: {
          current: curRevenue,
          compare: cmpRevenue,
          deltaPercent: calculateDeltaPercent(curRevenue, cmpRevenue),
        },
        revPah: {
          current: curRevPah,
          compare: cmpRevPah,
          deltaPercent: calculateDeltaPercent(curRevPah, cmpRevPah),
          availableHours: availableRoomHours,
        },
        avgSpendPerRoom: {
          current: curAov,
          compare: cmpAov,
          deltaPercent: calculateDeltaPercent(curAov, cmpAov),
        },
        fnbGrossMargin: {
          currentPercent: fnbMarginPercent,
          grossSales: fnbGrossSales,
          grossProfit: fnbGrossProfit,
          totalHpp: fnbTotalHpp,
        },
        roomExtensionRate: {
          currentPercent: curExtRate,
          comparePercent: cmpExtRate,
          deltaPercent: calculateDeltaPercent(curExtRate, cmpExtRate),
          extendedSessions: curExtSessions,
          totalSessions: curTrxCount,
        },
        lcAttachmentRate: {
          currentPercent: curLcRate,
          comparePercent: cmpLcRate,
          deltaPercent: calculateDeltaPercent(curLcRate, cmpLcRate),
          lcSessions: curLcSessions,
          totalSessions: curTrxCount,
        },
        discountLeakage: {
          current: curDiscounts,
          compare: cmpDiscounts,
          deltaPercent: calculateDeltaPercent(curDiscounts, cmpDiscounts),
        },
      },
      revenueComposition: {
        roomTotal: curRoomRev,
        fnbTotal: toNumber(cur.fnb_revenue, 0),
        lcTotal: toNumber(cur.lc_revenue, 0),
        discounts: curDiscounts,
        netRevenue: curRevenue,
      },
      paymentBreakdown: {
        cash: toNumber(cur.total_cash, 0),
        transfer: toNumber(cur.total_transfer, 0),
      },
      hourlyTraffic: hourlySequence,
      dailyTrend: dailySequence,
      dayOfWeekPattern: {
        days: dowList,
        peakDay: dayNamesId[peakDayNum],
        slowestDay: dayNamesId[slowestDayNum],
        isSampled: isDowSampled,
        sampleDaysCount: isDowSampled ? 28 : durationDays,
      },
      roomLeaderboard,
      fnbLeaderboard,
    });
  } catch (err) {
    console.error('getOperationalAnalytics error:', err);
    return errorResponse(res, err.message);
  }
}

module.exports = {
  getOperationalAnalytics,
  getComparisonRange,
  calculateDeltaPercent,
  generateDateList,
  formatDateLabel,
};
