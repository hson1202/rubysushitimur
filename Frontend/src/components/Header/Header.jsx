import React, { useContext } from 'react'
import './Header.css'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { StoreContext } from '../../Context/StoreContext'
import config from '../../config/config'

const Header = () => {
  const { t, i18n } = useTranslation();
  const { restaurantInfo } = useContext(StoreContext);
  const lang = i18n.language?.split('-')[0] || 'hu';

  const headline = restaurantInfo?.translations?.[lang]?.heroHeadline
    || restaurantInfo?.heroHeadline
    || t('header.headline', 'Order your favourite food here');

  const subtext = restaurantInfo?.translations?.[lang]?.heroSubtext
    || restaurantInfo?.heroSubtext
    || t('header.subtext', 'Choose from a diverse menu featuring a delectable array of dishes crafted with the finest ingredients and culinary expertise.');

  return (
    <div className='header'>
      <div className='header-contents'>
        <h2>{headline}</h2>
        <p>{subtext}</p>
        <div className="header-buttons">
          <Link to='/menu'>
            <button className="view-menu-btn">{t('header.viewMenu', 'View Menu')}</button>
          </Link>
          <a href={config.EXTERNAL_LINKS.RESERVATION}>
            <button className="booking-btn">{t('header.bookTable', 'Book a Table')}</button>
          </a>
        </div>
      </div>
    </div>
  )
}

export default Header;