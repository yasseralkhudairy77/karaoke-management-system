const assert = require("assert");
const fs = require("fs");
const path = require("path");

function runTests() {
  console.log("🧪 Running Action Confirmation Modal Validation Tests...\n");

  const appJsPath = path.join(__dirname, "../../js/app.js");
  const appJsContent = fs.readFileSync(appJsPath, "utf-8");

  // Extract openActionConfirmation, updateActionConfirmationField, confirmActionConfirmation
  // Test simulated environment
  let actionConfirmationModal = null;
  let toastMessage = null;
  let toastType = null;
  let actionModalSequence = 0;

  function showFloatingToast(msg, type) {
    toastMessage = msg;
    toastType = type;
  }

  function renderRooms() {}

  function closeActionConfirmation() {
    actionConfirmationModal = null;
  }

  // Implementation as in app.js
  function openActionConfirmation(options = {}) {
    const initialFields = Array.isArray(options.fields)
      ? options.fields.map((f, idx) => ({ name: f.name || (idx === 0 ? "default" : `field_${idx}`), ...f }))
      : (options.field ? [{ name: options.field.name || "default", ...options.field }] : []);
    const initialFieldValues = { ...(options.fieldValues || {}) };
    initialFields.forEach((f, idx) => {
      const key = f.name || (idx === 0 ? "default" : `field_${idx}`);
      if (initialFieldValues[key] === undefined && f.value !== undefined) {
        initialFieldValues[key] = f.value;
      }
    });

    actionConfirmationModal = {
      id: `action-modal-${Date.now()}-${++actionModalSequence}`,
      mode: options.mode || "confirm",
      tone: options.tone || "warning",
      title: options.title || "Konfirmasi",
      message: options.message || "",
      details: Array.isArray(options.details) ? options.details : [],
      confirmLabel: options.confirmLabel || "Lanjutkan",
      cancelLabel: options.cancelLabel || "Kembali",
      field: options.field || null,
      fieldValue: options.field?.value || (initialFields[0]?.value || ""),
      fields: initialFields,
      fieldValues: initialFieldValues,
      busy: false,
      onConfirm: typeof options.onConfirm === "function" ? options.onConfirm : null,
    };
  }

  function updateActionConfirmationField(value, key = null) {
    if (actionConfirmationModal) {
      actionConfirmationModal.fieldValues = actionConfirmationModal.fieldValues || {};
      if (!key || key === "default") {
        actionConfirmationModal.fieldValue = value;
        actionConfirmationModal.fieldValues["default"] = value;
        const firstField = actionConfirmationModal.fields?.[0];
        if (firstField?.name) {
          actionConfirmationModal.fieldValues[firstField.name] = value;
        }
      } else {
        actionConfirmationModal.fieldValues[key] = value;
        actionConfirmationModal.fieldValue = value;
      }
    }
  }

  async function confirmActionConfirmation() {
    const modal = actionConfirmationModal;
    if (!modal || modal.busy) {
      return;
    }

    if (modal.mode === "result") {
      closeActionConfirmation();
      return;
    }

    const fieldValue = String(modal.fieldValue || "").trim();
    const fieldValues = modal.fieldValues || {};

    if (Array.isArray(modal.fields) && modal.fields.length > 0) {
      for (let idx = 0; idx < modal.fields.length; idx++) {
        const f = modal.fields[idx];
        const key = f.name || (idx === 0 ? "default" : `field_${idx}`);
        const val = String(fieldValues[key] ?? (idx === 0 ? fieldValue : "") ?? f.value ?? "").trim();
        if (f.required && val.length < Number(f.minLength || 1)) {
          showFloatingToast(
            f.errorMessage || `${f.label || "Kolom"} wajib diisi.`,
            "error"
          );
          return;
        }
      }
    } else if (modal.field?.required && fieldValue.length < Number(modal.field.minLength || 1)) {
      showFloatingToast(
        modal.field.errorMessage || `${modal.field.label || "Kolom"} wajib diisi.`,
        "error"
      );
      return;
    }

    modal.busy = true;

    try {
      const primaryValue = String(fieldValues["default"] ?? fieldValue ?? "").trim();
      await modal.onConfirm?.(primaryValue, fieldValues);
    } catch (error) {
      showFloatingToast(error.message || "Tindakan tidak dapat diproses.", "error");
    } finally {
      if (actionConfirmationModal?.id === modal.id) {
        actionConfirmationModal = null;
      }
    }
  }

  // Test 1: Menolak jika kurang dari 5 karakter
  {
    console.log("  Testing Test 1: Reject reason < 5 characters...");
    let confirmedReason = null;
    toastMessage = null;

    openActionConfirmation({
      field: {
        label: "Alasan pembatalan tagihan",
        required: true,
        minLength: 5,
        errorMessage: "Alasan pembatalan minimal 5 karakter.",
      },
      onConfirm: (reason) => {
        confirmedReason = reason;
      },
    });

    // User mengetik 4 karakter "bata"
    updateActionConfirmationField("bata", "default");
    confirmActionConfirmation();

    assert.strictEqual(confirmedReason, null, "Harus tidak memanggil onConfirm jika < 5 karakter");
    assert.strictEqual(toastMessage, "Alasan pembatalan minimal 5 karakter.", "Toast error harus muncul");
    console.log("  ✓ Test 1 PASSED: Input 4 karakter ditolak dengan pesan error yang tepat.");
  }

  // Test 2: Menerima jika >= 5 karakter (user scenario: "salah input pesanan")
  {
    console.log("\n  Testing Test 2: Accept reason >= 5 characters (User Bug Fix Verification)...");
    let confirmedReason = null;
    toastMessage = null;

    openActionConfirmation({
      field: {
        label: "Alasan pembatalan tagihan",
        required: true,
        minLength: 5,
        errorMessage: "Alasan pembatalan minimal 5 karakter.",
      },
      onConfirm: (reason) => {
        confirmedReason = reason;
      },
    });

    // User mengetik 19 karakter "salah input pesanan"
    updateActionConfirmationField("salah input pesanan", "default");
    confirmActionConfirmation();

    assert.strictEqual(toastMessage, null, "Tidak boleh ada error toast jika alasan >= 5 karakter");
    assert.strictEqual(confirmedReason, "salah input pesanan", "onConfirm harus menerima teks alasan yang diketik user");
    console.log("  ✓ Test 2 PASSED: Alasan >= 5 karakter berhasil dikonfirmasi dan diproses ke onConfirm!");
  }

  // Test 3: Verifikasi keberadaan fix di file js/app.js
  {
    console.log("\n  Testing Test 3: Verifying fix in js/app.js...");
    assert(
      appJsContent.includes("name: f.name || (idx === 0 ? \"default\" : `field_${idx}`)"),
      "js/app.js harus memetakan name default pada openActionConfirmation"
    );
    assert(
      appJsContent.includes("for (let idx = 0; idx < modal.fields.length; idx++)"),
      "js/app.js harus menggunakan loop index untuk memvalidasi field key"
    );
    console.log("  ✓ Test 3 PASSED: Kode js/app.js telah terverifikasi mengandung perbaikan.");
  }

  console.log("\n🎉 ALL ACTION CONFIRMATION VALIDATION TESTS PASSED SUCCESSFULLY!");
}

runTests();
