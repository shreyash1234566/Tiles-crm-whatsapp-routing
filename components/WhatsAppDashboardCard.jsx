'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Clock3,
  MessageSquare,
  RefreshCw,
  UserRoundX,
  Wifi,
  WifiOff,
} from 'lucide-react';

function number(value) {
  return Number(value || 0);
}

function connectionLabel(connection) {
  const state = String(connection?.state || '').toLowerCase();
  if (state === 'open' || state === 'connected') return 'WhatsApp connected';
  if (state === 'not_configured' || connection?.configured === false) return 'Evolution not configured';
  if (state === 'unreachable' || state === 'error') return 'Evolution unavailable';
  return 'WhatsApp not connected';
}

function isConnected(connection) {
  const state = String(connection?.state || '').toLowerCase();
  return state === 'open' || state === 'connected';
}

export default function WhatsAppDashboardCard() {
  const [data, setData] = useState({ metrics: null, health: null, connection: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [metricsResponse, healthResponse, connectionResponse] = await Promise.all([
        fetch('/api/evolution/metrics', { cache: 'no-store' }),
        fetch('/api/evolution/health', { cache: 'no-store' }),
        fetch('/api/evolution/connection', { cache: 'no-store' }),
      ]);
      const [metricsBody, healthBody, connectionBody] = await Promise.all([
        metricsResponse.json().catch(() => ({})),
        healthResponse.json().catch(() => ({})),
        connectionResponse.json().catch(() => ({})),
      ]);
      if (!metricsResponse.ok) throw new Error(metricsBody.error || 'WhatsApp metrics are unavailable');
      setData({
        metrics: metricsBody.data || null,
        // Health is restricted to managers/admins; metrics and connection remain
        // useful to staff even when this endpoint returns 403.
        health: healthResponse.ok ? healthBody.data || null : null,
        connection: connectionResponse.ok ? connectionBody : { state: 'unreachable', configured: true },
      });
      setError('');
    } catch (loadError) {
      setError(loadError?.message || 'WhatsApp metrics are unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    const refreshTimer = window.setInterval(() => void load(), 60_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(refreshTimer);
    };
  }, [load]);

  const inquiry = data.metrics?.inquiries || {};
  const response = data.metrics?.response || {};
  const health = data.health;
  const connection = data.connection;
  const stageEntries = Object.entries(inquiry.byStage || {}).sort(([, a], [, b]) => number(b) - number(a)).slice(0, 3);
  const statusText = connectionLabel(connection);
  const connected = isConnected(connection);

  return (
    <section className="glass-card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-[#25D366]/10 p-2.5 text-[#128C7E]"><MessageSquare className="h-5 w-5" /></div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">WhatsApp conversations</h2>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${connected ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700'}`}>
                {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {statusText}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">Evolution group-routing performance for the last 30 days.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-border p-2 text-muted transition hover:bg-surface-hover disabled:opacity-60" title="Refresh WhatsApp metrics" aria-label="Refresh WhatsApp metrics">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link href="/routing-crm" className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white transition hover:bg-accent/90">
            Open Group Inbox <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-800"><AlertTriangle className="h-4 w-4" />{error}</div>}

      <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-5">
        <div className="bg-white p-3.5"><p className="text-[11px] font-medium text-muted">Group inquiries</p><p className="mt-1 text-xl font-bold text-foreground">{loading && !data.metrics ? '—' : number(inquiry.total)}</p></div>
        <div className="bg-white p-3.5"><div className="flex items-center gap-1 text-[11px] font-medium text-muted"><Clock3 className="h-3 w-3" />Open</div><p className="mt-1 text-xl font-bold text-foreground">{loading && !data.metrics ? '—' : number(inquiry.open)}</p></div>
        <div className="bg-white p-3.5"><div className="flex items-center gap-1 text-[11px] font-medium text-muted"><UserRoundX className="h-3 w-3" />Unassigned</div><p className="mt-1 text-xl font-bold text-amber-700">{loading && !data.metrics ? '—' : number(inquiry.unassigned)}</p></div>
        <div className="bg-white p-3.5"><div className="flex items-center gap-1 text-[11px] font-medium text-muted"><AlertTriangle className="h-3 w-3" />Overdue</div><p className="mt-1 text-xl font-bold text-rose-700">{loading && !data.metrics ? '—' : number(inquiry.overdueSla) + number(inquiry.overdueFollowUps)}</p><p className="text-[10px] text-muted">SLA + follow-ups</p></div>
        <div className="bg-white p-3.5"><p className="text-[11px] font-medium text-muted">Conversion</p><p className="mt-1 text-xl font-bold text-emerald-700">{loading && !data.metrics ? '—' : `${number(inquiry.conversionRate)}%`}</p><p className="text-[10px] text-muted">{response.medianFirstResponseMinutes == null ? 'No reply data yet' : `Median reply ${response.medianFirstResponseMinutes}m`}</p></div>
      </div>

      <div className="grid gap-4 p-4 md:grid-cols-[1fr_auto] md:p-5">
        <div>
          <div className="mb-2 flex items-center gap-1 text-xs font-semibold text-foreground"><BarChart3 className="h-3.5 w-3.5 text-accent" />Top inquiry stages</div>
          {stageEntries.length === 0 ? <p className="text-xs text-muted">No routed group inquiries in this period.</p> : <div className="flex flex-wrap gap-2">{stageEntries.map(([stage, count]) => <span key={stage} className="rounded-lg bg-surface-hover px-2.5 py-1.5 text-xs text-foreground"><strong>{stage.replaceAll('_', ' ')}</strong> · {count}</span>)}</div>}
        </div>
        <div className={`rounded-lg px-3 py-2 text-xs ${health?.alert ? 'bg-amber-50 text-amber-800' : health ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-muted'}`}>
          <p className="font-semibold">Webhook heartbeat</p>
          <p className="mt-0.5">{health?.alert ? `No event in ${health.thresholdMinutes}m threshold` : health?.lastReceivedAt ? `Last event ${new Date(health.lastReceivedAt).toLocaleString()}` : 'Awaiting first event'}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs">
        <span className="text-muted">Need the full breakdown?</span>
        <Link href="/routing-crm/operations" className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">Open Routing Operations <ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>
    </section>
  );
}
