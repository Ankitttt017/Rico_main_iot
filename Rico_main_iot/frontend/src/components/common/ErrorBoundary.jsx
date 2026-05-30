import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    const reloadKey = "rico_error_reload_attempted";
    if (sessionStorage.getItem(reloadKey) === "true") return;
    sessionStorage.setItem(reloadKey, "true");
    window.location.reload();
  }

  componentDidUpdate() {
    if (!this.state.hasError) {
      sessionStorage.removeItem("rico_error_reload_attempted");
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-black text-slate-950">Something went wrong</h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            Please reload the page. Your saved backend data is not affected.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 h-11 rounded-lg bg-blue-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700"
          >
            Reload
          </button>
        </section>
      </main>
    );
  }
}
