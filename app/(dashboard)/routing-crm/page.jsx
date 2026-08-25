'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronLeft, Circle, Link2, Loader2, MessageSquare, Paperclip, RefreshCw, Send, UserCheck, Wifi, WifiOff, X } from 'lucide-react';
import { useSession } from '@/components/AuthProvider';
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

export default function RoutingCrmPage() {
  const { data: session, status } = useSession();
  const user = session?.user;
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [connection, setConnection] = useState({ configured: null, state: 'loading' });
  const [qr, setQr] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [groups, setGroups] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const fileInputRef = useRef(null);

  const activeGroup = useMemo(() => groups.find((group) => group.id === activeGroupId) || null, [groups, activeGroupId]);
  const claimedByCurrentUser = Boolean(activeGroup && Number(activeGroup.claimedByUserId) === Number(user?.id));

  const loadConnection = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const response = await fetch('/api/evolution/connection', { cache: 'no-store' });
      const data = await response.json();
      setConnection(data);
    } catch {
      setConnection({ configured: true, state: 'unreachable' });
    }
  }, [isAdmin]);

  const loadGroups = useCallback(async () => {
    try {
      const response = await fetch('/api/evolution/groups', { cache: 'no-store' });
      if (!response.ok) throw new Error('Unable to load groups');
      const body = await response.json();
      setGroups(body.data || []);
      setActiveGroupId((current) => current && (body.data || []).some((group) => group.id === current) ? current : (body.data?.[0]?.id || null));
    } catch (error) {
      setNotice(error.message || 'Unable to load groups');
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  const loadMessages = useCallback(async (groupId) => {
    if (!groupId) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    try {
      const response = await fetch(`/api/evolution/messages?group_id=${encodeURIComponent(groupId)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Unable to load messages');
      const body = await response.json();
      setMessages(body.data || []);
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
  });

  useEffect(() => {
    if (status !== 'authenticated') return;
    void loadGroups();
    void loadConnection();
    const timer = setInterval(() => {
      void loadGroups();
      void loadConnection();
    }, 30000);
    return () => clearInterval(timer);
  }, [status, loadGroups, loadConnection]);

  useEffect(() => {
    void loadMessages(activeGroupId);
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
          <button type="button" onClick={() => { void loadGroups(); void loadConnection(); }} className="rounded-lg border border-border p-2 text-muted hover:bg-surface-hover" title="Refresh"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </div>

      {notice && <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-5 py-2 text-xs text-amber-800"><AlertTriangle className="h-4 w-4" />{notice}</div>}

      {!connected && isAdmin && <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-accent/20 bg-accent/5 px-5 py-3"><div><p className="text-sm font-semibold text-foreground">Connect the WhatsApp sender</p><p className="text-xs text-muted">Request a QR from Evolution, then scan it on WhatsApp → Linked devices.</p></div><div className="flex items-center gap-2"><button type="button" onClick={connectWhatsApp} disabled={qrLoading} className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{qrLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Show QR</button><button type="button" onClick={configureWebhook} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground">Register webhook</button><Link href="/settings" className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground">Configure</Link></div></div>}

      {qr && !connected && <div className="flex shrink-0 items-center gap-5 border-b border-border bg-white px-5 py-4">{qr.image ? <img src={qr.image} alt="Evolution WhatsApp pairing QR code" className="h-44 w-44 rounded-lg border border-border p-2" /> : <pre className="max-w-md whitespace-pre-wrap rounded-lg bg-slate-100 p-3 text-xs">{qr.code}</pre>}<div className="text-sm text-muted"><p className="font-semibold text-foreground">Scan this code from the sender phone</p><p className="mt-1">Open WhatsApp, choose Linked devices, then Link a device. Keep this page open until the status changes to connected.</p></div></div>}

      <div className="flex min-h-0 flex-1">
        <aside className={`w-full shrink-0 border-r border-border bg-slate-50/60 md:w-[320px] ${activeGroup ? 'hidden md:flex' : 'flex'} flex-col`}>
          <div className="flex items-center justify-between border-b border-border px-4 py-3"><div><p className="text-sm font-semibold text-foreground">Department groups</p><p className="text-xs text-muted">{groups.length} routed conversation{groups.length === 1 ? '' : 's'}</p></div><Circle className="h-3 w-3 fill-emerald-500 text-emerald-500" /></div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loadingGroups ? <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-accent" /></div> : groups.length === 0 ? <div className="p-6 text-center text-sm text-muted"><MessageSquare className="mx-auto mb-3 h-8 w-8 opacity-40" /><p>No routed groups yet.</p><p className="mt-1 text-xs">Connect Evolution and let a second participant send a message in a test group.</p></div> : groups.map((group) => <button key={group.id} type="button" onClick={() => setActiveGroupId(group.id)} className={`mb-1 w-full rounded-xl p-3 text-left transition ${activeGroupId === group.id ? 'bg-accent/10 ring-1 ring-accent/30' : 'hover:bg-surface-hover'}`}><div className="flex items-start justify-between gap-2"><span className="truncate text-sm font-semibold text-foreground">{group.subject}</span>{group.mentionPriority && <span className="rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">MENTION</span>}</div><div className="mt-1 flex items-center justify-between gap-2"><span className="text-xs text-muted">{group.departmentName || 'Admin review'} · {(group.routeType || 'DEFAULT').replace('_', ' ')}</span>{group.unreadCount > 0 && <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">{group.unreadCount}</span>}</div><p className="mt-1 truncate text-xs text-muted">{group.lastMessageText || 'No messages yet'} <span className="ml-1">{formatTime(group.lastMessageAt)}</span></p></button>)}
          </div>
        </aside>

        <main className={`min-w-0 flex-1 ${activeGroup ? 'flex' : 'hidden md:flex'} flex-col bg-white`}>
          {!activeGroup ? <div className="flex h-full items-center justify-center p-8 text-center text-muted"><div><MessageSquare className="mx-auto mb-3 h-10 w-10 opacity-30" /><p className="font-semibold text-foreground">Select a group to open the conversation</p><p className="mt-1 text-sm">Department tickets will appear here after Evolution sends a group event.</p></div></div> : <>
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3"><div className="flex min-w-0 items-center gap-3"><button type="button" onClick={() => setActiveGroupId(null)} className="rounded-lg p-1.5 text-muted hover:bg-surface-hover md:hidden"><ChevronLeft className="h-5 w-5" /></button><div className="min-w-0"><h2 className="truncate text-sm font-bold text-foreground">{activeGroup.subject}</h2><p className="text-xs text-muted">{activeGroup.departmentName || 'Admin review'} · {(activeGroup.routeType || 'DEFAULT').replace('_', ' ')}{activeGroup.confidence ? ` · ${Math.round(activeGroup.confidence * 100)}% confidence` : ''} · {activeGroup.groupJid}</p></div></div><div className="flex items-center gap-2"><span className="hidden text-xs text-muted sm:inline">{activeGroup.claimedByUserId ? 'Claimed' : 'Unclaimed'}</span><button type="button" onClick={() => { void claimGroup(claimedByCurrentUser ? 'release' : 'claim'); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-hover"><UserCheck className="h-3.5 w-3.5" />{claimedByCurrentUser ? 'Release' : 'Claim'}</button></div></div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#efeae2] p-4"><div className="mx-auto max-w-3xl space-y-2">{loadingMessages ? <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-accent" /></div> : messages.length === 0 ? <div className="py-12 text-center text-sm text-muted">No messages in this group yet.</div> : messages.map((message) => <div key={message.id} className={`flex ${message.fromMe ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[82%] rounded-xl px-3 py-2 shadow-sm ${message.fromMe ? 'bg-[#d9fdd3]' : 'bg-white'}`}><div className="mb-1 flex items-center gap-2"><span className="text-[11px] font-semibold text-foreground">{message.fromMe ? 'You' : (message.senderName || message.senderJid)}</span>{message.mentionedJids?.length > 0 && <span className="text-[10px] font-bold text-rose-700">Mentioned</span>}</div><MediaAttachment message={message} />{message.text ? <p className="whitespace-pre-wrap break-words text-sm text-foreground">{message.text}</p> : !message.mediaUrl && <p className="whitespace-pre-wrap break-words text-sm text-foreground">[{message.messageType}]</p>}<p className="mt-1 text-right text-[10px] text-muted">{formatTime(message.createdAt)} {message.fromMe && <Check className="ml-1 inline h-3 w-3" />}</p></div></div>)}</div></div>
            <form onSubmit={sendMessage} className="shrink-0 border-t border-border bg-white p-3">{attachment && <div className="mb-2 flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-xs text-foreground"><span className="truncate">Attached: {attachment.name}</span><button type="button" onClick={() => { setAttachment(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="ml-2 rounded p-1 hover:bg-slate-200" aria-label="Remove attachment"><X className="h-4 w-4" /></button></div>}<div className="flex items-end gap-2"><input ref={fileInputRef} type="file" className="hidden" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip" onChange={(event) => { const file = event.target.files?.[0]; if (file) setAttachment(file); }} /><button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg p-2 text-muted hover:bg-surface-hover" title="Attach image, document, audio, or video"><Paperclip className="h-5 w-5" /></button><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(event); } }} rows={1} placeholder="Type a reply or attach a file…" className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-border bg-slate-50 px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent" /><button type="submit" disabled={sending || (!draft.trim() && !attachment)} className="rounded-xl bg-accent p-3 text-white disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" /></button></div></form>
          </>}
        </main>
      </div>
    </div>
  );
}
