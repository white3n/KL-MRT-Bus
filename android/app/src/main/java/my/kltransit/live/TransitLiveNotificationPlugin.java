package my.kltransit.live;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "TransitLiveNotification",
    permissions = {
        @Permission(
            alias = "notifications",
            strings = { Manifest.permission.POST_NOTIFICATIONS }
        )
    }
)
public class TransitLiveNotificationPlugin extends Plugin {

    private static final String CHANNEL_ID = "kl_transit_live_tracker";
    private static final int NOTIFICATION_ID = 4201;
    private static final String ACTION_STOP_TRACKING = "my.kltransit.live.ACTION_STOP_TRACKING";

    private BroadcastReceiver stopReceiver;

    @Override
    public void load() {
        super.load();
        ensureChannel();
        registerStopReceiver();
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        if (stopReceiver != null) {
            try {
                getContext().unregisterReceiver(stopReceiver);
            } catch (Exception ignored) {
            }
            stopReceiver = null;
        }
    }

    private void registerStopReceiver() {
        if (stopReceiver != null) return;
        stopReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (ACTION_STOP_TRACKING.equals(intent.getAction())) {
                    cancelNotification();
                    JSObject payload = new JSObject();
                    payload.put("reason", "user_action");
                    notifyListeners("trackingStopped", payload);
                }
            }
        };
        IntentFilter filter = new IntentFilter(ACTION_STOP_TRACKING);
        ContextCompat.registerReceiver(
            getContext(),
            stopReceiver,
            filter,
            ContextCompat.RECEIVER_NOT_EXPORTED
        );
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "KL Transit Live Tracker",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Live train countdown and bus GPS status on lock screen and notification bar");
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.setShowBadge(false);
            channel.enableVibration(false);
            channel.setSound(null, null);
            nm.createNotificationChannel(channel);
        }
    }

    private boolean hasNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return true;
        }
        return getPermissionState("notifications") == PermissionState.GRANTED;
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasNotificationPermission());
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (hasNotificationPermission()) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("notifications", call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasNotificationPermission());
        call.resolve(ret);
    }

    @PluginMethod
    public void showLiveNotification(PluginCall call) {
        if (!hasNotificationPermission()) {
            JSObject ret = new JSObject();
            ret.put("shown", false);
            ret.put("reason", "permission_denied");
            call.resolve(ret);
            return;
        }

        ensureChannel();

        String title = call.getString("title", "KL Transit Live");
        String body = call.getString("body", "");
        String subText = call.getString("subText", "LIVE");
        String stopLabel = call.getString("stopLabel", "Stop");
        String colorHex = call.getString("colorHex", "#2563EB");
        Integer progress = call.getInt("progress");
        Integer maxProgress = call.getInt("maxProgress");

        int accentColor;
        try {
            accentColor = Color.parseColor(colorHex);
        } catch (Exception e) {
            accentColor = Color.parseColor("#2563EB");
        }

        Context ctx = getContext();

        Intent openIntent = new Intent(ctx, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentPendingIntent = PendingIntent.getActivity(
            ctx,
            100,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent stopIntent = new Intent(ACTION_STOP_TRACKING);
        stopIntent.setPackage(ctx.getPackageName());
        PendingIntent stopPendingIntent = PendingIntent.getBroadcast(
            ctx,
            101,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_transit)
            .setContentTitle(title)
            .setContentText(body)
            .setSubText(subText)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setColor(accentColor)
            .setColorized(true)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(contentPendingIntent)
            .addAction(0, stopLabel, stopPendingIntent)
            .setShowWhen(true)
            .setWhen(System.currentTimeMillis());

        if (progress != null && maxProgress != null && maxProgress > 0) {
            int clamped = Math.max(0, Math.min(maxProgress, progress));
            builder.setProgress(maxProgress, clamped, false);
        }

        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(NOTIFICATION_ID, builder.build());
        }

        JSObject ret = new JSObject();
        ret.put("shown", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void dismissLiveNotification(PluginCall call) {
        cancelNotification();
        call.resolve();
    }

    private void cancelNotification() {
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(NOTIFICATION_ID);
        }
    }
}
