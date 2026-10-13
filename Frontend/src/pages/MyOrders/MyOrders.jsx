import { useEffect, useState } from 'react'
import { useAuth } from '../../Context/AuthContext';
import axios from 'axios';
import config from '../../config/config';
import { assets } from '../../assets/assets';
import { useTranslation } from 'react-i18next';
import { formatProductDisplayName } from '../../utils/productDisplay';
import { formatFullAddress } from '../../utils/formatAddress';
import { formatRestaurantDateTime } from '../../utils/timeZone';
import './MyOrders.css'

const MyOrders = () => {
    const { t, i18n } = useTranslation();
    const { token, isAuthenticated } = useAuth();
    const url = config.BACKEND_URL;
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [expandedId, setExpandedId] = useState(null);
    const [error, setError] = useState(null);

    // Fetch orders for logged-in users
    const fetchUserOrders = async () => {
        if (!token || !isAuthenticated) {
            setOrders([]);
            return;
        }

        try {
            setLoading(true);
            setError(null);
            const response = await axios.get(
                url + "/api/user/orders",
                { headers: { token } }
            );
            
            if (response.data.success) {
                setOrders(response.data.data || []);
            } else {
                setOrders([]);
                setError(t('myOrders.errors.fetchFailed'));
            }
        } catch (error) {
            console.error('Error fetching user orders:', error);
            setOrders([]);
            setError(t('myOrders.errors.fetchFailed'));
        } finally {
            setLoading(false);
        }
    }

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
        if (!Array.isArray(options) || options.length === 0) return '';

        const lang = (i18n.language || 'hu').split('-')[0];
        
        const pickLabel = (obj = {}) => {
            if (!obj) return '';
            if (lang === 'vi') return obj.labelVI || obj.nameVI || obj.label || obj.name || '';
            if (lang === 'en') return obj.labelEN || obj.nameEN || obj.label || obj.name || '';
            if (lang === 'hu') return obj.labelHU || obj.nameHU || obj.label || obj.name || '';
            return obj.label || obj.name || '';
        };

        const parts = options.map(opt => {
            const optName = pickLabel(opt);
            let choiceLabel = '';

            if (Array.isArray(opt.choices) && opt.defaultChoiceCode) {
                const choice = opt.choices.find(c => c.code === opt.defaultChoiceCode);
                if (choice) {
                    choiceLabel = pickLabel(choice);
                }
            }

            if (optName && choiceLabel) return `${optName}: ${choiceLabel}`;
            if (choiceLabel) return choiceLabel;
            return null;
        }).filter(Boolean);

        return parts.join(' · ');
    };

    const getStatusLabel = (status) => {
        if (status === 'Delivered') return t('myOrders.status.delivered');
        if (status === 'Cancelled') return t('myOrders.status.cancelled');
        return t('myOrders.status.notDelivered');
    };

    const getStatusClass = (status) => {
        if (status === 'Delivered') return 'status-chip delivered';
        if (status === 'Cancelled') return 'status-chip cancelled';
        return 'status-chip pending';
    };

    return (
        <div className='my-orders'>
            <div className="my-orders-header">
                <div>
                    <h1>{t('myOrders.title')}</h1>
                    <p>{t('myOrders.subtitle')}</p>
                </div>
            </div>

            {loading && (
                <div className="loading-state">
                    <div className="loading-spinner"></div>
                    <p>{t('myOrders.loading')}</p>
                </div>
            )}

            {!loading && !isAuthenticated && (
                <div className="orders-card">
                    <div className="no-orders">
                        <h3>{t('myOrders.loginRequired.title')}</h3>
                        <p>{t('myOrders.loginRequired.subtitle')}</p>
                    </div>
                </div>
            )}

            {error && (
                <div className="orders-card">
                    <div className="no-orders">
                        <h3 style={{ color: '#dc3545' }}>{t('common.error')}</h3>
                        <p>{error}</p>
                    </div>
                </div>
            )}

            {!loading && isAuthenticated && !error && (
                <div className="orders-card">
                    <div className="orders-card-header">
                        <h3>{t('myOrders.list.title')}</h3>
                        <span className="orders-count">
                            {t('myOrders.list.count', { count: orders.length })}
                        </span>
                    </div>

                    {orders.length > 0 ? (
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
                                                        {idx < order.items.length - 1 ? ', ' : ''}
                                                    </span>
                                                ))}
                                            </p>
                                            <div className="order-meta-row">
                                                <span className="order-date">
                                                    {t('myOrders.order.dateLabel')}{' '}
                                                    {formatRestaurantDateTime(order.createdAt || order.date, i18n.language, {
                                                        year: 'numeric',
                                                        month: '2-digit',
                                                        day: '2-digit',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                        hourCycle: 'h23'
                                                    })}
                                                </span>
                                                {order.trackingCode && (
                                                    <span className="order-tracking">
                                                        {t('myOrders.order.trackingLabel')}{' '}
                                                        <strong>{order.trackingCode}</strong>
                                                    </span>
                                                )}
                                                <span className="order-items-count">
                                                    {t('myOrders.order.itemsCount', { count: order.items.length })}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {expandedId === order._id && (
                                        <div className="order-details">
                                            <div className="order-details-section">
                                                <h4>{t('myOrders.details.itemsTitle')}</h4>
                                                <div className="details-items-list">
                                                    {order.items.map((item, idx) => (
                                                        <div key={idx} className="details-item-row">
                                                            <div className="details-item-main">
                                                                <span className="details-item-name">{formatProductDisplayName(item)}</span>
                                                                {Array.isArray(item.options) && item.options.length > 0 && (
                                                                    <span className="details-item-options">
                                                                        {formatOptionText(item.options)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="details-item-meta">
                                                                <span>×{item.quantity}</span>
                                                                <span>{new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(item.price)}</span>
                                                            </div>
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
                    ) : (
                        !loading && (
                            <div className="no-orders">
                                <h3>{t('myOrders.empty.title')}</h3>
                                <p>{t('myOrders.empty.subtitle')}</p>
                            </div>
                        )
                    )}
                </div>
            )}
        </div>
    )
}

export default MyOrders