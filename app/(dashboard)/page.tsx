'use client'

import { useState, useEffect } from 'react'
import {
  Package,
  DollarSign,
  Users,
  AlertTriangle,
  ShoppingCart,
  CheckCircle,
  TrendingUp,
  Clock,
  Battery,
  AlertCircle
} from 'lucide-react'
import {
  getExecutiveKPIs,
  getRevenueTrend,
  getPipelineVelocity,
  getCashPosition,
  getConversionFunnel,
  getActiveAlerts,
  subscribeToKPIUpdates
} from '@/lib/actions/dashboard'
import { KPICard } from '@/components/dashboard/KPICard'
import { RevenueTrendChart } from '@/components/dashboard/RevenueTrendChart'
import { PipelineFunnel } from '@/components/dashboard/PipelineFunnel'
import { StockAgingTable } from '@/components/dashboard/StockAgingTable'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { WidgetGrid } from '@/components/dashboard/WidgetGrid'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useWidgetGrid } from '@/components/dashboard/WidgetGrid'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function DashboardPage() {
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month' | 'quarter' | 'year'>('month')

  // Data States
  const [kpis, setKpis] = useState<any>(null)
  const [revenueData, setRevenueData] = useState<any[]>([])
  const [funnelData, setFunnelData] = useState<any[]>([])
  const [cashPosition, setCashPosition] = useState<any>(null)
  const [alerts, setAlerts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Layout hook (simulating role=MANAGER for now)
  const { loadLayout, saveLayout } = useWidgetGrid(undefined, 'MANAGER')

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const [
          kpiRes,
          revRes,
          funnelRes,
          cashRes,
          alertRes
        ] = await Promise.all([
          getExecutiveKPIs(timeRange),
          getRevenueTrend(timeRange),
          getConversionFunnel(timeRange),
          getCashPosition(),
          getActiveAlerts()
        ])

        setKpis(kpiRes)
        setRevenueData(revRes)
        setFunnelData(funnelRes)
        setCashPosition(cashRes)
        setAlerts(alertRes)
      } catch (error) {
        console.error('Failed to load dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [timeRange])

  // Map backend stats to format needed by components
  const formatCurrency = (value: number) => {
    if (value >= 1e7) return `₹${(value / 1e7).toFixed(1)}Cr`
    if (value >= 1e5) return `₹${(value / 1e5).toFixed(1)}L`
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)
  }

  // Pre-configure the widgets we want to expose
  const AVAILABLE_WIDGETS = [
    {
      key: 'kpi-revenue',
      title: 'Revenue',
      component: () => (
        <KPICard
          title="Total Revenue"
          value={formatCurrency(kpis?.revenue?.current || 0)}
          trend={{ value: kpis?.revenue?.growth || 0, label: 'vs prev' }}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
          loading={loading}
        />
      ),
      defaultSize: { w: 3, h: 4 },
      minSize: { w: 2, h: 3 }
    },
    {
      key: 'kpi-pipeline',
      title: 'Active Pipeline',
      component: () => (
        <KPICard
          title="Active Pipeline"
          value={formatCurrency(kpis?.pipeline?.current || 0)}
          trend={{ value: kpis?.pipeline?.growth || 0, label: 'vs prev' }}
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
          loading={loading}
        />
      ),
      defaultSize: { w: 3, h: 4 },
      minSize: { w: 2, h: 3 }
    },
    {
      key: 'kpi-tickets',
      title: 'Active Tickets',
      component: () => (
        <KPICard
          title="Active Tickets"
          value={(kpis?.tickets?.current || 0).toLocaleString()}
          trend={{ value: kpis?.tickets?.growth || 0, label: 'vs prev' }}
          icon={<AlertCircle className="h-4 w-4 text-muted-foreground" />}
          loading={loading}
        />
      ),
      defaultSize: { w: 3, h: 4 },
      minSize: { w: 2, h: 3 }
    },
    {
      key: 'kpi-conversion',
      title: 'Conversion Rate',
      component: () => (
        <KPICard
          title="Conversion Rate"
          value={`${((kpis?.conversion?.current || 0) * 100).toFixed(1)}%`}
          trend={{ value: kpis?.conversion?.growth || 0, label: 'vs prev' }}
          icon={<CheckCircle className="h-4 w-4 text-muted-foreground" />}
          loading={loading}
        />
      ),
      defaultSize: { w: 3, h: 4 },
      minSize: { w: 2, h: 3 }
    },
    {
      key: 'revenue-trend',
      title: 'Revenue Trend',
      component: () => (
        <RevenueTrendChart
          data={loading ? [] : revenueData}
          comparison={true}
          height={300}
        />
      ),
      defaultSize: { w: 8, h: 10 },
      minSize: { w: 6, h: 8 }
    },
    {
      key: 'pipeline-funnel',
      title: 'Conversion Funnel',
      component: () => (
        <PipelineFunnel
          data={loading ? [] : funnelData}
          height={300}
        />
      ),
      defaultSize: { w: 4, h: 10 },
      minSize: { w: 3, h: 8 }
    },
    {
      key: 'stock-aging',
      title: 'Stock Aging & Inventory Health',
      component: () => (
        <StockAgingTable data={[]}
          maxRows={5} // Keep it small for dashboard view
        />
      ),
      defaultSize: { w: 8, h: 11 },
      minSize: { w: 6, h: 8 }
    },
    {
      key: 'cash-position',
      title: 'Cash Position',
      component: () => (
        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-sm font-medium text-green-800">Available Cash</p>
              <p className="text-2xl font-bold text-green-900 mt-1">
                {loading ? '—' : formatCurrency(cashPosition?.cashRegister?.balance || 0)}
              </p>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm font-medium text-blue-800">Net Position</p>
              <p className="text-2xl font-bold text-blue-900 mt-1">
                {loading ? '—' : formatCurrency(cashPosition?.netPosition || 0)}
              </p>
            </div>
          </div>
          <div className="pt-2">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-gray-600">Receivables</span>
              <span className="text-sm font-medium text-green-600">+{formatCurrency(cashPosition?.receivables || 0)}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mb-3">
              <div className="bg-green-500 h-1.5 rounded-full" style={{ width: '100%' }}></div>
            </div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-gray-600">Payables</span>
              <span className="text-sm font-medium text-red-600">-{formatCurrency(cashPosition?.payables || 0)}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div
                className="bg-red-500 h-1.5 rounded-full"
                style={{ width: `${Math.min(100, ((cashPosition?.payables || 0) / Math.max(1, cashPosition?.receivables || 1)) * 100)}%` }}
              ></div>
            </div>
          </div>
        </div>
      ),
      defaultSize: { w: 4, h: 8 },
      minSize: { w: 3, h: 6 }
    },
    {
      key: 'activity-feed',
      title: 'Recent Activity',
      component: () => (
        <ActivityFeed
          events={[]} // Provide proper events mapping here later
          height={400}
        />
      ),
      defaultSize: { w: 12, h: 12 },
      minSize: { w: 6, h: 8 }
    }
  ]

  const initialLayout = loadLayout() || [
    { i: 'kpi-revenue', x: 0, y: 0, w: 3, h: 4 },
    { i: 'kpi-pipeline', x: 3, y: 0, w: 3, h: 4 },
    { i: 'kpi-tickets', x: 6, y: 0, w: 3, h: 4 },
    { i: 'kpi-conversion', x: 9, y: 0, w: 3, h: 4 },
    { i: 'revenue-trend', x: 0, y: 4, w: 8, h: 10 },
    { i: 'pipeline-funnel', x: 8, y: 4, w: 4, h: 10 },
    { i: 'stock-aging', x: 0, y: 14, w: 8, h: 11 },
    { i: 'cash-position', x: 8, y: 14, w: 4, h: 8 }
  ]

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Operations Intelligence</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Real-time insights across sales, inventory, and customer service
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select value={timeRange} onValueChange={(val: any) => setTimeRange(val)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert: any) => (
            <Alert key={alert.id} variant={alert.severity === 'CRITICAL' ? 'destructive' : 'default'} className={
              alert.severity === 'WARNING' ? 'border-yellow-500 bg-yellow-50 text-yellow-900 [&>svg]:text-yellow-600' : ''
            }>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{alert.rule.metric} Alert: {alert.rule.name}</AlertTitle>
              <AlertDescription>
                {alert.message}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      <WidgetGrid
        widgets={AVAILABLE_WIDGETS}
        initialLayout={initialLayout}
        onLayoutChange={saveLayout}
        role="MANAGER"
        editable={true}
        rowHeight={30}
      />
    </div>
  )
}
