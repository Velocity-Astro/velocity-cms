import { Component, type ReactNode } from 'react';
import { ErrorState } from '../app/RequestState.js';

export interface PluginBoundaryProps {
  readonly children: ReactNode;
}

/**
 * Keeps a plugin's fault to the plugin's own part of the screen. What a plugin draws is not the
 * editor's code, so when it throws, its place says what went wrong and offers another try, and
 * everything around it carries on.
 */
export class PluginBoundary extends Component<PluginBoundaryProps, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override render() {
    if (this.state.error !== null) return <ErrorState error={this.state.error} onRetry={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}
