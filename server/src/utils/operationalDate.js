/**
 * Operational Date Utility for Happy Song Karaoke Management System.
 * Cutoff Hour: 10:00 AM Asia/Jakarta (UTC+7).
 * Formula: operational_date = Date(datetime - 10 hours)
 */

const OPERATIONAL_CUTOFF_HOUR = 10;

function getOperationalDate(dateInput) {
  const dt = dateInput ? new Date(dateInput) : new Date();
  
  // Shift by -10 hours to compute operational day
  const shifted = new Date(dt.getTime() - OPERATIONAL_CUTOFF_HOUR * 60 * 60 * 1000);
  
  // Format as YYYY-MM-DD in local time
  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

function getOperationalDateRange(period, startDate, endDate) {
  const todayStr = getOperationalDate();
  
  if (!period || period === 'today' || period === 'activeshift') {
    return { startDate: todayStr, endDate: todayStr };
  }
  
  if (period === 'yesterday') {
    const today = new Date(todayStr);
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const yStr = getOperationalDate(yesterday);
    return { startDate: yStr, endDate: yStr };
  }
  
  if (period === 'last7days') {
    const today = new Date(todayStr);
    const last7 = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
    const startStr = getOperationalDate(last7);
    return { startDate: startStr, endDate: todayStr };
  }
  
  if (period === 'thismonth') {
    const todayParts = todayStr.split('-');
    const startStr = `${todayParts[0]}-${todayParts[1]}-01`;
    return { startDate: startStr, endDate: todayStr };
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
  
  return { startDate: todayStr, endDate: todayStr };
}

module.exports = {
  OPERATIONAL_CUTOFF_HOUR,
  getOperationalDate,
  getOperationalDateRange,
};
