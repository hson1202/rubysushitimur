import { useContext, useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import './ProductDetail.css'
import { assets } from '../../assets/assets'
import { StoreContext } from '../../Context/StoreContext'
import { useTranslation } from 'react-i18next'
import { normalizeAllergens, getAllergenInfo } from '../../utils/allergens'
import { formatHuf } from '../../utils/currency'
import { formatProductDisplayName, getLocalizedDescription } from '../../utils/productDisplay'

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

const pickImageFromSelections = (product, selectedOptions = {}) => {
  const opts = Array.isArray(product?.options) ? product.options : [];

  // 1. Ưu tiên ảnh theo lựa chọn hiện tại (selectedOptions hoặc defaultChoiceCode)
  for (const o of opts) {
    const code = selectedOptions[o.name] || o.defaultChoiceCode;
    if (!code) continue;
    const ch = (o.choices || []).find(c => c.code === code);
    if (ch?.image) return ch.image;
  }

  // 2. Nếu product.image có thì dùng
  if (product?.image) {
    return product.image;
  }

  // 3. Fallback: lấy ảnh đầu tiên có trong các choices
  for (const o of opts) {
    const withImage = (o.choices || []).find(c => c.image);
    if (withImage?.image) return withImage.image;
  }

  // 4. Cuối cùng bó tay, trả về chuỗi rỗng
  return '';
};

// Helper để resolve image URL
const resolveImageUrl = (raw, baseUrl) => {
  if (!raw) return '';
  if (raw.startsWith('http')) return raw;
  if (raw.startsWith('/')) return baseUrl + raw;
  return baseUrl + '/images/' + raw;
};

const ProductDetail = ({ product, onClose }) => {
  const { cartItems, addToCart, removeFromCart, url, restaurantOpenStatus } = useContext(StoreContext)
  const { t, i18n } = useTranslation()
  
  // State for selected options
  const [selectedOptions, setSelectedOptions] = useState({})
  const [currentImage, setCurrentImage] = useState('')
  const [currentPrice, setCurrentPrice] = useState(0)

  // Debug: Log product data
  if (product) {
    console.log('🔍 ProductDetail - Product data:', product)
    console.log('🔍 ProductDetail - Options:', product.options)
  }

  // Initialize options, price and image when product changes
  useEffect(() => {
    if (!product) return;

    // Init selected options
    const defaultSelections = {};
    if (Array.isArray(product.options)) {
      product.options.forEach(option => {
        if (option.defaultChoiceCode) {
          defaultSelections[option.name] = option.defaultChoiceCode;
        }
      });
    }
    setSelectedOptions(defaultSelections);

    // Giá base theo option - KHÔNG cộng box fee ở đây, chỉ hiển thị giá gốc
    const basePrice = computeVariantPrice(product, defaultSelections);
    setCurrentPrice(basePrice);

    // Ảnh ban đầu
    const initialImage = pickImageFromSelections(product, defaultSelections);
    setCurrentImage(initialImage);
  }, [product]);

  // Function to get the appropriate name based on current language
  const getLocalizedName = () => {
    const currentLang = i18n.language;
    switch (currentLang) {
      case 'vi':
        return product.nameVI || product.name;
      case 'en':
        return product.nameEN || product.name;
      case 'hu':
        return product.nameHU || product.name;
      default:
        return product.name;
    }
  };

  // Function to get localized option name
  const getLocalizedOptionName = (option) => {
    const currentLang = i18n.language;
    switch (currentLang) {
      case 'vi':
        return option.nameVI || option.name;
      case 'en':
        return option.nameEN || option.name;
      case 'hu':
        return option.nameHU || option.name;
      default:
        return option.name;
    }
  };

  // Function to get localized choice label
  const getLocalizedChoiceLabel = (choice) => {
    const currentLang = i18n.language;
    switch (currentLang) {
      case 'vi':
        return choice.labelVI || choice.label;
      case 'en':
        return choice.labelEN || choice.label;
      case 'hu':
        return choice.labelHU || choice.label;
      default:
        return choice.label;
    }
  };

  const formatPrice = (price) => formatHuf(price);

  const calculateDiscount = () => {
    if (!product.isPromotion || !product.promotionPrice) return 0;
    const basePrice = Number(product.originalPrice || product.price);
    if (!basePrice) return 0;
    return Math.round(((basePrice - product.promotionPrice) / basePrice) * 100);
  };

  const handleOptionChange = (optionName, choiceCode) => {
    const newSelectedOptions = { ...selectedOptions, [optionName]: choiceCode };
    setSelectedOptions(newSelectedOptions);
    
    // Update price and image based on new selections
    // CHỈ hiển thị giá gốc, KHÔNG cộng box fee ở đây
    const basePrice = computeVariantPrice(product, newSelectedOptions);
    setCurrentPrice(basePrice);
    
    const newImage = pickImageFromSelections(product, newSelectedOptions);
    setCurrentImage(newImage);
  }

  const isRestaurantClosed = restaurantOpenStatus && !restaurantOpenStatus.isOpen

  const handleAddToCart = () => {
    if (isRestaurantClosed) return
    // Create a unique cart key that includes selected options
    const cartKey = product.options && product.options.length > 0 
      ? `${product._id}_${JSON.stringify(selectedOptions)}`
      : product._id
    
    // Add to cart with options - StoreContext sẽ tự động tính box fee khi tính tổng
    // Ta chỉ lưu giá gốc (chưa có box fee) vào currentPrice
    addToCart(cartKey, {
      ...product,
      selectedOptions,
      currentPrice: currentPrice, // Giá gốc (chưa có box fee)
      currentImage
    })
  }

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Check if product is in cart with current options
  const getCartQuantity = () => {
    const cartKey = product.options && product.options.length > 0 
      ? `${product._id}_${JSON.stringify(selectedOptions)}`
      : product._id
    
    return cartItems[cartKey] || 0
  }

  const handleRemoveFromCart = () => {
    const cartKey = product.options && product.options.length > 0 
      ? `${product._id}_${JSON.stringify(selectedOptions)}`
      : product._id
    
    // Check if item exists in cart before removing
    if (cartItems[cartKey] && cartItems[cartKey] > 0) {
      removeFromCart(cartKey)
    }
  }

  const handleIncreaseQuantity = () => {
    // Check if item is already in cart
    const cartKey = product.options && product.options.length > 0 
      ? `${product._id}_${JSON.stringify(selectedOptions)}`
      : product._id
    
    if (cartItems[cartKey] && cartItems[cartKey] > 0) {
      // Item exists, just add one more - StoreContext sẽ tự tính box fee
      addToCart(cartKey, {
        ...product,
        selectedOptions,
        currentPrice: currentPrice, // Giá gốc (chưa có box fee)
        currentImage
      })
    } else {
      // Item doesn't exist, add to cart
      handleAddToCart()
    }
  }

  if (!product) return null

  const displayName = formatProductDisplayName(product, getLocalizedName())
  const displayDescription = getLocalizedDescription(product, i18n.language)

  const allergenInfos = normalizeAllergens(product.allergens)
    .map((code) => getAllergenInfo(code, i18n.language))
    .filter(Boolean)

  return (
    <div className="product-detail-overlay" onClick={handleOverlayClick}>
      <div className="product-detail-modal">
        <button className="close-btn" onClick={onClose}>
          <img src={assets.cross_icon} alt={t('productDetail.close')} />
        </button>

        {/* PHẦN SCROLL */}
        <div className="product-detail-content">
          <div className="product-detail-image food-image-container">
            <img 
              src={(() => {
                const candidate = currentImage || product.image;
                const resolved = resolveImageUrl(candidate, url);
                return resolved || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2Y1ZjVmNSIvPjx0ZXh0IHg9IjE1MCIgeT0iMTAwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj7wn42dIE5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
              })()}
              alt={displayName}
              onError={(e) => {
                e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2Y1ZjVmNSIvPjx0ZXh0IHg9IjE1MCIgeT0iMTAwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj7wn5qrIEVycm9yPC90ZXh0Pjwvc3ZnPg==';
                e.target.onerror = null;
              }}
            />
            {product.isPromotion && !hasOverrideOpt(product) && (
              <div className="promotion-badge">
                -{calculateDiscount()}% {t('food.promotion')}
              </div>
            )}
          </div>

          <div className="product-detail-info">
            <div className="product-header">
              <h2>{displayName}</h2>
              {product.portion && (
                <div className="product-portion">{product.portion}</div>
              )}
            </div>

            {displayDescription && (
              <div className="product-description">
                <p>{displayDescription}</p>
              </div>
            )}

            {allergenInfos.length > 0 && (
              <div className="product-allergens">
                <h4>{t('productDetail.allergens', 'Allergens')}</h4>
                <div className="product-allergen-list">
                  {allergenInfos.map((a) => (
                    <span key={a.code} className="product-allergen-item" title={a.label}>
                      <span className="product-allergen-icon">{a.icon}</span>
                      <span className="product-allergen-label">{a.label}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Product Options */}
            {product.options && product.options.length > 0 && (
              <div className="product-options">
                <h4>{t('productDetail.customizeYourOrder')}</h4>
                {product.options.map((option, index) => (
                  <div key={index} className="option-group">
                    <label className="option-label">{getLocalizedOptionName(option)}</label>
                    <div className="option-choices">
                      {option.choices.map((choice) => (
                        <label key={choice.code} className="option-choice">
                          <input
                            type="radio"
                            name={option.name}
                            value={choice.code}
                            checked={selectedOptions[option.name] === choice.code}
                            onChange={() => handleOptionChange(option.name, choice.code)}
                          />
                          <div className="choice-content">
                            <span className="choice-label">{getLocalizedChoiceLabel(choice)}</span>
                            <span className="choice-price">{formatPrice(choice.price)}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="product-stats">
              {product.likes > 0 && (
                <div className="stat-item">
                  <span className="stat-icon">👍</span>
                  <span className="stat-text">{product.likes} {t('productDetail.likes')}</span>
                </div>
              )}
              {product.soldCount > 0 && (
                <div className="stat-item">
                  <span className="stat-icon">🛒</span>
                  <span className="stat-text">{product.soldCount}+ {t('productDetail.sold')}</span>
                </div>
              )}
            </div>

            <div className="product-pricing">
              {hasOverrideOpt(product) ? (
                <div className="regular-pricing">
                  <div className="price-row main-price">
                    <span className="label">{t('common.price')}:</span>
                    <span className="regular-price">{formatPrice(currentPrice)}</span>
                  </div>
                </div>
              ) : product.isPromotion && Number(product.promotionPrice) > 0 ? (
                <div className="promotion-pricing">
                  <div className="price-row">
                    <span className="label">{t('food.originalPrice')}:</span>
                    <span className="original-price">{formatPrice(product.price)}</span>
                  </div>
                  <div className="price-row main-price">
                    <span className="label">{t('food.promotionPrice')}:</span>
                    <span className="promotion-price">{formatPrice(product.promotionPrice)}</span>
                  </div>
                  <div className="savings">
                    {t('productDetail.youSave')}: {formatPrice((Number(product.price)||0) - (Number(product.promotionPrice)||0))}
                  </div>
                </div>
              ) : (
                <div className="regular-pricing">
                  <div className="price-row main-price">
                    <span className="label">{t('common.price')}:</span>
                    <span className="regular-price">{formatPrice(currentPrice)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* BỎ PHẦN NÀY - ĐÃ CHUYỂN XUỐNG FOOTER */}
            <div className="product-actions">
              {/* Hidden - moved to footer */}
            </div>

            {/* Additional product information */}
            <div className="product-additional-info">
              <div className="info-section">
                <h4>{t('productDetail.additionalInfo')}</h4>
                <div className="info-grid">
                  <div className="info-item">
                    <span className="info-label">{t('productDetail.status')}:</span>
                    <span className={`info-value status-${product.status}`}>
                      {product.status === 'active' ? t('productDetail.available') : t('productDetail.unavailable')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER CỐ ĐỊNH LUÔN THẤY */}
        <div className="product-detail-footer">
          <div className="footer-price">
            <span className="footer-price-label">{t('common.price')}</span>
            <span className="footer-price-value">{formatPrice(currentPrice)}</span>
          </div>

          <div className="footer-actions">
            {getCartQuantity() === 0 ? (
              <button 
                className="footer-add-to-cart-btn"
                onClick={handleAddToCart}
                disabled={isRestaurantClosed}
              >
                {isRestaurantClosed
                  ? (restaurantOpenStatus?.message || t('restaurant.closedNow'))
                  : t('food.addToCart')}
              </button>
            ) : (
              <div className="footer-quantity-controls">
                <button 
                  className="qty-btn decrease"
                  onClick={handleRemoveFromCart}
                  aria-label={t('food.decrease')}
                >
                  −
                </button>
                <span className="quantity">{getCartQuantity()}</span>
                <button 
                  className="qty-btn increase"
                  onClick={handleIncreaseQuantity}
                  aria-label={t('food.increase')}
                >
                  +
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

ProductDetail.propTypes = {
  product: PropTypes.shape({
    _id: PropTypes.string,
    name: PropTypes.string,
    nameVI: PropTypes.string,
    nameEN: PropTypes.string,
    nameHU: PropTypes.string,
    description: PropTypes.string,
    image: PropTypes.string,
    price: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    promotionPrice: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    originalPrice: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    isPromotion: PropTypes.bool,
    disableBoxFee: PropTypes.oneOfType([PropTypes.bool, PropTypes.string, PropTypes.number]),
    sku: PropTypes.string,
    status: PropTypes.string,
    likes: PropTypes.number,
    soldCount: PropTypes.number,
    portion: PropTypes.string,
    allergens: PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.string, PropTypes.number])),
    options: PropTypes.arrayOf(
      PropTypes.shape({
        name: PropTypes.string,
        nameVI: PropTypes.string,
        nameEN: PropTypes.string,
        nameHU: PropTypes.string,
        pricingMode: PropTypes.string,
        defaultChoiceCode: PropTypes.string,
        choices: PropTypes.arrayOf(
          PropTypes.shape({
            code: PropTypes.string,
            label: PropTypes.string,
            labelVI: PropTypes.string,
            labelEN: PropTypes.string,
            labelHU: PropTypes.string,
            price: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
            image: PropTypes.string,
          })
        ),
      })
    ),
  }),
  onClose: PropTypes.func.isRequired,
}

export default ProductDetail
