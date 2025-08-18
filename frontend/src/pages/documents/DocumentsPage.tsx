import React from 'react';
import { DocumentList } from '../../components/shared';
import type { Document } from '../../services/api/types';

export const DocumentsPage: React.FC = () => {
  const handleDocumentSelect = (document: Document) => {
    // Could navigate to document detail page or show modal
    console.log('Selected document:', document);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
        <p className="text-muted-foreground">
          Manage and browse your document library
        </p>
      </div>

      <DocumentList
        onDocumentSelect={handleDocumentSelect}
        selectable={false}
        compact={false}
      />
    </div>
  );
};

export default DocumentsPage;