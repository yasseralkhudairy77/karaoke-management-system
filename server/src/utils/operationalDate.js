/**
 * Operational Date Utility for Happy Song Karaoke Management System.
 * Timezone: Asia/Jakarta (UTC+7).
 * Operational Cutoff Hour: 10:00 AM Asia/Jakarta.
 * Formula: operational_date = Date(datetime - 10 hours)
 */

const OPERATIONAL_CUTOFF_HOUR = 10;
const TIMEZONE_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Jakarta UTC+7 offset

/**
 * Returns Asia/Jakarta Date components from any Date object or ISO string.
 */
function getJakartaComponents(dateInput) {
  const dt = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(dt.getTime())) throw new Error('Invalid Date input');

  // Convert UTC timestamp to Asia/Jakarta local milliseconds
  const jakartaMs = dt.getTime() + TIMEZONE_OFFSET_MS;
  const jakartaDate = new Date(jakartaMs);

  return {
    year: jakartaDate.getUTCFullYear(),
    month: jakartaDate.getUTCMonth() + 1,
    day: jakartaDate.getUTCDate(),
    hours: jakartaDate.getUTCHours(),
    minutes: jakartaDate.getUTCMinutes(),
    seconds: jakartaDate.getUTCSeconds(),
    milliseconds: jakartaDate.getUTCMilliseconds(),
    rawDate: dt
  };
}

/**
 * Computes the operational date string (YYYY-MM-DD) based on 10:00 AM WIB cutoff.
 */
function getOperationalDate(dateInput) {
  const dt = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(dt.getTime())) throw new Error('Invalid Date input');

  // Shift by -10 hours in Asia/Jakarta timezone
  const shiftedMs = dt.getTime() - (OPERATIONAL_CUTOFF_HOUR * 60 * 60 * 1000);
  const shiftedComp = getJakartaComponents(new Date(shiftedMs));

  const yyyy = String(shiftedComp.year).padStart(4, '0');
  const mm = String(shiftedComp.month).padStart(2, '0');
  const dd = String(shiftedComp.day).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Formats date as ISO string in Asia/Jakarta timezone (+07:00).
 */
function toJakartaIsoString(dateInput) {
  const dt = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(dt.getTime())) return '';

  const c = getJakartaComponents(dt);
  const yyyy = String(c.year).padStart(4, '0');
  const mm = String(c.month).padStart(2, '0');
  const dd = String(c.day).padStart(2, '0');
  const hh = String(c.hours).padStart(2, '0');
  const mi = String(c.minutes).padStart(2, '0');
  const ss = String(c.seconds).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+07:00`;
}

/**
 * Returns start and end operational dates (YYYY-MM-DD) for report filtering.
 */
function getOperationalDateRange(period, startDate, endDate, refDate = new Date()) {
  const currentOpDate = getOperationalDate(refDate);

  if (!period || period === 'today' || period === 'activeshift') {
    return { startDate: currentOpDate, endDate: currentOpDate };
  }

  const [cYear, cMonth, cDay] = currentOpDate.split('-').map(Number);

  if (period === 'yesterday') {
    // 1 operational day prior
    const prevMs = new Date(Date.UTC(cYear, cMonth - 1, cDay)).getTime() - (24 * 60 * 60 * 1000);
    const prevDate = new Date(prevMs);
    const yyyy = String(prevDate.getUTCFullYear()).padStart(4, '0');
    const mm = String(prevDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(prevDate.getUTCDate()).padStart(2, '0');
    const yStr = `${yyyy}-${mm}-${dd}`;
    return { startDate: yStr, endDate: yStr };
  }

  if (period === 'last7days') {
    const startMs = new Date(Date.UTC(cYear, cMonth - 1, cDay)).getTime() - (6 * 24 * 60 * 60 * 1000);
    const startDateObj = new Date(startMs);
    const yyyy = String(startDateObj.getUTCFullYear()).padStart(4, '0');
    const mm = String(startDateObj.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(startDateObj.getUTCDate()).padStart(2, '0');
    const sStr = `${yyyy}-${mm}-${dd}`;
    return { startDate: sStr, endDate: currentOpDate };
  }

  if (period === 'thismonth') {
    const mm = String(cMonth).padStart(2, '0');
    const sStr = `${cYear}-${mm}-01`;
    return { startDate: sStr, endDate: currentOpDate };
  }

  if (period === 'all') {
    return { startDate: '1970-01-01', endDate: '2099-12-31' };
  }

  if (period === 'custom') {
    if (!startDate || !endDate) {
      throw new Error('Tanggal mulai dan tanggal akhir wajib diisi untuk periode custom.');
    }
    if (startDate > endDate) {
      throw new Error('Tanggal mulai tidak boleh lebih besar dari tanggal akhir.');
    }
    return { startDate, endDate };
  }

  return { startDate: currentOpDate, endDate: currentOpDate };
}

module.exports = {
  OPERATIONAL_CUTOFF_HOUR,
  getOperationalDate,
  toJakartaIsoString,
  getOperationalDateRange,
  getJakartaComponents
};
