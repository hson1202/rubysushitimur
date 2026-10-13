import React, { useState } from 'react'
import './TrackOrder.css'
import axios from 'axios'
import { useTranslation } from 'react-i18next'
import config from '../../config/config'
import { formatProductDisplayName } from '../../utils/productDisplay'
import { formatFullAddress } from '../../utils/formatAddress'
import { formatRestaurantDateTime } from '../../utils/timeZone'


const TrackOrder = () => {
  const { t, i18n } = useTranslation();
  const [trackingCode, setTrackingCode] = useState('')
  const [phone, setPhone] = useState('')
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleTrackOrder = async (e) => {
    e.preventDefault()
    
    if (!trackingCode || !phone) {
      setError(t('trackOrder.errors.missingFields'))
      return
    }

    setLoading(true)
    setError('')
    setOrder(null)

    try {
      const response = await axios.post(`${config.BACKEND_URL}/api/order/track`, {
        trackingCode: trackingCode.toUpperCase(),
        phone: phone
      })

      if (response.data.success) {
        setOrder(response.data.data)
      } else {
        const serverMsg = (response.data.message || '').toLowerCase();
        if (serverMsg.includes('required')) {
          setError(t('trackOrder.errors.missingFields'));
        } else if (serverMsg.includes('not found')) {
          setError(t('trackOrder.errors.notFound'));
        } else {
          // Avoid showing backend English messages directly; show translated fallback.
          setError(t('trackOrder.errors.notFound'));
        }
      }
    } catch (error) {
      console.error('Error tracking order:', error)
      setError(t('trackOrder.errors.general'))
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'Pending': return '#f59e0b'
      case 'Out for delivery': return '#3b82f6'
      case 'Delivered': return '#10b981'
      case 'Cancelled': return '#ef4444'
      default: return '#6b7280'
    }
  }

  const getStatusLabel = (status) => {
    if (status === 'Pending') return t('myOrders.status.pending');
    if (status === 'Out for delivery') return t('myOrders.status.outForDelivery');
    if (status === 'Delivered') return t('myOrders.status.delivered');
    if (status === 'Cancelled') return t('myOrders.status.cancelled');
    return status;
  }

  const formatDate = (dateString) => {
    const locale = i18n?.language || undefined;
    return formatRestaurantDateTime(dateString, locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    })
  }

  return (
    <div className='track-order'>
      <div className="track-order-container">
        <div className="track-order-header">
          <h1>🔍 {t('trackOrder.title')}</h1>
          <p>{t('trackOrder.subtitle')}</p>
        </div>

        <div className="track-form-section">
          <form onSubmit={handleTrackOrder} className="track-form">
            <div className="form-group">
              <label htmlFor="trackingCode">{t('trackOrder.form.trackingCode')}</label>
              <input
                type="text"
                id="trackingCode"
                value={trackingCode}
                onChange={(e) => setTrackingCode(e.target.value)}
                placeholder={t('trackOrder.form.trackingCodePlaceholder')}
                maxLength="8"
                className="track-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="phone">{t('trackOrder.form.phone')}</label>
              <input
                type="tel"
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t('trackOrder.form.phonePlaceholder')}
                className="track-input"
              />
            </div>

            <button 
              type="submit" 
              className="track-btn"
              disabled={loading}
            >
              {loading ? t('trackOrder.form.searching') : t('trackOrder.form.trackButton')}
            </button>
          </form>
        </div>

        {error && (
          <div className="error-message">
            <span>❌ {error}</span>
          </div>
        )}

        {order && (
          <div className="order-result">
            <div className="order-header">
              <h2>📦 {t('trackOrder.result.title')}</h2>
              <div className="tracking-code">
                {t('trackOrder.result.code')}: <span>{order.trackingCode}</span>
              </div>
            </div>

            <div className="order-info-grid">
              <div className="order-info-card">
                <h3>👤 {t('trackOrder.result.customerInfo')}</h3>
                <div className="info-item">
                  <span className="label">{t('trackOrder.result.name')}:</span>
                  <span className="value">{order.customerInfo.name}</span>
                </div>
                <div className="info-item">
                  <span className="label">{t('trackOrder.result.phone')}:</span>
                  <span className="value">{order.customerInfo.phone}</span>
                </div>
                {order.customerInfo.email && (
                  <div className="info-item">
                    <span className="label">{t('trackOrder.result.email')}:</span>
                    <span className="value">{order.customerInfo.email}</span>
                  </div>
                )}
              </div>

              <div className="order-info-card">
                <h3>📍 {t('trackOrder.result.deliveryAddress')}</h3>
                <div className="info-item">
                  <span className="label">{t('trackOrder.result.address')}:</span>
                  <span className="value">{formatFullAddress(order.address)}</span>
                </div>
                <div className="info-item">
                  <span className="label">{t('trackOrder.result.city')}:</span>
                  <span className="value">{order.address.city}</span>
                </div>
                <div className="info-item">
                  <span className="label">{t('trackOrder.result.postalCode')}:</span>
                  <span className="value">{order.address.zipcode || order.address.postalCode}</span>
                </div>
              </div>

              <div className="order-info-card">
                <h3>💰 {t('trackOrder.result.paymentInfo')}</h3>
                <div className="info-item">
                  <span className="label">{t('trackOrder.result.total')}:</span>
                  <span className="value price">{new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(order.amount)}</span>
                </div>
                <div className="info-item">
                  <span className="label">{t('trackOrder.result.payment')}:</span>
                  <span className={`value ${order.payment ? 'paid' : 'unpaid'}`}>
                    {order.payment ? t('trackOrder.result.paid') : t('trackOrder.result.unpaid')}
                  </span>
                </div>
                <div className="info-item">
                  <span className="label">{t('trackOrder.result.orderDate')}:</span>
                  <span className="value">{formatDate(order.date)}</span>
                </div>
              </div>

              <div className="order-info-card status-card">
                <h3>📊 {t('trackOrder.result.orderStatus')}</h3>
                <div className="status-badge" style={{ backgroundColor: getStatusColor(order.status) }}>
                  {getStatusLabel(order.status)}
                </div>
                <div className="order-type">
                  {t('trackOrder.result.type')}: <span>{order.orderType === 'guest' ? t('trackOrder.result.guest') : t('trackOrder.result.registered')}</span>
                </div>
              </div>
            </div>

            <div className="order-items">
              <h3>🍽️ {t('trackOrder.result.orderDetails')}</h3>
              <div className="items-list">
                {order.items.map((item, index) => (
                  <div key={index} className="item-card">
                    <div className="item-info">
                      <h4>{formatProductDisplayName(item)}</h4>
                      <p className="item-price">{new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(item.price)}</p>
                    </div>
                    <div className="item-quantity">
                      {t('trackOrder.result.quantity')}: {item.quantity}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {order.notes && (
              <div className="order-notes">
                <h3>📝 {t('trackOrder.result.notes')}</h3>
                <p>{order.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
      {/* Floating Cart Button is now handled globally in App.jsx */}
    </div>
  )
}

export default TrackOrder
