'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Building2, CalendarDays,
  CheckCircle2, ChevronRight, ClipboardList, CreditCard, FileText, MapPin, Package,
  Phone, Plus, RefreshCw, Search, ShieldAlert, Store, Users, WalletCards, X,
} from 'lucide-react'
import Modal from '@/components/Modal'
import { useAlertToast } from '@/components/AlertToastProvider'
import { useSession } from '@/components/AuthProvider'
import { getProducts } from '@/app/actions/products'
import {
  assignDealer, createDealer, createDealerClaim, createDealerOrder, createDealerPriceList,
  createDealerTask, createDealerVisit, getDealer, getDealerDashboard, getDealerPriceLists,
  getDealers, getDealerStaff, recordDealerPayment, toggleDealerPriceList, updateDealerClaim,
  saveDealerTeam, updateDealer, updateDealerClaimReplacement, updateDealerOrderStatus, updateDealerStatus, updateDealerTask,
} from '@/app/actions/dealers'

const statusOptions = [
  ['PROSPECT', 'New Prospect'], ['CONTACTED', 'Contacted'], ['MEETING_SCHEDULED', 'Meeting Scheduled'],
  ['CATALOGUE_SHARED', 'Catalogue Shared'], ['PRICE_LIST_SHARED', 'Price List Shared'], ['TRIAL_ORDER', 'Trial Order'],
  ['ACTIVE', 'Active'], ['DORMANT', 'Dormant'], ['NOT_INTERESTED', 'Not Interested'], ['LOST', 'Lost'],
]
const orderStatuses = [
  ['ENQUIRY', 'Enquiry'], ['QUOTATION_SHARED', 'Quotation Shared'], ['ORDER_RECEIVED', 'Order Received'],
  ['APPROVAL_PENDING', 'Approval Pending'], ['APPROVED', 'Approved'], ['ALLOCATED', 'Stock Allocated'],
  ['DISPATCHED', 'Dispatched'], ['DELIVERED', 'Delivered'], ['CANCELLED', 'Cancelled'], ['RETURNED', 'Returned'],
]
const nextOrderStatuses = {
  ENQUIRY: ['QUOTATION_SHARED', 'CANCELLED'], QUOTATION_SHARED: ['ORDER_RECEIVED', 'APPROVAL_PENDING', 'CANCELLED'],
  ORDER_RECEIVED: ['APPROVAL_PENDING', 'CANCELLED'], APPROVAL_PENDING: ['APPROVED', 'CANCELLED'],
  APPROVED: ['ALLOCATED', 'CANCELLED'], ALLOCATED: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED', 'RETURNED'], DELIVERED: ['RETURNED'], CANCELLED: [], RETURNED: [],
}
const collectableOrderStatuses = ['ORDER_RECEIVED', 'APPROVAL_PENDING', 'APPROVED', 'ALLOCATED', 'DISPATCHED', 'DELIVERED']
const taskTypes = [['CALL', 'Call'], ['VISIT', 'Visit'], ['CATALOGUE', 'Catalogue sharing'], ['SAMPLE', 'Share samples'], ['PRICE_LIST', 'Price list'], ['PAYMENT_COLLECTION', 'Payment collection'], ['REPEAT_ORDER', 'Repeat order'], ['COMPLAINT', 'Complaint'], ['OTHER', 'Other']]
const lostReasonOptions = ['Price high', 'Existing supplier commitment', 'Margin low', 'Credit terms not acceptable', 'Product range mismatch', 'Delivery issue', 'Quality concern', 'No current requirement', 'Competitor offer', 'Follow-up not received', 'Other']
const dealerTeamRoles = [['OWNER', 'Dealer owner'], ['SALESPERSON', 'Salesperson'], ['REGIONAL_MANAGER', 'Regional manager'], ['COLLECTION_EXECUTIVE', 'Collection executive'], ['SUPPORT_PERSON', 'Support person']]
const cardClass = 'rounded-2xl border border-border bg-surface shadow-sm'

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`
const dateLabel = (value) => value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const dateTimeLabel = (value) => value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
const statusLabel = (value) => statusOptions.find(([key]) => key === value)?.[1] || value || '—'
const orderStatusLabel = (value) => orderStatuses.find(([key]) => key === value)?.[1] || value || '—'
const csvValues = (value) => String(value || '').split(',').map(item => item.trim()).filter(Boolean)

function Field({ label, children, className = '' }) {
  return <label className={`block ${className}`}><span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>{children}</label>
}

function Input({ className = '', ...props }) {
  return <input {...props} className={`w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15 ${className}`} />
}

function Select({ className = '', children, ...props }) {
  return <select {...props} className={`w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15 ${className}`}>{children}</select>
}

function Textarea({ className = '', ...props }) {
  return <textarea {...props} className={`w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15 ${className}`} />
}

function Button({ children, variant = 'primary', className = '', ...props }) {
  const variants = {
    primary: 'bg-accent text-white hover:bg-accent/90',
    secondary: 'border border-border bg-surface text-foreground hover:bg-surface-hover',
    ghost: 'text-muted hover:bg-surface-hover hover:text-foreground',
    danger: 'bg-danger-light text-danger hover:bg-danger/10',
  }
  return <button {...props} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}>{children}</button>
}

function StatusPill({ status }) {
  const positive = ['ACTIVE', 'APPROVED', 'DELIVERED', 'COMPLETED', 'RESOLVED']
  const warning = ['TRIAL_ORDER', 'APPROVAL_PENDING', 'IN_PROGRESS', 'UNDER_REVIEW', 'DISPATCHED', 'ALLOCATED']
  const negative = ['LOST', 'NOT_INTERESTED', 'CANCELLED', 'RETURNED']
  const tone = positive.includes(status) ? 'bg-success-light text-success' : negative.includes(status) ? 'bg-danger-light text-danger' : warning.includes(status) ? 'bg-warning-light text-warning' : 'bg-info-light text-info'
  const dealerLabel = statusLabel(status)
  const orderLabel = orderStatusLabel(status)
  const label = dealerLabel !== status ? dealerLabel : orderLabel !== status ? orderLabel : String(status || '—').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase())
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{label}</span>
}

function StatCard({ icon: Icon, label, value, hint, tone = 'text-accent' }) {
  return <div className={`${cardClass} p-4 md:p-5`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-muted">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>{hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}</div><div className={`rounded-xl bg-surface-hover p-2.5 ${tone}`}><Icon className="h-5 w-5" /></div></div></div>
}

function StaffPerformancePanel({ rows }) {
  if (!rows.length) return null
  return <section className={`${cardClass} overflow-hidden`}><div className="border-b border-border p-4"><h2 className="font-semibold text-foreground">Dealer team workload &amp; performance</h2><p className="mt-1 text-xs text-muted">Dealer ownership, pending follow-ups, activations and dealer-order value by staff.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead className="bg-surface-hover text-left text-xs text-muted"><tr><th className="px-4 py-3 font-medium">Staff</th><th className="px-4 py-3 font-medium">Owned / team dealers</th><th className="px-4 py-3 font-medium">Active dealers</th><th className="px-4 py-3 font-medium">Pending follow-ups</th><th className="px-4 py-3 text-right font-medium">Dealer order value</th></tr></thead><tbody className="divide-y divide-border">{rows.map(row => <tr key={row.id}><td className="px-4 py-3"><p className="font-medium text-foreground">{row.name}</p><p className="text-xs text-muted">{row.role}</p></td><td className="px-4 py-3 text-muted">{row.ownedDealers} / {row.teamDealers}</td><td className="px-4 py-3 text-success">{row.activeDealers}</td><td className="px-4 py-3 text-warning">{row.pendingFollowUps}</td><td className="px-4 py-3 text-right font-semibold text-foreground">{money(row.orderValue)}</td></tr>)}</tbody></table></div></section>
}

export default function DealersPage() {
  const { notify } = useAlertToast()
  const { data: session } = useSession()
  const canManage = session?.user?.role === 'ADMIN' || session?.user?.role === 'MANAGER'
  const [dashboard, setDashboard] = useState(null)
  const [dealers, setDealers] = useState([])
  const [staff, setStaff] = useState([])
  const [products, setProducts] = useState([])
  const [priceLists, setPriceLists] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [tab, setTab] = useState('overview')
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)

  const loadDetail = useCallback(async (id) => {
    setDetailLoading(true)
    try {
      const res = await getDealer(id)
      if (!res.success) throw new Error(res.error || 'Could not load this dealer')
      setSelected(res.data)
    } catch (loadError) {
      setError(loadError?.message || 'Could not load this dealer')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const load = useCallback(async (keepSelected = true) => {
    setLoading(true)
    setError('')
    try {
      const [dashRes, dealerRes, staffRes, productRes, listRes] = await Promise.all([
        getDealerDashboard(), getDealers({ status: statusFilter === 'ALL' ? undefined : statusFilter, search }), getDealerStaff(), getProducts(), getDealerPriceLists(),
      ])
      const failed = [dashRes, dealerRes, staffRes, productRes, listRes].find(result => !result?.success)
      if (failed) throw new Error(failed.error || 'Could not load dealer workspace')

      setDashboard(dashRes.data)
      setDealers(dealerRes.data)
      if (keepSelected && selected?.id && dealerRes.data.some(dealer => dealer.id === selected.id)) await loadDetail(selected.id)
      else if (!selected && dealerRes.data[0]) await loadDetail(dealerRes.data[0].id)
      else if (selected && !dealerRes.data.some(dealer => dealer.id === selected.id)) setSelected(null)
      setStaff(staffRes.data)
      setProducts(productRes.data)
      setPriceLists(listRes.data)
    } catch (loadError) {
      setError(loadError?.message || 'Could not load dealer workspace')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, selected, loadDetail])

  useEffect(() => {
    const timer = setTimeout(() => load(false), 0)
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const timer = setTimeout(() => { if (!loading) load(false) }, 250)
    return () => clearTimeout(timer)
  }, [search, statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredDealers = useMemo(() => dealers, [dealers])
  const closeModal = () => { if (!saving) setModal(null) }
  const refresh = async () => { await load(true) }

  const submit = async (action, payload, successMessage) => {
    setSaving(true)
    try {
      const res = await action(payload)
      if (!res.success) notify(res.error || 'Could not save this change', { variant: 'danger' })
      else { notify(successMessage, { variant: 'success' }); setModal(null); await refresh() }
      return res
    } catch (error) {
      notify(error?.message || 'Could not save this change', { variant: 'danger' })
      return { success: false }
    } finally { setSaving(false) }
  }

  const handleStatus = async (value) => {
    if (!selected) return
    if (value === 'LOST' || value === 'NOT_INTERESTED') {
      setModal({ type: 'lostReason', status: value })
      return
    }
    const res = await updateDealerStatus(selected.id, value)
    if (res.success) { notify('Dealer status updated', { variant: 'success' }); await refresh() } else notify(res.error, { variant: 'danger' })
  }

  const handleAssignment = async (event) => {
    const value = event.target.value ? Number(event.target.value) : null
    const res = await assignDealer(selected.id, value)
    if (res.success) { notify('Dealer assignment updated', { variant: 'success' }); await refresh() } else notify(res.error, { variant: 'danger' })
  }

  if (loading && !dashboard && !error) return <div className="space-y-5 animate-pulse"><div className="h-10 w-72 rounded-xl bg-surface" /><div className="grid gap-4 md:grid-cols-4">{[1, 2, 3, 4].map(item => <div key={item} className="h-32 rounded-2xl bg-surface" />)}</div><div className="h-[520px] rounded-2xl bg-surface" /></div>

  if (error && !dashboard) return <section className={`${cardClass} mx-auto max-w-2xl p-6`}><div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" /><div><h1 className="font-semibold text-foreground">Dealers &amp; Partners is unavailable</h1><p className="mt-1 text-sm text-muted">{error}</p><Button className="mt-4" onClick={refresh}><RefreshCw className="h-4 w-4" />Retry</Button></div></div></section>

  return <div className="space-y-5 pb-8">
    <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Channel partners</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Dealers &amp; Partners</h1><p className="mt-1 max-w-2xl text-sm text-muted">Manage dealer relationships, staff ownership, orders, credit, visits and after-sales claims in one place.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={refresh}><RefreshCw className="h-4 w-4" />Refresh</Button>{canManage && <Button onClick={() => setModal('dealer')}><Plus className="h-4 w-4" />Add dealer</Button>}</div>
    </header>

    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-light px-4 py-3 text-sm text-danger"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span><button className="ml-auto font-medium underline" onClick={refresh}>Retry</button></div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={Users} label="Total partners" value={dashboard?.total || 0} hint={`${dashboard?.active || 0} active accounts`} />
      <StatCard icon={ArrowUpRight} label="Open order value" value={money(dashboard?.orderValue)} hint="Cancelled/returned excluded" tone="text-success" />
      <StatCard icon={WalletCards} label="Outstanding" value={money(dashboard?.outstanding)} hint={`${dashboard?.overdueInvoices || 0} overdue · ${money(dashboard?.overdueAmount)}`} tone="text-warning" />
      <StatCard icon={ClipboardList} label="Work to follow up" value={(dashboard?.openTasks || 0) + (dashboard?.openClaims || 0)} hint={`${dashboard?.openTasks || 0} tasks · ${dashboard?.openClaims || 0} claims`} tone="text-purple" />
    </div>

    {canManage && <StaffPerformancePanel rows={dashboard?.staffPerformance || []} />}

    <div className="grid gap-5 xl:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
      <section className={`${cardClass} min-h-[560px] overflow-hidden`}>
        <div className="border-b border-border p-4"><div className="flex items-center justify-between"><div><h2 className="font-semibold text-foreground">Partner pipeline</h2><p className="mt-0.5 text-xs text-muted">{filteredDealers.length} records visible</p></div><Building2 className="h-5 w-5 text-muted" /></div><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px]"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search business, person, city" className="pl-9" /></div><Select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="ALL">All statuses</option>{statusOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></div></div>
        <div className="max-h-[720px] overflow-y-auto p-2">{filteredDealers.map(dealer => <button key={dealer.id} onClick={() => { loadDetail(dealer.id); setTab('overview') }} className={`w-full rounded-xl p-3 text-left transition ${selected?.id === dealer.id ? 'bg-accent/10 ring-1 ring-accent/30' : 'hover:bg-surface-hover'}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{dealer.businessName}</p><p className="mt-0.5 truncate text-xs text-muted">{dealer.contactPerson} · {dealer.city || 'Territory not set'}</p></div><ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted" /></div><div className="mt-2 flex items-center justify-between gap-2"><StatusPill status={dealer.status} /><span className="text-xs text-muted">{dealer.orderCount} orders</span></div><div className="mt-2 flex justify-between text-xs"><span className="text-muted">Outstanding</span><span className={dealer.outstanding > 0 ? 'font-semibold text-warning' : 'text-muted'}>{money(dealer.outstanding)}</span></div></button>)}{filteredDealers.length === 0 && <div className="px-4 py-16 text-center"><Store className="mx-auto h-8 w-8 text-muted" /><p className="mt-3 text-sm font-medium text-foreground">No dealers found</p><p className="mt-1 text-xs text-muted">Try another search or add your first channel partner.</p></div>}</div>
      </section>

      <section className={`${cardClass} min-h-[560px] overflow-hidden`}>
        {!selected ? <div className="flex min-h-[560px] items-center justify-center p-8 text-center"><div><Building2 className="mx-auto h-10 w-10 text-muted" /><p className="mt-3 font-medium text-foreground">Select a dealer to view the workspace</p><p className="mt-1 text-sm text-muted">Profiles, tasks, orders, collections and claims stay connected here.</p></div></div> : <>
          <div className="border-b border-border p-4 md:p-5"><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div className="flex min-w-0 items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent"><Building2 className="h-5 w-5" /></div><div className="min-w-0"><h2 className="truncate text-lg font-semibold text-foreground">{selected.businessName}</h2><p className="mt-0.5 text-sm text-muted">{selected.contactPerson} · {selected.dealerType} · {selected.territory || selected.city || 'Territory not set'}</p><div className="mt-2 flex flex-wrap items-center gap-2"><StatusPill status={selected.status} />{selected.phone && <a className="inline-flex items-center gap-1 text-xs text-accent hover:underline" href={`tel:${selected.phone}`}><Phone className="h-3 w-3" />{selected.phone}</a>}{selected.whatsappNumber && <a className="inline-flex items-center gap-1 text-xs text-success hover:underline" target="_blank" rel="noreferrer" href={`https://wa.me/${String(selected.whatsappNumber).replace(/\D/g, '')}`}><Phone className="h-3 w-3" />WhatsApp</a>}</div></div></div><div className="grid gap-2 sm:grid-cols-2 md:w-[320px]"><Field label="Pipeline status"><Select value={selected.status} onChange={event => handleStatus(event.target.value)}>{statusOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field><Field label="Owner"><Select disabled={!canManage} value={selected.assignedStaffId || ''} onChange={handleAssignment}><option value="">Unassigned</option>{staff.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</Select></Field></div></div><div className="mt-4 flex gap-1 overflow-x-auto border-b border-border pb-px">{[['overview', 'Overview'], ['performance', 'Performance'], ['team', 'Team'], ['orders', 'Orders'], ['tasks', 'Tasks'], ['visits', 'Visits & claims'], ['priceLists', 'Price lists']].map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-semibold transition ${tab === key ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-foreground'}`}>{label}</button>)}</div></div>
          {detailLoading ? <div className="flex min-h-[420px] items-center justify-center text-sm text-muted"><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Loading partner workspace…</div> : <div className="p-4 md:p-5">{tab === 'overview' && <Overview selected={selected} dashboard={dashboard} onEdit={canManage ? () => setModal('editDealer') : null} onOpenOrder={() => setModal('order')} />}{tab === 'performance' && <PerformanceTab selected={selected} />}{tab === 'team' && <TeamTab selected={selected} canManage={canManage} onManage={() => setModal('team')} />}{tab === 'orders' && <OrdersTab selected={selected} onOpenOrder={() => setModal('order')} onOpenPayment={order => { setModal({ type: 'payment', order }) }} onRefresh={refresh} notify={notify} />}{tab === 'tasks' && <TasksTab selected={selected} staff={staff} onOpenTask={() => setModal('task')} onRefresh={refresh} notify={notify} />}{tab === 'visits' && <VisitsClaimsTab selected={selected} staff={staff} onOpenVisit={() => setModal('visit')} onOpenClaim={() => setModal('claim')} onRefresh={refresh} notify={notify} />}{tab === 'priceLists' && <PriceListsTab selected={selected} priceLists={priceLists} products={products} canManage={canManage} onOpenPriceList={() => setModal('priceList')} onRefresh={refresh} notify={notify} />}</div>}
        </>}
      </section>
    </div>

    <Modal isOpen={modal === 'dealer'} onClose={closeModal} title="Add channel partner" size="xl" fullScreenMobile footer={<ModalActions onClose={closeModal} saving={saving} form="dealer-form" />}><DealerForm staff={staff} onSubmit={payload => submit(createDealer, payload, 'Dealer profile created')} /></Modal>
    <Modal isOpen={modal === 'editDealer'} onClose={closeModal} title="Edit dealer profile" size="lg" fullScreenMobile footer={<ModalActions onClose={closeModal} saving={saving} form="dealer-edit-form" />}><DealerEditForm dealer={selected} staff={staff} onSubmit={payload => submit(updateDealer, payload, 'Dealer profile updated')} /></Modal>
    <Modal isOpen={modal === 'team'} onClose={closeModal} title={`Dealer team · ${selected?.businessName || ''}`} size="lg" fullScreenMobile footer={<ModalActions onClose={closeModal} saving={saving} form="dealer-team-form" />}><DealerTeamForm dealer={selected} staff={staff} onSubmit={payload => submit(saveDealerTeam, payload, 'Dealer team updated')} /></Modal>
    <Modal isOpen={modal?.type === 'lostReason'} onClose={closeModal} title={modal?.status === 'LOST' ? 'Close as lost' : 'Mark not interested'} size="sm" fullScreenMobile footer={<ModalActions onClose={closeModal} saving={saving} form="lost-reason-form" />}><LostReasonForm status={modal?.status} onSubmit={payload => submit(({ reason }) => updateDealerStatus(selected.id, modal.status, reason), payload, 'Dealer status updated')} /></Modal>
    <Modal isOpen={modal === 'task'} onClose={closeModal} title={`New task · ${selected?.businessName || ''}`} size="md" fullScreenMobile footer={<ModalActions onClose={closeModal} saving={saving} form="task-form" />}><TaskForm dealerId={selected?.id} staff={staff} onSubmit={payload => submit(createDealerTask, payload, 'Dealer task created')} /></Modal>
    <Modal isOpen={modal === 'visit'} onClose={closeModal} title={`Record dealer visit · ${selected?.businessName || ''}`} size="md" fullScreenMobile footer={<ModalActions onClose={closeModal} saving={saving} form="visit-form" />}><VisitForm dealerId={selected?.id} staff={staff} onSubmit={payload => submit(createDealerVisit, payload, 'Dealer visit recorded')} /></Modal>
    <Modal isOpen={modal === 'claim'} onClose={closeModal} title={`Open claim · ${selected?.businessName || ''}`} size="md" fullScreenMobile footer={<ModalActions onClose={closeModal} saving={saving} form="claim-form" />}><ClaimForm dealerId={selected?.id} staff={staff} orders={selected?.details?.orders || []} onSubmit={payload => submit(createDealerClaim, payload, 'Dealer claim opened')} /></Modal>
    <Modal isOpen={modal === 'order'} onClose={closeModal} title={`New dealer order · ${selected?.businessName || ''}`} size="xl" fullScreenMobile footer={<ModalActions onClose={closeModal} saving={saving} form="order-form" />}><OrderForm dealerId={selected?.id} products={products} priceLists={priceLists} staff={staff} selected={selected} onSubmit={payload => submit(createDealerOrder, payload, 'Dealer order created')} /></Modal>
    <Modal isOpen={modal?.type === 'payment'} onClose={closeModal} title={`Record collection · ${modal?.order?.displayId || ''}`} size="sm" fullScreenMobile footer={<ModalActions onClose={closeModal} saving={saving} form="payment-form" />}><PaymentForm dealerId={selected?.id} order={modal?.order} onSubmit={payload => submit(recordDealerPayment, payload, 'Dealer payment recorded')} /></Modal>
    <Modal isOpen={modal === 'priceList'} onClose={closeModal} title="Create dealer price list" size="lg" fullScreenMobile footer={<ModalActions onClose={closeModal} saving={saving} form="price-list-form" />}><PriceListForm dealerId={selected?.id} products={products} onSubmit={payload => submit(createDealerPriceList, payload, 'Dealer price list created')} /></Modal>
  </div>
}

function ModalActions({ onClose, saving, form }) { return <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form={form} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></div> }

function Overview({ selected, onEdit, onOpenOrder }) {
  const details = selected.details || {}
  const activities = details.activities || []
  const payments = details.payments || []
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl bg-surface-hover p-3"><p className="text-xs text-muted">Order value</p><p className="mt-1 text-lg font-semibold text-foreground">{money(selected.totalOrderValue)}</p></div>
      <div className="rounded-xl bg-surface-hover p-3"><p className="text-xs text-muted">Outstanding</p><p className="mt-1 text-lg font-semibold text-warning">{money(selected.outstanding)}</p></div>
      <div className="rounded-xl bg-surface-hover p-3"><p className="text-xs text-muted">Credit terms</p><p className="mt-1 text-lg font-semibold text-foreground">{selected.creditDays ? `${selected.creditDays} days` : 'Advance / COD'}</p></div>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <div className={`${cardClass} p-4`}>
        <div className="flex items-center justify-between"><h3 className="font-semibold text-foreground">Business profile</h3>{onEdit && <Button variant="ghost" onClick={onEdit} className="min-h-8 px-2 text-xs">Edit profile</Button>}</div>
        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2"><Info label="GSTIN" value={selected.gstNumber} /><Info label="WhatsApp" value={selected.whatsappNumber} /><Info label="Email" value={selected.email} /><Info label="Territory" value={selected.territory} /><Info label="Preferred products" value={(selected.preferredCategories || []).join(', ')} /><Info label="Monthly potential" value={money(selected.estimatedMonthlyBusiness)} /><Info label="Payment terms" value={selected.paymentTerms || (selected.creditDays ? `${selected.creditDays} days credit` : 'Advance / COD')} /><Info label="Price tier" value={`${selected.priceTier}${selected.defaultDiscountPercent ? ` · ${selected.defaultDiscountPercent}% default discount` : ''}`} /><Info label="Next follow-up" value={dateLabel(selected.nextFollowUpAt)} /><Info label="Address" value={[selected.address, selected.city, selected.state, selected.pincode].filter(Boolean).join(', ')} wide /></dl>
      </div>
      <div className={`${cardClass} p-4`}>
        <div className="flex items-center justify-between"><h3 className="font-semibold text-foreground">Recent activity</h3><Activity className="h-4 w-4 text-muted" /></div>
        {activities.length ? <div className="mt-3 space-y-3">{activities.slice(0, 6).map(activity => <div key={activity.id} className="flex gap-2.5"><div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" /><div><p className="text-sm text-foreground">{activity.title}</p><p className="mt-0.5 text-xs text-muted">{dateTimeLabel(activity.createdAt)}{activity.description ? ` · ${activity.description}` : ''}</p></div></div>)}</div> : <Empty text="No activity recorded yet." />}
      </div>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <div className={`${cardClass} p-4`}><div className="flex items-center justify-between"><h3 className="font-semibold text-foreground">Quick order view</h3><Button onClick={onOpenOrder} className="min-h-8 px-2.5 text-xs"><Plus className="h-3.5 w-3.5" />New order</Button></div>{(details.orders || []).slice(0, 4).map(order => <OrderRow key={order.id} order={order} compact />)}{!details.orders?.length && <Empty text="No dealer orders yet. Start with an enquiry or trial order." />}</div>
      <div className={`${cardClass} p-4`}><div className="flex items-center justify-between"><h3 className="font-semibold text-foreground">Recent collections</h3><WalletCards className="h-4 w-4 text-muted" /></div>{payments.length ? <div className="mt-3 space-y-2">{payments.slice(0, 5).map(payment => <div key={payment.id} className="flex items-center justify-between gap-3 text-sm"><div><p className="font-medium text-foreground">{payment.dealerOrder?.displayId || 'Account payment'}</p><p className="text-xs text-muted">{payment.method} · {dateLabel(payment.paymentDate)}</p></div><span className="font-semibold text-success">{money(payment.amount)}</span></div>)}</div> : <Empty text="No collections recorded yet." />}</div>
    </div>
  </div>
}

function PerformanceTab({ selected }) {
  const performance = selected.performance || {}
  const categories = performance.categorySales || []
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard icon={Package} label="Total orders" value={performance.totalOrders || 0} hint={`Last order ${dateLabel(performance.lastOrderDate)}`} /><StatCard icon={WalletCards} label="Paid amount" value={money(performance.paidAmount)} hint={`Outstanding ${money(performance.outstanding)}`} tone="text-success" /><StatCard icon={ArrowUpRight} label="This month" value={money(performance.monthlySales)} hint={performance.target ? `${performance.targetAchievementPercent || 0}% of target` : 'No monthly target set'} tone="text-accent" /><StatCard icon={AlertTriangle} label="Overdue" value={money(performance.overdueAmount)} hint={`${performance.overdueCount || 0} overdue orders`} tone="text-warning" /></div><div className="grid gap-4 lg:grid-cols-2"><div className={`${cardClass} p-4`}><h3 className="font-semibold text-foreground">Dealer health</h3><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><Info label="Performance tier" value={(selected.performanceTier || 'UNCLASSIFIED').replaceAll('_', ' ')} /><Info label="Average order value" value={money(performance.averageOrderValue)} /><Info label="Repeat frequency" value={`${performance.repeatOrderFrequency || 0} orders / month`} /><Info label="Target vs achievement" value={performance.target ? `${money(performance.monthlySales)} / ${money(performance.target)}` : 'Target not set'} /></dl></div><div className={`${cardClass} p-4`}><h3 className="font-semibold text-foreground">Product category sales</h3>{categories.length ? <div className="mt-3 space-y-2">{categories.map(row => <div key={row.category} className="flex items-center justify-between gap-3 text-sm"><span className="truncate text-muted">{row.category}</span><strong className="text-foreground">{money(row.value)}</strong></div>)}</div> : <Empty text="Category sales appear after committed dealer orders." />}</div></div></div>
}

function TeamTab({ selected, canManage, onManage }) {
  const assignments = selected.details?.teamAssignments || []
  return <div className="space-y-4"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-foreground">Dealer account team</h3><p className="mt-1 text-xs text-muted">Set clear ownership for sales, collections, regional follow-up and support.</p></div>{canManage && <Button onClick={onManage} className="min-h-8 px-2.5 text-xs"><Users className="h-3.5 w-3.5" />Manage team</Button>}</div>{assignments.length ? <div className={`${cardClass} divide-y divide-border overflow-hidden`}>{assignments.map(assignment => <div key={assignment.id} className="flex items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold text-foreground">{assignment.staff?.name}</p><p className="mt-0.5 text-xs text-muted">{assignment.staff?.role || 'Staff'} · {assignment.staff?.phone || 'No phone'}</p></div><span className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent">{assignment.role.replaceAll('_', ' ')}</span></div>)}</div> : <div className={`${cardClass} p-4`}><Empty text="No team roles saved yet. Assign staff roles so follow-up and collections do not get missed." /></div>}</div>
}

function Info({ label, value, wide }) { return <div className={wide ? 'sm:col-span-2' : ''}><dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt><dd className="mt-0.5 break-words text-sm text-foreground">{value || '—'}</dd></div> }
function Empty({ text }) { return <p className="py-8 text-center text-sm text-muted">{text}</p> }

function OrderRow({ order, compact = false, onPayment }) { const canCollect = collectableOrderStatuses.includes(order.status); const isOverdue = order.balanceDue > 0 && order.paymentDueDate && new Date(order.paymentDueDate) < new Date(); return <div className="flex flex-col gap-2 border-b border-border py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-sm font-semibold text-foreground">{order.displayId}</p><p className="mt-0.5 truncate text-xs text-muted">{(order.items || []).map(item => item.name).join(', ') || 'Dealer order'} · {dateLabel(order.orderDate)}</p>{!compact && <p className="mt-1 text-[11px] text-muted">Margin {money(order.marginAmount)} ({Number(order.marginPercent || 0).toFixed(1)}%) · {order.paymentDueDate ? `Payment due ${dateLabel(order.paymentDueDate)}` : 'Payment due as per terms'}{isOverdue ? ' · Overdue' : ''}</p>}</div><div className="flex items-center justify-between gap-3 sm:justify-end"><div className="text-left sm:text-right"><p className="text-sm font-semibold text-foreground">{money(order.total)}</p><p className={`text-[11px] ${isOverdue ? 'font-semibold text-danger' : 'text-muted'}`}>Due {money(order.balanceDue)}</p></div><StatusPill status={order.status} />{!compact && canCollect && order.balanceDue > 0 && <Button variant="secondary" onClick={() => onPayment(order)} className="min-h-8 px-2 text-xs"><CreditCard className="h-3.5 w-3.5" />Collect</Button>}</div></div> }

function OrdersTab({ selected, onOpenOrder, onOpenPayment, onRefresh, notify }) { const orders = selected.details?.orders || []; const [updating, setUpdating] = useState(null); const changeStatus = async (order, value) => { let note = ''; if (value === 'ALLOCATED') { note = window.prompt('Enter the allocated lot, slab, batch or production reference:', order.allocationNotes || '') || ''; if (!note.trim()) { notify('Allocation reference is required before dispatch workflow can continue', { variant: 'danger' }); return } } setUpdating(order.id); const res = await updateDealerOrderStatus(order.id, value, note); if (res.success) { notify('Order status updated', { variant: 'success' }); await onRefresh() } else notify(res.error, { variant: 'danger' }); setUpdating(null) }; return <div className="space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold text-foreground">Dealer order workflow</h3><p className="mt-1 text-xs text-muted">Enquiry → quote → order received → manager approval → allocation → dispatch → delivery.</p></div><Button onClick={onOpenOrder}><Plus className="h-4 w-4" />New order</Button></div>{orders.length ? <div className={`${cardClass} divide-y divide-border overflow-hidden`}>{orders.map(order => <div key={order.id} className="p-4"><OrderRow order={order} onPayment={onOpenPayment} /><div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted">{order.deliveryAddress || 'No delivery address'}{order.expectedDispatchDate ? ` · Expected ${dateLabel(order.expectedDispatchDate)}` : ''}{order.allocationNotes ? ` · Allocation: ${order.allocationNotes}` : ''}</p><Select value={order.status} disabled={updating === order.id} onChange={event => changeStatus(order, event.target.value)} className="w-full sm:w-52"><option value={order.status}>{orderStatusLabel(order.status)}</option>{orderStatuses.filter(([key]) => nextOrderStatuses[order.status]?.includes(key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></div></div>)}</div> : <div className={`${cardClass} p-4`}><Empty text="No dealer orders yet. Create an enquiry, quotation-linked order or trial order." /></div>}</div> }

function TasksTab({ selected, staff, onOpenTask, onRefresh, notify }) { const tasks = selected.details?.tasks || []; const update = async (task, status) => { const res = await updateDealerTask(task.id, status); if (res.success) { notify('Task updated', { variant: 'success' }); await onRefresh() } else notify(res.error, { variant: 'danger' }) }; return <div className="space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold text-foreground">Follow-ups &amp; tasks</h3><p className="mt-1 text-xs text-muted">Every dealer interaction should end with a clear next action.</p></div><Button onClick={onOpenTask}><Plus className="h-4 w-4" />Add task</Button></div>{tasks.length ? <div className={`${cardClass} divide-y divide-border overflow-hidden`}>{tasks.map(task => <div key={task.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"><div className="flex gap-3"><div className="mt-0.5 rounded-xl bg-accent/10 p-2 text-accent"><ClipboardList className="h-4 w-4" /></div><div><p className="text-sm font-semibold text-foreground">{task.title}</p><p className="mt-0.5 text-xs text-muted">{task.type.replaceAll('_', ' ')} · Due {dateLabel(task.dueDate)} · {task.assignedStaff?.name || 'Unassigned'}</p>{task.description && <p className="mt-1 text-xs text-muted">{task.description}</p>}</div></div><div className="flex flex-wrap gap-2"><StatusPill status={task.status} />{task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && <><Button variant="secondary" onClick={() => update(task, task.status === 'PENDING' ? 'IN_PROGRESS' : 'COMPLETED')} className="min-h-8 px-2 text-xs">{task.status === 'PENDING' ? 'Start' : 'Complete'}</Button><Button variant="ghost" onClick={() => update(task, 'CANCELLED')} className="min-h-8 px-2 text-xs">Cancel</Button></>}</div></div>)}</div> : <div className={`${cardClass} p-4`}><Empty text="No tasks yet. Add a follow-up so the relationship does not go cold." /></div>}</div> }

function VisitsClaimsTab({ selected, staff, onOpenVisit, onOpenClaim, onRefresh, notify }) {
  const { data: session } = useSession()
  const canManage = session?.user?.role === 'ADMIN' || session?.user?.role === 'MANAGER'
  const visits = selected.details?.visits || []
  const claims = selected.details?.claims || []
  const updateClaim = async (claim, status) => {
    const resolution = status === 'RESOLVED' ? window.prompt('Resolution note *') || '' : undefined
    if (status === 'RESOLVED' && !resolution.trim()) return
    const res = await updateDealerClaim(claim.id, status, resolution)
    if (res.success) { notify('Claim updated', { variant: 'success' }); await onRefresh() } else notify(res.error, { variant: 'danger' })
  }
  const updateReplacement = async (claim, replacementStatus) => {
    const notes = replacementStatus === 'COMPLETED' ? window.prompt('Replacement / credit completion note *') || '' : undefined
    if (replacementStatus === 'COMPLETED' && !notes.trim()) return
    const res = await updateDealerClaimReplacement(claim.id, replacementStatus, notes)
    if (res.success) { notify('Replacement status updated', { variant: 'success' }); await onRefresh() } else notify(res.error, { variant: 'danger' })
  }
  return <div className="space-y-5"><div className="grid gap-5 lg:grid-cols-2"><div><div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold text-foreground">Visits &amp; meetings</h3><p className="mt-1 text-xs text-muted">Record discussion, samples, feedback and the next action.</p></div><Button onClick={onOpenVisit} className="min-h-8 px-2.5 text-xs"><Plus className="h-3.5 w-3.5" />Visit</Button></div><div className={`${cardClass} divide-y divide-border overflow-hidden`}>{visits.length ? visits.map(visit => <div key={visit.id} className="p-3.5"><div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold text-foreground">{visit.purpose}</p><span className="text-xs text-muted">{dateLabel(visit.visitDate)}</span></div><p className="mt-1 text-xs text-muted">{visit.personMet || 'Person met not recorded'} · {visit.staff?.name || 'Unassigned'}</p>{visit.outcome && <p className="mt-2 text-sm text-foreground">{visit.outcome}</p>}{visit.samplesShown && <p className="mt-2 text-xs text-muted">Samples: {visit.samplesShown}</p>}{visit.priceListShared && <p className="mt-1 text-xs text-success">Price list shared</p>}{visit.dealerFeedback && <p className="mt-2 rounded-lg bg-surface-hover p-2 text-xs text-muted">Feedback: {visit.dealerFeedback}</p>}{visit.nextAction && <p className="mt-2 rounded-lg bg-surface-hover p-2 text-xs text-muted">Next: {visit.nextAction}</p>}{visit.nextMeetingAt && <p className="mt-1 text-xs text-accent">Next meeting: {dateTimeLabel(visit.nextMeetingAt)}</p>}{visit.photoUrls?.length > 0 && <p className="mt-1 text-xs text-accent">{visit.photoUrls.length} photo link(s) attached</p>}{visit.documentUrls?.length > 0 && <p className="mt-1 text-xs text-accent">{visit.documentUrls.length} document link(s) attached</p>}</div>) : <Empty text="No visits recorded." />}</div></div><div><div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold text-foreground">Complaints &amp; claims</h3><p className="mt-1 text-xs text-muted">Open → review → manager approval → replacement / resolution.</p></div><Button onClick={onOpenClaim} className="min-h-8 px-2.5 text-xs"><Plus className="h-3.5 w-3.5" />Claim</Button></div><div className={`${cardClass} divide-y divide-border overflow-hidden`}>{claims.length ? claims.map(claim => <div key={claim.id} className="p-3.5"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold text-foreground">{claim.type.replaceAll('_', ' ')}</p><p className="mt-1 text-xs text-muted">{claim.dealerOrder?.displayId || 'No linked order'} · {money(claim.claimAmount)}</p></div><StatusPill status={claim.status} /></div><p className="mt-2 text-sm text-foreground">{claim.description}</p>{claim.assignedStaff?.name && <p className="mt-1 text-xs text-muted">Owner: {claim.assignedStaff.name}</p>}{claim.replacementStatus && claim.replacementStatus !== 'NOT_REQUIRED' && <p className="mt-1 text-xs text-warning">Replacement: {claim.replacementStatus.replaceAll('_', ' ')}</p>}{claim.replacementNotes && <p className="mt-1 text-xs text-muted">{claim.replacementNotes}</p>}{claim.resolution && <p className="mt-2 rounded-lg bg-success-light p-2 text-xs text-success">Resolution: {claim.resolution}</p>}{claim.status === 'OPEN' && <div className="mt-3"><Button variant="secondary" onClick={() => updateClaim(claim, 'UNDER_REVIEW')} className="min-h-8 px-2 text-xs">Start review</Button></div>}{claim.status === 'UNDER_REVIEW' && canManage && <div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => updateClaim(claim, 'APPROVED')} className="min-h-8 px-2 text-xs">Approve</Button><Button variant="ghost" onClick={() => updateClaim(claim, 'REJECTED')} className="min-h-8 px-2 text-xs">Reject</Button></div>}{claim.status === 'APPROVED' && canManage && <div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => updateReplacement(claim, claim.replacementStatus === 'APPROVED' ? 'DISPATCHED' : 'APPROVED')} className="min-h-8 px-2 text-xs">{claim.replacementStatus === 'APPROVED' ? 'Mark replacement dispatched' : 'Approve replacement'}</Button><Button variant="ghost" onClick={() => updateClaim(claim, 'RESOLVED')} className="min-h-8 px-2 text-xs">Close claim</Button></div>}{claim.replacementStatus === 'DISPATCHED' && canManage && <div className="mt-3"><Button variant="secondary" onClick={() => updateReplacement(claim, 'COMPLETED')} className="min-h-8 px-2 text-xs">Complete replacement</Button></div>}</div>) : <Empty text="No dealer claims. Great—keep recording issues here if they arise." />}</div></div></div></div>
}

function PriceListsTab({ selected, priceLists, products, canManage, onOpenPriceList, onRefresh, notify }) {
  const relevant = priceLists.filter(list => !list.dealerId || list.dealerId === selected.id)
  const toggle = async list => { const res = await toggleDealerPriceList(list.id, !list.isActive); if (res.success) { notify('Price list status updated', { variant: 'success' }); await onRefresh() } else notify(res.error, { variant: 'danger' }) }
  return <div className="space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold text-foreground">Dealer price lists</h3><p className="mt-1 text-xs text-muted">Maintain shared or dealer-specific rates and product-wise margin.</p></div>{canManage && <Button onClick={onOpenPriceList}><Plus className="h-4 w-4" />New price list</Button>}</div>{relevant.length ? <div className="grid gap-3 md:grid-cols-2">{relevant.map(list => <div key={list.id} className={`${cardClass} p-4`}><div className="flex items-start justify-between gap-2"><div><p className="font-semibold text-foreground">{list.name}</p><p className="mt-1 text-xs text-muted">{list.dealer?.businessName || 'Shared with all dealers'} · {list.items.length} products</p></div>{canManage ? <button onClick={() => toggle(list)} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${list.isActive ? 'bg-success-light text-success' : 'bg-surface-hover text-muted'}`}>{list.isActive ? 'Active' : 'Inactive'}</button> : <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${list.isActive ? 'bg-success-light text-success' : 'bg-surface-hover text-muted'}`}>{list.isActive ? 'Active' : 'Inactive'}</span>}</div><div className="mt-3 space-y-2">{list.items.slice(0, 4).map(item => { const margin = Number(item.rate || 0) - Number(item.product.costPrice || 0); const marginPct = Number(item.rate || 0) > 0 ? (margin / Number(item.rate || 0)) * 100 : 0; return <div key={item.id} className="flex items-center justify-between gap-2 text-xs"><span className="min-w-0"><span className="block truncate text-muted">{item.product.name}</span><span className={margin >= 0 ? 'text-success' : 'text-danger'}>Margin {money(margin)} ({marginPct.toFixed(1)}%)</span></span><span className="shrink-0 font-semibold text-foreground">{money(item.rate)} / {item.product.unitOfMeasure || 'unit'}</span></div> })}{list.items.length > 4 && <p className="text-xs text-muted">+{list.items.length - 4} more products</p>}</div></div>)}</div> : <div className={`${cardClass} p-4`}><Empty text="No price list yet. Create a shared or dealer-specific rate card." /></div>}</div>
}

function DealerForm({ staff, onSubmit }) {
  const submit = event => { event.preventDefault(); const f = event.currentTarget; onSubmit({ businessName: f.businessName.value, contactPerson: f.contactPerson.value, phone: f.phone.value, alternatePhone: f.alternatePhone.value, whatsappNumber: f.whatsappNumber.value, email: f.email.value, gstNumber: f.gstNumber.value, dealerType: f.dealerType.value, territory: f.territory.value, city: f.city.value, state: f.state.value, pincode: f.pincode.value, address: f.address.value, preferredCategories: csvValues(f.preferredCategories.value), estimatedMonthlyBusiness: f.estimatedMonthlyBusiness.value, monthlySalesTarget: f.monthlySalesTarget.value, performanceTier: f.performanceTier.value, creditLimit: f.creditLimit.value, creditDays: f.creditDays.value, paymentTerms: f.paymentTerms.value, priceTier: f.priceTier.value, defaultDiscountPercent: f.defaultDiscountPercent.value, assignedStaffId: f.assignedStaffId.value || null, source: f.source.value, nextFollowUpAt: f.nextFollowUpAt.value, notes: f.notes.value }) }
  return <form id="dealer-form" onSubmit={submit} className="space-y-5"><div><h3 className="font-semibold text-foreground">Relationship basics</h3><p className="mt-1 text-xs text-muted">Sales, accounts and territory follow-up details for this channel partner.</p></div><div className="grid gap-4 md:grid-cols-2"><Field label="Business name *"><Input name="businessName" required placeholder="e.g. Shree Marbles & Tiles" /></Field><Field label="Owner / contact person *"><Input name="contactPerson" required placeholder="e.g. Rajesh Mehta" /></Field><Field label="Mobile *"><Input name="phone" required placeholder="+91 98xxxxxx12" /></Field><Field label="WhatsApp number"><Input name="whatsappNumber" placeholder="Same as mobile if blank" /></Field><Field label="Alternate phone"><Input name="alternatePhone" placeholder="Optional" /></Field><Field label="Email"><Input type="email" name="email" placeholder="accounts@dealer.example" /></Field><Field label="GSTIN"><Input name="gstNumber" placeholder="24ABCDE1234F1Z5" /></Field><Field label="Dealer type"><Select name="dealerType"><option>Retailer</option><option>Distributor</option><option>Contractor</option><option>Architect</option><option>Project Partner</option></Select></Field><Field label="Preferred products / categories"><Input name="preferredCategories" placeholder="Tiles, Granite, Marble" /></Field><Field label="Territory / beat"><Input name="territory" placeholder="Ahmedabad West" /></Field><Field label="City"><Input name="city" placeholder="Ahmedabad" /></Field><Field label="State"><Input name="state" defaultValue="Gujarat" /></Field><Field label="Pincode"><Input name="pincode" placeholder="380015" /></Field><Field label="Lead source"><Select name="source"><option value="Field Visit">Field Visit</option><option value="Reference">Reference</option><option value="Showroom">Showroom</option><option value="Trade Enquiry">Trade Enquiry</option><option value="Website">Website</option></Select></Field><Field label="Address" className="md:col-span-2"><Textarea name="address" rows={2} placeholder="Shop / office address" /></Field></div><div className="rounded-2xl border border-accent/20 bg-accent/5 p-4"><h3 className="font-semibold text-foreground">Commercial setup</h3><div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-4"><Field label="Monthly potential (₹)"><Input type="number" min="0" name="estimatedMonthlyBusiness" placeholder="250000" /></Field><Field label="Monthly sales target (₹)"><Input type="number" min="0" name="monthlySalesTarget" placeholder="300000" /></Field><Field label="Performance tier"><Select name="performanceTier"><option value="UNCLASSIFIED">Unclassified</option><option value="A_GRADE">A-grade</option><option value="B_GRADE">B-grade</option><option value="C_GRADE">C-grade</option><option value="HIGH_POTENTIAL">High potential</option><option value="LOW_ACTIVITY">Low activity</option><option value="DORMANT">Dormant</option></Select></Field><Field label="Credit limit (₹)"><Input type="number" min="0" name="creditLimit" placeholder="150000" /></Field><Field label="Credit days"><Input type="number" min="0" name="creditDays" placeholder="30" /></Field><Field label="Payment terms"><Input name="paymentTerms" placeholder="30 days credit / advance" /></Field><Field label="Price tier"><Select name="priceTier"><option>STANDARD</option><option>TRADE</option><option>PROJECT</option><option>PREMIUM</option></Select></Field><Field label="Default discount %"><Input type="number" min="0" max="100" step="0.5" name="defaultDiscountPercent" placeholder="0" /></Field><Field label="Assign owner"><Select name="assignedStaffId"><option value="">Unassigned</option>{staff.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</Select></Field><Field label="Next follow-up"><Input type="date" name="nextFollowUpAt" /></Field></div></div><Field label="Notes"><Textarea name="notes" rows={3} placeholder="Product range, competitor brand, payment behaviour, decision maker…" /></Field></form>
}

function DealerEditForm({ dealer, staff, onSubmit }) {
  const submit = event => {
    event.preventDefault()
    const f = event.currentTarget
    onSubmit({ id: dealer.id, businessName: f.businessName.value, contactPerson: f.contactPerson.value, phone: f.phone.value, alternatePhone: f.alternatePhone.value, whatsappNumber: f.whatsappNumber.value, email: f.email.value, gstNumber: f.gstNumber.value, dealerType: f.dealerType.value, territory: f.territory.value, city: f.city.value, state: f.state.value, pincode: f.pincode.value, address: f.address.value, preferredCategories: csvValues(f.preferredCategories.value), estimatedMonthlyBusiness: f.estimatedMonthlyBusiness.value, monthlySalesTarget: f.monthlySalesTarget.value, performanceTier: f.performanceTier.value, creditLimit: f.creditLimit.value, creditDays: f.creditDays.value, paymentTerms: f.paymentTerms.value, priceTier: f.priceTier.value, defaultDiscountPercent: f.defaultDiscountPercent.value, assignedStaffId: f.assignedStaffId.value || null, nextFollowUpAt: f.nextFollowUpAt.value, notes: f.notes.value })
  }
  return <form id="dealer-edit-form" onSubmit={submit} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Business name *"><Input name="businessName" required defaultValue={dealer?.businessName || ''} /></Field><Field label="Contact person *"><Input name="contactPerson" required defaultValue={dealer?.contactPerson || ''} /></Field><Field label="Mobile *"><Input name="phone" required defaultValue={dealer?.phone || ''} /></Field><Field label="WhatsApp"><Input name="whatsappNumber" defaultValue={dealer?.whatsappNumber || ''} /></Field><Field label="Alternate phone"><Input name="alternatePhone" defaultValue={dealer?.alternatePhone || ''} /></Field><Field label="Email"><Input type="email" name="email" defaultValue={dealer?.email || ''} /></Field><Field label="GSTIN"><Input name="gstNumber" defaultValue={dealer?.gstNumber || ''} /></Field><Field label="Preferred products"><Input name="preferredCategories" defaultValue={(dealer?.preferredCategories || []).join(', ')} /></Field><Field label="Dealer type"><Select name="dealerType" defaultValue={dealer?.dealerType || 'Retailer'}><option>Retailer</option><option>Distributor</option><option>Contractor</option><option>Architect</option><option>Project Partner</option></Select></Field><Field label="Territory / beat"><Input name="territory" defaultValue={dealer?.territory || ''} /></Field><Field label="City"><Input name="city" defaultValue={dealer?.city || ''} /></Field><Field label="State"><Input name="state" defaultValue={dealer?.state || 'Gujarat'} /></Field><Field label="Pincode"><Input name="pincode" defaultValue={dealer?.pincode || ''} /></Field><Field label="Monthly potential (₹)"><Input type="number" min="0" name="estimatedMonthlyBusiness" defaultValue={dealer?.estimatedMonthlyBusiness || 0} /></Field><Field label="Monthly target (₹)"><Input type="number" min="0" name="monthlySalesTarget" defaultValue={dealer?.monthlySalesTarget || 0} /></Field><Field label="Performance tier"><Select name="performanceTier" defaultValue={dealer?.performanceTier || 'UNCLASSIFIED'}><option value="UNCLASSIFIED">Unclassified</option><option value="A_GRADE">A-grade</option><option value="B_GRADE">B-grade</option><option value="C_GRADE">C-grade</option><option value="HIGH_POTENTIAL">High potential</option><option value="LOW_ACTIVITY">Low activity</option><option value="DORMANT">Dormant</option></Select></Field><Field label="Credit limit (₹)"><Input type="number" min="0" name="creditLimit" defaultValue={dealer?.creditLimit || 0} /></Field><Field label="Credit days"><Input type="number" min="0" name="creditDays" defaultValue={dealer?.creditDays || 0} /></Field><Field label="Payment terms"><Input name="paymentTerms" defaultValue={dealer?.paymentTerms || ''} /></Field><Field label="Price tier"><Select name="priceTier" defaultValue={dealer?.priceTier || 'STANDARD'}><option>STANDARD</option><option>TRADE</option><option>PROJECT</option><option>PREMIUM</option></Select></Field><Field label="Default discount %"><Input type="number" min="0" max="100" step="0.5" name="defaultDiscountPercent" defaultValue={dealer?.defaultDiscountPercent || 0} /></Field><Field label="Assign owner"><Select name="assignedStaffId" defaultValue={dealer?.assignedStaffId || ''}><option value="">Unassigned</option>{staff.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</Select></Field><Field label="Next follow-up"><Input type="date" name="nextFollowUpAt" defaultValue={dealer?.nextFollowUpAt ? new Date(dealer.nextFollowUpAt).toISOString().slice(0, 10) : ''} /></Field><Field label="Address" className="sm:col-span-2"><Textarea name="address" rows={2} defaultValue={dealer?.address || ''} /></Field><Field label="Notes" className="sm:col-span-2"><Textarea name="notes" rows={3} defaultValue={dealer?.notes || ''} /></Field></div></form>
}

function LostReasonForm({ status, onSubmit }) {
  const submit = event => { event.preventDefault(); const f = event.currentTarget; const reason = f.reason.value === 'Other' ? f.otherReason.value.trim() : f.reason.value; if (reason) onSubmit({ reason }) }
  return <form id="lost-reason-form" onSubmit={submit} className="space-y-4"><Field label={status === 'LOST' ? 'Lost reason *' : 'Not interested reason *'}><Select name="reason" defaultValue=""><option value="" disabled>Select reason</option>{lostReasonOptions.map(reason => <option key={reason}>{reason}</option>)}</Select></Field><Field label="Other reason"><Input name="otherReason" placeholder="Required only when Other is selected" /></Field><p className="text-xs text-muted">This reason is saved for loss analysis and future dealer strategy.</p></form>
}

function DealerTeamForm({ dealer, staff, onSubmit }) {
  const existing = dealer?.details?.teamAssignments || []
  const [assignments, setAssignments] = useState(existing.length ? existing.map(item => ({ staffId: String(item.staffId), role: item.role })) : dealer?.assignedStaffId ? [{ staffId: String(dealer.assignedStaffId), role: 'OWNER' }] : [{ staffId: '', role: 'SALESPERSON' }])
  const change = (index, key, value) => setAssignments(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item))
  const submit = event => { event.preventDefault(); onSubmit({ dealerId: dealer.id, assignments: assignments.filter(item => item.staffId).map(item => ({ ...item, staffId: Number(item.staffId) })) }) }
  return <form id="dealer-team-form" onSubmit={submit} className="space-y-4"><p className="text-sm text-muted">One person can hold more than one role. Keep one Dealer owner for clear accountability.</p>{assignments.map((item, index) => <div key={index} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1fr_1fr_auto]"><Field label="Staff"><Select value={item.staffId} onChange={event => change(index, 'staffId', event.target.value)}><option value="">Select staff</option>{staff.map(member => <option key={member.id} value={member.id}>{member.name} · {member.role}</option>)}</Select></Field><Field label="Role"><Select value={item.role} onChange={event => change(index, 'role', event.target.value)}>{dealerTeamRoles.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field><button type="button" className="mt-5 rounded-xl p-2 text-muted hover:bg-danger-light hover:text-danger" onClick={() => setAssignments(current => current.length > 1 ? current.filter((_, itemIndex) => itemIndex !== index) : current)}><X className="h-4 w-4" /></button></div>)}<Button type="button" variant="secondary" className="min-h-9 text-xs" onClick={() => setAssignments(current => [...current, { staffId: '', role: 'SUPPORT_PERSON' }])}><Plus className="h-3.5 w-3.5" />Add team role</Button></form>
}

function TaskForm({ dealerId, staff, onSubmit }) { const submit = event => { event.preventDefault(); const f = event.currentTarget; onSubmit({ dealerId, assignedStaffId: f.assignedStaffId.value || null, type: f.type.value, title: f.title.value, description: f.description.value, dueDate: f.dueDate.value, reminderAt: f.reminderAt.value, priority: f.priority.value, notes: f.notes.value }) }; return <form id="task-form" onSubmit={submit} className="space-y-4"><Field label="Task title *"><Input name="title" required placeholder="Follow up on trial order" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Task type"><Select name="type">{taskTypes.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field><Field label="Priority"><Select name="priority"><option>MEDIUM</option><option>LOW</option><option>HIGH</option><option>URGENT</option></Select></Field><Field label="Due date *"><Input type="date" name="dueDate" required defaultValue={new Date().toISOString().slice(0, 10)} /></Field><Field label="Reminder"><Input type="datetime-local" name="reminderAt" /></Field><Field label="Assign to"><Select name="assignedStaffId"><option value="">Dealer owner</option>{staff.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</Select></Field></div><Field label="Description"><Textarea name="description" rows={3} placeholder="What should be completed and what outcome is expected?" /></Field><Field label="Internal note"><Textarea name="notes" rows={2} placeholder="Optional" /></Field></form> }

async function uploadVisitAttachments(files, folder) {
  if (!files?.length) return []
  const formData = new FormData()
  Array.from(files).forEach(file => formData.append('files', file))
  formData.append('folder', folder)
  const response = await fetch('/api/upload', { method: 'POST', body: formData })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.success) throw new Error(data.error || 'Attachment upload failed')
  return data.urls || []
}

function VisitForm({ dealerId, staff, onSubmit }) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const submit = async event => {
    event.preventDefault()
    const f = event.currentTarget
    setUploading(true)
    setUploadError('')
    try {
      const [photoUrls, documentUrls] = await Promise.all([
        uploadVisitAttachments(f.photos.files, 'dealer-visits/photos'),
        uploadVisitAttachments(f.documents.files, 'dealer-visits/documents'),
      ])
      await onSubmit({ dealerId, staffId: f.staffId.value || null, visitDate: f.visitDate.value, purpose: f.purpose.value, personMet: f.personMet.value, outcome: f.outcome.value, samplesShown: f.samplesShown.value, priceListShared: f.priceListShared.checked, dealerFeedback: f.dealerFeedback.value, nextAction: f.nextAction.value, nextFollowUpAt: f.nextFollowUpAt.value, nextMeetingAt: f.nextMeetingAt.value, photoUrls, documentUrls, notes: f.notes.value })
    } catch (error) {
      setUploadError(error?.message || 'Could not upload the visit attachments')
    } finally {
      setUploading(false)
    }
  }
  return <form id="visit-form" onSubmit={submit} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Visit date *"><Input type="date" name="visitDate" required defaultValue={new Date().toISOString().slice(0, 10)} /></Field><Field label="Staff member"><Select name="staffId"><option value="">Dealer owner</option>{staff.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</Select></Field></div><Field label="Purpose *"><Input name="purpose" required placeholder="Range review / payment meeting / order visit" /></Field><Field label="Person met"><Input name="personMet" placeholder="Owner / purchase manager" /></Field><Field label="Samples shown"><Input name="samplesShown" placeholder="Makrana sample, 600x1200 tile board" /></Field><label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" name="priceListShared" /> Price list shared in this visit</label><Field label="Discussion / outcome"><Textarea name="outcome" rows={3} placeholder="What was discussed? What did they agree to?" /></Field><Field label="Dealer feedback"><Textarea name="dealerFeedback" rows={2} placeholder="Price, range, quality, delivery or display feedback" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Next action"><Input name="nextAction" placeholder="Send trade price list" /></Field><Field label="Next follow-up"><Input type="date" name="nextFollowUpAt" /></Field><Field label="Next meeting"><Input type="datetime-local" name="nextMeetingAt" /></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Visit photos (optional)"><Input type="file" name="photos" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif" multiple /></Field><Field label="Visit documents (optional)"><Input type="file" name="documents" accept="application/pdf,text/csv,image/jpeg,image/png,image/webp,image/heic,image/heif" multiple /></Field></div><p className="text-xs text-muted">Up to five files per upload, 10 MB each. Photos and documents are stored with this dealer visit.</p>{uploading && <p className="text-xs text-accent">Uploading visit attachments…</p>}{uploadError && <p className="text-xs text-danger">{uploadError}</p>}<Field label="Internal notes"><Textarea name="notes" rows={2} /></Field></form>
}

function ClaimForm({ dealerId, staff, orders, onSubmit }) { const submit = event => { event.preventDefault(); const f = event.currentTarget; onSubmit({ dealerId, dealerOrderId: f.dealerOrderId.value || null, assignedStaffId: f.assignedStaffId.value || null, type: f.type.value, description: f.description.value, quantity: f.quantity.value || null, claimAmount: f.claimAmount.value || 0, replacementStatus: f.replacementStatus.value, replacementNotes: f.replacementNotes.value, notes: f.notes.value }) }; return <form id="claim-form" onSubmit={submit} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Issue type"><Select name="type"><option value="DAMAGE">Breakage / damage</option><option value="SHORTAGE">Short quantity</option><option value="SHADE_MISMATCH">Shade mismatch</option><option value="QUALITY">Quality issue</option><option value="DELIVERY">Delayed delivery</option><option value="WRONG_ITEM">Wrong item</option><option value="TRANSIT_DAMAGE">Transit damage</option><option value="PAYMENT">Payment issue</option><option value="OTHER">Other</option></Select></Field><Field label="Linked order"><Select name="dealerOrderId"><option value="">No linked order</option>{orders.map(order => <option key={order.id} value={order.id}>{order.displayId}</option>)}</Select></Field><Field label="Quantity"><Input type="number" min="0" step="0.01" name="quantity" placeholder="Optional" /></Field><Field label="Claim amount (₹)"><Input type="number" min="0" name="claimAmount" placeholder="0" /></Field><Field label="Replacement status"><Select name="replacementStatus"><option value="NOT_REQUIRED">Not required</option><option value="PENDING">Replacement pending</option><option value="APPROVED">Replacement approved</option></Select></Field><Field label="Assign to"><Select name="assignedStaffId"><option value="">Dealer owner</option>{staff.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</Select></Field></div><Field label="Description *"><Textarea name="description" required rows={4} placeholder="Describe the issue, quantity affected and requested resolution" /></Field><Field label="Replacement notes"><Textarea name="replacementNotes" rows={2} placeholder="Replacement item, expected dispatch or credit note" /></Field><Field label="Internal note"><Textarea name="notes" rows={2} /></Field></form> }

function resolveDealerRate(priceLists, dealerId, productId, quantity, fallbackRate) {
  const today = new Date()
  const candidates = (priceLists || []).flatMap(list => {
    const validFrom = list.validFrom ? new Date(list.validFrom) : null
    const validUntil = list.validUntil ? new Date(list.validUntil) : null
    if (validUntil) validUntil.setHours(23, 59, 59, 999)
    if (!list.isActive || (validFrom && validFrom > today) || (validUntil && validUntil < today)) return []
    const item = (list.items || []).filter(entry => String(entry.productId) === String(productId) && Number(entry.minQuantity || 0) <= Number(quantity || 0)).sort((a, b) => Number(b.minQuantity || 0) - Number(a.minQuantity || 0))[0]
    return item ? [{ list, item }] : []
  }).sort((a, b) => Number(b.list.dealerId === dealerId) - Number(a.list.dealerId === dealerId) || Number(b.item.minQuantity || 0) - Number(a.item.minQuantity || 0) || new Date(b.list.createdAt || 0).getTime() - new Date(a.list.createdAt || 0).getTime())
  const match = candidates[0]
  if (!match) return { rate: fallbackRate || '', source: 'catalogue' }
  const rate = Math.round(Number(match.item.rate || 0) * (1 - Number(match.item.discountPct || 0) / 100))
  return { rate, source: match.list.dealerId === dealerId ? 'dealer price list' : 'shared price list' }
}

function OrderForm({ dealerId, products, priceLists, staff, selected, onSubmit }) {
  const blankItem = { productId: '', name: '', quantity: 1, unitOfMeasure: 'PCS', areaSqft: '', rate: '', rateSource: 'catalogue', shadeCode: '', lotNumber: '', notes: '' }
  const [items, setItems] = useState([blankItem])
  const setItem = (index, key, value) => setItems(current => current.map((item, itemIndex) => {
    if (itemIndex !== index) return item
    const next = { ...item, [key]: value }
    if (key === 'rate') return { ...next, rateSource: 'manual' }
    if (key === 'quantity' && next.productId && item.rateSource !== 'manual') {
      const product = products.find(productItem => String(productItem.id) === String(next.productId))
      return { ...next, ...resolveDealerRate(priceLists, dealerId, next.productId, next.quantity, product?.price) }
    }
    return next
  }))
  const chooseProduct = (index, value) => {
    const product = products.find(productItem => String(productItem.id) === value)
    setItems(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, productId: value, name: product?.name || '', unitOfMeasure: product?.unitOfMeasure || 'PCS', ...resolveDealerRate(priceLists, dealerId, value, item.quantity, product?.price) } : item))
  }
  const submit = event => {
    event.preventDefault()
    const f = event.currentTarget
    onSubmit({ dealerId, status: 'ENQUIRY', expectedDispatchDate: f.expectedDispatchDate.value, gstPercent: f.gstPercent.value || 18, discount: f.discount.value || 0, freight: f.freight.value || 0, loading: f.loading.value || 0, installation: f.installation.value || 0, amountPaid: f.amountPaid.value || 0, salespersonId: f.salespersonId.value || null, deliveryAddress: f.deliveryAddress.value, allocationNotes: f.allocationNotes.value, notes: f.notes.value, items: items.map(item => ({ ...item, productId: item.productId || null })) })
  }
  const subtotal = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.rate || 0), 0)
  return <form id="order-form" onSubmit={submit} className="space-y-5"><div className="rounded-2xl border border-accent/20 bg-accent/5 p-4"><div className="flex items-center justify-between"><div><h3 className="font-semibold text-foreground">Material lines</h3><p className="mt-1 text-xs text-muted">Active dealer price lists apply automatically; you can still enter an approved manual rate.</p></div><span className="text-sm font-semibold text-foreground">Subtotal {money(subtotal)}</span></div><div className="mt-3 space-y-3">{items.map((item, index) => <div key={index} className="rounded-xl border border-border bg-surface p-3"><div className="grid gap-3 md:grid-cols-[1.4fr_1fr_0.6fr_0.8fr_auto]"><Field label="Catalogue product"><Select value={item.productId} onChange={event => chooseProduct(index, event.target.value)}><option value="">Custom / enter below</option>{products.map(product => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</Select></Field><Field label="Material name"><Input value={item.name} onChange={event => setItem(index, 'name', event.target.value)} placeholder="Granite / tile name" /></Field><Field label="Qty"><Input type="number" min="0.01" step="0.01" value={item.quantity} onChange={event => setItem(index, 'quantity', event.target.value)} /></Field><Field label="Rate (₹)"><Input type="number" min="0" step="1" value={item.rate} onChange={event => setItem(index, 'rate', event.target.value)} /></Field><button type="button" onClick={() => setItems(current => current.length > 1 ? current.filter((_, itemIndex) => itemIndex !== index) : current)} className="mt-5 rounded-xl p-2 text-muted hover:bg-danger-light hover:text-danger"><X className="h-4 w-4" /></button></div><div className="mt-2 text-[11px] text-muted">Rate source: {item.rateSource === 'manual' ? 'Manual override' : item.rateSource === 'catalogue' ? 'Catalogue price' : item.rateSource}</div><div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-4"><Field label="Unit"><Input value={item.unitOfMeasure} onChange={event => setItem(index, 'unitOfMeasure', event.target.value)} placeholder="BOX / SQFT / SLAB" /></Field><Field label="Area (sq.ft.)"><Input type="number" min="0.01" step="0.01" value={item.areaSqft} onChange={event => setItem(index, 'areaSqft', event.target.value)} placeholder="Optional" /></Field><Field label="Lot / batch"><Input value={item.lotNumber} onChange={event => setItem(index, 'lotNumber', event.target.value)} placeholder="Optional lot number" /></Field><Field label="Shade code"><Input value={item.shadeCode} onChange={event => setItem(index, 'shadeCode', event.target.value)} placeholder="Optional" /></Field></div></div>)}</div><Button type="button" variant="secondary" onClick={() => setItems(current => [...current, { ...blankItem }])} className="mt-3 min-h-9 text-xs"><Plus className="h-3.5 w-3.5" />Add line</Button></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="GST %"><Input type="number" min="0" max="100" step="0.01" name="gstPercent" defaultValue="18" /></Field><Field label="Discount (₹)"><Input type="number" min="0" name="discount" defaultValue="0" /></Field><Field label="Freight (₹)"><Input type="number" min="0" name="freight" defaultValue="0" /></Field><Field label="Loading (₹)"><Input type="number" min="0" name="loading" defaultValue="0" /></Field><Field label="Installation (₹)"><Input type="number" min="0" name="installation" defaultValue="0" /></Field><Field label="Advance received (₹)"><Input type="number" min="0" name="amountPaid" defaultValue="0" /></Field><Field label="Expected dispatch"><Input type="date" name="expectedDispatchDate" /></Field><Field label="Sales owner"><Select name="salespersonId"><option value="">Dealer owner</option>{staff.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</Select></Field></div><Field label="Delivery address"><Textarea name="deliveryAddress" rows={2} defaultValue={selected?.address || ''} placeholder="Dealer warehouse / project site" /></Field><Field label="Stock / production allocation"><Textarea name="allocationNotes" rows={2} placeholder="Reserved lot/slab, production batch, shade approval or allocation owner" /></Field><Field label="Order notes"><Textarea name="notes" rows={2} placeholder="Approval, shade, loading or dispatch instructions" /></Field></form>
}

function PaymentForm({ dealerId, order, onSubmit }) { const submit = event => { event.preventDefault(); const f = event.currentTarget; onSubmit({ dealerId, dealerOrderId: order?.id, amount: f.amount.value, method: f.method.value, reference: f.reference.value, paymentDate: f.paymentDate.value, notes: f.notes.value }) }; return <form id="payment-form" onSubmit={submit} className="space-y-4"><div className="rounded-xl bg-surface-hover p-3 text-sm"><div className="flex justify-between"><span className="text-muted">Order balance</span><strong className="text-warning">{money(order?.balanceDue)}</strong></div></div><Field label="Amount (₹) *"><Input type="number" min="1" max={order?.balanceDue || undefined} name="amount" required placeholder="25000" /></Field><Field label="Method"><Select name="method"><option>Bank Transfer</option><option>UPI</option><option>Cash</option><option>Cheque</option><option>Card</option></Select></Field><Field label="Reference"><Input name="reference" placeholder="UTR / cheque number" /></Field><Field label="Payment date"><Input type="date" name="paymentDate" defaultValue={new Date().toISOString().slice(0, 10)} /></Field><Field label="Notes"><Textarea name="notes" rows={2} /></Field></form> }

function PriceListForm({ dealerId, products, onSubmit }) {
  const [scope, setScope] = useState(dealerId ? 'dealer' : 'shared')
  const [items, setItems] = useState([{ productId: '', rate: '', discountPct: 0, minQuantity: 0 }])
  const submit = event => {
    event.preventDefault()
    const f = event.currentTarget
    onSubmit({ name: f.name.value, dealerId: scope === 'shared' ? null : dealerId || null, validFrom: f.validFrom.value, validUntil: f.validUntil.value, notes: f.notes.value, items })
  }
  return <form id="price-list-form" onSubmit={submit} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Price list name *"><Input name="name" required placeholder="Ahmedabad Trade Rates – Q3" /></Field><Field label="Scope"><Select value={scope} onChange={event => setScope(event.target.value)}><option value="dealer" disabled={!dealerId}>This dealer</option><option value="shared">All dealers (shared)</option></Select></Field><Field label="Valid from"><Input type="date" name="validFrom" defaultValue={new Date().toISOString().slice(0, 10)} /></Field><Field label="Valid until"><Input type="date" name="validUntil" /></Field></div><div className="rounded-xl border border-border p-3"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-foreground">Product rates</p><Button type="button" variant="secondary" onClick={() => setItems(current => [...current, { productId: '', rate: '', discountPct: 0, minQuantity: 0 }])} className="min-h-8 px-2 text-xs"><Plus className="h-3.5 w-3.5" />Add product</Button></div><div className="mt-3 space-y-3">{items.map((item, index) => <div key={index} className="grid gap-3 sm:grid-cols-[1.5fr_1fr_0.7fr_0.8fr_auto]"><Field label="Product"><Select value={item.productId} required onChange={event => setItems(current => current.map((line, lineIndex) => lineIndex === index ? { ...line, productId: event.target.value, rate: products.find(product => String(product.id) === event.target.value)?.price || '' } : line))}><option value="">Select product</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</Select></Field><Field label="Dealer rate"><Input type="number" min="0" required value={item.rate} onChange={event => setItems(current => current.map((line, lineIndex) => lineIndex === index ? { ...line, rate: event.target.value } : line))} /></Field><Field label="Discount %"><Input type="number" min="0" max="100" step="0.5" value={item.discountPct} onChange={event => setItems(current => current.map((line, lineIndex) => lineIndex === index ? { ...line, discountPct: event.target.value } : line))} /></Field><Field label="Min qty"><Input type="number" min="0" step="0.01" value={item.minQuantity} onChange={event => setItems(current => current.map((line, lineIndex) => lineIndex === index ? { ...line, minQuantity: event.target.value } : line))} /></Field><button type="button" onClick={() => setItems(current => current.length > 1 ? current.filter((_, itemIndex) => itemIndex !== index) : current)} className="mt-5 rounded-xl p-2 text-muted hover:bg-danger-light hover:text-danger"><X className="h-4 w-4" /></button></div>)}</div></div><Field label="Notes"><Textarea name="notes" rows={2} placeholder="Applies to trade purchases, loading terms, GST note…" /></Field></form>
}
