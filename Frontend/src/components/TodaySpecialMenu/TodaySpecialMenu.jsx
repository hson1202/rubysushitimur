import React, { useState, useEffect, useContext } from 'react'
import './TodaySpecialMenu.css'
import { StoreContext } from '../../Context/StoreContext'
import FoodItem from '../FoodItem/FoodItem'
import ProductDetail from '../ProductDetail/ProductDetail'
import { useTranslation } from 'react-i18next'
import { isFoodAvailable } from '../../utils/timeUtils'

const TodaySpecialMenu = () => {
  const { food_list, isLoadingFood } = useContext(StoreContext)
  const { i18n } = useTranslation()
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [timeBasedItems, setTimeBasedItems] = useState([])
  const [currentTime, setCurrentTime] = useState(new Date())

  // Translations
  const translations = {
    vi: {
      title: '🕐 Menu Hôm Nay',
      subtitle: 'Món ăn có sẵn theo khung giờ',
      breakfast: '🌅 Bữa Sáng',
      lunch: '🍱 Bữa Trưa',
      dinner: '🌙 Bữa Tối',
      special: '⭐ Đặc Biệt',
      noItems: 'Hiện tại không có món nào',
      noItemsDesc: 'Các món theo khung giờ sẽ hiển thị ở đây khi có sẵn',
      loading: 'Đang tải menu...',
      availableNow: 'Đang phục vụ',
      comingSoon: 'Sắp có',
      ended: 'Đã hết giờ',
      items: 'món'
    },
    hu: {
      title: '🕐 Mai Menü',
      subtitle: 'Időalapú elérhetőségű ételek',
      breakfast: '🌅 Reggeli',
      lunch: '🍱 Ebéd',
      dinner: '🌙 Vacsora',
      special: '⭐ Különlegesség',
      noItems: 'Jelenleg nincs elérhető tétel',
      noItemsDesc: 'Az időalapú menü tételei itt jelennek meg, amikor elérhetők',
      loading: 'Menü betöltése...',
      availableNow: 'Most elérhető',
      comingSoon: 'Hamarosan',
      ended: 'Véget ért',
      items: 'tétel'
    },
    en: {
      title: '🕐 Today\'s Menu',
      subtitle: 'Time-based availability dishes',
      breakfast: '🌅 Breakfast',
      lunch: '🍱 Lunch',
      dinner: '🌙 Dinner',
      special: '⭐ Special',
      noItems: 'No items available',
      noItemsDesc: 'Time-based menu items will appear here when available',
      loading: 'Loading menu...',
      availableNow: 'Available Now',
      comingSoon: 'Coming Soon',
      ended: 'Ended',
      items: 'items'
    },
    sk: {
      title: '🕐 Dnešné Menu',
      subtitle: 'Jedlá dostupné podľa času',
      breakfast: '🌅 Raňajky',
      lunch: '🍱 Obed',
      dinner: '🌙 Večera',
      special: '⭐ Špeciál',
      noItems: 'Žiadne položky nie sú k dispozícii',
      noItemsDesc: 'Časovo obmedzené jedlá sa tu zobrazia, keď budú dostupné',
      loading: 'Načítava sa menu...',
      availableNow: 'Dostupné teraz',
      comingSoon: 'Čoskoro',
      ended: 'Skončilo',
      items: 'položiek'
    }
  }

  const t = translations[i18n.language?.split('-')[0]] || translations.hu

  // Auto-refresh current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [])

  // Filter time-based menu items
  useEffect(() => {
    if (!food_list || food_list.length === 0) return

    // Filter items that have time-based availability
    const timeBasedFoods = food_list.filter(food => {
      const hasTimeAvailability = 
        food.availableFrom || 
        food.availableTo || 
        food.dailyAvailability?.enabled ||
        food.weeklySchedule?.enabled

      // Check if currently available
      if (hasTimeAvailability) {
        return isFoodAvailable(food)
      }
      
      return false
    })

    setTimeBasedItems(timeBasedFoods)
  }, [food_list, currentTime, isLoadingFood])

  // Categorize items by time period
  const categorizeByTimePeriod = () => {
    const categories = {
      breakfast: [], // 6:00 - 11:00
      lunch: [],     // 11:00 - 15:00
      dinner: [],    // 17:00 - 22:00
      special: []    // Other times or date-based
    }

    timeBasedItems.forEach(item => {
      // Check if it has daily availability
      if (item.dailyAvailability?.enabled) {
        const { timeFrom } = item.dailyAvailability
        if (timeFrom) {
          const [hours] = timeFrom.split(':').map(Number)
          
          if (hours >= 6 && hours < 11) {
            categories.breakfast.push(item)
          } else if (hours >= 11 && hours < 15) {
            categories.lunch.push(item)
          } else if (hours >= 17 && hours < 22) {
            categories.dinner.push(item)
          } else {
            categories.special.push(item)
          }
        } else {
          categories.special.push(item)
        }
      } else {
        // Date-based availability goes to special
        categories.special.push(item)
      }
    })

    return categories
  }

  const categorizedItems = categorizeByTimePeriod()

  const handleViewDetails = (product) => {
    setSelectedProduct(product)
  }

  const closeProductDetail = () => {
    setSelectedProduct(null)
  }

  // Render category section
  const renderCategory = (categoryKey, items) => {
    if (items.length === 0) return null

    const categoryTitles = {
      breakfast: t.breakfast,
      lunch: t.lunch,
      dinner: t.dinner,
      special: t.special
    }

    return (
      <div key={categoryKey} className="time-category">
        <div className="category-header">
          <h3 className="category-title">{categoryTitles[categoryKey]}</h3>
          <span className="category-count">{items.length} {t.items}</span>
        </div>
        <div className="time-menu-grid">
          {items.map((item) => (
            <div key={item._id} className="time-menu-item-wrapper">
              <FoodItem
                id={item._id}
                name={item.name}
                nameVI={item.nameVI}
                nameEN={item.nameEN}
                nameHU={item.nameHU}
                description={item.description}
                price={item.price}
                image={item.image}
                sku={item.sku}
                isPromotion={item.isPromotion}
                originalPrice={item.originalPrice}
                promotionPrice={item.promotionPrice}
                soldCount={item.soldCount}
                likes={item.likes}
                options={item.options}
                availableFrom={item.availableFrom}
                availableTo={item.availableTo}
                dailyAvailability={item.dailyAvailability}
                weeklySchedule={item.weeklySchedule}
                quantity={item.quantity}
                orderBlocked={item.orderBlocked}
                onViewDetails={handleViewDetails}
                compact={false}
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Don't render if no items
  if (!isLoadingFood && timeBasedItems.length === 0) {
    return null // Hide component entirely if no time-based items
  }

  return (
    <div className="today-special-menu-container">
      {/* Header */}
      <div className="today-menu-header">
        <div className="header-content">
          <h2 className="today-menu-title">{t.title}</h2>
          <p className="today-menu-subtitle">{t.subtitle}</p>
        </div>
        <div className="current-time-badge">
          <span className="time-icon">🕐</span>
          <span className="time-text">
            {currentTime.toLocaleTimeString(i18n.language === 'vi' ? 'vi-VN' : i18n.language === 'hu' ? 'hu-HU' : 'en-US', {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="today-menu-content">
        {isLoadingFood ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>{t.loading}</p>
          </div>
        ) : timeBasedItems.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📅</div>
            <h3>{t.noItems}</h3>
            <p>{t.noItemsDesc}</p>
          </div>
        ) : (
          <div className="time-categories-wrapper">
            {renderCategory('breakfast', categorizedItems.breakfast)}
            {renderCategory('lunch', categorizedItems.lunch)}
            {renderCategory('dinner', categorizedItems.dinner)}
            {renderCategory('special', categorizedItems.special)}
          </div>
        )}
      </div>

      {/* Product Detail Popup */}
      {selectedProduct && (
        <ProductDetail
          product={selectedProduct}
          onClose={closeProductDetail}
        />
      )}
    </div>
  )
}

export default TodaySpecialMenu
