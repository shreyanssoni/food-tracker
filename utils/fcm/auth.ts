import { Capacitor } from '@capacitor/core';
import { createClient } from '@/utils/supabase/client';

/**
 * Register FCM token for the current user
 * This should be called after successful authentication
 */
export async function registerFcmTokenForUser(userId: string): Promise<void> {
  try {
    // Check if we're on a native platform
    if (Capacitor.getPlatform() !== 'android') {
      console.log('Not on Android platform, skipping FCM registration');
      return;
    }

    // Get FCM token from native side
    const { PushNotifications } = await import('@capacitor/push-notifications');
    
    // Request permission first
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') {
      console.log('Push notification permission not granted');
      return;
    }

    // Register for push notifications
    await PushNotifications.register();

    // Listen for registration
    PushNotifications.addListener('registration', async (token) => {
      console.log('FCM Token received:', token.value);
      
      // Store token in database
      await storeFcmToken(userId, token.value);
    });

    // Listen for registration errors
    PushNotifications.addListener('registrationError', (error) => {
      console.error('FCM registration error:', error);
    });

  } catch (error) {
    console.error('Error registering FCM token:', error);
  }
}

/**
 * Store FCM token in the database
 */
async function storeFcmToken(userId: string, token: string): Promise<void> {
  try {
    const supabase = createClient();
    
    // Check if token already exists
    const { data: existingToken } = await supabase
      .from('fcm_tokens')
      .select('id')
      .eq('user_id', userId)
      .eq('token', token)
      .single();

    if (existingToken) {
      console.log('FCM token already exists for user');
      return;
    }

    // Insert new token
    const { error } = await supabase
      .from('fcm_tokens')
      .insert({
        user_id: userId,
        token,
        platform: 'android',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Error storing FCM token:', error);
    } else {
      console.log('FCM token stored successfully');
    }

  } catch (error) {
    console.error('Error in storeFcmToken:', error);
  }
}

/**
 * Remove FCM token when user logs out
 */
export async function removeFcmTokenForUser(userId: string): Promise<void> {
  try {
    const supabase = createClient();
    
    // Remove all tokens for this user
    const { error } = await supabase
      .from('fcm_tokens')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('Error removing FCM tokens:', error);
    } else {
      console.log('FCM tokens removed for user');
    }

  } catch (error) {
    console.error('Error in removeFcmTokenForUser:', error);
  }
}

/**
 * Update FCM token (called when token is refreshed)
 */
export async function updateFcmToken(userId: string, oldToken: string, newToken: string): Promise<void> {
  try {
    const supabase = createClient();
    
    // Update the token
    const { error } = await supabase
      .from('fcm_tokens')
      .update({
        token: newToken,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('token', oldToken);

    if (error) {
      console.error('Error updating FCM token:', error);
    } else {
      console.log('FCM token updated successfully');
    }

  } catch (error) {
    console.error('Error in updateFcmToken:', error);
  }
}

/**
 * Initialize FCM listeners for the app
 * This should be called when the app starts
 */
export async function initializeFcmListeners(userId: string): Promise<void> {
  try {
    if (Capacitor.getPlatform() !== 'android') {
      return;
    }

    const { PushNotifications } = await import('@capacitor/push-notifications');

    // Listen for token refresh
    PushNotifications.addListener('registration', async (token) => {
      console.log('FCM Token refreshed:', token.value);
      await storeFcmToken(userId, token.value);
    });

    // Listen for push notifications
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push notification received:', notification);
      // Handle notification display here
    });

    // Listen for notification taps
    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      console.log('Push notification action performed:', notification);
      // Handle notification tap here
    });

  } catch (error) {
    console.error('Error initializing FCM listeners:', error);
  }
}

/**
 * Check if FCM is available and enabled
 */
export async function isFcmAvailable(): Promise<boolean> {
  try {
    if (Capacitor.getPlatform() !== 'android') {
      return false;
    }

    const { PushNotifications } = await import('@capacitor/push-notifications');
    const permission = await PushNotifications.checkPermissions();
    
    return permission.receive === 'granted';
  } catch (error) {
    console.error('Error checking FCM availability:', error);
    return false;
  }
}
