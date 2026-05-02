import { useEffect, useRef } from "react";

const SSE_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:8080/events/stream"
    : "https://https://odd-boats-wish.loca.lt/events/stream";

export function useSSE(onEvent) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const es = new EventSource(`${SSE_URL}?token=${token}`);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type !== "ping") {
          onEventRef.current(data);
        }
      } catch (e) {}
    };

    es.onerror = () => {
      es.close();
    };

    return () => es.close();
  }, []);
}
