import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
  resetKey?: string | number;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'An unexpected rendering error occurred.',
    };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="mx-auto my-8 max-w-lg rounded-2xl border border-rose-200 bg-white p-6 shadow-sm text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 border border-rose-200">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900">
            {this.props.fallbackTitle || 'Something went wrong in this workspace'}
          </h2>
          <p className="mt-1 text-xs text-slate-600 break-words">{this.state.errorMessage}</p>
        </div>
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, errorMessage: '' })}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Try Again</span>
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#111318] px-3.5 py-2 text-xs font-semibold text-[#FAF8F5] hover:bg-slate-800 cursor-pointer"
          >
            <span>Reload App</span>
          </button>
        </div>
      </div>
    );
  }
}
