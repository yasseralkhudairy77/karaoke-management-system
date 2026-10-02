const fs = require('fs');
const path = require('path');

const fnbSales = JSON.parse(fs.readFileSync(path.join(__dirname, 'fnb_sales_raw.json'), 'utf8'));
const fnbOrders = JSON.parse(fs.readFileSync(path.join(__dirname, 'fnb_orders_raw.json'), 'utf8'));
const transactions = JSON.parse(fs.readFileSync(path.join(__dirname, 'transactions_raw.json'), 'utf8'));
let stockMovements = null;
if (fs.existsSync(path.join(__dirname, 'stock_movements_raw.json'))) {
  stockMovements = JSON.parse(fs.readFileSync(path.join(__dirname, 'stock_movements_raw.json'), 'utf8'));
}

console.log('--- RECONCILIATION & DEEP BREAKDOWN ---');

// 1. Transaction F&B vs Room vs LC
let totalRoomPaid = 0, totalFnbPaid = 0, totalLcPaid = 0, grandTotalPaid = 0;
let totalRoomAll = 0, totalFnbAll = 0, totalLcAll = 0, grandTotalAll = 0;
const txByDate = {};

for (const t of (transactions.transactions || [])) {
  const isPaid = (t.payment_status || '').toLowerCase() === 'paid';
  const room = Number(t.room_total) || 0;
  const fnb = Number(t.fnb_total) || 0;
  const lc = Number(t.lc_total) || 0;
  const grand = Number(t.grand_total) || 0;
  const date = t.operational_date || (t.created_at ? t.created_at.slice(0, 10) : 'unknown');

  if (!txByDate[date]) {
    txByDate[date] = { count: 0, paidCount: 0, room: 0, fnb: 0, lc: 0, grand: 0, fnbPaid: 0 };
  }
  txByDate[date].count++;
  txByDate[date].room += room;
  txByDate[date].fnb += fnb;
  txByDate[date].lc += lc;
  txByDate[date].grand += grand;

  totalRoomAll += room;
  totalFnbAll += fnb;
  totalLcAll += lc;
  grandTotalAll += grand;

  if (isPaid) {
    txByDate[date].paidCount++;
    txByDate[date].fnbPaid += fnb;
    totalRoomPaid += room;
    totalFnbPaid += fnb;
    totalLcPaid += lc;
    grandTotalPaid += grand;
  }
}

console.log('Transactions Breakdown:');
console.log({
  totalRoomAll,
  totalFnbAll,
  totalLcAll,
  grandTotalAll,
  totalRoomPaid,
  totalFnbPaid,
  totalLcPaid,
  grandTotalPaid
});

// 2. F&B Orders status breakdown
const orderStatusMap = {};
const ordersByDate = {};
let orderSumBilled = 0;
let orderSumPaid = 0;
let orderSumCancelled = 0;
let orderSumOther = 0;

for (const o of (fnbOrders.orders || [])) {
  const st = (o.order_status || 'unknown').toLowerCase();
  orderStatusMap[st] = (orderStatusMap[st] || 0) + 1;

  const total = Number(o.total_amount) || 0;
  if (st === 'billed') orderSumBilled += total;
  else if (st === 'paid') orderSumPaid += total;
  else if (st === 'cancelled') orderSumCancelled += total;
  else orderSumOther += total;

  const date = o.operational_date || (o.created_at ? o.created_at.slice(0, 10) : 'unknown');
  if (!ordersByDate[date]) {
    ordersByDate[date] = { count: 0, total: 0, billedPaid: 0, items: 0 };
  }
  ordersByDate[date].count++;
  ordersByDate[date].total += total;
  if (st === 'billed' || st === 'paid') {
    ordersByDate[date].billedPaid += total;
    ordersByDate[date].items += Number(o.total_items) || 0;
  }
}

console.log('Orders Status Map:', orderStatusMap);
console.log('Order Amount Sums:', { orderSumBilled, orderSumPaid, orderSumCancelled, orderSumOther, totalBilledPlusPaid: orderSumBilled + orderSumPaid });

// 3. Category Breakdown from Menu Sales
const catMap = {};
for (const m of (fnbSales.menu_sales || [])) {
  const cat = m.category || 'Uncategorized';
  if (!catMap[cat]) {
    catMap[cat] = { category: cat, totalQty: 0, totalSales: 0, menuCount: 0 };
  }
  catMap[cat].totalQty += Number(m.quantity_sold) || 0;
  catMap[cat].totalSales += Number(m.gross_sales) || 0;
  catMap[cat].menuCount++;
}
const catList = Object.values(catMap).sort((a, b) => b.totalSales - a.totalSales);
console.log('Categories:', catList);

// 4. Daily Breakdown Table
const allDates = Array.from(new Set([...Object.keys(txByDate), ...Object.keys(ordersByDate)])).sort();
const dailyBreakdown = allDates.map(d => ({
  date: d,
  txFnbTotal: txByDate[d]?.fnb || 0,
  txFnbPaid: txByDate[d]?.fnbPaid || 0,
  orderBilledPaid: ordersByDate[d]?.billedPaid || 0,
  orderCount: ordersByDate[d]?.count || 0,
  itemCount: ordersByDate[d]?.items || 0
}));

console.log('Daily Breakdown (sample first 5 and last 5):');
console.log(dailyBreakdown.slice(0, 5));
console.log(dailyBreakdown.slice(-5));

// Write complete processed breakdown for easy inspection
fs.writeFileSync(path.join(__dirname, 'fnb_processed_report.json'), JSON.stringify({
  summary: {
    fnbSalesSummary: fnbSales.summary,
    transactionsSummary: {
      totalRoomAll,
      totalFnbAll,
      totalLcAll,
      grandTotalAll,
      totalRoomPaid,
      totalFnbPaid,
      totalLcPaid,
      grandTotalPaid
    },
    ordersStatus: orderStatusMap,
    ordersAmount: { orderSumBilled, orderSumPaid, orderSumCancelled, totalBilledPlusPaid: orderSumBilled + orderSumPaid }
  },
  categories: catList,
  topMenusByRevenue: [...fnbSales.menu_sales].sort((a, b) => b.gross_sales - a.gross_sales).slice(0, 15),
  topMenusByQty: [...fnbSales.menu_sales].sort((a, b) => b.quantity_sold - a.quantity_sold).slice(0, 15),
  dailyBreakdown
}, null, 2));

console.log('Successfully written fnb_processed_report.json');
