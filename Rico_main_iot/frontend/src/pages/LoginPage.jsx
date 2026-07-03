import React, { useEffect, useState } from "react";
import BrandLogo from "../components/common/BrandLogo";
import { useI18n } from "../context/I18nContext";
import { loginUser } from "../services/api";

const LoginPage = ({ onLogin }) => {
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setUsername("");
    setPassword("");
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!username || !password) {
      setError(t("loginErrorEmpty"));
      return;
    }

    setLoading(true);
    try {
      const response = await loginUser({ username, password });
      onLogin(response.data?.data || username);
    } catch (err) {
      setError(err.response?.data?.message || t("loginErrorInvalid"));
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#eaf2fa] px-4 py-8">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,#f6f9fd_0%,#eaf2fa_48%,#dcebf6_100%)]" />
      <div className="absolute inset-0 opacity-[0.32] [background-image:linear-gradient(rgba(19,75,143,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(19,75,143,0.08)_1px,transparent_1px)] [background-size:48px_48px]" />

      <div className="relative w-full max-w-[920px] overflow-hidden rounded-xl bg-white/95 shadow-[0_22px_64px_rgba(15,36,56,0.16)] ring-1 ring-[#c9d8ea] backdrop-blur lg:grid lg:grid-cols-[0.98fr_1.02fr]">
        <section className="relative hidden min-h-[540px] overflow-hidden bg-[#092641] px-8 py-9 text-white lg:flex lg:flex-col lg:justify-between">
          <img
            src="/iot-login-bg.jpg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(150deg,_rgba(9,105,154,0.54)_0%,_rgba(19,75,143,0.46)_44%,_rgba(8,38,65,0.78)_100%)]" />
          <div className="absolute inset-0 bg-[#031321]/35" />
          <div className="absolute inset-x-0 bottom-0 h-44 bg-[linear-gradient(0deg,_rgba(1,16,31,0.66),_transparent)]" />
          <div className="absolute left-8 right-8 top-8 h-px bg-white/15" />

          <div className="relative">
            <div className="inline-flex h-24 w-48 flex-col items-center justify-center rounded-lg bg-white px-4 py-3 shadow-xl shadow-black/10 ring-1 ring-white/60">
              <div className="scale-[0.72]">
                <BrandLogo wordmark className="justify-center" />
              </div>
              <span className="mt-1 max-w-full text-center text-[10px] font-extrabold uppercase leading-tight tracking-[0.08em] text-[#0b4f86]">
                Intelligence Manufacturing Platform
              </span>
            </div>
            <div className="mt-10 max-w-sm">
              <h1 className="text-[34px] font-bold leading-tight text-white">
                {t("Rico Intelligence Manufacturing Platform")}
              </h1>
              <p className="mt-5 text-[15px] font-medium leading-7 text-white/78">
                Secure access for master data, PLC monitoring, traceability, and production reports.
              </p>
            </div>
          </div>

          <div className="relative grid grid-cols-3 gap-4 border-t border-white/15 pt-5 text-sm text-white/72">
            <div>
              <div className="text-base font-bold text-white">Master</div>
              <div className="mt-1 leading-5">Part data</div>
            </div>
            <div>
              <div className="text-base font-bold text-white">PLC</div>
              <div className="mt-1 leading-5">Live data</div>
            </div>
            <div>
              <div className="text-base font-bold text-white">Reports</div>
              <div className="mt-1 leading-5">Records</div>
            </div>
          </div>
        </section>

        <section className="flex min-h-[540px] flex-col px-6 py-8 sm:px-10 lg:px-12 lg:py-10">
          <div className="mb-8 flex justify-center lg:hidden">
            <div className="flex h-24 w-48 flex-col items-center justify-center rounded-xl bg-white px-4 py-3 shadow-lg ring-1 ring-slate-200">
              <div className="scale-[0.72]">
                <BrandLogo wordmark className="justify-center" />
              </div>
              <span className="mt-1 max-w-full text-center text-[10px] font-extrabold uppercase leading-tight tracking-[0.08em] text-[#0b4f86]">
                Intelligence Manufacturing Platform
              </span>
            </div>
          </div>

          <div className="mx-auto w-full max-w-[340px] pt-1 lg:pt-5">
            <div className="mb-7">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#007cba]">
                Secure sign in
              </p>
              <h2 className="text-[28px] font-bold leading-tight text-[#092641]">{t("welcomeBack")}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{t("signInContinue")}</p>
            </div>

            {error && (
              <div className="mb-5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                {loading ? t("signingIn") : t("signIn")}
              </button>
            </form>

            <p className="mt-7 text-center text-xs font-medium text-[#8aa0b8]">
              (c) 2026 {t("companyName")}. {t("allRightsReserved")}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default LoginPage;
