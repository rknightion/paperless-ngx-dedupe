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
} from 'lucide-react';
import type { Configuration } from '../../services/api/types';

interface ConfigPanelProps {
  className?: string;
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({ className }) => {
  const dispatch = useAppDispatch();
  const { formData, hasUnsavedChanges, loading, error, validationErrors } =
    useConfig();
  const { testResult, lastTested } = useConnectionStatus();

  const [showAdvanced, setShowAdvanced] = useState(false);

  // Load configuration on mount
  useEffect(() => {
    dispatch(fetchConfiguration());
  }, [dispatch]);

  // Handle form field changes
  const handleFieldChange = (
    field: keyof Configuration,
    value: string | number
  ) => {
    dispatch(updateFormData({ [field]: value }));
  };

  // Handle form submission
  const handleSave = async () => {
    if (!hasUnsavedChanges) return;

    try {
      await dispatch(updateConfiguration(formData)).unwrap();
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
              className={validationErrors.paperless_url ? 'border-red-500' : ''}
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
                    validationErrors.paperless_username ? 'border-red-500' : ''
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
                    validationErrors.paperless_password ? 'border-red-500' : ''
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fuzzy_match_threshold">
                Fuzzy Match Threshold ({formData.fuzzy_match_threshold || 80}%)
              </Label>
              <Input
                id="fuzzy_match_threshold"
                type="range"
                min="50"
                max="100"
                value={formData.fuzzy_match_threshold || 80}
                onChange={(e) =>
                  handleFieldChange(
                    'fuzzy_match_threshold',
                    parseInt(e.target.value)
                  )
                }
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Higher values = fewer false positives, might miss some
                duplicates
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max_ocr_length">Max OCR Length</Label>
              <Input
                id="max_ocr_length"
                type="number"
                value={formData.max_ocr_length || 10000}
                onChange={(e) =>
                  handleFieldChange('max_ocr_length', parseInt(e.target.value))
                }
                min="1000"
                max="50000"
                step="1000"
              />
              <p className="text-xs text-muted-foreground">
                Maximum characters to analyze per document
              </p>
            </div>
          </div>

          {showAdvanced && (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="space-y-2">
                <Label htmlFor="lsh_threshold">LSH Threshold</Label>
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
                <Label htmlFor="minhash_num_perm">MinHash Permutations</Label>
                <Input
                  id="minhash_num_perm"
                  type="number"
                  min="64"
                  max="256"
                  step="64"
                  value={formData.minhash_num_perm || 128}
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
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-6 border-t">
          <div className="space-x-2">
            <Button
              onClick={handleReset}
              variant="outline"
              disabled={!hasUnsavedChanges}
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
            disabled={!hasUnsavedChanges || loading.update}
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

        {hasUnsavedChanges && (
          <p className="text-sm text-muted-foreground">
            * You have unsaved changes
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default ConfigPanel;
