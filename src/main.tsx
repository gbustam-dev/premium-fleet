import React, {Component} from 'react';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

class GlobalErrorBoundary extends Component<{children: React.ReactNode}, {hasError: boolean, error: any}> {
  public state: {hasError: boolean, error: any};
  public props: {children: React.ReactNode};
  
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.props = props;
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("Global Error caught:", error, errorInfo);
  }
  render() {
    const { hasError } = this.state;
    if (hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: '#1A237E', color: 'white', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', fontFamily: 'sans-serif' }}>
          <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>Ups, algo salió mal al iniciar</h1>
          <p style={{ fontSize: '1.2rem', marginBottom: '2rem', opacity: 0.8 }}>La aplicación no pudo cargar correctamente en este momento.</p>
          <div style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: '1.5rem', borderRadius: '16px', overflow: 'auto', textAlign: 'left', margin: '1rem auto', maxWidth: '80%', fontSize: '0.9rem' }}>
            <p style={{ fontWeight: 'bold', marginBottom: '0.5rem', opacity: 0.7 }}>Por favor, intenta de nuevo más tarde o contacta al soporte si el problema persiste.</p>
          </div>
          <button 
            onClick={() => window.location.reload()} 
            style={{ marginTop: '2rem', padding: '1rem 2.5rem', cursor: 'pointer', borderRadius: '12px', border: 'none', backgroundColor: '#ffffff', color: '#1A237E', fontWeight: '800', fontSize: '1rem' }}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.log('SW registration failed: ', err);
    });
  });
}
