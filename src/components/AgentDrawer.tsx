import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CheckSquare,
  Mic,
  MicOff,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  api,
  type AdvisorBriefing,
  type AdvisorSuggestion,
  type AgentExecutionResult,
  type AgentHistoryRecord,
  type AppPreferences,
} from '../lib/api.ts';
import { Badge, Button, FieldLabel, Input, Select } from './ui/Primitives.tsx';
import {
  APP_LANGUAGES,
  LANGUAGE_META,
  UI_STRINGS,
  type AppLanguage,
} from '../../shared/i18n.ts';
import { formatINR, type Scope } from '../../shared/ledger-core.ts';
import type { WorkspaceId } from '../workspaces/DashboardView.tsx';

interface PendingConfirm {
  commandText: string;
  result: AgentExecutionResult;
}

export function AgentDrawer({
  open,
  onClose,
  preferences,
  onPreferencesChange,
  onApplyUiEffects,
  queuedCommand,
  onConsumedQueuedCommand,
}: {
  open: boolean;
  onClose: () => void;
  preferences: AppPreferences;
  onPreferencesChange: (next: AppPreferences) => void;
  onApplyUiEffects: (effects: {
    navigateTab?: WorkspaceId;
    scopeFilter?: Scope | 'all';
    setLanguage?: AppLanguage;
    mutatedData?: boolean;
  }) => void;
  queuedCommand?: { id: number; commandText: string } | null;
  onConsumedQueuedCommand?: () => void;
}) {
  const sysLang = preferences.systemLanguage;
  const dict = UI_STRINGS[sysLang].agent;

  const [history, setHistory] = useState<AgentHistoryRecord[]>([]);
  const [briefing, setBriefing] = useState<AdvisorBriefing | null>(null);
  const [liveSuggestions, setLiveSuggestions] = useState<AdvisorSuggestion[]>([]);
  const [commandInput, setCommandInput] = useState('');
  const [listening, setListening] = useState(false);
  const [running, setRunning] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState('');

  // Optional LLM config fields
  const [providerDraft, setProviderDraft] = useState(preferences.llmProvider);
  const [modelDraft, setModelDraft] = useState(preferences.llmModel);
  const [apiKeyDraft, setApiKeyDraft] = useState('');

  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setProviderDraft(preferences.llmProvider);
    setModelDraft(preferences.llmModel);
  }, [preferences]);

  const refreshAssistantState = () => {
    void api.getAgentHistory().then(setHistory).catch(() => {});
    void api
      .getAgentBriefing()
      .then((b) => {
        setBriefing(b);
        setLiveSuggestions(b.suggestions);
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!open) return;
    refreshAssistantState();
  }, [open, sysLang]);

  useEffect(() => {
    if (!open || !queuedCommand?.commandText) return;
    const cmd = queuedCommand.commandText;
    onConsumedQueuedCommand?.();
    void runCommand(cmd);
  }, [open, queuedCommand?.id]);

  useEffect(() => {
    if (!open) return;
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history.length, pendingConfirm, open]);

  useEffect(() => {
    if (!open) {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      if (recognitionRef.current) recognitionRef.current.stop();
      setListening(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const runCommand = async (
    text: string,
    opts: { confirmExecution?: boolean; pendingCalls?: unknown[] } = {},
  ) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setError('');
    setRunning(true);
    try {
      const res = await api.sendAgentCommand({
        commandText: trimmed,
        confirmExecution: opts.confirmExecution,
        pendingCalls: opts.pendingCalls,
      });

      if (res.requiresConfirmation) {
        setPendingConfirm({ commandText: trimmed, result: res });
      } else {
        setPendingConfirm(null);
        setCommandInput('');
        if (res.briefing) setBriefing(res.briefing);
        else void api.getAgentBriefing().then(setBriefing).catch(() => {});
        if (res.suggestions) setLiveSuggestions(res.suggestions);
        const updated = await api.getAgentHistory();
        setHistory(updated);
        onApplyUiEffects(res.uiEffects);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runCommand(commandInput);
  };

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        resolve(result.split(',')[1] ?? '');
      };
      reader.onerror = () => reject(new Error('Could not read audio clip'));
      reader.readAsDataURL(blob);
    });

  const handleVoiceToggle = async () => {
    setError('');

    // Stop active recording / speech recognition cleanly on second click
    if (listening) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setListening(false);
      return;
    }

    // 1. Acoustic Auto-Detect (Bengali / Hindi / English) via Gemini or OpenAI when API key is configured
    const canRecordCloudAudio =
      preferences.llmProvider !== 'local' &&
      preferences.hasApiKey &&
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== 'undefined';

    if (canRecordCloudAudio) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        const recorder = new MediaRecorder(stream);
        const chunks: Blob[] = [];
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) chunks.push(ev.data);
        };
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
          setListening(false);
          if (chunks.length === 0) return;
          const mimeType = recorder.mimeType || 'audio/webm';
          const blob = new Blob(chunks, { type: mimeType });
          setRunning(true);
          try {
            const audioBase64 = await blobToBase64(blob);
            const { transcript, result } = await api.sendAgentVoice({ audioBase64, mimeType });
            if (result.requiresConfirmation) {
              setPendingConfirm({ commandText: transcript || '[Voice Command]', result });
            } else {
              setPendingConfirm(null);
              const updated = await api.getAgentHistory();
              setHistory(updated);
              onApplyUiEffects(result.uiEffects);
            }
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setRunning(false);
          }
        };
        mediaRecorderRef.current = recorder;
        recorder.start();
        setListening(true);
        return;
      } catch {
        setError('Microphone permission denied. Allow microphone access or type your command.');
        return;
      }
    }

    // 2. Zero-Key Browser SpeechRecognition fallback (no manual selector; uses System Language locale,
    //    auto-falling back to en-IN if OS lacks locale pack — Hinglish/Banglish Romanized phrases still match)
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setError('Voice recognition is unavailable in this browser; configure a Gemini/OpenAI key in ⚙️ or type directly.');
      return;
    }

    const startSpeech = (locale: string, allowFallback: boolean) => {
      const rec = new SpeechRec();
      rec.lang = locale;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (event: any) => {
        const spoken = (event?.results?.[0]?.[0]?.transcript ?? '').trim();
        if (spoken) {
          setCommandInput(spoken);
          void runCommand(spoken);
        }
      };
      rec.onerror = (ev: any) => {
        if (allowFallback && (ev?.error === 'language-not-supported' || ev?.error === 'no-speech') && locale !== 'en-IN') {
          startSpeech('en-IN', false);
          return;
        }
        setListening(false);
      };
      rec.onend = () => setListening(false);
      recognitionRef.current = rec;
      setListening(true);
      rec.start();
    };

    startSpeech(LANGUAGE_META[sysLang].speechLocale, true);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const next = await api.updatePreferences({
      llmProvider: providerDraft,
      llmModel: modelDraft.trim(),
      llmApiKey: apiKeyDraft.trim() || undefined,
    });
    setApiKeyDraft('');
    onPreferencesChange(next);
    setShowSettings(false);
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/30"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={dict.title}
        className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl animate-panel-in"
      >
        {/* Header */}
        <div className="border-b border-slate-200 px-4 py-3.5 bg-slate-50/70">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white shadow-xs">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-950">{dict.title}</h2>
                <p className="text-[11px] text-slate-500 leading-snug">{dict.subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowSettings((s) => !s)}
                aria-label={dict.settingsTitle}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200/60 hover:text-slate-900 cursor-pointer"
              >
                <Settings2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close AI Agent"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200/60 hover:text-slate-900 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* System Language Switcher inside Drawer */}
          <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
            <span className="font-medium text-slate-600">{UI_STRINGS[sysLang].systemLanguage}:</span>
            <div className="flex items-center gap-1 rounded-lg bg-white border border-slate-200 p-0.5">
              {APP_LANGUAGES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={async () => {
                    const next = await api.updatePreferences({ systemLanguage: code });
                    onPreferencesChange(next);
                  }}
                  className={`rounded-md px-2 py-0.5 font-semibold transition-colors cursor-pointer ${
                    sysLang === code
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {LANGUAGE_META[code].nativeLabel}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Collapsible Agent Settings Panel */}
        {showSettings && (
          <form onSubmit={handleSaveSettings} className="border-b border-slate-200 bg-slate-50 p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-900">{dict.settingsTitle}</span>
              <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700">
                <input
                  type="checkbox"
                  checked={preferences.agentAutoExecute}
                  onChange={async (e) => {
                    const next = await api.updatePreferences({ agentAutoExecute: e.target.checked });
                    onPreferencesChange(next);
                  }}
                  className="h-3.5 w-3.5 rounded border-slate-300"
                />
                {dict.autoExecuteLabel}
              </label>
            </div>
            <div>
              <FieldLabel>Engine Mode</FieldLabel>
              <Select
                className="h-8 text-xs"
                value={providerDraft}
                onChange={(e) => setProviderDraft(e.target.value as 'local' | 'gemini' | 'openai')}
              >
                <option value="local">{dict.providerLocal}</option>
                <option value="gemini">{dict.providerGemini}</option>
                <option value="openai">{dict.providerOpenAI}</option>
              </Select>
            </div>
            {providerDraft !== 'local' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel>API Key {preferences.hasApiKey ? '(Saved)' : ''}</FieldLabel>
                  <Input
                    type="password"
                    className="h-8 text-xs"
                    placeholder={dict.apiKeyPlaceholder}
                    value={apiKeyDraft}
                    onChange={(e) => setApiKeyDraft(e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel>Model (optional)</FieldLabel>
                  <Input
                    className="h-8 text-xs"
                    placeholder={providerDraft === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o-mini'}
                    value={modelDraft}
                    onChange={(e) => setModelDraft(e.target.value)}
                  />
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              {preferences.hasApiKey && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    const next = await api.updatePreferences({ llmProvider: 'local', clearApiKey: true });
                    onPreferencesChange(next);
                  }}
                >
                  Clear Key
                </Button>
              )}
              <Button variant="primary" size="sm" type="submit">
                {dict.saveSettings}
              </Button>
            </div>
          </form>
        )}

        {/* Proactive Human Advisor & Daily Assessment Card */}
        {briefing && !showSettings && (
          <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-800">
                <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                <span>{dict.advisorTitle}</span>
              </div>
              <Badge
                className={
                  briefing.status === 'healthy'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : briefing.status === 'watch'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-red-50 text-red-700 border-red-200'
                }
              >
                {dict.healthLabel}: {briefing.healthScore}/100
              </Badge>
            </div>
            <p className="text-[11px] text-slate-700 leading-snug">{briefing.headline}</p>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>{dict.projected30dLabel}</span>
              <span
                className={`font-semibold font-mono-data ${
                  briefing.projected30dBalanceMinor < 0 ? 'text-red-600' : 'text-emerald-700'
                }`}
              >
                {formatINR(briefing.projected30dBalanceMinor, { compact: true })}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 pt-0.5">
              <button
                type="button"
                disabled={running}
                onClick={() => void runCommand('assess my finances')}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-blue-200 bg-white px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="h-3 w-3" /> {dict.btnAssess}
              </button>
              <button
                type="button"
                disabled={running}
                onClick={() => void runCommand("what's wrong?")}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-amber-200 bg-white px-2 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-50 cursor-pointer disabled:opacity-50"
              >
                <AlertTriangle className="h-3 w-3" /> {dict.btnWrong}
              </button>
              <button
                type="button"
                disabled={running}
                onClick={() => void runCommand('predict next 30 days')}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-white px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 cursor-pointer disabled:opacity-50"
              >
                <TrendingUp className="h-3 w-3" /> {dict.btnPredict}
              </button>
              <button
                type="button"
                disabled={running}
                onClick={() => void runCommand('archive completed notes')}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
              >
                <CheckSquare className="h-3 w-3" /> {dict.btnClean}
              </button>
            </div>
          </div>
        )}

        {/* Messages & Action Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          {history.length === 0 ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3.5 text-xs text-slate-700 leading-relaxed">
                {dict.welcomeMessage}
              </div>
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {dict.examplesTitle}
                </div>
                {dict.examples.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => void runCommand(ex)}
                    className="w-full text-left rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 hover:border-blue-400 hover:bg-blue-50/40 transition-colors cursor-pointer"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            history.map((item) => (
              <div key={item.id} className="space-y-1.5">
                {/* User Command Bubble */}
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-xs bg-slate-900 px-3.5 py-2 text-xs text-white shadow-2xs">
                    <div>{item.commandText}</div>
                    <div className="mt-1 text-[10px] text-slate-300">
                      {dict.commandLangLabel}: {LANGUAGE_META[item.detectedLanguage].nativeLabel} →{' '}
                      {dict.systemLangLabel}: {LANGUAGE_META[item.systemLanguage].nativeLabel}
                    </div>
                  </div>
                </div>

                {/* Agent Response Bubble */}
                <div className="flex justify-start">
                  <div className="max-w-[92%] rounded-2xl rounded-tl-xs border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-900 space-y-2">
                    <div className="leading-relaxed whitespace-pre-line">{item.replyText}</div>
                    {item.actions.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {item.actions.map((a, idx) => (
                          <Badge
                            key={idx}
                            className={
                              a.ok
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }
                          >
                            {a.ok ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            {a.tool}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}

          {/* 1-Click Recommended Advisor Actions */}
          {liveSuggestions.length > 0 && !pendingConfirm && (
            <div className="rounded-xl border border-slate-200 bg-white p-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <Zap className="h-3 w-3 text-amber-500" /> {dict.recommendedActions}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {liveSuggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={running}
                    onClick={() => void runCommand(s.commandText)}
                    title={s.detail}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                      s.severity === 'urgent'
                        ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                        : s.severity === 'warning'
                          ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                          : 'border-blue-200 bg-blue-50/70 text-blue-700 hover:bg-blue-100/70'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Confirmation Card when Auto-Execute is Off or Destructive Command */}
          {pendingConfirm && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs space-y-2">
              <div className="font-semibold text-amber-950">{pendingConfirm.result.replyText}</div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setPendingConfirm(null)}>
                  {dict.cancel}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    void runCommand(pendingConfirm.commandText, {
                      confirmExecution: true,
                      pendingCalls: pendingConfirm.result.toolCalls,
                    })
                  }
                >
                  {dict.confirmRun}
                </Button>
              </div>
            </div>
          )}

          <div ref={scrollEndRef} />
        </div>

        {/* Footer Input + Auto Voice Command Bar */}
        <div className="border-t border-slate-200 bg-white p-3 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  preferences.llmProvider !== 'local' && preferences.hasApiKey
                    ? 'bg-emerald-500'
                    : 'bg-blue-500'
                }`}
              />
              <span>{dict.voiceAutoBadge}</span>
            </div>
            {history.length > 0 && (
              <button
                type="button"
                onClick={async () => {
                  await api.clearAgentHistory();
                  setHistory([]);
                }}
                className="inline-flex items-center gap-1 text-slate-400 hover:text-red-600 cursor-pointer"
              >
                <Trash2 className="h-3 w-3" /> {dict.clearHistory}
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleVoiceToggle}
              aria-label={listening ? dict.listening : dict.voiceInput}
              className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                listening
                  ? 'border-red-500 bg-red-50 text-red-600 animate-pulse'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <Input
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              placeholder={dict.placeholder}
              disabled={running}
              autoFocus
            />
            <Button variant="primary" type="submit" disabled={running || !commandInput.trim()}>
              <Send className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{running ? dict.thinking : dict.send}</span>
            </Button>
          </form>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
