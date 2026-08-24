'use client';

import Link from 'next/link';
import { AlertTriangle, MessageSquare, RefreshCw, Settings, Users } from 'lucide-react';
import { useSession } from '@/components/AuthProvider';

export default function RoutingCrmPage() {
  const { data: session, status } = useSession();
  const user = session?.user;
  const departmentName = user?.routingDepartment?.name || null;

  if (status === 'loading') {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="glass-card p-8 text-center animate-pulse">
          <MessageSquare className="w-8 h-8 mx-auto text-accent mb-3" />
          <p className="text-sm text-muted">Loading Group Inbox…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-[fade-in_0.3s_ease]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Group Inbox</h1>
              <p className="text-sm text-muted mt-0.5">
                {departmentName ? `${departmentName} department queue` : 'WhatsApp department-routing workspace'}
              </p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded-xl text-sm text-muted hover:text-foreground hover:bg-surface-hover transition-all"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="glass-card p-6 md:p-8 max-w-3xl">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-700 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">No routed conversations yet</h2>
            <p className="text-sm text-muted mt-2 leading-6">
              This page is available, but no verified WhatsApp group ticket is present in the current environment. The CRM will display routed conversations here after Evolution API is connected, the webhook is reachable, and a second participant sends a message in a temporary test group.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              {(user?.role === 'ADMIN' || user?.role === 'MANAGER') && (
                <Link href="/settings" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition-colors">
                  <Settings className="w-4 h-4" /> Configure Team Routing
                </Link>
              )}
              <Link href="/staff-portal" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-surface-hover transition-colors">
                <Users className="w-4 h-4" /> Open Staff Portal
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {['Sales', 'Accounts', 'Logistics'].map((department) => (
          <div key={department} className="glass-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted">{department}</p>
            <p className="text-sm font-medium text-foreground mt-2">Awaiting routed messages</p>
            <p className="text-xs text-muted mt-1">No test ticket loaded</p>
          </div>
        ))}
      </div>
    </div>
  );
}
