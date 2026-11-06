// Re-evaluate at minute boundaries and immediately on return from a sleeping tab.
export function createParkingClock({ enabled, refresh, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let timer;
  function stop() { if (timer !== undefined) clearTimer(timer); timer = undefined; }
  function update() {
    stop();
    if (!enabled()) return;
    refresh();
    timer = setTimer(update, 60000 - (now() % 60000) + 20);
  }
  return { update, stop };
}
