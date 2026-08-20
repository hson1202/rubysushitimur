import React, { useState, useEffect } from 'react'
import './Dashboard.css'
import axios from 'axios'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import '../../i18n'
import config from '../../config/config'
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts'

axios.defaults.timeout = 30000

const useViewport = () => {
  const [width, setWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  )

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return width
}

const Dashboard = ({ url }) => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const viewportWidth = useViewport()
  const isMobile = viewportWidth <= 768
  const chartHeight = viewportWidth <= 768 ? 200 : viewportWidth <= 1024 ? 260 : 300
  const chartMargin = {
    top: 8,
    right: isMobile ? 8 : 20,
    left: isMobile ? -14 : 0,
    bottom: isMobile ? 4 : 0
  }

  const [stats, setStats] = useState({
    totalOrders: 0,
    totalRevenue: 0,
    pendingOrders: 0,
    completedOrders: 0,
    totalUsers: 0,
    totalProducts: 0
  })

  const [timeStats, setTimeStats] = useState({
    today: { orders: 0, revenue: 0 },
    week: { orders: 0, revenue: 0 },
    month: { orders: 0, revenue: 0 },
    quarter: { orders: 0, revenue: 0 },
    year: { orders: 0, revenue: 0 }
  })

  const [topProducts, setTopProducts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [trends, setTrends] = useState({
    orders: 0,
    revenue: 0,
    users: 0,
    products: 0,
    completed: 0
  })

  const [timeBasedData, setTimeBasedData] = useState([])
  const [isTimeBasedLoading, setIsTimeBasedLoading] = useState(false)
  const [timeBasedError, setTimeBasedError] = useState('')
  const [chartFilters, setChartFilters] = useState({
    days: 7,
    granularity: 'day',
    metric: 'revenue',
    chartType: 'line'
  })
  const [showComparisonTable, setShowComparisonTable] = useState(false)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  useEffect(() => {
    fetchTimeBasedStats()
  }, [chartFilters.days, chartFilters.granularity, chartFilters.metric])

  const calculateTrends = (currentStats, previousStats) => {
    const nextTrends = {
      orders: 0,
      revenue: 0,
      users: 0,
      products: 0,
      completed: 0,
      pending: 0
    }

    if (previousStats.lastMonth && previousStats.lastMonth.orders > 0) {
      nextTrends.orders = Math.round(((currentStats.currentMonth.orders - previousStats.lastMonth.orders) / previousStats.lastMonth.orders) * 100)
    } else if (currentStats.currentMonth && currentStats.currentMonth.orders > 0) {
      nextTrends.orders = 100
    }

    if (previousStats.lastMonth && previousStats.lastMonth.revenue > 0) {
      nextTrends.revenue = Math.round(((currentStats.currentMonth.revenue - previousStats.lastMonth.revenue) / previousStats.lastMonth.revenue) * 100)
    } else if (currentStats.currentMonth && currentStats.currentMonth.revenue > 0) {
      nextTrends.revenue = 100
    }

    if (previousStats.lastMonth && previousStats.lastMonth.users > 0) {
      nextTrends.users = Math.round(((currentStats.totalUsers - previousStats.lastMonth.users) / previousStats.lastMonth.users) * 100)
    } else if (currentStats.totalUsers > 0) {
      nextTrends.users = 100
    }

    if (previousStats.lastMonth && previousStats.lastMonth.products > 0) {
      nextTrends.products = Math.round(((currentStats.totalProducts - previousStats.lastMonth.products) / previousStats.lastMonth.products) * 100)
    } else if (currentStats.totalProducts > 0) {
      nextTrends.products = 100
    }

    if (previousStats.lastMonth && previousStats.lastMonth.completed > 0) {
      nextTrends.completed = Math.round(((currentStats.currentMonth.completed - previousStats.lastMonth.completed) / previousStats.lastMonth.completed) * 100)
    } else if (currentStats.currentMonth?.completed > 0) {
      nextTrends.completed = 100
    }

    if (previousStats.lastMonth && previousStats.lastMonth.pending > 0) {
      nextTrends.pending = Math.round(((currentStats.pendingOrders - previousStats.lastMonth.pending) / previousStats.lastMonth.pending) * 100)
    } else if (currentStats.pendingOrders > 0) {
      nextTrends.pending = 100
    }

    return nextTrends
  }

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true)

      try {
        await axios.get(`${url}/`)
      } catch {
        throw new Error('Cannot connect to backend server')
      }

      const adminToken = localStorage.getItem('adminToken')
      if (!adminToken) {
        alert(t('dashboard.adminNotLoggedIn'))
        setIsLoading(false)
        return
      }

      const [statsResponse, timeResponse, topProductsResponse] = await Promise.allSettled([
        axios.get(`${config.BACKEND_URL}/api/admin/stats`, { headers: { token: adminToken } }),
        axios.get(`${config.BACKEND_URL}/api/admin/time-stats`, { headers: { token: adminToken } }),
        axios.get(`${config.BACKEND_URL}/api/admin/top-products?limit=3`, { headers: { token: adminToken } })
      ])

      if (statsResponse.status === 'fulfilled' && statsResponse.value.data) {
        const currentStats = statsResponse.value.data
        setStats(currentStats)
        setTrends(calculateTrends(currentStats, currentStats))
      } else {
        setStats({
          totalOrders: 0,
          totalRevenue: 0,
          pendingOrders: 0,
          completedOrders: 0,
          totalUsers: 0,
          totalProducts: 0
        })
        setTrends({ orders: 0, revenue: 0, users: 0, products: 0, completed: 0 })
      }

      if (timeResponse.status === 'fulfilled' && timeResponse.value.data) {
        setTimeStats(timeResponse.value.data)
      } else {
        setTimeStats({
          today: { orders: 0, revenue: 0 },
          week: { orders: 0, revenue: 0 },
          month: { orders: 0, revenue: 0 },
          quarter: { orders: 0, revenue: 0 },
          year: { orders: 0, revenue: 0 }
        })
      }

      if (topProductsResponse.status === 'fulfilled' && topProductsResponse.value.data) {
        setTopProducts(topProductsResponse.value.data.data || [])
      } else {
        setTopProducts([])
      }
    } catch {
      setStats({
        totalOrders: 0,
        totalRevenue: 0,
        pendingOrders: 0,
        completedOrders: 0,
        totalUsers: 0,
        totalProducts: 0
      })
      setTimeStats({
        today: { orders: 0, revenue: 0 },
        week: { orders: 0, revenue: 0 },
        month: { orders: 0, revenue: 0 },
        quarter: { orders: 0, revenue: 0 },
        year: { orders: 0, revenue: 0 }
      })
      setTrends({ orders: 0, revenue: 0, users: 0, products: 0, completed: 0 })
    } finally {
      setIsLoading(false)
    }
  }

  const fetchTimeBasedStats = async () => {
    try {
      setIsTimeBasedLoading(true)
      setTimeBasedError('')

      const adminToken = localStorage.getItem('adminToken')
      if (!adminToken) {
        setTimeBasedError(t('dashboard.adminNotLoggedInShort'))
        setIsTimeBasedLoading(false)
        return
      }

      const params = new URLSearchParams({
        days: String(chartFilters.days),
        granularity: chartFilters.granularity,
        metric: chartFilters.metric
      })

      const response = await axios.get(
        `${config.BACKEND_URL}/api/admin/time-based-stats?${params.toString()}`,
        { headers: { token: adminToken } }
      )

      if (response.data && response.data.success && Array.isArray(response.data.data)) {
        setTimeBasedData(response.data.data)
      } else if (Array.isArray(response.data)) {
        setTimeBasedData(response.data)
      } else {
        setTimeBasedError(t('dashboard.noDataForTimeRange'))
        setTimeBasedData([])
      }
    } catch {
      setTimeBasedError(t('dashboard.noDataForTimeRange'))
      setTimeBasedData([])
    } finally {
      setIsTimeBasedLoading(false)
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('hu-HU', {
      style: 'currency',
      currency: 'HUF',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  const formatChartLabel = (dateString, granularity) => {
    try {
      const d = new Date(dateString)
      const locale = i18n?.language === 'vi' ? 'vi-VN' : i18n?.language === 'hu' ? 'hu-HU' : 'en-US'

      if (granularity === 'month') {
        return new Intl.DateTimeFormat(locale, { month: '2-digit', year: '2-digit' }).format(d)
      }

      if (granularity === 'week') {
        const weekStart = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).format(d)
        return `${t('dashboard.week')} ${weekStart}`
      }

      return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).format(d)
    } catch {
      return ''
    }
  }

  const dynamicChartData = (timeBasedData || []).map(point => ({
    label: formatChartLabel(point.date, chartFilters.granularity),
    value: point.value || 0
  }))

  const comparisonRows = dynamicChartData.map((row, index) => {
    if (index === 0) {
      return { ...row, diff: 0, diffPercent: 0 }
    }
    const prev = dynamicChartData[index - 1]
    const diff = row.value - prev.value
    const diffPercent = prev.value ? Math.round((diff / prev.value) * 100) : 0
    return { ...row, diff, diffPercent }
  })

  const trendClass = (value) => (value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral')

  const hasTrendData = (current, previous) => (current || 0) > 0 || (previous || 0) > 0

  const renderTrend = (value, current, previous) => {
    if (!hasTrendData(current, previous)) return null
    return (
      <div className={`stat-trend ${trendClass(value)}`}>
        {value > 0 ? '▲' : value < 0 ? '▼' : '—'} {Math.abs(value)}%
      </div>
    )
  }

  const updateChartFilter = (key, value) => {
    setChartFilters(prev => ({ ...prev, [key]: value }))
  }

  const dayOptions = [7, 30, 90, 365]
  const granularityOptions = [
    { value: 'day', label: t('dashboard.day') },
    { value: 'week', label: t('dashboard.week') },
    { value: 'month', label: t('dashboard.month') }
  ]
  const metricOptions = [
    { value: 'revenue', label: t('dashboard.revenue') },
    { value: 'totalOrders', label: t('dashboard.totalOrders') }
  ]
  const chartTypeOptions = [
    { value: 'line', label: t('dashboard.lineChart') },
    { value: 'bar', label: t('dashboard.barChart') }
  ]

  const quickActions = [
    { path: '/admin/orders', label: t('dashboard.viewAllOrders'), desc: t('dashboard.viewAllOrdersDesc'), icon: (
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    )},
    { path: '/admin/products', label: t('dashboard.manageProducts'), desc: t('dashboard.manageProductsDesc'), icon: (
      <>
        <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
        <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
        <line x1="6" y1="1" x2="6" y2="4" />
        <line x1="10" y1="1" x2="10" y2="4" />
        <line x1="14" y1="1" x2="14" y2="4" />
      </>
    )},
    { path: '/admin/users', label: t('dashboard.userManagement'), desc: t('dashboard.userManagementDesc'), icon: (
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    )},
    { path: '/admin/category', label: t('dashboard.categories'), desc: t('dashboard.categoriesDesc'), icon: (
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    )},
    { path: '/admin/blog', label: t('dashboard.blogManagement'), desc: t('dashboard.blogManagementDesc'), icon: (
      <>
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </>
    )}
  ]

  if (isLoading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner" />
        <p>{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <div className="dashboard">

      {/* Header */}
      <div className="dashboard-header">
        <div className="dashboard-header-text">
          <h1>{t('dashboard.title') || 'Dashboard'}</h1>
          <p>{t('dashboard.subtitle') || t('dashboard.timeStatsDescription')}</p>
        </div>
        <button
          type="button"
          className="dashboard-refresh-btn"
          onClick={fetchDashboardData}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          {t('common.refresh') || 'Refresh'}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="stats-grid">
        <div className="stat-card revenue">
          <div className="stat-card-header">
            <div className="stat-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            {renderTrend(
              trends.revenue,
              stats.currentMonth?.revenue,
              stats.lastMonth?.revenue
            )}
          </div>
          <p className="stat-label">{t('dashboard.monthRevenue')}</p>
          <h3>{formatCurrency(stats.currentMonth?.revenue || 0)}</h3>
        </div>

        <div className="stat-card orders">
          <div className="stat-card-header">
            <div className="stat-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              </svg>
            </div>
            {renderTrend(
              trends.orders,
              stats.currentMonth?.orders,
              stats.lastMonth?.orders
            )}
          </div>
          <p className="stat-label">{t('dashboard.monthOrders')}</p>
          <h3>{(stats.currentMonth?.orders || 0).toLocaleString()}</h3>
        </div>

        <div className="stat-card pending">
          <div className="stat-card-header">
            <div className="stat-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            {(stats.pendingOrders || 0) > 0 && (
              <span className="stat-badge urgent">{stats.pendingOrders}</span>
            )}
          </div>
          <p className="stat-label">{t('dashboard.pendingOrders')}</p>
          <h3>{(stats.pendingOrders || 0).toLocaleString()}</h3>
          <div className="stat-footer">
            {(stats.pendingOrders || 0) > 0 ? (
              <button
                type="button"
                className="stat-cta"
                onClick={() => navigate('/admin/orders')}
              >
                {t('dashboard.viewPendingOrders')}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            ) : (
              <span className="stat-muted">{t('dashboard.allClear')}</span>
            )}
          </div>
        </div>

        <div className="stat-card completed">
          <div className="stat-card-header">
            <div className="stat-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            {renderTrend(
              trends.completed,
              stats.currentMonth?.completed,
              stats.lastMonth?.completed
            )}
          </div>
          <p className="stat-label">{t('dashboard.monthCompleted')}</p>
          <h3>{(stats.currentMonth?.completed || 0).toLocaleString()}</h3>
        </div>
      </div>

      {/* Today overview */}
      <div className="quick-stats-section">
        <div className="section-title-bar">
          <h2>{t('dashboard.todayOverview')}</h2>
        </div>
        <div className="quick-stats-grid">
          <div className="quick-stat-card today-orders">
            <div className="quick-stat-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              </svg>
            </div>
            <div className="quick-stat-content">
              <div className="quick-stat-value">{timeStats.today?.orders || 0}</div>
              <div className="quick-stat-label">{t('dashboard.ordersToday')}</div>
            </div>
          </div>

          <div className="quick-stat-card today-revenue">
            <div className="quick-stat-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <div className="quick-stat-content">
              <div className="quick-stat-value">{formatCurrency(timeStats.today?.revenue || 0)}</div>
              <div className="quick-stat-label">{t('dashboard.revenueToday')}</div>
            </div>
          </div>

          <div className="quick-stat-card top-product">
            <div className="quick-stat-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </div>
            <div className="quick-stat-content">
              {topProducts.length > 0 ? (
                <>
                  <div className="quick-stat-value top-product-name">{topProducts[0].name}</div>
                  <div className="quick-stat-label">{topProducts[0].totalSold} {t('dashboard.sold')}</div>
                  {topProducts.length > 1 && (
                    <div className="top-products-extra">
                      {topProducts.slice(1).map((p, i) => (
                        <div key={i} className="extra-product">
                          <span>{p.name}</span>
                          <span>×{p.totalSold}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="quick-stat-value">—</div>
                  <div className="quick-stat-label">{t('dashboard.topProduct')}</div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Analytics */}
      <div className="time-stats-section">
        <div className="time-stats-header">
          <div className="time-stats-header-left">
            <h2>{t('dashboard.timeStats')}</h2>
            <p>{t('dashboard.timeStatsDescription')}</p>
          </div>

          {/* Desktop filters */}
          <div className="chart-filters-desktop">
            <div className="time-filter-group">
              <label>{t('dashboard.timeRange')}</label>
              <select
                value={chartFilters.days}
                onChange={(e) => updateChartFilter('days', Number(e.target.value))}
              >
                {dayOptions.map(d => (
                  <option key={d} value={d}>{d} {t('dashboard.day')}</option>
                ))}
              </select>
            </div>
            <div className="time-filter-group">
              <label>{t('dashboard.granularity')}</label>
              <select
                value={chartFilters.granularity}
                onChange={(e) => updateChartFilter('granularity', e.target.value)}
              >
                {granularityOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="time-filter-group">
              <label>{t('dashboard.metric')}</label>
              <select
                value={chartFilters.metric}
                onChange={(e) => updateChartFilter('metric', e.target.value)}
              >
                {metricOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="time-filter-group">
              <label>{t('dashboard.chartType')}</label>
              <select
                value={chartFilters.chartType}
                onChange={(e) => updateChartFilter('chartType', e.target.value)}
              >
                {chartTypeOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="time-stats-body">
          {/* Mobile filters – dropdown grid */}
          <div className="chart-filters-mobile">
            <div className="mobile-filter-grid">
              <div className="mobile-filter-select-group">
                <label className="mobile-filter-label">{t('dashboard.timeRange')}</label>
                <select
                  className="mobile-filter-select"
                  value={chartFilters.days}
                  onChange={(e) => updateChartFilter('days', Number(e.target.value))}
                >
                  {dayOptions.map(d => (
                    <option key={d} value={d}>{d} {t('dashboard.day')}</option>
                  ))}
                </select>
              </div>
              <div className="mobile-filter-select-group">
                <label className="mobile-filter-label">{t('dashboard.granularity')}</label>
                <select
                  className="mobile-filter-select"
                  value={chartFilters.granularity}
                  onChange={(e) => updateChartFilter('granularity', e.target.value)}
                >
                  {granularityOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="mobile-filter-select-group">
                <label className="mobile-filter-label">{t('dashboard.metric')}</label>
                <select
                  className="mobile-filter-select"
                  value={chartFilters.metric}
                  onChange={(e) => updateChartFilter('metric', e.target.value)}
                >
                  {metricOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="mobile-filter-select-group">
                <label className="mobile-filter-label">{t('dashboard.chartType')}</label>
                <select
                  className="mobile-filter-select"
                  value={chartFilters.chartType}
                  onChange={(e) => updateChartFilter('chartType', e.target.value)}
                >
                  {chartTypeOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="time-stats-chart-card">
            {isTimeBasedLoading ? (
              <div className="time-based-loading">
                <div className="loading-spinner" />
                <p>{t('common.loading')}</p>
              </div>
            ) : timeBasedError ? (
              <div className="time-based-error">
                <p>{timeBasedError}</p>
              </div>
            ) : dynamicChartData.length === 0 ? (
              <div className="time-based-error">
                <p>{t('dashboard.noDataForTimeRange')}</p>
              </div>
            ) : (
              <div className="chart-wrapper" key={`chart-${viewportWidth}`}>
                <ResponsiveContainer width="100%" height={chartHeight}>
                  <ComposedChart data={dynamicChartData} margin={chartMargin}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: isMobile ? 10 : 12, fill: '#94a3b8' }}
                      interval={isMobile ? 'preserveStartEnd' : 0}
                      angle={isMobile ? -30 : 0}
                      textAnchor={isMobile ? 'end' : 'middle'}
                      height={isMobile ? 46 : 28}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: isMobile ? 10 : 12, fill: '#94a3b8' }}
                      width={isMobile ? 46 : 58}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(value) =>
                        chartFilters.metric === 'revenue'
                          ? (value >= 1000 ? `${(value / 1000).toFixed(0)}k` : `${value}`)
                          : value
                      }
                    />
                    <Tooltip
                      contentStyle={{
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                        fontSize: '13px'
                      }}
                      formatter={(value) => {
                        if (chartFilters.metric === 'revenue') {
                          return [formatCurrency(value), t('dashboard.revenue')]
                        }
                        return [value, t('dashboard.orders')]
                      }}
                      labelFormatter={(label) => label}
                    />
                    {!isMobile && <Legend wrapperStyle={{ fontSize: '12px', color: '#64748b' }} />}
                    {chartFilters.chartType === 'bar' && (
                      <Bar
                        dataKey="value"
                        name={chartFilters.metric === 'revenue' ? t('dashboard.revenue') : t('dashboard.totalOrders')}
                        barSize={isMobile ? 18 : 24}
                        radius={[4, 4, 0, 0]}
                        fill="#334155"
                      />
                    )}
                    {chartFilters.chartType === 'line' && (
                      <Line
                        type="monotone"
                        dataKey="value"
                        name={chartFilters.metric === 'revenue' ? t('dashboard.revenue') : t('dashboard.totalOrders')}
                        stroke="#334155"
                        strokeWidth={isMobile ? 2 : 2.5}
                        dot={isMobile ? false : { r: 3, fill: '#334155', strokeWidth: 0 }}
                        activeDot={{ r: 5, strokeWidth: 0 }}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Comparison table */}
            {comparisonRows.length > 0 && (
              <div className="time-comparison-section">
                <button
                  type="button"
                  className="toggle-comparison-btn"
                  onClick={() => setShowComparisonTable(!showComparisonTable)}
                >
                  {showComparisonTable ? t('dashboard.hideDetailedComparison') : t('dashboard.showDetailedComparison')}
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ transform: showComparisonTable ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {showComparisonTable && (
                  <div className="table-responsive time-comparison-table-wrapper">
                    <table className="time-comparison-table">
                      <thead>
                        <tr>
                          <th>{t('dashboard.timeRange')}</th>
                          <th>
                            {chartFilters.metric === 'revenue'
                              ? t('dashboard.revenue')
                              : t('dashboard.totalOrders')}
                          </th>
                          <th>{t('dashboard.trendFromLastMonth')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparisonRows.map((row, index) => (
                          <tr key={row.label || index}>
                            <td>{row.label}</td>
                            <td>
                              {chartFilters.metric === 'revenue'
                                ? formatCurrency(row.value)
                                : (row.value || 0).toLocaleString()}
                            </td>
                            <td className={
                              row.diff > 0 ? 'trend-positive' :
                                row.diff < 0 ? 'trend-negative' : 'trend-neutral'
                            }>
                              {index === 0
                                ? t('dashboard.trendNoChange') || '—'
                                : `${row.diff > 0 ? '+' : ''}${chartFilters.metric === 'revenue'
                                  ? formatCurrency(row.diff)
                                  : row.diff.toLocaleString()
                                } (${row.diffPercent > 0 ? '+' : ''}${row.diffPercent}%)`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Period summary mini cards */}
            <div className="time-stats-side-cards">
              <div className="time-stat-card">
                <h3>{t('dashboard.today')}</h3>
                <div className="stat-item">
                  <span className="stat-label">{t('dashboard.orders')}</span>
                  <span className="stat-value">{timeStats.today?.orders || 0}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">{t('dashboard.revenue')}</span>
                  <span className="stat-value">{formatCurrency(timeStats.today?.revenue || 0)}</span>
                </div>
              </div>
              <div className="time-stat-card">
                <h3>{t('dashboard.thisMonth')}</h3>
                <div className="stat-item">
                  <span className="stat-label">{t('dashboard.orders')}</span>
                  <span className="stat-value">{timeStats.month?.orders || 0}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">{t('dashboard.revenue')}</span>
                  <span className="stat-value">{formatCurrency(timeStats.month?.revenue || 0)}</span>
                </div>
              </div>
              <div className="time-stat-card">
                <h3>{t('dashboard.thisYear')}</h3>
                <div className="stat-item">
                  <span className="stat-label">{t('dashboard.orders')}</span>
                  <span className="stat-value">{timeStats.year?.orders || 0}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">{t('dashboard.revenue')}</span>
                  <span className="stat-value">{formatCurrency(timeStats.year?.revenue || 0)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="quick-actions">
        <div className="section-title-bar">
          <h2>{t('dashboard.quickActions')}</h2>
        </div>
        <div className="actions-grid">
          {quickActions.map(action => (
            <button
              key={action.path}
              type="button"
              className="action-btn"
              onClick={() => navigate(action.path)}
            >
              <div className="action-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {action.icon}
                </svg>
              </div>
              <div>
                <strong>{action.label}</strong>
                <small>{action.desc}</small>
              </div>
            </button>
          ))}
        </div>
      </div>

    </div>
  )
}

export default Dashboard
