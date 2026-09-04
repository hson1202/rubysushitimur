import React, { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { StoreContext } from '../../Context/StoreContext'
import './RestaurantClosedBanner.css'

const RestaurantClosedBanner = () => {
  const { restaurantOpenStatus, restaurantInfoLoading, deliveryEnabled } = useContext(StoreContext)
  const { t } = useTranslation()

  if (restaurantInfoLoading) {
    return null
  }

  if (restaurantOpenStatus && !restaurantOpenStatus.isOpen) {
    return (
      <div className="restaurant-closed-banner" role="alert">
        <span className="restaurant-closed-icon">🕐</span>
        <span className="restaurant-closed-text">
          {restaurantOpenStatus.message || t('restaurant.closedNow')}
        </span>
      </div>
    )
  }

  if (!deliveryEnabled) {
    return (
      <div className="restaurant-closed-banner delivery-unavailable-banner" role="status">
        <span className="restaurant-closed-icon">🛵</span>
        <span className="restaurant-closed-text">
          {t('restaurant.deliveryUnavailable')}
        </span>
      </div>
    )
  }

  return null
}

export default RestaurantClosedBanner
