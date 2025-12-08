import React, { useEffect, useState } from 'react';
import {
  useAppDispatch,
  useConfig,
  useConnectionStatus,
} from '../../hooks/redux';
import {
  fetchConfiguration,
  updateConfiguration,
  testConnection,
  resetConfiguration,
  updateFormData,
  resetFormData,
  clearError,
  clearConnectionTest,
} from '../../store/slices/configSlice';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Checkbox } from '../ui/Checkbox';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '../ui/Card';
import {
  CheckCircle,
  XCircle,
  Loader2,
  Settings,
  TestTube,
  Info,
  AlertCircle,
} from 'lucide-react';
import type { Configuration } from '../../services/api/types';
import { Badge } from '../ui/Badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/Tooltip';

interface ConfigPanelProps {
  className?: string;
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({ className }) => {
  const dispatch = useAppDispatch();
  const { formData, hasUnsavedChanges, loading, error, validationErrors } =
    useConfig();
  const { testResult, lastTested } = useConnectionStatus();

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [confidenceWeights, setConfidenceWeights] = useState({
    jaccard: 90,
    fuzzy: 10,
    metadata: 0,
  });
  const [weightsChanged, setWeightsChanged] = useState(false);
  const [reanalysisMessage, setReanalysisMessage] = useState<string | null>(
    null
  );
  const aiModelOptions = [
    { value: 'gpt-5.1', label: 'gpt-5.1 (best quality)' },
    { value: 'gpt-5-mini', label: 'gpt-5-mini (balanced)' },
    { value: 'gpt-5-nano', label: 'gpt-5-nano (cheapest)' },
  ];

  // Load configuration on mount
  useEffect(() => {
    dispatch(fetchConfiguration());
  }, [dispatch]);

  // Update confidence weights when config loads
  useEffect(() => {
    if (formData.confidence_weight_jaccard !== undefined) {
      const newWeights = {
        jaccard: formData.confidence_weight_jaccard ?? 90,
        fuzzy: formData.confidence_weight_fuzzy ?? 10,
        metadata: formData.confidence_weight_metadata ?? 0,
      };
      setConfidenceWeights(newWeights);
      setWeightsChanged(false); // Reset when loading from server
    }
  }, [formData]);

  // Handle form field changes
  const handleFieldChange = (
    field: keyof Configuration,
    value: string | number | boolean
  ) => {
    dispatch(updateFormData({ [field]: value }));
  };

  // Handle form submission
  const handleSave = async () => {
    if (!hasUnsavedChanges && !weightsChanged) return;

    try {
      // Check if only weights changed (not other config)
      const onlyWeightsChanged = !hasUnsavedChanges && weightsChanged;

      // Include confidence weights in the update
      const configWithWeights = {
        ...formData,
        confidence_weight_jaccard: confidenceWeights.jaccard,
        confidence_weight_fuzzy: confidenceWeights.fuzzy,
        confidence_weight_metadata: confidenceWeights.metadata,
      };

      const result = await dispatch(
        updateConfiguration(configWithWeights)
      ).unwrap();
      setWeightsChanged(false); // Reset after successful save

      // If weights were changed and re-analysis was triggered, show a message
      if (result && (result as any).reanalysis_triggered) {
        setReanalysisMessage(
          'Configuration saved. Re-analysis has been triggered due to weight changes.'
        );
        // Clear message after 10 seconds
        setTimeout(() => setReanalysisMessage(null), 10000);
      }
    } catch (error) {
      console.error('Failed to save configuration:', error);
    }
  };

  // Handle connection test
  const handleTestConnection = async () => {
    const testConfig = {
      paperless_url: formData.paperless_url || '',
      paperless_api_token: formData.paperless_api_token,
      paperless_username: formData.paperless_username,
      paperless_password: formData.paperless_password,
    };

    try {
      await dispatch(testConnection(testConfig)).unwrap();
    } catch (error) {
      console.error('Connection test failed:', error);
    }
  };

  // Handle reset
  const handleReset = () => {
    dispatch(resetFormData());
    dispatch(clearError());
    dispatch(clearConnectionTest());
  };

  // Handle reset to defaults
  const handleResetToDefaults = async () => {
    try {
      await dispatch(resetConfiguration()).unwrap();
    } catch (error) {
      console.error('Failed to reset configuration:', error);
    }
  };

  // Connection status indicator
  const ConnectionStatus = () => {
    if (loading.testConnection) {
      return (
        <div className="flex items-center space-x-2 text-blue-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Testing connection...</span>
        </div>
      );
    }

    if (testResult) {
      if (testResult.success) {
        return (
          <div className="flex items-center space-x-2 text-green-600">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm">Connection successful</span>
            {testResult.version && (
              <span className="text-xs text-muted-foreground">
                (v{testResult.version})
              </span>
            )}
          </div>
        );
      } else {
        return (
          <div className="flex items-center space-x-2 text-red-600">
            <XCircle className="h-4 w-4" />
            <span className="text-sm">Connection failed</span>
          </div>
        );
      }
    }

    return null;
  };

  if (loading.fetch) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center p-6">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="ml-2">Loading configuration...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5" />
            <span>Configuration</span>
          </CardTitle>
          <CardDescription>
            Configure your paperless-ngx connection and deduplication settings
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Error Display */}
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 p-4">
              <div className="flex">
                <XCircle className="h-5 w-5 text-red-400" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">
                    Configuration Error
                  </h3>
                  <div className="mt-2 text-sm text-red-700">{error}</div>
                </div>
              </div>
            </div>
          )}

          {/* Re-analysis notification */}
          {reanalysisMessage && (
            <div className="rounded-md bg-green-50 border border-green-200 p-4">
              <div className="flex">
                <CheckCircle className="h-5 w-5 text-green-400" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-800">
                    Success
                  </h3>
                  <div className="mt-2 text-sm text-green-700">
                    {reanalysisMessage}
                  </div>
                  <div className="mt-3">
                    <a
                      href="/processing"
                      className="text-sm font-medium text-green-800 hover:text-green-900 underline"
                    >
                      View processing status →
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Connection Settings */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Paperless Connection</h3>

            <div className="space-y-2">
              <Label htmlFor="paperless_url">Paperless URL *</Label>
              <Input
                id="paperless_url"
                type="url"
                value={formData.paperless_url || ''}
                onChange={(e) =>
                  handleFieldChange('paperless_url', e.target.value)
                }
                placeholder="http://localhost:8000"
                className={
                  validationErrors.paperless_url ? 'border-red-500' : ''
                }
              />
              {validationErrors.paperless_url && (
                <p className="text-sm text-red-600">
                  {validationErrors.paperless_url.join(', ')}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="paperless_api_token">API Token</Label>
              <Input
                id="paperless_api_token"
                type="password"
                value={formData.paperless_api_token || ''}
                onChange={(e) =>
                  handleFieldChange('paperless_api_token', e.target.value)
                }
                placeholder="Your paperless API token"
                className={
                  validationErrors.paperless_api_token ? 'border-red-500' : ''
                }
              />
              <p className="text-xs text-muted-foreground">
                Recommended: Use API token for authentication
              </p>
              {validationErrors.paperless_api_token && (
                <p className="text-sm text-red-600">
                  {validationErrors.paperless_api_token.join(', ')}
                </p>
              )}
            </div>

            {/* Alternative: Username/Password */}
            <div className="pt-2 border-t">
              <p className="text-sm text-muted-foreground mb-3">
                Alternative: Use username and password if API token is not
                available
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="paperless_username">Username</Label>
                  <Input
                    id="paperless_username"
                    value={formData.paperless_username || ''}
                    onChange={(e) =>
                      handleFieldChange('paperless_username', e.target.value)
                    }
                    placeholder="Username"
                    className={
                      validationErrors.paperless_username
                        ? 'border-red-500'
                        : ''
                    }
                  />
                  {validationErrors.paperless_username && (
                    <p className="text-sm text-red-600">
                      {validationErrors.paperless_username.join(', ')}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="paperless_password">Password</Label>
                  <Input
                    id="paperless_password"
                    type="password"
                    value={formData.paperless_password || ''}
                    onChange={(e) =>
                      handleFieldChange('paperless_password', e.target.value)
                    }
                    placeholder="Password"
                    className={
                      validationErrors.paperless_password
                        ? 'border-red-500'
                        : ''
                    }
                  />
                  {validationErrors.paperless_password && (
                    <p className="text-sm text-red-600">
                      {validationErrors.paperless_password.join(', ')}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Connection Test */}
            <div className="flex items-center justify-between p-4 bg-muted rounded-md">
              <div className="space-y-1">
                <ConnectionStatus />
                {lastTested && (
                  <p className="text-xs text-muted-foreground">
                    Last tested: {new Date(lastTested).toLocaleString()}
                  </p>
                )}
                {testResult && !testResult.success && (
                  <p className="text-xs text-red-600">{testResult.message}</p>
                )}
              </div>
              <Button
                onClick={handleTestConnection}
                disabled={loading.testConnection || !formData.paperless_url}
                variant="outline"
                size="sm"
              >
                <TestTube className="h-4 w-4 mr-2" />
                Test Connection
              </Button>
            </div>
          </div>

          {/* AI Processing */}
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium">AI Processing</h3>
                <p className="text-sm text-muted-foreground">
                  Configure OpenAI to generate titles, correspondents, document
                  types, tags, and dates.
                </p>
              </div>
              {formData.openai_configured ? (
                <Badge variant="secondary">API key saved</Badge>
              ) : (
                <Badge variant="outline">API key missing</Badge>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="openai_api_key">OpenAI API Key</Label>
              <Input
                id="openai_api_key"
                type="password"
                value={formData.openai_api_key || ''}
                onChange={(e) =>
                  handleFieldChange('openai_api_key', e.target.value)
                }
                placeholder="sk-..."
              />
              <p className="text-xs text-muted-foreground">
                Required for AI metadata extraction. Stored in the application
                database; not sent anywhere else.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="openai_model">Model</Label>
                <select
                  id="openai_model"
                  value={formData.openai_model || 'gpt-5-mini'}
                  onChange={(e) =>
                    handleFieldChange('openai_model', e.target.value)
                  }
                  className="border rounded-md px-3 py-2 text-sm w-full bg-background"
                >
                  {aiModelOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Only gpt-5.1, gpt-5-mini, or gpt-5-nano are allowed to balance
                  accuracy and cost.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="openai_reasoning_effort">
                  Reasoning effort
                </Label>
                <select
                  id="openai_reasoning_effort"
                  value={formData.openai_reasoning_effort || 'medium'}
                  onChange={(e) =>
                    handleFieldChange('openai_reasoning_effort', e.target.value)
                  }
                  className="border rounded-md px-3 py-2 text-sm w-full bg-background"
                >
                  <option value="low">Low (fastest)</option>
                  <option value="medium">Medium (default)</option>
                  <option value="high">High (best quality)</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Higher effort improves extraction quality at the cost of
                  latency and tokens.
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ai_max_input_chars">
                  Max characters sent to OpenAI
                </Label>
                <Input
                  id="ai_max_input_chars"
                  type="number"
                  min={1000}
                  max={100000}
                  step={500}
                  value={formData.ai_max_input_chars ?? 12000}
                  onChange={(e) =>
                    handleFieldChange(
                      'ai_max_input_chars',
                      Math.max(1000, parseInt(e.target.value) || 0)
                    )
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Caps OCR characters per document to keep token usage and costs
                  predictable.
                </p>
              </div>
            </div>
          </div>

          {/* Advanced Settings */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Deduplication Settings</h3>
              <Button
                onClick={() => setShowAdvanced(!showAdvanced)}
                variant="ghost"
                size="sm"
              >
                {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
              </Button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="fuzzy_match_threshold">
                    Overall Match Threshold (
                    {formData.fuzzy_match_threshold || 85}
                    %)
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-primary"
                        aria-label="How the match threshold works"
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm text-left">
                      <p className="font-semibold mb-1">Weighted confidence</p>
                      <p className="mb-1">
                        This threshold uses the combined confidence score from
                        the weights below: Jaccard (MinHash), Fuzzy Text Match,
                        and optional Metadata. Groups are saved when the
                        weighted score meets this threshold.
                      </p>
                      <p>
                        Fuzzy text similarity under 50% is ignored unless the
                        overall weighted score still clears the threshold.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center space-x-4">
                  <Input
                    id="fuzzy_match_threshold"
                    type="range"
                    min="50"
                    max="100"
                    value={Math.max(50, formData.fuzzy_match_threshold || 85)}
                    onChange={(e) =>
                      handleFieldChange(
                        'fuzzy_match_threshold',
                        Math.max(50, parseInt(e.target.value))
                      )
                    }
                    className="flex-1"
                  />
                  <span className="text-sm font-medium w-12 text-right">
                    {formData.fuzzy_match_threshold || 85}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Minimum threshold for storing duplicate groups using the
                  weighted confidence score. Higher values reduce false
                  positives but can miss edge cases; lower values surface more
                  candidates to review.
                </p>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                <div className="flex items-start space-x-2">
                  <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-900">
                      Enhanced Document Storage
                    </p>
                    <p className="text-blue-800 mt-1">
                      Documents store up to your configured OCR text limit
                      (default 500,000 characters) for improved accuracy.
                      Confidence scores can be dynamically adjusted without
                      rescanning documents.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="max_ocr_length">Max OCR Text Stored</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-primary"
                        aria-label="Maximum OCR text length help"
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm text-left">
                      <p className="font-semibold mb-1">Storage vs. accuracy</p>
                      <p className="mb-1">
                        Caps how many OCR characters are stored per document.
                        Higher limits capture more context and improve matching
                        on long documents but use more storage and sync
                        bandwidth.
                      </p>
                      <p className="mb-0">
                        Default: 500,000. Reduce for very large archives or slow
                        storage; increase if long documents are being truncated.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="max_ocr_length"
                  type="number"
                  min={1000}
                  step={1000}
                  value={formData.max_ocr_length || 500000}
                  onChange={(e) =>
                    handleFieldChange(
                      'max_ocr_length',
                      Math.max(1000, parseInt(e.target.value) || 0)
                    )
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Maximum OCR characters stored per document. Higher values
                  boost duplicate detection on long documents; lower values save
                  disk and network usage.
                </p>
              </div>
            </div>

            {showAdvanced && (
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="lsh_threshold">LSH Threshold</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-primary"
                          aria-label="Locality-sensitive hashing help"
                        >
                          <Info className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm text-left">
                        <p className="font-semibold mb-1">
                          Candidate search gate
                        </p>
                        <p className="mb-1">
                          LSH uses MinHash fingerprints to decide which
                          documents are similar enough to compare in detail.
                          Lower values find more candidates (higher recall, more
                          work); higher values compare fewer pairs (faster, but
                          can miss near matches).
                        </p>
                        <p>Recommended range: 0.45-0.6 for OCR-heavy data.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    id="lsh_threshold"
                    type="number"
                    step="0.01"
                    min="0.1"
                    max="1.0"
                    value={formData.lsh_threshold || 0.7}
                    onChange={(e) =>
                      handleFieldChange(
                        'lsh_threshold',
                        parseFloat(e.target.value)
                      )
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Locality-sensitive hashing threshold (0.1-1.0)
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="minhash_num_perm">
                      MinHash Permutations
                    </Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-primary"
                          aria-label="MinHash permutations help"
                        >
                          <Info className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm text-left">
                        <p className="font-semibold mb-1">Fingerprint detail</p>
                        <p className="mb-1">
                          More permutations make the Jaccard estimate and LSH
                          buckets more stable, improving accuracy on noisy OCR.
                          Higher values use more memory and CPU during indexing.
                        </p>
                        <p className="mb-0">
                          Default 192 favors accuracy; increase to 256 only if
                          you still miss obvious duplicates.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    id="minhash_num_perm"
                    type="number"
                    min="64"
                    max="256"
                    step="64"
                    value={formData.minhash_num_perm || 192}
                    onChange={(e) =>
                      handleFieldChange(
                        'minhash_num_perm',
                        parseInt(e.target.value)
                      )
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Number of hash functions (higher = more accurate, slower)
                  </p>
                </div>
              </div>
            )}

            {/* Confidence Weights Configuration */}
            <div className="pt-4 border-t">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium">
                  Confidence Score Weights
                </h4>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-primary"
                      aria-label="How weights affect scoring"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm text-left">
                    <p className="font-semibold mb-1">How the score is built</p>
                    <p className="mb-1">
                      The overall confidence is a weighted blend of these
                      signals. All weights must total 100. The threshold above
                      checks this combined score, not just a single metric.
                    </p>
                    <p className="mb-0">
                      Adjust weights to favor stable text overlap (Jaccard),
                      noisy OCR (Fuzzy), or metadata when text is missing.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="space-y-4">
                {/* Jaccard Weight */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Label htmlFor="weight_jaccard">
                        Jaccard Similarity ({confidenceWeights.jaccard}%)
                      </Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-primary"
                            aria-label="Jaccard similarity help"
                          >
                            <Info className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm text-left">
                          <p className="font-semibold mb-1">MinHash overlap</p>
                          <p className="mb-1">
                            Compares MinHash fingerprints of OCR text to measure
                            true content overlap. Great for rescans or reordered
                            pages with the same text.
                          </p>
                          <p className="mb-0">
                            Used in the first-pass LSH search and in the
                            weighted confidence score.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      MinHash content fingerprinting
                    </span>
                  </div>
                  <Input
                    id="weight_jaccard"
                    type="range"
                    min="0"
                    max="100"
                    value={confidenceWeights.jaccard}
                    onChange={(e) => {
                      const newValue = parseInt(e.target.value);
                      const diff = newValue - confidenceWeights.jaccard;
                      // Auto-adjust other weights proportionally
                      const remaining = 100 - newValue;
                      const currentOthers =
                        confidenceWeights.fuzzy + confidenceWeights.metadata;
                      if (currentOthers > 0 && remaining >= 0) {
                        const scale = remaining / currentOthers;
                        const nextFuzzy = Math.round(
                          confidenceWeights.fuzzy * scale
                        );
                        const nextMetadata = remaining - nextFuzzy; // ensure sum = 100
                        setConfidenceWeights({
                          jaccard: newValue,
                          fuzzy: nextFuzzy,
                          metadata: nextMetadata,
                        });
                        setWeightsChanged(true);
                      }
                    }}
                    className="w-full"
                  />
                </div>

                {/* Fuzzy Weight */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Label htmlFor="weight_fuzzy">
                        Fuzzy Text Match ({confidenceWeights.fuzzy}%)
                      </Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-primary"
                            aria-label="Fuzzy text match help"
                          >
                            <Info className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm text-left">
                          <p className="font-semibold mb-1">
                            OCR-friendly match
                          </p>
                          <p className="mb-1">
                            Uses a token sort ratio on the first 5,000
                            characters of OCR to handle typos, spacing, and
                            ordering differences. Slower than Jaccard but
                            resilient to noisy scans.
                          </p>
                          <p className="mb-0">
                            Increase this weight for low-quality scans; decrease
                            when text is clean and consistent.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Handles OCR errors and variations
                    </span>
                  </div>
                  <Input
                    id="weight_fuzzy"
                    type="range"
                    min="0"
                    max="100"
                    value={confidenceWeights.fuzzy}
                    onChange={(e) => {
                      const newValue = parseInt(e.target.value);
                      const remaining =
                        100 - newValue - confidenceWeights.jaccard;
                      if (remaining >= 0) {
                        const currentOthers = confidenceWeights.metadata;
                        if (currentOthers > 0) {
                          const scale = remaining / currentOthers;
                          setConfidenceWeights({
                            ...confidenceWeights,
                            fuzzy: newValue,
                            metadata: Math.round(
                              confidenceWeights.metadata * scale
                            ),
                          });
                          setWeightsChanged(true);
                        } else {
                          setConfidenceWeights({
                            ...confidenceWeights,
                            fuzzy: newValue,
                            metadata: remaining,
                          });
                          setWeightsChanged(true);
                        }
                      }
                    }}
                    className="w-full"
                  />
                </div>

                {/* Metadata Weight */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Label htmlFor="weight_metadata">
                        Metadata Match ({confidenceWeights.metadata}%)
                      </Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-primary"
                            aria-label="Metadata match help"
                          >
                            <Info className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm text-left">
                          <p className="font-semibold mb-1">
                            Contextual signal
                          </p>
                          <p className="mb-1">
                            Compares file size, dates, document types, and
                            correspondents. Helpful when OCR text is missing or
                            short, but high weights can create false positives
                            if many files share similar metadata.
                          </p>
                          <p className="mb-0">
                            Use sparingly; set to 0 to disable this factor.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      File size, dates, types, correspondents
                    </span>
                  </div>
                  <Input
                    id="weight_metadata"
                    type="range"
                    min="0"
                    max="100"
                    value={confidenceWeights.metadata}
                    onChange={(e) => {
                      const newValue = parseInt(e.target.value);
                      const remaining =
                        100 -
                        newValue -
                        confidenceWeights.jaccard -
                        confidenceWeights.fuzzy;
                      if (remaining >= 0) {
                        setConfidenceWeights({
                          ...confidenceWeights,
                          metadata: newValue,
                        });
                        setWeightsChanged(true);
                      }
                    }}
                    className="w-full"
                  />
                </div>

                {/* Total Weight Display */}
                <div className="p-3 bg-muted rounded-md">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Total Weight:</span>
                    <span
                      className={`text-sm font-bold ${
                        confidenceWeights.jaccard +
                          confidenceWeights.fuzzy +
                          confidenceWeights.metadata ===
                        100
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}
                    >
                      {confidenceWeights.jaccard +
                        confidenceWeights.fuzzy +
                        confidenceWeights.metadata}
                      %
                    </span>
                  </div>
                  {confidenceWeights.jaccard +
                    confidenceWeights.fuzzy +
                    confidenceWeights.metadata !==
                    100 && (
                    <p className="text-xs text-red-600 mt-1">
                      Weights must sum to exactly 100%. Adjust the sliders to
                      balance.
                    </p>
                  )}
                </div>

                {/* Warning about re-analysis */}
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <div className="flex items-start space-x-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-amber-900">
                        Re-analysis Required
                      </p>
                      <p className="text-amber-800 mt-1">
                        Changing confidence weights will require re-analyzing
                        documents to recalculate duplicate groups with the new
                        weightings. This process will start automatically after
                        saving.
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Tip: Set a weight to 0 to completely disable that factor. For
                  poor quality scans, increase fuzzy text weight. For consistent
                  document types, increase metadata weight.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-6 border-t">
            <div className="space-x-2">
              <Button
                onClick={() => {
                  handleReset();
                  setWeightsChanged(false);
                }}
                variant="outline"
                disabled={!hasUnsavedChanges && !weightsChanged}
              >
                Reset
              </Button>
              <Button
                onClick={handleResetToDefaults}
                variant="outline"
                disabled={loading.reset}
              >
                {loading.reset ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  'Reset to Defaults'
                )}
              </Button>
            </div>

            <Button
              onClick={handleSave}
              disabled={
                (!hasUnsavedChanges && !weightsChanged) || loading.update
              }
            >
              {loading.update ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Configuration'
              )}
            </Button>
          </div>

          {(hasUnsavedChanges || weightsChanged) && (
            <p className="text-sm text-muted-foreground">
              * You have unsaved changes
            </p>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};

export default ConfigPanel;
