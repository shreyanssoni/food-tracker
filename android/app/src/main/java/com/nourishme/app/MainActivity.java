package com.nourishme.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import androidx.core.view.WindowCompat;
import io.capawesome.capacitorjs.plugins.firebase.authentication.FirebaseAuthenticationPlugin;
import com.google.firebase.FirebaseApp;
import android.util.Log;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.graphics.Color;
import com.google.firebase.messaging.FirebaseMessaging;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Ensure Firebase is initialized for Authentication
        try { FirebaseApp.initializeApp(this); } catch (Exception ignored) {}
        // Enable Firebase Messaging auto-init to make sure token is generated
        try { FirebaseMessaging.getInstance().setAutoInitEnabled(true); } catch (Exception e) { Log.w("MainActivity", "Failed to enable FCM auto init", e); }
        // Ensure a default notification channel exists so system settings toggle becomes available
        createDefaultNotificationChannel();
        try {
            String webClientId = getString(R.string.default_web_client_id);
            Log.d("MainActivity", "default_web_client_id=" + webClientId);
        } catch (Exception e) {
            Log.e("MainActivity", "default_web_client_id missing or unreadable", e);
        }
        // Register Capacitor Push Notifications plugin
        registerPlugin(PushNotificationsPlugin.class);
        // Register Firebase Authentication plugin explicitly
        registerPlugin(FirebaseAuthenticationPlugin.class);
        registerPlugin(WidgetRefresherPlugin.class);
        // Schedule Shadow background jobs
        ShadowWorkScheduler.scheduleAll(this);
        // Ensure the app content does not draw under system bars (status/navigation)
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
    }

    private void createDefaultNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                String channelId = "default";
                String channelName = "Default";
                String channelDesc = "General notifications";
                int importance = NotificationManager.IMPORTANCE_HIGH;

                NotificationChannel channel = new NotificationChannel(channelId, channelName, importance);
                channel.setDescription(channelDesc);
                channel.enableLights(true);
                channel.setLightColor(Color.GREEN);
                channel.enableVibration(true);

                NotificationManager manager = getSystemService(NotificationManager.class);
                if (manager != null) {
                    manager.createNotificationChannel(channel);
                    Log.d("MainActivity", "Default notification channel ensured");
                }
            } catch (Exception e) {
                Log.w("MainActivity", "Failed to create default notification channel", e);
            }
        }
    }
}
