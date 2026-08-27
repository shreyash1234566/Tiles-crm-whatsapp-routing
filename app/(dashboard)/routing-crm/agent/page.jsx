'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Code2,
  Info,
  Loader2,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  Zap,
} from 'lucide-react';
import { KnowledgeBase } from '@/components/whatsapp/agent/knowledge-base';
import { SystemPromptEditor } from '@/components/whatsapp/agent/system-prompt-editor';
import { DEFAULT_SYSTEM_PROMPT } from '@/lib/ai-agent/system-prompt';

const DEFAULTS = {
  enabled: false,
  draftOnly: true,
  allowedGroupJids: [],
  allowedDepartmentIds: [],
  confidenceThreshold: 0.45,
  maxResponseTokens: 300,
  responseDelayMs: 1500,
  agent_name: 'Assistant',
  system_prompt: DEFAULT_SYSTEM_PROMPT,
  fallback_message: 'Let me connect you with our team.',
  languages: ['en', 'hi'],
};

const LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'mr', label: 'Marathi' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'bn', label: 'Bengali' },
];

const TABS = [
  { id: 'config', label: 'Configuration', icon: Settings2 },
  { id: 'knowledge', label: 'Knowledge Base', icon: BookOpen },
  { id: 'prompt', label: 'System Prompt', icon: Code2 },
];

function mergeConfig(data) {
  return {
    ...DEFAULTS,
    ...(data || {}),
    allowedGroupJids: Array.isArray(data?.allowedGroupJids) ? data.allowedGroupJids : [],
    allowedDepartmentIds: Array.isArray(data?.allowedDepartmentIds) ? data.allowedDepartmentIds : [],
    languages: Array.isArray(data?.languages) && data.languages.length ? data.languages : DEFAULTS.languages,
  };
}

export default function EvolutionRagControlsPage() {
  const [tab, setTab] = useState('config');
  const [config, setConfig] = useState(DEFAULTS);
  const [groups, setGroups] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [meta, setMeta] = useState({ knowledgeEnabled: false, serverAutosendEnabled: false });
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const selectedGroups = useMemo(() => new Set(config.allowedGroupJids), [config.allowedGroupJids]);
  const selectedDepartments = useMemo(() => new Set(config.allowedDepartmentIds), [config.allowedDepartmentIds]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [configResponse, groupsResponse, departmentsResponse] = await Promise.all([
        fetch('/api/evolution/agent/config', { cache: 'no-store' }),
        fetch('/api/evolution/groups', { cache: 'no-store' }),
        fetch('/api/routing/users', { cache: 'no-store' }),
      ]);
      const [configBody, groupsBody, departmentsBody] = await Promise.all([
        configResponse.json(),
        groupsResponse.json(),
        departmentsResponse.json(),
      ]);
      if (!configResponse.ok) throw new Error(configBody.error || 'Unable to load Evolution RAG controls');
      setConfig(mergeConfig(configBody.data));
      setMeta({
        knowledgeEnabled: Boolean(configBody.knowledgeEnabled),
        serverAutosendEnabled: Boolean(configBody.serverAutosendEnabled),
      });
      setGroups(groupsResponse.ok && Array.isArray(groupsBody.data) ? groupsBody.data : []);
      setDepartments(departmentsResponse.ok && Array.isArray(departmentsBody.departments) ? departmentsBody.departments : []);
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to load Evolution RAG controls');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function update(key, value) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  function toggleGroup(groupJid) {
    update('allowedGroupJids', selectedGroups.has(groupJid)
      ? config.allowedGroupJids.filter((value) => value !== groupJid)
      : [...config.allowedGroupJids, groupJid]);
  }

  function toggleDepartment(id) {
    update('allowedDepartmentIds', selectedDepartments.has(id)
      ? config.allowedDepartmentIds.filter((value) => value !== id)
      : [...config.allowedDepartmentIds, id]);
  }

  function toggleLanguage(code) {
    if (config.languages.includes(code)) {
      // Keep one language selected so a save can never produce an unusable
      // configuration. The API enforces the same invariant server-side.
      if (config.languages.length === 1) return;
      update('languages', config.languages.filter((value) => value !== code));
      return;
    }
    update('languages', [...config.languages, code]);
  }

  async function save() {
    setSaving(true);
    setNotice('');
    try {
      const response = await fetch('/api/evolution/agent/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to save Evolution RAG controls');
      setConfig(mergeConfig(body.data));
      setMeta((current) => ({ ...current, knowledgeEnabled: Boolean(config.enabled) }));
      setNotice('Evolution RAG configuration saved.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to save Evolution RAG controls');
    } finally {
      setSaving(false);
    }
  }

  const statusText = config.enabled
    ? (config.draftOnly ? 'Agent active · draft review mode' : 'Agent active · controlled live mode')
    : 'Agent disabled';

  return (
    <div className="space-y-5 p-1">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <span className="text-accent">✣</span> AI WhatsApp Agent
          </h1>
          <p className="mt-1 text-sm text-muted">Powered by Groq Llama + Local RAG · Offline embeddings · Evolution group workflow</p>
        </div>
        <button
          type="button"
          onClick={() => update('enabled', !config.enabled)}
          className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${config.enabled
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            : 'border-border bg-white text-muted hover:text-foreground'
            }`}
        >
          {config.enabled ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
          {statusText}
          {config.enabled && <Zap className="h-3.5 w-3.5 fill-current" />}
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1 no-scrollbar">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              type="button"
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all ${active
                ? 'border border-border/50 bg-surface-light text-accent shadow-sm'
                : 'text-muted hover:bg-surface-hover hover:text-foreground'
                }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {notice && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {notice}
        </div>
      )}

      {tab === 'knowledge' && <KnowledgeBase apiBase="/api/evolution/agent/knowledge" />}
      {tab === 'prompt' && (
        <SystemPromptEditor
          value={config.system_prompt}
          onChange={(value) => update('system_prompt', value)}
          onSave={save}
          saving={saving}
          savedAt={notice.startsWith('Evolution RAG configuration saved') ? new Date() : null}
        />
      )}

      {tab === 'config' && (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className={`rounded-xl border p-4 ${meta.knowledgeEnabled ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <p className="text-sm font-semibold">AI Agent</p>
              <p className="mt-1 text-xs">{config.enabled ? 'Ready for allowlisted dealer groups.' : 'Disabled — enable it when the knowledge base is ready.'}</p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
              <p className="text-sm font-semibold">Draft safeguard</p>
              <p className="mt-1 text-xs">{config.draftOnly ? 'Human review is required before every reply.' : 'Live mode is restricted to the configured test group and server switch.'}</p>
            </div>
            <div className={`rounded-xl border p-4 ${meta.serverAutosendEnabled ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50'}`}>
              <p className="text-sm font-semibold">Live send server switch</p>
              <p className="mt-1 text-xs">{meta.serverAutosendEnabled ? 'Enabled on the server.' : 'Disabled — no RAG reply can be sent automatically.'}</p>
            </div>
          </div>

          {!config.enabled && (
            <div className="flex items-center gap-2 rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-yellow-600" />
              Agent is disabled. Enable it below to start preparing replies for Evolution groups.
            </div>
          )}

          {!config.draftOnly && (
            <div className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              Live replies require exactly one explicitly allowlisted test group and the VPS-only autosend switch.
            </div>
          )}

          <div className="space-y-5 rounded-xl border border-border bg-white p-5 shadow-sm">
            <div className="grid gap-5 lg:grid-cols-2">
              <label className="text-sm font-medium">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">Agent Name</span>
                <input type="text" maxLength={80} value={config.agent_name} onChange={(event) => update('agent_name', event.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-sm" placeholder="e.g. Aria, Riya, Support" />
                <span className="mt-1 block text-[11px] text-muted">The name the AI signs off as in messages.</span>
              </label>
              <label className="text-sm font-medium">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">Response Delay — {config.responseDelayMs}ms</span>
                <input type="range" min="0" max="10000" step="100" value={config.responseDelayMs} onChange={(event) => update('responseDelayMs', Number(event.target.value))} className="w-full accent-accent" />
                <span className="mt-0.5 flex justify-between text-[10px] text-muted"><span>Instant</span><span>10 s</span></span>
                <span className="mt-1 block text-[11px] text-muted">Simulates typing delay before a controlled live reply.</span>
              </label>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <label className="text-sm font-medium">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">Confidence Threshold — {Number(config.confidenceThreshold).toFixed(2)}</span>
                <input type="range" min="0" max="0.9" step="0.05" value={config.confidenceThreshold} onChange={(event) => update('confidenceThreshold', Number(event.target.value))} className="w-full accent-accent" />
                <span className="mt-0.5 flex justify-between text-[10px] text-muted"><span>Loose (0.0)</span><span>Strict (0.9)</span></span>
                <span className="mt-1 block text-[11px] text-muted">Below this cosine similarity, the run becomes a human handoff.</span>
              </label>
              <label className="text-sm font-medium">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">Max Response Tokens — {config.maxResponseTokens}</span>
                <input type="range" min="32" max="500" step="1" value={config.maxResponseTokens} onChange={(event) => update('maxResponseTokens', Number(event.target.value))} className="w-full accent-accent" />
                <span className="mt-0.5 flex justify-between text-[10px] text-muted"><span>Short (32)</span><span>Long (500)</span></span>
                <span className="mt-1 block text-[11px] text-muted">Short replies are faster and safer for WhatsApp.</span>
              </label>
            </div>

            <label className="block text-sm font-medium">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">Fallback / Handoff Message</span>
              <textarea maxLength={2000} value={config.fallback_message} onChange={(event) => update('fallback_message', event.target.value)} rows={3} className="w-full resize-none rounded-lg border border-border px-3 py-2 text-sm" placeholder="Let me connect you with our team." />
              <span className="mt-1 block text-[11px] text-muted">Used as the configured human-handoff wording. Evolution live mode never bypasses the safety review.</span>
            </label>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Supported Languages</p>
              <div className="flex flex-wrap gap-2">
                {LANGUAGE_OPTIONS.map((language) => {
                  const active = config.languages.includes(language.code);
                  return <button type="button" key={language.code} onClick={() => toggleLanguage(language.code)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'border-accent bg-accent text-white' : 'border-border bg-surface text-muted hover:border-accent/50 hover:text-foreground'}`}>{language.label}</button>;
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-muted">The prompt instructs the model to reply in the dealer&apos;s language.</p>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-800">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              <div className="space-y-1"><p><strong>Cost:</strong> Groq handles generation while multilingual-e5-small embeddings run locally on the VPS.</p><p><strong>Cache:</strong> Keep draft mode on while validating dealer answers; human claims and closed tickets always stop a send.</p></div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <section>
                <h2 className="flex items-center gap-2 font-semibold"><BookOpen className="h-4 w-4 text-accent" />Allowlisted groups</h2>
                <p className="mt-1 text-xs text-muted">Select groups where Evolution RAG may prepare drafts. In draft mode, an empty list allows all routed groups.</p>
                <div className="mt-3 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                  {groups.length === 0 ? <p className="p-2 text-sm text-muted">No routed groups yet.</p> : groups.map((group) => <label key={group.id} className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-slate-50"><input type="checkbox" checked={selectedGroups.has(group.groupJid)} onChange={() => toggleGroup(group.groupJid)} /><span className="min-w-0"><span className="block truncate text-sm font-medium">{group.subject || group.groupJid}</span><span className="block truncate text-xs text-muted">{group.groupJid}</span></span></label>)}
                </div>
              </section>
              <section>
                <h2 className="font-semibold">Allowed departments</h2>
                <p className="mt-1 text-xs text-muted">Optional additional scope. When set, the group must also belong to one of these departments.</p>
                <div className="mt-3 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                  {departments.length === 0 ? <p className="p-2 text-sm text-muted">No active routing departments.</p> : departments.map((department) => <label key={department.id} className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-slate-50"><input type="checkbox" checked={selectedDepartments.has(department.id)} onChange={() => toggleDepartment(department.id)} /><span className="text-sm font-medium">{department.name}</span></label>)}
                </div>
              </section>
            </div>

            <div className="flex flex-wrap items-center gap-5 border-t border-border pt-5">
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={config.enabled} onChange={(event) => update('enabled', event.target.checked)} />Enable Evolution RAG</label>
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={config.draftOnly} onChange={(event) => update('draftOnly', event.target.checked)} />Draft-only review mode</label>
            </div>

            <button type="button" onClick={() => void save()} disabled={saving || loading} className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-accent/90 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save Configuration'}
            </button>
            {notice.startsWith('Evolution RAG configuration saved') && <span className="ml-2 inline-flex items-center gap-1.5 text-xs text-green-700"><CheckCircle2 className="h-3.5 w-3.5" />Saved</span>}
          </div>
        </div>
      )}

      {loading && tab !== 'knowledge' && <div className="flex items-center justify-center gap-2 py-5 text-sm text-muted"><RefreshCw className="h-4 w-4 animate-spin" />Loading Evolution RAG settings…</div>}
    </div>
  );
}
