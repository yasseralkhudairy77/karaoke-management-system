const fetch = globalThis.fetch;
const fs = require('fs');
const path = require('path');

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzjBoz2FvaRqTdsmdR-eYQBRvzPVqGV0lf-FPJlDgfFDQ0bxSWr8JVpgxICBwIkI7CK/exec";

async function fetchJson(action, params = {}) {
  const url = new URL(SCRIPT_URL);
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  console.log(`Fetching ${action}...`);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return await res.json();
}

async function runDeepAnalysis() {
  const periodParams = {
    period: 'custom',
    start_date: '2026-07-31',
    end_date: '2026-08-30'
  };

  const [fnbSales, fnbOrders, transactions, stockMovements] = await Promise.all([
    fetchJson('getTodayFnbSalesReport', periodParams),
    fetchJson('getTodayFnbOrders', periodParams),
    fetchJson('getTodayTransactions', periodParams),
    fetchJson('getTodayStockMovements', periodParams).catch(e => ({ error: e.message }))
  ]);

  const output = {
    analyzed_at: new Date().toISOString(),
    period: '2026-07-31 s/d 2026-08-30',
    fnbSalesSummary: fnbSales.summary,
    fnbSalesMenuCount: fnbSales.menu_sales?.length,
    fnbOrdersSummary: fnbOrders.summary,
    fnbOrdersCount: fnbOrders.orders?.length,
    transactionsCount: transactions.transactions?.length,
    transactionsSummary: transactions.summary
  };

  console.log('=== F&B SALES SUMMARY ===');
  console.log(JSON.stringify(fnbSales.summary, null, 2));

  console.log('=== F&B ORDERS SUMMARY ===');
  console.log(JSON.stringify(fnbOrders.summary, null, 2));

  console.log('=== TRANSACTIONS SUMMARY ===');
  console.log(JSON.stringify(transactions.summary, null, 2));

  // Save raw data to disk so we can analyze it thoroughly without re-fetching
  fs.writeFileSync(path.join(__dirname, 'fnb_sales_raw.json'), JSON.stringify(fnbSales, null, 2));
  fs.writeFileSync(path.join(__dirname, 'fnb_orders_raw.json'), JSON.stringify(fnbOrders, null, 2));
  fs.writeFileSync(path.join(__dirname, 'transactions_raw.json'), JSON.stringify(transactions, null, 2));
  if (stockMovements && !stockMovements.error) {
    fs.writeFileSync(path.join(__dirname, 'stock_movements_raw.json'), JSON.stringify(stockMovements, null, 2));
  }

  console.log('Raw data saved to server/scripts/');
}

runDeepAnalysis().catch(err => {
  console.error('Analysis failed:', err);
});
