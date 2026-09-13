export const DEFAULT_SESSION_KEY = 'svedah_ui_session_id';

export function createHexId(length) {
  let result = '';
  while (result.length < length) {
    result += Math.random().toString(16).slice(2);
  }
  return result.slice(0, length);
}

export function getSessionId(sessionKey = DEFAULT_SESSION_KEY) {
  try {
    const existing = window.sessionStorage.getItem(sessionKey);
    if (existing) return existing;
    const id = `ses_${createHexId(24)}`;
    window.sessionStorage.setItem(sessionKey, id);
    return id;
  } catch {
    return `ses_${createHexId(24)}`;
  }
}

export function createTraceId() {
  return createHexId(32);
}

export function createSpanId() {
  return createHexId(16);
}
