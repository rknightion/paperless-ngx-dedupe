import React from "react";
import { ConfigPanel } from "../../components/forms";

export const SettingsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Configure your paperless-ngx connection and deduplication preferences
        </p>
      </div>

      <ConfigPanel />
    </div>
  );
};

export default SettingsPage;
