import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import config from '../config/config'
import { resolveMediaUrl, withCacheBust, updateDocumentBranding } from '../utils/mediaUrl'
import { setActiveRestaurantTimeZone } from '../utils/timeZone'

const useRestaurantBranding = () => {
  const [restaurantName, setRestaurantName] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [faviconUrl, setFaviconUrl] = useState('')

  const applyBranding = useCallback((data) => {
    if (!data) return

    const logo = data.logoUrl || ''
    const favicon = data.faviconUrl || ''
    const version = data.updatedAt
    const iconSource = logo || favicon

    setActiveRestaurantTimeZone(data.timeZone)
    setRestaurantName(data.restaurantName || '')
    setLogoUrl(logo ? withCacheBust(resolveMediaUrl(logo), version) : '')
    setFaviconUrl(iconSource ? withCacheBust(resolveMediaUrl(iconSource), version) : '')
    updateDocumentBranding(data)
  }, [])

  const loadRestaurantBranding = useCallback(() => {
    axios.get(`${config.BACKEND_URL}/api/restaurant-info`)
      .then((res) => {
        if (res.data.success && res.data.data) {
          applyBranding(res.data.data)
        }
      })
      .catch(() => {})
  }, [applyBranding])

  useEffect(() => {
    loadRestaurantBranding()

    const handleUpdate = (event) => {
      if (event?.detail) {
        applyBranding(event.detail)
      }
      loadRestaurantBranding()
    }

    window.addEventListener('restaurantInfoUpdated', handleUpdate)
    return () => window.removeEventListener('restaurantInfoUpdated', handleUpdate)
  }, [applyBranding, loadRestaurantBranding])

  return { restaurantName, logoUrl, faviconUrl, reload: loadRestaurantBranding }
}

export default useRestaurantBranding
