import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../api/client";
import type { NotificationSettings, NotificationTopic } from "../../api/types";

const settingsKey = ["notification-settings"] as const;

export function useNotificationSettings(enabled = true) {
  return useQuery({
    queryKey: settingsKey,
    queryFn: () => api.get<NotificationSettings>("/profile/notifications"),
    enabled,
  });
}

export function useChangeNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ topic, enabled }: { topic: NotificationTopic; enabled: boolean }) =>
      api.patch<NotificationSettings>("/profile/notifications", { [topic]: enabled }),
    onMutate: async ({ topic, enabled }) => {
      await queryClient.cancelQueries({ queryKey: settingsKey });
      const previous = queryClient.getQueryData<NotificationSettings>(settingsKey);
      if (previous) queryClient.setQueryData<NotificationSettings>(settingsKey, { ...previous, [topic]: enabled });
      return { previous };
    },
    onError: (_error, _change, context) => {
      if (context?.previous) queryClient.setQueryData(settingsKey, context.previous);
    },
    onSuccess: (settings) => queryClient.setQueryData(settingsKey, settings),
  });
}
