/**
 * ════════════════════════════════════════════════════════════════
 *  Push Notifications Manager - إدارة الإشعارات الفورية (Web Push API)
 *  يتيح للموظفين والمديرين استقبال تنبيهات حتى عندما يكون التطبيق مغلقاً.
 * ════════════════════════════════════════════════════════════════
 */

import { logger } from '../services/utils/logger';

export const pushNotificationManager = {
  async isSupported(): Promise<boolean> {
    return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
  },

  async getPermissionStatus(): Promise<NotificationPermission> {
    if (!await this.isSupported()) return 'denied';
    return Notification.permission;
  },

  async requestPermission(): Promise<NotificationPermission> {
    if (!await this.isSupported()) return 'denied';
    const permission = await Notification.requestPermission();
    logger.info(`[Push] Permission status: ${permission}`, { component: 'PushManager', action: 'requestPermission' });
    return permission;
  },

  async subscribeUser(): Promise<PushSubscription | null> {
    try {
      if (!await this.isSupported()) return null;
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nks8Ww';
        const convertedVapidKey = this.urlBase64ToUint8Array(vapidPublicKey);
        
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey as any,
        });
      }
      logger.info('[Push] User subscribed successfully', { component: 'PushManager', action: 'subscribe' });
      return subscription;
    } catch (err) {
      logger.error('[Push] Failed to subscribe user:', { error: err });
      return null;
    }
  },

  urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
};
