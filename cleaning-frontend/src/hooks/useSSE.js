import { useEffect, useRef } from "react";

export function useSSE(onEvent) {
  const esRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const es = new EventSource(
      `http://localhost:8080/events/stream?token=${token}`,
    );

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type !== "ping") {
          onEvent(data);
        }
      } catch (e) {
        console.error("SSE parse error:", e);
      }
    };

    es.onerror = (err) => {
      console.error("SSE error:", err);
      es.close();
    };

    esRef.current = es;

    return () => {
      es.close();
    };
  }, []);
}
