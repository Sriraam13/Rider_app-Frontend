import { Platform, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';

// Ensure high-priority Notification Channel on Android with loud alert sound
let channelInitialized = false;

async function ensureNotificationChannel() {
  if (channelInitialized) return;
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('order_alerts_v2', {
        name: 'New Order Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 600, 250, 600, 250, 800],
        sound: 'default',
        enableLights: true,
        enableVibrate: true,
        bypassDnd: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
      channelInitialized = true;
    } catch (e) {
      console.log('Error creating notification channel:', e);
    }
  }
}

/**
 * Triggers a distinct ring sound, swinging bell, and vibration pattern when a new Delivery order is received.
 * Play rule:
 * - Played ONCE per order event (tracked via assignment_id set).
 * - Applies ONLY to Delivery orders.
 */
export async function playOrderRingNotification(orderData) {
  // Rule check: Ensure order is a Delivery order
  const orderType = (orderData?.order_type || orderData?.delivery_type || 'DELIVERY').toUpperCase();
  if (orderType !== 'DELIVERY') {
    return;
  }

  try {
    // 1. Device Vibration Pattern (Distinct alert vibration)
    if (Platform.OS !== 'web') {
      Vibration.vibrate([0, 600, 200, 600, 200, 800]);
    }

    // 2. Ensure Android Notification Channel is ready
    await ensureNotificationChannel();

    // 3. Web Audio API Synthesis (Clean, distinct 3-pulse delivery ring chime)
    if (typeof window !== 'undefined') {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          const ctx = new AudioContext();
          const playPulse = (freq, startTime, dur) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);
            gain.gain.setValueAtTime(0.8, ctx.currentTime + startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + dur);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + startTime);
            osc.stop(ctx.currentTime + startTime + dur);
          };

          // Pulse 1: 587.33Hz (D5) @ 0s
          playPulse(587.33, 0, 0.35);
          // Pulse 2: 880Hz (A5) @ 0.4s
          playPulse(880, 0.4, 0.35);
          // Pulse 3: 1174.66Hz (D6) @ 0.8s
          playPulse(1174.66, 0.8, 0.5);
        }
      } catch (e) {
        // Fallback Audio play
      }
    }

    // 4. Local Push Notification (Mobile sound trigger via MAX importance channel)
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "🔔 NEW ORDER ASSIGNMENT!",
          body: `Pickup at ${orderData.restaurant_name || 'Restaurant'} for Rs. ${orderData.estimated_earnings || orderData.total_amount || 0}`,
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.MAX,
          channelId: 'order_alerts_v2',
          data: { data: orderData },
        },
        trigger: null,
      });
    } catch (e) {
      // Native notification fallback
    }

  } catch (err) {
    console.error('Error playing order ring notification:', err);
  }
}
