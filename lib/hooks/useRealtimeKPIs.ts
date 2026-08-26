'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'

export interface RealtimeKPIUpdate {
  widgetKey: string
  value: number | string
  trend?: number
  timestamp: string
}

export interface RealtimeAlert {
  id: string
  ruleId: string
  ruleName: string
  metric: string
  message: string
  severity: 'INFO' | 'WARNING' | 'CRITICAL'
  timestamp: string
}

export interface UseRealtimeKPIsOptions {
  widgets: string[]
  onKPIUpdate?: (update: RealtimeKPIUpdate) => void
  onAlertTriggered?: (alert: RealtimeAlert) => void
  onAlertResolved?: (alert: RealtimeAlert) => void
  token?: string
}

export function useRealtimeKPIs({
  widgets,
  onKPIUpdate,
  onAlertTriggered,
  onAlertResolved,
  token
}: UseRealtimeKPIsOptions) {
  const socketRef = useRef<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const handlersRef = useRef({ onKPIUpdate, onAlertTriggered, onAlertResolved })

  // Keep handlers up to date without triggering effect re-runs
  useEffect(() => {
    handlersRef.current = { onKPIUpdate, onAlertTriggered, onAlertResolved }
  }, [onKPIUpdate, onAlertTriggered, onAlertResolved])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const socketUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001'
    const authToken = token || localStorage.getItem('auth_token')

    if (!authToken) {
      setLastError('No authentication token available')
      return
    }

    const socket = io(socketUrl, {
      auth: { token: authToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      setLastError(null)
      console.log('[useRealtimeKPIs] Connected to WebSocket gateway')
    })

    socket.on('disconnect', (reason) => {
      setConnected(false)
      console.log('[useRealtimeKPIs] Disconnected:', reason)
    })

    socket.on('connect_error', (error) => {
      setLastError(error.message)
      console.error('[useRealtimeKPIs] Connection error:', error.message)
    })

    // Listen for KPI updates
    socket.on('kpi_update', (data: RealtimeKPIUpdate) => {
      if (widgets.includes(data.widgetKey) || widgets.includes('*')) {
        handlersRef.current.onKPIUpdate?.(data)
      }
    })

    // Listen for alerts
    socket.on('alert_triggered', (data: RealtimeAlert) => {
      handlersRef.current.onAlertTriggered?.(data)
    })

    socket.on('alert_resolved', (data: RealtimeAlert) => {
      handlersRef.current.onAlertResolved?.(data)
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
      setConnected(false)
    }
  }, [widgets, token])

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect()
  }, [])

  const reconnect = useCallback(() => {
    socketRef.current?.connect()
  }, [])

  return {
    connected,
    lastError,
    disconnect,
    reconnect
  }
}