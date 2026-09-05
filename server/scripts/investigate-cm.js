const fetch = globalThis.fetch;
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzjBoz2FvaRqTdsmdR-eYQBRvzPVqGV0lf-FPJlDgfFDQ0bxSWr8JVpgxICBwIkI7CK/exec";

async function investigate() {
  console.log("=== INVESTIGASI CAPTAIN MORGAN PENJUALAN KEMARIN ===");
  const url = SCRIPT_URL + "?action=getTodayFnbSalesReport&period=yesterday";
  console.log("URL:", url);
  const res = await fetch(url);
  const data = await res.json();

  console.log("Operational Date Start:", data.operational_date_start);
  console.log("Operational Date End:", data.operational_date_end);

  const items = data.items || data.menu_sales || [];
  console.log("\n--- MENU SALES (SEMUA ITEM DENGAN KATA CAPTAIN ATAU PAKET) ---");
  for (const item of items) {
    const name = (item.menu_name || "").toLowerCase();
    const cat = (item.category || "").toLowerCase();
    if (name.includes("captain") || cat.includes("paket") || name.includes("package") || name.includes("single")) {
      console.log(`[${item.menu_id}] ${item.menu_name} | Cat: ${item.category} | Qty Sold: ${item.quantity_sold ?? item.quantity} | Total: Rp ${item.gross_sales ?? item.subtotal}`);
      if (item.orders && item.orders.length > 0) {
        console.log("  Order details:", JSON.stringify(item.orders, null, 2));
      }
    }
  }

  console.log("\n--- PHYSICAL CONSUMPTION (BARANG FISIK KELUAR) ---");
  const phys = data.physical_consumption || [];
  for (const p of phys) {
    const name = (p.stock_item_name || "").toLowerCase();
    if (name.includes("captain") || (p.stock_item_id || "").includes("032")) {
      console.log(JSON.stringify(p, null, 2));
    }
  }

  // Cek juga getTransactions period yesterday
  console.log("\n--- TRANSAKSI KEMARIN ---");
  const txRes = await fetch(SCRIPT_URL + "?action=getTransactions&period=yesterday");
  const txData = await txRes.json();
  const txs = txData.transactions || [];
  console.log("Total transaksi kemarin:", txs.length);
  for (const t of txs) {
    const pName = (t.package_name || "").toLowerCase();
    const pId = (t.package_id || "").toLowerCase();
    if (pName.includes("captain") || pId.includes("captain") || (t.fnb_order_ids || "").length > 0) {
      console.log(`TRX: ${t.transaction_id} | Room: ${t.room_name} | Pkg: ${t.package_name} (${t.package_id}) | F&B: ${t.fnb_total} | GrandTotal: ${t.grand_total}`);
    }
  }

  // Cek fnb orders kemarin
  console.log("\n--- SEMUA FNB ORDERS KEMARIN YANG MEMESAN CAPTAIN MORGAN ---");
  const fnbRes = await fetch(SCRIPT_URL + "?action=getFnbOrders&period=yesterday");
  const fnbData = await fnbRes.json();
  const orders = fnbData.orders || [];
  console.log("Total fnb orders kemarin:", orders.length);
  let totalCmOrdered = 0;
  for (const o of orders) {
    const oItems = o.items || [];
    for (const oi of oItems) {
      const iName = (oi.menu_name || oi.item_name || "").toLowerCase();
      if (iName.includes("captain")) {
        console.log(`Order ${o.order_id} | Room: ${o.room_name} | Status: ${o.order_status} | Item: ${oi.menu_name} | Qty: ${oi.quantity} | Kasir: ${o.cashier_name} | Waktu: ${o.created_at}`);
        totalCmOrdered += Number(oi.quantity || 0);
      }
    }
  }
  console.log("Total Captain Morgan di Fnb Orders:", totalCmOrdered);
}

investigate().catch(console.error);
