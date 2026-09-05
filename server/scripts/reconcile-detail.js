const fs = require('fs');
const path = require('path');

const fnbSales = JSON.parse(fs.readFileSync(path.join(__dirname, 'fnb_sales_raw.json'), 'utf8'));
const fnbOrders = JSON.parse(fs.readFileSync(path.join(__dirname, 'fnb_orders_raw.json'), 'utf8'));
const transactions = JSON.parse(fs.readFileSync(path.join(__dirname, 'transactions_raw.json'), 'utf8'));

// 1. Check orders by room_id
const ordersByRoom = {};
let fnbGeneralTotal = 0;
let fnbGeneralCount = 0;

for (const o of (fnbOrders.orders || [])) {
  const rId = o.room_id || 'UNKNOWN';
  if (!ordersByRoom[rId]) ordersByRoom[rId] = { count: 0, billedPaidCount: 0, total: 0 };
  ordersByRoom[rId].count++;
  if (o.order_status === 'billed' || o.order_status === 'paid') {
    ordersByRoom[rId].billedPaidCount++;
    ordersByRoom[rId].total += Number(o.total_amount || 0);
  }
  if (rId === 'FNB-GENERAL') {
    fnbGeneralCount++;
    fnbGeneralTotal += Number(o.total_amount || 0);
  }
}
console.log('Orders By Room:', ordersByRoom);
console.log('FNB General:', { fnbGeneralCount, fnbGeneralTotal });

// 2. Unpaid transactions
const unpaidTx = transactions.transactions.filter(t => (t.payment_status || '').toLowerCase() === 'unpaid');
console.log('Unpaid Transactions Count:', unpaidTx.length);
console.log('Unpaid Transactions:', unpaidTx.map(t => ({
  id: t.transaction_id,
  room: t.room_name,
  date: t.operational_date || t.created_at,
  room_total: t.room_total,
  fnb_total: t.fnb_total,
  grand_total: t.grand_total,
  cashier: t.cashier_name
})));

// Total F&B in unpaid transactions:
const unpaidFnbTotal = unpaidTx.reduce((sum, t) => sum + (Number(t.fnb_total) || 0), 0);
console.log('Total F&B in Unpaid Transactions:', unpaidFnbTotal);

// 3. Compare Transaction fnb_order_ids with actual FnbOrders
let txFnbTotalSum = 0;
for (const t of transactions.transactions) {
  txFnbTotalSum += Number(t.fnb_total || 0);
}
console.log('Sum of fnb_total in all transactions:', txFnbTotalSum);
console.log('Total F&B sales reported by getTodayFnbSalesReport:', fnbSales.summary.total_fnb_sales);
console.log('Delta (Sales Report - Transactions):', fnbSales.summary.total_fnb_sales - txFnbTotalSum);

