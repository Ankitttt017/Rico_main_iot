import React, { useState } from "react";
import BrandLogo from "../components/common/BrandLogo";

const WORKSTATION_PASSWORD = "admin121";

const OperatorWorkstationLoginPage = ({ onLogin }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
    <main className="flex min-h-screen flex-col items-center bg-black px-4 py-12 text-white">
      <div className="mb-8 flex h-16 items-center justify-center">
        <div className="flex h-[50px] w-[206px] items-center justify-center rounded-lg bg-white shadow-[0_8px_22px_rgba(255,255,255,0.08)]">
          <div className="scale-[0.84]">
            <BrandLogo wordmark className="justify-center" />
          </div>
        </div>
      </div>

      <section className="w-full max-w-[320px] rounded-md border border-[#30333a] bg-black px-14 py-14 shadow-[0_18px_48px_rgba(0,0,0,0.7)]">
        <div className="mb-5">
          <h1 className="text-base font-bold leading-6 text-white">Welcome back</h1>
          <p className="mt-1 text-sm font-medium text-white">Login to manage your account</p>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label className="mb-2 block text-sm font-medium text-slate-200" htmlFor="workstation-username">
            Username
          </label>
          <input
            id="workstation-username"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="mb-4 h-10 w-full rounded-md border border-[#394150] bg-black px-3 text-sm font-medium text-white outline-none transition placeholder:text-slate-500 focus:border-[#6c5ce7] focus:ring-2 focus:ring-[#6c5ce7]/30"
            autoComplete="username"
            name="rico-workstation-username"
          />

          <label className="mb-2 block text-sm font-medium text-slate-200" htmlFor="workstation-password">
            Password
          </label>
          <input
            id="workstation-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mb-5 h-10 w-full rounded-md border border-[#394150] bg-black px-3 text-sm font-medium text-white outline-none transition placeholder:text-slate-500 focus:border-[#6c5ce7] focus:ring-2 focus:ring-[#6c5ce7]/30"
            autoComplete="current-password"
            name="rico-workstation-password"
          />

          <label className="mb-5 flex items-center gap-2 text-sm font-medium text-white">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-[#394150] accent-[#6c5ce7]"
            />
            Remember me
          </label>

          <button
            type="submit"
            disabled={loading}
            className="h-10 rounded-md bg-[#6c5ce7] px-6 text-sm font-bold text-white transition hover:bg-[#5a4ed1] focus:outline-none focus:ring-2 focus:ring-[#6c5ce7]/50 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>

      <p className="mt-8 max-w-[320px] text-center text-sm leading-6 text-slate-500">
        Copyright (c) 2026 Rico Auto Industries Limited. All rights reserved.
      </p>
    </main>
  );
};

export default OperatorWorkstationLoginPage;
