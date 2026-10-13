import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import './Orders.css';
import { toast } from 'react-toastify';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import '../../i18n';
import config from '../../config/config';
import { formatFullAddress } from '../../utils/formatAddress';
import { formatRestaurantDateTime, getActiveRestaurantTimeZone, zonedCalendarDayIndex } from '../../utils/timeZone';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Cancelled', label: 'Cancelled' },
  { value: 'Delivered', label: 'Delivered' },
];

const STATUS_COLORS = {
  Pending: '#f59e0b',
  Cancelled: '#ef4444',
  Delivered: '#10b981',
};

const getFulfillmentLabel = (type, t) => {
  switch (type) {
    case 'pickup':
      return t('orders.fulfillment.pickup', 'Pickup');
    case 'dinein':
      return t('orders.fulfillment.dineIn', 'Dine in');
    case 'delivery':
    default:
      return t('orders.fulfillment.delivery', 'Delivery');
  }
};

const formatMoney = (value = 0) => new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(Number(value || 0)));
const formatDateTime = (value) => {
  if (!value) return '';
  return formatRestaurantDateTime(value, 'hu-HU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
};
const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""').trim()}"`;

const Orders = () => {
  const { t } = useTranslation();
  const [orders, setOrders] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('all'); // today/week/month/all
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const audioRef = useRef(null);

  const fetchAllOrders = useCallback(
    async (showToast = false) => {
      try {
        if (showToast) {
          toast.info('🔄 Đang tải orders...', { autoClose: 800 });
        }

        const adminToken = localStorage.getItem('adminToken');
        if (!adminToken) {
          toast.error('Admin token not found. Please login again.');
          return;
        }

        const response = await axios.get(`${config.BACKEND_URL}/api/admin/orders`, {
          headers: { token: adminToken },
        });

        if (response.status === 200) {
          const sortedOrders = response.data.sort((a, b) => {
            if (a.status === 'Pending' && b.status !== 'Pending') return -1;
            if (a.status !== 'Pending' && b.status === 'Pending') return 1;
            const dateA = new Date(a.createdAt || a.date || 0);
            const dateB = new Date(b.createdAt || b.date || 0);
            return dateB - dateA;
          });
          setOrders(sortedOrders);
          if (showToast) {
            toast.success(`✅ Đã tải ${sortedOrders.length} orders`, { autoClose: 1200 });
          }
        }
      } catch (error) {
        if (error.response?.status === 401) {
          toast.error('Session expired. Please login again.');
          localStorage.removeItem('adminToken');
        } else {
          toast.error('Error fetching orders: ' + (error.response?.data?.message || error.message));
        }
      } finally {
        setLoading(false);
      }
    },
    [t]
  );

  const statusHandler = useCallback(
    async (nextStatus, orderId) => {
      if (nextStatus === 'Cancelled') {
        const confirmed = window.confirm(t('orders.cancelConfirm', 'Are you sure you want to cancel this order?'));
        if (!confirmed) return;
      }

      try {
        const adminToken = localStorage.getItem('adminToken');
        if (!adminToken) {
          toast.error('Admin not logged in. Please login again.');
          return;
        }

        const response = await axios.put(
          `${config.BACKEND_URL}/api/admin/orders/${orderId}/status`,
          { status: nextStatus },
          { headers: { token: adminToken } }
        );

        if (response.data.success) {
          await fetchAllOrders();
          toast.success(t('orders.statusUpdateSuccess', 'Order status updated successfully'));
        } else {
          toast.error(response.data.message || t('orders.statusUpdateError', 'Failed to update order status'));
        }
      } catch (error) {
        if (error.response) {
          if (error.response.status === 401) {
            toast.error('Admin session expired. Please login again.');
            localStorage.removeItem('adminToken');
          } else {
            toast.error(`Failed to update order status: ${error.response.data?.message || error.message}`);
          }
        } else if (error.request) {
          toast.error('No response received. Check if backend is running.');
        } else {
          toast.error(`Error: ${error.message}`);
        }
      }
    },
    [fetchAllOrders, t]
  );

  const filteredOrders = useMemo(() => {
    const timeZone = getActiveRestaurantTimeZone();
    const todayIndex = zonedCalendarDayIndex(new Date(), timeZone);

    return orders.filter((order) => {
      const matchSearch =
        !searchTerm ||
        order.customerInfo?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customerInfo?.phone?.includes(searchTerm) ||
        order._id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.shortOrderId?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchStatus = statusFilter === 'all' ? true : order.status === statusFilter;

      // Time filter
      let matchTime = true;
      if (timeFilter !== 'all') {
        const orderDate = new Date(order.createdAt || order.date || 0);
        const orderDayIndex = zonedCalendarDayIndex(orderDate, timeZone);
        const dayGap = todayIndex - orderDayIndex;
        if (timeFilter === 'today') {
          matchTime = dayGap === 0;
        } else if (timeFilter === 'week') {
          matchTime = dayGap >= 0 && dayGap <= 7;
        } else if (timeFilter === 'month') {
          matchTime = dayGap >= 0 && dayGap <= 30;
        }
      }

      return matchSearch && matchStatus && matchTime;
    });
  }, [orders, searchTerm, statusFilter, timeFilter]);

  const statusCounts = useMemo(() => {
    return STATUS_OPTIONS.reduce((acc, opt) => {
      if (opt.value === 'all') {
        acc[opt.value] = orders.length;
      } else {
        acc[opt.value] = orders.filter((o) => o.status === opt.value).length;
      }
      return acc;
    }, {});
  }, [orders]);

  const statusLabelMap = useMemo(() => {
    return STATUS_OPTIONS.filter((opt) => opt.value !== 'all').reduce((acc, opt) => {
      acc[opt.value] = opt.label;
      return acc;
    }, {});
  }, []);

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setStatusFilter('all');
    setTimeFilter('all');
  }, []);

  const showOrderDetails = useCallback((order) => {
    setSelectedOrder(order);
    setShowDetailsModal(true);
  }, []);

  const closeOrderDetails = useCallback(() => {
    setSelectedOrder(null);
    setShowDetailsModal(false);
  }, []);

  const handleExportCSV = useCallback(() => {
    const header = ['Order ID', 'Date', 'Customer', 'Phone', 'Status', 'Total'];
    const rows = filteredOrders.map((o) => [
      o.shortOrderId || o._id,
      formatDateTime(o.createdAt || o.date),
      (o.customerInfo?.name || '').trim(),
      (o.customerInfo?.phone || '').trim(),
      statusLabelMap[o.status] || o.status || '',
      formatMoney(o.amount),
    ]);
    const csvBody = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    const csv = `\uFEFF${csvBody}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'orders.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [filteredOrders, statusLabelMap]);

  useEffect(() => {
    fetchAllOrders();
  }, [fetchAllOrders]);

  useEffect(() => {
    const eventsUrl = `${config.BACKEND_URL}/api/events?channel=orders`;
    const es = new EventSource(eventsUrl);

    es.addEventListener('message', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data?.type === 'order_created') {
          const newOrder = data.payload;
          setOrders((prev) => {
            const exists = prev.some((o) => o._id === newOrder._id);
            if (exists) return prev;
            const next = [newOrder, ...prev];
            return next.sort((a, b) => {
              if (a.status === 'Pending' && b.status !== 'Pending') return -1;
              if (a.status !== 'Pending' && b.status === 'Pending') return 1;
              const dateA = new Date(a.createdAt || a.date || 0);
              const dateB = new Date(b.createdAt || b.date || 0);
              return dateB - dateA;
            });
          });
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => { });
          }
          toast.success(`🆕 New order from ${newOrder?.customerInfo?.name || 'Customer'}`);
        }
      } catch (_) {
        // ignore malformed messages
      }
    });

    return () => {
      es.close();
    };
  }, []);

  if (loading) {
    return (
      <div className="orders-loading">
        <div className="loading-spinner" />
        <p>{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="orders-page">
      <audio ref={audioRef} src={`${config.BACKEND_URL}/sound/thongbao.mp3`} preload="auto" />

      <section className="orders-top">
        <div className="orders-header">
          <div className="header-content">
            <p className="section-label">{t('orders.subtitle', 'Realtime order monitoring')}</p>
            <h1>{t('orders.title')}</h1>
          </div>
          <div className="header-actions">
            <button className="icon-button ghost" onClick={() => fetchAllOrders(true)} title="Refresh">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6"></path>
                <path d="M1 20v-6h6"></path>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
            </button>
          </div>
        </div>

        <div className="status-pills">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`pill ${statusFilter === option.value ? 'active' : ''}`}
              onClick={() => setStatusFilter(option.value)}
            >
              {t(`orders.quick.${option.value}`, option.label)} ({statusCounts[option.value] ?? 0})
            </button>
          ))}
        </div>

        <div className="time-filter-section">
          <label className="filter-label">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            {t('orders.timeFilter', 'Time Range')}:
          </label>
          <div className="time-filter-pills">
            <button
              className={`time-pill ${timeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setTimeFilter('all')}
            >
              {t('orders.time.all', 'All Time')}
            </button>
            <button
              className={`time-pill ${timeFilter === 'today' ? 'active' : ''}`}
              onClick={() => setTimeFilter('today')}
            >
              {t('orders.time.today', 'Today')}
            </button>
            <button
              className={`time-pill ${timeFilter === 'week' ? 'active' : ''}`}
              onClick={() => setTimeFilter('week')}
            >
              {t('orders.time.week', 'Last 7 Days')}
            </button>
            <button
              className={`time-pill ${timeFilter === 'month' ? 'active' : ''}`}
              onClick={() => setTimeFilter('month')}
            >
              {t('orders.time.month', 'Last 30 Days')}
            </button>
          </div>
        </div>
      </section>

      <section className="orders-toolbar">
        <div className="search-group">
          <div className="input-wrapper">
            <span className="input-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </span>
            <input
              type="text"
              placeholder={t('orders.searchPlaceholder', 'Search orders by customer name, phone, or order ID...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button className="clear-pill" onClick={() => setSearchTerm('')}>
                {t('common.clear', 'Clear')}
              </button>
            )}
          </div>
        </div>

        <div className="toolbar-actions">
          {/* Removed redundant refresh button */}
          <button className="ghost-btn" onClick={handleExportCSV}>
            {t('orders.exportCsv', 'Export CSV')}
          </button>
        </div>
      </section>

      <section className="orders-panel">
        <div className="panel-controls">
          <div className="inline-filter">
            <label>{t('orders.status', 'Status')}</label>
            <div className="button-group">
              {STATUS_OPTIONS.filter((s) => s.value !== 'all').map((option) => (
                <button
                  key={option.value}
                  className={`status-button ${statusFilter === option.value ? 'active' : ''}`}
                  onClick={() => setStatusFilter(option.value)}
                >
                  {t(`orders.orderStatus.${option.value}`, option.label)}
                </button>
              ))}
            </div>
          </div>
          <div className="panel-actions">
            {(searchTerm || statusFilter !== 'all') && (
              <button className="link-btn" onClick={clearFilters}>
                {t('orders.resetFilters', 'Reset filters')}
              </button>
            )}
          </div>
        </div>

        <div className="orders-table-wrapper">
          {filteredOrders.length === 0 ? (
            <div className="empty-state">
              <p className="empty-title">{t('orders.noOrders', 'No orders match your filters')}</p>
              <p className="empty-text">{t('orders.tryAdjusting', 'Try another search term or reset the filters.')}</p>
            </div>
          ) : (
            <table className="orders-table">
              <thead>
                <tr>
                  <th>{t('orders.orderId', 'Order')}</th>
                  <th>{t('orders.customer', 'Customer')}</th>
                  <th>{t('orders.items', 'Items')}</th>
                  <th>{t('orders.total', 'Total')}</th>
                  <th>{t('orders.status', 'Status')}</th>
                  <th>{t('orders.details', 'Details')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <OrderRow
                    key={order._id}
                    order={order}
                    onStatusChange={statusHandler}
                    onDetails={() => showOrderDetails(order)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {showDetailsModal && selectedOrder && (
        <OrderDetailsModal order={selectedOrder} onClose={closeOrderDetails} />
      )}
    </div>
  );
};

const OrderRow = React.memo(({ order, onStatusChange, onDetails }) => {
  const { t } = useTranslation();
  const createdAt = order.createdAt ? new Date(order.createdAt) : null;
  const prettyDate = createdAt
    ? createdAt.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
    : 'N/A';
  const prettyTime = createdAt
    ? createdAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : '';
  const items = Array.isArray(order.items) ? order.items : [];
  const previewItems = items.slice(0, 2);
  const remainingItems = Math.max(items.length - 2, 0);
  const deliveryFee = Number(order.deliveryInfo?.deliveryFee ?? 0);
  const systemFee = Number(order.deliveryInfo?.systemFee ?? 0);
  const showDeliveryFee = deliveryFee > 0;
  const showSystemFee = systemFee > 0;
  const fulfillmentType = order.fulfillmentType || 'delivery';
  const fulfillmentLabel = getFulfillmentLabel(fulfillmentType, t);
  const orderCode = `#${order.shortOrderId || (order._id ? order._id.slice(-6) : 'N/A')}`;

  // Check if order is new (within last 10 minutes)
  const isNew = createdAt && (Date.now() - createdAt.getTime()) < 10 * 60 * 1000;

  return (
    <tr className={isNew ? 'new-order-row' : ''}>
      <td data-label={t('orders.orderId', 'Order')}>
        <div className="order-id-block">
          <p className="order-code">
            {orderCode}
            {isNew && <span className="new-badge">NEW</span>}
          </p>
          <span className="order-date">
            {prettyDate} · {prettyTime}
          </span>
          {order.trackingCode && <span className="order-meta">#{order.trackingCode}</span>}
          <span className={`fulfillment-badge fulfillment-${fulfillmentType}`}>
            {fulfillmentLabel}
          </span>
        </div>
      </td>
      <td data-label={t('orders.customer', 'Customer')}>
        <div className="customer-cell">
          <p className="customer-name">{order.customerInfo?.name || t('orders.customerName', 'Customer')}</p>
          <p className="customer-meta">
            {order.customerInfo?.phone || '—'}
            {order.address?.city ? ` • ${order.address.city}` : ''}
          </p>
        </div>
      </td>
      <td data-label={t('orders.items', 'Items')}>
        <div className="items-preview">
          {previewItems.length === 0 ? (
            <span className="muted">{t('orders.noItems', 'No items')}</span>
          ) : (
            <>
              {previewItems.map((item, index) => (
                <span key={`${order._id}-${item.sku || index}`} className="item-pill">
                  {item.name || 'Item'} ×{item.quantity || 1}
                </span>
              ))}
              {remainingItems > 0 && <span className="extra-count">+{remainingItems}</span>}
            </>
          )}
        </div>
      </td>
      <td data-label={t('orders.total', 'Total')}>
        <div className="amount-stack">
          {showDeliveryFee && (
            <div className="amount-row">
              <span className="amount-label">{t('orders.deliveryFee', 'Delivery')}</span>
              <span className="amount-value">{formatMoney(deliveryFee)}</span>
            </div>
          )}
          {showSystemFee && (
            <div className="amount-row">
              <span className="amount-label">{t('orders.systemFee', 'System')}</span>
              <span className="amount-value">{formatMoney(systemFee)}</span>
            </div>
          )}
          <div className="amount-row strong">
            <span className="amount-label">{t('orders.total', 'Total')}</span>
            <span className="amount-value">{formatMoney(order.amount)}</span>
          </div>
        </div>
      </td>
      <td data-label={t('orders.status', 'Status')}>
        <div className="status-cell inline">
          <select
            className="status-select"
            value={order.status}
            onChange={(e) => onStatusChange(e.target.value, order._id)}
          >
            <option value="Pending">{t('orders.pending', 'Pending')}</option>
            <option value="Cancelled">{t('orders.cancelled', 'Cancel order')}</option>
            <option value="Delivered">{t('orders.delivered', 'Delivered')}</option>
          </select>
        </div>
      </td>
      <td data-label={t('orders.details', 'Details')}>
        <button className="ghost-btn slim" onClick={onDetails}>
          {t('orders.viewDetails', 'Details')}
        </button>
      </td>
    </tr>
  );
});

OrderRow.propTypes = {
  order: PropTypes.object.isRequired,
  onStatusChange: PropTypes.func.isRequired,
  onDetails: PropTypes.func.isRequired,
};

const OrderSummary = React.memo(({ amount, deliveryFee, systemFee }) => {
  const subtotal = (amount || 0) - (deliveryFee || 0) - (systemFee || 0);
  const rows = [
    { label: 'Subtotal', value: formatMoney(subtotal) },
    { label: 'Delivery', value: formatMoney(deliveryFee) },
    ...(systemFee > 0 ? [{ label: 'System fee', value: formatMoney(systemFee) }] : []),
    { label: 'Total', value: formatMoney(amount), strong: true },
  ];

  return (
    <div className="order-summary">
      {rows.map((row) => (
        <div key={row.label} className={`summary-row ${row.strong ? 'strong' : ''}`}>
          <span>{row.label}</span>
          <span>{row.value}</span>
        </div>
      ))}
    </div>
  );
});

OrderSummary.propTypes = {
  amount: PropTypes.number,
  deliveryFee: PropTypes.number,
  systemFee: PropTypes.number,
};

const OrderDetailsModal = React.memo(({ order, onClose }) => {
  const { t } = useTranslation();
  const deliveryFee = Number(order.deliveryInfo?.deliveryFee ?? 0);
  const systemFee = Number(order.deliveryInfo?.systemFee ?? 0);
  const fulfillmentType = order.fulfillmentType || 'delivery';
  const fulfillmentLabel = getFulfillmentLabel(fulfillmentType, t);

  const copyId = () => {
    const id = order.shortOrderId || order._id || '';
    navigator.clipboard.writeText(id).then(() => toast.success(t('orders.copied', 'Order ID copied')));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="section-label">{t('orders.orderDetails', 'Order Details')}</p>
            <h2>#{order.shortOrderId || (order._id ? order._id.slice(-6) : 'N/A')}</h2>
          </div>
          <div className="modal-header-actions">
            <button className="ghost-btn" onClick={copyId}>
              {t('orders.copyId', 'Copy ID')}
            </button>
            <button className="icon-button" onClick={onClose} title="Close">
              ×
            </button>
          </div>
        </div>

        <div className="modal-body">
          <div className="detail-section">
            <h3>{t('orders.meta', 'Order Meta')}</h3>
            <div className="meta-grid">
              <div>
                <p className="meta-label">{t('orders.orderDate', 'Order Date')}</p>
                <p className="meta-value">
                  {order.createdAt
                    ? formatDateTime(order.createdAt)
                    : 'N/A'}
                </p>
              </div>
              <div>
                <p className="meta-label">{t('orders.status', 'Status')}</p>
                <p className="meta-value status-chip" style={{ color: STATUS_COLORS[order.status] }}>
                  {t(`orders.orderStatus.${order.status}`, order.status)}
                </p>
              </div>
              <div>
                <p className="meta-label">{t('orders.trackingCode', 'Tracking')}</p>
                <p className="meta-value">{order.trackingCode || '—'}</p>
              </div>
              <div>
                <p className="meta-label">{t('orders.fulfillment.label', 'Fulfillment')}</p>
                <p className="meta-value">{fulfillmentLabel}</p>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <h3>{t('orders.customer', 'Customer')}</h3>
            <div className="customer-grid">
              <div>
                <p className="meta-label">{t('orders.customerName', 'Name')}</p>
                <p className="meta-value">{order.customerInfo?.name || 'N/A'}</p>
              </div>
              <div>
                <p className="meta-label">{t('orders.phone', 'Phone')}</p>
                <p className="meta-value">{order.customerInfo?.phone || 'N/A'}</p>
              </div>
              <div className="full">
                <p className="meta-label">{t('orders.address', 'Address')}</p>
                <p className="meta-value">
                  {formatFullAddress(order.address)}
                </p>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <h3>{t('orders.items', 'Items')}</h3>
            <div className="items-and-summary">
              <div className="modal-items">
                {order.items && Array.isArray(order.items) ? (
                  order.items.map((item, index) => (
                    <div key={index} className="modal-item">
                      <div>
                        <p className="modal-item-name">{item.name || 'Item'}</p>
                        <p className="modal-item-meta">SKU: {item.sku || 'N/A'}</p>
                        {Array.isArray(item.options) && item.options.length > 0 && (
                          <p className="modal-item-meta small">
                            {item.options.map((opt) => opt?.label || opt?.name || opt).join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="modal-item-quantity-price">
                        <span>x{item.quantity || 1}</span>
                        <strong>{formatMoney((item.price || 0) * (item.quantity || 1))}</strong>
                      </div>
                    </div>
                  ))
                ) : (
                  <p>{t('orders.noItems', 'No items')}</p>
                )}
              </div>

              <OrderSummary amount={Number(order.amount || 0)} deliveryFee={deliveryFee} systemFee={systemFee} />
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="ghost-btn" onClick={copyId}>
            {t('orders.copyId', 'Copy ID')}
          </button>
          <button className="ghost-btn" onClick={() => window.print()}>
            {t('orders.print', 'Print')}
          </button>
          <button className="primary-btn" onClick={onClose}>
            {t('orders.close', 'Close')}
          </button>
        </div>
      </div>
    </div>
  );
});

OrderDetailsModal.propTypes = {
  order: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default Orders;