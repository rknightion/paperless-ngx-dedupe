import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './store/store';
import { Layout } from './components/layout';
import { DashboardPage } from './pages/dashboard';
import { DocumentsPage } from './pages/documents';
import { DuplicatesPage } from './pages/duplicates';
import { ProcessingPage } from './pages/processing';
import { SettingsPage } from './pages/settings';

function App() {
  return (
    <Provider store={store}>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/duplicates" element={<DuplicatesPage />} />
            <Route path="/processing" element={<ProcessingPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Layout>
      </Router>
    </Provider>
  );
}

export default App;
