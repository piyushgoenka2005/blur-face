import { Routes, Route, Navigate } from 'react-router-dom';
import { SourceSelection } from './components/SourceSelection';
import { WebcamDashboard } from './pages/WebcamDashboard';
import { RtspConnection } from './pages/RtspConnection';
import { CctvDashboard } from './pages/CctvDashboard';

/**
 * Route map:
 *  /        → Source selection
 *  /webcam  → Laptop webcam (cloud processing)
 *  /rtsp    → RTSP connection form
 *  /cctv    → Live CCTV blurred stream dashboard
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SourceSelection />} />
      <Route path="/webcam" element={<WebcamDashboard />} />
      <Route path="/rtsp" element={<RtspConnection />} />
      <Route path="/cctv" element={<CctvDashboard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
