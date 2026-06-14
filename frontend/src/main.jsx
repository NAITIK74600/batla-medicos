import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('React crashed:', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'sans-serif', textAlign: 'center' }}>
          <h1 style={{ color: '#C0392B' }}>Something went wrong</h1>
          <pre style={{ textAlign: 'left', background: '#f5f5f5', padding: 16, borderRadius: 8, overflow: 'auto', maxWidth: 600, margin: '20px auto' }}>
            {this.state.error.message}
          </pre>
          <button onClick={() => window.location.reload()} style={{ padding: '10px 24px', fontSize: 16, cursor: 'pointer' }}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HelmetProvider>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
    </HelmetProvider>
  </StrictMode>,
)
