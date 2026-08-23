const db = require('../db');
const { errorResponse } = require('../utils/response');
const { getOperationalDateRange } = require('../utils/operationalDate');
const { ensureOperationalAuditSchema } = require('../services/operationalAuditService');

const ACTION_LABELS = {
  package_correction: 'Koreksi Paket Transaksi',
  free_room_correction: 'Free Room',
  manual_discount_correction: 'Diskon Management',
  fnb_item_void_correction: 'Void F&B',
  lc_duration_correction: 'Koreksi Durasi LC',
  transaction_cancelled: 'Pembatalan Transaksi',
  transaction_details_updated: 'Perubahan Detail Transaksi',
  manual_outage_transaction: 'Transaksi Manual / Gangguan',
  promo_applied: 'Promo / Voucher Digunakan',
  fnb_order_cancelled: 'Pembatalan Order F&B',
  booking_cancelled: 'Pembatalan Booking',
  extend_session: 'Tambah Waktu Room',
  correct_duration: 'Koreksi Durasi Room',
  move_room: 'Pindah Room',
  room_transfer: 'Pindah Room',
  package_change: 'Ubah Paket Sesi',
  manual_stock_adjustment: 'Penyesuaian Stok Manual',
  stock_audit_adjustment: 'Posting Stock Opname',
  receipt_reprint: 'Cetak Ulang Struk',
  room_recovery: 'Recovery Room',
  petty_cash: 'Petty Cash',
  lc_cash_advance: 'Kasbon LC',
  lc_payroll: 'Payroll LC',
  cashier_closing_difference: 'Selisih Closing Kasir',
  pin_validation: 'Validasi PIN',
  master_data_change: 'Perubahan Master Data'
};

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function riskRank(value) {
  return ({ critical: 4, high: 3, medium: 2, info: 1 })[String(value || '').toLowerCase()] || 0;
}

function serializeEvent(event) {
  const amountBefore = numberOrNull(event.amount_before);
  const amountAfter = numberOrNull(event.amount_after);
  const amountDelta = numberOrNull(event.amount_delta);
  return {
    ...event,
    event_id: String(event.event_id || ''),
    occurred_at: event.occurred_at ? new Date(event.occurred_at).toISOString() : '',
    risk_level: String(event.risk_level || 'info').toLowerCase(),
    action_label: event.action_label || ACTION_LABELS[event.event_type] || event.event_type || 'Perubahan',
    initiated_by_name: event.initiated_by_name || 'Operator',
    authorized_by_name: event.authorized_by_name || '',
    amount_before: amountBefore,
    amount_after: amountAfter,
    amount_delta: amountDelta,
    after_closing: Boolean(event.after_closing),
    reviewed: Boolean(event.reviewed),
    old_value_json: event.old_value_json || null,
    new_value_json: event.new_value_json || null,
    metadata_json: event.metadata_json || null
  };
}

function correctionRisk(type, afterClosing) {
  if (afterClosing) return 'critical';
  if (type === 'transaction_cancelled') return 'critical';
  if (['manual_discount_correction', 'free_room_correction', 'fnb_item_void_correction', 'package_correction'].includes(type)) return 'high';
  return 'medium';
}

function getCorrectionAmounts(oldValue, newValue) {
  const before = numberOrNull(oldValue?.grand_total);
  const after = numberOrNull(newValue?.grand_total);
  return { before, after, delta: before !== null && after !== null ? after - before : null };
}

async function getOperationalAuditReport(req, res) {
  try {
    await ensureOperationalAuditSchema();
    const { startDate, endDate } = getOperationalDateRange(req.query.period || 'today', req.query.start_date, req.query.end_date);
    const dateParams = [startDate, endDate];
    const dateWhere = column => `DATE(${column} AT TIME ZONE 'Asia/Jakarta') BETWEEN $1 AND $2`;

    const [centralRes, correctionsRes, masterRes, roomTimeRes, stockRes, receiptRes, recoveryRes, pettyRes, advanceRes, payrollRes, closingRes, cancelledFnbRes] = await Promise.all([
      db.query(`SELECT * FROM operational_audit_events WHERE operational_date BETWEEN $1 AND $2 ORDER BY occurred_at DESC LIMIT 500`, dateParams),
      db.query(`
        SELECT l.*, t.room_id, t.room_name,
               EXISTS(SELECT 1 FROM cashier_closing_transactions cct WHERE cct.transaction_id = l.transaction_id) AS after_closing
        FROM transaction_correction_logs l
        LEFT JOIN transactions t ON t.transaction_id = l.transaction_id
        WHERE ${dateWhere('l.corrected_at')}
        ORDER BY l.corrected_at DESC LIMIT 500
      `, dateParams),
      db.query(`SELECT * FROM master_data_audit_logs WHERE ${dateWhere('created_at')} ORDER BY created_at DESC LIMIT 500`, dateParams),
      db.query(`SELECT * FROM room_time_logs WHERE ${dateWhere('created_at')} ORDER BY created_at DESC LIMIT 500`, dateParams),
      db.query(`
        SELECT * FROM stock_movements
        WHERE ${dateWhere('created_at')} AND reference_type IN ('manual_adjustment', 'stock_audit')
        ORDER BY created_at DESC LIMIT 500
      `, dateParams),
      db.query(`SELECT * FROM receipt_print_logs WHERE ${dateWhere('printed_at')} AND is_reprint = TRUE ORDER BY printed_at DESC LIMIT 300`, dateParams),
      db.query(`SELECT * FROM room_recovery_logs WHERE ${dateWhere('timestamp')} ORDER BY timestamp DESC LIMIT 300`, dateParams),
      db.query(`SELECT * FROM petty_cash_ledger WHERE ${dateWhere('created_at')} ORDER BY created_at DESC LIMIT 300`, dateParams),
      db.query(`SELECT * FROM lc_cash_advances WHERE ${dateWhere('created_at')} ORDER BY created_at DESC LIMIT 300`, dateParams),
      db.query(`SELECT * FROM lc_payroll_history WHERE ${dateWhere('created_at')} ORDER BY created_at DESC LIMIT 300`, dateParams),
      db.query(`SELECT * FROM cashier_closings WHERE ${dateWhere('created_at')} ORDER BY created_at DESC LIMIT 300`, dateParams),
      db.query(`SELECT * FROM fnb_orders WHERE order_status = 'cancelled' AND ${dateWhere('cancelled_at')} ORDER BY cancelled_at DESC LIMIT 300`, dateParams)
    ]);

    const centralSourceKeys = new Set(centralRes.rows
      .filter(row => row.source_table && row.source_record_id)
      .map(row => `${row.source_table}:${row.source_record_id}`));
    const events = centralRes.rows.map(row => serializeEvent(row));

    correctionsRes.rows.forEach(row => {
      if (centralSourceKeys.has(`transaction_correction_logs:${row.correction_id}`)) return;
      const oldValue = row.old_value_json || {};
      const newValue = row.new_value_json || {};
      const amounts = getCorrectionAmounts(oldValue, newValue);
      events.push(serializeEvent({
        event_id: `legacy-correction-${row.correction_id}`,
        occurred_at: row.corrected_at,
        risk_level: correctionRisk(row.correction_type, row.after_closing),
        domain: row.correction_type === 'fnb_item_void_correction' ? 'fnb' : 'transaction',
        event_type: row.correction_type,
        result: 'success',
        initiated_by_name: row.corrected_by,
        target_type: 'transaction',
        target_id: row.transaction_id,
        transaction_id: row.transaction_id,
        room_id: row.room_id,
        room_name: row.room_name,
        reason: row.reason,
        amount_before: amounts.before,
        amount_after: amounts.after,
        amount_delta: amounts.delta,
        old_value_json: oldValue,
        new_value_json: newValue,
        after_closing: row.after_closing
      }));
    });

    masterRes.rows.forEach(row => {
      if (centralSourceKeys.has(`master_data_audit_logs:${row.log_id}`)) return;
      const action = String(row.action_type || '').toLowerCase();
      const blocked = String(row.result || '').toLowerCase() === 'blocked';
      const highRisk = ['room_transfer', 'package_change', 'delete_permanent', 'deactivate'].includes(action);
      events.push(serializeEvent({
        event_id: `legacy-master-${row.log_id}`,
        occurred_at: row.created_at,
        risk_level: blocked && action === 'pin_validation' ? 'critical' : highRisk ? 'high' : 'medium',
        domain: row.entity_type === 'room_session' ? 'room' : 'master_data',
        event_type: action === 'room_transfer' || action === 'package_change' || action === 'pin_validation' ? action : 'master_data_change',
        action_label: ACTION_LABELS[action] || `${action || 'Perubahan'} ${row.entity_type || 'master'}`,
        result: row.result || 'success',
        initiated_by_name: row.changed_by,
        target_type: row.entity_type,
        target_id: row.entity_id,
        room_name: row.entity_type === 'room' || row.entity_type === 'room_session' ? row.entity_name : '',
        reason: row.note || row.block_reason || '',
        old_value_json: row.old_value_json,
        new_value_json: row.new_value_json,
        metadata_json: row.block_reason ? { block_reason: row.block_reason } : null
      }));
    });

    roomTimeRes.rows.forEach(row => {
      if (centralSourceKeys.has(`room_time_logs:${row.log_id}`)) return;
      const action = String(row.action_type || 'extend_session').toLowerCase();
      events.push(serializeEvent({
        event_id: `legacy-room-time-${row.log_id}`,
        occurred_at: row.created_at,
        risk_level: action === 'correct_duration' ? 'high' : action === 'move_room' ? 'medium' : 'info',
        domain: 'room',
        event_type: action,
        result: 'success',
        initiated_by_name: row.cashier_name,
        target_type: 'room',
        target_id: row.room_id,
        room_id: row.room_id,
        room_name: row.room_name,
        reason: row.note,
        old_value_json: { duration_minutes: Number(row.old_booked_duration_minutes || 0), scheduled_end_time: row.old_scheduled_end_time },
        new_value_json: { duration_minutes: Number(row.new_booked_duration_minutes || 0), scheduled_end_time: row.new_scheduled_end_time, add_minutes: Number(row.add_minutes || 0) }
      }));
    });

    stockRes.rows.forEach(row => {
      if (centralSourceKeys.has(`stock_movements:${row.movement_id}`)) return;
      events.push(serializeEvent({
        event_id: `legacy-stock-${row.movement_id}`,
        occurred_at: row.created_at,
        risk_level: row.reference_type === 'manual_adjustment' ? 'high' : 'medium',
        domain: 'stock',
        event_type: row.reference_type === 'manual_adjustment' ? 'manual_stock_adjustment' : 'stock_audit_adjustment',
        result: 'success',
        initiated_by_name: row.cashier_name,
        target_type: 'inventory',
        target_id: row.stock_item_id,
        reason: row.note,
        metadata_json: {
          stock_item_name: row.stock_item_name,
          movement_type: row.movement_type,
          stock_before: Number(row.stock_before || 0),
          stock_after: Number(row.stock_after || 0),
          qty_change: Number(row.qty_change || 0)
        }
      }));
    });

    receiptRes.rows.forEach(row => events.push(serializeEvent({
      event_id: `legacy-reprint-${row.print_log_id}`,
      occurred_at: row.printed_at,
      risk_level: Number(row.print_sequence || 0) >= 3 ? 'high' : 'medium',
      domain: 'transaction',
      event_type: 'receipt_reprint',
      result: 'success',
      initiated_by_name: row.cashier_name,
      target_type: 'transaction',
      target_id: row.transaction_id,
      transaction_id: row.transaction_id,
      reason: row.note || `Cetak ulang ke-${Math.max(1, Number(row.print_sequence || 1) - 1)}`,
      metadata_json: { print_sequence: Number(row.print_sequence || 0), print_type: row.print_type }
    })));

    recoveryRes.rows.forEach(row => events.push(serializeEvent({
      event_id: `legacy-recovery-${row.log_id}`,
      occurred_at: row.timestamp,
      risk_level: 'high',
      domain: 'room',
      event_type: 'room_recovery',
      result: row.result || 'success',
      initiated_by_name: row.actor,
      target_type: 'room',
      target_id: row.room_id,
      session_id: row.session_id,
      room_id: row.room_id,
      room_name: row.room_name,
      reason: row.reason,
      metadata_json: { issue_type: row.issue_type, action: row.action }
    })));

    pettyRes.rows.forEach(row => events.push(serializeEvent({
      event_id: `legacy-petty-${row.ledger_id}`,
      occurred_at: row.created_at,
      risk_level: Number(row.cash_out_amount || 0) > 0 ? 'high' : 'medium',
      domain: 'finance',
      event_type: 'petty_cash',
      result: 'success',
      initiated_by_name: row.cashier_name,
      target_type: 'petty_cash',
      target_id: row.ledger_id,
      reason: row.note || row.category,
      amount_before: Number(row.balance_after || 0) - Number(row.cash_in_amount || 0) + Number(row.cash_out_amount || 0),
      amount_after: Number(row.balance_after || 0),
      amount_delta: Number(row.cash_in_amount || 0) - Number(row.cash_out_amount || 0),
      metadata_json: { category: row.category, entry_type: row.entry_type }
    })));

    advanceRes.rows.forEach(row => events.push(serializeEvent({
      event_id: `legacy-advance-${row.cash_advance_id}`,
      occurred_at: row.created_at,
      risk_level: 'high',
      domain: 'lc',
      event_type: 'lc_cash_advance',
      result: 'success',
      initiated_by_name: row.cashier_name,
      target_type: 'lc',
      target_id: row.lc_id,
      reason: row.note || `Kasbon ${row.lc_name || row.lc_id}`,
      amount_delta: -Number(row.amount || 0),
      metadata_json: { lc_name: row.lc_name, requested_by: row.requested_by, status: row.status }
    })));

    payrollRes.rows.forEach(row => events.push(serializeEvent({
      event_id: `legacy-payroll-${row.payroll_id}`,
      occurred_at: row.created_at,
      risk_level: 'high',
      domain: 'lc',
      event_type: 'lc_payroll',
      result: 'success',
      initiated_by_name: row.processed_by,
      target_type: 'lc_payroll',
      target_id: row.payroll_id,
      reason: `Payroll ${row.payroll_period_start || ''} s/d ${row.payroll_period_end || ''}`,
      amount_delta: -Number(row.net_payout_total || row.total_amount || 0),
      metadata_json: { gross_total: Number(row.gross_earning_total || 0), cash_advance: Number(row.cash_advance_deducted || 0) }
    })));

    closingRes.rows.filter(row => Number(row.cash_difference || 0) !== 0).forEach(row => events.push(serializeEvent({
      event_id: `legacy-closing-${row.closing_id}`,
      occurred_at: row.created_at,
      risk_level: 'high',
      domain: 'closing',
      event_type: 'cashier_closing_difference',
      result: 'success',
      initiated_by_name: row.cashier_name,
      target_type: 'cashier_closing',
      target_id: row.closing_id,
      reason: row.note || 'Selisih kas aktual dan kas sistem',
      amount_before: Number(row.cash_expected || 0),
      amount_after: Number(row.cash_actual || 0),
      amount_delta: Number(row.cash_difference || 0)
    })));

    cancelledFnbRes.rows.forEach(row => {
      if (centralSourceKeys.has(`fnb_orders:${row.order_id}`)) return;
      events.push(serializeEvent({
        event_id: `legacy-fnb-cancel-${row.order_id}`,
        occurred_at: row.cancelled_at,
        risk_level: 'medium',
        domain: 'fnb',
        event_type: 'fnb_order_cancelled',
        result: 'success',
        initiated_by_name: row.cancelled_by,
        target_type: 'fnb_order',
        target_id: row.order_id,
        order_id: row.order_id,
        room_id: row.room_id,
        room_name: row.room_name,
        reason: row.cancel_reason,
        amount_before: Number(row.order_total || 0),
        amount_after: 0,
        amount_delta: -Number(row.order_total || 0)
      }));
    });

    const riskFilter = String(req.query.risk_level || 'all').toLowerCase();
    const domainFilter = String(req.query.domain || 'all').toLowerCase();
    const eventTypeFilter = String(req.query.event_type || 'all').toLowerCase();
    const operatorFilter = String(req.query.operator || '').trim().toLowerCase();
    const limit = Math.min(500, Math.max(20, Number(req.query.limit || 150)));
    const matchingEvents = events
      .filter(event => riskFilter === 'all' || event.risk_level === riskFilter)
      .filter(event => domainFilter === 'all' || event.domain === domainFilter)
      .filter(event => eventTypeFilter === 'all' || event.event_type === eventTypeFilter)
      .filter(event => !operatorFilter || `${event.initiated_by_name} ${event.authorized_by_name}`.toLowerCase().includes(operatorFilter))
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
    const filtered = matchingEvents.slice(0, limit);

    const attentionEvents = matchingEvents.filter(event => riskRank(event.risk_level) >= riskRank('high'));
    const revenueReduction = matchingEvents.reduce((total, event) => total + (Number(event.amount_delta) < 0 ? Math.abs(Number(event.amount_delta)) : 0), 0);
    return res.json({
      ok: true,
      success: true,
      events: filtered,
      summary: {
        total_events: matchingEvents.length,
        critical_events: matchingEvents.filter(event => event.risk_level === 'critical').length,
        high_events: matchingEvents.filter(event => event.risk_level === 'high').length,
        needs_attention: attentionEvents.length,
        revenue_reduction: revenueReduction,
        after_closing_events: matchingEvents.filter(event => event.after_closing).length
      },
      period: { start_date: startDate, end_date: endDate }
    });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

module.exports = { getOperationalAuditReport };
