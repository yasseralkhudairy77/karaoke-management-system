package com.happysong.tvnotify;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Menampilkan kotak peringatan (overlay) di atas aplikasi lain, TANPA mengambil fokus.
 *
 * Dipicu dari bridge lewat satu perintah ADB:
 *   adb -s <ip>:5555 shell am start-foreground-service \
 *       -n com.happysong.tvnotify/.OverlayService \
 *       --es text "SISA WAKTU 15 MENIT" --es subtext "Hubungi kasir untuk perpanjang" \
 *       --ei seconds 20
 *
 * Perintah lain: --es cmd hide  -> menutup overlay saat itu juga (dipakai untuk uji/rollback).
 *
 * Prinsip yang tidak boleh dilanggar (kriteria T2/T5):
 *   - jendela WAJIB FLAG_NOT_FOCUSABLE: perpindahan fokus itulah yang membuat YouTube menjeda lagu;
 *   - FLAG_NOT_TOUCHABLE supaya sentuhan tetap diteruskan ke aplikasi di bawahnya;
 *   - satu jendela saja, perintah beruntun hanya memperbarui teks + mereset timer (kriteria T4).
 */
public class OverlayService extends Service {

    private static final String TAG = "TvNotifyOverlay";
    private static final String CHANNEL_ID = "tvnotify";
    private static final int NOTIFICATION_ID = 4711;

    private WindowManager windowManager;
    private LinearLayout box;
    private TextView titleView;
    private TextView subView;
    private int shownCount = 0;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable autoHide = new Runnable() {
        @Override
        public void run() {
            Log.i(TAG, "AUTO_HIDE");
            hideOverlay();
        }
    };

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(autoHide);
        removeBox();
        super.onDestroy();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Kontrak foreground service: harus dipanggil < 5 detik setelah
        // am start-foreground-service, kalau tidak aplikasi dianggap gagal (ANR/crash).
        startForegroundInternal();

        if (intent == null) {
            Log.i(TAG, "START_TANPA_INTENT");
            stopSelf();
            return START_NOT_STICKY;
        }

        String cmd = intent.getStringExtra("cmd");
        if ("hide".equalsIgnoreCase(cmd)) {
            Log.i(TAG, "CMD_HIDE");
            hideOverlay();
            return START_NOT_STICKY;
        }

        String text = intent.getStringExtra("text");
        String subtext = intent.getStringExtra("subtext");
        int seconds = intent.getIntExtra("seconds", 20);
        if (text == null || text.trim().isEmpty()) {
            text = "SISA WAKTU";
        }
        if (seconds < 3) seconds = 3;
        if (seconds > 600) seconds = 600;

        showOrUpdate(text.trim(), subtext, seconds);
        return START_NOT_STICKY;
    }

    // ------------------------------------------------------------------ overlay

    private void showOrUpdate(String text, String subtext, int seconds) {
        if (box == null) {
            windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
            box = buildBox();
            try {
                windowManager.addView(box, buildParams());
                Log.i(TAG, "OVERLAY_ADDED");
            } catch (Exception e) {
                Log.e(TAG, "OVERLAY_ADD_FAILED " + e, e);
                box = null;
                stopSelf();
                return;
            }
        }

        titleView.setText(text);
        if (subtext == null || subtext.trim().isEmpty()) {
            subView.setVisibility(View.GONE);
        } else {
            subView.setVisibility(View.VISIBLE);
            subView.setText(subtext.trim());
        }

        shownCount++;
        handler.removeCallbacks(autoHide);
        handler.postDelayed(autoHide, seconds * 1000L);
        Log.i(TAG, "OVERLAY_SHOWN n=" + shownCount
                + " text=" + text
                + " sub=" + (subtext == null ? "" : subtext.trim())
                + " seconds=" + seconds);
    }

    private void hideOverlay() {
        handler.removeCallbacks(autoHide);
        removeBox();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void removeBox() {
        if (box == null) {
            return;
        }
        try {
            if (windowManager != null) {
                windowManager.removeViewImmediate(box);
            }
            Log.i(TAG, "OVERLAY_REMOVED");
        } catch (Exception e) {
            Log.w(TAG, "OVERLAY_REMOVE_FAILED " + e);
        }
        box = null;
        titleView = null;
        subView = null;
    }

    // ----------------------------------------------------------------- tampilan

    private LinearLayout buildBox() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(dp(34), dp(22), dp(34), dp(22));
        root.setMinimumWidth(dp(860));

        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.argb(238, 14, 14, 18));
        bg.setCornerRadius(dp(18));
        bg.setStroke(dp(4), Color.parseColor("#FFC400"));
        root.setBackground(bg);

        titleView = new TextView(this);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 60);
        titleView.setTypeface(Typeface.DEFAULT_BOLD);
        titleView.setGravity(Gravity.CENTER);
        root.addView(titleView);

        subView = new TextView(this);
        subView.setTextColor(Color.parseColor("#FFC400"));
        subView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 28);
        subView.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams subParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        subParams.topMargin = dp(12);
        root.addView(subView, subParams);

        return root;
    }

    private WindowManager.LayoutParams buildParams() {
        int type = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;

        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        lp.y = dp(60);
        lp.setTitle("tvnotify-overlay");
        return lp;
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value,
                getResources().getDisplayMetrics()));
    }

    // -------------------------------------------------------------- notifikasi

    private void startForegroundInternal() {
        try {
            startForeground(NOTIFICATION_ID, buildNotification());
        } catch (Exception e) {
            Log.w(TAG, "START_FOREGROUND_FAILED " + e);
        }
    }

    @SuppressWarnings("deprecation")
    private Notification buildNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Pengingat waktu",
                    NotificationManager.IMPORTANCE_MIN);
            ch.setSound(null, null);
            ch.enableVibration(false);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }

        Notification.Builder b = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        b.setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("Pengingat waktu tampil")
                .setContentText("Pesan peringatan sedang ditampilkan di layar")
                .setOngoing(true);
        return b.build();
    }
}
