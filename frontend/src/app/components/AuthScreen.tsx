"use client";

import { useState, type FormEvent } from "react";
import { API_URL, AUTH_TOKEN_KEY } from "../api";

type Account = {
  id: number;
  email: string;
  display_name: string;
  created_at: string;
};

type AuthScreenProps = {
  onAuthenticated: (account: Account) => void;
};

export default function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const isRegistering = mode === "register";
  const isForgotPassword = mode === "forgot";
  const isResettingPassword = mode === "reset";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (isResettingPassword && password !== confirmPassword) {
        throw new Error("The passwords do not match.");
      }

      const endpoint = isForgotPassword
        ? "forgot-password"
        : isResettingPassword
          ? "reset-password"
          : mode;
      const body = isForgotPassword
        ? { email: email.trim() }
        : isResettingPassword
          ? { token: resetToken.trim(), new_password: password }
          : isRegistering
            ? { display_name: name.trim(), email: email.trim(), password }
            : { email: email.trim(), password };
      const response = await fetch(`${API_URL}/auth/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "We couldn’t complete sign-in. Check your details and try again.",
        );
      }
      if (isForgotPassword) {
        setResetToken(typeof data.reset_token === "string" ? data.reset_token : "");
        setPassword("");
        setConfirmPassword("");
        setMode("reset");
        setNotice(
          typeof data.reset_token === "string"
            ? "A local development reset token is ready. It expires in 30 minutes."
            : data.message,
        );
        return;
      }
      if (isResettingPassword) {
        setMode("login");
        setPassword("");
        setConfirmPassword("");
        setResetToken("");
        setNotice("Password updated. Sign in with your new password.");
        return;
      }
      window.localStorage.setItem(AUTH_TOKEN_KEY, data.access_token);
      onAuthenticated(data.user as Account);
    } catch (submitError) {
      setError(
        submitError instanceof TypeError
          ? "Can’t reach the local SupplyChain Twin API. Start the backend and try again."
          : submitError instanceof Error
            ? submitError.message
            : "Sign-in failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_18%_18%,rgba(8,145,178,0.2),transparent_42%),radial-gradient(ellipse_at_85%_82%,rgba(16,185,129,0.12),transparent_38%)]"
      />
      <div className="auth-panel relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950/80 shadow-[0_32px_120px_rgba(8,145,178,0.12)] backdrop-blur-xl lg:grid-cols-[1.05fr_0.95fr]">
        <section className="auth-hero relative hidden min-h-[620px] flex-col justify-between overflow-hidden border-r border-slate-800 bg-[linear-gradient(145deg,rgba(8,47,73,0.72),rgba(15,23,42,0.85)_55%,rgba(2,6,23,0.95))] p-10 lg:flex">
          <div className="absolute -right-20 top-24 h-72 w-72 rounded-full border border-cyan-400/10" />
          <div className="absolute -right-8 top-36 h-48 w-48 rounded-full border border-cyan-400/15" />
          <div className="absolute bottom-16 right-12 h-24 w-24 rounded-full bg-cyan-400/10 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-200">
                <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
                  <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" stroke="currentColor" strokeWidth="1.5" />
                  <path d="m4.5 7.8 7.5 4.4 7.5-4.4M12 12.5V21M8 5.3l8 4.6" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </span>
              <span className="text-sm font-semibold tracking-wide text-slate-200">
                SUPPLYCHAIN <span className="text-cyan-300">TWIN AI</span>
              </span>
            </div>
            <div className="mt-24 max-w-md">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
                Your operations workspace
              </p>
              <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight">
                See the network.
                <br />
                <span className="text-cyan-200">Test what changes.</span>
              </h1>
              <p className="mt-5 max-w-sm text-sm leading-7 text-slate-300">
                Keep supply-chain workspaces, disruption scenarios, and
                mitigation actions together in one private workspace.
              </p>
            </div>
          </div>
          <div className="relative grid grid-cols-3 gap-3">
            {[
              ["01", "Map"],
              ["02", "Simulate"],
              ["03", "Respond"],
            ].map(([number, label]) => (
              <div key={number} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                <p className="text-[10px] font-semibold tracking-widest text-cyan-300">{number}</p>
                <p className="mt-1 text-sm font-medium text-slate-200">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="auth-form-panel flex min-h-[620px] flex-col justify-center p-6 sm:p-10">
          <div className="mb-8 lg:hidden">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
              SupplyChain Twin AI
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Your supply chain,
              <br />
              <span className="text-cyan-200">in clearer focus.</span>
            </h1>
          </div>

          <div className="mb-8">
            <p className="text-sm font-medium text-cyan-300">
              {isRegistering
                ? "Create your private workspace"
                : isForgotPassword || isResettingPassword
                  ? "Account recovery"
                  : "Welcome back"}
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              {isRegistering
                ? "Create account"
                : isForgotPassword
                  ? "Reset your password"
                  : isResettingPassword
                    ? "Choose a new password"
                    : "Sign in"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {isRegistering
                ? "Your workspaces and simulation history will be tied to your account."
                : isForgotPassword
                  ? "Request a local development reset token for your account."
                  : isResettingPassword
                    ? "Enter your reset token and choose a new password."
                    : "Sign in to open your company workspaces and saved simulations."}
            </p>
          </div>

          {(mode === "login" || isRegistering) && (
            <div className="mb-6 grid grid-cols-2 rounded-xl border border-slate-800 bg-slate-900/70 p-1">
              {(["login", "register"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setMode(tab);
                    setError("");
                    setNotice("");
                  }}
                  className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    mode === tab
                      ? "bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-950/40"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {tab === "login" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            {isResettingPassword ? (
              <>
                <label className="block text-sm font-medium text-slate-300">
                  Reset token
                  <input
                    autoComplete="off"
                    value={resetToken}
                    onChange={(event) => setResetToken(event.target.value)}
                    required
                    minLength={32}
                    maxLength={128}
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10"
                    placeholder="Paste your local reset token"
                  />
                </label>
              </>
            ) : isRegistering && (
              <label className="block text-sm font-medium text-slate-300">
                Your name
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={120}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10"
                  placeholder="e.g. Alex Morgan"
                />
              </label>
            )}
            {!isResettingPassword && (
              <label className="block text-sm font-medium text-slate-300">
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  maxLength={320}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10"
                  placeholder="you@company.com"
                />
              </label>
            )}
            {isForgotPassword && (
              <p className="rounded-xl border border-amber-800/70 bg-amber-950/30 px-4 py-3 text-xs leading-5 text-amber-200">
                Recovery is available only in local development; no email is sent.
                Your reset token expires after 30 minutes.
              </p>
            )}
            {!isForgotPassword && (
              <div>
                <label
                  htmlFor="auth-password"
                  className="block text-sm font-medium text-slate-300"
                >
                  {isResettingPassword ? "New password" : "Password"}
                </label>
                <div className="relative mt-2">
                  <input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={isRegistering || isResettingPassword ? "new-password" : "current-password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={isRegistering || isResettingPassword ? 10 : 1}
                    maxLength={128}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 pr-12 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10"
                    placeholder={isRegistering || isResettingPassword ? "At least 10 characters" : "Your password"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-400 transition hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400"
                  >
                    {showPassword ? (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        className="h-5 w-5"
                        aria-hidden="true"
                      >
                        <path
                          d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.7 10.7 0 0 1 12 5c5 0 8.5 4.1 9.5 7-.4 1.2-1.2 2.4-2.3 3.5M6.2 6.2C3.9 7.7 2.8 10 2.5 12c1 2.9 4.5 7 9.5 7 1.1 0 2.1-.2 3-.6"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        className="h-5 w-5"
                        aria-hidden="true"
                      >
                        <path
                          d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinejoin="round"
                        />
                        <circle
                          cx="12"
                          cy="12"
                          r="3"
                          stroke="currentColor"
                          strokeWidth="1.7"
                        />
                      </svg>
                    )}
                  </button>
                </div>
                {(isRegistering || isResettingPassword) && (
                  <span className="mt-1.5 block text-xs text-slate-500">
                    Use at least 10 characters.
                  </span>
                )}
              </div>
            )}
            {isResettingPassword && (
              <label className="block text-sm font-medium text-slate-300">
                Confirm new password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  minLength={10}
                  maxLength={128}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10"
                  placeholder="Enter the new password again"
                />
              </label>
            )}

            {notice && (
              <p role="status" className="rounded-xl border border-emerald-900/80 bg-emerald-950/40 px-4 py-3 text-sm leading-6 text-emerald-200">
                {notice}
              </p>
            )}
            {error && (
              <p role="alert" className="rounded-xl border border-rose-900/80 bg-rose-950/40 px-4 py-3 text-sm leading-6 text-rose-200">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3.5 font-semibold text-slate-950 shadow-lg shadow-cyan-950/25 transition hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/30 disabled:cursor-wait disabled:opacity-60"
            >
              {busy
                ? isForgotPassword
                  ? "Preparing reset..."
                  : isResettingPassword
                    ? "Updating password..."
                    : isRegistering
                      ? "Creating your account..."
                      : "Signing you in..."
                : isForgotPassword
                  ? "Continue to reset"
                  : isResettingPassword
                    ? "Update password"
                    : isRegistering
                      ? "Create secure account"
                      : "Continue to workspace"}
              {!busy && <span aria-hidden="true" className="transition group-hover:translate-x-0.5">→</span>}
            </button>
          </form>

          {mode === "login" && (
            <button
              type="button"
              onClick={() => {
                setMode("forgot");
                setError("");
                setNotice("");
              }}
              className="mt-5 self-center text-sm font-medium text-cyan-300 transition hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              Forgot password?
            </button>
          )}
          {(isForgotPassword || isResettingPassword) && (
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
                setNotice("");
              }}
              className="mt-5 self-center text-sm font-medium text-cyan-300 transition hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              Back to sign in
            </button>
          )}
          {mode === "login" || isRegistering ? (
            <p className="mt-6 text-center text-xs leading-5 text-slate-500">
              You’ll stay signed in until you choose Sign out. Your password is
              stored as a one-way secure hash.
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
