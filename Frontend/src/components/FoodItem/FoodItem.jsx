import React, { useContext, useRef, useState, useLayoutEffect, useCallback } from 'react'
import './FoodItem.css'
import { assets } from '../../assets/assets'
import { StoreContext } from '../../Context/StoreContext'
import { useTranslation } from 'react-i18next'
import { isFoodAvailable, getAvailabilityStatus } from '../../utils/timeUtils'
import { normalizeAllergens, getAllergenInfo } from '../../utils/allergens'
import { formatHuf } from '../../utils/currency'
import { formatProductDisplayName, getLocalizedDescription } from '../../utils/productDisplay'
import { isDishOrderBlocked } from '../../utils/orderAvailability'
import LazyImage from '../LazyImage/LazyImage'
import { useInViewOnce } from '../../hooks/useIntersectionObserver'

const FOOD_ITEM_IN_VIEW_OPTIONS = { rootMargin: '60px' }

const FoodItem = ({id, name, nameVI, nameEN, nameHU, price, description, descriptionVI, descriptionEN, descriptionHU, image, sku, isPromotion, originalPrice, promotionPrice, soldCount = 0, likes = 0, options, portion, allergens, onViewDetails, compact = false, availableFrom, availableTo, dailyAvailability, weeklySchedule, quantity, orderBlocked = false}) => {
  const {cartItems, addToCart, removeFromCart, url} = useContext(StoreContext);
  const { i18n, t } = useTranslation();
  
  const currentLanguage = i18n.language;

  // Normalize allergens into known display info
  const allergenInfos = normalizeAllergens(allergens)
    .map((code) => getAllergenInfo(code, currentLanguage))
    .filter(Boolean);

  // Check food availability
  const foodData = { availableFrom, availableTo, dailyAvailability, weeklySchedule };
  const isAvailable = isFoodAvailable(foodData);
  const availabilityInfo = getAvailabilityStatus(foodData, currentLanguage);
  const orderingBlocked = isDishOrderBlocked({ quantity, orderBlocked, status: 'active' });
  const canAdd = isAvailable && !orderingBlocked;
  
  // Function to get the appropriate name based on current language
  const getLocalizedName = () => {
    switch (currentLanguage) {
      case 'vi':
        return nameVI || name;
      case 'en':
        return nameEN || name;
      case 'hu':
        return nameHU || name;
      default:
        return name;
    }
  };

  const formatPrice = (price) => formatHuf(price);

  // Calculate price range for products with options
  const getPriceDisplay = () => {
    if (options && options.length > 0) {
      const prices = [];
      
      // Calculate all possible price combinations
      const calculatePriceCombinations = () => {
        const combinations = [];
        
        // Helper function to generate all combinations
        const generateCombinations = (currentOptions, optionIndex) => {
          if (optionIndex === options.length) {
            combinations.push([...currentOptions]);
            return;
          }
          
          const option = options[optionIndex];
          option.choices.forEach(choice => {
            currentOptions[optionIndex] = { option, choice };
            generateCombinations(currentOptions, optionIndex + 1);
          });
        };
        
        generateCombinations(new Array(options.length), 0);
        return combinations;
      };
      
      const combinations = calculatePriceCombinations();
      
      combinations.forEach(combination => {
        let totalPrice = price || 0;
        
        combination.forEach(({ option, choice }) => {
          if (option.pricingMode === 'override') {
            totalPrice = choice.price;
          } else if (option.pricingMode === 'add') {
            totalPrice += choice.price;
          }
        });
        
        prices.push(totalPrice);
      });
      
      if (prices.length > 0) {
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        
        if (minPrice === maxPrice) {
          return formatPrice(minPrice);
        } else {
          return `${formatPrice(minPrice)} - ${formatPrice(maxPrice)}`;
        }
      }
    }
    
    // Fallback to regular price display
    if (isPromotion && promotionPrice) {
      return (
        <div className="price-container">
          <span className="original-price">{formatPrice(originalPrice || price)}</span>
          <span className="promotion-price">{formatPrice(promotionPrice)}</span>
        </div>
      );
    }
    
    return formatPrice(price);
  };

  const calculateDiscount = () => {
    const basePrice = originalPrice || price;
    if (!isPromotion || !basePrice || !promotionPrice) return 0;
    return Math.round(((basePrice - promotionPrice) / basePrice) * 100);
  };

  const localizedName = getLocalizedName();
  const displayName = formatProductDisplayName({ sku }, localizedName);
  const displayDescription = getLocalizedDescription({
    description,
    descriptionVI,
    descriptionEN,
    descriptionHU,
  }, currentLanguage);

  const openDetail = useCallback(() => {
    if (!onViewDetails) return;
    onViewDetails({
      _id: id,
      name,
      nameVI,
      nameEN,
      nameHU,
      description,
      descriptionVI,
      descriptionEN,
      descriptionHU,
      price,
      image,
      sku,
      isPromotion,
      originalPrice,
      promotionPrice,
      soldCount,
      likes,
      options,
      portion,
      allergens,
      quantity,
      orderBlocked,
      status: 'active',
      language: 'vi'
    });
  }, [id, name, nameVI, nameEN, nameHU, description, descriptionVI, descriptionEN, descriptionHU, price, image, sku, isPromotion, originalPrice, promotionPrice, soldCount, likes, options, portion, allergens, quantity, orderBlocked, onViewDetails]);

  const titleRef = useRef(null);
  const descriptionRef = useRef(null);
  const [showReadMore, setShowReadMore] = useState(false);
  const [itemRef, isInView] = useInViewOnce(FOOD_ITEM_IN_VIEW_OPTIONS);

  useLayoutEffect(() => {
    if (!compact) return;

    const checkOverflow = () => {
      const titleEl = titleRef.current;
      const descEl = descriptionRef.current;
      const titleOverflow = titleEl ? titleEl.scrollHeight > titleEl.clientHeight + 1 : false;
      const descOverflow = descEl ? descEl.scrollHeight > descEl.clientHeight + 1 : false;
      const heuristicOverflow =
        (displayDescription && displayDescription.length > 60) ||
        (portion && portion.length > 40) ||
        (displayName && displayName.length > 50);

      setShowReadMore(titleOverflow || descOverflow || heuristicOverflow);
    };

    checkOverflow();

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(checkOverflow) : null;
    if (titleRef.current) observer?.observe(titleRef.current);
    if (descriptionRef.current) observer?.observe(descriptionRef.current);

    return () => observer?.disconnect();
  }, [compact, displayDescription, portion, displayName]);

  const handleCardClick = (e) => {
    if (
      e.target.closest('.quantity-controls-overlay') ||
      e.target.closest('.compact-controls') ||
      e.target.closest('.read-more-btn')
    ) {
      return;
    }

    openDetail();
  };

  // Build image src
  const imgSrc =
    image && image.startsWith('http')
      ? image
      : image
        ? (url + "/images/" + image)
        : 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjkwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iOTAiIGZpbGw9IiNmNWY1ZjUiLz48L3N2Zz4=';

  const currentPrice = isPromotion && promotionPrice ? promotionPrice : price;

  const itemClassName = `food-item${compact ? ' compact' : ''}${isInView ? ' in-view' : ''}${orderingBlocked ? ' is-sold-out' : ''}`;

  if (compact) {
    return (
      <div ref={itemRef} className={itemClassName} onClick={handleCardClick}>
        <div className="food-row">
          <div className="thumb food-image-container">
            <LazyImage src={imgSrc} alt={displayName} withFoodBackground />
          </div>
          <div className="title-section">
            <div className="title" ref={titleRef}>{displayName}</div>
            {portion && <div className="title-portion">{portion}</div>}
            <div className="title-description" ref={descriptionRef}>
              {displayDescription || '\u00a0'}
            </div>
            {(showReadMore || displayDescription) && (
              <button
                type="button"
                className="read-more-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  openDetail();
                }}
              >
                {t('food.viewDetails')}
              </button>
            )}
            <div className="price-now">{getPriceDisplay()}</div>
            <div className="compact-meta-row">
              {allergenInfos.length > 0 && (
                <div className="allergen-pill" aria-label="allergens">
                  {allergenInfos.map((a) => (
                    <span key={a.code} className="allergen-icon" title={a.label}>{a.icon}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="compact-controls" onClick={(e) => e.stopPropagation()}>
            {orderingBlocked ? (
              <span className="sold-out-label">{t('food.soldOut')}</span>
            ) : !cartItems[id] ? (
              <button 
                className="add-compact"
                aria-label={t('food.addToCart')}
                onClick={() => addToCart(id)}
                disabled={!canAdd}
              >
                +
              </button>
            ) : (
              <div className="qty-compact">
                <button className="qty-btn-small" onClick={() => removeFromCart(id)} aria-label={t('food.decrease')}>
                  −
                </button>
                <span className="quantity-small">{cartItems[id]}</span>
                <button className="qty-btn-small" onClick={() => addToCart(id)} aria-label={t('food.increase')} disabled={!canAdd}>
                  +
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={itemRef} className={itemClassName} onClick={handleCardClick}>
      <div className="food-item-img-container food-image-container">
        <LazyImage
          src={imgSrc}
          alt={displayName}
          className="food-item-image"
          withFoodBackground
        />
        
        {/* Promotion Badge */}
        {isPromotion && promotionPrice && (
          <div className="promotion-badge">
            -{calculateDiscount()}%
          </div>
        )}

        {/* Options Badge */}
        {options && options.length > 0 && (
          <div className="options-badge">
            {t('food.customizable')}
          </div>
        )}

        {/* Time Availability Badge - Always shown when schedule is configured */}
        {(availableFrom || availableTo || dailyAvailability?.enabled || weeklySchedule?.enabled) && (
          <div className={`time-badge ${isAvailable ? 'available' : 'unavailable'}`}>
            <span className="time-icon">{isAvailable ? '⏰' : '⛔'}</span>
            {availabilityInfo.timeInfo && (
              <span className="time-text">{availabilityInfo.timeInfo}</span>
            )}
          </div>
        )}

        {(orderingBlocked || !isAvailable) && (
          <div className="unavailable-overlay">
            <span className="unavailable-text">
              {orderingBlocked ? t('food.soldOut') : availabilityInfo.message}
            </span>
          </div>
        )}
      </div>
       
      <div className="food-item-info">  
        <div className="food-item-name">  
          <p>{displayName}</p>  
        </div>  
        
        {portion && (
          <div className="food-item-portion">{portion}</div>
        )}

        {displayDescription && (
          <div className="food-item-description">
            <p>{displayDescription}</p>
          </div>
        )}

        {allergenInfos.length > 0 && (
          <div className="allergen-pill" aria-label="allergens">
            {allergenInfos.map((a) => (
              <span key={a.code} className="allergen-icon" title={a.label}>{a.icon}</span>
            ))}
          </div>
        )}

        <div className="food-item-stats">
          {likes > 0 && (
            <div className="stat-item">
              <span className="stat-icon">👍</span>
              <span className="stat-text">{likes}</span>
            </div>
          )}
          {soldCount > 0 && (
            <div className="stat-item">
              <span className="stat-icon">🛒</span>
              <span className="stat-text">{soldCount}+ {t('food.sold')}</span>
            </div>
          )}
        </div>
        
        <div className="food-item-pricing">
          {getPriceDisplay()}
        </div>
        
        {!orderingBlocked && (
        <div className="food-item-actions" onClick={(e) => e.stopPropagation()}>
          {!cartItems[id] ? (
            <button 
              className="add-to-cart-btn"
              onClick={() => addToCart(id)}
              disabled={!canAdd}
            >
              {t('food.addToCart')}
            </button>
          ) : (
            <div className="quantity-controls-bottom">
              <button className="qty-btn" onClick={() => removeFromCart(id)}>
                <img src={assets.remove_icon_red} alt="" />
              </button>
              <span className="quantity">{cartItems[id]}</span>
              <button className="qty-btn" onClick={() => addToCart(id)} disabled={!canAdd}>
                <img src={assets.add_icon_green} alt="" />
              </button>
            </div>
          )}
        </div>
        )}
      </div>  
    </div>
  )
}

export default FoodItem