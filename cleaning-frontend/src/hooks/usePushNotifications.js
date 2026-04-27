import { useState, useEffect } from "react";
import client from "../api/client";

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window;
    setIsSupported(supported);

    if (supported) {
      checkExistingSubscription();
    }
  }, []);

  const checkExistingSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (e) {
      console.error("Check subscription failed:", e);
    }
  };

  const subscribe = async () => {
    setLoading(true);
    try {
      const { data } = await client.get("/push/vapid-public-key");
      const publicKey = data.public_key;

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await client.post("/push/subscribe", subscription.toJSON());
      setIsSubscribed(true);
    } catch (e) {
      console.error("Push subscription failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async () => {
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
        }
      }
      await client.delete("/push/unsubscribe");
      setIsSubscribed(false);
    } finally {
      setLoading(false);
    }
  };

  return { isSupported, isSubscribed, subscribe, unsubscribe, loading };
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
