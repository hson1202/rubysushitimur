import { useEffect, useState } from 'react';
import { useAuth } from '../../Context/AuthContext';
import axios from 'axios';
import config from '../../config/config';
import { assets } from '../../assets/assets';
import { useTranslation } from 'react-i18next';
import { formatProductDisplayName } from '../../utils/productDisplay';
import { formatFullAddress } from '../../utils/formatAddress';
import { formatRestaurantDateTime } from '../../utils/timeZone';
import '../MyOrders/MyOrders.css';

const AccountOrdersPage = () => {
    const { t, i18n } = useTranslation();
    const { token, isAuthenticated } = useAuth();
    const url = config.BACKEND_URL;
    
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [expandedId, setExpandedId] = useState(null);

    // Fetch orders for logged-in users using new GET endpoint
    const fetchUserOrders = async () => {
        if (!token || !isAuthenticated) {
            setOrders([]);
            return;
        }

        try {
            setLoading(true);
            const response = await axios.get(
                url + "/api/user/orders",
                { headers: { token } }
            );
            
            if (response.data.success) {
                setOrders(response.data.data || []);
            } else {
                setOrders([]);
            }
        } catch (error) {
            console.error('Error fetching user orders:', error);
            setOrders([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isAuthenticated && token) {
            fetchUserOrders();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, isAuthenticated]);

    const toggleExpand = (id) => {
        setExpandedId(prev => (prev === id ? null : id));
    };

    const formatOptionText = (options) => {
        if (!options || Object.keys(options).length === 0) return '';
        return Object.entries(options)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ');
    };

    const getStatusLabel = (status) => {
        const statusMap = {
            'Pending': t('myOrders.status.pending') || 'Pending',
            'Out for delivery': t('myOrders.status.outForDelivery') || 'Out for delivery',
            'Delivered': t('myOrders.status.delivered') || 'Delivered',
            'Cancelled': t('myOrders.status.cancelled') || 'Cancelled'
        };
        return statusMap[status] || status;
    };

    const getStatusClass = (status) => {
        if (status === 'Delivered') return 'status-chip delivered';
        if (status === 'Out for delivery') return 'status-chip out-for-delivery';
        if (status === 'Cancelled') return 'status-chip cancelled';
        return 'status-chip pending';
    };

    return (
        <div className='my-orders'>
            <div className="my-orders-header">
                <div>
                    <h1>{t('account.orders.title') || t('myOrders.title') || 'My Orders'}</h1>
                    <p>{t('account.orders.subtitle') || t('myOrders.subtitle') || 'View your order history'}</p>
                </div>
            </div>

            {loading && (
                <div className="loading-state">
                    <div className="loading-spinner"></div>
                    <p>{t('myOrders.loading')}</p>
                </div>
            )}

            {!loading && orders.length === 0 && (
                <div className="orders-card">
                    <div className="no-orders">
                        <h3>{t('myOrders.empty.title')}</h3>
                        <p>{t('myOrders.empty.subtitle')}</p>
                    </div>
                </div>
            )}

            {!loading && orders.length > 0 && (
                <div className="orders-card">
                    <div className="orders-card-header">
                        <h3>{t('myOrders.list.title')}</h3>
                        <span className="orders-count">
                            {t('myOrders.list.count', { count: orders.length })}
                        </span>
                    </div>

                    <div className="orders-list">
                        {orders.map((order) => (
                            <div
                                key={order._id}
                                className={`my-orders-order ${expandedId === order._id ? 'expanded' : ''}`}
                                onClick={() => toggleExpand(order._id)}
                            >
                                <div className="order-main">
                                    <div className="order-icon">
                                        <img src={assets.parcel_icon} alt="" />
                                    </div>
                                    <div className="order-info">
                                        <div className="order-top-row">
                                            <p className="order-amount">{new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(order.amount)}</p>
                                            <div className="order-status">
                                                <span className={getStatusClass(order.status)}>
                                                    {getStatusLabel(order.status)}
                                                </span>
                                            </div>
                                        </div>
                                        <p className="order-items">
                                            {order.items.map((item, idx) => (
                                                <span key={idx}>
                                                    {formatProductDisplayName(item)} × {item.quantity}
                                                    {item.options && formatOptionText(item.options) && (
                                                        <span className="item-options"> ({formatOptionText(item.options)})</span>
                                                    )}
                                                    {idx < order.items.length - 1 ? ', ' : ''}
                                                </span>
                                            ))}
                                        </p>
                                        <div className="order-meta-row">
                                            <p className="order-date">
                                                {formatRestaurantDateTime(order.createdAt || order.date, i18n.language, {
                                                    year: 'numeric',
                                                    month: '2-digit',
                                                    day: '2-digit',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    hourCycle: 'h23'
                                                })}
                                            </p>
                                            {order.trackingCode && (
                                                <p className="order-tracking">
                                                    {t('myOrders.order.trackingLabel')}: {order.trackingCode}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {expandedId === order._id && (
                                    <div className="order-details">
                                        <div className="order-details-section">
                                            <h4>{t('myOrders.details.itemsTitle')}</h4>
                                            <div className="order-items-list">
                                                {order.items.map((item, idx) => (
                                                    <div key={idx} className="order-item-detail">
                                                        <span className="item-name">{formatProductDisplayName(item)} × {item.quantity}</span>
                                                        <span className="item-price">{new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(item.price * item.quantity)}</span>
                                                        {item.options && formatOptionText(item.options) && (
                                                            <p className="item-options">{formatOptionText(item.options)}</p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="order-details-section">
                                            <h4>{t('myOrders.details.deliveryTitle')}</h4>
                                            <p className="details-address">
                                                {formatFullAddress(order.address)}
                                            </p>
                                            {order.preferredDeliveryTime && (
                                                <p className="details-note">
                                                    {t('myOrders.details.preferredTime')}{' '}
                                                    <span>{order.preferredDeliveryTime}</span>
                                                </p>
                                            )}
                                            {order.note && (
                                                <p className="details-note">
                                                    {t('myOrders.details.note')}{' '}
                                                    <span>{order.note}</span>
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AccountOrdersPage;

