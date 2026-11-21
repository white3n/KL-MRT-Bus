package my.kltransit.live;

import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.os.Bundle;
import androidx.core.content.pm.PackageInfoCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String PREFS_NAME = "kl_transit_app_meta";
    private static final String KEY_LAST_VERSION_CODE = "last_version_code";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TransitLiveNotificationPlugin.class);
        super.onCreate(savedInstanceState);

        try {
            PackageInfo pInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
            long currentVersion = PackageInfoCompat.getLongVersionCode(pInfo);
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            long lastVersion = prefs.getLong(KEY_LAST_VERSION_CODE, -1L);

            if (lastVersion != currentVersion && this.bridge != null && this.bridge.getWebView() != null) {
                this.bridge.getWebView().clearCache(true);
                this.bridge.getWebView().reload();
                prefs.edit().putLong(KEY_LAST_VERSION_CODE, currentVersion).apply();
            }
        } catch (Exception ignored) {
            // Safe fallback if package metadata is unavailable
        }
    }
}
