import { useRef, useState } from 'react';
import { api } from '../api/client';
import { ui } from '../lib/ui';
import { cn } from '../lib/cn';

const SUGGESTIONS = [
  'Why is John Doe high risk?',
  'Summarize INC-2841 for the war room',
  'What should I fix first right now?',
  'Explain alert AL-9182 in plain language',
  'Generate an executive security brief',
  'Recommend containment for WIN-FIN-042',
];

const AiAvatar = () => (
  <div className={ui.aiAvatar}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3.2" stroke="white" strokeWidth="1.8" />
    </svg>
  </div>
);

function formatReply(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <b key={i}>{part.slice(2, -2)}</b>;
    }
    return <span key={i}>{part}</span>;
  });
}

const SEED = [
  { role: 'user', text: 'Why is John Doe high risk?' },
  {
    role: 'ai',
    text: "John's risk score is **8.9 / 10** — critical. He can reach the **AWS production vault** in two hops through the **platform-sre** group, without MFA enrolled, and hasn't signed in for 14 hours. His manager's account is disabled, so his access has no active approver of record.",
    showPath: true,
  },
  {
    role: 'ai',
    text: "I'd recommend two actions — enforce step-up MFA on his next session, and reassign his access owner since D. Whitfield is disabled. Want me to draft both?",
  },
  { role: 'user', text: 'Yes, do both.' },
  {
    role: 'ai',
    text: "Done — MFA enforcement queued for John's next sign-in, and ownership reassignment routed to N. Brooks for approval. I'll confirm once both land.",
  },
];

export default function CopilotPage() {
  const [messages, setMessages] = useState(SEED);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const scrollRef = useRef(null);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: message }]);
    setBusy(true);
    try {
      const res = await api.copilotChat(message);
      setMessages((m) => [...m, { role: 'ai', text: res.reply }]);
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    } catch (e) {
      setMessages((m) => [...m, { role: 'ai', text: `Sorry — ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  };

  const applyAction = (label) => {
    setToast(`${label} queued`);
    setTimeout(() => setToast(''), 2500);
  };

  return (
    <>
      <div className={ui.pageHead}>
        <div>
          <div className={ui.pageEyebrow}>AI Security Assistant</div>
          <h1 className={ui.pageHeadTitle}>Ask, summarize, recommend, report</h1>
          <p className={ui.pageHeadDesc}>Natural-language investigation across threats, incidents, identities, cloud posture, and vulnerabilities — with grounded recommendations.</p>
        </div>
      </div>

      <div className={ui.copilotShell}>
        <div className={ui.copilotCol}>
          <div className={ui.cardHead}>
            <h3 className={ui.cardHeadH3}>Try asking</h3>
          </div>
          {SUGGESTIONS.map((s) => (
            <div key={s} className={ui.promptSuggest} onClick={() => send(s)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && send(s)}>
              {s}
            </div>
          ))}
        </div>

        <div className={ui.chatArea}>
          <div className={ui.chatScroll} ref={scrollRef}>
            {messages.map((msg, idx) =>
              msg.role === 'user' ? (
                <div className={ui.msgUser} key={idx}>{msg.text}</div>
              ) : (
                <div className={ui.msgAi} key={idx}>
                  <AiAvatar />
                  <div className={ui.aiBubble}>
                    {formatReply(msg.text)}
                    {msg.showPath && (
                      <svg viewBox="0 0 400 90" width="100%" height="80" style={{ marginTop: '10px' }}>
                        <g stroke="#EF4444" strokeWidth="1.6" className="gedge">
                          <line x1="30" y1="45" x2="150" y2="20" />
                          <line x1="150" y1="20" x2="270" y2="60" />
                          <line x1="270" y1="60" x2="370" y2="25" />
                        </g>
                        <circle cx="30" cy="45" r="14" fill="#111827" stroke="#22D3EE" strokeWidth="2" />
                        <text x="30" y="68" textAnchor="middle" className="gnode-sub">John Doe</text>
                        <circle cx="150" cy="20" r="10" fill="#111827" stroke="#8B5CF6" strokeWidth="2" />
                        <circle cx="270" cy="60" r="10" fill="#111827" stroke="#8B5CF6" strokeWidth="2" />
                        <circle cx="370" cy="25" r="16" fill="#111827" stroke="#EF4444" strokeWidth="2.5" />
                        <text x="370" y="6" textAnchor="middle" className="gnode-sub">AWS vault</text>
                      </svg>
                    )}
                  </div>
                </div>
              )
            )}
            {busy && (
              <div className={ui.msgAi}>
                <AiAvatar />
                <div className={ui.aiBubble}>Thinking…</div>
              </div>
            )}
          </div>
          <div className={ui.chatInput}>
            <button className={cn(ui.iconBtn, 'h-8 w-8')} aria-label="Attach" type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M8 12l6-6a4 4 0 1 1 6 6l-9 9a6 6 0 1 1-8-8" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </button>
            <input
              className={ui.chatInputField}
              type="text"
              placeholder="Ask about an identity, path, or policy…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              disabled={busy}
            />
            <button
              className={cn(ui.iconBtn, 'h-8 w-8 border-0 bg-grad')}
              aria-label="Send"
              type="button"
              onClick={() => send()}
              disabled={busy}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M4 12h16M14 6l6 6-6 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          {toast && (
            <div className="px-3.5 py-2 text-xs text-success">{toast}</div>
          )}
        </div>

        <div className={ui.copilotCol}>
          <div className={ui.cardHead}>
            <h3 className={ui.cardHeadH3}>Suggested actions</h3>
          </div>
          <div className={ui.actionItem}>
            <b>Enforce step-up MFA</b>
            <button className={cn(ui.btnPrimary, ui.btnSm, 'mt-2 w-full justify-center')} onClick={() => applyAction('Step-up MFA')}>
              Apply
            </button>
          </div>
          <div className={ui.actionItem}>
            <b>Reassign access owner</b>
            <button className={cn(ui.btn, ui.btnSm, 'mt-2 w-full justify-center')} onClick={() => applyAction('Owner reassignment')}>
              Route for approval
            </button>
          </div>
          <div className={ui.actionItem}>
            <b>Revoke idle Tier-0 grant</b>
            <button className={cn(ui.btn, ui.btnSm, 'mt-2 w-full justify-center')} onClick={() => applyAction('Tier-0 revoke review')}>
              Review first
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
