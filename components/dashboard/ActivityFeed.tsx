'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import {
  Package,
  DollarSign,
  Users,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  Clock,
  PlusCircle,
  TrendingUp,
  ShoppingCart
} from 'lucide-react'

interface ActivityEvent {
  id: string
  type: 'order' | 'payment' | 'lead' | 'message' | 'quote' | 'stock' | 'appointment' | 'custom_order' | 'delivery'
  title: string
  description: string
  timestamp: Date
  metadata?: Record<string, unknown>
  severity: 'info' | 'success' | 'warning' | 'critical'
  userId?: number
  userName?: string
}

interface ActivityFeedProps {
  events: ActivityEvent[]
  className?: string
  height?: number
  maxEvents?: number
  showFilters?: boolean
  onLoadMore?: () => void
  hasMore?: boolean
}

const EVENT_TYPES = [
  { key: 'all', label: 'All', icon: null },
  { key: 'order', label: 'Orders', icon: Package },
  { key: 'payment', label: 'Payments', icon: DollarSign },
  { key: 'lead', label: 'Leads', icon: Users },
  { key: 'message', label: 'Messages', icon: MessageSquare },
  { key: 'quote', label: 'Quotations', icon: ShoppingCart },
  { key: 'stock', label: 'Stock', icon: AlertTriangle },
  { key: 'appointment', label: 'Appointments', icon: Clock },
  { key: 'custom_order', label: 'Custom Orders', icon: PlusCircle },
  { key: 'delivery', label: 'Deliveries', icon: TrendingUp }
] as const

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  order: Package,
  payment: DollarSign,
  lead: Users,
  message: MessageSquare,
  quote: ShoppingCart,
  stock: AlertTriangle,
  appointment: Clock,
  custom_order: PlusCircle,
  delivery: TrendingUp
}

const TYPE_COLORS: Record<string, string> = {
  order: 'bg-blue-100 text-blue-600',
  payment: 'bg-green-100 text-green-600',
  lead: 'bg-purple-100 text-purple-600',
  message: 'bg-cyan-100 text-cyan-600',
  quote: 'bg-orange-100 text-orange-600',
  stock: 'bg-red-100 text-red-600',
  appointment: 'bg-indigo-100 text-indigo-600',
  custom_order: 'bg-pink-100 text-pink-600',
  delivery: 'bg-emerald-100 text-emerald-600'
}

const SEVERITY_COLORS: Record<string, string> = {
  info: 'text-gray-600',
  success: 'text-green-600',
  warning: 'text-yellow-600',
  critical: 'text-red-600'
}

const SEVERITY_DOTS: Record<string, string> = {
  info: 'bg-gray-400',
  success: 'bg-green-500',
  warning: 'bg-yellow-500',
  critical: 'bg-red-500'
}

export function ActivityFeed({
  events,
  className,
  height = 400,
  maxEvents = 50,
  showFilters = true,
  onLoadMore,
  hasMore = false
}: ActivityFeedProps) {
  const [filterType, setFilterType] = useState<string>('all')

  const filteredEvents = useMemo(() => {
    let filtered = events

    if (filterType !== 'all') {
      filtered = filtered.filter(e => e.type === filterType)
    }

    // Sort by timestamp descending
    filtered = [...filtered].sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )

    return maxEvents ? filtered.slice(0, maxEvents) : filtered
  }, [events, filterType, maxEvents])

  const groupedEvents = useMemo(() => {
    const groups: Record<string, ActivityEvent[]> = {}

    for (const event of filteredEvents) {
      const dateKey = new Date(event.timestamp).toDateString()
      if (!groups[dateKey]) groups[dateKey] = []
      groups[dateKey].push(event)
    }

    // Sort groups by date descending
    const entries: [string, ActivityEvent[]][] = Object.entries(groups) as [string, ActivityEvent[]][]
    return entries.sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
  }, [filteredEvents])

  const TypeIcon = TYPE_ICONS[filterType] || null

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          Activity Feed
          {showFilters && (
            <div className="ml-2 w-40"><Select value={filterType} onValueChange={(value) => setFilterType(value as string)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map(type => (
                  <SelectItem key={type.key} value={type.key}>
                    <div className="flex items-center gap-2">
                      {type.icon && <type.icon className="h-4 w-4" />}
                      {type.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select></div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[{height}px] p-4" style={{ height: `${height}px` }}>
          {Object.keys(groupedEvents).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Package className="h-12 w-12 mb-3 opacity-50" />
              <p className="text-sm">No activity found</p>
              {filterType !== 'all' && (
                <Button variant="ghost" size="sm" onClick={() => setFilterType('all')}>
                  Show all events
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {(groupedEvents).map(([date, dayEvents]) => (
                <div key={date} className="space-y-3">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                    {new Date(date).toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </div>
                  {dayEvents.map((event, index) => {
                    const Icon = TYPE_ICONS[event.type] || Package
                    const isLast = index === dayEvents.length - 1

                    return (
                      <div
                        key={event.id}
                        className="relative flex gap-3 group"
                        style={{
                          borderLeft: `2px solid ${event.severity === 'critical' ? '#ef4444' : event.severity === 'warning' ? '#f59e0b' : '#e2e8f0'}`,
                          paddingLeft: '12px'
                        }}
                      >
                        {/* Timeline dot */}
                        <div
                          className={cn(
                            'absolute -left-3 top-1 w-4 h-4 rounded-full border-2 border-white flex-shrink-0',
                            SEVERITY_DOTS[event.severity]
                          )}
                        />

                        {/* Icon */}
                        <div
                          className={cn(
                            'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
                            TYPE_COLORS[event.type]
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <p className={cn('font-medium text-sm', SEVERITY_COLORS[event.severity])}>
                                {event.title}
                              </p>
                              <p className="text-sm text-muted-foreground mt-0.5">
                                {event.description}
                              </p>
                              {event.metadata && Object.keys(event.metadata).length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                  {Object.entries(event.metadata).map(([key, value]) => (
                                    <span key={key} className="bg-gray-100 px-2 py-0.5 rounded">
                                      {key}: {String(value)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1 text-right">
                              <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                              </span>
                              {event.userName && (
                                <span className="text-xs text-muted-foreground">
                                  by {event.userName}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {hasMore && onLoadMore && (
            <div className="mt-4 text-center">
              <Button variant="outline" size="sm" onClick={onLoadMore}>
                Load more
              </Button>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

// Helper to create activity events from various sources
export function createActivityEvents(
  source: 'orders' | 'payments' | 'leads' | 'messages' | 'quotes' | 'stock' | 'appointments',
  data: any[]
): ActivityEvent[] {
  switch (source) {
    case 'orders':
      return data.map(d => ({
        id: `order-${d.id}`,
        type: 'order' as const,
        title: `Order ${d.displayId} ${d.status.toLowerCase()}`,
        description: `${d.contact?.name || 'Customer'} - ${d.product?.name || 'Product'} (${d.quantity} ${d.product?.unitOfMeasure || 'pcs'})`,
        timestamp: new Date(d.createdAt),
        severity: d.status === 'DELIVERED' ? 'success' : d.status === 'CANCELLED' ? 'critical' : 'info',
        metadata: { amount: d.amount, status: d.status }
      }))

    case 'payments':
      return data.map(d => ({
        id: `payment-${d.id}`,
        type: 'payment' as const,
        title: `Payment received: ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(d.amount)}`,
        description: d.invoice?.displayId ? `Invoice ${d.invoice.displayId}` : d.order?.displayId ? `Order ${d.order.displayId}` : 'Manual entry',
        timestamp: new Date(d.date),
        severity: 'success',
        metadata: { method: d.method, reference: d.reference }
      }))

    case 'leads':
      return data.map(d => ({
        id: `lead-${d.id}`,
        type: 'lead' as const,
        title: `New lead: ${d.contact?.name || 'Unknown'}`,
        description: `${d.interest} - ${d.status} (${d.source || 'Direct'})`,
        timestamp: new Date(d.createdAt),
        severity: d.status === 'WON' ? 'success' : d.status === 'LOST' ? 'critical' : 'info',
        metadata: { status: d.status, budget: d.budget }
      }))

    case 'quotes':
      return data.map(d => ({
        id: `quote-${d.id}`,
        type: 'quote' as const,
        title: `Quotation ${d.displayId} ${d.status.toLowerCase()}`,
        description: `${d.contact?.name || 'Customer'} - ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(d.grandTotal || 0)}`,
        timestamp: new Date(d.createdAt),
        severity: d.status === 'APPROVED' ? 'success' : d.status === 'REJECTED' ? 'critical' : 'info',
        metadata: { status: d.status, items: d.items?.length }
      }))

    default:
      return []
  }
}