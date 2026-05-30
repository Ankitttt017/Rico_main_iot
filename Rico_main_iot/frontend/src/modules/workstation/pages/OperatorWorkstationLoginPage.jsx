import React, { useState } from "react";

const WORKSTATION_USERNAME = "admin";
const WORKSTATION_PASSWORD = "admin121";

const OperatorWorkstationLoginPage = ({ onLogin }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (event) => {
    event.preventDefault();
    setError("");

    if (!username.trim() || !password.trim()) {
      setError("Please enter username and password.");
      return;
    }

    if (
      username.trim().toLowerCase() !== WORKSTATION_USERNAME ||
      password !== WORKSTATION_PASSWORD
    ) {
      setError("Invalid username or password.");
      setPassword("");
      return;
    }

    setLoading(true);
    window.setTimeout(() => {
      onLogin(WORKSTATION_USERNAME);
    }, 350);
  };

  return (
    <main className="flex min-h-screen items-start justify-center bg-black px-4 py-10 font-sans text-white sm:py-16">
      <div className="flex w-full max-w-[360px] flex-col items-center">
        <div className="mb-8 flex h-[76px] w-[260px] items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-white via-slate-50 to-slate-200 px-5 shadow-[0_18px_45px_rgba(0,0,0,0.45)]">
          <div className="text-center leading-none">
            <div className="text-3xl font-black tracking-[0.18em] text-[#134b8f]">RICO</div>
            <div className="mt-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-700">
              Auto Industries Limited
            </div>
          </div>
        </div>

        <section className="w-full rounded-lg border border-[#343946] bg-[#020202] px-8 py-14 shadow-[0_28px_80px_rgba(0,0,0,0.65)]">
          <div className="mx-auto w-full max-w-[230px]">
            <div className="mb-5">
              <h2 className="text-[17px] font-extrabold text-white">Welcome back</h2>
              <p className="mt-1 text-xs font-semibold text-zinc-200">Login to manage your account</p>
            </div>

            {error && (
              <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <label className="mb-2 block text-sm font-semibold text-slate-100" htmlFor="workstation-username">
                Email
              </label>
              <input
                id="workstation-username"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="h-10 w-full rounded border border-[#354052] bg-black px-3 text-sm font-semibold text-white outline-none transition focus:border-[#6f61f4] focus:ring-2 focus:ring-[#6f61f4]/25"
                autoComplete={remember ? "username" : "off"}
                name="rico-workstation-email"
              />

              <label className="mb-2 mt-5 block text-sm font-semibold text-slate-100" htmlFor="workstation-password">
                Password
              </label>
              <input
                id="workstation-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-10 w-full rounded border border-[#354052] bg-black px-3 text-sm font-semibold text-white outline-none transition focus:border-[#6f61f4] focus:ring-2 focus:ring-[#6f61f4]/25"
                autoComplete={remember ? "current-password" : "new-password"}
                name="rico-workstation-password"
              />

              <button
                type="button"
                className="mt-5 block w-full text-right text-sm font-semibold text-white transition hover:text-[#7c6bff]"
              >
                Forgot password?
              </button>

              <label className="mt-5 flex items-center gap-2 text-sm text-white">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  className="h-3.5 w-3.5 accent-[#6f61f4]"
                />
                Remember me
              </label>

              <button
                type="submit"
                disabled={loading}
                className="mt-5 inline-flex h-[38px] min-w-[94px] items-center justify-center rounded bg-[#7062ee] px-5 text-sm font-bold text-white transition hover:bg-[#8174ff] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </div>
        </section>

        <p className="mt-8 max-w-[310px] text-center text-sm font-medium leading-5 text-[#536078]">
          Copyright (c) 2026 Rico Auto Industries Limited. All rights reserved.{" "}
          <a className="text-[#5f64ff]" href="#">
            Terms of use
          </a>{" "}
          |{" "}
          <a className="text-[#5f64ff]" href="#">
            Privacy Policy
          </a>
        </p>
      </div>
    </main>
  );
};

export default OperatorWorkstationLoginPage;
