"use strict";

class RealtimeHub {
  #activeGuards = new WeakMap();

  constructor({ heartbeatMs = 25_000 } = {}) {
    this.clients = new Map();
    this.heartbeatMs = heartbeatMs;
  }

  // isActive — проверка, что сессия ещё действует. Её закрывают и в других процессах (команда issue-access-code),
  // поэтому поток проверяет её с каждым сигналом «соединение живо». Ответ «нет» или ошибка — поток закрывается.
  subscribe(sessionId, response, { isActive = null, assertActive = null } = {}) {
    const clients = this.clients.get(sessionId) || new Set();
    clients.add(response);
    this.clients.set(sessionId, clients);
    response.write("retry: 3000\n");
    response.write(`event: ready\ndata: ${JSON.stringify({ connected: true })}\n\n`);
    let checking = false;
    const unsubscribe = () => {
      clearInterval(heartbeat);
      this.#activeGuards.delete(response);
      clients.delete(response);
      if (!clients.size && this.clients.get(sessionId) === clients) this.clients.delete(sessionId);
    };
    const heartbeat = setInterval(async () => {
      if (checking) return;
      if (isActive) {
        checking = true;
        let active = false;
        try { active = await isActive(); } catch {}
        checking = false;
        if (!active && !response.writableEnded) {
          unsubscribe();
          try { response.end(`event: session-ended\ndata: ${JSON.stringify({ reason: "session_closed" })}\n\n`); } catch {}
          return;
        }
      }
      if (response.writableEnded) {
        unsubscribe();
        return;
      }
      try { response.write(": heartbeat\n\n"); } catch {}
    }, this.heartbeatMs);
    if (assertActive) this.#activeGuards.set(response, { assertActive, unsubscribe });
    return unsubscribe;
  }

  publish(event) {
    const body = `event: ${event.type || "message"}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const [sessionId, clients] of this.clients.entries()) {
      for (const response of clients) {
        const guarded = this.#activeGuards.get(response);
        if (guarded) {
          try {
            // This guard is synchronous: no expiry/revocation can interleave
            // between the final access check and sending the event payload.
            if (guarded.assertActive() === false) throw new Error("inactive_session");
          } catch {
            guarded.unsubscribe();
            try { response.end('event: session-ended\ndata: {"reason":"session_closed"}\n\n'); } catch {}
            continue;
          }
        }
        try { response.write(body); } catch { clients.delete(response); }
      }
      if (!clients.size) this.clients.delete(sessionId);
    }
  }

  closeSession(sessionId, reason = "session_replaced") {
    const clients = this.clients.get(sessionId);
    if (!clients) return;
    const body = `event: session-ended\ndata: ${JSON.stringify({ reason })}\n\n`;
    for (const response of clients) {
      try { response.end(body); } catch {}
    }
    this.clients.delete(sessionId);
  }

  close() {
    for (const clients of this.clients.values()) {
      for (const response of clients) {
        try { response.end(); } catch {}
      }
    }
    this.clients.clear();
  }
}

module.exports = { RealtimeHub };
