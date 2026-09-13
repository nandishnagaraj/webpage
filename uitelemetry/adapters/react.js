import { initTelemetry, getTelemetry } from '../src/core.js';

export function initReactTelemetry(config = {}) {
  return initTelemetry({
    serviceName: config.serviceName || 'react-app',
    ...config
  });
}

export function useSvedahTelemetry() {
  return getTelemetry();
}
