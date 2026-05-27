import React, { useState } from "react";
import BrandLogo from "../components/common/BrandLogo";
import { useI18n } from "../context/I18nContext";


const LoginPage = ({ onLogin }) => {
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    if (!username || !password) {
      setError(t("loginErrorEmpty"));
      return;
    }

    setLoading(true);
    setTimeout(() => {
      if (password === "admin121") {
        onLogin(username);
      } else {
        setError(t("loginErrorInvalid"));
        setLoading(false);
      }
    }, 800);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#edf4fb] px-4 py-8">



      {/* ── Gradient overlay on top of image ── */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(19,75,143,0.18),transparent_28rem),radial-gradient(circle_at_86%_16%,rgba(0,124,186,0.14),transparent_24rem),linear-gradient(135deg,#f0f6fd_0%,#edf4fb_48%,#e7eff8_100%)]" />

      {/* ── Decorative blobs ── */}
      <div className="pointer-events-none absolute -left-24 bottom-[-180px] h-[420px] w-[420px] rounded-full bg-[#134b8f]/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-[-150px] h-[360px] w-[360px] rounded-full bg-[#007cba]/10 blur-3xl" />

      <div className="relative w-full max-w-5xl overflow-hidden rounded-2xl bg-white/96 shadow-[0_28px_80px_rgba(15,36,56,0.20)] ring-1 ring-[#c9d8ea] backdrop-blur lg:grid lg:grid-cols-[1.04fr_0.96fr]">

        {/* ── Left Panel ── */}
        <section className="relative hidden min-h-[620px] overflow-hidden bg-[#092641] px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-[linear-gradient(145deg,_rgba(0,124,186,0.72)_0%,_rgba(19,75,143,0.92)_42%,_rgba(8,31,53,0.98)_100%)]" />



          {/* <img
            src={ricoLogo}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 top-20 w-[520px] select-none opacity-[0.08] mix-blend-screen"
          /> */}
          <div className="absolute inset-x-0 bottom-0 h-56 bg-[linear-gradient(0deg,_rgba(1,16,31,0.42),_transparent)]" />
          <div className="absolute left-10 right-10 top-10 h-px bg-white/15" />

          <div className="relative">
            <div className="inline-flex rounded-xl bg-white p-4 shadow-xl shadow-black/10 ring-1 ring-white/50">
              <BrandLogo className="justify-center" />
            </div>
            <div className="mt-12 max-w-md">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#bfe8ff]">
                {t("companyName")}
              </p>
              <h1 className="mt-4 text-4xl font-bold leading-tight text-white">
                {t("IOT DEVICE MANAGEMENT")}
              </h1>
              <p className="mt-5 text-base leading-7 text-white/78">
                Secure access for part data, machine profiles, and production-ready master records.
              </p>
            </div>
          </div>

          <div className="relative grid grid-cols-3 gap-3 border-t border-white/15 pt-6 text-sm text-white/75">
            <div>
              <div className="text-2xl font-bold text-white">24/7</div>
              <div>Operations</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">ISO</div>
              <div>Ready data</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">RICO</div>
              <div>Industrial system</div>
            </div>
          </div>
        </section>

        {/* ── Right Panel (Login Form) ── */}
        <section className="px-6 py-8 sm:px-10 lg:px-12 lg:py-12">
          <div className="mb-8 flex justify-center lg:hidden">
            <div className="rounded-xl bg-white px-5 py-4 shadow-lg ring-1 ring-slate-200">
              <BrandLogo className="justify-center" />
            </div>
          </div>

          <div className="mx-auto max-w-md">
            <div className="mb-8">
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-[#007cba]">
                Secure sign in
              </p>
              <h2 className="text-3xl font-bold text-[#092641]">{t("welcomeBack")}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{t("signInContinue")}</p>
            </div>

            {error && (
              <div className="mb-5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600">{t("username")}</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t("enterUsername")}
                    className="w-full rounded-lg border border-[#ccd9e8] bg-[#f8fbff] px-4 py-3.5 pl-11 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#007cba] focus:bg-white focus:ring-4 focus:ring-[#007cba]/10"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600">{t("password")}</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </span>
                  <input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("enterPassword")}
                    className="w-full rounded-lg border border-[#ccd9e8] bg-[#f8fbff] px-4 py-3.5 pl-11 pr-11 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#007cba] focus:bg-white focus:ring-4 focus:ring-[#007cba]/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700"
                    aria-label={showPass ? "Hide password" : "Show password"}
                  >
                    {showPass ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[#134b8f] px-4 py-3.5 font-semibold text-white shadow-lg shadow-[#134b8f]/20 transition-all duration-200 hover:bg-[#0d3a70] focus:outline-none focus:ring-4 focus:ring-[#134b8f]/15 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {t("signingIn")}
                  </>
                ) : (
                  <>
                    {t("signIn")}
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </>
                )}
              </button>
            </form>

            <p className="mt-8 text-center text-xs text-slate-400">
              (c) 2026 {t("companyName")}. {t("allRightsReserved")}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default LoginPage;