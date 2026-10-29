import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="app-shell">
        <section className="card boot-card" role="alert">
          <h1>Não foi possível mostrar esta tela.</h1>
          <p>Ocorreu uma falha inesperada. Você pode tentar novamente.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => this.setState({ failed: false })}
          >
            Tentar novamente
          </button>
        </section>
      </main>
    );
  }
}
