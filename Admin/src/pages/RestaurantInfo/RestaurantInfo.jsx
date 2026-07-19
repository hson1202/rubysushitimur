import React, { useState, useEffect, useRef } from 'react';
import './RestaurantInfo.css';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { resolveMediaUrl } from '../../utils/mediaUrl';

const emptyTranslation = () => ({
  restaurantName: '',
  address: '',
  tagline: '',
  heroHeadline: '',
  heroSubtext: '',
  openingHours: { weekdays: '', sunday: '' }
});

const getDefaultWeeklyHours = () =>
  Array.from({ length: 7 }, (_, day) => ({
    isClosed: false,
    openTime: '11:00',
    closeTime: day === 0 ? '17:00' : '20:00'
  }));

const normalizeWeeklyHours = (weeklyHours) => {
  const defaults = getDefaultWeeklyHours();
  if (!Array.isArray(weeklyHours) || weeklyHours.length !== 7) return defaults;
  return weeklyHours.map((day, index) => ({
    isClosed: Boolean(day?.isClosed),
    openTime: day?.openTime || defaults[index].openTime,
    closeTime: day?.closeTime || defaults[index].closeTime
  }));
};

// Display Mon–Sat then Sun; index matches JS getDay() (0=Sun … 6=Sat)
const DAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const RestaurantInfo = ({ url }) => {
  const { t } = useTranslation();
  const [info, setInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState('');
  const [activeTab, setActiveTab] = useState('basic');
  const logoInputRef = useRef(null);

  const [formData, setFormData] = useState({
    restaurantName: '',
    logoUrl: '',
    faviconUrl: '',
    tagline: '',
    heroHeadline: '',
    heroSubtext: '',
    foundingYear: '',
    phone: '',
    email: '',
    notificationEmails: [],
    address: '',
    openingHours: { weekdays: '', sunday: '' },
    weeklyHours: getDefaultWeeklyHours(),
    socialMedia: { facebook: '', twitter: '', linkedin: '', instagram: '' },
    googleMapsUrl: '',
    copyrightText: '',
    translations: {
      vi: emptyTranslation(),
      en: emptyTranslation(),
      hu: emptyTranslation()
    }
  });
  const [newNotificationEmail, setNewNotificationEmail] = useState('');

  useEffect(() => {
    fetchRestaurantInfo();
  }, []);

  const fetchRestaurantInfo = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(`${url}/api/restaurant-info`, {
        headers: { token: localStorage.getItem('adminToken') || '' }
      });
      if (response.data.success) {
        const d = response.data.data;
        setInfo(d);
        setLogoPreview(resolveMediaUrl(d.logoUrl || ''));
        setFormData({
          restaurantName: d.restaurantName || '',
          logoUrl: d.logoUrl || '',
          faviconUrl: d.faviconUrl || '',
          tagline: d.tagline || '',
          heroHeadline: d.heroHeadline || '',
          heroSubtext: d.heroSubtext || '',
          foundingYear: d.foundingYear || '',
          phone: d.phone || '',
          email: d.email || '',
          notificationEmails: Array.isArray(d.notificationEmails) ? d.notificationEmails : [],
          address: d.address || '',
          openingHours: {
            weekdays: d.openingHours?.weekdays || '',
            sunday: d.openingHours?.sunday || ''
          },
          weeklyHours: normalizeWeeklyHours(d.weeklyHours),
          socialMedia: {
            facebook: d.socialMedia?.facebook || '',
            twitter: d.socialMedia?.twitter || '',
            linkedin: d.socialMedia?.linkedin || '',
            instagram: d.socialMedia?.instagram || ''
          },
          googleMapsUrl: d.googleMapsUrl || '',
          copyrightText: d.copyrightText || '',
          translations: {
            vi: {
              restaurantName: d.translations?.vi?.restaurantName || '',
              address: d.translations?.vi?.address || '',
              tagline: d.translations?.vi?.tagline || '',
              heroHeadline: d.translations?.vi?.heroHeadline || '',
              heroSubtext: d.translations?.vi?.heroSubtext || '',
              openingHours: {
                weekdays: d.translations?.vi?.openingHours?.weekdays || '',
                sunday: d.translations?.vi?.openingHours?.sunday || ''
              }
            },
            en: {
              restaurantName: d.translations?.en?.restaurantName || '',
              address: d.translations?.en?.address || '',
              tagline: d.translations?.en?.tagline || '',
              heroHeadline: d.translations?.en?.heroHeadline || '',
              heroSubtext: d.translations?.en?.heroSubtext || '',
              openingHours: {
                weekdays: d.translations?.en?.openingHours?.weekdays || '',
                sunday: d.translations?.en?.openingHours?.sunday || ''
              }
            },
            hu: {
              restaurantName: d.translations?.hu?.restaurantName || '',
              address: d.translations?.hu?.address || '',
              tagline: d.translations?.hu?.tagline || '',
              heroHeadline: d.translations?.hu?.heroHeadline || '',
              heroSubtext: d.translations?.hu?.heroSubtext || '',
              openingHours: {
                weekdays: d.translations?.hu?.openingHours?.weekdays || '',
                sunday: d.translations?.hu?.openingHours?.sunday || ''
              }
            }
          }
        });
      }
    } catch (error) {
      console.error('Error fetching restaurant info:', error);
      toast.error('Không thể tải thông tin nhà hàng');
    } finally {
      setIsLoading(false);
    }
  };

  const handleWeeklyHourChange = (dayIndex, field, value) => {
    setFormData(prev => {
      const weeklyHours = [...prev.weeklyHours];
      weeklyHours[dayIndex] = { ...weeklyHours[dayIndex], [field]: value };
      return { ...prev, weeklyHours };
    });
  };

  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(String(value).trim());

  const addNotificationEmail = () => {
    const email = newNotificationEmail.trim().toLowerCase();
    if (!email) return;
    if (!isValidEmail(email)) {
      toast.error(t('ri.notificationEmailInvalid'));
      return;
    }
    if (formData.notificationEmails.includes(email)) {
      toast.error(t('ri.notificationEmailExists'));
      return;
    }
    setFormData(prev => ({
      ...prev,
      notificationEmails: [...prev.notificationEmails, email]
    }));
    setNewNotificationEmail('');
  };

  const removeNotificationEmail = (email) => {
    setFormData(prev => ({
      ...prev,
      notificationEmails: prev.notificationEmails.filter((e) => e !== email)
    }));
  };

  const handleNotificationEmailKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addNotificationEmail();
    }
  };

  const validateWeeklyHours = () => {
    for (let i = 0; i < formData.weeklyHours.length; i++) {
      const day = formData.weeklyHours[i];
      if (!day.isClosed && day.openTime >= day.closeTime) {
        toast.error(t('ri.hoursInvalid', { day: t(`ri.day${i}`) }));
        return false;
      }
    }
    return true;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name.includes('.')) {
      const keys = name.split('.');
      setFormData(prev => {
        const next = JSON.parse(JSON.stringify(prev));
        let cur = next;
        for (let i = 0; i < keys.length - 1; i++) {
          if (!cur[keys[i]]) cur[keys[i]] = {};
          cur = cur[keys[i]];
        }
        cur[keys[keys.length - 1]] = value;
        return next;
      });
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleLogoFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLogoPreview(URL.createObjectURL(file));
    try {
      setIsUploadingLogo(true);
      const token = localStorage.getItem('adminToken');
      const fd = new FormData();
      fd.append('logo', file);
      const res = await axios.post(`${url}/api/restaurant-info/upload-logo`, fd, {
        headers: { token }
      });
      if (res.data.success) {
        const newLogoUrl = res.data.url || res.data.data?.logoUrl || '';
        setFormData(prev => ({ ...prev, logoUrl: newLogoUrl }));
        setLogoPreview(resolveMediaUrl(newLogoUrl));
        if (res.data.data) setInfo(res.data.data);
        window.dispatchEvent(new CustomEvent('restaurantInfoUpdated', { detail: res.data.data }));
        toast.success('Logo đã được cập nhật!');
      } else {
        toast.error(res.data.message || 'Upload failed');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Logo upload failed');
      setLogoPreview(resolveMediaUrl(formData.logoUrl || ''));
    } finally {
      setIsUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateWeeklyHours()) return;
    try {
      setIsSaving(true);
      const token = localStorage.getItem('adminToken');
      const response = await axios.put(`${url}/api/restaurant-info`, formData, {
        headers: { token }
      });
      if (response.data.success) {
        toast.success('Cập nhật thông tin thành công!');
        const saved = response.data.data;
        setInfo(saved);
        if (saved?.logoUrl !== undefined) {
          setFormData(prev => ({ ...prev, logoUrl: saved.logoUrl }));
          setLogoPreview(resolveMediaUrl(saved.logoUrl || ''));
        }
        window.dispatchEvent(new CustomEvent('restaurantInfoUpdated', { detail: saved }));
      } else {
        toast.error(response.data.message || 'Cập nhật thất bại');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể cập nhật thông tin');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Bạn có chắc muốn reset về giá trị mặc định?')) return;
    try {
      setIsSaving(true);
      const token = localStorage.getItem('adminToken');
      const response = await axios.post(`${url}/api/restaurant-info/reset`, {}, { headers: { token } });
      if (response.data.success) {
        toast.success('Đã reset về giá trị mặc định!');
        await fetchRestaurantInfo();
        window.dispatchEvent(new CustomEvent('restaurantInfoUpdated', { detail: response.data.data }));
      }
    } catch (error) {
      toast.error('Không thể reset thông tin');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="restaurant-info-page">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>{t('ri.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="restaurant-info-page">
      <div className="page-header">
        <div>
          <h1>🏪 {t('ri.title')}</h1>
          <p>{t('ri.subtitle')}</p>
        </div>
        <div className="header-actions">
          <button className="btn-reset" onClick={handleReset} disabled={isSaving}>
            ↺ {t('ri.reset')}
          </button>
        </div>
      </div>

      <div className="tabs">
        {[
          { key: 'basic', icon: '📝', label: t('ri.basicInfo') },
          { key: 'branding', icon: '🎨', label: 'Branding' },
          { key: 'hours', icon: '🕐', label: t('ri.openingHours') },
          { key: 'social', icon: '📱', label: t('ri.socialMedia') },
          { key: 'translations', icon: '🌍', label: t('ri.translations') }
        ].map(tab => (
          <button
            key={tab.key}
            className={`tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>

        {/* Basic Information Tab */}
        {activeTab === 'basic' && (
          <div className="form-section">
            <h2>{t('ri.basicInfo')}</h2>

            <div className="form-group">
              <label>{t('ri.restaurantName')}</label>
              <input type="text" name="restaurantName" value={formData.restaurantName}
                onChange={handleInputChange} placeholder="e.g. My Restaurant" />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>{t('ri.phone')}</label>
                <input type="text" name="phone" value={formData.phone}
                  onChange={handleInputChange} placeholder="+1 234 567 890" />
              </div>
              <div className="form-group">
                <label>{t('ri.email')}</label>
                <input type="email" name="email" value={formData.email}
                  onChange={handleInputChange} placeholder="info@restaurant.com" />
              </div>
            </div>

            <div className="form-group">
              <label>{t('ri.notificationEmails')}</label>
              <small className="field-hint">{t('ri.notificationEmailsHelp')}</small>
              <div className="notification-email-box">
                {formData.notificationEmails.length === 0 ? (
                  <p className="notification-email-empty">{t('ri.notificationEmailsEmpty')}</p>
                ) : (
                  <ul className="notification-email-list">
                    {formData.notificationEmails.map((email) => (
                      <li key={email} className="notification-email-row">
                        <span className="notification-email-text">{email}</span>
                        <button
                          type="button"
                          className="btn-remove-email"
                          onClick={() => removeNotificationEmail(email)}
                        >
                          {t('ri.notificationEmailRemove')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="notification-email-add">
                  <input
                    type="email"
                    value={newNotificationEmail}
                    onChange={(e) => setNewNotificationEmail(e.target.value)}
                    onKeyDown={handleNotificationEmailKeyDown}
                    placeholder="orders@example.com"
                  />
                  <button type="button" className="btn-add-email" onClick={addNotificationEmail}>
                    {t('ri.notificationEmailAdd')}
                  </button>
                </div>
              </div>
            </div>

            <div className="form-group">
              <label>{t('ri.address')}</label>
              <input type="text" name="address" value={formData.address}
                onChange={handleInputChange} placeholder="123 Main St, City, Country" />
            </div>

            <div className="form-group">
              <label>{t('ri.googleMapsUrl')}</label>
              <textarea name="googleMapsUrl" value={formData.googleMapsUrl}
                onChange={handleInputChange} placeholder="Paste Google Maps embed URL here" rows={3} />
              <small>Google Maps → Share → Embed a map → copy src URL</small>
            </div>

            <div className="form-group">
              <label>{t('ri.copyrightText')}</label>
              <input type="text" name="copyrightText" value={formData.copyrightText}
                onChange={handleInputChange} placeholder="© 2025 My Restaurant. All rights reserved." />
            </div>
          </div>
        )}

        {/* Branding Tab */}
        {activeTab === 'branding' && (
          <div className="form-section">
            <h2>Branding &amp; Hero</h2>

            {/* Logo Upload */}
            <div className="form-group">
              <label>Restaurant Logo</label>
              <div className="logo-upload-area">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo preview" className="logo-preview" />
                ) : (
                  <div className="logo-placeholder">No logo set</div>
                )}
                <div className="logo-upload-actions">
                  <button type="button" className="btn-upload-logo"
                    onClick={() => logoInputRef.current?.click()} disabled={isUploadingLogo}>
                    {isUploadingLogo ? 'Uploading...' : '📁 Upload Logo'}
                  </button>
                  {formData.logoUrl && (
                    <button type="button" className="btn-remove-logo"
                      onClick={() => { setFormData(p => ({ ...p, logoUrl: '' })); setLogoPreview(''); }}>
                      ✕ Remove
                    </button>
                  )}
                </div>
                <input ref={logoInputRef} type="file" accept="image/*" hidden onChange={handleLogoFileChange} />
              </div>
              <small>Or paste a URL directly:</small>
              <input type="url" name="logoUrl" value={formData.logoUrl}
                onChange={(e) => { handleInputChange(e); setLogoPreview(resolveMediaUrl(e.target.value)); }}
                placeholder="https://..." style={{ marginTop: '6px' }} />
            </div>

            {/* Favicon */}
            <div className="form-group">
              <label>Favicon URL</label>
              <input type="url" name="faviconUrl" value={formData.faviconUrl}
                onChange={handleInputChange} placeholder="https://.../favicon.ico" />
              <small>URL to .ico, .png, or .svg file shown in browser tab</small>
            </div>

            {/* Tagline */}
            <div className="form-group">
              <label>Tagline</label>
              <input type="text" name="tagline" value={formData.tagline}
                onChange={handleInputChange} placeholder="e.g. Authentic flavors, every day" />
            </div>

            {/* Founding Year */}
            <div className="form-group">
              <label>Founding Year</label>
              <input type="text" name="foundingYear" value={formData.foundingYear}
                onChange={handleInputChange} placeholder="e.g. 2020" />
            </div>

            {/* Hero Section */}
            <div className="form-group">
              <label>Hero Headline</label>
              <input type="text" name="heroHeadline" value={formData.heroHeadline}
                onChange={handleInputChange} placeholder="Main heading shown on the homepage hero" />
            </div>

            <div className="form-group">
              <label>Hero Subtext</label>
              <textarea name="heroSubtext" value={formData.heroSubtext}
                onChange={handleInputChange} placeholder="Supporting paragraph below the hero headline" rows={3} />
            </div>
          </div>
        )}

        {/* Opening Hours Tab */}
        {activeTab === 'hours' && (
          <div className="form-section">
            <h2>{t('ri.openingHours')}</h2>
            <p className="hours-help">{t('ri.hoursHelp')}</p>
            <div className="weekly-hours-table">
              <div className="weekly-hours-header">
                <span>{t('ri.dayColumn')}</span>
                <span>{t('ri.closedColumn')}</span>
                <span>{t('ri.openTimeColumn')}</span>
                <span>{t('ri.closeTimeColumn')}</span>
              </div>
              {DAY_DISPLAY_ORDER.map((dayIndex) => {
                const day = formData.weeklyHours[dayIndex];
                return (
                  <div className="weekly-hours-row" key={dayIndex}>
                    <span className="day-label">{t(`ri.day${dayIndex}`)}</span>
                    <label className="closed-checkbox">
                      <input
                        type="checkbox"
                        checked={day.isClosed}
                        onChange={(e) => handleWeeklyHourChange(dayIndex, 'isClosed', e.target.checked)}
                      />
                      {t('ri.closedLabel')}
                    </label>
                    <input
                      type="time"
                      value={day.openTime}
                      disabled={day.isClosed}
                      onChange={(e) => handleWeeklyHourChange(dayIndex, 'openTime', e.target.value)}
                    />
                    <input
                      type="time"
                      value={day.closeTime}
                      disabled={day.isClosed}
                      onChange={(e) => handleWeeklyHourChange(dayIndex, 'closeTime', e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Social Media Tab */}
        {activeTab === 'social' && (
          <div className="form-section">
            <h2>{t('ri.socialMedia')}</h2>
            {[
              { label: 'Facebook', name: 'socialMedia.facebook', ph: 'https://facebook.com/yourpage' },
              { label: 'Instagram', name: 'socialMedia.instagram', ph: 'https://instagram.com/yourpage' },
              { label: 'Twitter / X', name: 'socialMedia.twitter', ph: 'https://twitter.com/yourpage' },
              { label: 'LinkedIn', name: 'socialMedia.linkedin', ph: 'https://linkedin.com/company/yourpage' }
            ].map(({ label, name, ph }) => (
              <div className="form-group" key={name}>
                <label>{label}</label>
                <input type="url" name={name}
                  value={name.split('.').reduce((o, k) => o?.[k], formData) || ''}
                  onChange={handleInputChange} placeholder={ph} />
              </div>
            ))}
          </div>
        )}

        {/* Translations Tab */}
        {activeTab === 'translations' && (
          <div className="form-section">
            <h2>{t('ri.translations')}</h2>
            {[
              { code: 'vi', flag: '🇻🇳', lang: 'Tiếng Việt (Vietnamese)' },
              { code: 'en', flag: '🇬🇧', lang: 'English' },
              { code: 'hu', flag: '🇭🇺', lang: 'Magyar (Hungarian)' }
            ].map(({ code, flag, lang }) => (
              <div className="translation-section" key={code}>
                <h3>{flag} {lang}</h3>

                <div className="form-group">
                  <label>Restaurant Name</label>
                  <input type="text" name={`translations.${code}.restaurantName`}
                    value={formData.translations[code].restaurantName}
                    onChange={handleInputChange} />
                </div>

                <div className="form-group">
                  <label>Address</label>
                  <input type="text" name={`translations.${code}.address`}
                    value={formData.translations[code].address}
                    onChange={handleInputChange} />
                </div>

                <div className="form-group">
                  <label>Tagline</label>
                  <input type="text" name={`translations.${code}.tagline`}
                    value={formData.translations[code].tagline}
                    onChange={handleInputChange} />
                </div>

                <div className="form-group">
                  <label>Hero Headline</label>
                  <input type="text" name={`translations.${code}.heroHeadline`}
                    value={formData.translations[code].heroHeadline}
                    onChange={handleInputChange} />
                </div>

                <div className="form-group">
                  <label>Hero Subtext</label>
                  <textarea name={`translations.${code}.heroSubtext`}
                    value={formData.translations[code].heroSubtext}
                    onChange={handleInputChange} rows={2} />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Opening Hours (Weekdays)</label>
                    <input type="text" name={`translations.${code}.openingHours.weekdays`}
                      value={formData.translations[code].openingHours.weekdays}
                      onChange={handleInputChange} />
                  </div>
                  <div className="form-group">
                    <label>Opening Hours (Sunday)</label>
                    <input type="text" name={`translations.${code}.openingHours.sunday`}
                      value={formData.translations[code].openingHours.sunday}
                      onChange={handleInputChange} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="form-actions">
          <button type="submit" className="btn-save" disabled={isSaving}>
            {isSaving ? `💾 ${t('ri.saving')}` : `💾 ${t('ri.saveChanges')}`}
          </button>
        </div>
      </form>
    </div>
  );
};

export default RestaurantInfo;
