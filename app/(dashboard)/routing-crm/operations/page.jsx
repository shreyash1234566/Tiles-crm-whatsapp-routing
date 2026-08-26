'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, Clock3, RefreshCw, UserRoundX } from 'lucide-react';

function number(value) { return Number(value || 0); }

export default function RoutingOperationsPage() {
  const [data, setData] = useState(null);
  const [health, setHealth] = useState(null);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [response, healthResponse] = await Promise.all([fetch('/api/evolution/metrics', { cache: 'no-store' }), fetch('/api/evolution/health', { cache: 'no-store' })]);
      const [body, healthBody] = await Promise.all([response.json(), healthResponse.json()]);
      if (!response.ok) throw new Error(body.error || 'Unable to load routing operations');
      setData(body.data);
      setHealth(healthResponse.ok ? healthBody.data : null);
      setNotice('');
    } catch (error) { setNotice(error.message || 'Unable to load routing operations'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const inquiry = data?.inquiries || {};
  const response = data?.response || {};
  const campaigns = data?.campaigns || {};
  const routing = data?.routing || {};
  const rag = data?.rag || {};
  const cards = [
    ['Total group inquiries', number(inquiry.total), BarChart3, 'text-blue-700'],
    ['Open / unassigned', `${number(inquiry.open)} / ${number(inquiry.unassigned)}`, UserRoundX, 'text-amber-700'],
    ['Overdue follow-ups', number(inquiry.overdueFollowUps), Clock3, 'text-rose-700'],
    ['Overdue SLA', number(inquiry.overdueSla), AlertTriangle, 'text-rose-700'],
    ['Conversion rate', `${number(inquiry.conversionRate)}%`, CheckCircle2, 'text-emerald-700'],
  ];
  return <div className="space-y-5 p-1">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-foreground">Routing Operations</h1><p className="mt-1 text-sm text-muted">Evolution group inquiry, follow-up, response, and dealer broadcast performance.</p></div><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-foreground hover:bg-surface-hover"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button></div>
    {notice && <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><AlertTriangle className="h-4 w-4" />{notice}</div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{cards.map(([label, value, Icon, color]) => <div key={label} className="rounded-xl border border-border bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><p className="text-xs font-medium text-muted">{label}</p><Icon className={`h-4 w-4 ${color}`} /></div><p className="mt-2 text-2xl font-bold text-foreground">{loading ? '—' : value}</p></div>)}</div>
    <div className="grid gap-4 lg:grid-cols-2"><section className="rounded-xl border border-border bg-white p-5"><h2 className="font-semibold text-foreground">Lifecycle breakdown</h2><div className="mt-4 space-y-2">{Object.entries(inquiry.byStage || {}).length === 0 ? <p className="text-sm text-muted">No group inquiries in this date range.</p> : Object.entries(inquiry.byStage || {}).map(([stage, count]) => <div key={stage} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="font-medium text-foreground">{stage.replaceAll('_', ' ')}</span><span className="font-bold text-foreground">{count}</span></div>)}</div></section><section className="rounded-xl border border-border bg-white p-5"><h2 className="font-semibold text-foreground">Response & dealer broadcast performance</h2><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted">Median first reply</dt><dd className="mt-1 font-bold text-foreground">{response.medianFirstResponseMinutes == null ? '—' : `${response.medianFirstResponseMinutes} min`}</dd></div><div><dt className="text-muted">P95 first reply</dt><dd className="mt-1 font-bold text-foreground">{response.p95FirstResponseMinutes == null ? '—' : `${response.p95FirstResponseMinutes} min`}</dd></div><div><dt className="text-muted">Campaign delivered</dt><dd className="mt-1 font-bold text-foreground">{number(campaigns.delivered)} / {number(campaigns.sent)}</dd></div><div><dt className="text-muted">Campaign response rate</dt><dd className="mt-1 font-bold text-foreground">{number(campaigns.responseRate)}%</dd></div></dl></section></div>
    <div className="grid gap-4 lg:grid-cols-2"><section className="rounded-xl border border-border bg-white p-5"><h2 className="font-semibold text-foreground">Department & automation quality</h2><div className="mt-3 space-y-2">{Object.entries(inquiry.byDepartment || {}).map(([department, count]) => <div key={department} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{department === 'unassigned' ? 'Unassigned' : `Department #${department}`}</span><strong>{count}</strong></div>)}{Object.keys(inquiry.byDepartment || {}).length === 0 && <p className="text-sm text-muted">No department activity in this date range.</p>}</div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted">Routing fallback rate</dt><dd className="mt-1 font-bold">{number(routing.fallbackRate)}%</dd></div><div><dt className="text-muted">Average confidence</dt><dd className="mt-1 font-bold">{routing.averageConfidence == null ? '—' : number(routing.averageConfidence).toFixed(2)}</dd></div><div><dt className="text-muted">RAG handoff rate</dt><dd className="mt-1 font-bold">{number(rag.handoffRate)}%</dd></div><div><dt className="text-muted">RAG failures</dt><dd className="mt-1 font-bold">{number(rag.failures)}</dd></div></dl></section><section className={`rounded-xl border p-5 ${health?.alert ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}><h2 className="font-semibold text-foreground">Evolution webhook heartbeat</h2><p className="mt-1 text-sm text-muted">{health?.lastReceivedAt ? `Last event ${new Date(health.lastReceivedAt).toLocaleString()}` : 'No webhook has been received yet.'}</p><p className="mt-3 text-sm font-semibold">{health?.alert ? `Attention: no webhook within the ${health.thresholdMinutes}-minute threshold.` : 'Healthy: webhook activity is within the configured threshold.'}</p>{health?.lastError && <p className="mt-2 break-words text-xs text-rose-800">Last processing error: {health.lastError}</p>}<p className="mt-3 text-xs text-muted">Correlation: {health?.lastCorrelationId || '—'} · Event: {health?.lastEvent || '—'}</p></section></div>
    <section className="rounded-xl border border-border bg-white p-5"><h2 className="font-semibold text-foreground">Automatic safety controls</h2><p className="mt-1 text-sm text-muted">These safeguards run in the deployment and webhook path; no staff action is needed.</p><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><div className="rounded-lg bg-emerald-50 p-3"><p className="text-sm font-semibold text-emerald-900">Tiles-only deployment</p><p className="mt-1 text-xs text-emerald-800">Startup refuses a non-tiles vertical and furniture-named database.</p></div><div className="rounded-lg bg-sky-50 p-3"><p className="text-sm font-semibold text-sky-900">Isolated CRM runtime</p><p className="mt-1 text-xs text-sky-800">Tiles Compose uses its own database, Redis and host ports.</p></div><div className="rounded-lg bg-violet-50 p-3"><p className="text-sm font-semibold text-violet-900">Webhook filtering</p><p className="mt-1 text-xs text-violet-800">Only group events are accepted; outbound and duplicate events cannot open tickets.</p></div><div className="rounded-lg bg-amber-50 p-3"><p className="text-sm font-semibold text-amber-900">Safe media & ordering</p><p className="mt-1 text-xs text-amber-800">Inbound media is limited to 25 MB and each group is processed serially.</p></div></div></section>
  </div>;
}
