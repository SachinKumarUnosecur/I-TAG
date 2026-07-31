import { useState } from 'react';
import { ui } from '../lib/ui';
import { cn } from '../lib/cn';

export default function LoginPage({ onLogin }) {
  const [step, setStep] = useState('credentials');
  const [email, setEmail] = useState('riya@acme.com');
  const [password, setPassword] = useState('••••••••');
  const [remember, setRemember] = useState(true);
  const [code, setCode] = useState(['', '', '', '', '', '']);

  const submitCreds = (e) => {
    e.preventDefault();
    setStep('mfa');
  };

  const finishMfa = (e) => {
    e.preventDefault();
    onLogin?.();
  };

  const setDigit = (idx, val) => {
    const v = val.replace(/\D/g, '').slice(-1);
    const next = [...code];
    next[idx] = v;
    setCode(next);
    if (v && idx < 5) {
      document.getElementById(`mfa-${idx + 1}`)?.focus();
    }
  };

  return (
    <div className={ui.loginScreen}>
      <div className={ui.loginHero}>
        <div className={cn(ui.brand, 'w-auto')}>
          <div className={ui.brandMark}>
            <svg viewBox="0 0 24 24" fill="none" className="h-[17px] w-[17px]">
              <path d="M12 2L4 5V11C4 16 7 20 12 22C17 20 20 16 20 11V5L12 2Z" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M9 12L11.5 14.5L15.5 9.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className={cn(ui.brandName, 'text-text-1')}>
            ITAG
            <span className={ui.brandSub}>Security Platform</span>
          </div>
        </div>

        <div>
          <h1 className="m-0 mb-3 max-w-[460px] text-[40px] leading-tight tracking-tight">
            See every threat.<br />Act before impact.
          </h1>
          <p className="m-0 max-w-[420px] text-[15px] leading-relaxed text-text-3">
            Unified detection, identity, cloud, and endpoint defense — purpose-built for security operations teams.
          </p>
          <div className="login-art" aria-hidden="true">
            <div className="login-node" style={{ top: '22%', left: '18%' }} />
            <div className="login-node" style={{ top: '40%', left: '48%', background: 'var(--purple)', animationDelay: '.4s' }} />
            <div className="login-node" style={{ top: '58%', left: '72%', background: 'var(--blue)', animationDelay: '.8s' }} />
            <div className="login-node" style={{ top: '70%', left: '34%', background: 'var(--warning)', animationDelay: '1.2s' }} />
            <svg width="100%" height="100%" className="absolute inset-0 opacity-55">
              <line x1="20%" y1="24%" x2="50%" y2="42%" stroke="rgba(148,163,184,.45)" strokeWidth="1.2" />
              <line x1="50%" y1="42%" x2="74%" y2="60%" stroke="rgba(148,163,184,.45)" strokeWidth="1.2" />
              <line x1="50%" y1="42%" x2="36%" y2="72%" stroke="rgba(148,163,184,.45)" strokeWidth="1.2" />
            </svg>
          </div>
        </div>

        <div className="text-[12.5px] text-text-3">Trusted by Fortune 500 security teams · SOC 2 · ISO 27001</div>
      </div>

      <div className={ui.loginPanel}>
        <div className={ui.loginCard}>
          {step === 'credentials' ? (
            <>
              <div className={ui.pageEyebrow}>Welcome back</div>
              <h1 className="mt-2 mb-1.5 text-[26px] tracking-tight">Sign in to Aegis</h1>
              <p className="mb-6 text-[13.5px] text-text-3">Use your work email or continue with SSO.</p>

              <form onSubmit={submitCreds}>
                <div className={ui.field}>
                  <label htmlFor="email" className={ui.fieldLabel}>Work email</label>
                  <input id="email" className={ui.fieldInput} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
                </div>
                <div className={ui.field}>
                  <label htmlFor="password" className={ui.fieldLabel}>Password</label>
                  <input id="password" className={ui.fieldInput} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
                </div>
                <div className={ui.loginRow}>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                    Remember me
                  </label>
                  <a href="#forgot" className="text-blue-300">Forgot password?</a>
                </div>
                <button className={cn(ui.btnPrimary, 'w-full justify-center')} type="submit">
                  Continue
                </button>
              </form>

              <div className={ui.dividerOr}>or</div>
              <div className={ui.ssoStack}>
                <button className={cn(ui.btn, ui.btnSso)} type="button" onClick={() => onLogin?.()}>
                  <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#F25022" d="M1 1h10v10H1z"/><path fill="#7FBA00" d="M13 1h10v10H13z"/><path fill="#00A4EF" d="M1 13h10v10H1z"/><path fill="#FFB900" d="M13 13h10v10H13z"/></svg>
                  Continue with Microsoft
                </button>
                <button className={cn(ui.btn, ui.btnSso)} type="button" onClick={() => onLogin?.()}>
                  <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9A6.4 6.4 0 1 1 12 5.6c1.8 0 3 .8 3.7 1.5l2.5-2.4A10 10 0 1 0 12 22c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.7H12z"/></svg>
                  Continue with Google
                </button>
                <button className={cn(ui.btn, ui.btnSso)} type="button" onClick={() => onLogin?.()}>
                  Continue with SSO / SAML
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={ui.pageEyebrow}>Multi-factor authentication</div>
              <h1 className="mt-2 mb-1.5 text-[26px] tracking-tight">Enter verification code</h1>
              <p className="mb-6 text-[13.5px] text-text-3">We sent a 6-digit code to your authenticator app for {email}.</p>
              <form onSubmit={finishMfa}>
                <div className={ui.mfaCode}>
                  {code.map((d, i) => (
                    <input
                      key={i}
                      id={`mfa-${i}`}
                      className={ui.mfaInput}
                      inputMode="numeric"
                      maxLength={1}
                      value={d}
                      onChange={(e) => setDigit(i, e.target.value)}
                      aria-label={`Digit ${i + 1}`}
                    />
                  ))}
                </div>
                <button className={cn(ui.btnPrimary, 'w-full justify-center')} type="submit">
                  Verify & enter platform
                </button>
                <button className={cn(ui.btn, 'mt-2 w-full justify-center')} type="button" onClick={() => setStep('credentials')}>
                  Back
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
