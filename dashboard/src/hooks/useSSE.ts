import { useEffect } from "react";

export function useSSE(onEvent: () => void): void {
  useEffect(() => {
    const es = new EventSource("/sse");
    es.onmessage = () => onEvent();
    es.onerror = () => { /* reconnect is automatic */ };
    return () => es.close();
  }, []);
}
