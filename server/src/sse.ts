type Sender = (data: string) => void;

const clients = new Set<Sender>();

export function subscribe(send: Sender): () => void {
  clients.add(send);
  return () => clients.delete(send);
}

export function broadcast(): void {
  for (const send of clients) {
    try { send("ping"); } catch { clients.delete(send); }
  }
}

export function clientCount(): number {
  return clients.size;
}
