import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { client, getJson } from "../../api/client";

const pushKeys = { subscription: ["push", "subscription"] as const };

export const pushSupported = typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = window.atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export function usePushNotifications() {
  const queryClient = useQueryClient();

  const subscription = useQuery({
    queryKey: pushKeys.subscription,
    queryFn: async () => (await currentSubscription()) !== null,
    enabled: pushSupported,
    staleTime: Infinity,
  });

  const toggle = useMutation({
    mutationFn: async (enable: boolean) => {
      const existing = await currentSubscription();
      if (!enable) {
        await existing?.unsubscribe();
        await client.delete("/push/unsubscribe");
        return false;
      }
      const { public_key } = await getJson<{ public_key: string }>("/push/vapid-public-key");
      const registration = await navigator.serviceWorker.ready;
      const created =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(public_key),
        }));
      await client.post("/push/subscribe", created.toJSON());
      return true;
    },
    onSuccess: (enabled) => queryClient.setQueryData(pushKeys.subscription, enabled),
  });

  return { supported: pushSupported, enabled: subscription.data ?? false, toggle };
}
