import { initTelemetry } from '../src/core.js';

export function createSvedahTelemetryPlugin(config = {}) {
  return {
    install(app) {
      const telemetry = initTelemetry({
        serviceName: config.serviceName || 'vue-app',
        ...config
      });
      app.config.globalProperties.$svedahTelemetry = telemetry;
      app.provide('svedahTelemetry', telemetry);
    }
  };
}
