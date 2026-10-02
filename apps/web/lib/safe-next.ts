/** Only internal destinations after auth, so emailed links can't bounce people to other sites. */
export function safeNext(raw: string | null) {
  return raw && (raw.startsWith('/app') || raw === '/reset-password') ? raw : '/app';
}
