// Expo push (US-29). Expo's service runs in the US: payloads are generic (see mail/messages.ts) and carry only
// the report ID. If the DSFA rejects this, swap this sender for direct APNs and FCM (engineering plan).
export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

export type PushResult = { ok: true } | { ok: false; unregistered: boolean; error: string };

export interface PushSender {
  /** One result per message, in order. */
  send(messages: PushMessage[]): Promise<PushResult[]>;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK = 100;

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

export function expoPushSender(options: { accessToken?: string; fetch?: typeof fetch } = {}): PushSender {
  const doFetch = options.fetch ?? fetch;
  return {
    async send(messages) {
      const results: PushResult[] = [];
      for (let i = 0; i < messages.length; i += CHUNK) {
        const chunk = messages.slice(i, i + CHUNK);
        const response = await doFetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            ...(options.accessToken ? { authorization: `Bearer ${options.accessToken}` } : {}),
          },
          body: JSON.stringify(chunk.map((m) => ({ ...m, sound: 'default' }))),
        });
        if (!response.ok) {
          const error = `Expo push answered ${response.status}`;
          results.push(...chunk.map(() => ({ ok: false, unregistered: false, error }) as const));
          continue;
        }
        const { data } = (await response.json()) as { data: ExpoTicket[] };
        for (let j = 0; j < chunk.length; j++) {
          const ticket = data[j];
          if (ticket?.status === 'ok') results.push({ ok: true });
          else {
            const code = ticket?.details?.error ?? 'unknown';
            results.push({ ok: false, unregistered: code === 'DeviceNotRegistered', error: ticket?.message ?? code });
          }
        }
      }
      return results;
    },
  };
}
