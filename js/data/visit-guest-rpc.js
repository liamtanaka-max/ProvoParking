// Anonymous RPC only. No account credentials or private data leave this client.
export function createGuestVisitRpc({url, key, fetch: send = globalThis.fetch}) {
  const base = url.replace(/\/+$/, '');
  return async (name, args) => {
    const response = await send(`${base}/rest/v1/rpc/${name}`, {
      method:'POST', headers:{apikey:key, ...(key.startsWith('sb_publishable_') ? {} : {Authorization:`Bearer ${key}`}), 'Content-Type':'application/json'},
      body:JSON.stringify(args),
    });
    return {error:response.ok ? null : new Error('Visit tracking is unavailable.')};
  };
}
