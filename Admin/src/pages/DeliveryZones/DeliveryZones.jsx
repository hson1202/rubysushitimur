import React, { useState, useEffect } from 'react';
import './DeliveryZones.css';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';

const DeliveryZones = ({ url }) => {
  const { t } = useTranslation();
  const [zones, setZones] = useState([]);
  const [restaurantLocation, setRestaurantLocation] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [editingZone, setEditingZone] = useState(null);
  const [tokenDebug, setTokenDebug] = useState(null);
  const [deliveryEnabled, setDeliveryEnabled] = useState(true);
  const [isTogglingDelivery, setIsTogglingDelivery] = useState(false);

  // Zone form state
  const [zoneForm, setZoneForm] = useState({
    name: '',
    minDistance: '',
    maxDistance: '',
    deliveryFee: '',
    minOrder: '',
    estimatedTime: '',
    color: '#3B82F6',
    order: 0
  });

  // Restaurant location form state
  const [locationForm, setLocationForm] = useState({
    name: '',
    address: '',
    latitude: '',
    longitude: '',
    boxFee: 160,
    systemFee: 0
  });

  useEffect(() => {
    fetchData();
    // Check token on mount
    const token = localStorage.getItem('adminToken');
    setTokenDebug({
      exists: !!token,
      length: token ? token.length : 0,
      preview: token ? `${token.substring(0, 20)}...${token.substring(token.length - 10)}` : 'No token'
    });
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      await Promise.all([fetchZones(), fetchRestaurantLocation(), fetchDeliveryEnabled()]);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchZones = async () => {
    try {
      const response = await axios.get(`${url}/api/delivery/zones`, {
        headers: { token: localStorage.getItem('adminToken') }
      });
      if (response.data.success) {
        setZones(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching zones:', error);
    }
  };

  const fetchRestaurantLocation = async () => {
    try {
      const response = await axios.get(`${url}/api/delivery/restaurant-location`);
      if (response.data.success && response.data.data) {
        setRestaurantLocation(response.data.data);
        setLocationForm({
          name: response.data.data.name,
          address: response.data.data.address,
          latitude: response.data.data.latitude,
          longitude: response.data.data.longitude,
          boxFee: response.data.data.boxFee !== undefined ? response.data.data.boxFee : 160,
          systemFee: response.data.data.systemFee !== undefined ? response.data.data.systemFee : 0
        });
      }
    } catch (error) {
      console.error('Error fetching restaurant location:', error);
    }
  };

  const fetchDeliveryEnabled = async () => {
    try {
      const response = await axios.get(`${url}/api/restaurant-info`, {
        headers: { token: localStorage.getItem('adminToken') || '' }
      });
      if (response.data.success) {
        setDeliveryEnabled(response.data.data?.deliveryEnabled !== false);
      }
    } catch (error) {
      console.error('Error fetching delivery status:', error);
    }
  };

  const handleToggleDelivery = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) {
      toast.error(t('dz.authDesc'));
      return;
    }

    const nextEnabled = !deliveryEnabled;
    setIsTogglingDelivery(true);
    try {
      const response = await axios.put(
        `${url}/api/restaurant-info`,
        { deliveryEnabled: nextEnabled },
        { headers: { token } }
      );
      if (response.data.success) {
        setDeliveryEnabled(nextEnabled);
        window.dispatchEvent(new CustomEvent('restaurantInfoUpdated', { detail: response.data.data }));
        toast.success(nextEnabled ? t('dz.deliveryEnabledToast') : t('dz.deliveryDisabledToast'));
      } else {
        toast.error(response.data.message || t('dz.deliveryToggleError'));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || t('dz.deliveryToggleError'));
    } finally {
      setIsTogglingDelivery(false);
    }
  };

  const handleZoneFormChange = (e) => {
    const { name, value } = e.target;
    setZoneForm(prev => ({ ...prev, [name]: value }));
  };

  const handleLocationFormChange = (e) => {
    const { name, value } = e.target;
    setLocationForm(prev => ({ ...prev, [name]: value }));
  };

  const handleCreateZone = async (e) => {
    e.preventDefault();

    // Check if token exists
    const token = localStorage.getItem('adminToken');
    if (!token) {
      toast.error('❌ Not authorized! Please login again.');
      console.error('No adminToken found in localStorage');
      return;
    }

    // ✨ Validate overlapping zones
    const minDist = parseFloat(zoneForm.minDistance);
    const maxDist = parseFloat(zoneForm.maxDistance);

    // Check if min > max
    if (minDist >= maxDist) {
      toast.error('❌ Min Distance must be less than Max Distance!');
      return;
    }

    // Check for overlapping with existing zones
    const overlappingZones = zones.filter(existingZone => {
      // Skip if editing the same zone
      if (editingZone && existingZone._id === editingZone._id) {
        return false;
      }

      // Check if ranges overlap
      const existingMin = existingZone.minDistance;
      const existingMax = existingZone.maxDistance;

      // Overlap occurs if:
      // new zone starts inside existing zone OR
      // new zone ends inside existing zone OR
      // new zone completely contains existing zone
      const overlaps =
        (minDist >= existingMin && minDist <= existingMax) || // new starts in existing
        (maxDist >= existingMin && maxDist <= existingMax) || // new ends in existing
        (minDist <= existingMin && maxDist >= existingMax);   // new contains existing

      return overlaps;
    });

    if (overlappingZones.length > 0) {
      const overlapNames = overlappingZones.map(z => `"${z.name}" (${z.minDistance}-${z.maxDistance}km)`).join(', ');
      toast.error(`⚠️ Zone overlap detected! New zone (${minDist}-${maxDist}km) overlaps with: ${overlapNames}`, {
        autoClose: 10000
      });
      console.warn('Overlapping zones:', overlappingZones);

      // Ask for confirmation
      if (!window.confirm(`WARNING: This zone (${minDist}-${maxDist}km) overlaps with existing zone(s): ${overlapNames}.\n\nWhen a customer's address falls in overlapping zones, the system will use the zone with the SMALLEST minDistance.\n\nDo you want to continue?`)) {
        return;
      }
    }

    try {
      const response = await axios.post(
        `${url}/api/delivery/zones/create`,
        zoneForm,
        { headers: { token } }
      );

      if (response.data.success) {
        toast.success('Delivery zone created successfully!');
        fetchZones();
        resetZoneForm();
        setShowZoneForm(false);
      }
    } catch (error) {
      console.error('Error creating zone:', error);
      if (error.response?.status === 401) {
        toast.error('❌ Session expired! Please login again.');
        // Optionally redirect to login
        // window.location.href = '/login';
      } else {
        toast.error(error.response?.data?.message || 'Failed to create zone');
      }
    }
  };

  const handleUpdateZone = async (e) => {
    e.preventDefault();

    // Check if token exists
    const token = localStorage.getItem('adminToken');
    if (!token) {
      toast.error('❌ Not authorized! Please login again.');
      console.error('No adminToken found in localStorage');
      return;
    }

    // ✨ Validate overlapping zones
    const minDist = parseFloat(zoneForm.minDistance);
    const maxDist = parseFloat(zoneForm.maxDistance);

    // Check if min > max
    if (minDist >= maxDist) {
      toast.error('❌ Min Distance must be less than Max Distance!');
      return;
    }

    // Check for overlapping with existing zones (excluding current zone being edited)
    const overlappingZones = zones.filter(existingZone => {
      // Skip the zone being edited
      if (editingZone && existingZone._id === editingZone._id) {
        return false;
      }

      // Check if ranges overlap
      const existingMin = existingZone.minDistance;
      const existingMax = existingZone.maxDistance;

      const overlaps =
        (minDist >= existingMin && minDist <= existingMax) ||
        (maxDist >= existingMin && maxDist <= existingMax) ||
        (minDist <= existingMin && maxDist >= existingMax);

      return overlaps;
    });

    if (overlappingZones.length > 0) {
      const overlapNames = overlappingZones.map(z => `"${z.name}" (${z.minDistance}-${z.maxDistance}km)`).join(', ');
      toast.error(`⚠️ Zone overlap detected! Updated zone (${minDist}-${maxDist}km) overlaps with: ${overlapNames}`, {
        autoClose: 10000
      });
      console.warn('Overlapping zones:', overlappingZones);

      if (!window.confirm(`WARNING: This zone (${minDist}-${maxDist}km) overlaps with: ${overlapNames}.\n\nThe system will use the zone with the SMALLEST minDistance.\n\nDo you want to continue?`)) {
        return;
      }
    }

    try {
      const response = await axios.put(
        `${url}/api/delivery/zones/${editingZone._id}`,
        zoneForm,
        { headers: { token } }
      );

      if (response.data.success) {
        toast.success('Delivery zone updated successfully!');
        fetchZones();
        resetZoneForm();
        setEditingZone(null);
        setShowZoneForm(false);
      }
    } catch (error) {
      console.error('Error updating zone:', error);
      if (error.response?.status === 401) {
        toast.error('❌ Session expired! Please login again.');
        // Optionally redirect to login
        // window.location.href = '/login';
      } else {
        toast.error(error.response?.data?.message || 'Failed to update zone');
      }
    }
  };

  const handleDeleteZone = async (zoneId) => {
    if (!window.confirm('Are you sure you want to delete this delivery zone?')) {
      return;
    }

    // Check if token exists
    const token = localStorage.getItem('adminToken');
    if (!token) {
      toast.error('❌ Not authorized! Please login again.');
      console.error('No adminToken found in localStorage');
      return;
    }

    try {
      const response = await axios.delete(
        `${url}/api/delivery/zones/${zoneId}`,
        { headers: { token } }
      );

      if (response.data.success) {
        toast.success('Delivery zone deleted successfully!');
        fetchZones();
      }
    } catch (error) {
      console.error('Error deleting zone:', error);
      if (error.response?.status === 401) {
        toast.error('❌ Session expired! Please login again.');
      } else {
        toast.error(error.response?.data?.message || 'Failed to delete zone');
      }
    }
  };

  const handleEditZone = (zone) => {
    setEditingZone(zone);
    setZoneForm({
      name: zone.name,
      minDistance: zone.minDistance,
      maxDistance: zone.maxDistance,
      deliveryFee: zone.deliveryFee,
      minOrder: zone.minOrder,
      estimatedTime: zone.estimatedTime,
      color: zone.color,
      order: zone.order
    });
    setShowZoneForm(true);
  };

  const resetZoneForm = () => {
    setZoneForm({
      name: '',
      minDistance: '',
      maxDistance: '',
      deliveryFee: '',
      minOrder: '',
      estimatedTime: '',
      color: '#3B82F6',
      order: 0
    });
    setEditingZone(null);
  };

  const handleUpdateLocation = async (e) => {
    e.preventDefault();

    // Check if token exists
    const token = localStorage.getItem('adminToken');
    if (!token) {
      toast.error('❌ Not authorized! Please login again.');
      console.error('No adminToken found in localStorage');
      return;
    }

    try {
      const response = await axios.put(
        `${url}/api/delivery/restaurant-location`,
        locationForm,
        { headers: { token } }
      );

      if (response.data.success) {
        toast.success('Restaurant location updated successfully!');
        fetchRestaurantLocation();
        setShowLocationForm(false);
      }
    } catch (error) {
      console.error('Error updating location:', error);
      if (error.response?.status === 401) {
        toast.error('❌ Session expired! Please login again.');
      } else {
        toast.error(error.response?.data?.message || 'Failed to update location');
      }
    }
  };

  if (isLoading) {
    return <div className="delivery-zones-loading">Loading...</div>;
  }

  return (
    <div className="delivery-zones-page">
      <div className="page-header">
        <h1>{t('dz.title')}</h1>
        <p>{t('dz.subtitle')}</p>
      </div>

      {/* Debug Token Info */}
      {tokenDebug && !tokenDebug.exists && (
        <div className="token-warning-banner">
          <div className="warning-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          </div>
          <div className="warning-content">
            <strong>{t('dz.authIssue')}</strong>
            <p>{t('dz.authDesc')}</p>
            <button
              className="btn btn-primary"
              onClick={() => {
                localStorage.clear();
                window.location.href = '/login';
              }}
            >
              {t('dz.goToLogin')}
            </button>
          </div>
        </div>
      )}

      <div className={`section-card delivery-status-card ${deliveryEnabled ? 'is-on' : 'is-off'}`}>
        <div className="delivery-status-content">
          <div>
            <h2>{t('dz.deliveryToggleTitle')}</h2>
            <p className="delivery-status-label">
              {deliveryEnabled ? t('dz.deliveryEnabledLabel') : t('dz.deliveryDisabledLabel')}
            </p>
            <p className="delivery-status-help">{t('dz.deliveryToggleHelp')}</p>
          </div>
          <label className={`delivery-switch ${isTogglingDelivery ? 'is-busy' : ''}`}>
            <input
              type="checkbox"
              checked={deliveryEnabled}
              disabled={isTogglingDelivery}
              onChange={handleToggleDelivery}
              aria-label={t('dz.deliveryToggleTitle')}
            />
            <span className="delivery-switch-slider" />
          </label>
        </div>
      </div>

      {/* Restaurant Location Section */}
      <div className="section-card location-section">
        <div className="section-header">
          <h2>{t('dz.restaurantLocation')}</h2>
          <button
            className="btn btn-primary"
            onClick={() => setShowLocationForm(!showLocationForm)}
          >
            {showLocationForm ? t('dz.cancel') : restaurantLocation ? t('dz.editLocation') : t('dz.setLocation')}
          </button>
        </div>

        {restaurantLocation && !showLocationForm && (
          <div className="location-display">
            <div className="location-info">
              <div className="info-item">
                <span className="label">{t('dz.name')}:</span>
                <span className="value">{restaurantLocation.name}</span>
              </div>
              <div className="info-item">
                <span className="label">{t('dz.address')}:</span>
                <span className="value">{restaurantLocation.address}</span>
              </div>
              <div className="info-item">
                <span className="label">{t('dz.coordinates')}:</span>
                <span className="value">
                  {restaurantLocation.latitude}, {restaurantLocation.longitude}
                </span>
              </div>
              <div className="info-item">
                <span className="label">{t('dz.boxFee')}:</span>
                <span className="value" style={{ fontWeight: 'bold', color: '#ff6b35' }}>
                  {new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(restaurantLocation.boxFee !== undefined ? restaurantLocation.boxFee : 160)}
                </span>
              </div>
              <div className="info-item">
                <span className="label">{t('dz.systemFee')}:</span>
                <span className="value" style={{ fontWeight: 'bold', color: '#2563eb' }}>
                  {new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(restaurantLocation.systemFee !== undefined ? restaurantLocation.systemFee : 0)}
                </span>
              </div>
            </div>
          </div>
        )}

        {showLocationForm && (
          <form className="location-form" onSubmit={handleUpdateLocation}>
            <div className="form-grid">
              <div className="form-group">
                <label>{t('dz.name')}</label>
                <input
                  type="text"
                  name="name"
                  value={locationForm.name}
                  onChange={handleLocationFormChange}
                  required
                />
              </div>
              <div className="form-group full-width">
                <label>{t('dz.address')}</label>
                <input
                  type="text"
                  name="address"
                  value={locationForm.address}
                  onChange={handleLocationFormChange}
                  placeholder="Full restaurant address"
                  required
                />
              </div>
              <div className="form-group">
                <label>Latitude</label>
                <input
                  type="number"
                  name="latitude"
                  value={locationForm.latitude}
                  onChange={handleLocationFormChange}
                  step="any"
                  placeholder="e.g., 47.4979"
                  required
                />
              </div>
              <div className="form-group">
                <label>Longitude</label>
                <input
                  type="number"
                  name="longitude"
                  value={locationForm.longitude}
                  onChange={handleLocationFormChange}
                  step="any"
                  placeholder="e.g., 19.0402"
                  required
                />
              </div>
              <div className="form-group">
                <label>{t('dz.boxFee')}</label>
                <input
                  type="number"
                  name="boxFee"
                  value={locationForm.boxFee}
                  onChange={handleLocationFormChange}
                  step="0.01"
                  min="0"
                  placeholder="e.g., 0.3"
                  required
                />
                <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
                  {t('dz.defaultBoxFeeHelp')}
                </small>
              </div>
              <div className="form-group">
                <label>{t('dz.systemFee')}</label>
                <input
                  type="number"
                  name="systemFee"
                  value={locationForm.systemFee}
                  onChange={handleLocationFormChange}
                  step="1"
                  min="0"
                  placeholder="e.g., 250"
                  required
                />
                <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
                  {t('dz.systemFeeHelp')}
                </small>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-success">
                {t('dz.saveLocation')}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowLocationForm(false)}
              >
                {t('dz.cancel')}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Delivery Zones Section */}
      <div className="section-card zones-section">
        <div className="section-header">
          <h2>{t('dz.deliveryZones')}</h2>
          <button
            className="btn btn-primary"
            onClick={() => {
              resetZoneForm();
              setShowZoneForm(true);
            }}
          >
            + {t('dz.addZone')}
          </button>
        </div>

        {showZoneForm && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { resetZoneForm(); setShowZoneForm(false); } }}>
            <div className="modal-content">
              <div className="modal-header">
                <h3>{editingZone ? t('dz.editZone') : t('dz.createZone')}</h3>
                <button type="button" className="modal-close-btn" onClick={() => { resetZoneForm(); setShowZoneForm(false); }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
              <form
                className="zone-form modal-form"
                onSubmit={editingZone ? handleUpdateZone : handleCreateZone}
              >
                <p className="form-subtitle">
                  {editingZone
                    ? 'Update the delivery zone details below. Changes will affect customer orders immediately.'
                    : 'Set up a new delivery zone with distance range, fees, and minimum order.'}
                </p>
                <div className="form-grid">
              <div className="form-group">
                <label>{t('dz.zoneName')} *</label>
                <input
                  type="text"
                  name="name"
                  value={zoneForm.name}
                  onChange={handleZoneFormChange}
                  placeholder="e.g., 1-3 Km"
                  required
                />
              </div>
              <div className="form-group">
                <label>{t('dz.minDistance')} *</label>
                <input
                  type="number"
                  name="minDistance"
                  value={zoneForm.minDistance}
                  onChange={handleZoneFormChange}
                  step="0.1"
                  min="0"
                  required
                />
              </div>
              <div className="form-group">
                <label>{t('dz.maxDistance')} *</label>
                <input
                  type="number"
                  name="maxDistance"
                  value={zoneForm.maxDistance}
                  onChange={handleZoneFormChange}
                  step="0.1"
                  min="0"
                  required
                />
              </div>
              <div className="form-group">
                <label>{t('dz.deliveryFee')} *</label>
                <input
                  type="number"
                  name="deliveryFee"
                  value={zoneForm.deliveryFee}
                  onChange={handleZoneFormChange}
                  step="0.01"
                  min="0"
                  required
                  className="highlight-input"
                />
                <small className="field-hint">This is the shipping cost customers will pay</small>
              </div>
              <div className="form-group">
                <label>{t('dz.minOrder')} *</label>
                <input
                  type="number"
                  name="minOrder"
                  value={zoneForm.minOrder}
                  onChange={handleZoneFormChange}
                  step="0.01"
                  min="0"
                  required
                  className="highlight-input"
                />
                <small className="field-hint">Minimum order value required for this zone</small>
              </div>
              <div className="form-group">
                <label>{t('dz.estimatedTime')} *</label>
                <input
                  type="number"
                  name="estimatedTime"
                  value={zoneForm.estimatedTime}
                  onChange={handleZoneFormChange}
                  min="0"
                  required
                />
                <small className="field-hint">Expected delivery time</small>
              </div>
              <div className="form-group">
                <label>{t('dz.color')}</label>
                <input
                  type="color"
                  name="color"
                  value={zoneForm.color}
                  onChange={handleZoneFormChange}
                />
              </div>
              <div className="form-group">
                <label>{t('dz.displayOrder')}</label>
                <input
                  type="number"
                  name="order"
                  value={zoneForm.order}
                  onChange={handleZoneFormChange}
                  min="0"
                />
              </div>
            </div>
            <div className="form-actions" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  resetZoneForm();
                  setShowZoneForm(false);
                }}
              >
                {t('dz.cancel')}
              </button>
              <button type="submit" className="btn btn-success">
                {editingZone ? t('dz.updateZone') : t('dz.createZone')}
              </button>
            </div>
          </form>
            </div>
          </div>
        )}

        <div className="zones-list">
          {zones.length === 0 ? (
            <div className="no-zones">
              <p>{t('dz.noZones')}</p>
              <p>{t('dz.addZoneHint')}</p>
            </div>
          ) : (
            <div className="zones-grid">
              {zones.map((zone) => (
                <div
                  key={zone._id}
                  className="zone-card"
                  style={{ '--card-color': zone.color }}
                >
                  <div className="zone-header">
                    <h3>{zone.name}</h3>
                    <div className="zone-actions">
                      <button
                        className="btn-icon btn-edit"
                        onClick={() => handleEditZone(zone)}
                        title="Edit zone"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                      </button>
                      <button
                        className="btn-icon btn-delete"
                        onClick={() => handleDeleteZone(zone._id)}
                        title="Delete zone"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="zone-details">
                    <div className="detail-row">
                      <span className="label">{t('dz.distance')}</span>
                      <span className="value">{zone.minDistance} - {zone.maxDistance} km</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Delivery Fee:</span>
                      <span className="value fee">
                        {zone.deliveryFee === 0 ? t('dz.free') : new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(zone.deliveryFee)}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Min Order:</span>
                      <span className="value">{new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(zone.minOrder)}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Est. Time:</span>
                      <span className="value">{zone.estimatedTime} min</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">{t('dz.status')}</span>
                      <span className={`status ${zone.isActive ? 'active' : 'inactive'}`}>
                        {zone.isActive ? t('dz.active') : t('dz.inactive')}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>


    </div>
  );
};

export default DeliveryZones;

