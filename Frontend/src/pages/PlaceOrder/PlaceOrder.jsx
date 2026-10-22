import { useState, useEffect, useContext, useRef, useCallback } from 'react'
import './PlaceOrder.css'
import { StoreContext, CHECKOUT_DRAFT_KEY, hasStoredCartItems } from '../../Context/StoreContext'
import { useAuth } from '../../Context/AuthContext'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import SuccessPopup from '../../components/SuccessPopup/SuccessPopup'
import DeliveryAddressInput, { isValidHungarianZipcode } from '../../components/DeliveryAddressInput/DeliveryAddressInput'
import DeliveryZoneDisplay from '../../components/DeliveryZoneDisplay/DeliveryZoneDisplay'
import '../../i18n'
import { formatHuf } from '../../utils/currency'
import { generateOrderTimeSlots, normalizeWeeklyHours } from '../../utils/restaurantHours'
import { findUnavailableCartItems } from '../../utils/orderAvailability'

const EMPTY_CONTACT = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  note: "",
  preferredDeliveryTime: ""
}

const toCoordinates = (coords) => {
  if (!coords) return null
  const latitude = Number(coords.latitude ?? coords.lat)
  const longitude = Number(coords.longitude ?? coords.lng)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (latitude === 0 && longitude === 0) return null
  return { latitude, longitude }
}

const readCheckoutDraft = () => {
  try {
    const raw = localStorage.getItem(CHECKOUT_DRAFT_KEY) || sessionStorage.getItem(CHECKOUT_DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (error) {
    console.error('Failed to read checkout draft:', error)
    return null
  }
}

const PlaceOrder = () => {
  const { t, i18n } = useTranslation();
  const { getTotalCartAmount, food_list, cartItems, cartItemsData, url, clearCart, boxFee, systemFee, restaurantInfo, restaurantOpenStatus, deliveryEnabled } = useContext(StoreContext);
  const { token, isAuthenticated, user } = useAuth();
  const checkoutDraft = useRef(readCheckoutDraft()).current;
  const [data, setData] = useState(() => ({
    ...EMPTY_CONTACT,
    ...(checkoutDraft?.data || {})
  }))
  const [orderType, setOrderType] = useState(isAuthenticated ? 'registered' : 'guest');
  const [fulfillmentType, setFulfillmentType] = useState(checkoutDraft?.fulfillmentType || 'delivery');
  // Hiện tại chỉ nhận tiền mặt - thẻ hiển thị nhưng bị khóa (chưa khả dụng)
  const [paymentMethod, setPaymentMethod] = useState(checkoutDraft?.paymentMethod || 'cash');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [orderSuccessData, setOrderSuccessData] = useState({});
  
  // Delivery state
  const [deliveryInfo, setDeliveryInfo] = useState(checkoutDraft?.deliveryInfo || null);
  const [isAddressCalculating, setIsAddressCalculating] = useState(false);
  const [isSavedAddressCalculating, setIsSavedAddressCalculating] = useState(false);
  const savedCalcIdRef = useRef(0);
  const [restaurantLocation, setRestaurantLocation] = useState(null);
  const [deliveryAddress, setDeliveryAddress] = useState(checkoutDraft?.deliveryAddress || null);
  
  // User addresses state (for authenticated users)
  const [userAddresses, setUserAddresses] = useState([]);
  const [defaultAddressId, setDefaultAddressId] = useState(null);
  const [selectedAddressId, setSelectedAddressId] = useState(checkoutDraft?.selectedAddressId || null);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [useManualAddress, setUseManualAddress] = useState(checkoutDraft?.useManualAddress || false); // Track if user wants to enter address manually

  const isDelivery = fulfillmentType === 'delivery';

  useEffect(() => {
    if (deliveryEnabled || fulfillmentType !== 'delivery') return;
    setFulfillmentType('pickup');
    setDeliveryInfo(null);
    setDeliveryAddress(null);
    setSelectedAddressId(null);
    setUseManualAddress(false);
  }, [deliveryEnabled, fulfillmentType]);

  useEffect(() => {
    document.body.classList.add('pattern-route')
    return () => document.body.classList.remove('pattern-route')
  }, [])

  const formatPrice = (price) => formatHuf(price);

  // Helper function to check if box fee is disabled for an item
  const isBoxFeeDisabled = (item) => {
    return item.disableBoxFee === true || 
           item.disableBoxFee === "true" || 
           item.disableBoxFee === 1 || 
           item.disableBoxFee === "1" ||
           (typeof item.disableBoxFee === 'string' && item.disableBoxFee.toLowerCase() === 'true');
  }

  // Get cart items to check for box fee
  const getCartItemsForCheck = () => {
    const items = [];
    Object.entries(cartItems).forEach(([cartKey, quantity]) => {
      if (quantity > 0) {
        const actualProductId = cartKey.split('_')[0];
        const baseProduct = food_list.find(p => p._id === actualProductId);
        if (baseProduct) {
          const itemData = cartItemsData[cartKey] || {};
          items.push({
            ...baseProduct,
            ...itemData
          });
        }
      }
    });
    return items;
  }

  // Check if any item in cart requires box fee
  const hasItemsWithBoxFee = () => {
    const items = getCartItemsForCheck();
    return items.some(item => !isBoxFeeDisabled(item));
  }

  const onChangeHandler = (event) => {
    const name = event.target.name;
    const value = event.target.value;
    setData(data => ({ ...data, [name]: value }))
  }

  const timeSlots = generateOrderTimeSlots(normalizeWeeklyHours(restaurantInfo?.weeklyHours))
  const timeSlotsKey = timeSlots.join(',')

  // Keep the selected delivery time valid when restaurant hours / available slots change
  useEffect(() => {
    const slots = timeSlotsKey ? timeSlotsKey.split(',') : []
    if (slots.length > 0) {
      setData(prev => {
        if (prev.preferredDeliveryTime && slots.includes(prev.preferredDeliveryTime)) {
          return prev;
        }
        return { ...prev, preferredDeliveryTime: slots[0] };
      });
    } else {
      setData(prev => (prev.preferredDeliveryTime ? { ...prev, preferredDeliveryTime: '' } : prev));
    }
  }, [timeSlotsKey]);

  // Pre-fill user data if authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      // Split name into first and last name if available
      const nameParts = user.name ? user.name.split(' ') : [];
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      setData(prev => ({
        ...prev,
        firstName: prev.firstName || firstName,
        lastName: prev.lastName || lastName,
        email: prev.email || user.email || '',
        phone: prev.phone || user.phone || ''
      }));
    }
  }, [isAuthenticated, user]);

  // Fetch user addresses if authenticated
  useEffect(() => {
    const fetchUserAddresses = async () => {
      if (isAuthenticated && token) {
        try {
          const response = await axios.get(url + '/api/user/addresses', {
            headers: { token }
          });
          
          if (response.data.success) {
            const addresses = response.data.data || [];
            setUserAddresses(addresses);
            setDefaultAddressId(response.data.defaultAddressId || null);
            
            // Keep a restored checkout address on refresh; otherwise pick the default saved address
            if (addresses.length > 0 && !useManualAddress) {
              const restoredAddr = checkoutDraft?.selectedAddressId
                ? addresses.find(addr => addr._id === checkoutDraft.selectedAddressId)
                : null;
              const defaultAddr = restoredAddr || addresses.find(addr => 
                addr._id === response.data.defaultAddressId || addr.isDefault
              ) || addresses[0];
              
              if (defaultAddr) {
                if (checkoutDraft?.deliveryAddress || checkoutDraft?.selectedAddressId) {
                  setSelectedAddressId(restoredAddr?._id || checkoutDraft.selectedAddressId || defaultAddr._id);
                  return;
                }
                setSelectedAddressId(defaultAddr._id);
                setDeliveryAddress({
                  address: defaultAddr.street || '',
                  street: defaultAddr.street || '',
                  houseNumber: defaultAddr.houseNumber || '',
                  city: defaultAddr.city || '',
                  state: defaultAddr.state || '',
                  zipcode: defaultAddr.zipcode || '',
                  country: defaultAddr.country || '',
                  coordinates: defaultAddr.coordinates || null
                });
                
                // Pre-fill contact info from default address
                if (defaultAddr.fullName) {
                  const nameParts = defaultAddr.fullName.split(' ');
                  setData(prev => ({
                    ...prev,
                    firstName: prev.firstName || nameParts[0] || '',
                    lastName: prev.lastName || nameParts.slice(1).join(' ') || '',
                    phone: prev.phone || defaultAddr.phone || ''
                  }));
                }
                
                await calculateDeliveryForSavedAddress(defaultAddr);
              }
            }
          }
        } catch (error) {
          console.error('Error fetching user addresses:', error);
          // Don't show error to user, just log it
          // User can still proceed with manual address entry
        }
      }
    };
    
    fetchUserAddresses();
  }, [isAuthenticated, token, url]);

  // Simple retry helper for transient errors (e.g., 502/503/network)
  const postWithRetry = async (endpoint, data, options, retries = 2, delayMs = 800) => {
    try {
      return await axios.post(endpoint, data, options)
    } catch (err) {
      const status = err.response?.status
      const isTransient = !status || (status >= 500 && status < 600)
      if (retries > 0 && isTransient) {
        await new Promise(r => setTimeout(r, delayMs))
        return postWithRetry(endpoint, data, options, retries - 1, delayMs * 1.5)
      }
      throw err
    }
  }

  const placeOrder = async (event) => {
    event.preventDefault();
    
    if (isSubmitting || isFeeCalculating) return;

    if (restaurantOpenStatus && !restaurantOpenStatus.isOpen) {
      alert(restaurantOpenStatus.message || t('restaurant.closedNow'));
      return;
    }

    if (!deliveryEnabled && isDelivery) {
      alert(t('placeOrder.errors.deliveryDisabled'));
      return;
    }

    setIsSubmitting(true);
    
    if (isDelivery) {
      // Validate delivery address first (most important)
      if (!deliveryAddress || !deliveryAddress.address) {
        alert(t('placeOrder.errors.invalidAddress'));
        setIsSubmitting(false);
        return;
      }

      // Validate delivery zone - không cho phép đặt hàng nếu địa chỉ ngoài vùng giao hàng
      if (!deliveryInfo || !deliveryInfo.zone) {
        alert(t('placeOrder.errors.deliveryZoneNotAvailable'));
        setIsSubmitting(false);
        return;
      }
    }

    // ============================================
    // Kiểm tra đủ 4 trường địa chỉ chi tiết: Street, Số nhà, Thành phố, Zip code
    // (thay cho việc đoán bằng regex trong chuỗi geocode như trước)
    // ============================================
    if (isDelivery) {
      const missingFields = [
        { key: 'street', selector: '.manual-field-street input' },
        { key: 'houseNumber', selector: '.manual-field-house-number input' },
        { key: 'city', selector: '.manual-field-city input' },
        { key: 'zipcode', selector: '.manual-field-zipcode input' }
      ].filter(({ key }) => {
        const val = (deliveryAddress?.[key] || '').toString().trim();
        if (key === 'zipcode') return !val || !isValidHungarianZipcode(val);
        return !val;
      });

      if (missingFields.length > 0) {
        const firstInvalidInput = document.querySelector(missingFields[0].selector);
        if (firstInvalidInput) {
          firstInvalidInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          firstInvalidInput.focus();
          firstInvalidInput.classList.add('input-error-flash');
          setTimeout(() => {
            firstInvalidInput.classList.remove('input-error-flash');
          }, 2000);
        }

        alert(t('placeOrder.errors.missingAddressFields'));
        setIsSubmitting(false);
        return;
      }
    }

    // Validate required fields
    const email = (data.email || '').trim();
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!data.firstName || !data.lastName || !data.phone || !email) {
      alert(t('placeOrder.errors.requiredFields'));
      setIsSubmitting(false);
      return;
    }
    if (!isValidEmail) {
      alert(t('placeOrder.errors.invalidEmail'));
      setIsSubmitting(false);
      return;
    }

    // Validate minimum order if delivery info is available
    if (isDelivery && deliveryInfo && deliveryInfo.zone) {
      const subtotal = getTotalCartAmount();
      const minOrder = deliveryInfo.zone.minOrder;
      
      if (subtotal < minOrder) {
        alert(t('placeOrder.errors.minOrderNotMet', {
          minOrder: formatPrice(minOrder),
          subtotal: formatPrice(subtotal),
          needed: formatPrice(minOrder - subtotal)
        }));
        setIsSubmitting(false);
        return;
      }
    }

    // Phone: chỉ cần có giá trị, chấp nhận ký tự + và các ký tự phổ biến
    
    // Build order items from cart, supporting option-suffixed IDs
    const orderItems = [];
    Object.entries(cartItems).forEach(([cartKey, quantity]) => {
      if (quantity > 0) {
        const actualProductId = cartKey.split('_')[0];
        const baseProduct = food_list.find(p => p._id === actualProductId);
        if (baseProduct) {
          const itemData = cartItemsData[cartKey] || {};
          const itemInfo = {
            ...baseProduct,
            ...itemData,
            quantity
          };
          orderItems.push(itemInfo);
        }
      }
    });

    // Check if cart is empty
    if (orderItems.length === 0) {
      alert(t('placeOrder.errors.emptyCart'));
      setIsSubmitting(false);
      return;
    }

    const unavailableItems = findUnavailableCartItems(cartItems, food_list)
    if (unavailableItems.length > 0) {
      alert(t('placeOrder.errors.itemUnavailable', {
        names: unavailableItems.map((item) => item.name).join(', ')
      }))
      setIsSubmitting(false)
      return
    }

    // Tạo thông tin khách hàng
    const customerInfo = {
      name: `${data.firstName} ${data.lastName}`,
      phone: data.phone,
      email
    };

    const deliveryFee = getDeliveryFee();
    const orderSystemFee = getSystemFee();
    
    let orderData = {
      address: isDelivery ? {
        // street/houseNumber/city/zipcode là các trường khách đã tự xác nhận/sửa trực tiếp
        // (không còn suy đoán bằng regex từ chuỗi geocode như trước)
        street: (deliveryAddress.street || '').trim(),
        fullAddress: deliveryAddress.address,
        houseNumber: deliveryAddress.houseNumber || '',
        city: deliveryAddress.city || '',
        state: deliveryAddress.state || '',
        zipcode: deliveryAddress.zipcode || '',
        country: deliveryAddress.country || '',
        coordinates: deliveryAddress.coordinates
      } : null,
      items: orderItems,
      amount: getTotalCartAmount() + deliveryFee + orderSystemFee,
      customerInfo: customerInfo,
      orderType: isAuthenticated ? 'registered' : 'guest',
      fulfillmentType: fulfillmentType,
      paymentMethod: paymentMethod,
      language: i18n.language || 'hu',
      note: data.note || '',
      preferredDeliveryTime: data.preferredDeliveryTime || '',
      deliveryInfo: isDelivery && deliveryInfo ? {
        zone: deliveryInfo.zone.name,
        distance: deliveryInfo.distance,
        deliveryFee: deliveryInfo.zone.deliveryFee,
        systemFee: orderSystemFee,
        estimatedTime: deliveryInfo.zone.estimatedTime
      } : null
    };

    // KHÔNG gán userId vào orderData - backend sẽ tự động lấy từ token nếu có

    try {
      console.log('Sending order data:', orderData);
      console.log('Token available:', !!token);
      
      let response = await postWithRetry(
        url + "/api/order/place",
        orderData,
        { headers: token ? { token } : {} },
        2,
        700
      )

      console.log('Response:', response.data);

      if (response.data.success) {
        const { trackingCode } = response.data;
        
        // Lưu mã tracking vào localStorage để hiển thị sau khi đặt hàng
        if (trackingCode) {
          localStorage.setItem('lastTrackingCode', trackingCode);
          localStorage.setItem('lastPhone', data.phone);
        }
        // Lưu snapshot items để khách xem lại ngay sau khi đặt
        try {
          localStorage.setItem('lastOrderItems', JSON.stringify(orderItems));
        } catch (error) {
          console.error('Error saving last order items:', error);
        }
        
        // Tính toán số tiền trước khi xóa cart
        const finalAmount = getTotalCartAmount() + getDeliveryFee() + getSystemFee();
        
        // Hiển thị popup thành công
        setOrderSuccessData({
          trackingCode: trackingCode,
          phone: data.phone,
          orderAmount: finalAmount,
          items: orderItems
        });
        
        setShowSuccessPopup(true);
        
        // Không xóa cart ngay lập tức, để popup hiển thị trước
        // Cart sẽ được xóa khi user đóng popup
      } else {
        // Avoid showing backend English messages directly; show translated, user-friendly errors.
        alert(t('placeOrder.errors.general'));
      }
    } catch (error) {
      console.error('Error placing order:', error);
      
      // Nếu lỗi 401 (Unauthorized) và có token, có thể token đã hết hạn
      // Thử lại như guest order
      if (error.response?.status === 401 && token) {
        console.log('⚠️ Token invalid or expired, retrying as guest order...');
        try {
          // Thử lại như guest order
          const guestOrderData = {
            ...orderData,
            orderType: 'guest'
          };
          
          const retryResponse = await postWithRetry(
            url + "/api/order/place",
            guestOrderData,
            { headers: {} },
            2,
            700
          )
          
          if (retryResponse.data.success) {
            const { trackingCode } = retryResponse.data;
            
            if (trackingCode) {
              localStorage.setItem('lastTrackingCode', trackingCode);
              localStorage.setItem('lastPhone', data.phone);
            }
            try {
              localStorage.setItem('lastOrderItems', JSON.stringify(orderItems));
            } catch (error) {
              console.error('Error saving last order items:', error);
            }
            
            const finalAmount = getTotalCartAmount() + getDeliveryFee() + getSystemFee();
            
            setOrderSuccessData({
              trackingCode: trackingCode,
              phone: data.phone,
              orderAmount: finalAmount,
              items: orderItems
            });
            
            setShowSuccessPopup(true);
            setIsSubmitting(false);
            return;
          }
        } catch (retryError) {
          console.error('Error retrying as guest:', retryError);
          // Fall through to show error message
        }
      }
      
      let errorMessage = t('placeOrder.errors.general');
      
      if (error.response) {
        // Server responded with error
        console.log('Error response:', error.response.data);
        const status = error.response.status;
        // Avoid showing backend English messages directly; show translated, user-friendly errors.
        const errorCode = error.response.data?.code;
        if (errorCode === 'DELIVERY_DISABLED') {
          errorMessage = t('placeOrder.errors.deliveryDisabled');
        } else if (errorCode === 'RESTAURANT_CLOSED') {
          errorMessage = restaurantOpenStatus?.message || t('restaurant.closedNow');
        } else if (errorCode === 'ADDRESS_NOT_FOUND') {
          errorMessage = t('placeOrder.form.addressNotFound');
        } else if (errorCode === 'GEOCODE_UNAVAILABLE') {
          errorMessage = t('placeOrder.form.geocodeUnavailable');
        } else if (errorCode === 'DELIVERY_UNAVAILABLE') {
          errorMessage = t('placeOrder.errors.deliveryZoneNotAvailable');
        } else if (errorCode === 'ITEM_UNAVAILABLE') {
          const names = (error.response.data?.unavailableItems || []).map((item) => item.name).filter(Boolean).join(', ')
          errorMessage = t('placeOrder.errors.itemUnavailable', { names })
        } else {
          errorMessage = status >= 500
            ? t('placeOrder.errors.serverError', { status })
            : t('placeOrder.errors.general');
        }
      } else if (error.request) {
        // Network error
        errorMessage = t('placeOrder.errors.networkError');
      } else {
        // Other error
        errorMessage = error.message || t('placeOrder.errors.unknownError');
      }
      
      alert(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  const navigate = useNavigate();

  // Fetch restaurant location
  useEffect(() => {
    const fetchRestaurantLocation = async () => {
      try {
        const response = await axios.get(`${url}/api/delivery/restaurant-location`);
        if (response.data.success && response.data.data) {
          setRestaurantLocation(response.data.data);
        }
      } catch (error) {
        console.error('Error fetching restaurant location:', error);
      }
    };
    fetchRestaurantLocation();
  }, [url]);

  // Calculate delivery fee
  const getDeliveryFee = () => {
    if (getTotalCartAmount() === 0) return 0;
    if (!isDelivery) return 0;
    if (deliveryInfo && deliveryInfo.zone) {
      return deliveryInfo.zone.deliveryFee;
    }
    return 0;
  };

  const getSystemFee = () => {
    if (getTotalCartAmount() === 0) return 0;
    if (!isDelivery) return 0;
    return Number(systemFee) || 0;
  };

  // Handle delivery calculation
  const handleDeliveryCalculated = (info) => {
    setDeliveryInfo(info);
  };

  const handleAddressCalculatingChange = useCallback((calculating) => {
    setIsAddressCalculating(calculating);
  }, []);

  // Địa chỉ đã lưu: dùng toạ độ đã lưu nếu có; không thì gửi đủ đường/số nhà/thành phố/mã bưu điện
  // để backend không đoán nhầm sang một thị trấn khác có cùng tên đường
  const calculateDeliveryForSavedAddress = async (addr) => {
    const requestId = ++savedCalcIdRef.current;
    const savedCoords = toCoordinates(addr?.coordinates);
    const street = (addr?.street || '').trim();
    const payload = savedCoords
      ? { address: street || undefined, ...savedCoords }
      : {
          address: [street, [addr?.zipcode, addr?.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
          street,
          houseNumber: addr?.houseNumber || '',
          city: addr?.city || '',
          zipcode: addr?.zipcode || ''
        };

    setDeliveryInfo(null);
    setIsSavedAddressCalculating(true);
    try {
      const response = await axios.post(url + '/api/delivery/calculate', payload, { timeout: 20000 });
      if (requestId !== savedCalcIdRef.current) return;

      if (response.data.success) {
        const info = response.data.data;
        handleDeliveryCalculated(info);
        if (!savedCoords && info.coordinates) {
          setDeliveryAddress((prev) => (prev ? { ...prev, coordinates: info.coordinates } : prev));
        }
      } else {
        setDeliveryInfo(null);
      }
    } catch (error) {
      if (requestId !== savedCalcIdRef.current) return;
      console.error('Error calculating delivery for saved address:', error);
      setDeliveryInfo(null);
    } finally {
      if (requestId === savedCalcIdRef.current) {
        setIsSavedAddressCalculating(false);
      }
    }
  };

  // Handle delivery address change
  const handleDeliveryAddressChange = (addressData) => {
    setDeliveryAddress((prev) => ({
      ...(prev || {}),
      ...addressData
    }));
  };

  // Handle address selection from modal
  const handleSelectAddress = async (address) => {
    setSelectedAddressId(address._id);
    const newDeliveryAddress = {
      address: address.street || '',
      street: address.street || '',
      houseNumber: address.houseNumber || '',
      city: address.city || '',
      state: address.state || '',
      zipcode: address.zipcode || '',
      country: address.country || '',
      coordinates: address.coordinates || null
    };
    setDeliveryAddress(newDeliveryAddress);
    
    // Update contact info from selected address
    if (address.fullName) {
      const nameParts = address.fullName.split(' ');
      setData(prev => ({
        ...prev,
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' ') || '',
        phone: address.phone || prev.phone
      }));
    }
    
    setShowAddressModal(false);
    await calculateDeliveryForSavedAddress(address);
  };

  // Determine if we should show full form or address card
  const shouldShowAddressCard = isDelivery && isAuthenticated && userAddresses.length > 0 && !useManualAddress;
  
  // Get currently selected address for display
  const selectedAddress = shouldShowAddressCard 
    ? userAddresses.find(addr => addr._id === selectedAddressId) || userAddresses[0]
    : null;
  
  // Helper to check if any address has been selected (for warning condition)
  const hasAnyAddressSelected = isDelivery && (!!deliveryAddress?.address || !!selectedAddressId);

  const isFeeCalculating = isDelivery && (
    isSavedAddressCalculating || (isAddressCalculating && !shouldShowAddressCard)
  );

  const hasCartItems = Object.values(cartItems || {}).some((qty) => Number(qty) > 0)
  const [cartRestoreChecked, setCartRestoreChecked] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setCartRestoreChecked(true), 400)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (showSuccessPopup) return
    if (hasCartItems || hasStoredCartItems()) return
    if (!cartRestoreChecked) return
    navigate('/')
  }, [hasCartItems, cartRestoreChecked, navigate, showSuccessPopup])

  useEffect(() => {
    if (showSuccessPopup) {
      try {
        localStorage.removeItem(CHECKOUT_DRAFT_KEY)
        sessionStorage.removeItem(CHECKOUT_DRAFT_KEY)
      } catch (error) {
        console.error('Failed to clear checkout draft:', error)
      }
      return
    }
    try {
      localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify({
        data,
        fulfillmentType,
        paymentMethod,
        deliveryAddress,
        deliveryInfo,
        selectedAddressId,
        useManualAddress
      }))
      sessionStorage.removeItem(CHECKOUT_DRAFT_KEY)
    } catch (error) {
      console.error('Failed to save checkout draft:', error)
    }
  }, [data, fulfillmentType, paymentMethod, deliveryAddress, deliveryInfo, selectedAddressId, useManualAddress, showSuccessPopup])

  // Auto-focus first input on mobile
  useEffect(() => {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      const firstInput = document.querySelector('.place-order input');
      if (firstInput) {
        firstInput.focus();
      }
    }
  }, []);



  
  const isRestaurantClosed = restaurantOpenStatus && !restaurantOpenStatus.isOpen;

  return (
    <div className="place-order-page">
      <form onSubmit={placeOrder} className="place-order">
        {isRestaurantClosed && (
          <div className="restaurant-closed-order-notice" role="alert">
            {restaurantOpenStatus.message || t('restaurant.closedNow')}
          </div>
        )}
        <div className="place-order-left">
          <p className="title">{t('placeOrder.title')}</p>
          
          {/* Order Type Selection - Chỉ hiển thị khi chưa login */}
          {!isAuthenticated && (
            <div className="order-type-section">
              <h3>{t('placeOrder.orderType.title')}</h3>
              <div className="order-type-options">
                <label className="order-type-option">
                  <input
                    type="radio"
                    name="orderType"
                    value="guest"
                    checked={orderType === 'guest'}
                    onChange={(e) => setOrderType(e.target.value)}
                  />
                  <span>{t('placeOrder.orderType.guest')}</span>
                </label>
              </div>
            </div>
          )}

          {/* Fulfillment Type Selection */}
          <div className="fulfillment-type-section">
            <h3>{t('placeOrder.fulfillment.title')}</h3>
            {!deliveryEnabled && (
              <div className="delivery-unavailable-order-notice" role="status">
                {t('placeOrder.fulfillment.deliveryDisabledNotice')}
              </div>
            )}
            <div className="fulfillment-type-options">
              {[
                { value: 'pickup', title: t('placeOrder.fulfillment.pickupTitle'), desc: t('placeOrder.fulfillment.pickupDesc') },
                {
                  value: 'delivery',
                  title: t('placeOrder.fulfillment.deliveryTitle'),
                  desc: deliveryEnabled
                    ? t('placeOrder.fulfillment.deliveryDesc')
                    : t('placeOrder.fulfillment.deliveryUnavailable'),
                  disabled: !deliveryEnabled
                },
              ].map((option) => (
                <label
                  key={option.value}
                  className={`fulfillment-card ${fulfillmentType === option.value ? 'active' : ''} ${option.disabled ? 'payment-card-disabled' : ''}`}
                >
                  <input
                    type="radio"
                    name="fulfillmentType"
                    value={option.value}
                    checked={fulfillmentType === option.value}
                    disabled={option.disabled}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (next === 'delivery' && !deliveryEnabled) return;
                      setFulfillmentType(next);
                      if (next !== 'delivery') {
                        savedCalcIdRef.current += 1;
                        setIsSavedAddressCalculating(false);
                        setDeliveryInfo(null);
                        setDeliveryAddress(null);
                        setSelectedAddressId(null);
                        setUseManualAddress(false);
                      } else if (isAuthenticated && userAddresses.length > 0) {
                        const defaultAddr = userAddresses.find(addr =>
                          addr._id === defaultAddressId || addr.isDefault
                        ) || userAddresses[0];
                        if (defaultAddr) {
                          handleSelectAddress(defaultAddr);
                        }
                      }
                    }}
                  />
                  <div className="fulfillment-text">
                    <span className="fulfillment-title">{option.title}</span>
                    <span className="fulfillment-desc">{option.desc}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Payment Method Selection - hiện chỉ nhận tiền mặt, thẻ chưa khả dụng */}
          <div className="payment-method-section">
            <h3>{t('placeOrder.payment.title')}</h3>
            <div className="payment-method-options">
              <label className={`fulfillment-card ${paymentMethod === 'cash' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="cash"
                  checked={paymentMethod === 'cash'}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
                <div className="fulfillment-text">
                  <span className="fulfillment-title">{t('placeOrder.payment.cash')}</span>
                  <span className="fulfillment-desc">{t('placeOrder.payment.cashDesc')}</span>
                </div>
              </label>
              <label className="fulfillment-card payment-card-disabled">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="card"
                  checked={false}
                  disabled
                />
                <div className="fulfillment-text">
                  <span className="fulfillment-title">{t('placeOrder.payment.card')}</span>
                  <span className="fulfillment-desc">{t('placeOrder.payment.cardUnavailable')}</span>
                </div>
              </label>
            </div>
          </div>

          {/* Delivery Address with Mapbox - Đặt lên đầu vì quan trọng nhất */}
          {/* Delivery Address Section */}
          {isDelivery && shouldShowAddressCard && selectedAddress ? (
            /* Show address card for authenticated users with saved addresses */
            <div className="delivery-address-section">
              <label className="delivery-label">{t('placeOrder.form.addressLabel')}</label>
              <div className="saved-address-card">
                <div className="address-card-header">
                  <div className="address-card-info">
                    <h4>{selectedAddress.label}</h4>
                    {selectedAddress.isDefault && (
                      <span className="default-badge">{t('placeOrder.address.default')}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="change-address-btn"
                    onClick={() => setShowAddressModal(true)}
                  >
                    {t('placeOrder.address.change')}
                  </button>
                </div>
                <div className="address-card-content">
                  <p className="address-name">{selectedAddress.fullName}</p>
                  <p className="address-phone">{selectedAddress.phone}</p>
                  <p className="address-full">
                    {selectedAddress.street}
                  </p>
                </div>
              </div>
            </div>
          ) : isDelivery ? (
            /* Show full address form for guests OR authenticated users with zero addresses OR manual entry */
            <div className="delivery-address-section">
              <label className="delivery-label">{t('placeOrder.form.addressLabel')}</label>
              {isAuthenticated && userAddresses.length > 0 && useManualAddress && (
                <div className="manual-address-header">
                  <button
                    type="button"
                    className="use-saved-address-btn"
                    onClick={() => {
                      setUseManualAddress(false);
                      // Reset to default address
                      const defaultAddr = userAddresses.find(addr => 
                        addr._id === defaultAddressId || addr.isDefault
                      ) || userAddresses[0];
                      if (defaultAddr) {
                        setSelectedAddressId(defaultAddr._id);
                        setDeliveryAddress({
                          address: defaultAddr.street || '',
                          street: defaultAddr.street || '',
                          houseNumber: defaultAddr.houseNumber || '',
                          city: defaultAddr.city || '',
                          state: defaultAddr.state || '',
                          zipcode: defaultAddr.zipcode || '',
                          country: defaultAddr.country || '',
                          coordinates: defaultAddr.coordinates || null
                        });
                        calculateDeliveryForSavedAddress(defaultAddr);
                      }
                    }}
                  >
                    ← {t('placeOrder.address.useSaved')}
                  </button>
                </div>
              )}
              <DeliveryAddressInput
                value={deliveryAddress?.address || ''}
                addressData={deliveryAddress}
                onChange={handleDeliveryAddressChange}
                onDeliveryCalculated={handleDeliveryCalculated}
                onCalculatingChange={handleAddressCalculatingChange}
                url={url}
                restaurantLocation={restaurantLocation}
              />
            </div>
          ) : null}

          {/* Contact Information Section */}
          <div className="contact-info-section">
            <h3 className="section-title">{t('placeOrder.form.contactInfo')}</h3>
            <div className="multi-fields">
              <input 
                required 
                name='firstName' 
                onChange={onChangeHandler} 
                value={data.firstName} 
                type="text" 
                placeholder={t('placeOrder.form.firstName')}
                autoComplete="given-name"
              />
              <input 
                required 
                name='lastName' 
                onChange={onChangeHandler} 
                value={data.lastName} 
                type="text" 
                placeholder={t('placeOrder.form.lastName')}
                autoComplete="family-name"
              />
            </div>
            <input 
              required
              name='email' 
              onChange={onChangeHandler} 
              value={data.email} 
              type="email" 
              placeholder={t('placeOrder.form.email')}
              autoComplete="email"
            />
            <input 
              required 
              name='phone' 
              onChange={onChangeHandler} 
              value={data.phone} 
              type="tel" 
              placeholder={t('placeOrder.form.phone')}
              title={t('placeOrder.form.phone')}
              autoComplete="tel"
              maxLength="25"
            />
          </div>

          {/* Delivery Time Slot */}
          <div className="delivery-time-section">
            <label className="delivery-label">
              {isDelivery ? t('placeOrder.form.deliveryTimeLabel') : t('placeOrder.form.pickupTimeLabel')}
            </label>
            <select
              name='preferredDeliveryTime'
              onChange={onChangeHandler}
              value={data.preferredDeliveryTime}
              className="time-slot-select"
            >
              {timeSlots.map((slot, index) => (
                <option key={index} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </div>

          {/* Customer Note */}
          <div className="note-section">
            <label className="delivery-label">{t('placeOrder.form.noteLabel')}</label>
            <textarea
              name='note'
              onChange={onChangeHandler}
              value={data.note}
              placeholder={t('placeOrder.form.notePlaceholder')}
              className="note-textarea"
              rows="3"
            />
          </div>
          
          {/* Thông báo về dò đơn hàng */}
          <div className="tracking-notice">
            <p><strong>{t('placeOrder.notice.title')}:</strong> {t('placeOrder.notice.message')}</p>
          </div>
        </div>
        
        <div className="place-order-right">
          <div className="cart-total">
            <h2>{t('placeOrder.cart.title')}</h2>
            <div>
              <div className='cart-total-details'>
                <p>{t('placeOrder.cart.subtotal')}</p>
                <p>{formatPrice(getTotalCartAmount())}</p>
              </div>
              {hasItemsWithBoxFee() && (
                <div className='cart-total-details box-fee-note'>
                  <p className="box-fee-text">{t('placeOrder.cart.boxFeeNote', { boxFee: formatPrice(boxFee) })}</p>
                </div>
              )}
              <hr />
              <div className='cart-total-details'>
                <p>{t('placeOrder.cart.deliveryFee')}</p>
                <p>
              {isDelivery
                ? (isFeeCalculating
                  ? t('placeOrder.cart.calculatingShort')
                  : (deliveryInfo && deliveryInfo.zone ? formatPrice(getDeliveryFee()) : '--'))
                : '0 Ft'}
                </p>
              </div>
              {isDelivery && getSystemFee() > 0 && (
                <div className='cart-total-details'>
                  <p>{t('placeOrder.cart.systemFee')}</p>
                  <p>{formatPrice(getSystemFee())}</p>
                </div>
              )}
          {isFeeCalculating && (
                <div className="min-order-warning">
                  {t('placeOrder.form.calculatingFee')}
                </div>
              )}
          {isDelivery && !isFeeCalculating && !deliveryInfo && (
                <div className="min-order-warning">
                  {hasAnyAddressSelected
                    ? t('placeOrder.cart.deliveryFeeUnavailable')
                    : t('placeOrder.cart.deliveryFeePrompt')}
                </div>
              )}
          {isDelivery && deliveryInfo && deliveryInfo.zone && (
                <>
                  <div className='cart-total-details delivery-zone-info'>
                    <span className="zone-badge">
                      {deliveryInfo.zone.name} • {deliveryInfo.distance}km • {deliveryInfo.zone.estimatedTime}min
                    </span>
                  </div>
                  {getTotalCartAmount() < deliveryInfo.zone.minOrder && (
                    <div className="min-order-warning">
                      {t('placeOrder.cart.minOrderWarning', {
                        minOrder: formatPrice(deliveryInfo.zone.minOrder),
                        needed: formatPrice(deliveryInfo.zone.minOrder - getTotalCartAmount())
                      })}
                    </div>
                  )}
                </>
              )}
              <hr />
              <div className='cart-total-details'>
                <b>{t('placeOrder.cart.total')}</b>
                <b>{formatPrice(getTotalCartAmount() === 0 ? 0 : getTotalCartAmount() + getDeliveryFee() + getSystemFee())}</b>
              </div>
            </div>
            <button type='submit' disabled={isSubmitting || isRestaurantClosed || isFeeCalculating} className="desktop-submit-btn">
              {isRestaurantClosed
                ? (restaurantOpenStatus.message || t('restaurant.closedNow'))
                : (isSubmitting
                  ? t('placeOrder.cart.submitting')
                  : (isFeeCalculating ? t('placeOrder.form.calculatingFee') : t('placeOrder.cart.proceedButton')))}
            </button>
          </div>
          
          {/* Mobile-friendly submit button - ở cuối sau cart */}
          <div className="mobile-submit-section">
            <button 
              type='submit' 
              className="mobile-submit-btn"
              disabled={isSubmitting || isRestaurantClosed || isFeeCalculating}
            >
              {isRestaurantClosed
                ? (restaurantOpenStatus.message || t('restaurant.closedNow'))
                : (isSubmitting
                  ? t('placeOrder.cart.submitting')
                  : (isFeeCalculating ? t('placeOrder.form.calculatingFee') : t('placeOrder.cart.proceedButton')))}
            </button>
          </div>
        </div>
      </form>
      
      {/* Delivery Zones Info - Đặt cuối cùng */}
      {isDelivery && (
        <div className="delivery-zones-display-wrapper">
          <DeliveryZoneDisplay url={url} />
        </div>
      )}
      
      {/* Address Selection Modal */}
      {showAddressModal && (
        <div className="address-modal-overlay" onClick={() => setShowAddressModal(false)}>
          <div className="address-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="address-modal-header">
              <h3>{t('placeOrder.address.selectTitle')}</h3>
              <button 
                className="close-modal-btn"
                onClick={() => setShowAddressModal(false)}
              >
                ×
              </button>
            </div>
            <div className="address-modal-body">
              {userAddresses.map((address) => (
                <div
                  key={address._id}
                  className={`address-option-card ${selectedAddressId === address._id ? 'selected' : ''}`}
                  onClick={() => handleSelectAddress(address)}
                >
                  <div className="address-option-header">
                    <h4>{address.label}</h4>
                    {address.isDefault && <span className="default-badge">{t('placeOrder.address.default')}</span>}
                  </div>
                  <div className="address-option-content">
                    <p className="address-name">{address.fullName}</p>
                    <p className="address-phone">{address.phone}</p>
                    <p className="address-full">
                      {address.street}
                    </p>
                  </div>
                  {selectedAddressId === address._id && (
                    <div className="selected-indicator">{t('placeOrder.address.selected')}</div>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="add-new-address-btn"
                onClick={() => {
                  setShowAddressModal(false);
                  setUseManualAddress(true);
                  savedCalcIdRef.current += 1;
                  setIsSavedAddressCalculating(false);
                  // Clear selected address to allow new entry
                  setSelectedAddressId(null);
                  setDeliveryAddress(null);
                  setDeliveryInfo(null);
                }}
              >
                + {t('placeOrder.address.addNew')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Popup */}
      <SuccessPopup
        isOpen={showSuccessPopup}
        onClose={() => setShowSuccessPopup(false)}
        trackingCode={orderSuccessData.trackingCode}
        phone={orderSuccessData.phone}
        orderAmount={orderSuccessData.orderAmount}
        items={orderSuccessData.items}
        setCartItems={clearCart}
      />
    </div>
  );
};

export default PlaceOrder;