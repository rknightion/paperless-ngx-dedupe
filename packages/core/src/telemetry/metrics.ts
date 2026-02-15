import { metrics, type Counter, type Histogram } from '@opentelemetry/api';

const METER_NAME = 'paperless-ngx-dedupe';

function getMeter() {
  return metrics.getMeter(METER_NAME);
}

// --- Counters (lazy singletons) ---

let _syncDocumentsTotal: Counter | undefined;
export function syncDocumentsTotal(): Counter {
  return (_syncDocumentsTotal ??= getMeter().createCounter('paperless_ngx_dedupe.sync.documents_total', {
    description: 'Total documents processed during sync operations',
  }));
}

let _syncRunsTotal: Counter | undefined;
export function syncRunsTotal(): Counter {
  return (_syncRunsTotal ??= getMeter().createCounter('paperless_ngx_dedupe.sync.runs_total', {
    description: 'Total sync runs',
  }));
}

let _analysisRunsTotal: Counter | undefined;
export function analysisRunsTotal(): Counter {
  return (_analysisRunsTotal ??= getMeter().createCounter('paperless_ngx_dedupe.analysis.runs_total', {
    description: 'Total analysis runs',
  }));
}

let _jobsTotal: Counter | undefined;
export function jobsTotal(): Counter {
  return (_jobsTotal ??= getMeter().createCounter('paperless_ngx_dedupe.jobs_total', {
    description: 'Total jobs by type and outcome',
  }));
}

let _paperlessRequestsTotal: Counter | undefined;
export function paperlessRequestsTotal(): Counter {
  return (_paperlessRequestsTotal ??= getMeter().createCounter('paperless_ngx_dedupe.paperless.requests_total', {
    description: 'Total HTTP requests to Paperless-NGX API',
  }));
}

// --- Histograms ---

let _syncDuration: Histogram | undefined;
export function syncDuration(): Histogram {
  return (_syncDuration ??= getMeter().createHistogram('paperless_ngx_dedupe.sync.duration_seconds', {
    description: 'Duration of sync operations in seconds',
    unit: 's',
  }));
}

let _analysisDuration: Histogram | undefined;
export function analysisDuration(): Histogram {
  return (_analysisDuration ??= getMeter().createHistogram('paperless_ngx_dedupe.analysis.duration_seconds', {
    description: 'Duration of analysis operations in seconds',
    unit: 's',
  }));
}

let _analysisStageDuration: Histogram | undefined;
export function analysisStageDuration(): Histogram {
  return (_analysisStageDuration ??= getMeter().createHistogram(
    'paperless_ngx_dedupe.analysis.stage.duration_seconds',
    {
      description: 'Duration of individual analysis pipeline stages in seconds',
      unit: 's',
    },
  ));
}

// --- Observable Gauges ---

/**
 * Register observable gauges that read from a callback.
 * Call this once during initialization with a function that returns current stats.
 */
export function registerObservableGauges(
  getStats: () => {
    documentsCount: number;
    unresolvedDuplicatesCount: number;
    activeJobsCount: number;
  },
): void {
  const meter = getMeter();

  meter
    .createObservableGauge('paperless_ngx_dedupe.documents_count', {
      description: 'Total number of synced documents',
    })
    .addCallback((result) => {
      result.observe(getStats().documentsCount);
    });

  meter
    .createObservableGauge('paperless_ngx_dedupe.duplicates.unresolved_count', {
      description: 'Number of unresolved duplicate groups',
    })
    .addCallback((result) => {
      result.observe(getStats().unresolvedDuplicatesCount);
    });

  meter
    .createObservableGauge('paperless_ngx_dedupe.jobs.active_count', {
      description: 'Number of currently running jobs',
    })
    .addCallback((result) => {
      result.observe(getStats().activeJobsCount);
    });
}
