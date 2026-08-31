import React, { useContext } from 'react';
import './SuccessPopup.css';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { StoreContext } from '../../Context/StoreContext';
import '../../i18n';

const SuccessPopup = ({ isOpen, onClose, setCartItems }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { clearCart } = useContext(StoreContext);

  if (!isOpen) return null;

  const handleClose = () => {
    if (clearCart) {
      clearCart();
    } else if (setCartItems) {
      setCartItems({});
    }
    onClose();
  };

  const handleGoHome = () => {
    handleClose();
    navigate('/');
  };

  return (
    <div className="success-popup-overlay" onClick={handleClose}>
      <div className="success-popup" onClick={(e) => e.stopPropagation()}>
        <div className="success-popup-content">
          {/* Success Icon */}
          <div className="success-icon">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" fill="#4CAF50"/>
              <path d="M9 12L11 14L15 10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          {/* Success Message */}
          <h2 className="success-title">🎉 {t('successPopup.title')}</h2>
          <p className="success-message">{t('successPopup.message')}</p>

          {/* Delivery Time */}
          <div className="delivery-time">
            <div className="delivery-icon">🚚</div>
            <div className="delivery-text">
              <p className="delivery-title">{t('successPopup.delivery.title')}</p>
              <p className="delivery-time-text">{t('successPopup.delivery.time')}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="success-actions">
            <button className="btn-home" onClick={handleGoHome}>
              🏠 {t('successPopup.goHome')}
            </button>
          </div>


        </div>
      </div>
    </div>
  );
};

export default SuccessPopup;
