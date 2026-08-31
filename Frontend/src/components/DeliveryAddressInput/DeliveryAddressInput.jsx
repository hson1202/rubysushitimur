import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './DeliveryAddressInput.css';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import ManualLocationPicker from '../ManualLocationPicker/ManualLocationPicker';

const DEFAULT_COORDS = { latitude: 47.4979, longitude: 19.0402 }; // Budapest (fallback)

// Mã bưu điện Hungary luôn gồm đúng 4 chữ số (ví dụ: 1061)
const HU_ZIPCODE_REGEX = /^\d{4}$/;
export const isValidHungarianZipcode = (zipcode) => HU_ZIPCODE_REGEX.test((zipcode || '').toString().trim());

const buildAddressPayload = ({ address = '', components = {}, latitude, longitude }) => {
  const hasCoords =
    typeof latitude === 'number' &&
    typeof longitude === 'number';
  const coords = hasCoords ? { latitude, longitude } : undefined;

  return {
    address,
    street: components.streetLine || components.street || address,
    houseNumber: components.houseNumber || '',
    city: components.city || '',
    state: components.state || '',
    zipcode: components.zipcode || '',
    country: components.country || '',
    coordinates: coords,
    latitude: coords?.latitude,
    longitude: coords?.longitude
  };
};

const DeliveryAddressInput = ({
  value,
  addressData,
  onChange,
  onDeliveryCalculated,
  url,
  restaurantLocation
}) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [deliveryInfo, setDeliveryInfo] = useState(null);
  const [error, setError] = useState('');
  const [isManualPickerOpen, setIsManualPickerOpen] = useState(false);
  const hasStructuredAddress = (data) => Boolean(
    data && (
      (data.street || '').trim() ||
      (data.houseNumber || '').toString().trim() ||
      (data.city || '').trim() ||
      (data.zipcode || '').toString().trim() ||
      (typeof data.latitude === 'number' && typeof data.longitude === 'number') ||
      (data.coordinates?.latitude && data.coordinates?.longitude)
    )
  );
  const [selectedAddress, setSelectedAddress] = useState(() => hasStructuredAddress(addressData) ? addressData : null);

  // 4 ô chi tiết ẩn lúc đầu — chỉ hiện sau khi chọn gợi ý / geocode / ghim bản đồ
  const [showDetailFields, setShowDetailFields] = useState(() => hasStructuredAddress(addressData));
  const [manualFields, setManualFields] = useState({
    street: addressData?.street || '',
    houseNumber: addressData?.houseNumber || '',
    city: addressData?.city || '',
    zipcode: addressData?.zipcode || ''
  });
  const debounceTimer = useRef(null);
  const recalcTimer = useRef(null);
  const inputRef = useRef(null);
  // OpenStreetMap/Nominatim không cần API key, luôn available
  const manualPinAvailable = true;

  // Đồng bộ lại các ô chi tiết khi component cha nạp một địa chỉ khác từ bên ngoài
  // (ví dụ: chọn địa chỉ đã lưu trong sổ địa chỉ)
  useEffect(() => {
    if (!addressData) return;
    setManualFields({
      street: addressData.street || '',
      houseNumber: addressData.houseNumber || '',
      city: addressData.city || '',
      zipcode: addressData.zipcode || ''
    });
    if (hasStructuredAddress(addressData)) {
      setShowDetailFields(true);
    }
  }, [addressData?.street, addressData?.houseNumber, addressData?.city, addressData?.zipcode, addressData?.latitude, addressData?.longitude, addressData?.coordinates]);

  const zipcodeInvalid = manualFields.zipcode.trim().length > 0 && !isValidHungarianZipcode(manualFields.zipcode);

  // Tự điền lại 4 ô chi tiết khi có kết quả tìm kiếm/geocode mới, nhưng không xoá
  // giá trị khách đã tự gõ nếu geocode không trả về (OSM ở Hungary hay thiếu số nhà)
  const applyAutofillFields = (normalized) => {
    setManualFields((prev) => ({
      street: normalized.street || prev.street,
      houseNumber: normalized.houseNumber || prev.houseNumber,
      city: normalized.city || prev.city,
      zipcode: normalized.zipcode || prev.zipcode
    }));
    setShowDetailFields(true);
  };

  // Fetch autocomplete suggestions
  const fetchSuggestions = useCallback(async (searchQuery) => {
    if (searchQuery.length < 3) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Thêm proximity nếu có vị trí nhà hàng
      let proximityParam = '';
      if (restaurantLocation?.longitude && restaurantLocation?.latitude) {
        proximityParam = `&proximity=${restaurantLocation.longitude},${restaurantLocation.latitude}`;
      }

      const response = await axios.get(
        `${url}/api/delivery/autocomplete?query=${encodeURIComponent(searchQuery)}${proximityParam}`
      );

      if (response.data.success) {
        setSuggestions(response.data.data);
        setShowSuggestions(true);
      }
    } catch (err) {
      console.error('Error fetching suggestions:', err);
      setError(t('placeOrder.form.addressError'));
    } finally {
      setIsLoading(false);
    }
  }, [url, restaurantLocation]);

  // Debounced search
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      if (query && !selectedAddress) {
        fetchSuggestions(query);
      }
    }, 500);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [query, fetchSuggestions, selectedAddress]);

  // Calculate delivery fee
  const calculateDelivery = useCallback(async ({ address, latitude, longitude, components, suppressQueryUpdate, preserveManualFields } = {}) => {
    setIsLoading(true);
    setError('');

    try {
      console.log('🚚 Calculating delivery for:', { address, latitude, longitude });

      const response = await axios.post(`${url}/api/delivery/calculate`, {
        address,
        latitude,
        longitude
      });

      console.log('📦 Delivery calculation response:', response.data);

      if (response.data.success) {
        const deliveryData = response.data.data;
        console.log('✅ Delivery available:', deliveryData.zone.name, `- €${deliveryData.zone.deliveryFee}`);

        setDeliveryInfo(deliveryData);
        if (onDeliveryCalculated) {
          onDeliveryCalculated(deliveryData);
        }

        const mergedComponents = components || deliveryData.addressComponents || {};
        const normalized = buildAddressPayload({
          address: deliveryData.address || address || '',
          components: mergedComponents,
          latitude: deliveryData.coordinates?.latitude ?? latitude,
          longitude: deliveryData.coordinates?.longitude ?? longitude
        });

        setSelectedAddress({
          address: normalized.address,
          latitude: normalized.coordinates?.latitude,
          longitude: normalized.coordinates?.longitude
        });

        if (onChange) {
          if (preserveManualFields) {
            onChange({
              coordinates: normalized.coordinates,
              latitude: normalized.latitude,
              longitude: normalized.longitude
            });
          } else {
            onChange(normalized);
            applyAutofillFields(normalized);
          }
        } else if (!preserveManualFields) {
          applyAutofillFields(normalized);
        }

        if (!suppressQueryUpdate && normalized.address) {
          setQuery(normalized.address);
        }
      } else {
        // Out of delivery range - but still update address if available
        const deliveryData = response.data;

        console.warn('⚠️ Delivery NOT available. Distance:', deliveryData.distance, 'km');
        console.warn('Reason:', deliveryData.outOfRange ? 'Out of range' : 'Unknown');

        // Lấy thông báo phù hợp với ngôn ngữ hiện tại
        let errorMessage = deliveryData.message || t('placeOrder.form.deliveryNotAvailable');
        const currentLang = i18n.language || 'hu';
        if (currentLang === 'en' && deliveryData.messageEn) {
          errorMessage = deliveryData.messageEn;
        } else if (currentLang === 'hu' && deliveryData.messageHu) {
          errorMessage = deliveryData.messageHu;
        } else if (currentLang === 'vi' && deliveryData.message) {
          errorMessage = deliveryData.message;
        }

        console.log('❌ Error message to display:', errorMessage);

        if (deliveryData.address) {
          const currentCoords =
            typeof latitude === 'number' && typeof longitude === 'number'
              ? { latitude, longitude }
              : selectedAddress?.latitude && selectedAddress?.longitude
                ? { latitude: selectedAddress.latitude, longitude: selectedAddress.longitude }
                : { latitude, longitude };

          if (!suppressQueryUpdate) {
            setQuery(deliveryData.address);
          }
          setSelectedAddress({
            address: deliveryData.address,
            latitude: currentCoords.latitude,
            longitude: currentCoords.longitude
          });

          if (onChange) {
            const normalizedFallback = buildAddressPayload({
              address: deliveryData.address,
              latitude: currentCoords.latitude,
              longitude: currentCoords.longitude
            });
            onChange(normalizedFallback);
            applyAutofillFields(normalizedFallback);
          }
        }

        setError(errorMessage);
        setDeliveryInfo(null);
        if (onDeliveryCalculated) {
          onDeliveryCalculated(null);
        }
      }
    } catch (err) {
      console.error('❌ Error calculating delivery:', err);
      console.error('Response:', err.response?.data);
      setError(t('placeOrder.form.deliveryCalculationError'));
      setDeliveryInfo(null);
      if (onDeliveryCalculated) {
        onDeliveryCalculated(null);
      }
      if (typeof latitude === 'number' && typeof longitude === 'number') {
        setQuery(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
      }
    } finally {
      setIsLoading(false);
    }
  }, [url, onDeliveryCalculated, onChange, selectedAddress, t]);

  const buildStructuredQuery = useCallback((fields) => {
    const streetLine = [fields.houseNumber, fields.street].filter(Boolean).join(' ').trim();
    return [streetLine, fields.zipcode, fields.city, 'Hungary'].filter(Boolean).join(', ');
  }, []);

  const scheduleDeliveryRecalc = useCallback((fields) => {
    if (!fields.city?.trim() || !isValidHungarianZipcode(fields.zipcode)) return;

    if (recalcTimer.current) {
      clearTimeout(recalcTimer.current);
    }

    recalcTimer.current = setTimeout(() => {
      const addressQuery = buildStructuredQuery(fields);
      if (addressQuery.length >= 5) {
        calculateDelivery({ address: addressQuery, suppressQueryUpdate: true, preserveManualFields: true });
      }
    }, 600);
  }, [buildStructuredQuery, calculateDelivery]);

  // Khách sửa city/zip → tính lại phí ship; sửa street/số nhà → giữ toạ độ cũ
  const handleManualFieldChange = (field) => (e) => {
    const val = e.target.value;
    const nextFields = { ...manualFields, [field]: val };
    setManualFields(nextFields);
    if (onChange) {
      onChange({ [field]: val });
    }
    if (field === 'city' || field === 'zipcode') {
      scheduleDeliveryRecalc(nextFields);
    }
  };

  useEffect(() => {
    return () => {
      if (recalcTimer.current) {
        clearTimeout(recalcTimer.current);
      }
    };
  }, []);

  // Handle suggestion selection
  const handleSelectSuggestion = (suggestion) => {
    setQuery(suggestion.address);
    setSelectedAddress({
      address: suggestion.address,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude
    });
    setShowSuggestions(false);
    setSuggestions([]);

    // Update parent component
    if (onChange) {
      const normalized = buildAddressPayload({
        address: suggestion.address,
        components: suggestion.components || {},
        latitude: suggestion.latitude,
        longitude: suggestion.longitude
      });
      onChange(normalized);
      applyAutofillFields(normalized);
    }

    // Calculate delivery
    calculateDelivery({
      address: suggestion.address,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
      components: suggestion.components
    });
  };

  // Handle input change
  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setQuery(newValue);
    setSelectedAddress(null);
    setDeliveryInfo(null);
    setError('');
    setShowDetailFields(false);

    if (onChange) {
      onChange(buildAddressPayload({ address: newValue }));
    }
  };

  // Handle input blur (auto-calculate if typed but not selected)
  const handleInputBlur = () => {
    // Delay slightly so a suggestion click (if any) can process first
    setTimeout(() => {
      // If user typed something but hasn't fully selected a valid address from dropdown
      // We will ask backend to geocode what they typed directly
      if (query && !selectedAddress && query.length >= 3) {
        setShowSuggestions(false);
        calculateDelivery({ address: query, suppressQueryUpdate: true });
      }
    }, 200);
  };

  // Handle Enter keypress
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Prevent form submission
      if (query && !selectedAddress && query.length >= 3) {
        setShowSuggestions(false);
        calculateDelivery({ address: query });
      }
    }
  };

  const handleManualLocationConfirm = async (coords) => {
    if (!coords) return;
    setIsManualPickerOpen(false);

    // Set temporary query (will be updated by calculateDelivery after reverse geocoding)
    setQuery(t('placeOrder.form.findingAddress'));
    setSelectedAddress({
      address: '',
      latitude: coords.latitude,
      longitude: coords.longitude
    });

    // Calculate delivery - backend will reverse geocode and return the address
    // calculateDelivery will automatically update the query with the address from response
    await calculateDelivery({
      latitude: coords.latitude,
      longitude: coords.longitude
      // Don't pass address - let backend reverse geocode it
    });
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (inputRef.current && !inputRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const pickerInitialCoords = useMemo(() => {
    if (restaurantLocation?.latitude && restaurantLocation?.longitude) {
      return { latitude: restaurantLocation.latitude, longitude: restaurantLocation.longitude };
    }
    return DEFAULT_COORDS;
  }, [restaurantLocation?.latitude, restaurantLocation?.longitude]);

  return (
    <div className="delivery-address-input">
      <div className="address-input-wrapper" ref={inputRef}>
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          placeholder={t('placeOrder.form.addressPlaceholder')}
          className="address-input"
          autoComplete="off"
        />
        {isLoading && <span className="address-input-spinner" aria-hidden="true" />}

        {showSuggestions && suggestions.length > 0 && (
          <div className="suggestions-dropdown">
            {suggestions.map((suggestion) => {
              const hasHouseNumber = suggestion.components?.houseNumber &&
                suggestion.components.houseNumber.trim().length > 0;
              const isGeneralAddress = !hasHouseNumber &&
                (suggestion.components?.street || suggestion.shortAddress);

              return (
                <div
                  key={suggestion.id}
                  className={`suggestion-item ${isGeneralAddress ? 'suggestion-item-warning' : ''}`}
                  onMouseDown={() => handleSelectSuggestion(suggestion)}
                >
                  <span className="suggestion-icon">📍</span>
                  <div className="suggestion-text">
                    <div className="suggestion-main">
                      {suggestion.shortAddress}
                      {isGeneralAddress && (
                        <span className="suggestion-warning-badge" title={t('placeOrder.form.houseNumberMapboxMissing')}>
                          ⚠️
                        </span>
                      )}
                    </div>
                    <div className="suggestion-detail">{suggestion.address}</div>
                    {isGeneralAddress && (
                      <div className="suggestion-warning-text">
                        {t('placeOrder.form.houseNumberMapboxMissing')}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4 ô chi tiết — chỉ hiện sau khi đã chọn/ghim địa chỉ */}
      {showDetailFields && (
      <div className="manual-address-fields manual-address-fields-reveal">
        <p className="manual-fields-hint">{t('placeOrder.form.manualFieldsHint')}</p>
        <div className="manual-fields-row">
          <div className="manual-field manual-field-street">
            <label>
              {t('placeOrder.form.street')}
              <span className="required-indicator" style={{ color: 'red', marginLeft: '4px' }}>*</span>
            </label>
            <input
              type="text"
              value={manualFields.street}
              onChange={handleManualFieldChange('street')}
              placeholder={t('placeOrder.form.streetPlaceholder')}
            />
          </div>
          <div className="manual-field manual-field-house-number">
            <label>
              {t('placeOrder.form.houseNumberLabel')}
              <span className="required-indicator" style={{ color: 'red', marginLeft: '4px' }}>*</span>
            </label>
            <input
              type="text"
              value={manualFields.houseNumber}
              onChange={handleManualFieldChange('houseNumber')}
              placeholder={t('placeOrder.form.houseNumberPlaceholder')}
              className="house-number-field-input"
            />
          </div>
        </div>
        <div className="manual-fields-row">
          <div className="manual-field manual-field-city">
            <label>
              {t('placeOrder.form.city')}
              <span className="required-indicator" style={{ color: 'red', marginLeft: '4px' }}>*</span>
            </label>
            <input
              type="text"
              value={manualFields.city}
              onChange={handleManualFieldChange('city')}
              placeholder={t('placeOrder.form.cityPlaceholder')}
            />
          </div>
          <div className="manual-field manual-field-zipcode">
            <label>
              {t('placeOrder.form.zipcode')}
              <span className="required-indicator" style={{ color: 'red', marginLeft: '4px' }}>*</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={manualFields.zipcode}
              onChange={handleManualFieldChange('zipcode')}
              placeholder={t('placeOrder.form.zipcodePlaceholder')}
              className={zipcodeInvalid ? 'manual-field-input-warning' : ''}
            />
            {zipcodeInvalid && (
              <p className="manual-field-error">{t('placeOrder.form.zipcodeInvalid')}</p>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Delivery info display */}
      {deliveryInfo && (
        <div className="delivery-info-card">
          <div className="delivery-info-header">
            <span className="delivery-icon">🚚</span>
            <span className="delivery-zone-name">{deliveryInfo.zone.name}</span>
          </div>
          <div className="delivery-info-details">
            <div className="info-row">
              <span className="info-label">{t('placeOrder.form.deliveryInfo.distance')}</span>
              <span className="info-value">{deliveryInfo.distance} km</span>
            </div>
            <div className="info-row">
              <span className="info-label">{t('placeOrder.form.deliveryInfo.deliveryFee')}</span>
              <span className="info-value delivery-fee">
                {deliveryInfo.zone.deliveryFee === 0 ? t('placeOrder.form.deliveryInfo.free') : new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(deliveryInfo.zone.deliveryFee)}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">{t('placeOrder.form.deliveryInfo.minOrder')}</span>
              <span className="info-value">{new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(deliveryInfo.zone.minOrder)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">{t('placeOrder.form.deliveryInfo.estimatedTime')}</span>
              <span className="info-value">{deliveryInfo.zone.estimatedTime} min</span>
            </div>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="delivery-error">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {manualPinAvailable && (
        <>
          {/* Village / address not found hint */}
          {error && (
            <div className="village-hint-banner">
              <span className="village-hint-icon">🗺️</span>
              <div className="village-hint-text">
                <strong>{t('placeOrder.form.addressNotFoundTitle')}</strong>
                <span>{t('placeOrder.form.addressNotFoundHint')}</span>
              </div>
            </div>
          )}
          <button
            type="button"
            className="manual-pin-trigger manual-pin-prominent"
            onClick={() => setIsManualPickerOpen(true)}
          >
            📍 {t('placeOrder.form.manualPinButton')}
          </button>
          <ManualLocationPicker
            isOpen={isManualPickerOpen}
            onClose={() => setIsManualPickerOpen(false)}
            onConfirm={handleManualLocationConfirm}
            initialCoords={pickerInitialCoords}
            restaurantLocation={restaurantLocation}
          />
        </>
      )}
    </div>
  );
};

export default DeliveryAddressInput;

