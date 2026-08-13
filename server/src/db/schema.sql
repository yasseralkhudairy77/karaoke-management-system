-- =============================================================================
-- HAPPY SONG KARAOKE MANAGEMENT SYSTEM - POSTGRESQL PRODUCTION-READY SCHEMA DDL
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Settings & Configurations
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Staff, Access Roles & Security PINs (Supports plain & hashed PIN migration)
CREATE TABLE IF NOT EXISTS employees (
    employee_id VARCHAR(50) PRIMARY KEY,
    employee_name VARCHAR(100) NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN ('owner', 'manager', 'cashier', 'receptionist')),
    pin VARCHAR(255),
    pin_hash VARCHAR(255),
    salary_type VARCHAR(30) DEFAULT 'monthly',
    base_salary NUMERIC(12,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Master Rooms
CREATE TABLE IF NOT EXISTS rooms (
    room_id VARCHAR(50) PRIMARY KEY,
    room_name VARCHAR(100) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'available' 
        CHECK (status IN ('available', 'paid_waiting_start', 'occupied', 'cleaning', 'maintenance')),
    start_time TIMESTAMPTZ,
    booked_duration_minutes INT DEFAULT 0,
    scheduled_end_time TIMESTAMPTZ,
    rate_per_hour NUMERIC(12,2) NOT NULL DEFAULT 0,
    tv_device_id VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. TV Devices & Customer Displays
CREATE TABLE IF NOT EXISTS tv_devices (
    tv_device_id VARCHAR(50) PRIMARY KEY,
    room_id VARCHAR(50) REFERENCES rooms(room_id) ON DELETE SET NULL,
    device_name VARCHAR(100) NOT NULL,
    control_type VARCHAR(30) NOT NULL CHECK (control_type IN ('mock', 'middleware', 'home_assistant', 'manual')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    middleware_url TEXT,
    device_identifier VARCHAR(100),
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tv_displays (
    display_id VARCHAR(50) PRIMARY KEY,
    room_id VARCHAR(50) REFERENCES rooms(room_id) ON DELETE CASCADE,
    display_name VARCHAR(100) NOT NULL,
    display_token VARCHAR(255) UNIQUE NOT NULL,
    display_enabled BOOLEAN DEFAULT TRUE,
    refresh_interval_seconds INT DEFAULT 30,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Master Inventory, Menu & Recipes (BOM)
CREATE TABLE IF NOT EXISTS inventory (
    stock_item_id VARCHAR(50) PRIMARY KEY,
    stock_item_name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    stock_qty NUMERIC(12,2) NOT NULL DEFAULT 0,
    min_stock NUMERIC(12,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS menu (
    menu_id VARCHAR(50) PRIMARY KEY,
    menu_name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    price NUMERIC(12,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    stock_tracking VARCHAR(10) DEFAULT 'no' CHECK (stock_tracking IN ('yes', 'no')),
    stock_item_id VARCHAR(50) REFERENCES inventory(stock_item_id) ON DELETE SET NULL,
    stock_qty_per_unit NUMERIC(12,2) DEFAULT 1,
    bonus_sales_lc NUMERIC(12,2) DEFAULT 0,
    hpp NUMERIC(12,2) DEFAULT 0,
    variable_cost_rate NUMERIC(5,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recipe (
    recipe_id VARCHAR(50) PRIMARY KEY,
    menu_id VARCHAR(50) REFERENCES menu(menu_id) ON DELETE CASCADE,
    item_id VARCHAR(50) REFERENCES inventory(stock_item_id) ON DELETE RESTRICT,
    qty_used NUMERIC(12,4) NOT NULL,
    unit VARCHAR(20) NOT NULL
);

-- 6. Packages & Promos
CREATE TABLE IF NOT EXISTS package_master (
    package_id VARCHAR(50) PRIMARY KEY,
    package_name VARCHAR(100) NOT NULL,
    package_category VARCHAR(50),
    package_type VARCHAR(50) DEFAULT 'room_fnb_bundle',
    selling_price NUMERIC(12,2) NOT NULL,
    duration_minutes INT NOT NULL,
    valid_day_type VARCHAR(20) DEFAULT 'all' CHECK (valid_day_type IN ('all', 'weekday', 'weekend')),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS package_details (
    package_detail_id VARCHAR(50) PRIMARY KEY,
    package_id VARCHAR(50) REFERENCES package_master(package_id) ON DELETE CASCADE,
    line_no INT NOT NULL,
    component_type VARCHAR(30) CHECK (component_type IN ('service', 'inventory', 'menu')),
    component_ref_id VARCHAR(50) NOT NULL,
    component_name VARCHAR(100) NOT NULL,
    qty NUMERIC(12,2) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    hpp NUMERIC(12,2) DEFAULT 0,
    additional_price NUMERIC(12,2) DEFAULT 0,
    cost_amount NUMERIC(12,2) DEFAULT 0,
    is_choice BOOLEAN DEFAULT FALSE,
    choice_group VARCHAR(50),
    note TEXT
);

CREATE TABLE IF NOT EXISTS promos (
    promo_code VARCHAR(50) PRIMARY KEY,
    promo_name VARCHAR(100) NOT NULL,
    discount_type VARCHAR(20) CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value NUMERIC(12,2) NOT NULL,
    max_discount NUMERIC(12,2),
    min_spend NUMERIC(12,2) DEFAULT 0,
    valid_from DATE,
    valid_until DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. Master LC (Lady Companion / PR)
CREATE TABLE IF NOT EXISTS lc_master (
    lc_id VARCHAR(50) PRIMARY KEY,
    lc_name VARCHAR(100) NOT NULL,
    rate_per_hour NUMERIC(12,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    phone VARCHAR(30),
    joined_date DATE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. Room Sessions Canonical Lifecycle
CREATE TABLE IF NOT EXISTS room_sessions (
    session_id VARCHAR(100) PRIMARY KEY,
    room_id VARCHAR(50) REFERENCES rooms(room_id),
    room_name VARCHAR(100) NOT NULL,
    booking_mode VARCHAR(20) DEFAULT 'regular' CHECK (booking_mode IN ('regular', 'package')),
    status VARCHAR(30) NOT NULL CHECK (status IN ('starting', 'active', 'closing', 'closed', 'voided', 'start_failed', 'close_failed')),
    start_time TIMESTAMPTZ NOT NULL,
    scheduled_end_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    booked_duration_minutes INT NOT NULL,
    package_included_minutes INT DEFAULT 0,
    promotion_free_minutes INT DEFAULT 0,
    billable_room_minutes INT NOT NULL,
    rate_per_hour NUMERIC(12,2) NOT NULL,
    cashier_name VARCHAR(100) NOT NULL,
    closed_transaction_id VARCHAR(50),
    idempotency_key VARCHAR(100) UNIQUE,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 9. Transactions & Billing Breakdown (Postpaid Room Billing Default)
CREATE TABLE IF NOT EXISTS transactions (
    transaction_id VARCHAR(50) PRIMARY KEY,
    room_id VARCHAR(50) REFERENCES rooms(room_id),
    room_name VARCHAR(100) NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    duration_minutes INT NOT NULL,
    rate_per_hour NUMERIC(12,2) NOT NULL,
    room_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    fnb_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    lc_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    grand_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    fnb_order_ids TEXT,
    payment_method VARCHAR(30) DEFAULT 'cash' CHECK (payment_method IN ('cash', 'qris', 'transfer', '')),
    payment_status VARCHAR(30) DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'cancelled')),
    cashier_name VARCHAR(100) NOT NULL,
    operational_date DATE NOT NULL,
    idempotency_key VARCHAR(100) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transaction_lines (
    transaction_line_id VARCHAR(100) PRIMARY KEY,
    transaction_id VARCHAR(50) REFERENCES transactions(transaction_id) ON DELETE CASCADE,
    session_id VARCHAR(100) REFERENCES room_sessions(session_id),
    line_type VARCHAR(30) NOT NULL,
    source_type VARCHAR(30),
    source_id VARCHAR(50),
    description TEXT NOT NULL,
    qty NUMERIC(12,2) NOT NULL DEFAULT 1,
    unit VARCHAR(20),
    unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(12,2) DEFAULT 0,
    net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(12,2) DEFAULT 0,
    sort_order INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    snapshot_json JSONB
);

-- 10. F&B Orders & Order Items (Strict Server-Calculated Price & Idempotency)
CREATE TABLE IF NOT EXISTS fnb_orders (
    order_id VARCHAR(50) PRIMARY KEY,
    room_id VARCHAR(50) REFERENCES rooms(room_id),
    room_name VARCHAR(100) NOT NULL,
    room_start_time TIMESTAMPTZ,
    order_status VARCHAR(30) DEFAULT 'open' CHECK (order_status IN ('open', 'billed', 'cancelled')),
    order_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    cashier_name VARCHAR(100) NOT NULL,
    note TEXT,
    cancel_reason TEXT,
    cancelled_by VARCHAR(100),
    cancelled_at TIMESTAMPTZ,
    idempotency_key VARCHAR(100) UNIQUE,
    customer_name VARCHAR(100),
    general_bill_id VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fnb_order_items (
    order_item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id VARCHAR(50) REFERENCES fnb_orders(order_id) ON DELETE CASCADE,
    menu_id VARCHAR(50) REFERENCES menu(menu_id),
    menu_name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    price NUMERIC(12,2) NOT NULL,
    quantity INT NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 11. Stock Movements & Audits (Stock Opname)
CREATE TABLE IF NOT EXISTS stock_movements (
    movement_id VARCHAR(50) PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    stock_item_id VARCHAR(50) REFERENCES inventory(stock_item_id),
    stock_item_name VARCHAR(100) NOT NULL,
    movement_type VARCHAR(20) CHECK (movement_type IN ('in', 'out', 'adjustment')),
    reference_type VARCHAR(30) CHECK (reference_type IN ('transaction', 'manual_adjustment', 'stock_audit', 'fnb_order')),
    reference_id VARCHAR(50),
    qty_change NUMERIC(12,2) NOT NULL,
    stock_before NUMERIC(12,2) NOT NULL,
    stock_after NUMERIC(12,2) NOT NULL,
    note TEXT,
    cashier_name VARCHAR(100) NOT NULL,
    idempotency_key VARCHAR(100) UNIQUE
);

CREATE TABLE IF NOT EXISTS inventory_audits (
    audit_id VARCHAR(50) PRIMARY KEY,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'counting', 'submitted', 'posted')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) NOT NULL,
    submitted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    approved_by VARCHAR(100),
    note TEXT
);

CREATE TABLE IF NOT EXISTS inventory_audit_lines (
    audit_line_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    audit_id VARCHAR(50) REFERENCES inventory_audits(audit_id) ON DELETE CASCADE,
    stock_item_id VARCHAR(50) REFERENCES inventory(stock_item_id),
    stock_item_name VARCHAR(100) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    book_qty_snapshot NUMERIC(12,2) NOT NULL,
    count_qty NUMERIC(12,2) DEFAULT 0,
    count_method VARCHAR(30) DEFAULT 'unit_count',
    sealed_container_qty NUMERIC(12,2) DEFAULT 0,
    open_container_percentages_json JSONB,
    difference_qty NUMERIC(12,2) DEFAULT 0,
    reason_code VARCHAR(50),
    movement_id VARCHAR(50) REFERENCES stock_movements(movement_id),
    note TEXT
);

-- 12. LC Logs, Advances & Petty Cash
CREATE TABLE IF NOT EXISTS lc_work_logs (
    log_id VARCHAR(50) PRIMARY KEY,
    session_id VARCHAR(100) REFERENCES room_sessions(session_id),
    room_id VARCHAR(50) REFERENCES rooms(room_id),
    room_name VARCHAR(100) NOT NULL,
    lc_id VARCHAR(50) REFERENCES lc_master(lc_id),
    lc_name VARCHAR(100) NOT NULL,
    duration_minutes INT NOT NULL,
    rate_per_hour NUMERIC(12,2) NOT NULL,
    rate NUMERIC(12,2) NOT NULL,
    status VARCHAR(30) DEFAULT 'active' CHECK (status IN ('active', 'done', 'closed', 'paid', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMPTZ,
    cashier_name VARCHAR(100) NOT NULL,
    note TEXT,
    payroll_id VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS lc_sales_bonus_logs (
    bonus_log_id VARCHAR(50) PRIMARY KEY,
    operational_date DATE NOT NULL,
    transaction_id VARCHAR(50) REFERENCES transactions(transaction_id),
    order_id VARCHAR(50) REFERENCES fnb_orders(order_id),
    menu_id VARCHAR(50) REFERENCES menu(menu_id),
    menu_name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    lc_id VARCHAR(50) REFERENCES lc_master(lc_id),
    lc_name VARCHAR(100) NOT NULL,
    quantity INT NOT NULL,
    bonus_per_item NUMERIC(12,2) NOT NULL,
    bonus_total NUMERIC(12,2) NOT NULL,
    source_status VARCHAR(20) DEFAULT 'earned' CHECK (source_status IN ('earned', 'voided', 'payrolled')),
    payroll_id VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) NOT NULL,
    voided_at TIMESTAMPTZ,
    void_reason TEXT
);

CREATE TABLE IF NOT EXISTS petty_cash_ledger (
    ledger_id VARCHAR(50) PRIMARY KEY,
    operational_date DATE NOT NULL,
    entry_type VARCHAR(20) CHECK (entry_type IN ('cash_in', 'cash_out', 'adjustment')),
    category VARCHAR(50) NOT NULL,
    reference_type VARCHAR(30),
    reference_id VARCHAR(50),
    lc_id VARCHAR(50) REFERENCES lc_master(lc_id),
    lc_name VARCHAR(100),
    cash_in_amount NUMERIC(12,2) DEFAULT 0,
    cash_out_amount NUMERIC(12,2) DEFAULT 0,
    balance_after NUMERIC(12,2) NOT NULL,
    cashier_name VARCHAR(100) NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    voided_at TIMESTAMPTZ,
    void_reason TEXT
);

CREATE TABLE IF NOT EXISTS lc_cash_advances (
    cash_advance_id VARCHAR(50) PRIMARY KEY,
    operational_date DATE NOT NULL,
    lc_id VARCHAR(50) REFERENCES lc_master(lc_id),
    lc_name VARCHAR(100) NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'deducted', 'cancelled')),
    requested_by VARCHAR(100) NOT NULL,
    cashier_name VARCHAR(100) NOT NULL,
    petty_cash_ledger_id VARCHAR(50) REFERENCES petty_cash_ledger(ledger_id),
    payroll_id VARCHAR(50),
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deducted_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT
);

CREATE TABLE IF NOT EXISTS lc_payroll_history (
    payroll_id VARCHAR(50) PRIMARY KEY,
    payroll_period_start DATE NOT NULL,
    payroll_period_end DATE NOT NULL,
    total_hours NUMERIC(12,2) NOT NULL DEFAULT 0,
    room_earning_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    sales_bonus_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    cash_advance_deducted NUMERIC(12,2) NOT NULL DEFAULT 0,
    gross_earning_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    net_payout_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    processed_by VARCHAR(100) NOT NULL,
    petty_cash_ledger_id VARCHAR(50) REFERENCES petty_cash_ledger(ledger_id),
    status VARCHAR(20) DEFAULT 'processed' CHECK (status IN ('processed', 'paid', 'voided', 'adjusted')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 13. Cashier Closings & Frozen Snapshots (Strict UNIQUE per closing_date)
CREATE TABLE IF NOT EXISTS cashier_closings (
    closing_id VARCHAR(50) PRIMARY KEY,
    closing_date DATE NOT NULL UNIQUE,
    cashier_name VARCHAR(100) NOT NULL,
    total_transactions INT DEFAULT 0,
    paid_transactions INT DEFAULT 0,
    unpaid_transactions INT DEFAULT 0,
    cash_transactions INT DEFAULT 0,
    transfer_transactions INT DEFAULT 0,
    paid_revenue NUMERIC(12,2) DEFAULT 0,
    cash_expected NUMERIC(12,2) DEFAULT 0,
    cash_actual NUMERIC(12,2) DEFAULT 0,
    cash_difference NUMERIC(12,2) DEFAULT 0,
    transfer_revenue NUMERIC(12,2) DEFAULT 0,
    unpaid_revenue NUMERIC(12,2) DEFAULT 0,
    total_revenue NUMERIC(12,2) DEFAULT 0,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cashier_closing_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    closing_id VARCHAR(50) REFERENCES cashier_closings(closing_id) ON DELETE CASCADE,
    transaction_id VARCHAR(50) NOT NULL,
    room_id VARCHAR(50),
    room_name VARCHAR(100),
    duration_minutes INT,
    room_total NUMERIC(12,2),
    fnb_total NUMERIC(12,2),
    lc_total NUMERIC(12,2),
    grand_total NUMERIC(12,2),
    payment_method VARCHAR(30),
    payment_status VARCHAR(30),
    created_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cashier_closing_fnb_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    closing_id VARCHAR(50) REFERENCES cashier_closings(closing_id) ON DELETE CASCADE,
    order_id VARCHAR(50),
    menu_id VARCHAR(50),
    menu_name VARCHAR(100),
    category VARCHAR(50),
    price NUMERIC(12,2),
    quantity INT,
    subtotal NUMERIC(12,2),
    order_status VARCHAR(30),
    created_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cashier_closing_lc_details (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    closing_id VARCHAR(50) REFERENCES cashier_closings(closing_id) ON DELETE CASCADE,
    lc_id VARCHAR(50),
    lc_name VARCHAR(100),
    type VARCHAR(30),
    duration_minutes INT,
    rate_per_hour NUMERIC(12,2),
    total_amount NUMERIC(12,2),
    created_at TIMESTAMPTZ
);

-- 14. Audit Logs & System Tracing
CREATE TABLE IF NOT EXISTS receipt_print_logs (
    print_log_id VARCHAR(50) PRIMARY KEY,
    transaction_id VARCHAR(50) REFERENCES transactions(transaction_id) ON DELETE CASCADE,
    print_sequence INT NOT NULL DEFAULT 1,
    is_reprint BOOLEAN DEFAULT FALSE,
    print_type VARCHAR(20) CHECK (print_type IN ('browser', 'thermal')),
    cashier_name VARCHAR(100) NOT NULL,
    printed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    note TEXT
);

CREATE TABLE IF NOT EXISTS room_time_logs (
    log_id VARCHAR(50) PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    action_type VARCHAR(30) NOT NULL,
    room_id VARCHAR(50) REFERENCES rooms(room_id),
    room_name VARCHAR(100) NOT NULL,
    old_booked_duration_minutes INT,
    new_booked_duration_minutes INT,
    old_scheduled_end_time TIMESTAMPTZ,
    new_scheduled_end_time TIMESTAMPTZ,
    add_minutes INT NOT NULL,
    cashier_name VARCHAR(100) NOT NULL,
    note TEXT
);

CREATE TABLE IF NOT EXISTS room_recovery_logs (
    log_id VARCHAR(50) PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    room_id VARCHAR(50) REFERENCES rooms(room_id),
    room_name VARCHAR(100) NOT NULL,
    session_id VARCHAR(100),
    issue_type VARCHAR(50),
    expired_minutes INT,
    action VARCHAR(50),
    reason TEXT,
    actor VARCHAR(100),
    result VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS tv_control_logs (
    log_id VARCHAR(50) PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    room_id VARCHAR(50) REFERENCES rooms(room_id),
    tv_device_id VARCHAR(50) REFERENCES tv_devices(tv_device_id),
    tv_action VARCHAR(30) NOT NULL,
    trigger_source VARCHAR(50),
    cashier_name VARCHAR(100),
    control_type VARCHAR(30),
    result VARCHAR(30),
    success BOOLEAN,
    block_reason VARCHAR(100),
    message TEXT,
    raw_response TEXT
);

CREATE TABLE IF NOT EXISTS master_data_audit_logs (
    log_id VARCHAR(50) PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    entity_type VARCHAR(30) NOT NULL,
    entity_id VARCHAR(50) NOT NULL,
    entity_name VARCHAR(100) NOT NULL,
    action_type VARCHAR(30) NOT NULL,
    old_value_json JSONB,
    new_value_json JSONB,
    changed_by VARCHAR(100) NOT NULL,
    note TEXT,
    result VARCHAR(30),
    block_reason TEXT
);

-- 15. Local -> Cloud Synchronization Outbox Queue (Railway Worker Queue)
CREATE TABLE IF NOT EXISTS sync_outbox (
    sync_id BIGSERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(50) NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    payload_json JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'synced', 'failed', 'dead_letter')),
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 5,
    last_attempt_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unq_sync_outbox_entity_action UNIQUE (entity_type, entity_id, action)
);

-- 16. Temporary Owner Mirror Snapshot Inbox (Local PC -> Railway Cloud)
CREATE TABLE IF NOT EXISTS owner_mirror_snapshots (
    snapshot_id BIGSERIAL PRIMARY KEY,
    source_id VARCHAR(100) NOT NULL DEFAULT 'happy-song-local',
    mirror_version VARCHAR(100),
    generated_at TIMESTAMPTZ,
    generated_at_wib VARCHAR(40),
    period VARCHAR(30),
    operational_date_start DATE,
    operational_date_end DATE,
    payload_json JSONB NOT NULL,
    received_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance & reporting
CREATE INDEX IF NOT EXISTS idx_sync_outbox_pending ON sync_outbox(status, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_transactions_opdate ON transactions(operational_date);
CREATE INDEX IF NOT EXISTS idx_fnb_orders_status ON fnb_orders(order_status, room_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(stock_item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_owner_mirror_snapshots_latest ON owner_mirror_snapshots(source_id, received_at DESC);
