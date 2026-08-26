'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Download, Filter, ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StockItem {
  id: number
  sku: string
  name: string
  category: string
  stock: number
  reorderLevel: number
  unitOfMeasure: string
  lastRestocked: string | null
  value: number // stock * costPrice
  agingDays: number
  agingBucket: string
}

interface StockAgingTableProps {
  maxRows?: number
  data: StockItem[]
  className?: string
  onExport?: () => void
}

const AGING_BUCKETS = [
  { key: 'all', label: 'All' },
  { key: 'fresh', label: 'Fresh (0-30 days)' },
  { key: 'aging', label: 'Aging (31-60 days)' },
  { key: 'old', label: 'Old (61-90 days)' },
  { key: 'critical', label: 'Critical (90+ days)' }
]

const SORTABLE_COLUMNS = ['sku', 'name', 'category', 'stock', 'reorderLevel', 'unitOfMeasure', 'value', 'agingDays', 'lastRestocked', 'agingBucket'] as const
type SortableColumn = typeof SORTABLE_COLUMNS[number]

export function StockAgingTable({
  data,
  className,
  onExport
}: StockAgingTableProps) {
  const [sortConfig, setSortConfig] = useState<{ key: SortableColumn; direction: 'asc' | 'desc' } | null>({
    key: 'agingDays',
    direction: 'desc'
  })
  const [filterBucket, setFilterBucket] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')

  const filteredData = useMemo(() => {
    return data.filter(item => {
      // Search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        if (
          !item.sku.toLowerCase().includes(term) &&
          !item.name.toLowerCase().includes(term) &&
          !item.category.toLowerCase().includes(term)
        ) {
          return false
        }
      }

      // Aging bucket filter
      if (filterBucket !== 'all' && item.agingBucket !== filterBucket) {
        return false
      }

      return true
    })
  }, [data, searchTerm, filterBucket])

  const sortedData = useMemo(() => {
    if (!sortConfig) return filteredData

    return [...filteredData].sort((a, b) => {
      const aVal = a[sortConfig.key]
      const bVal = b[sortConfig.key]

      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.direction === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal
      }

      return 0
    })
  }, [filteredData, sortConfig])

  const handleSort = (key: SortableColumn) => {
    setSortConfig(current => ({
      key,
      direction: current?.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  const getSortIcon = (key: SortableColumn) => {
    if (sortConfig?.key !== key) return null
    return sortConfig.direction === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
  }

  const formatCurrency = (value: number) => {
    if (value >= 1e7) return `₹${(value / 1e7).toFixed(2)}Cr`
    if (value >= 1e5) return `₹${(value / 1e5).toFixed(2)}L`
    if (value >= 1e3) return `₹${(value / 1e3).toFixed(2)}K`
    return `₹${value.toLocaleString()}`
  }

  const getAgingBadge = (bucket: string) => {
    const styles: Record<string, string> = {
      fresh: 'bg-green-100 text-green-700',
      aging: 'bg-yellow-100 text-yellow-700',
      old: 'bg-orange-100 text-orange-700',
      critical: 'bg-red-100 text-red-700'
    }
    return styles[bucket] || 'bg-gray-100 text-gray-700'
  }

  const getStockStatus = (stock: number, reorderLevel: number) => {
    if (stock <= 0) return { label: 'Out of Stock', className: 'bg-red-100 text-red-700' }
    if (stock <= reorderLevel) return { label: 'Low Stock', className: 'bg-yellow-100 text-yellow-700' }
    return { label: 'In Stock', className: 'bg-green-100 text-green-700' }
  }

  const exportToCSV = () => {
    if (onExport) {
      onExport()
      return
    }

    const headers = ['SKU', 'Name', 'Category', 'Stock', 'Reorder Level', 'UOM', 'Value', 'Last Restocked', 'Aging (Days)', 'Aging Bucket', 'Status']
    const rows = sortedData.map(item => {
      const status = getStockStatus(item.stock, item.reorderLevel)
      return [
        item.sku,
        item.name,
        item.category,
        item.stock.toString(),
        item.reorderLevel.toString(),
        item.unitOfMeasure,
        formatCurrency(item.value),
        item.lastRestocked || 'Never',
        item.agingDays.toString(),
        item.agingBucket,
        status.label
      ]
    })

    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `stock-aging-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  // Summary stats
  const stats = useMemo(() => ({
    totalItems: data.length,
    totalValue: data.reduce((sum, item) => sum + item.value, 0),
    lowStockCount: data.filter(item => item.stock <= item.reorderLevel && item.stock > 0).length,
    outOfStockCount: data.filter(item => item.stock <= 0).length,
    criticalAgingCount: data.filter(item => item.agingBucket === 'critical').length
  }), [data])

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Stock Aging Analysis</CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportToCSV} className="gap-1">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
          <div>
            <p className="text-xs text-muted-foreground">Total Items</p>
            <p className="text-lg font-bold">{stats.totalItems}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Value</p>
            <p className="text-lg font-bold">{formatCurrency(stats.totalValue)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Low Stock</p>
            <p className="text-lg font-bold text-yellow-600">{stats.lowStockCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Out of Stock</p>
            <p className="text-lg font-bold text-red-600">{stats.outOfStockCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Critical Aging</p>
            <p className="text-lg font-bold text-red-600">{stats.criticalAgingCount}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1 max-w-md">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search SKU, name, category..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterBucket} onValueChange={(value) => setFilterBucket(value as string)}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All Buckets" />
            </SelectTrigger>
            <SelectContent>
              {AGING_BUCKETS.map(bucket => (
                <SelectItem key={bucket.key} value={bucket.key}>
                  {bucket.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {(['sku', 'name', 'category', 'stock', 'reorderLevel', 'unitOfMeasure', 'value', 'lastRestocked', 'agingDays', 'agingBucket'] as const).map(col => (
                  <TableHead
                    key={col}
                    className={cn(
                      'cursor-pointer select-none',
                      SORTABLE_COLUMNS.includes(col) && 'hover:bg-gray-50'
                    )}
                    onClick={() => SORTABLE_COLUMNS.includes(col) && handleSort(col as SortableColumn)}
                  >
                    <div className="flex items-center gap-1">
                      {col === 'sku' && 'SKU'}
                      {col === 'name' && 'Product Name'}
                      {col === 'category' && 'Category'}
                      {col === 'stock' && 'Stock'}
                      {col === 'reorderLevel' && 'Reorder Level'}
                      {col === 'unitOfMeasure' && 'UOM'}
                      {col === 'value' && 'Stock Value'}
                      {col === 'lastRestocked' && 'Last Restocked'}
                      {col === 'agingDays' && 'Aging (Days)'}
                      {col === 'agingBucket' && 'Aging Bucket'}
                      {getSortIcon(col as SortableColumn)}
                    </div>
                  </TableHead>
                ))}
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                    No stock items found
                  </TableCell>
                </TableRow>
              ) : (
                sortedData.map(item => {
                  const status = getStockStatus(item.stock, item.reorderLevel)
                  return (
                    <TableRow key={item.id} className={item.stock <= 0 ? 'bg-red-50' : item.stock <= item.reorderLevel ? 'bg-yellow-50' : ''}>
                      <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell className="tabular-nums font-medium">{item.stock}</TableCell>
                      <TableCell className="tabular-nums">{item.reorderLevel}</TableCell>
                      <TableCell>{item.unitOfMeasure}</TableCell>
                      <TableCell className="tabular-nums font-medium">{formatCurrency(item.value)}</TableCell>
                      <TableCell>{item.lastRestocked || 'Never'}</TableCell>
                      <TableCell className="tabular-nums font-medium">
                        {item.agingDays > 90 ? <span className="text-red-600 font-bold">{item.agingDays}</span> : item.agingDays}
                      </TableCell>
                      <TableCell>
                        <span className={cn('px-2 py-0.5 rounded text-xs font-medium', getAgingBadge(item.agingBucket))}>
                          {item.agingBucket.charAt(0).toUpperCase() + item.agingBucket.slice(1)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={cn('px-2 py-0.5 rounded text-xs font-medium', status.className)}>
                          {status.label}
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {sortedData.length > 0 && (
          <div className="mt-4 text-sm text-muted-foreground text-center">
            Showing {sortedData.length} of {data.length} items
          </div>
        )}
      </CardContent>
    </Card>
  )
}