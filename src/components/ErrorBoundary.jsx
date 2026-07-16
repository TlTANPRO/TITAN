import { Component } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Console-log for now; V10 can wire this into a real telemetry channel.
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  handleReload = () => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary px-6">
        <div className="surface p-8 max-w-md w-full text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-full bg-accent-danger/10 text-accent-danger flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text-primary mb-1">
              Terjadi kesalahan pada tampilan
            </h1>
            <p className="text-sm text-text-muted">
              Coba muat ulang halaman. Jika masalah berlanjut, bersihkan cache browser (DevTools → Application → Service Workers → Unregister).
            </p>
          </div>
          {this.state.error?.message && (
            <pre className="text-[11px] text-text-muted bg-bg-tertiary rounded-lg p-3 overflow-auto max-h-32 text-left">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="chip bg-bg-tertiary text-text-primary hover:bg-bg-elevated"
            >
              Coba lagi
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="chip bg-accent-primary text-white hover:opacity-90"
            >
              <RotateCw className="w-3 h-3" />
              Muat ulang
            </button>
          </div>
        </div>
      </div>
    );
  }
}
