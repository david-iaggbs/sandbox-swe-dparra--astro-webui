// instrumentation.mjs — loaded via node --import before the app starts.
// Sets up OpenTelemetry SDK with auto-instrumentation.
// If OTEL_EXPORTER_OTLP_ENDPOINT is not set, the SDK is a no-op.
//
// Aligns with the spring-cloud-service pattern:
// - Traces exported via OTLP to Jaeger (local) or ADOT (AWS, when available)
// - Metrics and logs export disabled (logs go to stdout → CloudWatch via ECS)

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-proto');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions');

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  const serviceName =
    process.env.OTEL_SERVICE_NAME || process.env.SERVICE_NAME || 'astro-webui';

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '0.0.1',
    }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-pino': { enabled: true },
      }),
    ],
  });

  sdk.start();

  const shutdown = async () => {
    await sdk.shutdown();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  console.log(`OTel SDK initialized — exporting traces to ${endpoint}`);
} else {
  console.log('OTel SDK disabled — OTEL_EXPORTER_OTLP_ENDPOINT not set');
}
