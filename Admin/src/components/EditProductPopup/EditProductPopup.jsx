import React, { useState, useCallback, useMemo } from 'react';
import './EditProductPopup.css';
import { useTranslation } from 'react-i18next';
import { ALLERGEN_OPTIONS } from '../../utils/allergens';

const EditProductPopup = ({ 
  isOpen, 
  product, 
  editForm, 
  onInputChange, 
  onSubmit, 
  onCancel, 
  categories,
  onImageChange,
  url
}) => {
  const { t } = useTranslation();
  const [showOptionsForm, setShowOptionsForm] = useState(false);
  const [activeTab, setActiveTab] = useState('basic'); // basic, translations, options, settings, availability
  const [currentOption, setCurrentOption] = useState({
    name: '',
    nameVI: '',
    nameEN: '',
    nameHU: '',
    type: 'select',
    defaultChoiceCode: '',
    choices: [],
    pricingMode: 'add'
  });
  const [editingOptionIndex, setEditingOptionIndex] = useState(-1);
  const [editingChoiceIndex, setEditingChoiceIndex] = useState(-1);
  const [currentChoice, setCurrentChoice] = useState({
    code: '',
    label: '',
    labelVI: '',
    labelEN: '',
    labelHU: '',
    price: 0,
    image: null
  });

  // Memoize initial states để tránh tạo lại object không cần thiết
  const initialOption = useMemo(() => ({
    name: '',
    nameVI: '',
    nameEN: '',
    nameHU: '',
    type: 'select',
    defaultChoiceCode: '',
    choices: [],
    pricingMode: 'add'
  }), []);

  const initialChoice = useMemo(() => ({
    code: '',
    label: '',
    labelVI: '',
    labelEN: '',
    labelHU: '',
    price: 0,
    image: null
  }), []);

  // Validate functions
  const validateOption = useCallback((option, existingOptions, editingIndex = -1) => {
    if (!option.name.trim()) {
      return t('editProduct.validation.optionNameRequired');
    }
    
    if (option.choices.length === 0) {
      return t('editProduct.validation.choiceRequired');
    }
    
    if (!option.defaultChoiceCode) {
      return t('editProduct.validation.defaultChoiceRequired');
    }
    
    // Check duplicate names
    const duplicate = existingOptions.find((opt, index) => 
      opt.name === option.name && index !== editingIndex
    );
    if (duplicate) {
      return t('editProduct.validation.optionNameExists');
    }
    
    return null;
  }, [t]);

  const validateChoice = useCallback((choice, existingChoices, editingIndex = -1) => {
    if (!choice.code.trim()) {
      return t('editProduct.validation.choiceCodeRequired');
    }
    
    if (!choice.label.trim()) {
      return t('editProduct.validation.choiceLabelRequired');
    }
    
    if (choice.price === undefined || choice.price === null || isNaN(Number(choice.price))) {
      return t('editProduct.validation.choicePriceRequired');
    }
    
    // Check duplicate codes
    const duplicate = existingChoices.find((ch, index) => 
      ch.code === choice.code && index !== editingIndex
    );
    if (duplicate) {
      return t('editProduct.validation.choiceCodeExists');
    }
    
    return null;
  }, [t]);

  // Reset functions
  const resetOptionsForm = useCallback(() => {
    setCurrentOption({ ...initialOption });
    setCurrentChoice({ ...initialChoice });
    setEditingOptionIndex(-1);
    setEditingChoiceIndex(-1);
    setShowOptionsForm(false);
  }, [initialOption, initialChoice]);

  const resetChoiceForm = useCallback(() => {
    setCurrentChoice({ ...initialChoice });
    setEditingChoiceIndex(-1);
  }, [initialChoice]);

  // Option management
  const addOption = useCallback(() => {
    const error = validateOption(currentOption, editForm.options || [], editingOptionIndex);
    if (error) {
      alert(error);
      return;
    }
    
    const updatedOptions = [...(editForm.options || [])];
    
    if (editingOptionIndex >= 0) {
      updatedOptions[editingOptionIndex] = { ...currentOption };
    } else {
      updatedOptions.push({ ...currentOption });
    }
    
    onInputChange({
      target: { name: 'options', value: updatedOptions }
    });
    
    resetOptionsForm();
    alert(editingOptionIndex >= 0 ? t('editProduct.optionUpdated') : t('editProduct.optionAdded'));
  }, [currentOption, editForm.options, editingOptionIndex, onInputChange, resetOptionsForm, validateOption, t]);

  const editOption = useCallback((index) => {
    const option = editForm.options[index];
    setCurrentOption({ ...option });
    setEditingOptionIndex(index);
    setShowOptionsForm(true);
  }, [editForm.options]);

  const deleteOption = useCallback((index) => {
    if (!window.confirm(t('editProduct.confirmDeleteOption'))) {
      return;
    }
    
    const updatedOptions = editForm.options.filter((_, i) => i !== index);
    onInputChange({
      target: { name: 'options', value: updatedOptions }
    });
    alert(t('editProduct.optionDeleted'));
  }, [editForm.options, onInputChange, t]);

  // Choice management
  const addChoice = useCallback(() => {
    const error = validateChoice(currentChoice, currentOption.choices, editingChoiceIndex);
    if (error) {
      alert(error);
      return;
    }
    
    const updatedChoices = [...currentOption.choices];
    
    if (editingChoiceIndex >= 0) {
      updatedChoices[editingChoiceIndex] = { ...currentChoice };
    } else {
      updatedChoices.push({ ...currentChoice });
    }
    
    setCurrentOption({ ...currentOption, choices: updatedChoices });
    resetChoiceForm();
    alert(editingChoiceIndex >= 0 ? t('editProduct.choiceUpdated') : t('editProduct.choiceAdded'));
  }, [currentChoice, currentOption, editingChoiceIndex, resetChoiceForm, validateChoice, t]);

  const editChoice = useCallback((index) => {
    const choice = currentOption.choices[index];
    setCurrentChoice({ ...choice });
    setEditingChoiceIndex(index);
  }, [currentOption.choices]);

  const deleteChoice = useCallback((index) => {
    if (!window.confirm(t('editProduct.confirmDeleteChoice'))) {
      return;
    }
    
    const updatedChoices = currentOption.choices.filter((_, i) => i !== index);
    const deletedChoice = currentOption.choices[index];
    
    // Reset default choice if deleted choice was the default
    const newDefaultCode = currentOption.defaultChoiceCode === deletedChoice.code 
      ? '' 
      : currentOption.defaultChoiceCode;
    
    setCurrentOption({ 
      ...currentOption, 
      choices: updatedChoices,
      defaultChoiceCode: newDefaultCode
    });
    
    alert(t('editProduct.choiceDeleted'));
  }, [currentOption, t]);

  // Event handlers
  const handleOptionChange = useCallback((field, value) => {
    setCurrentOption(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleChoiceChange = useCallback((field, value) => {
    setCurrentChoice(prev => ({ 
      ...prev, 
      [field]: field === 'price' ? parseFloat(value) || 0 : value 
    }));
  }, []);

  // Memoize image source calculation
  const imageSrc = useMemo(() => {
    if (editForm.imagePreview) {
      return editForm.imagePreview;
    }
    
    if (!product?.image) {
      return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2Y1ZjVmNSIvPjx0ZXh0IHg9IjE1MCIgeT0iMTAwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj7wn42dIE5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
    }
    
    return product.image.startsWith('http') 
      ? product.image 
      : `${url}/images/${product.image}`;
  }, [editForm.imagePreview, product?.image, url]);

  // Calculate discount
  const discountAmount = useMemo(() => {
    if (!editForm.isPromotion || !editForm.price || !editForm.promotionPrice) {
      return 0;
    }
    return parseFloat(editForm.price) - parseFloat(editForm.promotionPrice);
  }, [editForm.isPromotion, editForm.price, editForm.promotionPrice]);

  if (!isOpen || !product) return null;

  return (
    <div className="edit-product-popup-overlay" onClick={onCancel}>
      <div className="edit-product-popup" onClick={e => e.stopPropagation()}>
        <div className="edit-product-popup-header">
          <div className="header-content">
            <h2>{t('editProduct.title')}</h2>
            <p className="header-subtitle">{t('editProduct.subtitle')}</p>
          </div>
          <button 
            className="close-btn"
            onClick={onCancel}
            title={t('editProduct.close')}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="edit-product-popup-content">
          {/* Tab Navigation */}
          <div className="tab-navigation">
            <button 
              type="button"
              className={`tab-btn ${activeTab === 'basic' ? 'active' : ''}`}
              onClick={() => setActiveTab('basic')}
            >
              📝 {t('editProduct.basicInfo')}
            </button>
            <button 
              type="button"
              className={`tab-btn ${activeTab === 'translations' ? 'active' : ''}`}
              onClick={() => setActiveTab('translations')}
            >
              🌐 {t('editProduct.translations')}
            </button>
            <button 
              type="button"
              className={`tab-btn ${activeTab === 'options' ? 'active' : ''}`}
              onClick={() => setActiveTab('options')}
            >
              🔄 {t('editProduct.optionsVariants')}
            </button>
            <button 
              type="button"
              className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              ⚙️ {t('editProduct.settings')}
            </button>
            <button 
              type="button"
              className={`tab-btn ${activeTab === 'availability' ? 'active' : ''}`}
              onClick={() => setActiveTab('availability')}
            >
              🕐 {t('editProduct.timeAvailability')}
            </button>
          </div>

          <form onSubmit={onSubmit}>
            {/* BASIC TAB */}
            {activeTab === 'basic' && (
              <div className="tab-content">
                <div className="form-row-3">
                  <div className="form-group">
                    <label>{t('products.sku')} *</label>
                    <input
                      type="text"
                      name="sku"
                      value={editForm.sku || ''}
                      onChange={onInputChange}
                      required
                      placeholder={t('products.skuPlaceholder')}
                    />
                  </div>
                  <div className="form-group">
                    <label>{t('products.price')} *</label>
                    <input
                      type="number"
                      name="price"
                      value={editForm.price || ''}
                      onChange={onInputChange}
                      step="0.01"
                      min="0"
                      required
                      placeholder="0.00"
                    />
                  </div>
                  <div className="form-group">
                    <label>{t('common.quantity')} *</label>
                    <input
                      type="number"
                      name="quantity"
                      value={editForm.quantity || ''}
                      onChange={onInputChange}
                      required
                      min="0"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>{t('products.name')} *</label>
                    <input
                      type="text"
                      name="name"
                      value={editForm.name || ''}
                      onChange={onInputChange}
                      required
                      placeholder={t('products.namePlaceholder')}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>{t('products.category')} *</label>
                    <select
                      name="category"
                      value={editForm.category || ''}
                      onChange={onInputChange}
                      required
                    >
                      <option value="">{t('products.selectCategory')}</option>
                      {categories?.map(category => (
                        <option key={category._id} value={category.name}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group full-width">
                  <label>{t('products.description')}</label>
                  <textarea
                    name="description"
                    value={editForm.description || ''}
                    onChange={onInputChange}
                    rows="3"
                    placeholder={t('products.descriptionPlaceholder')}
                  />
                </div>

                <div className="form-group full-width">
                  <label>{t('editProduct.portion', 'Portion / serving')}</label>
                  <input
                    type="text"
                    name="portion"
                    value={editForm.portion || ''}
                    onChange={onInputChange}
                    placeholder="2 PCS / 2 DB"
                  />
                </div>

                <div className="form-group full-width">
                  <label>{t('editProduct.allergens', 'Allergens')}</label>
                  <div className="allergen-grid">
                    {ALLERGEN_OPTIONS.map((a) => {
                      const checked = (editForm.allergens || []).includes(a.code)
                      return (
                        <label key={a.code} className="allergen-checkbox">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const current = Array.isArray(editForm.allergens) ? editForm.allergens : []
                              const next = e.target.checked
                                ? [...current, a.code]
                                : current.filter((c) => c !== a.code)
                              onInputChange({ target: { name: 'allergens', value: next } })
                            }}
                          />
                          <span>{a.icon} {a.label}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>

                {/* Image Upload - Inline */}
                <div className="image-upload-inline">
                  <label className="upload-label">
                    {editForm.imagePreview ? t('editProduct.newImagePreview') : t('editProduct.currentImage')}
                  </label>
                  <div className="image-preview-inline">
                    <img 
                      src={imageSrc}
                      alt="Product" 
                      className="product-thumb"
                      loading="lazy"
                    />
                    <input
                      type="file"
                      id="edit-image-upload"
                      onChange={onImageChange}
                      accept="image/*"
                      className="image-input"
                    />
                    <label htmlFor="edit-image-upload" className="image-upload-btn">
                      📁 {t('editProduct.chooseNewImage')}
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* TRANSLATIONS TAB */}
            {activeTab === 'translations' && (
              <div className="tab-content">
                <p className="tab-description">{t('editProduct.translationsDescription')}</p>
                <div className="form-group">
                  <label>{t('products.nameVI')}</label>
                  <input
                    type="text"
                    name="nameVI"
                    value={editForm.nameVI || ''}
                    onChange={onInputChange}
                    placeholder={t('products.nameVIPlaceholder') || t('products.nameVI')}
                  />
                </div>
                <div className="form-group">
                  <label>{t('products.nameEN')}</label>
                  <input
                    type="text"
                    name="nameEN"
                    value={editForm.nameEN || ''}
                    onChange={onInputChange}
                    placeholder={t('products.nameENPlaceholder') || t('products.nameEN')}
                  />
                </div>
                <div className="form-group">
                  <label>{t('products.nameHU')}</label>
                  <input
                    type="text"
                    name="nameHU"
                    value={editForm.nameHU || ''}
                    onChange={onInputChange}
                    placeholder={t('products.nameHUPlaceholder') || t('products.nameHU')}
                  />
                </div>
                <div className="form-group">
                  <label>{t('products.descriptionHU')}</label>
                  <textarea
                    name="descriptionHU"
                    value={editForm.descriptionHU || ''}
                    onChange={onInputChange}
                    placeholder={t('products.descriptionHU')}
                    rows="3"
                  />
                </div>
                <div className="form-group">
                  <label>{t('products.descriptionEN')}</label>
                  <textarea
                    name="descriptionEN"
                    value={editForm.descriptionEN || ''}
                    onChange={onInputChange}
                    placeholder={t('products.descriptionEN')}
                    rows="3"
                  />
                </div>
                <div className="form-group">
                  <label>{t('products.descriptionVI')}</label>
                  <textarea
                    name="descriptionVI"
                    value={editForm.descriptionVI || ''}
                    onChange={onInputChange}
                    placeholder={t('products.descriptionVI')}
                    rows="3"
                  />
                </div>
              </div>
            )}

            {/* OPTIONS TAB */}
            {activeTab === 'options' && (
              <div className="tab-content">
                <p className="tab-description">{t('editProduct.optionsDescription')}</p>

                {/* Display existing options */}
                {editForm.options && editForm.options.length > 0 && (
                  <div className="existing-options">
                    <h4>{t('editProduct.currentOptions')}</h4>
                    <div className="options-list">
                      {editForm.options.map((option, optionIndex) => (
                        <div key={optionIndex} className="option-card">
                          <div className="option-header">
                            <div className="option-info">
                              <h5>{option.name}</h5>
                              <span className="pricing-mode">{option.pricingMode}</span>
                            </div>
                            <div className="option-actions">
                              <button 
                                type="button" 
                                onClick={() => editOption(optionIndex)}
                                className="btn btn-edit"
                              >
                                {t('editProduct.edit')}
                              </button>
                              <button 
                                type="button" 
                                onClick={() => deleteOption(optionIndex)}
                                className="btn btn-delete"
                              >
                                {t('editProduct.delete')}
                              </button>
                            </div>
                          </div>
                          
                          <div className="choices-grid">
                            {option.choices.map((choice, choiceIndex) => (
                              <div 
                                key={choiceIndex} 
                                className={`choice-card ${option.defaultChoiceCode === choice.code ? 'default' : ''}`}
                              >
                                <div className="choice-code">{choice.code}</div>
                                <div className="choice-label">{choice.label}</div>
                                <div className="choice-price">{new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(choice.price))}</div>
                                {choice.image && <div className="choice-image">📷</div>}
                                {option.defaultChoiceCode === choice.code && (
                                  <div className="default-badge">{t('editProduct.default')}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add/Edit Option Form */}
                {showOptionsForm && (
                  <div className="option-form">
                    <div className="form-header">
                      <h4>{editingOptionIndex >= 0 ? t('editProduct.editOption') : t('editProduct.addNewOption')}</h4>
                      <button 
                        type="button" 
                        onClick={resetOptionsForm}
                        className="btn btn-secondary btn-sm"
                      >
                        {t('editProduct.cancel')}
                      </button>
                    </div>
                    
                    <div className="form-row">
                      <div className="form-group">
                        <label>{t('editProduct.optionName')}</label>
                        <input
                          type="text"
                          value={currentOption.name}
                          onChange={(e) => handleOptionChange('name', e.target.value)}
                          placeholder={t('editProduct.optionNamePlaceholder')}
                        />
                      </div>
                      <div className="form-group">
                        <label>{t('editProduct.pricingMode')}</label>
                        <select
                          value={currentOption.pricingMode}
                          onChange={(e) => handleOptionChange('pricingMode', e.target.value)}
                        >
                          <option value="add">{t('editProduct.pricingModeAdd')}</option>
                          <option value="override">{t('editProduct.pricingModeOverride')}</option>
                        </select>
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>{t('editProduct.optionNameSK')}</label>
                        <input
                          type="text"
                          value={currentOption.nameHU || ''}
                          onChange={(e) => handleOptionChange('nameHU', e.target.value)}
                          placeholder={t('editProduct.optionNamePlaceholder')}
                        />
                      </div>
                      <div className="form-group">
                        <label>{t('editProduct.optionNameVI')}</label>
                        <input
                          type="text"
                          value={currentOption.nameVI || ''}
                          onChange={(e) => handleOptionChange('nameVI', e.target.value)}
                          placeholder={t('editProduct.optionNamePlaceholder')}
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>{t('editProduct.optionNameEN')}</label>
                        <input
                          type="text"
                          value={currentOption.nameEN || ''}
                          onChange={(e) => handleOptionChange('nameEN', e.target.value)}
                          placeholder={t('editProduct.optionNamePlaceholder')}
                        />
                      </div>
                    </div>

                    {/* Choices Management */}
                    <div className="choices-section">
                      <h5>{t('editProduct.choices')}</h5>
                      
                      {/* Display existing choices */}
                      {currentOption.choices.length > 0 && (
                        <div className="choices-grid">
                          {currentOption.choices.map((choice, index) => (
                            <div key={index} className="choice-card">
                              <div className="choice-code">{choice.code}</div>
                              <div className="choice-label">{choice.label}</div>
                              <div className="choice-price">{new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(choice.price))}</div>
                              {choice.image && <div className="choice-image">📷</div>}
                              <div className="choice-actions">
                                <button 
                                  type="button" 
                                  onClick={() => editChoice(index)}
                                  className="btn btn-edit btn-sm"
                                  title={t('editProduct.edit')}
                                >
                                  ✏️
                                </button>
                                <button 
                                  type="button" 
                                  onClick={() => deleteChoice(index)}
                                  className="btn btn-delete btn-sm"
                                  title={t('editProduct.delete')}
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add/Edit Choice Form */}
                      <div className="choice-form">
                        <h6>{editingChoiceIndex >= 0 ? t('editProduct.editChoice') : t('editProduct.addNewChoice')}</h6>
                        
                        <div className="form-row">
                          <div className="form-group">
                            <label>{t('editProduct.choiceCode')}</label>
                            <input
                              type="text"
                              value={currentChoice.code}
                              onChange={(e) => handleChoiceChange('code', e.target.value)}
                              placeholder={t('editProduct.choiceCodePlaceholder')}
                            />
                          </div>
                          <div className="form-group">
                            <label>{t('editProduct.choicePrice')}</label>
                            <input
                              type="number"
                              value={currentChoice.price}
                              onChange={(e) => handleChoiceChange('price', e.target.value)}
                              placeholder="0.00"
                              step="0.01"
                              min="0"
                            />
                          </div>
                        </div>

                        <div className="form-row">
                          <div className="form-group">
                            <label>{t('editProduct.choiceLabel')}</label>
                            <input
                              type="text"
                              value={currentChoice.label}
                              onChange={(e) => handleChoiceChange('label', e.target.value)}
                              placeholder={t('editProduct.choiceLabelPlaceholder')}
                            />
                          </div>
                        </div>

                        <div className="form-row">
                          <div className="form-group">
                            <label>{t('editProduct.choiceLabelSK')}</label>
                            <input
                              type="text"
                              value={currentChoice.labelHU || ''}
                              onChange={(e) => handleChoiceChange('labelHU', e.target.value)}
                              placeholder={t('editProduct.choiceLabelPlaceholder')}
                            />
                          </div>
                          <div className="form-group">
                            <label>{t('editProduct.choiceLabelVI')}</label>
                            <input
                              type="text"
                              value={currentChoice.labelVI || ''}
                              onChange={(e) => handleChoiceChange('labelVI', e.target.value)}
                              placeholder={t('editProduct.choiceLabelPlaceholder')}
                            />
                          </div>
                        </div>

                        <div className="form-row">
                          <div className="form-group">
                            <label>{t('editProduct.choiceLabelEN')}</label>
                            <input
                              type="text"
                              value={currentChoice.labelEN || ''}
                              onChange={(e) => handleChoiceChange('labelEN', e.target.value)}
                              placeholder={t('editProduct.choiceLabelPlaceholder')}
                            />
                          </div>
                        </div>

                        <div className="choice-form-actions">
                          <button 
                            type="button" 
                            onClick={addChoice}
                            className="btn btn-primary"
                          >
                            {editingChoiceIndex >= 0 ? t('editProduct.updateChoice') : t('editProduct.addChoice')}
                          </button>
                          {editingChoiceIndex >= 0 && (
                            <button 
                              type="button" 
                              onClick={resetChoiceForm}
                              className="btn btn-secondary"
                            >
                              {t('editProduct.cancelEdit')}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Default Choice Selection */}
                      {currentOption.choices.length > 0 && (
                        <div className="default-choice-section">
                          <label>{t('editProduct.defaultChoice')}</label>
                          <select
                            value={currentOption.defaultChoiceCode}
                            onChange={(e) => handleOptionChange('defaultChoiceCode', e.target.value)}
                          >
                            <option value="">{t('editProduct.selectDefaultChoice')}</option>
                            {currentOption.choices.map((choice) => (
                              <option key={choice.code} value={choice.code}>
                                {choice.code} - {choice.label} ({choice.price} Ft)
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="option-form-actions">
                      <button 
                        type="button" 
                        onClick={addOption}
                        className="btn btn-primary"
                        disabled={!currentOption.name || currentOption.choices.length === 0 || !currentOption.defaultChoiceCode}
                      >
                        {editingOptionIndex >= 0 ? t('editProduct.updateOption') : t('editProduct.addOption')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Add Option Button */}
                {!showOptionsForm && (
                  <button 
                    type="button" 
                    onClick={() => setShowOptionsForm(true)}
                    className="btn btn-success btn-add-option"
                  >
                    <span className="btn-icon" aria-hidden="true">➕</span>
                    {t('editProduct.addVariantOption')}
                  </button>
                )}
              </div>
            )}

            {/* SETTINGS TAB */}
            {activeTab === 'settings' && (
              <div className="tab-content">
                {/* Promotion */}
                <div className="settings-group">
                  <h4 className="settings-title">💰 {t('editProduct.promotion')}</h4>
                  <div className="form-group checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={editForm.isPromotion || false}
                        onChange={(e) => onInputChange({
                          target: {
                            name: 'isPromotion',
                            type: 'checkbox',
                            checked: e.target.checked
                          }
                        })}
                      />
                      {t('editProduct.enablePromotion')}
                    </label>
                  </div>
                  
                  {editForm.isPromotion && (
                    <div className="promotion-inline">
                      <div className="form-group">
                        <label>{t('editProduct.promotionPrice')}</label>
                        <input
                          type="number"
                          name="promotionPrice"
                          value={editForm.promotionPrice || ''}
                          onChange={onInputChange}
                          step="0.01"
                          min="0"
                          placeholder={t('editProduct.promotionPrice')}
                          required
                        />
                      </div>
                      
                      {discountAmount > 0 && (
                        <div className="discount-badge-inline">
                          💸 -{new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(discountAmount))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Box Fee */}
                <div className="settings-group">
                  <h4 className="settings-title">📦 {t('editProduct.boxFee')}</h4>
                  <div className="form-group checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={editForm.disableBoxFee || false}
                        onChange={(e) => onInputChange({
                          target: {
                            name: 'disableBoxFee',
                            type: 'checkbox',
                            checked: e.target.checked
                          }
                        })}
                      />
                      {t('editProduct.disableBoxFee')}
                    </label>
                  </div>
                  <div className="price-preview-compact">
                    <strong>Final Price: </strong>
                    {new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round((Number(editForm.price) || 0) + (editForm.disableBoxFee ? 0 : 160)))}
                    {!editForm.disableBoxFee && <small>(+160 Ft box)</small>}
                  </div>
                </div>

                {/* Recommendations */}
                <div className="settings-group">
                  <h4 className="settings-title">⭐ {t('editProduct.recommendations')}</h4>
                  <div className="form-group checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={editForm.isRecommended || false}
                        onChange={(e) => onInputChange({
                          target: {
                            name: 'isRecommended',
                            type: 'checkbox',
                            checked: e.target.checked
                          }
                        })}
                      />
                      {t('editProduct.showInRecommendations')}
                    </label>
                  </div>
                  
                  {editForm.isRecommended && (
                    <div className="form-group">
                      <label>{t('editProduct.recommendPriority')} (1-999)</label>
                      <input
                        type="number"
                        name="recommendPriority"
                        value={editForm.recommendPriority !== undefined ? editForm.recommendPriority : 999}
                        onChange={onInputChange}
                        min="1"
                        max="999"
                        placeholder="999"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* AVAILABILITY TAB */}
            {activeTab === 'availability' && (
              <div className="tab-content">
                <p className="tab-description">
                  {t('editProduct.timeAvailabilityDescription')}
                </p>
                
                {/* Daily Time Availability */}
                <div className="availability-group">
                  <div className="form-group checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={editForm.dailyAvailabilityEnabled || false}
                        onChange={(e) => onInputChange({
                          target: {
                            name: 'dailyAvailabilityEnabled',
                            type: 'checkbox',
                            checked: e.target.checked
                          }
                        })}
                      />
                      {t('editProduct.enableDailyAvailability')}
                    </label>
                  </div>
                  
                  {editForm.dailyAvailabilityEnabled && (
                    <div className="form-row">
                      <div className="form-group">
                        <label>{t('editProduct.dailyTimeFrom')}</label>
                        <input
                          type="time"
                          name="dailyTimeFrom"
                          value={editForm.dailyTimeFrom || ''}
                          onChange={onInputChange}
                        />
                      </div>
                      
                      <div className="form-group">
                        <label>{t('editProduct.dailyTimeTo')}</label>
                        <input
                          type="time"
                          name="dailyTimeTo"
                          value={editForm.dailyTimeTo || ''}
                          onChange={onInputChange}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Weekly Schedule */}
                <div className="availability-group">
                  <div className="form-group checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={editForm.weeklyScheduleEnabled || false}
                        onChange={(e) => onInputChange({
                          target: {
                            name: 'weeklyScheduleEnabled',
                            type: 'checkbox',
                            checked: e.target.checked
                          }
                        })}
                      />
                      {t('editProduct.enableWeeklySchedule', 'Enable Weekly Schedule')}
                    </label>
                    <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
                      {t('editProduct.weeklyScheduleHelp', 'Product will only be available on selected days of the week')}
                    </small>
                  </div>
                  
                  {editForm.weeklyScheduleEnabled && (
                    <div style={{ marginTop: '15px' }}>
                      <label style={{ fontWeight: '600', marginBottom: '10px', display: 'block' }}>
                        {t('editProduct.selectDays', 'Select Days:')}
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                        {[
                          { value: 1, label: 'Monday', labelVI: 'Thứ 2' },
                          { value: 2, label: 'Tuesday', labelVI: 'Thứ 3' },
                          { value: 3, label: 'Wednesday', labelVI: 'Thứ 4' },
                          { value: 4, label: 'Thursday', labelVI: 'Thứ 5' },
                          { value: 5, label: 'Friday', labelVI: 'Thứ 6' },
                          { value: 6, label: 'Saturday', labelVI: 'Thứ 7' },
                          { value: 0, label: 'Sunday', labelVI: 'Chủ Nhật' }
                        ].map(day => (
                          <label key={day.value} style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '5px', 
                            padding: '8px 12px',
                            backgroundColor: (editForm.weeklyScheduleDays || []).includes(day.value) ? '#1976d2' : '#fff',
                            color: (editForm.weeklyScheduleDays || []).includes(day.value) ? '#fff' : '#333',
                            borderRadius: '5px',
                            cursor: 'pointer',
                            border: '1px solid #ddd',
                            transition: 'all 0.2s'
                          }}>
                            <input
                              type="checkbox"
                              checked={(editForm.weeklyScheduleDays || []).includes(day.value)}
                              onChange={(e) => {
                                const days = editForm.weeklyScheduleDays || [];
                                const newDays = e.target.checked 
                                  ? [...days, day.value] 
                                  : days.filter(d => d !== day.value);
                                onInputChange({
                                  target: {
                                    name: 'weeklyScheduleDays',
                                    value: newDays
                                  }
                                });
                              }}
                              style={{ display: 'none' }}
                            />
                            {day.label}
                          </label>
                        ))}
                      </div>
                      {editForm.weeklyScheduleDays && editForm.weeklyScheduleDays.length > 0 && (
                        <small style={{ display: 'block', marginTop: '10px', color: '#666' }}>
                          {t('editProduct.selectedDays', 'Selected')}: {editForm.weeklyScheduleDays.length} {t('editProduct.days', 'day(s)')}
                        </small>
                      )}
                    </div>
                  )}
                </div>

                {/* Date Range Availability */}
                <div className="availability-group">
                  <label className="group-title">{t('editProduct.dateRangeAvailability')}</label>
                  <div className="form-row">
                    <div className="form-group">
                      <label>{t('editProduct.availableFromDate')}</label>
                      <input
                        type="datetime-local"
                        name="availableFrom"
                        value={editForm.availableFrom || ''}
                        onChange={onInputChange}
                      />
                    </div>
                    
                    <div className="form-group">
                      <label>{t('editProduct.availableToDate')}</label>
                      <input
                        type="datetime-local"
                        name="availableTo"
                        value={editForm.availableTo || ''}
                        onChange={onInputChange}
                      />
                    </div>
                  </div>
                </div>

                {/* Preview */}
                {(editForm.dailyAvailabilityEnabled || editForm.weeklyScheduleEnabled || editForm.availableFrom || editForm.availableTo) && (
                  <div className="availability-preview-compact">
                    <strong>⏰ Active Restrictions:</strong>
                    <ul>
                      {editForm.dailyAvailabilityEnabled && editForm.dailyTimeFrom && editForm.dailyTimeTo && (
                        <li>Daily: {editForm.dailyTimeFrom} - {editForm.dailyTimeTo}</li>
                      )}
                      {editForm.weeklyScheduleEnabled && editForm.weeklyScheduleDays && editForm.weeklyScheduleDays.length > 0 && (
                        <li>Days: {editForm.weeklyScheduleDays.sort().map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}</li>
                      )}
                      {editForm.availableFrom && (
                        <li>From: {new Date(editForm.availableFrom).toLocaleString()}</li>
                      )}
                      {editForm.availableTo && (
                        <li>Until: {new Date(editForm.availableTo).toLocaleString()}</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
            
            {/* Form Actions */}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary btn-save">
                <span className="btn-icon">💾</span>
                {t('editProduct.saveChanges')}
              </button>
              <button 
                type="button" 
                onClick={onCancel}
                className="btn btn-secondary btn-cancel"
              >
                <span className="btn-icon">❌</span>
                {t('editProduct.cancel')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EditProductPopup;