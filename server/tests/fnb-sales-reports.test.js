const assert = require('assert');
const db = require('../src/db');
const { getTodayFnbSalesReport } = require('../src/controllers/fnbController');

async function run() {
  await testFnbSalesReportAggregation();
  await testFnbSalesReportCategoryFilter();
  console.log('FNB sales reports aggregation tests passed successfully.');
}

async function testFnbSalesReportAggregation() {
  const originalQuery = db.query;
  const queries = [];

  db.query = async (sql, params = []) => {
    const text = String(sql);
    queries.push({ text, params });

    if (text.includes('FROM fnb_order_items foi')) {
      return {
        rows: [
          {
            order_item_id: 'item-1',
            order_id: 'FNB-1001',
            room_id: 'ROOM-1',
            room_name: 'Room 01',
            customer_name: 'Budi',
            cashier_name: 'Kasir 1',
            order_status: 'billed',
            order_created_at: new Date('2026-09-02T14:30:00+07:00'),
            menu_id: 'MENU-BEER-1',
            menu_name: 'Bintang',
            category: 'Beer',
            price: 45000,
            quantity: 4,
            subtotal: 180000,
            menu_type_snapshot: 'regular'
          },
          {
            order_item_id: 'item-2',
            order_id: 'FNB-1001',
            room_id: 'ROOM-1',
            room_name: 'Room 01',
            customer_name: 'Budi',
            cashier_name: 'Kasir 1',
            order_status: 'billed',
            order_created_at: new Date('2026-09-02T14:30:00+07:00'),
            menu_id: 'MENU-FOOD-1',
            menu_name: 'French Fries',
            category: 'Food',
            price: 25000,
            quantity: 2,
            subtotal: 50000,
            menu_type_snapshot: 'regular'
          },
          {
            order_item_id: 'item-3',
            order_id: 'FNB-1002',
            room_id: 'ROOM-2',
            room_name: 'Room 02',
            customer_name: 'Andi',
            cashier_name: 'Kasir 2',
            order_status: 'billed',
            order_created_at: new Date('2026-09-02T16:00:00+07:00'),
            menu_id: 'MENU-BEER-1',
            menu_name: 'Bintang',
            category: 'Beer',
            price: 45000,
            quantity: 6,
            subtotal: 270000,
            menu_type_snapshot: 'regular'
          }
        ],
        rowCount: 3
      };
    }

    if (text.includes('FROM inventory')) {
      return {
        rows: [
          {
            stock_item_id: 'STK-01',
            stock_item_name: 'Bir Bintang 330ml',
            category: 'Beer',
            unit: 'botol',
            stock_qty: '5',
            min_stock: '10',
            status: 'active'
          }
        ],
        rowCount: 1
      };
    }

    return { rows: [], rowCount: 0 };
  };

  try {
    const req = {
      query: {
        period: 'today'
      }
    };

    let responsePayload = null;
    const res = {
      json: (data) => {
        responsePayload = data;
        return data;
      }
    };

    await getTodayFnbSalesReport(req, res);

    assert.ok(responsePayload, 'Response harus ada');
    assert.strictEqual(responsePayload.ok, true);
    assert.strictEqual(responsePayload.success, true);
    assert.strictEqual(responsePayload.summary.total_fnb_sales, 500000);
    assert.strictEqual(responsePayload.summary.total_items_sold, 12);
    assert.strictEqual(responsePayload.summary.total_fnb_orders, 2);
    assert.strictEqual(responsePayload.summary.top_menu_name, 'Bintang');
    assert.strictEqual(responsePayload.summary.top_menu_quantity, 10);
    assert.strictEqual(responsePayload.summary.low_stock_count, 1);

    // Items array
    assert.strictEqual(responsePayload.items.length, 2);
    const bintangItem = responsePayload.items.find(i => i.menu_id === 'MENU-BEER-1');
    assert.ok(bintangItem);
    assert.strictEqual(bintangItem.quantity_sold, 10);
    assert.strictEqual(bintangItem.gross_sales, 450000);
    assert.strictEqual(bintangItem.order_count, 2);
    assert.strictEqual(bintangItem.orders.length, 2);

    // Category summary
    assert.strictEqual(responsePayload.category_summary.length, 2);
    const beerCat = responsePayload.category_summary.find(c => c.category === 'Beer');
    assert.ok(beerCat);
    assert.strictEqual(beerCat.total_sales, 450000);
    assert.strictEqual(beerCat.total_quantity, 10);
  } finally {
    db.query = originalQuery;
  }
}

async function testFnbSalesReportCategoryFilter() {
  const originalQuery = db.query;
  const queries = [];

  db.query = async (sql, params = []) => {
    const text = String(sql);
    queries.push({ text, params });
    if (text.includes('FROM fnb_order_items foi')) {
      return { rows: [], rowCount: 0 };
    }
    if (text.includes('FROM inventory')) {
      return { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  };

  try {
    const req = {
      query: {
        period: 'yesterday',
        category: 'Beer',
        status: 'all'
      }
    };

    let responsePayload = null;
    const res = {
      json: (data) => {
        responsePayload = data;
        return data;
      }
    };

    await getTodayFnbSalesReport(req, res);

    assert.ok(responsePayload);
    assert.strictEqual(responsePayload.ok, true);
    assert.strictEqual(responsePayload.period, 'yesterday');

    const fnbQuery = queries.find(q => q.text.includes('FROM fnb_order_items foi'));
    assert.ok(fnbQuery);
    assert.ok(fnbQuery.text.includes("AND foi.category = $3"), 'Query harus menyertakan filter kategori');
    assert.strictEqual(fnbQuery.params[2], 'Beer');
    assert.ok(!fnbQuery.text.includes("AND fo.order_status = 'billed'"), 'Status all tidak boleh membatasi hanya billed');
  } finally {
    db.query = originalQuery;
  }
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
