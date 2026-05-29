import React, { useState } from "react";
import BrandLogo from "../components/common/BrandLogo";

const WORKSTATION_PASSWORD = "admin121";

const OperatorWorkstationLoginPage = ({ onLogin }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (event) => {
    event.preventDefault();
    setError("");

    if (!username.trim() || !password.trim()) {
      setError("Please enter username and password.");
      return;
    }

    if (password !== WORKSTATION_PASSWORD) {
      setError("Invalid password. Use admin121 for demo access.");
      setPassword("");
      return;
    }

    setLoading(true);
    window.setTimeout(() => {
      onLogin(username.trim());
    }, 500);
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#eaf2fa] px-4 py-8">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,#f7fbff_0%,#eaf2fa_48%,#dcebf6_100%)]" />
      <div className="absolute inset-0 opacity-[0.28] [background-image:linear-gradient(rgba(19,75,143,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(19,75,143,0.08)_1px,transparent_1px)] [background-size:48px_48px]" />

      <section className="relative w-full max-w-[430px] rounded-xl border border-[#c9d8ea] bg-white/95 px-7 py-8 shadow-[0_22px_64px_rgba(15,36,56,0.16)] backdrop-blur sm:px-9">
        <div className="mx-auto mb-7 flex h-20 w-28 items-center justify-center rounded-lg bg-white shadow-lg ring-1 ring-slate-200">
          <div className="scale-[0.72]">
            <BrandLogo wordmark className="justify-center" />
          </div>
        </div>

        <div className="mb-7 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#007cba]">Digital Workstation</p>
          <h1 className="mt-3 text-[28px] font-bold leading-tight text-[#092641]">Operator Sign In</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Access the workstation production view.</p>
        </div>

        {error && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600" htmlFor="workstation-username">
              Username
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </span>
              <input
                id="workstation-username"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Enter username"
                className="h-12 w-full rounded-lg border border-[#ccd9e8] bg-[#f8fbff] px-4 pl-11 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#007cba] focus:bg-white focus:ring-4 focus:ring-[#007cba]/10"
                autoComplete="username"
                name="rico-workstation-username"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600" htmlFor="workstation-password">
              Password
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </span>
              <input
                id="workstation-password"
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
                className="h-12 w-full rounded-lg border border-[#ccd9e8] bg-[#f8fbff] px-4 pl-11 pr-11 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#007cba] focus:bg-white focus:ring-4 focus:ring-[#007cba]/10"
                autoComplete="current-password"
                name="rico-workstation-password"
              />
              <button
                type="button"
                onClick={() => setShowPass((value) => !value)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
                aria-label={showPass ? "Hide password" : "Show password"}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={showPass ? "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M3 3l18 18" : "M15 12a3 3 0 11-6 0 3 3 0 016 0z"} />
                  {!showPass && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />}
                </svg>
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#134b8f] px-4 font-semibold text-white shadow-lg shadow-[#134b8f]/20 transition hover:bg-[#0d3a70] focus:outline-none focus:ring-4 focus:ring-[#134b8f]/15 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="mt-7 text-center text-xs font-medium text-[#8aa0b8]">
          (c) 2026 Rico Auto Industries Limited. All rights reserved.
        </p>
      </section>
    </main>
  );
};

export default OperatorWorkstationLoginPage;
