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
  const totals = normalizeTotals(safeTransaction);

  return {
    business: normalizeBusiness(options.business),
    transaction: normalizeTransaction(safeTransaction),
    room: normalizeRoom(safeTransaction),
    lc: normalizeLcDetails(options.lcDetails ?? safeTransaction.lc_details, totals.lcTotal),
    fnb: {
      hasFnb: getNumber(safeTransaction.fnb_total) > 0 || normalizedFnbOrders.length > 0,
      orderIds,
      orders: normalizedFnbOrders,
      detailLoaded: normalizedFnbOrders.length > 0 || orderIds.length === 0 || getNumber(safeTransaction.fnb_total) === 0,
    },
    payment: normalizePayment(safeTransaction),
    totals,
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
  const lc = receiptData?.lc || {};
  const fnb = receiptData?.fnb || {};
  const payment = receiptData?.payment || {};
  const totals = receiptData?.totals || {};
  const print = receiptData?.print || {};

  pushReceiptHeader(lines, business, width);

  if (transaction.isUpfront || transaction.raw?.is_upfront) {
    lines.push(centerReceiptText("*** STRUK DIBAYAR DIMUKA ***", width));
    lines.push(centerReceiptText("LUNAS DI MUKA", width));
  }

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
  pushReceiptField(lines, "Durasi", formatReceiptDuration(room.durationMinutes), width);
  if (room.freeRoomMinutes > 0) {
    pushReceiptField(lines, "Free", formatReceiptDuration(room.freeRoomMinutes), width);
    pushReceiptField(lines, "Tagih", formatReceiptDuration(room.billableRoomMinutes), width);
  }

  if (Array.isArray(room.journey) && room.journey.length > 1) {
    lines.push(separator);
    lines.push(centerReceiptText("PERJALANAN ROOM", width));
    room.journey.forEach((segment) => {
      wrapReceiptText(segment.roomName || segment.roomId || "-", width).forEach((line) => lines.push(line));
      pushReceiptField(lines, "  Durasi", formatReceiptDuration(segment.durationMinutes), width);
      pushReceiptField(lines, "  Tarif", `${formatReceiptCurrency(segment.ratePerHour)}/jam`, width);
    });
  }

  lines.push(separator);
  if (room.packageId) {
    lines.push(centerReceiptText("BIAYA PAKET", width));
    lines.push(formatReceiptLine(
      room.packageName || room.packageId || "Paket",
      formatReceiptCurrency(Math.max(0, totals.roomTotal - room.upgradeTotal)),
      width
    ));
    if (room.upgradeTotal > 0) {
      pushReceiptField(lines, "Upgrade Room", formatReceiptCurrency(room.upgradeTotal), width);
    }
  } else {
    lines.push(centerReceiptText("BIAYA ROOM", width));
    const billableDuration = room.freeRoomMinutes > 0
      ? (room.billableRoomMinutes > 0 ? room.billableRoomMinutes : Math.max(0, room.durationMinutes - room.freeRoomMinutes))
      : room.durationMinutes;

    lines.push(formatReceiptLine(
      room.ratePerHour > 0
        ? `${formatReceiptDuration(billableDuration)} x ${formatReceiptCurrency(room.ratePerHour)}`
        : "Biaya Room",
      formatReceiptCurrency(totals.roomTotal),
      width
    ));
    if (room.freeRoomMinutes > 0) {
      pushReceiptField(lines, "  Free Promo", `${formatReceiptDuration(room.freeRoomMinutes)} (Rp0)`, width);
    }
  }

  if (totals.promoDiscount > 0) {
    pushReceiptField(lines, `Disc ${totals.promoCode}`, `-${formatReceiptCurrency(totals.promoDiscount)}`, width);
  }

  if (totals.roomDiscountAmount > 0) {
    pushReceiptField(lines, "Free Room", `-${formatReceiptCurrency(totals.roomDiscountAmount)}`, width);
  }
  if (totals.manualRoomDiscount > 0) {
    pushReceiptField(lines, "Disc Mgmt Room", `-${formatReceiptCurrency(totals.manualRoomDiscount)}`, width);
  }

  if (lc.hasLc) {
    lines.push(separator);
    lines.push(centerReceiptText("DETAIL LC", width));

    if (lc.detailAvailable && lc.items.length > 0) {
      lc.items.forEach((item, index) => {
        if (index > 0) {
          lines.push("");
        }
        wrapReceiptText(item.name || "-", width).forEach((line) => {
          lines.push(line);
        });
        pushReceiptField(lines, "  Durasi", formatReceiptDuration(item.durationMinutes), width);

        if (item.includedMinutes > 0 && item.extraMinutes > 0) {
          pushReceiptField(lines, "  Paket", `${formatReceiptDuration(item.includedMinutes)} included`, width);
          pushReceiptField(lines, "  Extra Jam", formatReceiptDuration(item.extraMinutes), width);
          pushReceiptField(lines, "  Tarif", `${formatReceiptCurrency(item.ratePerHour)}/jam`, width);
        } else if (item.includedMinutes > 0 && item.extraMinutes === 0) {
          pushReceiptField(lines, "  Status", "Termasuk Paket", width);
          if (item.ratePerHour > 0) {
            pushReceiptField(lines, "  Tarif", `${formatReceiptCurrency(item.ratePerHour)}/jam`, width);
          }
        } else if (item.billingSource === "extra_charge") {
          pushReceiptField(lines, "  Status", "Extra LC", width);
          pushReceiptField(lines, "  Tarif", `${formatReceiptCurrency(item.ratePerHour)}/jam`, width);
        } else {
          pushReceiptField(lines, "  Tarif", `${formatReceiptCurrency(item.ratePerHour)}/jam`, width);
        }

        pushReceiptField(lines, "  Tagihan", formatReceiptCurrency(item.amount), width);
      });

      if (lc.billingAdjustment !== 0) {
        pushReceiptField(
          lines,
          "Penyesuaian",
          formatReceiptCurrency(lc.billingAdjustment),
          width
        );
      }
    } else {
      wrapReceiptText("Detail LC historis tidak tersedia.", width).forEach((line) => {
        lines.push(centerReceiptText(line, width));
      });
    }

    lines.push(separator);
    lines.push(formatReceiptLine("SUBTOTAL LC", formatReceiptCurrency(lc.total), width));
  }

  if (fnb.hasFnb) {
    const activeOrders = (fnb.orders || []).filter(
      (order) => order?.status !== "cancelled" && (order?.items || []).some((item) => !item?.isVoided && !item?.is_voided)
    );

    if (activeOrders.length > 0) {
      lines.push(separator);
      lines.push(centerReceiptText("DETAIL F&B", width));

      activeOrders.forEach((order) => {
        if (order.note) {
          wrapReceiptText(`Note: ${order.note}`, width).forEach((line) => {
            lines.push(line);
          });
        }

        (order.items || []).filter((item) => !item?.isVoided && !item?.is_voided).forEach((item) => {
          wrapReceiptText(item.name || "-", width).forEach((line) => {
            lines.push(line);
          });
          if (item.isComplimentary || item.is_complimentary) {
            lines.push(formatReceiptLine(
              `  ${getNumber(item.quantity)} x Rp0 (FREE GIFT)`,
              "Rp0",
              width
            ));
            const giftNote = item.complimentaryReason || item.complimentary_reason || "Hadiah Owner";
            wrapReceiptText(`  [${giftNote}]`, width).forEach((line) => lines.push(line));
          } else {
            lines.push(formatReceiptLine(
              `  ${getNumber(item.quantity)} x ${formatReceiptCurrency(item.price)}`,
              formatReceiptCurrency(item.subtotal),
              width
            ));
          }
          (item.bundleComponents || []).forEach((component) => {
            const modeLabel = component.mode === "bonus" ? "Bonus" : "Termasuk";
            const componentText = `  ${modeLabel}: ${getNumber(component.totalQty)}x ${component.name}`;
            wrapReceiptText(componentText, width).forEach((line) => lines.push(line));
          });
        });
      });
    } else if (totals.fnbTotal > 0) {
      lines.push(separator);
      lines.push(centerReceiptText("DETAIL F&B", width));
      lines.push(centerReceiptText("Detail F&B belum tersedia", width));
    }
  }

  lines.push(separator);
  lines.push(centerReceiptText("RINGKASAN", width));
  pushReceiptField(lines, "Room", formatReceiptCurrency(totals.roomTotal), width);
  if (totals.promoDiscount > 0) {
    pushReceiptField(lines, `Disc ${totals.promoCode}`, `-${formatReceiptCurrency(totals.promoDiscount)}`, width);
  }
  if (totals.roomDiscountAmount > 0) {
    pushReceiptField(lines, "Free Room", `-${formatReceiptCurrency(totals.roomDiscountAmount)}`, width);
  }
  if (totals.manualRoomDiscount > 0) {
    pushReceiptField(lines, "Disc Mgmt Room", `-${formatReceiptCurrency(totals.manualRoomDiscount)}`, width);
  }
  if (totals.lcTotal > 0) {
    pushReceiptField(lines, "Jasa LC", formatReceiptCurrency(totals.lcTotal), width);
  }
  if (totals.manualFnbDiscount > 0) {
    pushReceiptField(lines, "F&B", formatReceiptCurrency(totals.grossFnbTotal), width);
    pushReceiptField(lines, "Disc Mgmt F&B", `-${formatReceiptCurrency(totals.manualFnbDiscount)}`, width);
  } else {
    pushReceiptField(lines, "F&B", formatReceiptCurrency(totals.fnbTotal), width);
  }
  lines.push(strongSeparator);
  lines.push(formatReceiptLine("TOTAL", formatReceiptCurrency(totals.grandTotal), width));
  lines.push(strongSeparator);

  lines.push(centerReceiptText("PEMBAYARAN", width));
  pushReceiptField(lines, "Metode", formatPaymentMethod(payment.method), width);
  if (getText(payment.method).toLowerCase() === "split") {
    pushReceiptField(lines, "Cash", formatReceiptCurrency(payment.cashAmount), width);
    pushReceiptField(lines, "Transfer", formatReceiptCurrency(payment.transferAmount), width);
  }
  lines.push(centerReceiptText(formatPaymentStatusBlock(payment.status), width));
  lines.push(separator);

  if (business.footer) {
    wrapReceiptText(business.footer, width).forEach((line) => {
      lines.push(centerReceiptText(line, width));
    });
  }

  return lines.join("\n");
}

export function formatStockHandoverSlip58mm(movement, options = {}) {
  const width = getReceiptWidth(options.width || DEFAULT_PAPER.width);
  const separator = repeatReceiptChar("-", width);
  const strongSeparator = repeatReceiptChar("=", width);
  const lines = [];
  const normalizedMovement = normalizeStockMovement(movement);
  const relatedMovements = normalizeStockMovementItems(options.movements || [movement], normalizedMovement);
  const handover = getStockMovementHandoverLabels(normalizedMovement.type);
  const printedBy = getText(options.printedBy) || normalizedMovement.cashierName || "-";

  lines.push(centerReceiptText("BUKTI SERAH TERIMA BARANG", width));
  lines.push(strongSeparator);
  pushReceiptField(lines, "No", normalizedMovement.referenceId || normalizedMovement.id || "-", width);
  pushReceiptField(lines, "Tanggal", formatReceiptDateTime(normalizedMovement.createdAt), width);
  pushReceiptField(lines, "Shift", getText(options.shiftLabel) || "Aktif", width);
  pushReceiptField(lines, "Jenis", handover.typeLabel, width);
  pushReceiptField(lines, "Total Item", String(relatedMovements.length), width);
  lines.push(separator);
  lines.push(centerReceiptText("RINCIAN BARANG", width));
  relatedMovements.forEach((item, index) => {
    if (index > 0) {
      lines.push("");
    }
    wrapReceiptText(`${index + 1}. ${item.itemName || item.itemId || "-"}`, width).forEach((line) => {
      lines.push(line);
    });
    pushReceiptField(lines, `  ${handover.quantityLabel}`, formatReceiptQuantity(item.quantity), width);
    pushReceiptField(lines, "  Stok", `${formatReceiptQuantity(item.stockBefore)} -> ${formatReceiptQuantity(item.stockAfter)}`, width);
  });
  lines.push(separator);
  pushReceiptField(lines, "Referensi", getStockMovementReferenceReceiptLabel(normalizedMovement.referenceType), width);
  pushReceiptField(lines, "ID Ref", normalizedMovement.referenceId || "-", width);
  pushReceiptField(lines, "Operator", normalizedMovement.cashierName || "-", width);

  if (normalizedMovement.note) {
    lines.push(separator);
    lines.push(centerReceiptText("CATATAN", width));
    wrapReceiptText(normalizedMovement.note, width).forEach((line) => {
      lines.push(line);
    });
  }

  lines.push(separator);
  pushReceiptSignature(lines, handover.firstPartyLabel, handover.firstPartyName, width);
  lines.push("");
  pushReceiptSignature(lines, handover.secondPartyLabel, handover.secondPartyName || normalizedMovement.cashierName, width);
  lines.push(separator);
  pushReceiptField(lines, "Dicetak", formatReceiptDateTime(options.printedAt || new Date().toISOString()), width);
  pushReceiptField(lines, "Oleh", printedBy, width);
  lines.push(separator);
  wrapReceiptText("Simpan struk ini sebagai bukti verifikasi mutasi stok.", width).forEach((line) => {
    lines.push(centerReceiptText(line, width));
  });

  return lines.join("\n");
}

export function formatSalesCommissionSlip58mm(commission, options = {}) {
  const width = getReceiptWidth(options.width || DEFAULT_PAPER.width);
  const separator = repeatReceiptChar("-", width);
  const strongSeparator = repeatReceiptChar("=", width);
  const lines = [];
  const normalizedCommission = normalizeSalesCommission(commission);
  const transaction = options.transaction || {};
  const total = getNumber(transaction.grand_total ?? transaction.total ?? 0);
  const netRevenue = Math.max(0, total - normalizedCommission.amount);
  const cashierName = normalizedCommission.cashierName || getText(options.printedBy) || "Kasir";

  lines.push(centerReceiptText("BUKTI SERAH TERIMA", width));
  lines.push(centerReceiptText("KOMISI SALES/MARKETING", width));
  if (options.isReprint) {
    lines.push(centerReceiptText("*** CETAK ULANG ***", width));
  }
  lines.push(strongSeparator);
  pushReceiptField(lines, "No", normalizedCommission.id || "-", width);
  pushReceiptField(lines, "Tanggal", formatReceiptDateTime(normalizedCommission.createdAt || options.printedAt), width);
  pushReceiptField(lines, "TRX", normalizedCommission.transactionId || transaction.transaction_id || "-", width);
  pushReceiptField(lines, "Room", transaction.room_name || transaction.room_id || "-", width);
  lines.push(separator);
  lines.push(centerReceiptText("PERHITUNGAN", width));
  pushReceiptField(lines, "Dasar", getSalesCommissionBasisReceiptLabel(normalizedCommission.basisType), width);
  pushReceiptField(lines, "Nominal", formatReceiptCurrency(normalizedCommission.basisAmount), width);
  pushReceiptField(lines, "Persen", `${formatReceiptPercent(normalizedCommission.percent)}%`, width);
  lines.push(formatReceiptLine("KOMISI", formatReceiptCurrency(normalizedCommission.amount), width));
  lines.push(separator);
  pushReceiptField(lines, "Total TRX", formatReceiptCurrency(total), width);
  pushReceiptField(lines, "Net Omzet", formatReceiptCurrency(netRevenue), width);
  lines.push(separator);
  pushReceiptField(lines, "Penerima", normalizedCommission.recipientName || "-", width);
  pushReceiptField(lines, "Kasir", cashierName, width);

  if (normalizedCommission.note) {
    lines.push(separator);
    lines.push(centerReceiptText("CATATAN", width));
    wrapReceiptText(normalizedCommission.note, width).forEach((line) => lines.push(line));
  }

  lines.push(separator);
  pushReceiptSignature(lines, "Diserahkan Oleh", cashierName, width);
  lines.push("");
  pushReceiptSignature(lines, "Diterima Oleh", normalizedCommission.recipientName, width);
  lines.push(separator);
  pushReceiptField(lines, "Dicetak", formatReceiptDateTime(options.printedAt || new Date().toISOString()), width);
  lines.push(separator);
  wrapReceiptText("Simpan struk ini sebagai bukti komisi yang mengurangi omzet bersih shift.", width).forEach((line) => {
    lines.push(centerReceiptText(line, width));
  });

  return lines.join("\n");
}

export function formatOperationalExpenseSlip58mm(expense, options = {}) {
  const width = getReceiptWidth(options.width || DEFAULT_PAPER.width);
  const separator = repeatReceiptChar("-", width);
  const strongSeparator = repeatReceiptChar("=", width);
  const lines = [];

  const business = options.business || DEFAULT_BUSINESS;
  const expenseId = getText(expense?.expense_id || expense?.id || "-");
  const createdAt = expense?.created_at || options.printedAt || new Date().toISOString();
  const cashierName = getText(expense?.cashier_name || options.printedBy || "Kasir");
  const category = getText(expense?.category || "Perlengkapan");
  const title = getText(expense?.expense_title || expense?.title || "-");
  const amount = getNumber(expense?.amount);
  const note = getText(expense?.note);
  const isVoided = Boolean(expense?.is_voided);

  lines.push(centerReceiptText(business.name || DEFAULT_BUSINESS.name, width));
  lines.push(centerReceiptText("BUKTI PENGELUARAN KAS KECIL", width));
  lines.push(centerReceiptText("(PETTY CASH VOUCHER)", width));

  if (isVoided) {
    lines.push(centerReceiptText("*** DIBATALKAN / VOID ***", width));
  } else if (options.isReprint) {
    lines.push(centerReceiptText("*** CETAK ULANG ***", width));
  }

  lines.push(strongSeparator);
  pushReceiptField(lines, "No. Bukti", expenseId, width);
  pushReceiptField(lines, "Waktu", formatReceiptDateTime(createdAt), width);
  pushReceiptField(lines, "Kasir (PIC)", cashierName, width);
  pushReceiptField(lines, "Sumber Dana", "Kas Laci (Tunai)", width);
  pushReceiptField(lines, "Kategori", category, width);
  lines.push(separator);

  lines.push(centerReceiptText("KEPERLUAN", width));
  wrapReceiptText(title, width).forEach((line) => lines.push(line));

  lines.push(separator);
  lines.push(formatReceiptLine("TOTAL KELUAR", formatReceiptCurrency(amount), width));
  lines.push(strongSeparator);

  if (note) {
    lines.push(centerReceiptText("CATATAN", width));
    wrapReceiptText(note, width).forEach((line) => lines.push(line));
    lines.push(separator);
  }

  if (isVoided && expense?.void_reason) {
    lines.push(centerReceiptText("ALASAN BATAL", width));
    wrapReceiptText(expense.void_reason, width).forEach((line) => lines.push(line));
    pushReceiptField(lines, "Dibatalkan Oleh", getText(expense.voided_by || "Admin"), width);
    lines.push(separator);
  }

  pushReceiptSignature(lines, "Kasir / PIC", cashierName, width);
  lines.push("");
  pushReceiptSignature(lines, "Supervisor / Owner", "Pemeriksa", width);
  lines.push(separator);
  pushReceiptField(lines, "Dicetak", formatReceiptDateTime(options.printedAt || new Date().toISOString()), width);
  lines.push(separator);
  wrapReceiptText("Harap staples nota/bon belanja asli pada slip ini untuk rekonsiliasi closing.", width).forEach((line) => {
    lines.push(centerReceiptText(line, width));
  });

  return lines.join("\n");
}

export function formatFreeGiftSlip58mm(giftData, options = {}) {
  const width = getReceiptWidth(options.width || DEFAULT_PAPER.width);
  const separator = repeatReceiptChar("-", width);
  const strongSeparator = repeatReceiptChar("=", width);
  const lines = [];

  const business = options.business || DEFAULT_BUSINESS;
  const orderId = getText(giftData?.order_id || giftData?.id || "-");
  const createdAt = giftData?.created_at || options.printedAt || new Date().toISOString();
  const roomName = getText(giftData?.room_name || giftData?.room || "-");
  const cashierName = getText(giftData?.cashier_name || options.printedBy || "Kasir");
  const authorizer = getText(giftData?.authorizer || giftData?.complimentary_by || "Owner / Manager");
  const reason = getText(giftData?.reason || giftData?.complimentary_reason || giftData?.note || "Hadiah Tamu VIP");
  const itemName = getText(giftData?.menu_name || giftData?.item_name || giftData?.item?.menu_name || "-");
  const quantity = getNumber(giftData?.quantity || giftData?.item?.quantity || 1);
  const originalPrice = getNumber(giftData?.original_price || giftData?.item?.original_price || 0);

  lines.push(centerReceiptText(business.name || DEFAULT_BUSINESS.name, width));
  lines.push(centerReceiptText("SLIP FREE GIFT / KOMPLIMEN BAR", width));
  lines.push(centerReceiptText("*** KHUSUS TAMU ROOM ***", width));

  if (options.isReprint) {
    lines.push(centerReceiptText("*** CETAK ULANG ***", width));
  }

  lines.push(strongSeparator);
  pushReceiptField(lines, "No. Order", orderId, width);
  pushReceiptField(lines, "Waktu", formatReceiptDateTime(createdAt), width);
  pushReceiptField(lines, "Tujuan Room", roomName, width);
  pushReceiptField(lines, "Kasir", cashierName, width);
  pushReceiptField(lines, "Otorisasi", authorizer, width);
  lines.push(separator);

  lines.push(centerReceiptText("ITEM FREE GIFT", width));
  wrapReceiptText(`${quantity}x ${itemName}`, width).forEach((line) => lines.push(line));
  if (originalPrice > 0) {
    pushReceiptField(lines, "Harga Normal", formatReceiptCurrency(originalPrice * quantity), width);
  }
  lines.push(formatReceiptLine("TAGIHAN TAMU", "Rp0 (GRATIS)", width));
  lines.push(separator);

  lines.push(centerReceiptText("KETERANGAN / ALASAN", width));
  wrapReceiptText(reason, width).forEach((line) => lines.push(line));
  lines.push(separator);

  wrapReceiptText("* Stok fisik bar berkurang otomatis di sistem *", width).forEach((line) => {
    lines.push(centerReceiptText(line, width));
  });
  lines.push(separator);

  pushReceiptSignature(lines, "Pemberi Hadiah", authorizer, width);
  lines.push("");
  pushReceiptSignature(lines, "Petugas Bar", "Bartender / Kru", width);
  lines.push(separator);
  pushReceiptField(lines, "Dicetak", formatReceiptDateTime(options.printedAt || new Date().toISOString()), width);
  lines.push(separator);
  wrapReceiptText("Serahkan slip ini ke Bar/Gudang sebagai bukti sah pengeluaran minuman/makanan hadiah.", width).forEach((line) => {
    lines.push(centerReceiptText(line, width));
  });

  return lines.join("\n");
}

export function formatLcSlip58mm(lcData, options = {}) {
  const width = getReceiptWidth(options.width || DEFAULT_PAPER.width);
  const separator = repeatReceiptChar("-", width);
  const strongSeparator = repeatReceiptChar("=", width);
  const lines = [];

  const business = options.business || DEFAULT_BUSINESS;
  const lcId = getText(lcData?.lc_id || "-");
  const lcName = getText(lcData?.lc_name || "Partner LC");
  const cashierName = getText(options.cashierName || options.printedBy || "Kasir");
  const payrollId = getText(lcData?.payroll_id || options.payrollId);
  const periodLabel = getText(options.periodLabel || options.period || "");
  const printedAt = options.printedAt || new Date().toISOString();

  lines.push(centerReceiptText(business.name || DEFAULT_BUSINESS.name, width));
  lines.push(centerReceiptText("SLIP KERJA & FEE PARTNER (LC)", width));
  lines.push(centerReceiptText("*** TANDA TERIMA PEMBAYARAN ***", width));

  if (options.isReprint) {
    lines.push(centerReceiptText("*** CETAK ULANG ***", width));
  }

  lines.push(strongSeparator);
  pushReceiptField(lines, "Nama LC", `${lcName} (${lcId})`, width);
  if (payrollId) {
    pushReceiptField(lines, "No. Payroll", payrollId, width);
  }
  if (periodLabel) {
    pushReceiptField(lines, "Periode", periodLabel, width);
  }
  pushReceiptField(lines, "Waktu Cetak", formatReceiptDateTime(printedAt), width);
  pushReceiptField(lines, "Kasir (PIC)", cashierName, width);
  lines.push(separator);

  // Rincian Sesi Room
  lines.push(centerReceiptText("RINCIAN SESI ROOM", width));
  const logs = Array.isArray(lcData?.logs) ? lcData.logs : [];
  if (logs.length > 0) {
    logs.forEach((log, idx) => {
      const room = getText(log.room_name || (log.session_id ? log.session_id.split("-")[0] : `Sesi ${idx + 1}`));
      let durMin = Math.round(getNumber(log.duration_minutes));
      if (durMin <= 0 && log.created_at && log.closed_at) {
        const diffMs = new Date(log.closed_at).getTime() - new Date(log.created_at).getTime();
        durMin = Math.max(1, Math.ceil(diffMs / 60000));
      }
      const durHours = durMin > 0 ? (durMin / 60).toFixed(1) : "0";
      const ratePerHour = getNumber(log.rate_per_hour || log.rate_per_room || lcData?.rate_per_room);
      const fee = getNumber(log.rate);

      lines.push(`${idx + 1}. ${room}`);
      lines.push(formatReceiptLine(`   ${durHours} Jam @ ${formatReceiptCurrency(ratePerHour)}`, formatReceiptCurrency(fee), width));
    });
  } else {
    lines.push(centerReceiptText("(Tidak ada rincian sesi room)", width));
  }
  lines.push(separator);

  // Rincian Bonus Penjualan (jika ada)
  const bonusLogs = Array.isArray(lcData?.sales_bonus_logs) ? lcData.sales_bonus_logs : [];
  if (bonusLogs.length > 0) {
    lines.push(centerReceiptText("BONUS PENJUALAN F&B", width));
    bonusLogs.forEach((bonus, bIdx) => {
      const menu = getText(bonus.menu_name || bonus.menu_id || "Item F&B");
      const qty = getNumber(bonus.quantity || 1);
      const bTotal = getNumber(bonus.bonus_total);
      lines.push(`${bIdx + 1}. ${qty}x ${menu}`);
      lines.push(formatReceiptLine("   Bonus", formatReceiptCurrency(bTotal), width));
    });
    lines.push(separator);
  }

  // Ringkasan Finansial
  const totalSessions = getNumber(lcData?.total_sessions || logs.length);
  const totalDurationMin = getNumber(lcData?.total_duration_minutes || logs.reduce((sum, l) => sum + getNumber(l.duration_minutes), 0));
  const totalDurationHours = totalDurationMin > 0 ? (totalDurationMin / 60).toFixed(1) : "0";
  const roomEarning = getNumber(lcData?.room_earning_total ?? (logs.reduce((sum, l) => sum + getNumber(l.rate), 0)));
  const salesBonusTotal = getNumber(lcData?.sales_bonus_total ?? (bonusLogs.reduce((sum, b) => sum + getNumber(b.bonus_total), 0)));
  const grossTotal = getNumber(lcData?.gross_earning_total ?? lcData?.total_earnings ?? (roomEarning + salesBonusTotal));
  const cashAdvance = getNumber(lcData?.cash_advance_deduction || lcData?.cash_advance_total || 0);
  const netPayout = getNumber(lcData?.net_payout ?? (grossTotal - cashAdvance));

  pushReceiptField(lines, "Total Sesi", `${totalSessions} Sesi (${totalDurationHours} Jam)`, width);
  lines.push(formatReceiptLine("Subtotal Fee Room", formatReceiptCurrency(roomEarning), width));
  if (salesBonusTotal > 0) {
    lines.push(formatReceiptLine("Bonus Sales F&B", formatReceiptCurrency(salesBonusTotal), width));
  }
  if (cashAdvance > 0) {
    lines.push(formatReceiptLine("Potongan Kasbon", `-${formatReceiptCurrency(cashAdvance)}`, width));
  }
  lines.push(strongSeparator);
  lines.push(formatReceiptLine("TOTAL DITERIMA", formatReceiptCurrency(netPayout), width));
  lines.push(strongSeparator);

  lines.push("");
  pushReceiptSignature(lines, "Kasir (PIC)", cashierName, width);
  lines.push("");
  pushReceiptSignature(lines, "Partner (LC)", lcName, width);
  lines.push(separator);
  pushReceiptField(lines, "Dicetak", formatReceiptDateTime(printedAt), width);
  lines.push(separator);
  wrapReceiptText("Simpan slip ini sebagai bukti tanda terima resmi fee partner LC.", width).forEach((line) => {
    lines.push(centerReceiptText(line, width));
  });

  return lines.join("\n");
}

export function formatLcShiftReport58mm(reportData, options = {}) {
  const width = getReceiptWidth(options.width || DEFAULT_PAPER.width);
  const separator = repeatReceiptChar("-", width);
  const strongSeparator = repeatReceiptChar("=", width);
  const dashSeparator = "- ".repeat(Math.floor(width / 2)).trimEnd();
  const lines = [];

  const business = options.business || DEFAULT_BUSINESS;
  const cashierName = getText(options.cashierName || options.printedBy || "Kasir");
  const periodLabel = getText(options.periodLabel || reportData?.period || "Hari Ini");
  const printedAt = options.printedAt || new Date().toISOString();
  const summary = reportData?.summary || {};
  const lcs = Array.isArray(reportData?.reports) ? reportData.reports : (Array.isArray(reportData) ? reportData : []);

  lines.push(centerReceiptText(business.name || DEFAULT_BUSINESS.name, width));
  lines.push(centerReceiptText("REKAPITULASI LAPORAN LC", width));
  lines.push(centerReceiptText("(SHIFT / HARIAN)", width));

  if (options.isReprint) {
    lines.push(centerReceiptText("*** CETAK ULANG ***", width));
  }

  lines.push(strongSeparator);
  pushReceiptField(lines, "Periode", periodLabel, width);
  pushReceiptField(lines, "Waktu Cetak", formatReceiptDateTime(printedAt), width);
  pushReceiptField(lines, "Kasir (PIC)", cashierName, width);
  lines.push(separator);

  // Rincian per LC dengan pemisah rapi agar tidak menumpuk
  lines.push(centerReceiptText("RINCIAN KERJA PARTNER LC", width));
  lines.push(separator);

  if (lcs.length > 0) {
    lcs.forEach((lc, idx) => {
      const name = getText(lc.lc_name || `LC ${lc.lc_id}`);
      const id = getText(lc.lc_id || "");
      const sessions = getNumber(lc.total_sessions || 0);
      const durMin = getNumber(lc.total_duration_minutes || 0);
      const durH = durMin > 0 ? (durMin / 60).toFixed(1) : "0";
      const roomFee = getNumber(lc.room_earning_total ?? lc.total_earnings);
      const bonus = getNumber(lc.sales_bonus_total || 0);
      const total = getNumber(lc.gross_earning_total ?? (roomFee + bonus));

      lines.push(`[${idx + 1}] ${name} (${id})`);
      lines.push(`- Durasi : ${sessions} Sesi (${durH} Jam)`);
      lines.push(formatReceiptLine("- Fee Room", formatReceiptCurrency(roomFee), width));
      if (bonus > 0) {
        lines.push(formatReceiptLine("- Bonus Sales", formatReceiptCurrency(bonus), width));
      }
      lines.push(formatReceiptLine("Subtotal Fee", formatReceiptCurrency(total), width));

      // Pemisah putus-putus antar nama agar tidak menumpuk
      if (idx < lcs.length - 1) {
        lines.push(dashSeparator);
      }
    });
  } else {
    lines.push(centerReceiptText("(Tidak ada data LC pada periode ini)", width));
  }

  // Rekapitulasi Total Jam & Total Rupiah di Bawah
  const totalLcs = getNumber(summary.total_lcs || lcs.length);
  const totalSessions = getNumber(summary.total_sessions || lcs.reduce((sum, r) => sum + getNumber(r.total_sessions), 0));
  const totalDurationMin = getNumber(summary.total_duration_minutes || lcs.reduce((sum, r) => sum + getNumber(r.total_duration_minutes), 0));
  const totalDurationHours = totalDurationMin > 0 ? (totalDurationMin / 60).toFixed(1) : "0";
  const totalRoomEarning = getNumber(summary.room_earning_total || lcs.reduce((sum, r) => sum + getNumber(r.room_earning_total ?? r.total_earnings), 0));
  const totalSalesBonus = getNumber(summary.sales_bonus_total || lcs.reduce((sum, r) => sum + getNumber(r.sales_bonus_total), 0));
  const totalGross = getNumber(summary.gross_earning_total || (totalRoomEarning + totalSalesBonus));

  lines.push(strongSeparator);
  lines.push(centerReceiptText("TOTAL KESELURUHAN SHIFT", width));
  lines.push(strongSeparator);
  pushReceiptField(lines, "Total LC Aktif", `${totalLcs} Orang`, width);
  pushReceiptField(lines, "Total Sesi Room", `${totalSessions} Sesi`, width);
  pushReceiptField(lines, "Total Jam Kerja", `${totalDurationHours} Jam`, width);
  lines.push(separator);
  lines.push(formatReceiptLine("Total Fee Room", formatReceiptCurrency(totalRoomEarning), width));
  if (totalSalesBonus > 0) {
    lines.push(formatReceiptLine("Total Bonus Sales", formatReceiptCurrency(totalSalesBonus), width));
  }
  lines.push(strongSeparator);
  lines.push(formatReceiptLine("TOTAL BIAYA LC", formatReceiptCurrency(totalGross), width));
  lines.push(strongSeparator);

  lines.push("");
  pushReceiptSignature(lines, "Kasir (PIC)", cashierName, width);
  lines.push("");
  pushReceiptSignature(lines, "Supervisor / Owner", "Pemeriksa", width);
  lines.push(separator);
  pushReceiptField(lines, "Dicetak", formatReceiptDateTime(printedAt), width);
  lines.push(separator);
  wrapReceiptText("Dokumen rekapitulasi sah operasional sistem POS Happy Song Karaoke.", width).forEach((line) => {
    lines.push(centerReceiptText(line, width));
  });

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

function normalizeSalesCommission(commission = {}) {
  return {
    id: getText(commission.commission_id || commission.id),
    transactionId: getText(commission.transaction_id || commission.transactionId),
    basisType: getText(commission.basis_type || commission.basisType || "grand_total"),
    basisAmount: getNumber(commission.basis_amount ?? commission.basisAmount),
    percent: getNumber(commission.commission_percent ?? commission.percent),
    amount: getNumber(commission.commission_amount ?? commission.amount),
    recipientName: getText(commission.recipient_name || commission.recipientName),
    cashierName: getText(commission.cashier_name || commission.cashierName),
    note: getText(commission.note),
    createdAt: getText(commission.created_at || commission.createdAt),
  };
}

function getSalesCommissionBasisReceiptLabel(basisType) {
  if (basisType === "room_total") return "Room/Paket";
  if (basisType === "fnb_total") return "F&B";
  return "Total Akhir";
}

function formatReceiptPercent(value) {
  const numberValue = getNumber(value);
  return Number.isInteger(numberValue)
    ? String(numberValue)
    : numberValue.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function pushReceiptSignature(lines, label, partyName, width = DEFAULT_PAPER.width) {
  lines.push(centerReceiptText(label, width));
  pushReceiptField(lines, "Nama", partyName || "________________", width);
  pushReceiptField(lines, "Ttd", "________________", width);
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

  if (normalizedMethod === "split") {
    return "SPLIT";
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

function formatReceiptQuantity(value) {
  const numberValue = getNumber(value);

  if (Number.isInteger(numberValue)) {
    return String(numberValue);
  }

  return String(numberValue).replace(/\.?0+$/, "");
}

function normalizeStockMovement(movement) {
  const safeMovement = movement || {};
  const type = getText(safeMovement.movement_type || safeMovement.movementType).toLowerCase();

  return {
    id: getText(safeMovement.movement_id || safeMovement.movementId),
    createdAt: getText(safeMovement.created_at || safeMovement.createdAt),
    itemId: getText(safeMovement.stock_item_id || safeMovement.stockItemId),
    itemName: getText(safeMovement.stock_item_name || safeMovement.stockItemName),
    type,
    referenceType: getText(safeMovement.reference_type || safeMovement.referenceType),
    referenceId: getText(safeMovement.reference_id || safeMovement.referenceId),
    quantity: Math.abs(getNumber(safeMovement.qty_change ?? safeMovement.qtyChange)),
    stockBefore: getNumber(safeMovement.stock_before ?? safeMovement.stockBefore),
    stockAfter: getNumber(safeMovement.stock_after ?? safeMovement.stockAfter),
    note: getText(safeMovement.note),
    cashierName: getText(safeMovement.cashier_name || safeMovement.cashierName),
  };
}

function normalizeStockMovementItems(movements, fallbackMovement) {
  const normalizedItems = (Array.isArray(movements) ? movements : [])
    .map((movement) => normalizeStockMovement(movement))
    .filter((movement) => movement.id || movement.itemId || movement.itemName);

  if (normalizedItems.length > 0) {
    return normalizedItems;
  }

  return fallbackMovement ? [fallbackMovement] : [];
}

function getStockMovementHandoverLabels(type) {
  if (type === "out") {
    return {
      typeLabel: "BARANG KELUAR",
      quantityLabel: "Jumlah Keluar",
      firstPartyLabel: "DISERAHKAN OLEH",
      firstPartyName: "",
      secondPartyLabel: "DITERIMA OLEH",
      secondPartyName: "",
    };
  }

  if (type === "adjustment") {
    return {
      typeLabel: "KOREKSI STOK",
      quantityLabel: "Selisih",
      firstPartyLabel: "DIPERIKSA OLEH",
      firstPartyName: "",
      secondPartyLabel: "DISETUJUI OLEH",
      secondPartyName: "",
    };
  }

  return {
    typeLabel: "BARANG MASUK",
    quantityLabel: "Jumlah Masuk",
    firstPartyLabel: "PEMBERI",
    firstPartyName: "",
    secondPartyLabel: "PENERIMA",
    secondPartyName: "",
  };
}

function getStockMovementReferenceReceiptLabel(referenceType) {
  const normalizedReference = getText(referenceType).toLowerCase();

  if (normalizedReference === "transaction") {
    return "Transaksi";
  }

  if (normalizedReference === "manual_adjustment") {
    return "Manual";
  }

  if (normalizedReference === "goods_receipt") {
    return "Barang Masuk";
  }

  if (normalizedReference === "stock_audit") {
    return "Stock Opname";
  }

  return referenceType || "-";
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
    isUpfront: Boolean(transaction.is_upfront || transaction.raw?.is_upfront),
    raw: transaction,
  };
}

function normalizeRoom(transaction) {
  let rawJourney = transaction.room_journey || transaction.room_journey_json || [];
  if (typeof rawJourney === "string") {
    try {
      rawJourney = JSON.parse(rawJourney);
    } catch (error) {
      rawJourney = [];
    }
  }
  return {
    id: getText(transaction.room_id),
    name: getText(transaction.room_name || transaction.room_id),
    startTime: getText(transaction.start_time),
    endTime: getText(transaction.end_time),
    durationMinutes: getNumber(transaction.duration_minutes),
    ratePerHour: getNumber(transaction.rate_per_hour),
    billingBasis: getText(transaction.billing_basis || transaction.booking_mode),
    packageId: getText(transaction.package_id),
    packageName: getText(transaction.package_name),
    packageTotal: getNumber(transaction.package_total),
    upgradeTotal: getNumber(transaction.room_upgrade_total),
    journey: Array.isArray(rawJourney) ? rawJourney.map((segment) => ({
      sequenceNo: getNumber(segment?.sequence_no),
      roomId: getText(segment?.room_id),
      roomName: getText(segment?.room_name || segment?.room_id),
      ratePerHour: getNumber(segment?.rate_per_hour),
      durationMinutes: getNumber(segment?.allocated_minutes),
      startedAt: getText(segment?.started_at),
      endedAt: getText(segment?.ended_at),
      reason: getText(segment?.move_reason),
    })) : [],
    billableRoomMinutes: transaction.billable_room_minutes === null || transaction.billable_room_minutes === undefined || transaction.billable_room_minutes === ""
      ? getNumber(transaction.duration_minutes)
      : getNumber(transaction.billable_room_minutes),
    freeRoomMinutes: getNumber(transaction.free_room_minutes),
  };
}

function normalizeFnbOrders(fnbOrders) {
  if (!Array.isArray(fnbOrders)) {
    return [];
  }

  return fnbOrders
    .map((order) => ({
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
    }))
    .filter((order) => order.status !== "cancelled" && Array.isArray(order.items) && order.items.length > 0);
}

function normalizeFnbItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .filter((item) => !item?.is_voided && !item?.isVoided)
    .map((item) => ({
      menuId: getText(item?.menu_id),
      name: getText(item?.menu_name),
      isVoided: Boolean(item?.is_voided || item?.isVoided),
      category: getText(item?.category),
      price: getNumber(item?.price),
      quantity: getNumber(item?.quantity),
      subtotal: getNumber(item?.subtotal),
      isComplimentary: Boolean(item?.is_complimentary || item?.isComplimentary),
      complimentaryReason: getText(item?.complimentary_reason || item?.complimentaryReason),
      complimentaryBy: getText(item?.complimentary_by || item?.complimentaryBy),
      originalPrice: getNumber(item?.original_price || item?.originalPrice),
      createdAt: getText(item?.created_at),
    bundleComponents: Array.isArray(item?.bundle_components)
      ? item.bundle_components.map((component) => ({
          itemId: getText(component?.item_id || component?.stock_item_id),
          name: getText(component?.component_name || component?.stock_item_name),
          qtyPerMenu: getNumber(component?.qty_per_menu ?? component?.qty_used),
          totalQty: getNumber(component?.total_qty) || getNumber(component?.qty_per_menu ?? component?.qty_used) * getNumber(item?.quantity),
          unit: getText(component?.unit),
          mode: getText(component?.component_mode || "included").toLowerCase(),
        }))
      : [],
  }));
}

function normalizeLcDetails(details, lcTotal) {
  const safeDetails = details && typeof details === "object" ? details : null;
  const rawItems = Array.isArray(safeDetails?.lc_logs)
    ? safeDetails.lc_logs
    : Array.isArray(safeDetails?.items)
      ? safeDetails.items
      : Array.isArray(safeDetails?.customer_items)
        ? safeDetails.customer_items
        : [];
  const items = rawItems.map((item) => {
    const durationMinutes = getNumber(item?.duration_minutes ?? item?.durationMinutes);
    const includedMinutes = getNumber(item?.included_minutes ?? item?.includedMinutes);
    const extraMinutes = getNumber(item?.extra_minutes ?? (durationMinutes > includedMinutes ? durationMinutes - includedMinutes : 0));
    const ratePerHour = getNumber(item?.rate_per_hour ?? item?.ratePerHour);
    const payableAmount = getNumber(item?.payable_amount ?? item?.rate ?? item?.payableAmount);
    const rawCustomerCharge = item?.customer_charge_amount ?? item?.amount;
    const amount = rawCustomerCharge !== undefined && rawCustomerCharge !== null
      ? getNumber(rawCustomerCharge)
      : (includedMinutes > 0 ? 0 : payableAmount);
    const billingSource = getText(item?.billing_source || item?.billingSource || (includedMinutes > 0 ? "package_included" : "regular")).toLowerCase();

    return {
      lcId: getText(item?.lc_id || item?.lcId),
      name: getText(item?.lc_name || item?.name || item?.lc_id || item?.lcId),
      durationMinutes: durationMinutes || (includedMinutes + extraMinutes),
      includedMinutes,
      extraMinutes,
      ratePerHour,
      payableAmount,
      amount,
      billingSource,
    };
  }).filter((item) => item.name || item.lcId);
  const itemTotal = items.reduce((total, item) => total + item.amount, 0);
  const rawAdjustment = safeDetails?.billing_adjustment;
  const explicitAdjustment = Number(rawAdjustment);
  const hasExplicitAdjustment = rawAdjustment !== undefined
    && rawAdjustment !== null
    && rawAdjustment !== "";
  const billingAdjustment = hasExplicitAdjustment && Number.isFinite(explicitAdjustment)
    ? explicitAdjustment
    : getNumber(lcTotal) - itemTotal;

  return {
    hasLc: items.length > 0 || getNumber(lcTotal) > 0,
    detailLoaded: safeDetails !== null,
    detailAvailable: safeDetails?.detail_available !== false && (items.length > 0 || getNumber(lcTotal) > 0),
    items,
    itemTotal,
    billingAdjustment,
    total: getNumber(lcTotal),
    message: getText(safeDetails?.message),
  };
}

function normalizePayment(transaction) {
  return {
    status: getText(transaction.payment_status),
    method: getText(transaction.payment_method),
    cashAmount: getNumber(transaction.cash_amount),
    transferAmount: getNumber(transaction.transfer_amount),
  };
}

function formatReceiptDuration(value) {
  const totalMinutes = Math.max(0, Math.round(getNumber(value)));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours} jam ${minutes} menit`;
  }

  if (hours > 0) {
    return `${hours} jam`;
  }

  return `${minutes} menit`;
}

function normalizeTotals(transaction) {
  const netRoomTotal = getNumber(transaction.room_total);
  const fnbTotal = getNumber(transaction.fnb_total);
  const lcTotal = getNumber(transaction.lc_total);
  const grandTotal = getNumber(transaction.grand_total);
  const promoCode = getText(transaction.promo_code);
  const promoDiscount = getNumber(transaction.promo_discount);
  const roomDiscountAmount = getNumber(transaction.room_discount_amount);
  const manualDiscount = getNumber(transaction.manual_discount);
  const manualRoomDiscount = getNumber(transaction.manual_discount_room);
  const manualFnbDiscount = getNumber(transaction.manual_discount_fnb);
  const grossRoomTotal = netRoomTotal + promoDiscount + roomDiscountAmount + manualRoomDiscount;
  const grossFnbTotal = fnbTotal + manualFnbDiscount;

  return {
    roomTotal: grossRoomTotal,
    netRoomTotal,
    fnbTotal,
    grossFnbTotal,
    lcTotal,
    grandTotal: grandTotal > 0 ? grandTotal : netRoomTotal + fnbTotal + lcTotal,
    promoCode,
    promoDiscount,
    roomDiscountAmount,
    manualDiscount,
    manualRoomDiscount,
    manualFnbDiscount,
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
