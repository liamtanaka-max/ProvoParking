// Best-effort telemetry. A timer start must never depend on this service.
export const VISIT_KEY = 'provoParking.visit.v1';
export function createVisitTracker({ storage, rpc, uuid = () => crypto.randomUUID(), now = () => Date.now() }) {
  let data = null, identity = null, chain = Promise.resolve();
  const makeVisit = (ownerId = null) => ({id:uuid(), secret:uuid(), createdAt:now(), ownerId});
  const save = () => storage.setItem(VISIT_KEY, JSON.stringify(data));
  const call = async (name, args) => { const {error} = await rpc(name,args); if (error) throw error; };
  const args = visit => ({p_id:visit.id,p_secret:visit.secret});
  const schedule = fn => { chain=chain.then(fn).catch(()=>{}); return chain; };
  async function sendPending() {
    if (!data) return;
    for (const entry of [...data.pending]) {
      if (entry.kind === 'account' && (!identity || entry.ownerId !== identity)) continue;
      try {
        await call('visit_open',args(entry.visit));
        if (entry.kind === 'account') {
          await call('visit_bind',args(entry.visit));
          await call('visit_link_account',{...args(entry.visit),p_session:entry.id});
        } else {
          await call('visit_complete_guest',{...args(entry.visit),p_session:entry.id,p_started:entry.startedAt});
        }
        if (entry.kind==='guest' && data.active.id===entry.visit.id) data.active.guestLinked=true;
        data.pending=data.pending.filter(item=>item.key!==entry.key);
        save();
      } catch { /* Keep each failed item for a later retry. */ }
    }
  }
  function enqueue(kind, session, ownerId = null, capturedVisit = null) {
    if (!data?.active) return Promise.resolve();
    try {
      const visit = capturedVisit || (kind === 'account' && identity !== ownerId ? null : data.active);
      if (!visit) return Promise.resolve();
      const id=kind==='account' ? session.session_id : session.id;
      const key=`${kind}:${id}`;
      if (!data.pending.some(item=>item.key===key)) data.pending.push({key,kind,id,ownerId,startedAt:session.startedAt,visit:{...visit}});
      save();
      return schedule(sendPending);
    } catch { return Promise.resolve(); }
  }
  return {
    open({asGuest = false} = {}) {
      try {
        const raw=storage.getItem(VISIT_KEY); data=raw ? JSON.parse(raw) : null;
        if (!data?.active || !Array.isArray(data.pending)) data={active:makeVisit(),pending:[]};
        const age=now()-data.active.createdAt;
        if (age<0 || age>3600000 || (asGuest && data.active.ownerId)) data.active=makeVisit();
        data.pending=data.pending.filter(item=>now()-item.visit.createdAt<=86400000);
        save();
        const visit={...data.active};
        return schedule(async()=>{ try { await call('visit_open',args(visit)); } catch {} await sendPending(); });
      } catch { data=null; return Promise.resolve(); }
    },
    bind(ownerId) {
      if (!data || !ownerId) return Promise.resolve();
      identity=ownerId;
      try {
        if ((data.active.ownerId && data.active.ownerId!==ownerId) || data.active.guestLinked || data.pending.some(item=>item.kind==='guest' && item.visit.id===data.active.id)) data.active=makeVisit(ownerId);
        else data.active.ownerId=ownerId;
        save();
        const visit={...data.active};
        return schedule(async()=>{
          try { await call('visit_open',args(visit)); await call('visit_bind',args(visit)); }
          catch (error) {
            // A duplicated browser tab can inherit another account's capability.
            if (error?.code==='42501' && identity===ownerId && data.active.id===visit.id) {
              try { data.active=makeVisit(ownerId); save(); await call('visit_open',args(data.active)); await call('visit_bind',args(data.active)); } catch {}
            }
          }
          await sendPending();
        });
      } catch { return Promise.resolve(); }
    },
    signedOut() {
      identity=null;
      if (!data) return;
      try { data.active=makeVisit(); save(); } catch {}
    },
    captureAccount(ownerId) { return data?.active && identity===ownerId ? {...data.active} : null; },
    accountStarted(session, ownerId, visit = null) { return enqueue('account',session,ownerId,visit); },
    guestStarted(session) { return enqueue('guest',session); },
    flush() { return schedule(sendPending); },
  };
}
