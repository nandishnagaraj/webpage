export const DEFAULT_SESSION_KEY = 'svedah_ui_session_state';
export const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export function createHexId(length) {
  let result = '';
  while (result.length < length) {
    result += Math.random().toString(16).slice(2);
  }
  return result.slice(0, length);
}

export function createSessionState(sessionKey = DEFAULT_SESSION_KEY, idleTimeoutMs = DEFAULT_SESSION_IDLE_TIMEOUT_MS) {
  const now = Date.now();

  try {
    const raw = window.sessionStorage.getItem(sessionKey);
    if (raw) {
      const existing = JSON.parse(raw);
      const lastSeenAt = Number(existing.lastSeenAt || existing.startedAt || 0);
      const expired = lastSeenAt > 0 && now - lastSeenAt > idleTimeoutMs;

      if (!expired && existing.sessionId && existing.startedAt) {
        const state = {
          sessionId: existing.sessionId,
          startedAt: Number(existing.startedAt),
          lastSeenAt: now
        };
        window.sessionStorage.setItem(sessionKey, JSON.stringify(state));
        return state;
      }
    }

    const state = {
      sessionId: `ses_${createHexId(24)}`,
      startedAt: now,
      lastSeenAt: now
    };
    window.sessionStorage.setItem(sessionKey, JSON.stringify(state));
    return state;
  } catch {
    return {
      sessionId: `ses_${createHexId(24)}`,
      startedAt: now,
      lastSeenAt: now
    };
  }
}

export function touchSession(sessionKey = DEFAULT_SESSION_KEY, state) {
  if (!state) return;

  try {
    const updated = {
      sessionId: state.sessionId,
      startedAt: state.startedAt,
      lastSeenAt: Date.now()
    };
    window.sessionStorage.setItem(sessionKey, JSON.stringify(updated));
  } catch {
    // Ignore storage failures. Telemetry should never break the host page.
  }
}

export function createTraceId() {
  return createHexId(32);
}

export function createSpanId() {
  return createHexId(16);
}
