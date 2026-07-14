# F&B v2.4 Beer Holic Package Result

Status:
COMPLETED

Scope:
- F&B v2.4 Package Import Tool committed.
- Backup confirmed before execute.
- Package import executed successfully.
- Production read-only validation passed.
- No partial insert.

Tool checkpoint:
- Package Import Tool commit: dfe0b91c319f106cb0b35d430a5e07603b7a7511
- Package Import Tool tag: fnb-v2.4-package-import-tool

Import identity:
- import_id: IMP-FNB-V24-PACKAGE-20260714-120217
- import_id source: inferred from inserted `updated_at` timestamp because read-only package endpoints do not expose importer audit output.
- inserted_at: 2026-07-14T12:02:17+07:00

Backup confirmation:
- backup_confirmed: true

Inserted PackageMaster row:
- package_id: PKG-001
- menu_id: empty
- package_name: Beer Holic Package
- package_category: Beer Holic
- package_type: room_fnb_bundle
- selling_price: 1100000
- status: active
- valid_day_type: all
- duration_minutes: 120
- updated_at: 2026-07-14T12:02:17+07:00
- note: Package karaoke 2 jam + F&B

Inserted PackageDetail rows:
- PKD-001:
  - package_id: PKG-001
  - line_no: 1
  - component_type: service
  - component_ref_id: SVC-001
  - component_name: Room
  - qty: 2
  - unit: Hour
  - is_choice: false
- PKD-002:
  - package_id: PKG-001
  - line_no: 2
  - component_type: service
  - component_ref_id: SVC-002
  - component_name: LC/Talent
  - qty: 2
  - unit: Person
  - is_choice: false
- PKD-003:
  - package_id: PKG-001
  - line_no: 3
  - component_type: inventory
  - component_ref_id: ITEM-004
  - component_name: Beer
  - qty: 6
  - unit: botol
  - is_choice: false
- PKD-004:
  - package_id: PKG-001
  - line_no: 4
  - component_type: inventory
  - component_ref_id: ITEM-005
  - component_name: Mineral Water 330ml
  - qty: 2
  - unit: botol
  - is_choice: false
- PKD-005:
  - package_id: PKG-001
  - line_no: 5
  - component_type: menu
  - component_ref_id: MENU-004
  - component_name: Fruit Platter
  - qty: 1
  - unit: porsi
  - is_choice: false

Reference validation:
- SVC-001 Room: PASS
- SVC-002 LC/Talent: PASS
- ITEM-004 Beer: PASS
- ITEM-005 Mineral Water 330ml: PASS
- MENU-004 Fruit Platter: PASS

Validation result:
- PKG-001 inserted: PASS
- PKD-001..PKD-005 inserted: PASS
- package_id duplicate: 0
- package_detail_id duplicate: 0
- reference validation: PASS
- partial_insert: false
- blockers: none

Production status:
- getPackages shows PKG-001 active.
- getPackageDetails shows five detail rows for PKG-001.
- Production package count: 1
- Production package detail count for PKG-001: 5
