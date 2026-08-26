/* eslint-disable @next/next/no-img-element */
'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BarChart3, Check, ChevronLeft, Circle, Link2, Loader2, MessageSquare, Paperclip, RefreshCw, Send, UserCheck, Wifi, WifiOff, X } from 'lucide-react';
import { useSession } from '@/components/AuthProvider';
import { useSearchParams } from 'next/navigation';
import { useRealtime } from '@/hooks/use-realtime';

function formatTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function qrImage(value) {
  if (typeof value !== 'string' || !value) return null;
  if (value.startsWith('data:image')) return value;
  if (/^[A-Za-z0-9+/=\s]+$/.test(value) && value.length > 100) return `data:image/png;base64,${value.replace(/\s/g, '')}`;
  return null;
}

function mediaKind(message) {
  const value = String(message?.messageType || '').toLowerCase();
  if (value.includes('image')) return 'image';
  if (value.includes('audio')) return 'audio';
  if (value.includes('video')) return 'video';
  if (value.includes('document')) return 'document';
  return null;
}

function MediaAttachment({ message }) {
  const type = mediaKind(message);
  if (!type || !message.mediaUrl) return null;
  if (type === 'image') return <a href={message.mediaUrl} target="_blank" rel="noreferrer"><img src={message.mediaUrl} alt="WhatsApp attachment" className="mb-2 max-h-72 max-w-full rounded-lg object-contain" /></a>;
  if (type === 'audio') return <audio controls preload="metadata" className="mb-2 max-w-full" src={message.mediaUrl}>Your browser cannot play this audio file.</audio>;
  if (type === 'video') return <video controls preload="metadata" className="mb-2 max-h-72 max-w-full rounded-lg" src={message.mediaUrl}>Your browser cannot play this video.</video>;
  return <a href={message.mediaUrl} target="_blank" rel="noreferrer" className="mb-2 flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-accent hover:underline">Download document</a>;
}

function RoutingCrmContent() {
  const { data: session, status } = useSession();
  const user = session?.user;
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [connection, setConnection] = useState({ configured: null, state: 'loading' });
  const [qr, setQr] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [groups, setGroups] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [agentRuns, setAgentRuns] = useState([]);
  const [followUpMessage, setFollowUpMessage] = useState('');
  const [followUpFor, setFollowUpFor] = useState('');
  const [schedulingFollowUp, setSchedulingFollowUp] = useState(false);
  const [nextStage, setNextStage] = useState('');
  const [stageReason, setStageReason] = useState('');
  const [updatingStage, setUpdatingStage] = useState(false);
  const [convertingOrder, setConvertingOrder] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [departments, setDepartments] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [transferDeptId, setTransferDeptId] = useState('');
  const [transferring, setTransferring] = useState(false);
  const searchParams = useSearchParams();
  const initialGroupId = searchParams ? searchParams.get('group_id') : null;
  const fileInputRef = useRef(null);

  const activeGroup = useMemo(() => groups.find((group) => group.id === activeGroupId) || null, [groups, activeGroupId]);
  const reactionsByMessage = useMemo(() => reactions.reduce((index, reaction) => {
    const current = index[reaction.targetMessageId] || [];
    current.push(reaction);
    index[reaction.targetMessageId] = current;
    return index;
  }, {}), [reactions]);
  const claimedByCurrentUser = Boolean(activeGroup && Number(activeGroup.claimedByUserId) === Number(user?.id));

  const loadConnection = useCallback(async () => {
    try {
      const response = await fetch('/api/evolution/connection', { cache: 'no-store' });
      const data = await response.json();
      setConnection(data);
    } catch {
      setConnection({ configured: true, state: 'unreachable' });
    }
  }, []);

  const loadGroups = useCallback(async () => {
    try {
      const response = await fetch('/api/evolution/groups', { cache: 'no-store' });
      if (!response.ok) throw new Error('Unable to load groups');
      const body = await response.json();
      setGroups(body.data || []);

      setActiveGroupId((current) => {
        const urlId = initialGroupId || null;
        if (urlId && body.data?.some(g => g.id === urlId)) return urlId;
        return current && (body.data || []).some((group) => group.id === current) ? current : (body.data?.[0]?.id || null);
      });
    } catch (error) {
      setNotice(error.message || 'Unable to load groups');
    } finally {
      setLoadingGroups(false);
    }
  }, [initialGroupId]);

  const loadMetrics = useCallback(async () => {
    try {
      const response = await fetch('/api/evolution/metrics', { cache: 'no-store' });
      if (!response.ok) return;
      const body = await response.json();
      setMetrics(body.data || null);
    } catch {
      // The inbox remains usable if reporting is temporarily unavailable.
    }
  }, []);

  const loadMessages = useCallback(async (groupId) => {
    if (!groupId) {
      setMessages([]);
      setReactions([]);
      setAgentRuns([]);
      return;
    }
    setLoadingMessages(true);
    try {
      const [response, agentResponse] = await Promise.all([
        fetch(`/api/evolution/messages?group_id=${encodeURIComponent(groupId)}`, { cache: 'no-store' }),
        fetch(`/api/evolution/groups/${encodeURIComponent(groupId)}/agent-runs`, { cache: 'no-store' }),
      ]);
      if (!response.ok) throw new Error('Unable to load messages');
      const body = await response.json();
      setMessages(body.data || []);
      setReactions(body.reactions || []);
      if (agentResponse.ok) {
        const agentBody = await agentResponse.json();
        setAgentRuns(agentBody.data || []);
      } else {
        setAgentRuns([]);
      }
      setGroups((current) => current.map((group) => group.id === groupId ? { ...group, unreadCount: 0 } : group));
    } catch (error) {
      setNotice(error.message || 'Unable to load messages');
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // The polling below remains as a recovery path, but normal group activity
  // now refreshes the assigned staff dashboard as soon as Redis/Socket.io
  // delivers the webhook event.
  const refreshFromRealtime = useCallback(() => {
    void loadGroups();
    if (activeGroupId) void loadMessages(activeGroupId);
  }, [activeGroupId, loadGroups, loadMessages]);

  useRealtime({
    channelName: 'evolution-group-routing',
    enabled: status === 'authenticated',
    onMessageEvent: refreshFromRealtime,
    onRoutingEvent: refreshFromRealtime,
  });

  useEffect(() => {
    if (status !== 'authenticated') return;

    const initialLoad = window.setTimeout(() => {
      void loadGroups();
      void loadMetrics();
      void loadConnection();
    }, 0);

    const timer = setInterval(() => {
      void loadGroups();
      void loadMetrics();
      void loadConnection();
    }, 30000);
    return () => {
      window.clearTimeout(initialLoad);
      clearInterval(timer);
    };
  }, [status, loadGroups, loadMetrics, loadConnection]);

  useEffect(() => {
    const load = window.setTimeout(() => { void loadMessages(activeGroupId); }, 0);
    return () => window.clearTimeout(load);
  }, [activeGroupId, loadMessages]);

  async function configureWebhook() {
    setNotice('');
    try {
      const response = await fetch('/api/evolution/webhook/configure', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to configure webhook');
      setNotice(`Webhook registered at ${data.webhookUrl}`);
    } catch (error) {
      setNotice(error.message || 'Unable to configure webhook');
    }
  }

  async function connectWhatsApp() {
    setQrLoading(true);
    setNotice('');
    try {
      const response = await fetch('/api/evolution/connection', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to request QR code');
      const value = data.qr;
      const image = qrImage(value?.base64 || value?.qr || value?.code || value);
      setQr(image ? { image } : { code: value?.code || value?.pairingCode || String(value || 'QR returned without image') });
      await loadConnection();
    } catch (error) {
      setNotice(error.message || 'Evolution API is unavailable');
    } finally {
      setQrLoading(false);
    }
  }


  useEffect(() => {
    if (isAdmin && status === 'authenticated') {
      fetch('/api/routing/users').then((r) => r.json()).then(data => {
        if (data.departments) setDepartments(data.departments);
      }).catch(console.error);
    }
  }, [isAdmin, status]);

  async function transferGroup() {
    if (!activeGroup || !transferDeptId || transferring) return;
    setTransferring(true);
    setNotice('');
    try {
      const response = await fetch(`/api/evolution/groups/${activeGroup.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'transfer', departmentId: Number(transferDeptId) })
      });
      const body = await response.json();
      if (!response.ok) {
        setNotice(body.error || 'Unable to transfer group');
        return;
      }
      setGroups((current) => current.map((group) => group.id === activeGroup.id ? body.data : group));
      setTransferDeptId('');
    } catch (err) {
      setNotice('Error transferring group');
    } finally {
      setTransferring(false);
    }
  }

  async function claimGroup(action = 'claim') {
    if (!activeGroup) return;
    const response = await fetch(`/api/evolution/groups/${activeGroup.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    const body = await response.json();
    if (!response.ok) {
      setNotice(body.error || 'Unable to update claim');
      return;
    }
    setGroups((current) => current.map((group) => group.id === activeGroup.id ? body.data : group));
  }

  async function scheduleFollowUp() {
    if (!activeGroup || !followUpMessage.trim() || !followUpFor || schedulingFollowUp) return;
    setSchedulingFollowUp(true);
    setNotice('');
    try {
      const response = await fetch(`/api/evolution/groups/${activeGroup.id}/follow-ups`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: followUpMessage.trim(), scheduledFor: new Date(followUpFor).toISOString(), idempotencyKey: `${activeGroup.id}:${followUpFor}:${followUpMessage.trim()}` }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to schedule follow-up');
      setFollowUpMessage('');
      setFollowUpFor('');
      setNotice(body.warning || 'Follow-up scheduled.');
      void loadGroups();
    } catch (error) {
      setNotice(error.message || 'Unable to schedule follow-up');
    } finally {
      setSchedulingFollowUp(false);
    }
  }

  async function updateStage() {
    const stage = nextStage || activeGroup?.ticket?.stage;
    if (!activeGroup || !stage || !stageReason.trim() || updatingStage) return;
    setUpdatingStage(true);
    setNotice('');
    try {
      const response = await fetch(`/api/evolution/groups/${activeGroup.id}/stage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, reason: stageReason.trim(), expectedVersion: activeGroup.ticket?.version }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to update ticket stage');
      setStageReason('');
      setNextStage('');
      setNotice(`Ticket moved to ${stage}.`);
      void loadGroups();
    } catch (error) {
      setNotice(error.message || 'Unable to update ticket stage');
    } finally {
      setUpdatingStage(false);
    }
  }

  async function convertToDealerOrder() {
    if (!activeGroup || convertingOrder) return;
    setConvertingOrder(true);
    setNotice('');
    try {
      const response = await fetch(`/api/evolution/groups/${activeGroup.id}/convert`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: 'Created from Group Inbox' }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to create dealer order');
      setNotice(`Dealer order ${body.data.order.displayId} created. Add material lines, billing and dispatch from Dealers & Partners.`);
      await loadGroups();
    } catch (error) {
      setNotice(error.message || 'Unable to create dealer order');
    } finally {
      setConvertingOrder(false);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if ((!text && !attachment) || !activeGroup || sending) return;
    setSending(true);
    setNotice('');
    try {
      const form = new FormData();
      form.set('group_id', activeGroup.id);
      form.set('text', text);
      if (attachment) form.set('file', attachment);
      const response = await fetch('/api/evolution/messages', { method: 'POST', body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to send message');
      setMessages((current) => [...current, body.data.message]);
      setGroups((current) => current.map((group) => group.id === activeGroup.id ? body.data.group : group));
      setDraft('');
      setAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      setNotice(error.message || 'Unable to send message');
    } finally {
      setSending(false);
    }
  }

  if (status === 'loading') return <div className="min-h-[70vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;

  const connected = String(connection.state).toLowerCase() === 'open' || String(connection.state).toLowerCase() === 'connected';

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[620px] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#25D366]/10"><MessageSquare className="h-5 w-5 text-[#128C7E]" /></div>
          <div><h1 className="text-lg font-bold text-foreground">Group Inbox</h1><p className="text-xs text-muted">{user?.routingDepartment?.name ? `${user.routingDepartment.name} department queue` : 'WhatsApp department-routing workspace'}</p></div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${connected ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700'}`}>
            {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />} {connected ? 'WhatsApp connected' : connection.state === 'not_configured' ? 'Evolution not configured' : 'WhatsApp not connected'}
          </span>
          <button type="button" onClick={() => { void loadGroups(); void loadMetrics(); void loadConnection(); }} className="rounded-lg border border-border p-2 text-muted hover:bg-surface-hover" title="Refresh"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </div>

      {notice && <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-5 py-2 text-xs text-amber-800"><AlertTriangle className="h-4 w-4" />{notice}</div>}

      {metrics && <div className="grid shrink-0 grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-5">
        <div className="bg-white px-4 py-2.5"><div className="flex items-center gap-1 text-[11px] font-medium text-muted"><BarChart3 className="h-3.5 w-3.5" />Group inquiries</div><p className="mt-0.5 text-sm font-bold text-foreground">{metrics.inquiries?.total || 0}</p></div>
        <div className="bg-white px-4 py-2.5"><p className="text-[11px] font-medium text-muted">Open / unassigned</p><p className="mt-0.5 text-sm font-bold text-foreground">{metrics.inquiries?.open || 0} <span className="font-normal text-muted">/ {metrics.inquiries?.unassigned || 0}</span></p></div>
        <div className="bg-white px-4 py-2.5"><p className="text-[11px] font-medium text-muted">Overdue follow-ups</p><p className="mt-0.5 text-sm font-bold text-amber-700">{metrics.inquiries?.overdueFollowUps || 0}</p></div>
        <div className="bg-white px-4 py-2.5"><p className="text-[11px] font-medium text-muted">Median first reply</p><p className="mt-0.5 text-sm font-bold text-foreground">{metrics.response?.medianFirstResponseMinutes == null ? '—' : `${metrics.response.medianFirstResponseMinutes}m`}</p></div>
        <div className="bg-white px-4 py-2.5"><p className="text-[11px] font-medium text-muted">Inquiry conversion</p><p className="mt-0.5 text-sm font-bold text-foreground">{metrics.inquiries?.conversionRate || 0}%</p></div>
      </div>}

      {!connected && isAdmin && <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-accent/20 bg-accent/5 px-5 py-3"><div><p className="text-sm font-semibold text-foreground">Connect the WhatsApp sender</p><p className="text-xs text-muted">Request a QR from Evolution, then scan it on WhatsApp → Linked devices.</p></div><div className="flex items-center gap-2"><button type="button" onClick={connectWhatsApp} disabled={qrLoading} className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{qrLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Show QR</button><button type="button" onClick={configureWebhook} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground">Register webhook</button><Link href="/settings" className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground">Configure</Link></div></div>}

      {qr && !connected && <div className="flex shrink-0 items-center gap-5 border-b border-border bg-white px-5 py-4">{qr.image ? <img src={qr.image} alt="Evolution WhatsApp pairing QR code" className="h-44 w-44 rounded-lg border border-border p-2" /> : <pre className="max-w-md whitespace-pre-wrap rounded-lg bg-slate-100 p-3 text-xs">{qr.code}</pre>}<div className="text-sm text-muted"><p className="font-semibold text-foreground">Scan this code from the sender phone</p><p className="mt-1">Open WhatsApp, choose Linked devices, then Link a device. Keep this page open until the status changes to connected.</p></div></div>}

      <div className="flex min-h-0 flex-1">
        <aside className={`w-full shrink-0 border-r border-border bg-slate-50/60 md:w-[320px] ${activeGroup ? 'hidden md:flex' : 'flex'} flex-col`}>
          <div className="flex items-center justify-between border-b border-border px-4 py-3"><div><p className="text-sm font-semibold text-foreground">Department groups</p><p className="text-xs text-muted">{groups.length} routed conversation{groups.length === 1 ? '' : 's'}</p></div><Circle className="h-3 w-3 fill-emerald-500 text-emerald-500" /></div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loadingGroups ? <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-accent" /></div> : groups.length === 0 ? <div className="p-6 text-center text-sm text-muted"><MessageSquare className="mx-auto mb-3 h-8 w-8 opacity-40" /><p>No routed groups yet.</p><p className="mt-1 text-xs">Connect Evolution and let a second participant send a message in a test group.</p></div> : groups.map((group) => <button key={group.id} type="button" onClick={() => setActiveGroupId(group.id)} className={`mb-1 w-full rounded-xl p-3 text-left transition ${activeGroupId === group.id ? 'bg-accent/10 ring-1 ring-accent/30' : 'hover:bg-surface-hover'}`}><div className="flex items-start justify-between gap-2"><span className="truncate text-sm font-semibold text-foreground">{group.subject}</span>{group.mentionPriority && <span className="rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">MENTION</span>}</div><div className="mt-1 flex items-center justify-between gap-2"><span className="text-xs text-muted">{group.departmentName || 'Admin review'} · {(group.routeType || 'DEFAULT').replace('_', ' ')}</span>{group.unreadCount > 0 && <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">{group.unreadCount}</span>}</div><p className="mt-1 truncate text-xs text-muted">{group.lastMessageText === '[reactionMessage]' ? 'Reaction updated' : (group.lastMessageText || 'No messages yet')} <span className="ml-1">{formatTime(group.lastMessageAt)}</span></p></button>)}
          </div>
        </aside>

        <main className={`min-w-0 flex-1 ${activeGroup ? 'flex' : 'hidden md:flex'} flex-col bg-white`}>
          {!activeGroup ? (
            <div className="flex h-full items-center justify-center p-8 text-center text-muted"><div><MessageSquare className="mx-auto mb-3 h-10 w-10 opacity-30" /><p className="font-semibold text-foreground">Select a group to open the conversation</p><p className="mt-1 text-sm">Department tickets will appear here after Evolution sends a group event.</p></div></div>
          ) : (
            <>
              <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <button type="button" onClick={() => setActiveGroupId(null)} className="rounded-lg p-1.5 text-muted hover:bg-surface-hover md:hidden"><ChevronLeft className="h-5 w-5" /></button>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-bold text-foreground">{activeGroup.subject}</h2>
                    <p className="text-xs text-muted">{activeGroup.departmentName || 'Admin review'} · {activeGroup.ticket?.stage || 'NEW'} · {(activeGroup.routeType || 'DEFAULT').replace('_', ' ')}{activeGroup.confidence ? ` · ${Math.round(activeGroup.confidence * 100)}% confidence` : ''} · {activeGroup.groupJid}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <div className="flex items-center gap-1 mr-2 hidden md:flex">
                      <select
                        value={transferDeptId}
                        onChange={(e) => setTransferDeptId(e.target.value)}
                        className="text-xs rounded-md border border-border px-2 py-1 outline-none bg-slate-50"
                      >
                        <option value="">Transfer to...</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                      <button
                        type="button"
                        onClick={transferGroup}
                        disabled={!transferDeptId || transferring}
                        className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-slate-200 disabled:opacity-50"
                      >
                        Transfer
                      </button>
                    </div>
                  )}
                  <span className="hidden text-xs text-muted sm:inline">{activeGroup.claimedByUserId ? 'Claimed' : 'Unclaimed'}</span>
                  <button type="button" onClick={() => { void claimGroup(claimedByCurrentUser ? 'release' : 'claim'); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-hover"><UserCheck className="h-3.5 w-3.5" />{claimedByCurrentUser ? 'Release' : 'Claim'}</button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto bg-[#efeae2] p-4">
                <div className="mx-auto max-w-3xl space-y-2">
                  {loadingMessages ? (
                    <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-accent" /></div>
                  ) : messages.length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted">No messages in this group yet.</div>
                  ) : (
                    messages.map((message) => (
                      <div key={message.id} className={`flex ${message.fromMe ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[82%] rounded-xl px-3 py-2 shadow-sm ${message.fromMe ? 'bg-[#d9fdd3]' : 'bg-white'}`}>
                          <div className="mb-1 flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-foreground">{message.fromMe ? 'You' : (message.senderName || message.senderJid)}</span>
                            {message.mentionedJids?.length > 0 && <span className="text-[10px] font-bold text-rose-700">Mentioned</span>}
                          </div>
                          <MediaAttachment message={message} />
                          {message.text ? (
                            <p className="whitespace-pre-wrap break-words text-sm text-foreground">{message.text}</p>
                          ) : !message.mediaUrl && (
                            <p className="whitespace-pre-wrap break-words text-sm text-foreground">[{message.messageType}]</p>
                          )}
                          {reactionsByMessage[message.messageId]?.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {reactionsByMessage[message.messageId].map((reaction) => <span key={reaction.id} title={reaction.senderName || reaction.senderJid} className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs leading-none">{reaction.emoji}</span>)}
                            </div>
                          )}
                          <p className="mt-1 text-right text-[10px] text-muted">{formatTime(message.createdAt)} {message.fromMe && <Check className="ml-1 inline h-3 w-3" />}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              {agentRuns.filter((run) => run.status === 'DRAFTED' && run.responseText).slice(0, 1).map((run) => (
                <div key={run.id} className="shrink-0 border-t border-violet-200 bg-violet-50 px-4 py-2.5">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-violet-900">Grounded RAG draft — review before sending</p><p className="mt-1 max-w-3xl whitespace-pre-wrap text-xs text-violet-800">{run.responseText}</p><p className="mt-1 text-[10px] text-violet-700">{run.retrievalIds?.length || 0} knowledge reference{run.retrievalIds?.length === 1 ? '' : 's'} · {formatTime(run.createdAt)}</p></div><button type="button" onClick={() => setDraft(String(run.responseText || '').replace(/\n\n\[Knowledge refs:.*$/s, ''))} className="shrink-0 rounded-lg border border-violet-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-100">Use draft</button></div>
                </div>
              ))}
              <details className="shrink-0 border-t border-border bg-slate-50 px-4 py-2">
                <summary className="cursor-pointer text-xs font-semibold text-foreground">Ticket operations</summary>
                <div className="mt-2 grid gap-2 lg:grid-cols-3">
                  <div className="rounded-lg border border-border bg-white p-2"><p className="mb-1 text-[11px] font-medium text-muted">Schedule a WhatsApp follow-up</p><textarea value={followUpMessage} onChange={(event) => setFollowUpMessage(event.target.value)} rows={2} placeholder="Follow-up message" className="mb-1 w-full resize-none rounded border border-border px-2 py-1 text-xs outline-none focus:border-accent" /><div className="flex gap-1"><input value={followUpFor} onChange={(event) => setFollowUpFor(event.target.value)} type="datetime-local" className="min-w-0 flex-1 rounded border border-border px-2 py-1 text-xs" /><button type="button" onClick={scheduleFollowUp} disabled={schedulingFollowUp || !followUpMessage.trim() || !followUpFor} className="rounded bg-accent px-2 py-1 text-xs font-semibold text-white disabled:opacity-50">Schedule</button></div></div>
                  <div className="rounded-lg border border-border bg-white p-2"><p className="mb-1 text-[11px] font-medium text-muted">Move inquiry lifecycle</p><div className="flex gap-1"><select value={nextStage || activeGroup.ticket?.stage || 'NEW'} onChange={(event) => setNextStage(event.target.value)} className="min-w-0 flex-1 rounded border border-border px-2 py-1 text-xs"><option value="NEW">New</option><option value="TRIAGED">Triaged</option><option value="WORKING">Working</option><option value="QUOTATION">Quotation</option><option value="WAITING_FOR_DEALER">Waiting for dealer</option><option value="CONFIRMED">Confirmed</option><option value="PAYMENT_PENDING">Payment pending</option><option value="ALLOCATED">Allocated</option><option value="DISPATCH_PENDING">Dispatch pending</option><option value="DISPATCHED">Dispatched</option><option value="DELIVERED">Delivered</option><option value="CLOSED">Closed</option><option value="ON_HOLD">On hold</option><option value="ESCALATED">Escalated</option><option value="LOST">Lost</option><option value="CANCELLED">Cancelled</option></select><button type="button" onClick={updateStage} disabled={updatingStage || !stageReason.trim()} className="rounded bg-slate-800 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50">Update</button></div><input value={stageReason} onChange={(event) => setStageReason(event.target.value)} placeholder="Reason for this stage change" className="mt-1 w-full rounded border border-border px-2 py-1 text-xs outline-none focus:border-accent" /></div>
                  <div className="rounded-lg border border-border bg-white p-2"><p className="mb-1 text-[11px] font-medium text-muted">Move inquiry lifecycle</p><div className="flex gap-1"><select value={nextStage || activeGroup.ticket?.stage || 'NEW'} onChange={(event) => setNextStage(event.target.value)} className="min-w-0 flex-1 rounded border border-border px-2 py-1 text-xs"><option value="NEW">New</option><option value="TRIAGED">Triaged</option><option value="WORKING">Working</option><option value="QUOTATION">Quotation</option><option value="WAITING_FOR_DEALER">Waiting for dealer</option><option value="CONFIRMED">Confirmed</option><option value="PAYMENT_PENDING">Payment pending</option><option value="ALLOCATED">Allocated</option><option value="DISPATCH_PENDING">Dispatch pending</option><option value="DISPATCHED">Dispatched</option><option value="DELIVERED">Delivered</option><option value="CLOSED">Closed</option><option value="ON_HOLD">On hold</option><option value="ESCALATED">Escalated</option><option value="LOST">Lost</option><option value="CANCELLED">Cancelled</option></select><button type="button" onClick={updateStage} disabled={updatingStage || !stageReason.trim()} className="rounded bg-slate-800 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50">Update</button></div><input value={stageReason} onChange={(event) => setStageReason(event.target.value)} placeholder="Reason for this stage change" className="mt-1 w-full rounded border border-border px-2 py-1 text-xs outline-none focus:border-accent" /></div>
                  <div className="rounded-lg border border-border bg-white p-2"><p className="mb-1 text-[11px] font-medium text-muted">Convert to dealer order</p>{activeGroup.inquiry?.convertedOrderId ? <p className="text-xs text-emerald-700">Linked order #{activeGroup.inquiry.convertedOrderId}. Manage items, billing and dispatch in Dealers &amp; Partners.</p> : <><p className="mb-2 text-xs text-muted">Requires a linked dealer. Creates an auditable B2B order without inventing material lines.</p><button type="button" onClick={convertToDealerOrder} disabled={convertingOrder || !activeGroup.inquiry?.dealerId} className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50">{convertingOrder ? 'Creating…' : 'Create dealer order'}</button></>}</div>
                </div>
              </details>
              <form onSubmit={sendMessage} className="shrink-0 border-t border-border bg-white p-3">
                {attachment && (
                  <div className="mb-2 flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-xs text-foreground">
                    <span className="truncate">Attached: {attachment.name}</span>
                    <button type="button" onClick={() => { setAttachment(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="ml-2 rounded p-1 hover:bg-slate-200" aria-label="Remove attachment"><X className="h-4 w-4" /></button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <input ref={fileInputRef} type="file" className="hidden" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip" onChange={(event) => { const file = event.target.files?.[0]; if (file) setAttachment(file); }} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg p-2 text-muted hover:bg-surface-hover" title="Attach image, document, audio, or video"><Paperclip className="h-5 w-5" /></button>
                  <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(event); } }} rows={1} placeholder="Type a reply or attach a file…" className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-border bg-slate-50 px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent" />
                  <button type="submit" disabled={sending || (!draft.trim() && !attachment)} className="rounded-xl bg-accent p-3 text-white disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" /></button>
                </div>
              </form>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default function RoutingCrmPage() {
  return (
    <Suspense fallback={<div className="min-h-[70vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>}>
      <RoutingCrmContent />
    </Suspense>
  );
}
