import crypto from 'node:crypto';

export function createSignedHeaders(secret, rawBody) {
  const timestamp = String(Date.now());
  const nonce = crypto.randomBytes(16).toString('hex');
  const signedPayload = `${timestamp}.${nonce}.${rawBody}`;
  const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return {
    'content-type': 'application/json',
    'x-adms-timestamp': timestamp,
    'x-adms-nonce': nonce,
    'x-adms-signature': signature,
  };
}
