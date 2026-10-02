const fetch = globalThis.fetch;

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzjBoz2FvaRqTdsmdR-eYQBRvzPVqGV0lf-FPJlDgfFDQ0bxSWr8JVpgxICBwIkI7CK/exec";

async function testFetch() {
  try {
    console.log('Fetching F&B sales report (custom 2026-07-31 to 2026-08-30)...');
    const url = `${SCRIPT_URL}?action=getTodayFnbSalesReport&period=custom&start_date=2026-07-31&end_date=2026-08-30`;
    const res = await fetch(url);
    const data = await res.json();
    console.log('Result keys:', Object.keys(data));
    console.log('Summary:', data.summary);
    console.log('Operational period:', data.operational_date_start, 'to', data.operational_date_end);
    console.log('Menu sales count:', data.menu_sales ? data.menu_sales.length : 0);
    if (data.menu_sales && data.menu_sales.length > 0) {
      console.log('Top 5 Menu Sales:', data.menu_sales.slice(0, 5));
    }
  } catch (err) {
    console.error('Error fetching:', err);
  }
}

testFetch();
