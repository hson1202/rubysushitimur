import React, { useContext, useState, useEffect } from 'react'
import './CartPopup.css'
import { assets } from '../../assets/assets'
import { StoreContext } from '../../Context/StoreContext'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { formatHuf } from '../../utils/currency'
import { formatProductDisplayName } from '../../utils/productDisplay'
import { isDishOrderBlocked } from '../../utils/orderAvailability'

// ---- Pricing helpers ----
const hasOverrideOpt = (product) =>
  Array.isArray(product?.options) && product.options.some(o => o.pricingMode === 'override');

const computeVariantPrice = (product, selectedOptions = {}) => {
  const opts = Array.isArray(product?.options) ? product.options : [];
  let price = Number(product?.price) || 0;

  for (const o of opts) {
    if (o.pricingMode === 'override') {
      const code = selectedOptions[o.name] || o.defaultChoiceCode;
      const ch = (o.choices || []).find(c => c.code === code);
      if (ch) {
        price = Number(ch.price) || 0;
        break;
      }
    }
  }

  for (const o of opts) {
    if (o.pricingMode === 'add') {
      const code = selectedOptions[o.name] || o.defaultChoiceCode;
      const ch = (o.choices || []).find(c => c.code === code);
      if (ch) price += Number(ch.price) || 0;
    }
  }

  return price;
};

const variantPriceRange = (product) => {
  const opts = Array.isArray(product?.options) ? product.options : [];
  const base = Number(product?.price) || 0;

  if (opts.length === 0) return { min: base, max: base };

  const overrideOpts = opts.filter(o => o.pricingMode === 'override');
  const addOpts = opts.filter(o => o.pricingMode === 'add');

  const addMin = addOpts.reduce((s, o) => {
    const arr = (o.choices || []).map(c => Number(c.price) || 0);
    return s + (arr.length ? Math.min(...arr) : 0);
  }, 0);
  const addMax = addOpts.reduce((s, o) => {
    const arr = (o.choices || []).map(c => Number(c.price) || 0);
    return s + (arr.length ? Math.max(...arr) : 0);
  }, 0);

  if (overrideOpts.length > 0) {
    const overAll = overrideOpts.flatMap(o => (o.choices || []).map(c => Number(c.price) || 0));
    if (overAll.length === 0) return { min: addMin, max: addMax };
    const minOver = Math.min(...overAll);
    const maxOver = Math.max(...overAll);
    return { min: minOver + addMin, max: maxOver + addMax };
  }

  return { min: base + addMin, max: base + addMax };
};

const buildDefaultSelections = (product) => {
  const selected = {};
  (product?.options || []).forEach(o => {
    if (o.defaultChoiceCode) selected[o.name] = o.defaultChoiceCode;
  });
  return selected;
};

const pickImageFromSelections = (product, selectedOptions = {}) => {
  for (const o of (product?.options || [])) {
    const code = selectedOptions[o.name] || o.defaultChoiceCode;
    const ch = (o.choices || []).find(c => c.code === code);
    if (ch?.image) return ch.image;
  }
  return product?.image || '';
};

const CartPopup = ({ onClose }) => {
  const { cartItems, cartItemsData, food_list, addToCart, removeFromCart, getTotalCartAmount, url, boxFee, restaurantOpenStatus } = useContext(StoreContext)
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [recommendedItems, setRecommendedItems] = useState([])

  // Function to get localized name
  const getLocalizedName = (food) => {
    const currentLang = i18n.language;
    switch (currentLang) {
      case 'vi':
        return food.nameVI || food.name;
      case 'en':
        return food.nameEN || food.name;
      case 'hu':
        return food.nameHU || food.name;
      default:
        return food.name;
    }
  };

  const getDisplayName = (food) => formatProductDisplayName(food, getLocalizedName(food));

  const formatPrice = (price) => formatHuf(price);

  // Helper function to check if box fee is disabled for an item
  const isBoxFeeDisabled = (item) => {
    return item.disableBoxFee === true || 
           item.disableBoxFee === "true" || 
           item.disableBoxFee === 1 || 
           item.disableBoxFee === "1" ||
           (typeof item.disableBoxFee === 'string' && item.disableBoxFee.toLowerCase() === 'true');
  }

  // Get cart items with details including options
  const getCartItems = () => {
    const items = []
    for (const itemId in cartItems) {
      if (cartItems[itemId] > 0) {
        const actualProductId = itemId.split('_')[0];
        const sourceItem = food_list.find((product) => product._id === actualProductId);
        const cartItemData = cartItemsData[itemId];
        
        // Merge with source product so cart rows keep SKU/localized names even when cart data is partial.
        const itemInfo = cartItemData
          ? { ...sourceItem, ...cartItemData }
          : sourceItem;
        
        if (itemInfo) {
          items.push({
            ...itemInfo,
            quantity: cartItems[itemId],
            cartItemId: itemId // Store the actual cart key
          })
        }
      }
    }
    return items
  }

  // Check if any item in cart requires box fee
  const hasItemsWithBoxFee = () => {
    const items = getCartItems();
    return items.some(item => !isBoxFeeDisabled(item));
  }

  // Calculate total box fee
  const getTotalBoxFee = () => {
    const items = getCartItems();
    let totalBoxFee = 0;
    items.forEach(item => {
      if (!isBoxFeeDisabled(item)) {
        totalBoxFee += boxFee * item.quantity;
      }
    });
    return totalBoxFee;
  }

  // Format selected options for display
  const formatSelectedOptions = (item) => {
    if (!item.selectedOptions || Object.keys(item.selectedOptions).length === 0) {
      return null;
    }

    const optionTexts = [];
    Object.entries(item.selectedOptions).forEach(([optionName, choiceCode]) => {
      const option = item.options?.find(opt => opt.name === optionName);
      if (option) {
        // Get localized option name
        const currentLang = i18n.language;
        const localizedOptionName = currentLang === 'vi' ? (option.nameVI || option.name) :
                                   currentLang === 'en' ? (option.nameEN || option.name) :
                                   (option.nameHU || option.name);
        
        const choice = option.choices.find(c => c.code === choiceCode);
        if (choice) {
          // Get localized choice label
          const localizedChoiceLabel = currentLang === 'vi' ? (choice.labelVI || choice.label) :
                                      currentLang === 'en' ? (choice.labelEN || choice.label) :
                                      (choice.labelHU || choice.label);
          optionTexts.push(`${localizedOptionName}${t('cartPopup.optionSeparator')}${localizedChoiceLabel}`);
        }
      }
    });

    return optionTexts.join(', ');
  };

  // Smart upsale algorithm - Option 4: Mix & Match (Manual + Smart)
  const generateRecommendations = () => {
    const cartItems = getCartItems()
    if (cartItems.length === 0) return []

    const cartItemIds = cartItems.map(item => item._id)
    const cartCategories = [...new Set(cartItems.map(item => item.category))]
    
    // 1. Lấy manual recommendations trước (priority cao)
    const manualRecs = food_list
      .filter(item => !cartItemIds.includes(item._id))
      .filter(item => item.isRecommended === true)
      .filter(item => item.status === 'active')
      .filter(item => !isDishOrderBlocked(item))
      .sort((a, b) => {
        // Sort by priority (số nhỏ hơn = ưu tiên cao hơn)
        const priorityA = a.recommendPriority || 999
        const priorityB = b.recommendPriority || 999
        if (priorityA !== priorityB) {
          return priorityA - priorityB
        }
        // Nếu cùng priority, ưu tiên promotion và soldCount
        if (a.isPromotion && !b.isPromotion) return -1
        if (!a.isPromotion && b.isPromotion) return 1
        return (b.soldCount || 0) - (a.soldCount || 0)
      })
    
    // 2. Nếu không đủ 12, dùng thuật toán smart fill thêm
    const targetCount = 12
    if (manualRecs.length < targetCount) {
      const remainingCount = targetCount - manualRecs.length
      const manualRecIds = manualRecs.map(r => r._id)
      
      const smartRecs = food_list
        .filter(item => !cartItemIds.includes(item._id))
        .filter(item => !manualRecIds.includes(item._id))
        .filter(item => {
          // Smart logic: recommend từ cùng category hoặc complementary categories
          if (cartCategories.includes(item.category)) return true
          
          // Smart pairing logic
          if (cartCategories.includes('Noodles') && ['Drinks', 'Appetizers'].includes(item.category)) return true
          if (cartCategories.includes('Main Course') && ['Drinks', 'Desserts'].includes(item.category)) return true
          if (cartCategories.includes('Pizza') && ['Drinks', 'Sides'].includes(item.category)) return true
          
          return false
        })
        .filter(item => item.status === 'active')
        .filter(item => !isDishOrderBlocked(item))
        .sort((a, b) => {
          // Prioritize promoted items and popular items
          if (a.isPromotion && !b.isPromotion) return -1
          if (!a.isPromotion && b.isPromotion) return 1
          return (b.soldCount || 0) - (a.soldCount || 0)
        })
        .slice(0, remainingCount)
      
      return [...manualRecs, ...smartRecs].slice(0, targetCount)
    }
    
    return manualRecs.slice(0, targetCount)
  }

  useEffect(() => {
    setRecommendedItems(generateRecommendations())
  }, [cartItems, food_list])

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleCheckout = () => {
    if (restaurantOpenStatus && !restaurantOpenStatus.isOpen) {
      window.alert(restaurantOpenStatus.message || t('restaurant.closedNow'))
      return
    }
    onClose()
    navigate('/order')
  }

  const getTotalItems = () => {
    return Object.values(cartItems).reduce((total, count) => total + count, 0)
  }

  const cartItemsList = getCartItems()

  return (
    <div className="cart-popup-overlay" onClick={handleOverlayClick}>
      <div className="cart-popup-modal">
        <div className="cart-popup-header">
          <h2>
            {t('cart.title')}
            {getTotalItems() > 0 && <span className="cart-badge">{getTotalItems()}</span>}
          </h2>
          <button className="close-btn" onClick={onClose}>
            <img src={assets.cross_icon} alt={t('productDetail.close')} />
          </button>
        </div>

        <div className="cart-popup-body">
          <div className="cart-popup-content">
            {cartItemsList.length === 0 ? (
              <div className="empty-cart">
                <div className="empty-icon">🛒</div>
                <h3>{t('cart.empty')}</h3>
                <p>{t('cart.continueShopping')}</p>
                <button className="continue-btn" onClick={onClose}>
                  {t('menu.explore')}
                </button>
              </div>
            ) : (
              <>
                {/* Cart Items */}
                <div className="cart-items-section">
                  <h3>{t('cart.items')} ({cartItemsList.length})</h3>
                  <div className="cart-items-list">
                    {cartItemsList.map((item) => {
                      const liveProduct = food_list.find((product) => product._id === String(item.cartItemId).split('_')[0])
                      const soldOut = food_list.length > 0 && (!liveProduct || isDishOrderBlocked(liveProduct))
                      return (
                      <div key={item.cartItemId} className="cart-item">
                        <div className="cart-item-image food-image-container">
                          {(() => {
                            const fallback = pickImageFromSelections(item, item.selectedOptions) || item.image;
                            const imgSrc = item.currentImage
                              ? (item.currentImage.startsWith('http') ? item.currentImage : `${url}/images/${item.currentImage}`)
                              : (fallback && fallback.startsWith('http') ? fallback : `${url}/images/${fallback}`);
                            return (
                              <img 
                                src={imgSrc}
                                alt={getDisplayName(item)} 
                              />
                            );
                          })()}
                        </div>
                        <div className="cart-item-info">
                          <h4>{getDisplayName(item)}</h4>
                          {soldOut && <p className="cart-item-soldout">{t('food.soldOut')}</p>}
                          {item.selectedOptions && Object.keys(item.selectedOptions).length > 0 && (
                            <div className="cart-item-options">
                              <span className="options-text">{formatSelectedOptions(item)}</span>
                            </div>
                          )}
                        </div>
                        <div className="cart-item-controls">
                          <div className="cart-item-controls-wrapper">
                            <button onClick={() => removeFromCart(item.cartItemId)}>
                              <img src={assets.remove_icon_red} alt="" />
                            </button>
                            <span className="quantity">{item.quantity}</span>
                            <button
                              onClick={() => addToCart(item.cartItemId, item)}
                              disabled={soldOut}
                              aria-label={t('food.increase')}
                            >
                              <img src={assets.add_icon_green} alt="" />
                            </button>
                          </div>
                          <div className="cart-item-total">
                            {(() => {
                              // Tính giá gốc (chưa bao gồm box fee)
                              let basePrice = 0;
                              if (item.options && item.options.length > 0 && item.selectedOptions) {
                                basePrice = computeVariantPrice(item, item.selectedOptions);
                              } else {
                                basePrice = item.isPromotion && item.promotionPrice ? item.promotionPrice : (item.price || 0);
                              }
                              // Thêm tiền hộp nếu không tắt
                              const itemBoxFee = isBoxFeeDisabled(item) ? 0 : boxFee;
                              const unitPrice = basePrice + itemBoxFee;
                              return formatPrice(unitPrice * item.quantity);
                            })()}
                          </div>
                        </div>
                      </div>
                      )
                    })}
                  </div>
                </div>

                {/* Recommended Items */}
                {recommendedItems.length > 0 && (
                  <section className="cart-section cart-section--recommend">
                    <div className="cart-section-header">
                      <h3>{t('cartPopup.recommendedForYou')}</h3>
                      <p className="cart-section-subtitle">
                        {t('cartPopup.perfectWith')}
                      </p>
                    </div>

                    <div className="recommend-list">
                      {recommendedItems.map((item) => {
                        const range = variantPriceRange(item);
                        const isSinglePrice = range.min === range.max;

                        const handleAdd = () => {
                          const selected = buildDefaultSelections(item);
                          const price = computeVariantPrice(item, selected);
                          const img = pickImageFromSelections(item, selected);
                          const cartKey = item.options?.length
                            ? `${item._id}_${JSON.stringify(selected)}`
                            : item._id;

                          addToCart(cartKey, {
                            ...item,
                            selectedOptions: selected,
                            currentPrice: price,
                            currentImage: img,
                          });
                        };

                        return (
                          <div key={item._id} className="recommend-card">
                            <div className="recommend-card-image food-image-container">
                              <img
                                src={
                                  item.image && item.image.startsWith('http')
                                    ? item.image
                                    : `${url}/images/${item.image}`
                                }
                                alt={getDisplayName(item)}
                              />
                              {item.isPromotion && !hasOverrideOpt(item) && (
                                <span className="recommend-badge">
                                  -{Math.round(
                                    ((item.originalPrice - item.promotionPrice) /
                                      item.originalPrice) *
                                      100
                                  )}
                                  %
                                </span>
                              )}
                            </div>

                            <div className="recommend-card-body">
                              <h5 className="recommend-title">{getDisplayName(item)}</h5>

                              <div className="recommend-price">
                                {isSinglePrice ? (
                                  <span className="recommend-price-main">
                                    {formatPrice(range.min)}
                                  </span>
                                ) : (
                                  <>
                                    <span className="recommend-price-main">
                                      {formatPrice(range.min)}
                                    </span>
                                    <span className="recommend-price-range">
                                      &nbsp;– {formatPrice(range.max)}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>

                            <button
                              type="button"
                              className="recommend-add-btn"
                              onClick={handleAdd}
                            >
                              <span>{t('common.add')}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>

          {/* Cart Summary - Always visible at bottom */}
          {cartItemsList.length > 0 && (
            <div className="cart-summary">
              <div className="summary-row">
                <span>{t('cart.subtotal')}</span>
                <span>{formatPrice(getTotalBoxFee())}</span>
              </div>
              {hasItemsWithBoxFee() && (
                <div className="summary-row box-fee-note">
                  <span className="box-fee-text">{t('cartPopup.boxFeeNote', { boxFee: formatPrice(boxFee) })}</span>
                </div>
              )}
              <div className="summary-row total">
                <span>{t('cart.total')}</span>
                <span>{formatPrice(getTotalCartAmount())}</span>
              </div>
              <button
                className="checkout-btn"
                onClick={handleCheckout}
                disabled={restaurantOpenStatus && !restaurantOpenStatus.isOpen}
              >
                {restaurantOpenStatus && !restaurantOpenStatus.isOpen
                  ? (restaurantOpenStatus.message || t('restaurant.closedNow'))
                  : `${t('cart.checkout')} (${getTotalItems()} ${t('cart.items')})`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default CartPopup
