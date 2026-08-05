const DEFAULT_BUSINESS = {
  name: "Happy Song Karaoke",
  address: "",
  phone: "",
  footer: "Terima kasih.",
  logoText: "HAPPY SONG",
};

const DEFAULT_PAPER = {
  width: 32,
};

export function buildReceiptData(transaction, options = {}) {
  const safeTransaction = transaction || {};
  const fnbOrders = Array.isArray(options.fnbOrders) ? options.fnbOrders : safeTransaction.fnb_orders;
  const orderIds = getReceiptFnbOrderIds(safeTransaction);
  const normalizedFnbOrders = normalizeFnbOrders(fnbOrders);

  return {
    business: normalizeBusiness(options.business),
    transaction: normalizeTransaction(safeTransaction),
    room: normalizeRoom(safeTransaction),
    fnb: {
      hasFnb: getNumber(safeTransaction.fnb_total) > 0 || normalizedFnbOrders.length > 0 || orderIds.length > 0,
      orderIds,
      orders: normalizedFnbOrders,
      detailLoaded: normalizedFnbOrders.length > 0 || orderIds.length === 0,
    },
    payment: normalizePayment(safeTransaction),
    totals: normalizeTotals(safeTransaction),
    paper: normalizePaper(options.paper),
    print: normalizeReceiptPrint(options.print || safeTransaction.receipt_print),
  };
}

export function formatReceipt58mm(receiptData, options = {}) {
  const width = getReceiptWidth(options.width || receiptData?.paper?.width || DEFAULT_PAPER.width);
  const separator = repeatReceiptChar("-", width);
  const strongSeparator = repeatReceiptChar("=", width);
  const lines = [];
  const business = receiptData?.business || DEFAULT_BUSINESS;
  const transaction = receiptData?.transaction || {};
  const room = receiptData?.room || {};
  const fnb = receiptData?.fnb || {};
  const payment = receiptData?.payment || {};
  const totals = receiptData?.totals || {};
  const print = receiptData?.print || {};

  pushReceiptHeader(lines, business, width);

  if (print.isReprint) {
    lines.push(centerReceiptText("*** CETAK ULANG ***", width));
    lines.push(centerReceiptText(`Cetak ulang ke-${getNumber(print.reprintNumber)}`, width));
    if (print.printedAt) {
      pushReceiptField(lines, "Waktu reprint", formatReceiptDateTime(print.printedAt), width);
    }
    if (print.cashierName) {
      pushReceiptField(lines, "Kasir reprint", print.cashierName, width);
    }
  }

  if (business.address) {
    lines.push(...wrapReceiptText(business.address, width).map((line) => centerReceiptText(line, width)));
  }

  if (business.phone) {
    lines.push(centerReceiptText(business.phone, width));
  }

  lines.push(separator);
  pushReceiptField(lines, "TRX", transaction.id || "-", width);
  pushReceiptField(lines, "Kasir", transaction.cashierName || "-", width);
  pushReceiptField(lines, "Room", room.name || room.id || "-", width);
  pushReceiptField(lines, "Mulai", formatReceiptDateTime(room.startTime), width);
  pushReceiptField(lines, "Selesai", formatReceiptDateTime(room.endTime), width);
  pushReceiptField(lines, "Durasi", `${getNumber(room.durationMinutes)} menit`, width);
  lines.push(separator);
  pushReceiptField(lines, "Room", formatReceiptCurrency(totals.roomTotal), width);
  if (totals.promoDiscount > 0) {
    pushReceiptField(lines, `Disc ${totals.promoCode}`, `-${formatReceiptCurrency(totals.promoDiscount)}`, width);
  }
  if (totals.lcTotal > 0) {
    pushReceiptField(lines, "Jasa LC", formatReceiptCurrency(totals.lcTotal), width);
  }
  pushReceiptField(lines, "F&B", formatReceiptCurrency(totals.fnbTotal), width);
  lines.push(strongSeparator);
  lines.push(formatReceiptLine("TOTAL", formatReceiptCurrency(totals.grandTotal), width));
  lines.push(strongSeparator);

  if (fnb.hasFnb) {
    lines.push(separator);
    lines.push(centerReceiptText("DETAIL F&B", width));

    if (Array.isArray(fnb.orders) && fnb.orders.length > 0) {
      fnb.orders.forEach((order) => {
        if (order.id) {
          lines.push(formatReceiptLine(order.id, formatReceiptCurrency(order.total), width));
        }

        if (order.note) {
          wrapReceiptText(`Note: ${order.note}`, width).forEach((line) => {
            lines.push(line);
          });
        }

        (order.items || []).forEach((item) => {
          wrapReceiptText(item.name || "-", width).forEach((line) => {
            lines.push(line);
          });
          lines.push(formatReceiptLine(
            `  ${getNumber(item.quantity)} x ${formatReceiptCurrency(item.price)}`,
            formatReceiptCurrency(item.subtotal),
            width
          ));
        });
      });
    } else {
      lines.push(centerReceiptText("Detail F&B belum tersedia", width));
    }
  }

  lines.push(separator);
  lines.push(centerReceiptText("PEMBAYARAN", width));
  pushReceiptField(lines, "Metode", formatPaymentMethod(payment.method), width);
  lines.push(centerReceiptText(formatPaymentStatusBlock(payment.status), width));
  lines.push(separator);

  if (business.footer) {
    wrapReceiptText(business.footer, width).forEach((line) => {
      lines.push(centerReceiptText(line, width));
    });
  }

  return lines.join("\n");
}

function pushReceiptHeader(lines, business, width) {
  const logoText = getText(business.logoText || DEFAULT_BUSINESS.logoText).toUpperCase();
  const businessName = getText(business.name || DEFAULT_BUSINESS.name).toUpperCase();
  const border = repeatReceiptChar("#", width);

  lines.push(border);
  lines.push(centerReceiptText(logoText, width));

  if (businessName && businessName.toLowerCase() !== logoText.toLowerCase()) {
    lines.push(centerReceiptText(businessName, width));
  }

  lines.push(border);
}

function pushReceiptField(lines, label, value, width = DEFAULT_PAPER.width) {
  const safeWidth = getReceiptWidth(width);
  const safeLabel = getText(label);
  const safeValue = getText(value) || "-";
  const labelWidth = Math.min(8, Math.max(5, safeLabel.length));
  const actualLabelWidth = Math.max(labelWidth, safeLabel.length);
  const valueWidth = Math.max(1, safeWidth - actualLabelWidth - 1);

  if (safeValue.length <= valueWidth) {
    lines.push(`${safeLabel.padEnd(actualLabelWidth, " ")} ${safeValue.padStart(valueWidth, " ")}`);
    return;
  }

  const wrappedValue = wrapReceiptText(safeValue, valueWidth);
  lines.push(`${safeLabel.padEnd(actualLabelWidth, " ")} ${wrappedValue.shift() || "-"}`);
  wrappedValue.forEach((line) => {
    lines.push(`${" ".repeat(actualLabelWidth + 1)}${line}`);
  });
}

export function centerReceiptText(text, width = DEFAULT_PAPER.width) {
  const safeWidth = getReceiptWidth(width);
  const safeText = truncateReceiptText(getText(text), safeWidth);
  const leftPadding = Math.max(0, Math.floor((safeWidth - safeText.length) / 2));

  return `${" ".repeat(leftPadding)}${safeText}`;
}

export function formatReceiptLine(leftText, rightText, width = DEFAULT_PAPER.width) {
  const safeWidth = getReceiptWidth(width);
  const left = getText(leftText);
  const right = getText(rightText);
  const rightMaxWidth = Math.max(0, safeWidth - 1);
  const safeRight = truncateReceiptText(right, rightMaxWidth);
  const leftMaxWidth = Math.max(0, safeWidth - safeRight.length - 1);
  const safeLeft = truncateReceiptText(left, leftMaxWidth);
  const spacing = Math.max(1, safeWidth - safeLeft.length - safeRight.length);

  return `${safeLeft}${" ".repeat(spacing)}${safeRight}`;
}

export function repeatReceiptChar(char, width = DEFAULT_PAPER.width) {
  const safeChar = getText(char).charAt(0) || "-";

  return safeChar.repeat(getReceiptWidth(width));
}

function normalizeBusiness(business) {
  return {
    ...DEFAULT_BUSINESS,
    ...(business || {}),
  };
}

function formatReceiptCurrency(value) {
  const numberValue = getNumber(value);
  const sign = numberValue < 0 ? "-" : "";
  const absoluteValue = Math.abs(numberValue);
  const formatted = Math.round(absoluteValue)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${sign}Rp${formatted}`;
}

function formatPaymentMethod(method) {
  const normalizedMethod = getText(method).toLowerCase();

  if (normalizedMethod === "cash") {
    return "CASH";
  }

  if (normalizedMethod === "transfer") {
    return "TRANSFER";
  }

  if (normalizedMethod === "qris") {
    return "QRIS";
  }

  return normalizedMethod ? normalizedMethod.toUpperCase() : "-";
}

function formatPaymentStatus(status) {
  const normalizedStatus = getText(status).toLowerCase();

  if (normalizedStatus === "paid") {
    return "LUNAS";
  }

  if (normalizedStatus === "unpaid") {
    return "BELUM LUNAS";
  }

  if (normalizedStatus === "cancelled") {
    return "BATAL";
  }

  return normalizedStatus ? normalizedStatus.toUpperCase() : "-";
}

function formatPaymentStatusBlock(status) {
  const normalizedStatus = getText(status).toLowerCase();

  if (normalizedStatus === "paid") {
    return "[ LUNAS ]";
  }

  if (normalizedStatus === "unpaid") {
    return "[ BELUM LUNAS ]";
  }

  if (normalizedStatus === "cancelled") {
    return "[ BATAL ]";
  }

  return `[ ${formatPaymentStatus(status)} ]`;
}

function formatReceiptDateTime(value) {
  const rawValue = getText(value);

  if (!rawValue) {
    return "-";
  }

  const parsedDate = new Date(rawValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return rawValue.replace("T", " ").replace(/\.\d{3}/, "").replace(/\+\d{2}:?\d{2}$/, "");
  }

  const day = String(parsedDate.getDate()).padStart(2, "0");
  const month = getReceiptMonthName(parsedDate.getMonth());
  const year = String(parsedDate.getFullYear());
  const hour = String(parsedDate.getHours()).padStart(2, "0");
  const minute = String(parsedDate.getMinutes()).padStart(2, "0");

  return `${day} ${month} ${year} ${hour}:${minute}`;
}

function getReceiptMonthName(monthIndex) {
  return ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"][monthIndex] || "";
}

function wrapReceiptText(text, width = DEFAULT_PAPER.width) {
  const safeWidth = getReceiptWidth(width);
  const words = getText(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = "";

  words.forEach((word) => {
    if (word.length > safeWidth) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }

      for (let index = 0; index < word.length; index += safeWidth) {
        lines.push(word.slice(index, index + safeWidth));
      }
      return;
    }

    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if (candidate.length > safeWidth) {
      lines.push(currentLine);
      currentLine = word;
      return;
    }

    currentLine = candidate;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length ? lines : [""];
}

function truncateReceiptText(text, width = DEFAULT_PAPER.width) {
  const safeText = getText(text);
  const safeWidth = getReceiptWidth(width);

  if (safeText.length <= safeWidth) {
    return safeText;
  }

  return safeText.slice(0, safeWidth);
}

function getReceiptWidth(width) {
  const numberWidth = Number(width);

  if (!Number.isFinite(numberWidth) || numberWidth < 1) {
    return DEFAULT_PAPER.width;
  }

  return Math.floor(numberWidth);
}

function normalizeTransaction(transaction) {
  return {
    id: getText(transaction.transaction_id),
    createdAt: getText(transaction.created_at || transaction.end_time),
    cashierName: getText(transaction.cashier_name || "Kasir"),
    raw: transaction,
  };
}

function normalizeRoom(transaction) {
  return {
    id: getText(transaction.room_id),
    name: getText(transaction.room_name || transaction.room_id),
    startTime: getText(transaction.start_time),
    endTime: getText(transaction.end_time),
    durationMinutes: getNumber(transaction.duration_minutes),
    ratePerHour: getNumber(transaction.rate_per_hour),
    billingBasis: getText(transaction.billing_basis),
  };
}

function normalizeFnbOrders(fnbOrders) {
  if (!Array.isArray(fnbOrders)) {
    return [];
  }

  return fnbOrders.map((order) => ({
    id: getText(order?.order_id),
    roomId: getText(order?.room_id),
    roomName: getText(order?.room_name),
    status: getText(order?.order_status),
    total: getNumber(order?.order_total),
    cashierName: getText(order?.cashier_name),
    note: getText(order?.note),
    createdAt: getText(order?.created_at),
    updatedAt: getText(order?.updated_at),
    items: normalizeFnbItems(order?.items),
  }));
}

function normalizeFnbItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item) => ({
    menuId: getText(item?.menu_id),
    name: getText(item?.menu_name),
    category: getText(item?.category),
    price: getNumber(item?.price),
    quantity: getNumber(item?.quantity),
    subtotal: getNumber(item?.subtotal),
    createdAt: getText(item?.created_at),
  }));
}

function normalizePayment(transaction) {
  return {
    status: getText(transaction.payment_status),
    method: getText(transaction.payment_method),
  };
}

function normalizeTotals(transaction) {
  const netRoomTotal = getNumber(transaction.room_total);
  const fnbTotal = getNumber(transaction.fnb_total);
  const lcTotal = getNumber(transaction.lc_total);
  const grandTotal = getNumber(transaction.grand_total);
  const promoCode = getText(transaction.promo_code);
  const promoDiscount = getNumber(transaction.promo_discount);
  const grossRoomTotal = promoDiscount > 0 ? netRoomTotal + promoDiscount : netRoomTotal;

  return {
    roomTotal: grossRoomTotal,
    netRoomTotal,
    fnbTotal,
    lcTotal,
    grandTotal: grandTotal > 0 ? grandTotal : netRoomTotal + fnbTotal + lcTotal,
    promoCode,
    promoDiscount,
  };
}

function normalizePaper(paper) {
  return {
    ...DEFAULT_PAPER,
    ...(paper || {}),
  };
}

function normalizeReceiptPrint(print) {
  const sequence = getNumber(print?.print_sequence || print?.printSequence);
  const inferredReprintNumber = Math.max(0, sequence - 1);
  const reprintNumber = getNumber(print?.reprint_number || print?.reprintNumber || inferredReprintNumber);

  return {
    printSequence: sequence,
    isReprint: Boolean(print?.is_reprint || print?.isReprint || sequence > 1 || reprintNumber > 0),
    reprintNumber,
    printedAt: print?.printed_at || print?.printedAt || "",
    cashierName: getText(print?.cashier_name || print?.cashierName || ""),
    printType: getText(print?.print_type || print?.printType || ""),
  };
}

function getReceiptFnbOrderIds(transaction) {
  const rawOrderIds = getText(transaction.fnb_order_ids);

  if (!rawOrderIds) {
    return [];
  }

  return rawOrderIds
    .split(",")
    .map((orderId) => orderId.trim())
    .filter(Boolean)
    .filter((orderId, index, orderIds) => orderIds.indexOf(orderId) === index);
}

function getText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function getNumber(value) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : 0;
}
