'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, Clock3, RefreshCw, UserRoundX } from 'lucide-react';

function number(value) { return Number(value || 0); }

export default function RoutingOperationsPage() {
  const [data, setData] = useState(null);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/evolution/metrics', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to load routing operations');
      setData(body.data);
      setNotice('');
    } catch (error) { setNotice(error.message || 'Unable to load routing operations'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const inquiry = data?.inquiries || {};
  const response = data?.response || {};
  const campaigns = data?.campaigns || {};
  const cards = [
    ['Total group inquiries', number(inquiry.total), BarChart3, 'text-blue-700'],
    ['Open / unassigned', `${number(inquiry.open)} / ${number(inquiry.unassigned)}`, UserRoundX, 'text-amber-700'],
    ['Overdue follow-ups', number(inquiry.overdueFollowUps), Clock3, 'text-rose-700'],
    ['Conversion rate', `${number(inquiry.conversionRate)}%`, CheckCircle2, 'text-emerald-700'],
  ];
  return <div className="space-y-5 p-1">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-foreground">Routing Operations</h1><p className="mt-1 text-sm text-muted">Evolution group inquiry, follow-up, response, and dealer broadcast performance.</p></div><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-foreground hover:bg-surface-hover"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button></div>
    {notice && <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><AlertTriangle className="h-4 w-4" />{notice}</div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value, Icon, color]) => <div key={label} className="rounded-xl border border-border bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><p className="text-xs font-medium text-muted">{label}</p><Icon className={`h-4 w-4 ${color}`} /></div><p className="mt-2 text-2xl font-bold text-foreground">{loading ? '—' : value}</p></div>)}</div>
    <div className="grid gap-4 lg:grid-cols-2"><section className="rounded-xl border border-border bg-white p-5"><h2 className="font-semibold text-foreground">Lifecycle breakdown</h2><div className="mt-4 space-y-2">{Object.entries(inquiry.byStage || {}).length === 0 ? <p className="text-sm text-muted">No group inquiries in this date range.</p> : Object.entries(inquiry.byStage || {}).map(([stage, count]) => <div key={stage} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="font-medium text-foreground">{stage.replaceAll('_', ' ')}</span><span className="font-bold text-foreground">{count}</span></div>)}</div></section><section className="rounded-xl border border-border bg-white p-5"><h2 className="font-semibold text-foreground">Response & dealer broadcast performance</h2><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted">Median first reply</dt><dd className="mt-1 font-bold text-foreground">{response.medianFirstResponseMinutes == null ? '—' : `${response.medianFirstResponseMinutes} min`}</dd></div><div><dt className="text-muted">P95 first reply</dt><dd className="mt-1 font-bold text-foreground">{response.p95FirstResponseMinutes == null ? '—' : `${response.p95FirstResponseMinutes} min`}</dd></div><div><dt className="text-muted">Campaign delivered</dt><dd className="mt-1 font-bold text-foreground">{number(campaigns.delivered)} / {number(campaigns.sent)}</dd></div><div><dt className="text-muted">Campaign response rate</dt><dd className="mt-1 font-bold text-foreground">{number(campaigns.responseRate)}%</dd></div></dl></section></div>
    <section className="rounded-xl border border-border bg-white p-5"><h2 className="font-semibold text-foreground">Automatic safety controls</h2><p className="mt-1 text-sm text-muted">These safeguards run in the deployment and webhook path; no staff action is needed.</p><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><div className="rounded-lg bg-emerald-50 p-3"><p className="text-sm font-semibold text-emerald-900">Tiles-only deployment</p><p className="mt-1 text-xs text-emerald-800">Startup refuses a non-tiles vertical when production safety is enabled.</p></div><div className="rounded-lg bg-sky-50 p-3"><p className="text-sm font-semibold text-sky-900">Isolated CRM runtime</p><p className="mt-1 text-xs text-sky-800">Tiles Compose uses its own database, Redis and host ports.</p></div><div className="rounded-lg bg-violet-50 p-3"><p className="text-sm font-semibold text-violet-900">Webhook filtering</p><p className="mt-1 text-xs text-violet-800">Only group events are accepted; outbound and duplicate events cannot open tickets.</p></div><div className="rounded-lg bg-amber-50 p-3"><p className="text-sm font-semibold text-amber-900">Safe media & ordering</p><p className="mt-1 text-xs text-amber-800">Inbound media is limited to 25 MB and each group is processed serially.</p></div></div></section>
  </div>;
}
