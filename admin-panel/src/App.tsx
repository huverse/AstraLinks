import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getAuthToken } from './services/api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import InvitationCodes from './pages/InvitationCodes';
import Reports from './pages/Reports';
import Bans from './pages/Bans';
import Logs from './pages/Logs';
import Analytics from './pages/Analytics';
import FeedbackManagement from './pages/FeedbackManagement';
import Announcements from './pages/Announcements';
import Settings from './pages/Settings';
import ConfigTemplates from './pages/ConfigTemplates';
import Layout from './components/Layout';
import './index.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!getAuthToken());

  useEffect(() => {
    const token = getAuthToken();
    setIsAuthenticated(!!token);
  }, []);

  if (!isAuthenticated) {
    return <Login onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <BrowserRouter>
      <Layout onLogout={() => setIsAuthenticated(false)}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/users" element={<Users />} />
          <Route path="/invitations" element={<InvitationCodes />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/bans" element={<Bans />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/feedback" element={<FeedbackManagement />} />
          <Route path="/announcements" element={<Announcements />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/config-templates" element={<ConfigTemplates />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;


