import React, { useState, useEffect, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import config from '../../config/config';
import './Reservation.css';
import { StoreContext } from '../../Context/StoreContext';
import {
  normalizeWeeklyHours,
  generateTimeSlotsForDate,
  formatWeeklyHoursDisplay,
  formatDayHours
} from '../../utils/restaurantHours';

const Reservation = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { restaurantInfo } = useContext(StoreContext);
  
  const [reservationData, setReservationData] = useState({
    customerName: '',
    phone: '',
    email: '',
    reservationDate: '',
    reservationTime: '',
    numberOfPeople: 1,
    note: ''
  });

  // Reservation form states
  const [reservationLoading, setReservationLoading] = useState(false);
  const [reservationErrors, setReservationErrors] = useState({});
  const [reservationSuccess, setReservationSuccess] = useState(false);

  const handleReservationChange = (e) => {
    const { name, value } = e.target;
    
    setReservationData({
      ...reservationData,
      [name]: value
    });
    
    // Clear error when user starts typing
    if (reservationErrors[name]) {
      setReservationErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  // Client-side validation for reservation form
  const validateReservationForm = () => {
    const errors = {};
    
    if (!reservationData.customerName.trim()) {
      errors.customerName = t('booking.validation.fullNameRequired');
    } else if (reservationData.customerName.trim().length < 2) {
      errors.customerName = t('booking.validation.nameMinLength');
    }
    
    if (!reservationData.phone.trim()) {
      errors.phone = t('booking.validation.phoneRequired');
    } else {
      // Remove all non-digit characters for length check
      const digitsOnly = reservationData.phone.replace(/\D/g, '');
      if (digitsOnly.length < 10) {
        errors.phone = t('booking.validation.phoneMinDigits');
      }
    }
    
    if (!reservationData.email.trim()) {
      errors.email = t('booking.validation.emailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reservationData.email.trim())) {
      errors.email = t('booking.validation.emailInvalid');
    }
    
    if (!reservationData.reservationDate) {
      errors.reservationDate = t('booking.validation.dateRequired');
    } else {
      const selectedDate = new Date(reservationData.reservationDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate < today) {
        errors.reservationDate = t('booking.validation.datePast');
      }
    }
    
    if (!reservationData.reservationTime) {
      errors.reservationTime = t('booking.validation.timeRequired');
    }
    
    if (!reservationData.numberOfPeople || reservationData.numberOfPeople < 1) {
      errors.numberOfPeople = t('booking.validation.peopleRequired');
    }
    
    return errors;
  };

  const handleReservationSubmit = async (e) => {
    e.preventDefault();
    
    // Validate form
    const errors = validateReservationForm();
    if (Object.keys(errors).length > 0) {
      setReservationErrors(errors);
      return;
    }

    try {
      setReservationLoading(true);
      setReservationErrors({});
      
      const response = await fetch(`${config.BACKEND_URL}/api/reservation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reservationData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to submit reservation');
      }

      const result = await response.json();
      
      if (result.success) {
        setReservationSuccess(true);
        setReservationData({
          customerName: '',
          phone: '',
          email: '',
          reservationDate: '',
          reservationTime: '',
          numberOfPeople: 1,
          note: ''
        });
        
        // Show longer message if email service is disabled
        const messageDuration = result.messageId === 'email_not_configured' ? 7000 : 5000;
        setTimeout(() => {
          setReservationSuccess(false);
        }, messageDuration);
      }
    } catch (error) {
      console.error('Reservation error:', error);
      setReservationErrors({
        general: error.message
      });
    } finally {
      setReservationLoading(false);
    }
  };

  // Generate available time slots based on business hours
  const generateTimeSlots = (selectedDate) => {
    if (!selectedDate) return [];
    const weeklyHours = normalizeWeeklyHours(restaurantInfo?.weeklyHours);
    return generateTimeSlotsForDate(weeklyHours, selectedDate);
  };

  // Get minimum date (today)
  const getMinDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  // Get business hours text for selected date
  const getBusinessHoursText = (selectedDate) => {
    if (!selectedDate) return '';
    const weeklyHours = normalizeWeeklyHours(restaurantInfo?.weeklyHours);
    const lang = (i18n.language || 'vi').split('-')[0];
    return formatDayHours(weeklyHours, new Date(`${selectedDate}T12:00:00Z`), lang);
  };

  // Update time slots when date changes
  const handleDateChange = (e) => {
    const { value } = e.target;
    setReservationData(prev => ({
      ...prev,
      reservationDate: value,
      reservationTime: '' // Reset time when date changes
    }));
  };

  // Handle phone input key press - only allow valid characters
  const handlePhoneKeyDown = (e) => {
    // Allow all navigation and control keys
    if (e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }
    
    // Allow specific keys
    const allowedKeys = [
      'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
      'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
      'Home', 'End', 'Insert', 'PageUp', 'PageDown'
    ];
    
    if (allowedKeys.includes(e.key)) {
      return;
    }
    
    // Allow digits, +, spaces, parentheses, hyphens, and dots
    const allowedChars = /[\d\s\+\-\(\)\.]/;
    if (!allowedChars.test(e.key)) {
      e.preventDefault();
    }
  };

  // Generate time slots for selected date
  const timeSlots = generateTimeSlots(reservationData.reservationDate);

  return (
    <div className="reservation-page">
      <div className="reservation-container">
        <div className="reservation-form-section">
          <h2>{t('booking.title')}</h2>
          <p>{t('booking.subtitle')}</p>
          
          {/* Success Message - Inline */}
          {reservationSuccess && (
            <div className="success-message">
              <div className="success-icon">✅</div>
              <div className="success-content">
                <h3>{t('booking.success.inline.title')}</h3>
                <p>{t('booking.success.inline.message')}</p>
                <p className="email-note">
                  <small>{t('booking.success.inline.emailNote')}</small>
                </p>
              </div>
            </div>
          )}

          {/* Success Popup Modal */}
          {reservationSuccess && (
            <div className="success-popup-overlay">
              <div className="success-popup">
                <button 
                  className="success-popup-close"
                  onClick={() => setReservationSuccess(false)}
                >
                  ×
                </button>
                
                <div className="success-popup-icon">🎉</div>
                
                <h3>{t('booking.success.popup.title')}</h3>
                
                <p>
                  {t('booking.success.popup.message1', { name: restaurantInfo?.restaurantName || 'us' })}
                </p>
                
                <p>
                  {t('booking.success.popup.message2')}
                </p>
                
                <div className="email-note">
                  {t('booking.success.popup.emailNote')}
                </div>
                
                <div className="success-popup-actions">
                  <button 
                    className="success-popup-btn secondary"
                    onClick={() => setReservationSuccess(false)}
                  >
                    {t('booking.success.popup.close')}
                  </button>
                  <button 
                    className="success-popup-btn primary"
                    onClick={() => {
                      setReservationSuccess(false);
                      navigate('/');
                    }}
                  >
                    {t('booking.success.popup.backToHome')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {reservationErrors.general && (
            <div className="error-message">
              <div className="error-icon">❌</div>
              <div className="error-content">
                <p>{reservationErrors.general}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleReservationSubmit} className="reservation-form">
            <div className="form-group">
              <label htmlFor="customerName">{t('booking.form.fullName')}</label>
              <input
                type="text"
                id="customerName"
                name="customerName"
                value={reservationData.customerName}
                onChange={handleReservationChange}
                required
                placeholder={t('booking.form.fullNamePlaceholder')}
                className={reservationErrors.customerName ? 'error' : ''}
              />
              {reservationErrors.customerName && (
                <span className="error-text">{reservationErrors.customerName}</span>
              )}
            </div>
            
            <div className="form-group">
              <label htmlFor="phone">{t('booking.form.phone')}</label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={reservationData.phone}
                onChange={handleReservationChange}
                onKeyDown={handlePhoneKeyDown}
                required
                placeholder={t('booking.form.phonePlaceholder')}
                className={reservationErrors.phone ? 'error' : ''}
              />
              {reservationErrors.phone && (
                <span className="error-text">{reservationErrors.phone}</span>
              )}
            </div>
            
            <div className="form-group">
              <label htmlFor="email">{t('booking.form.email')}</label>
              <input
                type="email"
                id="email"
                name="email"
                value={reservationData.email}
                onChange={handleReservationChange}
                required
                placeholder={t('booking.form.emailPlaceholder')}
                className={reservationErrors.email ? 'error' : ''}
              />
              {reservationErrors.email && (
                <span className="error-text">{reservationErrors.email}</span>
              )}
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="reservationDate">{t('booking.form.date')}</label>
                <input
                  type="date"
                  id="reservationDate"
                  name="reservationDate"
                  value={reservationData.reservationDate}
                  onChange={handleDateChange}
                  required
                  min={getMinDate()}
                  className={reservationErrors.reservationDate ? 'error' : ''}
                />
                {reservationErrors.reservationDate && (
                  <span className="error-text">{reservationErrors.reservationDate}</span>
                )}
                {reservationData.reservationDate && (
                  <div className="business-hours-info">
                    <small>📅 {getBusinessHoursText(reservationData.reservationDate)}</small>
                  </div>
                )}
              </div>
              
              <div className="form-group">
                <label htmlFor="reservationTime">{t('booking.form.time')}</label>
                <select
                  id="reservationTime"
                  name="reservationTime"
                  value={reservationData.reservationTime}
                  onChange={handleReservationChange}
                  required
                  className={reservationErrors.reservationTime ? 'error' : ''}
                  disabled={!reservationData.reservationDate}
                >
                  <option value="">
                    {reservationData.reservationDate ? t('booking.form.selectTime') : t('booking.form.selectDateFirst')}
                  </option>
                  {timeSlots.map((time) => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
                {reservationErrors.reservationTime && (
                  <span className="error-text">{reservationErrors.reservationTime}</span>
                )}
              </div>
            </div>
            
            <div className="form-group">
              <label htmlFor="numberOfPeople">{t('booking.form.numberOfPeople')}</label>
              <select
                id="numberOfPeople"
                name="numberOfPeople"
                value={reservationData.numberOfPeople}
                onChange={handleReservationChange}
                required
                className={reservationErrors.numberOfPeople ? 'error' : ''}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                  <option key={num} value={num}>
                    {num} {num === 1 ? t('booking.form.person') : t('booking.form.people')}
                  </option>
                ))}
              </select>
              {reservationErrors.numberOfPeople && (
                <span className="error-text">{reservationErrors.numberOfPeople}</span>
              )}
            </div>
            
            <div className="form-group">
              <label htmlFor="note">{t('booking.form.specialRequests')}</label>
              <textarea
                id="note"
                name="note"
                value={reservationData.note}
                onChange={handleReservationChange}
                rows="4"
                placeholder={t('booking.form.specialRequestsPlaceholder')}
              ></textarea>
            </div>
            
            <div className="form-actions">
              <button 
                type="button" 
                className="cancel-btn"
                onClick={() => navigate('/')}
              >
                {t('booking.form.cancel')}
              </button>
              <button 
                type="submit" 
                className={`submit-btn ${reservationLoading ? 'loading' : ''}`}
                disabled={reservationLoading}
              >
                {reservationLoading ? t('booking.form.submitting') : t('booking.form.submit')}
              </button>
            </div>
          </form>
        </div>

        <div className="reservation-info">
          <div className="info-card">
            <h3>{t('booking.info.hours')}</h3>
            <div className="hours">
              {restaurantInfo?.weeklyHours?.length === 7 ? (
                <div className="day">
                  <span>
                    {formatWeeklyHoursDisplay(
                      normalizeWeeklyHours(restaurantInfo.weeklyHours),
                      (i18n.language || 'vi').split('-')[0]
                    )}
                  </span>
                </div>
              ) : (
                <>
                  {restaurantInfo?.openingHours?.weekdays && (
                    <div className="day">
                      <span>{restaurantInfo.openingHours.weekdays}</span>
                    </div>
                  )}
                  {restaurantInfo?.openingHours?.sunday && (
                    <div className="day">
                      <span>{restaurantInfo.openingHours.sunday}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="info-card">
            <h3>{t('booking.info.contact')}</h3>
            <div className="contact-info">
              {restaurantInfo?.address && <p>📍 {restaurantInfo.address}</p>}
              {restaurantInfo?.phone && <p>📞 {restaurantInfo.phone}</p>}
              {restaurantInfo?.email && <p>✉️ {restaurantInfo.email}</p>}
            </div>
          </div>

          <div className="info-card">
            <h3>{t('booking.info.policy')}</h3>
            <ul>
              <li>{t('booking.info.policy.item1')}</li>
              <li>{t('booking.info.policy.item2')}</li>
              <li>{t('booking.info.policy.item3')}</li>
              <li>{t('booking.info.policy.item4')}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reservation;
