const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, '../../apps-script/Code.gs'), 'utf8');

function findFunction(funcName) {
  const idx = code.indexOf('function ' + funcName);
  if (idx === -1) {
    console.log(`Function ${funcName} not found directly.`);
    // Maybe assigned to var or action handling
    const actionIdx = code.indexOf(`action === "${funcName}"`) !== -1 ? code.indexOf(`action === "${funcName}"`) : code.indexOf(`action === '${funcName}'`);
    if (actionIdx !== -1) {
      console.log(`Found action handler for ${funcName}:`, code.substring(actionIdx, actionIdx + 500));
    }
    return;
  }
  console.log(`=== Function ${funcName} ===`);
  console.log(code.substring(idx, idx + 1200));
}

findFunction('initializeStockFromJul31');
findFunction('getTodayFnbSalesReport');
findFunction('getTodayTransactions');
findFunction('getTodayFnbOrders');
