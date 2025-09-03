package com.nourishme.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import androidx.core.view.WindowCompat;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Register Capacitor Push Notifications plugin
        registerPlugin(PushNotificationsPlugin.class);
        registerPlugin(WidgetRefresherPlugin.class);
        // Schedule Shadow background jobs
        ShadowWorkScheduler.scheduleAll(this);
        // Ensure the app content does not draw under system bars (status/navigation)
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
    }
}
