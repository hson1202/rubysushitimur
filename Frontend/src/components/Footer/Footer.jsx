import React, { useContext, useMemo } from 'react'
import './Footer.css'
import { assets } from '../../assets/assets'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { StoreContext } from '../../Context/StoreContext'
import config from '../../config/config'
import { formatWeeklyHoursDisplay, normalizeWeeklyHours } from '../../utils/restaurantHours'

const Footer = ({ setShowDeliveryInfo }) => {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const { restaurantInfo, restaurantInfoLoading: loading } = useContext(StoreContext)
  const isContactPage = location?.pathname === '/contact'

  const lang = (i18n.language || 'vi').split('-')[0]

  const reserveTagline = useMemo(() => {
    return (
      restaurantInfo?.translations?.[lang]?.tagline
      || restaurantInfo?.tagline
      || t('footer.reserveDescription')
      || ''
    )
  }, [restaurantInfo, lang, t])

  const copyrightText = useMemo(() => {
    return restaurantInfo?.copyrightText || t('footer.allRightsReserved') || ''
  }, [restaurantInfo, t])

  const localizedAddress = useMemo(() => {
    return restaurantInfo?.translations?.[lang]?.address || restaurantInfo?.address || ''
  }, [restaurantInfo, lang])

  const openingHoursText = useMemo(() => {
    if (!restaurantInfo) return ''
    if (restaurantInfo.weeklyHours?.length === 7) {
      return formatWeeklyHoursDisplay(
        normalizeWeeklyHours(restaurantInfo.weeklyHours),
        lang
      )
    }
    const parts = [
      restaurantInfo.openingHours?.weekdays,
      restaurantInfo.openingHours?.sunday
    ].filter(Boolean)
    return parts.join(' · ')
  }, [restaurantInfo, lang])

  return (
    <footer className='footer' id='footer'>
      <div className='footer-container'>
        <div className='footer-grid'>
          {/* Column 1: Company Info */}
          <div className='footer-col'>
            <h3 className='footer-title'>{t('footer.companyTitle') || 'Company'}</h3>
            <ul className='footer-list'>
              <li><a href={config.EXTERNAL_LINKS.HOME}>{t('footer.home') || 'Home'}</a></li>
              <li><a href={config.EXTERNAL_LINKS.ABOUT}>{t('footer.aboutUs') || 'About Us'}</a></li>
              <li><a href='/menu'>{t('nav.menu')}</a></li>
              <li>
                <button type="button" className="footer-text-link" onClick={() => setShowDeliveryInfo(true)}>
                  {t('nav.deliveryInfo')}
                </button>
              </li>
              <li><a href='/blog'>{t('footer.blog') || 'Blog'}</a></li>
            </ul>
          </div>

          {/* Column 2: Services */}
          <div className='footer-col'>
            <h3 className='footer-title'>{t('footer.servicesTitle') || 'Services'}</h3>
            <ul className='footer-list'>
              <li><a href='/menu'>{t('footer.delivery') || 'Delivery'}</a></li>
              <li><a href='/menu'>{t('footer.takeaway') || 'Takeaway'}</a></li>
              <li><a href={config.EXTERNAL_LINKS.RESERVATION}>{t('footer.reservation') || 'Reservation'}</a></li>
              <li><a href='/catering'>{t('footer.catering') || 'Catering'}</a></li>
            </ul>
          </div>

          {/* Column 3: Contact (hidden on /contact to avoid duplicated phone/email) */}
          {!isContactPage && (
            <div className='footer-col'>
              <h3 className='footer-title'>{t('footer.contactTitle') || 'Contact'}</h3>
              <ul className='footer-list'>
                {restaurantInfo?.phone && (
                  <li>
                    <span className='footer-label'>{t('footer.phone') || 'Phone'}:</span>
                    <span className='footer-value'>{loading ? '...' : restaurantInfo.phone}</span>
                  </li>
                )}
                {restaurantInfo?.email && (
                  <li>
                    <span className='footer-label'>{t('footer.email') || 'Email'}:</span>
                    <span className='footer-value'>{loading ? '...' : restaurantInfo.email}</span>
                  </li>
                )}
                {localizedAddress && (
                  <li>
                    <span className='footer-label'>{t('footer.address') || 'Address'}:</span>
                    <span className='footer-value'>{loading ? '...' : localizedAddress}</span>
                  </li>
                )}
                {(loading || openingHoursText) && (
                  <li>
                    <span className='footer-label'>{t('footer.openingHours') || 'Opening Hours'}:</span>
                    <span className='footer-value footer-hours'>
                      {loading ? '...' : openingHoursText}
                    </span>
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Column 4: Reserve Table */}
          <div className='footer-col'>
            <h3 className='footer-title'>{t('footer.reserveTitle') || 'Reserve a Table'}</h3>
            <p className='footer-text'>
              {reserveTagline}
            </p>
            <a
              className='footer-reserve-btn'
              href={config.EXTERNAL_LINKS.RESERVATION}
            >
              {t('footer.reserveButton') || 'Book Now'}
            </a>
            <div className='footer-social'>
              {restaurantInfo?.socialMedia?.facebook && (
                <a href={restaurantInfo.socialMedia.facebook} target='_blank' rel='noreferrer'>
                  <img src={assets.facebook_icon} alt={t('footer.socialLabels.fb')} />
                </a>
              )}
              {restaurantInfo?.socialMedia?.twitter && (
                <a href={restaurantInfo.socialMedia.twitter} target='_blank' rel='noreferrer'>
                  <img src={assets.twitter_icon} alt={t('footer.socialLabels.tw')} />
                </a>
              )}
              {restaurantInfo?.socialMedia?.linkedin && (
                <a href={restaurantInfo.socialMedia.linkedin} target='_blank' rel='noreferrer'>
                  <img src={assets.linkedin_icon} alt={t('footer.socialLabels.in')} />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className='footer-bottom'>
          <p>{copyrightText}</p>
        </div>
      </div>
    </footer>
  )
}

export default Footer