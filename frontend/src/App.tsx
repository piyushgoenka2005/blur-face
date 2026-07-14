import { useState } from 'react';
import { SourceSelection } from './components/SourceSelection';
import { WebcamDashboard } from './pages/WebcamDashboard';

type View = 'source' | 'webcam';

/**
 * Browser-only face blur app.
 * Webcam mode never talks to the FastAPI backend.
 */
export default function App() {
  const [view, setView] = useState<View>('source');

  if (view === 'source') {
    return <SourceSelection onWebcamSelected={() => setView('webcam')} />;
  }

  return <WebcamDashboard onChangeSource={() => setView('source')} />;
}
