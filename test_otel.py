#!/usr/bin/env python
"""Test OpenTelemetry configuration and connectivity."""

import os
import time
import logging
from opentelemetry import trace, metrics
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.sdk.resources import Resource

# Enable debug logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Print environment variables
print("=" * 60)
print("OTEL Environment Variables:")
for key, value in os.environ.items():
    if key.startswith("OTEL_"):
        if "HEADER" in key or "AUTH" in key:
            print(f"{key}={value[:30]}...")
        else:
            print(f"{key}={value}")
print("=" * 60)

# Create resource from environment
resource = Resource.create({
    "service.name": "test-otel",
    "service.version": "1.0.0",
})

print(f"\nResource: {resource.attributes}")

# Test trace exporter
try:
    print("\nTesting Trace Exporter...")
    trace_exporter = OTLPSpanExporter()
    print(f"Trace endpoint: {trace_exporter._endpoint}")
    
    # Set up tracing
    trace_provider = TracerProvider(resource=resource)
    trace_processor = BatchSpanProcessor(trace_exporter)
    trace_provider.add_span_processor(trace_processor)
    trace.set_tracer_provider(trace_provider)
    
    # Create a test span
    tracer = trace.get_tracer(__name__)
    with tracer.start_as_current_span("test-span") as span:
        span.set_attribute("test.attribute", "test-value")
        print("Created test span")
        time.sleep(0.1)
    
    # Force flush
    trace_provider.force_flush()
    print("✅ Trace exporter configured and test span sent")
    
except Exception as e:
    print(f"❌ Trace exporter error: {e}")
    import traceback
    traceback.print_exc()

# Test metric exporter
try:
    print("\nTesting Metric Exporter...")
    metric_exporter = OTLPMetricExporter()
    print(f"Metric endpoint: {metric_exporter._endpoint}")
    
    # Set up metrics
    reader = PeriodicExportingMetricReader(
        exporter=metric_exporter,
        export_interval_millis=1000,
    )
    meter_provider = MeterProvider(resource=resource, metric_readers=[reader])
    metrics.set_meter_provider(meter_provider)
    
    # Create a test metric
    meter = metrics.get_meter(__name__)
    counter = meter.create_counter(
        "test_counter",
        unit="1",
        description="Test counter",
    )
    counter.add(1, {"test.label": "test-value"})
    print("Created test metric")
    
    # Force flush
    meter_provider.force_flush()
    print("✅ Metric exporter configured and test metric sent")
    
except Exception as e:
    print(f"❌ Metric exporter error: {e}")
    import traceback
    traceback.print_exc()

print("\nWaiting 5 seconds for exports to complete...")
time.sleep(5)

print("\nTest complete!")