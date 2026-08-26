'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, RefreshCw, Save, ShieldCheck } from 'lucide-react';

const defaults = { enabled: false, draftOnly: true, allowedGroupJids: [], allowedDepartmentIds: [], confidenceThreshold: 0.45, maxResponseTokens: 300, responseDelayMs: 0 };

export default function EvolutionRagControlsPage() {
  const [config, setConfig] = useState(defaults);
  const [groups, setGroups] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [meta, setMeta] = useState({ knowledgeEnabled: false, knowledgeAgentName: null, serverAutosendEnabled: false });
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const selectedGroups = useMemo(() => new Set(config.allowedGroupJids || []), [config.allowedGroupJids]);
  const selectedDepartments = useMemo(() => new Set(config.allowedDepartmentIds || []), [config.allowedDepartmentIds]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [configResponse, groupsResponse, departmentsResponse] = await Promise.all([
        fetch('/api/evolution/agent/config', { cache: 'no-store' }),
        fetch('/api/evolution/groups', { cache: 'no-store' }),
        fetch('/api/routing/users', { cache: 'no-store' }),
      ]);
      const [configBody, groupsBody, departmentsBody] = await Promise.all([configResponse.json(), groupsResponse.json(), departmentsResponse.json()]);
      if (!configResponse.ok) throw new Error(configBody.error || 'Unable to load Evolution RAG controls');
      setConfig({ ...defaults, ...configBody.data });
      setMeta({ knowledgeEnabled: Boolean(configBody.knowledgeEnabled), knowledgeAgentName: configBody.knowledgeAgentName || null, serverAutosendEnabled: Boolean(configBody.serverAutosendEnabled) });
      setGroups(groupsResponse.ok ? groupsBody.data || [] : []);
      setDepartments(departmentsResponse.ok ? departmentsBody.departments || [] : []);
      setNotice('');
    } catch (error) { setNotice(error.message || 'Unable to load Evolution RAG controls'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  function toggleGroup(groupJid) { setConfig((current) => ({ ...current, allowedGroupJids: current.allowedGroupJids.includes(groupJid) ? current.allowedGroupJids.filter((value) => value !== groupJid) : [...current.allowedGroupJids, groupJid] })); }
  function toggleDepartment(id) { setConfig((current) => ({ ...current, allowedDepartmentIds: current.allowedDepartmentIds.includes(id) ? current.allowedDepartmentIds.filter((value) => value !== id) : [...current.allowedDepartmentIds, id] })); }
  async function save(event) {
    event.preventDefault(); setSaving(true); setNotice('');
    try {
      const response = await fetch('/api/evolution/agent/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Unable to save Evolution RAG controls');
      setConfig({ ...defaults, ...body.data }); setNotice('Evolution RAG controls saved.');
    } catch (error) { setNotice(error.message || 'Unable to save Evolution RAG controls'); }
    finally { setSaving(false); }
  }

  return <div className="space-y-5 p-1"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-foreground">Evolution RAG controls</h1><p className="mt-1 text-sm text-muted">Local knowledge retrieval for dealer groups. Default mode creates a cited draft; it never sends automatically.</p></div><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold hover:bg-surface-hover"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button></div>
    {notice && <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><AlertTriangle className="h-4 w-4" />{notice}</div>}
    <div className="grid gap-3 md:grid-cols-3"><div className={`rounded-xl border p-4 ${meta.knowledgeEnabled ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><p className="text-sm font-semibold">Knowledge engine</p><p className="mt-1 text-xs">{meta.knowledgeEnabled ? `Ready${meta.knowledgeAgentName ? `: ${meta.knowledgeAgentName}` : ''}` : 'Disabled — enable and index knowledge before requesting drafts.'}</p></div><div className="rounded-xl border border-sky-200 bg-sky-50 p-4"><p className="text-sm font-semibold">Draft safeguard</p><p className="mt-1 text-xs">Human review remains required while Draft-only is enabled.</p></div><div className={`rounded-xl border p-4 ${meta.serverAutosendEnabled ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50'}`}><p className="text-sm font-semibold">Live send server switch</p><p className="mt-1 text-xs">{meta.serverAutosendEnabled ? 'Enabled — a single named test group is still required.' : 'Disabled — no RAG reply can be sent automatically.'}</p></div></div>
    <form onSubmit={save} className="space-y-5 rounded-xl border border-border bg-white p-5 shadow-sm"><div className="flex flex-wrap gap-5"><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={config.enabled} onChange={(event) => setConfig((current) => ({ ...current, enabled: event.target.checked }))} />Enable Evolution RAG</label><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={config.draftOnly} onChange={(event) => setConfig((current) => ({ ...current, draftOnly: event.target.checked }))} />Draft-only review mode</label></div>
      {!config.draftOnly && <div className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><ShieldCheck className="h-4 w-4 shrink-0" />Live mode requires exactly one selected, named test group and the VPS-only autosend switch. Keep it disabled until the test group is accepted.</div>}
      <div className="grid gap-4 lg:grid-cols-3"><label className="text-sm font-medium">Confidence threshold<input type="number" min="0" max="1" step="0.05" value={config.confidenceThreshold} onChange={(event) => setConfig((current) => ({ ...current, confidenceThreshold: Number(event.target.value) }))} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" /></label><label className="text-sm font-medium">Maximum response tokens<input type="number" min="32" max="500" value={config.maxResponseTokens} onChange={(event) => setConfig((current) => ({ ...current, maxResponseTokens: Number(event.target.value) }))} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" /></label><label className="text-sm font-medium">Response delay (ms)<input type="number" min="0" max="10000" step="500" value={config.responseDelayMs} onChange={(event) => setConfig((current) => ({ ...current, responseDelayMs: Number(event.target.value) }))} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" /></label></div>
      <div className="grid gap-5 lg:grid-cols-2"><section><h2 className="flex items-center gap-2 font-semibold"><Bot className="h-4 w-4 text-accent" />Allowed groups</h2><p className="mt-1 text-xs text-muted">Leave empty only for draft review. Select exactly one group before enabling live mode.</p><div className="mt-3 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border p-2">{groups.length === 0 ? <p className="p-2 text-sm text-muted">No routed groups yet.</p> : groups.map((group) => <label key={group.id} className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-slate-50"><input type="checkbox" checked={selectedGroups.has(group.groupJid)} onChange={() => toggleGroup(group.groupJid)} /><span className="min-w-0"><span className="block truncate text-sm font-medium">{group.subject}</span><span className="block truncate text-xs text-muted">{group.groupJid}</span></span></label>)}</div></section><section><h2 className="font-semibold">Allowed departments</h2><p className="mt-1 text-xs text-muted">Optional additional scope. A selected group must also belong to a selected department when this list is not empty.</p><div className="mt-3 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border p-2">{departments.length === 0 ? <p className="p-2 text-sm text-muted">No active routing departments.</p> : departments.map((department) => <label key={department.id} className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-slate-50"><input type="checkbox" checked={selectedDepartments.has(department.id)} onChange={() => toggleDepartment(department.id)} /><span className="text-sm font-medium">{department.name}</span></label>)}</div></section></div>
      <button type="submit" disabled={saving || loading} className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save RAG controls'}</button></form></div>;
}
