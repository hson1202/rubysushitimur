import { useContext, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import axios from 'axios'
import { StoreContext } from '../../Context/StoreContext'
import { assets } from '../../assets/assets'
import config from '../../config/config'
import { DEFAULT_DELIVERY_INFO } from '../../utils/deliveryInfoDefault'
import './DeliveryInfoPopup.css'

const pickTranslation = (translations, lang) => {
  const code = (lang || 'hu').split('-')[0]
  return translations?.[code]
    || translations?.hu
    || translations?.en
    || translations?.vi
    || DEFAULT_DELIVERY_INFO.hu
}

const DeliveryInfoPopup = ({ setShowDeliveryInfo }) => {
  const { t, i18n } = useTranslation()
  const { restaurantInfo } = useContext(StoreContext)
  const [page, setPage] = useState(null)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const previousPaddingRight = document.body.style.paddingRight
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`
    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.paddingRight = previousPaddingRight
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setShowDeliveryInfo(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setShowDeliveryInfo])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await axios.get(`${config.BACKEND_URL}/api/page-content/delivery-info`, {
          timeout: 5000
        })
        if (!cancelled && response.data.success) {
          setPage(response.data.data)
        }
      } catch {
        if (!cancelled) setPage(null)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const localized = useMemo(
    () => pickTranslation(page?.translations || DEFAULT_DELIVERY_INFO, i18n.language),
    [page, i18n.language]
  )

  const hidden = page?.isPublished === false
  const title = localized.title || t('nav.deliveryInfo')
  const restaurantName = restaurantInfo?.restaurantName || 'Ruby Sushi'
  const close = () => setShowDeliveryInfo(false)

  const popup = (
    <div
      className="delivery-info-popup"
      onClick={close}
      role="presentation"
    >
      <div
        className="delivery-info-popup-note"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delivery-info-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="delivery-info-popup-close"
          onClick={close}
          aria-label={t('common.close') || 'Close'}
        >
          <img src={assets.cross_icon} alt="" />
        </button>

        <div className="delivery-info-popup-scroll">
          <p className="delivery-info-popup-kicker">{restaurantName}</p>
          <h2 id="delivery-info-title">{title}</h2>
          {hidden ? (
            <p className="delivery-info-popup-status">{t('deliveryInfo.loadError')}</p>
          ) : (
            <div
              className="delivery-info-popup-content"
              dangerouslySetInnerHTML={{ __html: localized.content }}
            />
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(popup, document.body)
}

export default DeliveryInfoPopup
