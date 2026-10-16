import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../api/client";

const pushKeys = { subscription: ["push", "subscription"] as const };

export const pushSupported = typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = window.atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameKey(subscription: PushSubscription, publicKey: Uint8Array): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === publicKey.length && bytes.every((value, index) => value === publicKey[index]);
}

async function serverKey(): Promise<Uint8Array<ArrayBuffer>> {
  const { public_key } = await api.get<{ public_key: string }>("/push/vapid-public-key");
  return urlBase64ToUint8Array(public_key);
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export function usePushNotifications() {
  const queryClient = useQueryClient();

  const subscription = useQuery({
    queryKey: pushKeys.subscription,
    queryFn: async () => {
      const existing = await currentSubscription();
      if (!existing) return false;
      if (sameKey(existing, await serverKey())) return true;
      await existing.unsubscribe();
      return false;
    },
    enabled: pushSupported,
    staleTime: Infinity,
  });

  const toggle = useMutation({
    mutationFn: async (enable: boolean) => {
      const existing = await currentSubscription();
      if (!enable) {
        await existing?.unsubscribe();
        await api.delete("/push/unsubscribe");
        return false;
      }
      const key = await serverKey();
      const registration = await navigator.serviceWorker.ready;
      const reusable = existing && sameKey(existing, key) ? existing : null;
      if (existing && !reusable) await existing.unsubscribe();
      const created =
        reusable ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
      await api.post("/push/subscribe", created.toJSON());
      return true;
    },
    onSuccess: (enabled) => queryClient.setQueryData(pushKeys.subscription, enabled),
  });

  const forget = async () => {
    queryClient.setQueryData(pushKeys.subscription, false);
    if (!pushSupported) return;
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      await (await registration?.pushManager.getSubscription())?.unsubscribe();
    } catch (error) {
      console.warn("Could not remove the browser push subscription", error);
    }
  };

  return { supported: pushSupported, enabled: subscription.data ?? false, toggle, forget };
}
