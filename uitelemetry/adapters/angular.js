import { initTelemetry, getTelemetry } from '../src/core.js';

export function initAngularTelemetry(config = {}) {
  return initTelemetry({
    serviceName: config.serviceName || 'angular-app',
    ...config
  });
}

export function getAngularTelemetry() {
  return getTelemetry();
}
