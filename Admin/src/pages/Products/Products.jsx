import React, { useState, useEffect, useMemo, useRef } from 'react'
import './Products.css'
import axios from 'axios'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'
import EditProductPopup from '../../components/EditProductPopup/EditProductPopup'
import config from '../../config/config'
import { ALLERGEN_OPTIONS, LETTER_TO_CODE } from '../../utils/allergens'

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""').trim()}"`

const CODE_TO_LETTER = Object.fromEntries(
  Object.entries(LETTER_TO_CODE).map(([letter, code]) => [code, letter])
)

const formatAllergensForExport = (codes) => {
  if (!Array.isArray(codes) || codes.length === 0) return ''
  return codes
    .map((code) => {
      const opt = ALLERGEN_OPTIONS.find((item) => item.code === code)
      const letter = CODE_TO_LETTER[code]
      if (letter && opt) return `${letter} (${opt.label})`
      return opt?.label || code
    })
    .join(', ')
}

const createInitialEditForm = () => ({
  sku: '',
  name: '',
  nameVI: '',
  nameEN: '',
  nameHU: '',
  description: '',
  descriptionVI: '',
  descriptionEN: '',
  descriptionHU: '',
  price: '',
  category: '',
  quantity: 0,
  isPromotion: false,
  promotionPrice: '',
  soldCount: 0,
  disableBoxFee: false,
  isRecommended: false,
  recommendPriority: 999,
  portion: '',
  allergens: [],
  image: null,
  imagePreview: null,
  options: [],
  // Time-based availability
  availableFrom: '',
  availableTo: '',
  dailyAvailabilityEnabled: false,
  dailyTimeFrom: '',
  dailyTimeTo: '',
  weeklyScheduleEnabled: false,
  weeklyScheduleDays: []
})

const toDateTimeLocalValue = (value) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

const normalizeWeeklyScheduleDays = (days) => {
  if (!Array.isArray(days)) return []
  const normalized = days
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  return Array.from(new Set(normalized)).sort((a, b) => a - b)
}

const cloneOptions = (options) => {
  if (!Array.isArray(options)) return []
  return options.map((option) => ({
    ...option,
    choices: Array.isArray(option.choices)
      ? option.choices.map((choice) => ({ ...choice }))
      : []
  }))
}

const Products = ({ url }) => {
  const { t } = useTranslation();
  const getErrMsg = (e, fallback) => (e && e.response && (e.response.data && (e.response.data.message || e.response.data.error))) || (e && e.message) || fallback;
  const [foodList, setFoodList] = useState([])
  const [categories, setCategories] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all') // 'all', 'active', 'inactive'
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  
  // Ref để lưu scroll position
  const scrollPositionRef = useRef(0)
  const shouldRestoreScrollRef = useRef(false)
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(12)
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  
  // Bulk actions state
  const [selectedProducts, setSelectedProducts] = useState([])
  const [selectAll, setSelectAll] = useState(false)

  // Schedule filter state
  const [scheduleFilter, setScheduleFilter] = useState('all') // 'all' | 'weekly' | 'daily'
  // Day-of-week filter for weekly tab (null = all days, 0=Sun..6=Sat)
  const [selectedWeekDay, setSelectedWeekDay] = useState(null)
  
  // Quick edit state
  const [quickEditing, setQuickEditing] = useState(null) // { productId, field: 'price' | 'quantity' }
  const [quickEditValue, setQuickEditValue] = useState('')
  const [editForm, setEditForm] = useState(() => createInitialEditForm())
  const [error, setError] = useState(null)
  const [newProduct, setNewProduct] = useState({
    sku: '',
    name: '',
    nameVI: '',
    nameEN: '',
    nameHU: '',
    slug: '',
    description: '',
    descriptionVI: '',
    descriptionEN: '',
    descriptionHU: '',
    price: '',
    category: '',
    image: null,
    quantity: 0,
    isPromotion: false,
    promotionPrice: '',
    soldCount: 0,
    disableBoxFee: false,
    isRecommended: false,
    recommendPriority: 999,
    portion: '',
    allergens: [],
    options: [], // Thêm options array
    // Time-based availability
    availableFrom: '',
    availableTo: '',
    dailyAvailabilityEnabled: false,
    dailyTimeFrom: '',
    dailyTimeTo: '',
    weeklyScheduleEnabled: false,
    weeklyScheduleDays: []
  })

  // State cho quản lý options - đơn giản hóa
  const [showOptionsForm, setShowOptionsForm] = useState(false)
  const [currentOption, setCurrentOption] = useState({
    name: '',
    defaultChoiceCode: '',
    choices: []
  })
  const [editingOptionIndex, setEditingOptionIndex] = useState(-1)
  const [editingChoiceIndex, setEditingChoiceIndex] = useState(-1)
  const [currentChoice, setCurrentChoice] = useState({
    code: '',
    label: '',
    price: 0,
    image: null
  })

  const buildEditFormFromProduct = (product) => {
    const base = createInitialEditForm()
    if (!product) return base

    return {
      ...base,
      sku: product.sku || '',
      name: product.name || '',
      nameVI: product.nameVI || '',
      nameEN: product.nameEN || '',
      nameHU: product.nameHU || '',
      description: product.description || '',
      descriptionVI: product.descriptionVI || '',
      descriptionEN: product.descriptionEN || '',
      descriptionHU: product.descriptionHU || '',
      price: product.price ?? '',
      category: product.category || '',
      quantity: Number.isFinite(Number(product.quantity)) ? Number(product.quantity) : 0,
      isPromotion: Boolean(product.isPromotion),
      promotionPrice: product.promotionPrice ?? '',
      soldCount: Number.isFinite(Number(product.soldCount)) ? Number(product.soldCount) : 0,
      disableBoxFee: Boolean(product.disableBoxFee),
      isRecommended: Boolean(product.isRecommended),
      recommendPriority: Number.isFinite(Number(product.recommendPriority)) ? Number(product.recommendPriority) : 999,
      portion: product.portion || '',
      allergens: Array.isArray(product.allergens) ? [...product.allergens] : [],
      options: cloneOptions(product.options),
      availableFrom: toDateTimeLocalValue(product.availableFrom),
      availableTo: toDateTimeLocalValue(product.availableTo),
      dailyAvailabilityEnabled: Boolean(product.dailyAvailability?.enabled),
      dailyTimeFrom: product.dailyAvailability?.timeFrom || '',
      dailyTimeTo: product.dailyAvailability?.timeTo || '',
      weeklyScheduleEnabled: Boolean(product.weeklySchedule?.enabled),
      weeklyScheduleDays: normalizeWeeklyScheduleDays(product.weeklySchedule?.days)
    }
  }

  const resetEditForm = () => {
    setEditForm(createInitialEditForm())
  }

 // useEffect - Fetch when page, filter, status, or scheduleFilter changes
useEffect(() => {
  const controller1 = new AbortController();
  const controller2 = new AbortController();
  fetchFoodList(false, controller1.signal);
  fetchCategories(controller2.signal);
  return () => { controller1.abort(); controller2.abort(); };
}, [currentPage, itemsPerPage, statusFilter, filterCategory, searchTerm, scheduleFilter]);

// useEffect để restore scroll position sau khi foodList được update
useEffect(() => {
  if (shouldRestoreScrollRef.current && !isLoading) {
    // Sử dụng requestAnimationFrame để đảm bảo DOM đã render xong
    requestAnimationFrame(() => {
      setTimeout(() => {
        window.scrollTo({
          top: scrollPositionRef.current,
          behavior: 'instant'
        });
        shouldRestoreScrollRef.current = false;
      }, 50);
    });
  }
}, [foodList, isLoading]);

const fetchFoodList = async (showToast = false, signal, preserveScroll = false) => {
  // Lưu scroll position nếu cần preserve
  if (preserveScroll) {
    scrollPositionRef.current = window.pageYOffset || document.documentElement.scrollTop;
    shouldRestoreScrollRef.current = true;
  }
  
  setIsLoading(true); setError(null);
  try {
    // Khi đang lọc theo lịch (Menu Ngày / Menu Tuần), cần lấy toàn bộ sản phẩm
    // để filter client-side hoạt động đúng trên tất cả các trang
    const isScheduleFilterActive = scheduleFilter !== 'all';

    // Build query params
    const params = new URLSearchParams();
    if (isScheduleFilterActive) {
      // Lấy tất cả sản phẩm (không phân trang) khi filter theo lịch
      params.append('noPagination', 'true');
    } else {
      params.append('page', currentPage);
      params.append('limit', itemsPerPage);
    }
    
    if (statusFilter !== 'all') params.append('status', statusFilter);
    if (filterCategory !== 'all') params.append('category', filterCategory);
    if (searchTerm.trim()) params.append('search', searchTerm.trim());
    
    const { data } = await axios.get(`${config.BACKEND_URL}/api/food/list?${params}`, { signal });
    const items = data?.data ?? [];
    setFoodList(Array.isArray(items) ? items : []);
    
    // Set pagination info from response (chỉ khi có phân trang)
    if (data.pagination && !isScheduleFilterActive) {
      setTotalItems(data.pagination.total);
      setTotalPages(data.pagination.totalPages);
    }
    
    if (showToast) toast.success(`✅ Tải ${items.length} sản phẩm (Trang ${currentPage}/${totalPages || 1})`);
  } catch (e) {
    if (axios.isCancel(e)) return;
    setError(`Failed to fetch products: ${e.message ?? 'Unknown'}`);
    toast.error(t('products.fetchError') || 'Failed to fetch products');
  } finally { 
    setIsLoading(false);
    // Scroll restoration sẽ được xử lý bởi useEffect khi foodList thay đổi
  }
};

const fetchCategories = async (signal) => {
  try {
    const { data } = await axios.get(`${config.BACKEND_URL}/api/category`, { signal });
    const items = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
    setCategories(items);
  } catch (e) {
    if (axios.isCancel(e)) return;
    setError(`Failed to fetch categories: ${e.message ?? 'Unknown'}`);
    toast.error('Failed to fetch categories');
    setCategories([]);
  }
};

// Bulk selection handlers
const handleSelectProduct = (productId) => {
  setSelectedProducts(prev =>
    prev.includes(productId)
      ? prev.filter(id => id !== productId)
      : [...prev, productId]
  );
};

const handleSelectAll = () => {
  if (selectAll) {
    setSelectedProducts([]);
  } else {
    setSelectedProducts(filteredProducts.map(p => p._id));
  }
  setSelectAll(!selectAll);
};

// Bulk actions
const handleBulkStatusChange = async (newStatus) => {
  if (selectedProducts.length === 0) {
    toast.warning('No products selected');
    return;
  }

  const confirmMsg = `Are you sure you want to ${newStatus === 'active' ? 'show' : 'hide'} ${selectedProducts.length} product(s)?`;
  if (!window.confirm(confirmMsg)) return;

  try {
    const promises = selectedProducts.map(productId =>
      axios.put(
        `${config.BACKEND_URL}/api/food/update-status/${productId}`,
        { status: newStatus }
      )
    );

    await Promise.all(promises);
    toast.success(`✅ Updated ${selectedProducts.length} product(s)`);
    setSelectedProducts([]);
    setSelectAll(false);
    fetchFoodList(false, undefined, true);
  } catch (error) {
    toast.error('Failed to update products: ' + (error.response?.data?.message || error.message));
  }
};

const handleBulkDelete = async () => {
  if (selectedProducts.length === 0) {
    toast.warning('No products selected');
    return;
  }

  const confirmMsg = `⚠️ Are you sure you want to delete ${selectedProducts.length} product(s)? This action cannot be undone.`;
  if (!window.confirm(confirmMsg)) return;

  try {
    const baseUrl = String(config.BACKEND_URL || '').replace(/\/+$/, '');
    const promises = selectedProducts.map(productId =>
      axios.delete(`${baseUrl}/api/food/remove/${encodeURIComponent(productId)}`)
    );

    await Promise.all(promises);
    toast.success(`✅ Deleted ${selectedProducts.length} product(s)`);
    setSelectedProducts([]);
    setSelectAll(false);
    fetchFoodList(false, undefined, false);
  } catch (error) {
    toast.error('Failed to delete products: ' + (error.response?.data?.message || error.message));
  }
};

// Quick edit handlers
const handleQuickEdit = (productId, field, currentValue) => {
  setQuickEditing({ productId, field });
  setQuickEditValue(String(currentValue || ''));
};

const handleQuickEditSave = async (productId) => {
  if (!quickEditing) return;

  const value = parseFloat(quickEditValue);
  if (isNaN(value) || value < 0) {
    toast.error('Please enter a valid number');
    return;
  }

  try {
    const updateData = {
      [quickEditing.field]: value
    };

    await axios.put(
      `${config.BACKEND_URL}/api/food/quick-update/${productId}`,
      updateData
    );

    toast.success(`✅ Updated ${quickEditing.field} successfully`);
    setQuickEditing(null);
    setQuickEditValue('');
    fetchFoodList(false, undefined, true);
  } catch (error) {
    toast.error('Failed to update: ' + (error.response?.data?.message || error.message));
  }
};

const handleQuickEditCancel = () => {
  setQuickEditing(null);
  setQuickEditValue('');
};

  const handleDeleteProduct = async (productId) => {
    if (!productId) {
      toast.error('Missing product id')
      return
    }
    if (!window.confirm(t('products.deleteConfirm') || 'Are you sure you want to delete this product?')) return

    const baseUrl = String(config.BACKEND_URL || '').replace(/\/+$/, '')
    const base = `${baseUrl}/api/food`
    const trials = [
      async () => axios.delete(`${base}/remove/${encodeURIComponent(productId)}`),
      async () => axios.delete(`${base}/remove`, { params: { id: productId } }),
      async () => axios.post(`${base}/remove`, { id: productId }),
      async () => axios.delete(`${base}/delete/${encodeURIComponent(productId)}`)
    ]

    let lastErr = null
    for (const run of trials) {
      try {
        const res = await run()
        const ok = (res.status >= 200 && res.status < 300) && (res.data?.success !== false)
        if (ok) {
          toast.success(t('products.deleteSuccess') || 'Product deleted successfully')
          fetchFoodList(false, undefined, true) // Preserve scroll position
          return
        }
        lastErr = new Error(res.data?.message || 'Delete not acknowledged')
      } catch (e) {
        if (e?.response && ![404, 405].includes(e.response.status)) {
          toast.error(`Failed to delete: ${e.response.status} ${e.response.data?.message || e.message}`)
          return
        }
        lastErr = e
      }
    }

    const msg = lastErr?.response
      ? `${lastErr.response.status} ${lastErr.response.data?.message || lastErr.message}`
      : (lastErr?.message || 'Unknown error')
    toast.error(`Failed to delete product: ${msg}`)
  }

  const handleEditProduct = (product) => {
    setEditingProduct(product)
    setEditForm(buildEditFormFromProduct(product))
  };

  const closeEditForm = () => {
    if (editForm.imagePreview) URL.revokeObjectURL(editForm.imagePreview);
    if (editingProduct) {
      setEditingProduct(null);
      resetEditForm();
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (type === 'checkbox') {
      setEditForm(prev => ({
        ...prev,
        [name]: checked
      }));
    } else {
      const numericFields = new Set(['price', 'quantity', 'promotionPrice', 'soldCount']);
      setEditForm(prev => ({
        ...prev,
        [name]: numericFields.has(name)
          ? (name === 'quantity' || name === 'soldCount' ? (parseInt(value) || 0) : (Number(value) || 0))
          : value
      }));
    }
  };

  const handleEditImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('Please select a valid image file')
        return
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image file size must be less than 5MB')
        return
      }
      
      setEditForm(prev => ({
        ...prev,
        image: file,
        imagePreview: URL.createObjectURL(file)
      }));
    }
  };

  const handleSubmitEdit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!editForm.sku || !editForm.sku.trim()) {
      toast.error('SKU is required')
      return
    }
    
    if (!editForm.name || !editForm.name.trim()) {
      toast.error('Product name is required')
      return
    }
    if (!(Number(editForm.price) > 0)) {
      toast.error('Valid price is required');
      return;
    }
    
    if (!editForm.category || !editForm.category.trim()) {
      toast.error('Category is required')
      return
    }
    
    if (editForm.isPromotion && (!editForm.promotionPrice || parseFloat(editForm.promotionPrice) <= 0)) {
      toast.error('Promotion price is required when promotion is enabled')
      return
    }
    
    if (editForm.isPromotion && parseFloat(editForm.promotionPrice) >= parseFloat(editForm.price)) {
      toast.error('Promotion price must be less than regular price')
      return
    }
    
    if (editForm.quantity === undefined || editForm.quantity === null || isNaN(Number(editForm.quantity)) || Number(editForm.quantity) < 0) {
      toast.error('Valid quantity is required (must be >= 0)')
      return
    }

    // Validate options if they exist
    if (editForm.options && editForm.options.length > 0) {
      for (let i = 0; i < editForm.options.length; i++) {
        const option = editForm.options[i]
        if (!option.name || !option.choices || option.choices.length === 0 || !option.defaultChoiceCode) {
          toast.error(`Option ${i + 1} is incomplete. Please check all fields.`)
          return
        }
        
        // Check if default choice exists
        const defaultChoiceExists = option.choices.find(choice => choice.code === option.defaultChoiceCode)
        if (!defaultChoiceExists) {
          toast.error(`Default choice for option "${option.name}" not found`)
          return
        }
      }
    }

    try {
      // Create FormData for file upload
      const formData = new FormData();
      
      // Append all form fields
      Object.keys(editForm).forEach(key => {
        // Skip imagePreview - it's only for UI preview
        if (key === 'imagePreview') {
          return;
        }
        
        // Skip fields that are handled explicitly below
        if (
          key === 'isPromotion' ||
          key === 'disableBoxFee' ||
          key === 'isRecommended' ||
          key === 'recommendPriority' ||
          key === 'availableFrom' ||
          key === 'availableTo' ||
          key === 'dailyAvailabilityEnabled' ||
          key === 'dailyTimeFrom' ||
          key === 'dailyTimeTo' ||
          key === 'weeklyScheduleEnabled' ||
          key === 'weeklyScheduleDays' ||
          key === 'allergens'
        ) {
          return;
        }
        
        if (key === 'image' && editForm[key] instanceof File) {
          formData.append('image', editForm[key]);
        } else if (key === 'options') {
          // Handle options separately
          if (editForm[key] && editForm[key].length > 0) {
            try {
              const safeOptions = (editForm[key] || []).map(o => ({
                ...o,
                choices: (o.choices || []).map(c => {
                  const { image, ...rest } = c;
                  return { ...rest, price: Number(rest.price) || 0 };
                })
              }));
              formData.append('options', JSON.stringify(safeOptions))
            } catch (error) {
              console.error('Error stringifying options:', error)
              toast.error('Error processing options data')
              return
            }
          }
        } else if (key !== 'image') {
          formData.append(key, editForm[key]);
        }
      });
      // Set numeric and boolean fields explicitly
      formData.set('price', String(Number(editForm.price)));          // đảm bảo là số
      formData.set('quantity', String(Number(editForm.quantity) || 0));
      formData.set('promotionPrice', String(Number(editForm.promotionPrice) || 0));
      formData.set('isPromotion', String(!!editForm.isPromotion));    // boolean -> "true"/"false"
      formData.set('disableBoxFee', String(!!editForm.disableBoxFee));    // boolean -> "true"/"false"
      formData.set('isRecommended', String(!!editForm.isRecommended));    // boolean -> "true"/"false"
      formData.set('recommendPriority', String(Number(editForm.recommendPriority) || 999));
      formData.set('portion', editForm.portion || '');
      formData.set('allergens', JSON.stringify(Array.isArray(editForm.allergens) ? editForm.allergens : []));
      
      // Time-based availability fields
      if (editForm.availableFrom) {
        formData.set('availableFrom', editForm.availableFrom);
      }
      if (editForm.availableTo) {
        formData.set('availableTo', editForm.availableTo);
      }
      if (editForm.dailyAvailabilityEnabled) {
        formData.set('dailyAvailabilityEnabled', 'true');
        if (editForm.dailyTimeFrom) {
          formData.set('dailyTimeFrom', editForm.dailyTimeFrom);
        }
        if (editForm.dailyTimeTo) {
          formData.set('dailyTimeTo', editForm.dailyTimeTo);
        }
      } else {
        formData.set('dailyAvailabilityEnabled', 'false');
      }
      if (editForm.weeklyScheduleEnabled) {
        formData.set('weeklyScheduleEnabled', 'true');
        if (editForm.weeklyScheduleDays && editForm.weeklyScheduleDays.length > 0) {
          formData.set('weeklyScheduleDays', JSON.stringify(editForm.weeklyScheduleDays));
        }
      } else {
        formData.set('weeklyScheduleEnabled', 'false');
      }
      
      // Debug: Log formData values
      console.log('🔍 Edit Form Data:', {
        disableBoxFee: editForm.disableBoxFee,
        disableBoxFeeType: typeof editForm.disableBoxFee,
        disableBoxFeeString: String(!!editForm.disableBoxFee),
        isPromotion: editForm.isPromotion
      });
      
      // Debug: Log all FormData entries
      console.log('🔍 FormData entries:');
      for (let pair of formData.entries()) {
        console.log(pair[0] + ': ' + pair[1]);
      }
      
      const response = await axios.put(`${config.BACKEND_URL}/api/food/edit/${editingProduct._id}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      console.log('🔍 Response status:', response.status);
      console.log('🔍 Response data:', response.data);
      
      if (response.data.success) {
        toast.success('Product updated successfully!');
        
        // Clean up preview URL if exists
        if (editForm.imagePreview) {
          URL.revokeObjectURL(editForm.imagePreview);
        }
        
        setEditingProduct(null);
        resetEditForm();
        fetchFoodList(false, undefined, true); // Refresh list và preserve scroll position
      } else {
        toast.error('Failed to update product: ' + response.data.message);
      }
    } catch (error) {
      console.error('❌ Edit error:', error);
      if (error.response) {
        console.error('❌ Response status:', error.response.status);
        console.error('❌ Response data:', error.response.data);
        toast.error(`Error ${error.response.status}: ${error.response.data?.message || error.response.data?.error || 'Unknown error'}`);
      } else {
        toast.error('Error updating product: ' + error.message);
      }
    }
  };

  const handleStatusToggle = async (productId, currentStatus) => {
    try {
              const response = await axios.put(`${config.BACKEND_URL}/api/food/status`, {
          id: productId,
          status: currentStatus === 'active' ? 'inactive' : 'active'
        })
      if (response.data) {
        toast.success(t('products.statusUpdateSuccess') || 'Product status updated successfully')
        fetchFoodList(false, undefined, true) // Preserve scroll position
      }
    } catch (error) {
      console.error('Error updating product status:', error)
      toast.error(`Failed to update status: ${getErrMsg(error, 'Unknown error')}`)
    }
  }

  const handleAddProduct = async (e) => {
    e.preventDefault()
    
    // Validation
    if (!newProduct.sku || !newProduct.sku.trim()) {
      toast.error('SKU is required')
      return
    }
    
    if (!newProduct.name || !newProduct.name.trim()) {
      toast.error('Product name is required')
      return
    }
    
    if (!(Number(newProduct.price) > 0)) {
      toast.error('Valid price is required');
      return;
    }
    
    
    if (!newProduct.category || !newProduct.category.trim()) {
      toast.error('Category is required')
      return
    }
    
    if (newProduct.isPromotion && (!newProduct.promotionPrice || parseFloat(newProduct.promotionPrice) <= 0)) {
      toast.error('Promotion price is required when promotion is enabled')
      return
    }
    
    if (newProduct.isPromotion && parseFloat(newProduct.promotionPrice) >= parseFloat(newProduct.price)) {
      toast.error('Promotion price must be less than regular price')
      return
    }
    
    if (newProduct.quantity === undefined || newProduct.quantity === null || isNaN(Number(newProduct.quantity)) || Number(newProduct.quantity) < 0) {
      toast.error('Valid quantity is required (must be >= 0)')
      return
    }

    // Validate options if they exist
    if (newProduct.options && newProduct.options.length > 0) {
      for (let i = 0; i < newProduct.options.length; i++) {
        const option = newProduct.options[i]
        if (!option.name || !option.choices || option.choices.length === 0 || !option.defaultChoiceCode) {
          toast.error(`Option ${i + 1} is incomplete. Please check all fields.`)
          return
        }
        
        // Check if default choice exists
        const defaultChoiceExists = option.choices.find(choice => choice.code === option.defaultChoiceCode)
        if (!defaultChoiceExists) {
          toast.error(`Default choice for option "${option.name}" not found`)
          return
        }
      }
    }

    const formData = new FormData()
          formData.append('sku', newProduct.sku)
      formData.append('name', newProduct.name)
      formData.append('nameVI', newProduct.nameVI)
      formData.append('nameEN', newProduct.nameEN)
      formData.append('nameHU', newProduct.nameHU)
      formData.append('slug', newProduct.slug)
      formData.append('description', newProduct.descriptionHU || newProduct.description)
      formData.append('descriptionVI', newProduct.descriptionVI || '')
      formData.append('descriptionEN', newProduct.descriptionEN || '')
      formData.append('descriptionHU', newProduct.descriptionHU || newProduct.description || '')
            formData.append('category', newProduct.category)
            formData.append('price', String(Number(newProduct.price)));
            formData.append('quantity', String(Number(newProduct.quantity) || 0));
            formData.append('isPromotion', String(!!newProduct.isPromotion));
            formData.append('disableBoxFee', String(!!newProduct.disableBoxFee));
            formData.append('isRecommended', String(!!newProduct.isRecommended));
            formData.append('recommendPriority', String(Number(newProduct.recommendPriority) || 999));
            
            // Debug log
            console.log('🔍 Add Product - Recommendations:', {
              isRecommended: newProduct.isRecommended,
              recommendPriority: newProduct.recommendPriority,
              formDataValue: String(!!newProduct.isRecommended)
            });
            if (newProduct.isPromotion) {
              formData.append('promotionPrice', String(Number(newProduct.promotionPrice) || 0));
            }
            formData.append('portion', newProduct.portion || '');
            formData.append('allergens', JSON.stringify(Array.isArray(newProduct.allergens) ? newProduct.allergens : []));
    
    if (newProduct.image) {
      formData.append('image', newProduct.image)
    }

    // Time-based availability
    if (newProduct.availableFrom) {
      formData.append('availableFrom', newProduct.availableFrom)
    }
    if (newProduct.availableTo) {
      formData.append('availableTo', newProduct.availableTo)
    }
    if (newProduct.dailyAvailabilityEnabled) {
      formData.append('dailyAvailabilityEnabled', 'true')
      if (newProduct.dailyTimeFrom) {
        formData.append('dailyTimeFrom', newProduct.dailyTimeFrom)
      }
      if (newProduct.dailyTimeTo) {
        formData.append('dailyTimeTo', newProduct.dailyTimeTo)
      }
    }
    if (newProduct.weeklyScheduleEnabled) {
      formData.append('weeklyScheduleEnabled', 'true')
      if (newProduct.weeklyScheduleDays && newProduct.weeklyScheduleDays.length > 0) {
        formData.append('weeklyScheduleDays', JSON.stringify(newProduct.weeklyScheduleDays))
      }
    }

    // Add options data
    if (newProduct.options && newProduct.options.length > 0) {
      try {
        const safeOptions = (newProduct.options || []).map(o => ({
          ...o,
          choices: (o.choices || []).map(c => {
            const { image, ...rest } = c;
            return { ...rest, price: Number(rest.price) || 0 };
          })
        }));
        console.log('🔍 Admin - Adding options to formData:', safeOptions)
        formData.append('options', JSON.stringify(safeOptions))
      } catch (error) {
        console.error('Error stringifying options:', error)
        toast.error('Error processing options data')
        return
      }
    } else {
      console.log('🔍 Admin - No options to add')
    }

    setIsLoading(true)
    try {
      const response = await axios.post(`${config.BACKEND_URL}/api/food/add`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      
      if (response.data) {
        toast.success('Product added successfully')
        setNewProduct({
          sku: '',
          name: '',
          nameVI: '',
          nameEN: '',
          nameHU: '',
          slug: '',
          description: '',
          descriptionVI: '',
          descriptionEN: '',
          descriptionHU: '',
          price: '',
          category: '',
          image: null,
          quantity: 0,
          isPromotion: false,
          promotionPrice: '',
          soldCount: 0,
          disableBoxFee: false,
          isRecommended: false,
          recommendPriority: 999,
          portion: '',
          allergens: [],
          options: [] // Reset options
        })
        setShowAddForm(false)
        fetchFoodList(false, undefined, true) // Preserve scroll position
      }
    } catch (error) {
      console.error('Error adding product:', error)
      toast.error(`Failed to add product: ${getErrMsg(error, 'Unknown error')})`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('Please select a valid image file')
        return
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image file size must be less than 5MB')
        return
      }
      
      setNewProduct({ ...newProduct, image: file })
    }
  }

  // Auto-generate slug from name if empty
  useEffect(() => {
    if (!newProduct.slug && newProduct.name) {
      const slug = newProduct.name
        .toLowerCase().trim().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'')
      setNewProduct(p => ({ ...p, slug }))
    }
  }, [newProduct.name])

  // Functions để quản lý Options - đơn giản hóa
  const addOption = () => {
    if (!currentOption.name.trim()) {
      toast.error('Option name is required')
      return
    }
    
    if (currentOption.choices.length === 0) {
      toast.error('At least one choice is required')
      return
    }
    
    if (!currentOption.defaultChoiceCode) {
      toast.error('Default choice is required')
      return
    }
    
    // Check if option name already exists
    const existingOption = newProduct.options.find(option => option.name === currentOption.name)
    if (existingOption && editingOptionIndex === -1) {
      toast.error('Option name already exists')
      return
    }
    
    if (editingOptionIndex >= 0) {
      // Edit existing option
      const updatedOptions = [...newProduct.options]
      updatedOptions[editingOptionIndex] = { ...currentOption }
      setNewProduct({ ...newProduct, options: updatedOptions })
      setEditingOptionIndex(-1)
    } else {
      // Add new option
      setNewProduct({ 
        ...newProduct, 
        options: [...newProduct.options, { ...currentOption }] 
      })
    }
    
    // Reset form
    setCurrentOption({
      name: '',
      defaultChoiceCode: '',
      choices: []
    })
    setShowOptionsForm(false)
    toast.success('Option added successfully')
  }

  const editOption = (index) => {
    const option = newProduct.options[index]
    setCurrentOption({ ...option })
    setEditingOptionIndex(index)
    setShowOptionsForm(true)
  }

  const deleteOption = (index) => {
    if (window.confirm('Are you sure you want to delete this option?')) {
      const updatedOptions = newProduct.options.filter((_, i) => i !== index)
      setNewProduct({ ...newProduct, options: updatedOptions })
      toast.success('Option deleted successfully')
    }
  }

  const addChoice = () => {
    if (!currentChoice.code.trim()) {
      toast.error('Choice code is required')
      return
    }
    
    if (!currentChoice.label.trim()) {
      toast.error('Choice label is required')
      return
    }
    
    if (currentChoice.price === undefined || currentChoice.price === null || isNaN(Number(currentChoice.price))) {
      toast.error('Valid choice price is required')
      return
    }
    
    // Check if choice code already exists in current option
    const existingChoice = currentOption.choices.find(choice => choice.code === currentChoice.code)
    if (existingChoice && editingChoiceIndex === -1) {
      toast.error('Choice code already exists in this option')
      return
    }
    
    if (editingChoiceIndex >= 0) {
      // Edit existing choice
      const updatedChoices = [...currentOption.choices]
      updatedChoices[editingChoiceIndex] = { ...currentChoice }
      setCurrentOption({ ...currentOption, choices: updatedChoices })
      setEditingChoiceIndex(-1)
    } else {
      // Add new choice
      setCurrentOption({ 
        ...currentOption, 
        choices: [...currentOption.choices, { ...currentChoice }] 
      })
    }
    
    // Reset choice form
    setCurrentChoice({
      code: '',
      label: '',
      price: 0,
      image: null
    })
    
    toast.success('Choice added successfully')
  }

  const editChoice = (index) => {
    const choice = currentOption.choices[index]
    setCurrentChoice({ ...choice })
    setEditingChoiceIndex(index)
  }

  const deleteChoice = (index) => {
    if (window.confirm('Are you sure you want to delete this choice?')) {
      const updatedChoices = currentOption.choices.filter((_, i) => i !== index)
      setCurrentOption({ ...currentOption, choices: updatedChoices })
      
      // Reset default choice if deleted choice was the default
      if (currentOption.defaultChoiceCode === currentOption.choices[index].code) {
        setCurrentOption({ ...currentOption, defaultChoiceCode: '' })
      }
      
      toast.success('Choice deleted successfully')
    }
  }

  const handleChoiceImageChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Please select a valid image file')
        return
      }
      
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image file size must be less than 5MB')
        return
      }
      
      setCurrentChoice({ ...currentChoice, image: file })
    }
  }

  const resetOptionsForm = () => {
    setCurrentOption({
      name: '',
      defaultChoiceCode: '',
      choices: []
    })
    setCurrentChoice({
      code: '',
      label: '',
      price: 0,
      image: null
    })
    setEditingOptionIndex(-1)
    setEditingChoiceIndex(-1)
    setShowOptionsForm(false)
  }

  const handlePromotionToggle = () => {
    setNewProduct({
      ...newProduct,
      isPromotion: !newProduct.isPromotion,
      promotionPrice: newProduct.isPromotion ? '' : ''
    })
  }

  const calculateDiscount = (originalPrice, promotionPrice) => {
    if (!originalPrice || !promotionPrice) return 0
    return Math.round(((originalPrice - promotionPrice) / originalPrice) * 100)
  }

  // Helper function to get category name from ID
  const getCategoryName = (categoryId) => {
    if (!categoryId) return null
    const category = categories.find(cat => cat._id === categoryId)
    return category ? category.name : categoryId
  }

  const handleExportCSV = async () => {
    try {
      toast.info(t('products.exporting', { defaultValue: 'Đang xuất sản phẩm...' }))

      const params = new URLSearchParams()
      params.append('noPagination', 'true')
      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (filterCategory !== 'all') params.append('category', filterCategory)
      if (searchTerm.trim()) params.append('search', searchTerm.trim())

      const { data } = await axios.get(`${config.BACKEND_URL}/api/food/list?${params}`)
      let list = Array.isArray(data?.data) ? data.data : []

      if (scheduleFilter === 'weekly') {
        list = list.filter((p) => p.weeklySchedule?.enabled === true)
        if (selectedWeekDay !== null) {
          list = list.filter(
            (p) => Array.isArray(p.weeklySchedule?.days) && p.weeklySchedule.days.includes(selectedWeekDay)
          )
        }
      } else if (scheduleFilter === 'daily') {
        list = list.filter((p) => p.dailyAvailability?.enabled === true)
      }

      if (list.length === 0) {
        toast.warning(t('products.exportEmpty', { defaultValue: 'Không có sản phẩm để xuất' }))
        return
      }

      const header = [
        t('products.category', { defaultValue: 'Danh mục' }),
        t('products.name', { defaultValue: 'Tên sản phẩm' }),
        t('products.sku', { defaultValue: 'Mã sản phẩm' }),
        t('products.price', { defaultValue: 'Giá' }),
        t('products.allergens', { defaultValue: 'Dị ứng' }),
      ]

      const rows = list.map((product) => [
        getCategoryName(product.category) || '',
        product.name || product.nameHU || product.nameEN || product.nameVI || '',
        product.sku || '',
        product.price ?? '',
        formatAllergensForExport(product.allergens),
      ])

      const csvBody = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')
      const csv = `\uFEFF${csvBody}`
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const downloadUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.setAttribute('download', 'products.csv')
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(downloadUrl)
      toast.success(
        t('products.exportSuccess', { defaultValue: 'Đã xuất {{count}} sản phẩm', count: list.length })
      )
    } catch (e) {
      toast.error(
        t('products.exportError', { defaultValue: 'Xuất file thất bại' }) + ': ' + getErrMsg(e, e.message)
      )
    }
  }

  // Backend now handles filtering and pagination, so just use the foodList directly
  // Sorting by quantity for visual priority (optional - can be removed if backend handles it)
  const filteredProducts = useMemo(() => {
    let list = [...foodList];
    // Schedule filter (client-side)
    if (scheduleFilter === 'weekly') {
      list = list.filter(p => p.weeklySchedule?.enabled === true);
      // Lọc thêm theo ngày cụ thể trong tuần nếu đã chọn
      if (selectedWeekDay !== null) {
        list = list.filter(p => Array.isArray(p.weeklySchedule?.days) && p.weeklySchedule.days.includes(selectedWeekDay));
      }
    } else if (scheduleFilter === 'daily') {
      list = list.filter(p => p.dailyAvailability?.enabled === true);
    }
    return list.sort((a, b) => {
      const qa = Number(a.quantity) || 0;
      const qb = Number(b.quantity) || 0;
      if (qa === 0 && qb !== 0) return -1;
      if (qb === 0 && qa !== 0) return 1;
      if (qa <= 5 && qb > 5) return -1;
      if (qb <= 5 && qa > 5) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [foodList, scheduleFilter, selectedWeekDay]);

  const getStatusBadge = (status) => {
    if (!status) {
      return (
        <span className="status-badge undefined" title="Undefined">
          <span className="status-icon">❓</span>
        </span>
      )
    }
    
    // Normalize status
    const normalizedStatus = status.toString().toLowerCase().trim()
    
    const statusConfig = {
      active: {
        icon: '✅',
        label: 'Active',
        className: 'active'
      },
      inactive: {
        icon: '⏸️',
        label: 'Inactive',
        className: 'inactive'
      },
      draft: {
        icon: '📝',
        label: 'Draft',
        className: 'draft'
      },
      archived: {
        icon: '📦',
        label: 'Archived',
        className: 'archived'
      }
    }
    
    const config = statusConfig[normalizedStatus] || {
      icon: '❓',
      label: status.toString().charAt(0).toUpperCase() + status.toString().slice(1),
      className: 'unknown'
    }
    
    return (
      <span className={`status-badge ${config.className}`} title={config.label}>
        <span className="status-icon">{config.icon}</span>
      </span>
    )
  }

  return (
    <div className='products-page'>
      <div className="products-header">
        <div className="header-content">
          <h1>{t('products.title', { defaultValue: 'Products Management' })}</h1>
          <p>{t('products.subtitle', { defaultValue: 'Manage your food products' })}</p>
        </div>
        <div className="header-actions">
          <button className="refresh-btn" onClick={() => fetchFoodList(true)}>
            <span>🔄</span> {t('common.refresh', { defaultValue: 'Refresh' })}
          </button>
          <button className="export-btn" onClick={handleExportCSV}>
            {t('products.exportCsv', { defaultValue: 'Xuất CSV' })}
          </button>
          <button 
            onClick={() => setShowAddForm(!showAddForm)} 
            className="btn-add-product"
          >
            {showAddForm ? t('common.cancel', { defaultValue: 'Cancel' }) : t('products.addNew', { defaultValue: 'Add New Product' })}
          </button>
        </div>
      </div>

    

      {/* Error State */}
      {error && (
        <div style={{ padding: '20px', textAlign: 'center', color: 'red', background: '#ffe6e6', margin: '10px 0', borderRadius: '5px' }}>
          <h3>Error</h3>
          <p>{error}</p>
          <button onClick={() => { setError(null); fetchFoodList(); fetchCategories(); }} style={{ padding: '10px 20px', margin: '10px' }}>
            Retry
          </button>
        </div>
      )}

      {/* No Products State */}
      {!isLoading && !error && foodList.length === 0 && (
        <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
          <h3>No products found</h3>
          <p>Try refreshing the page or check if the backend is running.</p>
          <button onClick={fetchFoodList} style={{ padding: '10px 20px', margin: '10px' }}>
            Retry
          </button>
        </div>
      )}

      {/* Add Product Form */}
      {showAddForm && (
        <div className="add-product-section">
          <h2>{t('products.addNew', { defaultValue: 'Add New Product' })}</h2>
          <form onSubmit={handleAddProduct} className="product-form">
                                <div className="form-row">
                      <div className="form-group">
                        <label htmlFor="sku">{t('products.sku', { defaultValue: 'SKU' })} *</label>
                        <input
                          type="text"
                          id="sku"
                          value={newProduct.sku}
                          onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })}
                          placeholder={t('products.skuPlaceholder')}
                          required
                        />
                      </div>
                      <div className="form-group">
                            <label>{t('products.name', { defaultValue: 'Name' })}</label>
                            <input
                                type="text"
                                value={newProduct.name}
                                onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>{t('products.nameVI', { defaultValue: 'Name (Vietnamese)' })}</label>
                            <input
                                type="text"
                                value={newProduct.nameVI}
                                onChange={(e) => setNewProduct({...newProduct, nameVI: e.target.value})}
                            />
                        </div>
                        <div className="form-group">
                            <label>{t('products.nameEN', { defaultValue: 'Name (English)' })}</label>
                            <input
                                type="text"
                                value={newProduct.nameEN}
                                onChange={(e) => setNewProduct({...newProduct, nameEN: e.target.value})}
                            />
                        </div>
                        <div className="form-group">
                            <label>{t('products.nameHU', { defaultValue: 'Name (Hungarian)' })}</label>
                            <input
                                type="text"
                                value={newProduct.nameHU}
                                onChange={(e) => setNewProduct({...newProduct, nameHU: e.target.value})}
                            />
                        </div>

                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor="descriptionHU">{t('products.descriptionHU', { defaultValue: 'Description (Hungarian)' })}</label>
                        <textarea
                          id="descriptionHU"
                          value={newProduct.descriptionHU}
                          onChange={(e) => setNewProduct({ ...newProduct, descriptionHU: e.target.value, description: e.target.value })}
                          placeholder={t('products.descriptionPlaceholder', 'Enter product description')}
                          rows="3"
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="descriptionEN">{t('products.descriptionEN', { defaultValue: 'Description (English)' })}</label>
                        <textarea
                          id="descriptionEN"
                          value={newProduct.descriptionEN}
                          onChange={(e) => setNewProduct({ ...newProduct, descriptionEN: e.target.value })}
                          placeholder={t('products.descriptionEN')}
                          rows="3"
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="descriptionVI">{t('products.descriptionVI', { defaultValue: 'Description (Vietnamese)' })}</label>
                        <textarea
                          id="descriptionVI"
                          value={newProduct.descriptionVI}
                          onChange={(e) => setNewProduct({ ...newProduct, descriptionVI: e.target.value })}
                          placeholder={t('products.descriptionVI')}
                          rows="3"
                        />
                      </div>
                    </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="category">{t('products.category', { defaultValue: 'Category' })} *</label>
                <select
                  id="category"
                  value={newProduct.category}
                  onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                  required
                >
                                  <option value="">Select Category</option>
                {categories.map(category => (
                  <option key={category._id} value={category._id}>
                    {category.name}
                  </option>
                ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="price">{t('products.price', { defaultValue: 'Price' })} *</label>
                <input
                  type="number"
                  id="price"
                  value={newProduct.price}
                  onChange={(e) => setNewProduct({ ...newProduct, price: Number(e.target.value) || 0 })}
                  placeholder="Enter price"
                  min="0"
                  step="0.01"
                  required
                />
                                      </div>
                        <div className="form-group">
                            <label>{t('products.slug', { defaultValue: 'Slug' })}</label>
                            <input
                                type="text"
                                value={newProduct.slug}
                                onChange={(e) => setNewProduct({...newProduct, slug: e.target.value})}
                                placeholder="Auto-generated from name"
                            />
                        </div>
                    </div>

                    <div className="form-row">
              <div className="form-group">
                <label htmlFor="quantity">{t('products.quantity', { defaultValue: 'Quantity' })} *</label>
                <input
                  type="number"
                  id="quantity"
                  value={newProduct.quantity}
                  onChange={(e) => setNewProduct({ ...newProduct, quantity: parseInt(e.target.value) || 0 })}
                  placeholder="Enter quantity"
                  min="0"
                  step="1"
                  required
                />
              </div>
            </div>



            <div className="form-row">
              <div className="form-group">
                <label htmlFor="image">{t('products.image', { defaultValue: 'Image' })}</label>
                <input
                  type="file"
                  id="image"
                  onChange={handleImageChange}
                  accept="image/*"
                />
              </div>
              
            </div>

            <div className="promotion-section">
              <div className="promotion-toggle">
                <label>
                  <input
                    type="checkbox"
                    checked={newProduct.isPromotion}
                    onChange={handlePromotionToggle}
                  />
                  {t('products.promotion', { defaultValue: 'Promotion' })}
                </label>
              </div>
              
              <div className="promotion-toggle">
                <label>
                  <input
                    type="checkbox"
                    checked={newProduct.disableBoxFee}
                    onChange={(e) => setNewProduct({ ...newProduct, disableBoxFee: e.target.checked })}
                  />
                  Tắt phí hệ thống (160 Ft)
                </label>
                <div style={{ 
                  marginTop: '10px', 
                  padding: '10px', 
                  backgroundColor: newProduct.disableBoxFee ? '#e8f5e9' : '#fff3e0',
                  borderRadius: '5px',
                  border: '1px solid #ddd',
                  marginLeft: '25px'
                }}>
                  <strong>Giá hiển thị cho khách hàng:</strong>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1976d2', marginTop: '5px' }}>
                    {new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round((Number(newProduct.price) || 0) + (newProduct.disableBoxFee ? 0 : 160)))}
                    {!newProduct.disableBoxFee && newProduct.price && (
                      <span style={{ fontSize: '12px', color: '#666', fontWeight: 'normal', marginLeft: '5px' }}>
                        (Giá gốc: {new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(newProduct.price) || 0)} + Phí hệ thống: 160 Ft)
                      </span>
                    )}
                    {newProduct.disableBoxFee && newProduct.price && (
                      <span style={{ fontSize: '12px', color: '#4caf50', fontWeight: 'normal', marginLeft: '5px' }}>
                        (Đã tắt phí hệ thống)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {newProduct.isPromotion && (
                <div className="promotion-fields">
                  <div className="form-row">

                    <div className="form-group">
                      <label htmlFor="promotionPrice">{t('products.promotionPrice', { defaultValue: 'Promotion Price' })} *</label>
                      <input
                        type="number"
                        id="promotionPrice"
                        value={newProduct.promotionPrice}
                        onChange={(e) => setNewProduct({ ...newProduct, promotionPrice: e.target.value })}
                        placeholder="Promotion price"
                        min="0"
                        step="0.01"
                        required={newProduct.isPromotion}
                      />
                    </div>
                  </div>
                  {newProduct.promotionPrice && (
                    <div className="discount-info">
                      <span className="discount-badge">
                        Promotion Active! Save {new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(parseFloat(newProduct.price) - parseFloat(newProduct.promotionPrice)))}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Portion & Allergens Section */}
            <div className="form-section">
              <h3>🍽️ {t('editProduct.portionAllergens', 'Portion & Allergens')}</h3>

              <div className="form-group">
                <label htmlFor="portion">{t('editProduct.portion', 'Portion / serving')}</label>
                <input
                  type="text"
                  id="portion"
                  value={newProduct.portion || ''}
                  onChange={(e) => setNewProduct({ ...newProduct, portion: e.target.value })}
                  placeholder="2 PCS / 2 DB"
                />
              </div>

              <div className="form-group">
                <label>{t('editProduct.allergens', 'Allergens')}</label>
                <div className="allergen-grid">
                  {ALLERGEN_OPTIONS.map((a) => {
                    const checked = (newProduct.allergens || []).includes(a.code)
                    return (
                      <label key={a.code} className="allergen-checkbox">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const current = Array.isArray(newProduct.allergens) ? newProduct.allergens : []
                            const next = e.target.checked
                              ? [...current, a.code]
                              : current.filter((c) => c !== a.code)
                            setNewProduct({ ...newProduct, allergens: next })
                          }}
                        />
                        <span>{a.icon} {a.label}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Recommendations Section */}
            <div className="form-section">
              <h3>⭐ {t('editProduct.recommendations')}</h3>
              <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '15px' }}>
                {t('editProduct.recommendationsDescription')}
              </p>
              
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newProduct.isRecommended || false}
                    onChange={(e) => setNewProduct({ ...newProduct, isRecommended: e.target.checked })}
                  />
                  {t('editProduct.showInRecommendations')}
                </label>
                <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
                  {t('editProduct.showInRecommendationsHelp')}
                </small>
              </div>
              
              {newProduct.isRecommended && (
                <div className="form-group">
                  <label htmlFor="recommendPriority">{t('editProduct.recommendPriority')}</label>
                  <input
                    type="number"
                    id="recommendPriority"
                    value={newProduct.recommendPriority !== undefined ? newProduct.recommendPriority : 999}
                    onChange={(e) => setNewProduct({ ...newProduct, recommendPriority: parseInt(e.target.value) || 999 })}
                    min="1"
                    max="999"
                    placeholder="999"
                  />
                  <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
                    {t('editProduct.recommendPriorityHelp')}
                  </small>
                </div>
              )}
            </div>

            {/* Time-Based Availability Section */}
            <div className="form-section time-availability-section">
              <h3>🕐 {t('editProduct.timeAvailability', 'Time-Based Availability')}</h3>
              <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '15px' }}>
                Set specific times or dates when this product should be available
              </p>
              
              {/* Daily Time Availability */}
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newProduct.dailyAvailabilityEnabled || false}
                    onChange={(e) => setNewProduct({ ...newProduct, dailyAvailabilityEnabled: e.target.checked })}
                  />
                  Enable Daily Time Availability (e.g., Lunch: 11:00-14:30)
                </label>
                <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
                  Product will only be available during this time window every day
                </small>
              </div>
              
              {newProduct.dailyAvailabilityEnabled && (
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="dailyTimeFrom">Available From (Daily)</label>
                    <input
                      type="time"
                      id="dailyTimeFrom"
                      value={newProduct.dailyTimeFrom || ''}
                      onChange={(e) => setNewProduct({ ...newProduct, dailyTimeFrom: e.target.value })}
                      placeholder="11:00"
                    />
                    <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
                      Start time (24h format)
                    </small>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="dailyTimeTo">Available Until (Daily)</label>
                    <input
                      type="time"
                      id="dailyTimeTo"
                      value={newProduct.dailyTimeTo || ''}
                      onChange={(e) => setNewProduct({ ...newProduct, dailyTimeTo: e.target.value })}
                      placeholder="14:30"
                    />
                    <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
                      End time (24h format)
                    </small>
                  </div>
                </div>
              )}

              {/* Weekly Schedule */}
              <div className="form-group" style={{ marginTop: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newProduct.weeklyScheduleEnabled || false}
                    onChange={(e) => setNewProduct({ ...newProduct, weeklyScheduleEnabled: e.target.checked })}
                  />
                  Enable Weekly Schedule (Choose days of the week)
                </label>
                <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
                  Product will only be available on selected days of the week
                </small>
              </div>

              {newProduct.weeklyScheduleEnabled && (
                <div style={{ marginTop: '15px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '5px' }}>
                  <label style={{ fontWeight: '600', marginBottom: '10px', display: 'block' }}>
                    Select Days:
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
                        backgroundColor: (newProduct.weeklyScheduleDays || []).includes(day.value) ? '#1976d2' : '#fff',
                        color: (newProduct.weeklyScheduleDays || []).includes(day.value) ? '#fff' : '#333',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        border: '1px solid #ddd',
                        transition: 'all 0.2s'
                      }}>
                        <input
                          type="checkbox"
                          checked={(newProduct.weeklyScheduleDays || []).includes(day.value)}
                          onChange={(e) => {
                            const days = newProduct.weeklyScheduleDays || [];
                            if (e.target.checked) {
                              setNewProduct({ ...newProduct, weeklyScheduleDays: [...days, day.value] });
                            } else {
                              setNewProduct({ ...newProduct, weeklyScheduleDays: days.filter(d => d !== day.value) });
                            }
                          }}
                          style={{ display: 'none' }}
                        />
                        {day.label}
                      </label>
                    ))}
                  </div>
                  {newProduct.weeklyScheduleDays && newProduct.weeklyScheduleDays.length > 0 && (
                    <small style={{ display: 'block', marginTop: '10px', color: '#666' }}>
                      Selected: {newProduct.weeklyScheduleDays.length} day(s)
                    </small>
                  )}
                </div>
              )}

              {/* Date Range Availability */}
              <div className="form-group" style={{ marginTop: '20px' }}>
                <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>
                  Date Range Availability (Optional)
                </label>
                <small style={{ display: 'block', marginBottom: '10px', color: '#666' }}>
                  Set specific start/end dates for special events or seasonal items
                </small>
                
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="availableFrom">Available From Date</label>
                    <input
                      type="datetime-local"
                      id="availableFrom"
                      value={newProduct.availableFrom || ''}
                      onChange={(e) => setNewProduct({ ...newProduct, availableFrom: e.target.value })}
                    />
                    <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
                      Product starts being available from this date/time
                    </small>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="availableTo">Available Until Date</label>
                    <input
                      type="datetime-local"
                      id="availableTo"
                      value={newProduct.availableTo || ''}
                      onChange={(e) => setNewProduct({ ...newProduct, availableTo: e.target.value })}
                    />
                    <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
                      Product stops being available after this date/time
                    </small>
                  </div>
                </div>
              </div>

              {/* Preview/Info Box */}
              {(newProduct.dailyAvailabilityEnabled || newProduct.weeklyScheduleEnabled || newProduct.availableFrom || newProduct.availableTo) && (
                <div style={{ 
                  marginTop: '15px', 
                  padding: '12px', 
                  backgroundColor: '#e3f2fd',
                  borderRadius: '5px',
                  border: '1px solid #90caf9'
                }}>
                  <strong style={{ color: '#1976d2' }}>⏰ Availability Summary:</strong>
                  <ul style={{ marginTop: '8px', marginBottom: '0', paddingLeft: '20px', color: '#555' }}>
                    {newProduct.dailyAvailabilityEnabled && newProduct.dailyTimeFrom && newProduct.dailyTimeTo && (
                      <li>Daily: {newProduct.dailyTimeFrom} - {newProduct.dailyTimeTo}</li>
                    )}
                    {newProduct.weeklyScheduleEnabled && newProduct.weeklyScheduleDays && newProduct.weeklyScheduleDays.length > 0 && (
                      <li>Days: {newProduct.weeklyScheduleDays.sort().map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}</li>
                    )}
                    {newProduct.availableFrom && (
                      <li>From: {new Date(newProduct.availableFrom).toLocaleString()}</li>
                    )}
                    {newProduct.availableTo && (
                      <li>Until: {new Date(newProduct.availableTo).toLocaleString()}</li>
                    )}
                  </ul>
                </div>
              )}
            </div>

            {/* Variant Options Section - Redesigned like Shopify */}
            <div className="options-section">
              <div className="section-header">
                <h3>🔄 Product Options & Variants</h3>
                <p>Add customizable options like protein type, size, spiciness, etc. (Similar to Shopify)</p>
              </div>

              {/* Display existing options */}
              {newProduct.options.length > 0 && (
                <div className="existing-options">
                  <h4>Current Options:</h4>
                  {newProduct.options.map((option, optionIndex) => (
                    <div key={optionIndex} className="option-item">
                      <div className="option-header">
                        <h5>{option.name}</h5>
                        <div className="option-actions">
                          <button 
                            type="button" 
                            onClick={() => editOption(optionIndex)}
                            className="btn-edit"
                          >
                            ✏️ Edit
                          </button>
                          <button 
                            type="button" 
                            onClick={() => deleteOption(optionIndex)}
                            className="btn-delete"
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </div>
                      <div className="choices-list">
                        {option.choices.map((choice, choiceIndex) => (
                          <div key={choiceIndex} className="choice-item">
                            <span className="choice-code">{choice.code}</span>
                            <span className="choice-label">{choice.label}</span>
                            <span className="choice-price">{new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(choice.price))}</span>
                            {choice.image && (
                              <div className="choice-image">
                                <img 
                                  src={
                                    choice.image.startsWith('http')
                                      ? choice.image
                                      : `${config.BACKEND_URL}/images/${choice.image}`
                                  }
                                  alt={`${choice.label} choice`}
                                  onError={(e) => {
                                    e.target.onerror = null;
                                    e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2Y1ZjVmNSIvPjx0ZXh0IHg9IjE1MCIgeT0iMTAwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJJbWFnZSBFcnJvcjwvdGV4dD48L3N2Zz4=';
                                  }}
                                  style={{ width: '30px', height: '30px', objectFit: 'cover', borderRadius: '3px' }}
                                />
                              </div>
                            )}
                            {option.defaultChoiceCode === choice.code && (
                              <span className="default-badge">Default</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Simple Add Option Form - Like Shopify */}
              {!showOptionsForm && (
                <div className="simple-option-form">
                                      <div className="form-row">
                      <div className="form-group">
                        <label>Option Name</label>
                        <input
                          type="text"
                          value={currentOption.name}
                          onChange={(e) => setCurrentOption({...currentOption, name: e.target.value})}
                          placeholder="e.g., Protein, Size, Spiciness"
                        />
                      </div>
                    </div>

                  {/* Quick Add Choices - Like Shopify */}
                  <div className="quick-choices-section">
                    <h5>Choices (Quick Add):</h5>
                    <div className="quick-choice-inputs">
                      <div className="form-row">
                        <div className="form-group">
                          <label>Choice 1</label>
                          <input
                            type="text"
                            placeholder="e.g., Chicken"
                            onChange={(e) => {
                              const choices = [...currentOption.choices]
                              if (choices[0]) {
                                choices[0].label = e.target.value
                                choices[0].code = 'a'
                              } else {
                                choices.push({ code: 'a', label: e.target.value, price: 0, image: null })
                              }
                              setCurrentOption({...currentOption, choices, defaultChoiceCode: 'a'})
                            }}
                          />
                          <input
                            type="number"
                            placeholder="Price"
                            step="0.01"
                            onChange={(e) => {
                              const choices = [...currentOption.choices]
                              if (choices[0]) {
                                choices[0].price = parseFloat(e.target.value) || 0
                              }
                              setCurrentOption({...currentOption, choices})
                            }}
                          />
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files[0];
                              if (file) {
                                const choices = [...currentOption.choices]
                                if (choices[0]) {
                                  choices[0].image = file
                                }
                                setCurrentOption({...currentOption, choices})
                              }
                            }}
                          />
                        </div>
                        <div className="form-group">
                          <label>Choice 2</label>
                          <input
                            type="text"
                            placeholder="e.g., Beef"
                            onChange={(e) => {
                              const choices = [...currentOption.choices]
                              if (choices[1]) {
                                choices[1].label = e.target.value
                                choices[1].code = 'b'
                              } else if (choices.length > 0) {
                                choices.push({ code: 'b', label: e.target.value, price: 0, image: null })
                              }
                              setCurrentOption({...currentOption, choices})
                            }}
                          />
                          <input
                            type="number"
                            placeholder="Price"
                            step="0.01"
                            onChange={(e) => {
                              const choices = [...currentOption.choices]
                              if (choices[1]) {
                                choices[1].price = parseFloat(e.target.value) || 0
                              }
                              setCurrentOption({...currentOption, choices})
                            }}
                          />
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files[0];
                              if (file) {
                                const choices = [...currentOption.choices]
                                if (choices[1]) {
                                  choices[1].image = file
                                }
                                setCurrentOption({...currentOption, choices})
                              }
                            }}
                          />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Choice 3</label>
                          <input
                            type="text"
                            placeholder="e.g., Shrimp"
                            onChange={(e) => {
                              const choices = [...currentOption.choices]
                              if (choices[2]) {
                                choices[2].label = e.target.value
                                choices[2].code = 'c'
                              } else if (choices.length > 1) {
                                choices.push({ code: 'c', label: e.target.value, price: 0, image: null })
                              }
                              setCurrentOption({...currentOption, choices})
                            }}
                          />
                          <input
                            type="number"
                            placeholder="Price"
                            step="0.01"
                            onChange={(e) => {
                              const choices = [...currentOption.choices]
                              if (choices[2]) {
                                choices[2].price = parseFloat(e.target.value) || 0
                              }
                              setCurrentOption({...currentOption, choices})
                            }}
                          />
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files[0];
                              if (file) {
                                const choices = [...currentOption.choices]
                                if (choices[2]) {
                                  choices[2].image = file
                                }
                                setCurrentOption({...currentOption, choices})
                              }
                            }}
                          />
                        </div>
                        <div className="form-group">
                          <label>Choice 4</label>
                          <input
                            type="text"
                            placeholder="e.g., Tofu"
                            onChange={(e) => {
                              const choices = [...currentOption.choices]
                              if (choices[3]) {
                                choices[3].label = e.target.value
                                choices[3].code = 'd'
                              } else if (choices.length > 2) {
                                choices.push({ code: 'd', label: e.target.value, price: 0, image: null })
                              }
                              setCurrentOption({...currentOption, choices})
                            }}
                          />
                          <input
                            type="number"
                            placeholder="Price"
                            step="0.01"
                            onChange={(e) => {
                              const choices = [...currentOption.choices]
                              if (choices[3]) {
                                choices[3].price = parseFloat(e.target.value) || 0
                              }
                              setCurrentOption({...currentOption, choices})
                            }}
                          />
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files[0];
                              if (file) {
                                const choices = [...currentOption.choices]
                                if (choices[3]) {
                                  choices[3].image = file
                                }
                                setCurrentOption({...currentOption, choices})
                              }
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Default Choice Selection */}
                    {currentOption.choices.length > 0 && (
                      <div className="default-choice-section">
                        <label>Default Choice:</label>
                        <select
                          value={currentOption.defaultChoiceCode}
                          onChange={(e) => setCurrentOption({...currentOption, defaultChoiceCode: e.target.value})}
                        >
                          <option value="">Select default choice</option>
                          {currentOption.choices.map((choice) => (
                            <option key={choice.code} value={choice.code}>
                              {choice.code} - {choice.label} ({choice.price} Ft)
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Add Option Button */}
                    <div className="option-actions">
                      <button 
                        type="button" 
                        onClick={addOption}
                        className="btn-primary"
                        disabled={!currentOption.name || currentOption.choices.length === 0 || !currentOption.defaultChoiceCode}
                      >
                        ➕ Add Option
                      </button>
                      <button 
                        type="button" 
                        onClick={resetOptionsForm}
                        className="btn-secondary"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Advanced Options Form (Hidden by default) */}
              {showOptionsForm && (
                <div className="advanced-option-form">
                  <h4>Advanced Options Editor</h4>
                  <p>Use this for complex options with images and custom codes</p>
                  
                  <div className="form-row">
                    <div className="form-group">
                      <label>Option Name *</label>
                      <input
                        type="text"
                        value={currentOption.name}
                        onChange={(e) => setCurrentOption({...currentOption, name: e.target.value})}
                        placeholder="e.g., Protein, Size, Spiciness"
                      />
                    </div>
                    <div className="form-group">
                      <label>Pricing Mode *</label>
                      <select
                        value={currentOption.pricingMode}
                        onChange={(e) => setCurrentOption({...currentOption, pricingMode: e.target.value})}
                      >
                        <option value="add">Add to base price</option>
                        <option value="override">Override base price</option>
                      </select>
                    </div>
                  </div>

                  {/* Advanced Choices Management */}
                  <div className="choices-section">
                    <h5>Advanced Choices:</h5>
                    
                    {/* Display existing choices */}
                    {currentOption.choices.length > 0 && (
                      <div className="choices-list">
                        {currentOption.choices.map((choice, index) => (
                          <div key={index} className="choice-item">
                                                    <span className="choice-code">{choice.code}</span>
                        <span className="choice-label">{choice.label}</span>
                        <span className="choice-price">{new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(choice.price))}</span>
                        {choice.image && (
                          <div className="choice-image">
                            <img 
                              src={
                                choice.image.startsWith('http')
                                  ? choice.image
                                  : `${config.BACKEND_URL}/images/${choice.image}`
                              }
                              alt={`${choice.label} choice`}
                              onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2Y1ZjVmNSIvPjx0ZXh0IHg9IjE1MCIgeT0iMTAwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJJbWFnZSBFcnJvcjwvdGV4dD48L3N2Zz4=';
                              }}
                              style={{ width: '30px', height: '30px', objectFit: 'cover', borderRadius: '3px' }}
                            />
                          </div>
                        )}
                            <div className="choice-actions">
                              <button 
                                type="button" 
                                onClick={() => editChoice(index)}
                                className="btn-edit-small"
                              >
                                ✏️
                              </button>
                              <button 
                                type="button" 
                                onClick={() => deleteChoice(index)}
                                className="btn-delete-small"
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
                      <h6>{editingChoiceIndex >= 0 ? 'Edit Choice' : 'Add New Choice'}</h6>
                      
                      <div className="form-row">
                        <div className="form-group">
                          <label>Code *</label>
                          <input
                            type="text"
                            value={currentChoice.code}
                            onChange={(e) => setCurrentChoice({...currentChoice, code: e.target.value})}
                            placeholder="e.g., a, b, c"
                          />
                        </div>
                        <div className="form-group">
                          <label>Label *</label>
                          <input
                            type="text"
                            value={currentChoice.label}
                            onChange={(e) => setCurrentChoice({...currentChoice, label: e.target.value})}
                            placeholder="e.g., Chicken, Beef, Shrimp"
                          />
                        </div>
                        <div className="form-group">
                          <label>Price *</label>
                          <input
                            type="number"
                            value={currentChoice.price}
                            onChange={(e) => setCurrentChoice({...currentChoice, price: parseFloat(e.target.value) || 0})}
                            placeholder="0.00"
                            step="0.01"
                          />
                        </div>
                      </div>

                      <div className="form-row">
                        <div className="form-group">
                          <label>Image (Optional)</label>
                          <input
                            type="file"
                            onChange={handleChoiceImageChange}
                            accept="image/*"
                          />
                        </div>
                      </div>

                      <div className="choice-actions">
                        <button 
                          type="button" 
                          onClick={addChoice}
                          className="btn-primary"
                        >
                          {editingChoiceIndex >= 0 ? 'Update Choice' : 'Add Choice'}
                        </button>
                        {editingChoiceIndex >= 0 && (
                          <button 
                            type="button" 
                            onClick={() => setEditingChoiceIndex(-1)}
                            className="btn-secondary"
                          >
                            Cancel Edit
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Default Choice Selection */}
                    {currentOption.choices.length > 0 && (
                      <div className="default-choice-section">
                        <label>Default Choice:</label>
                        <select
                          value={currentOption.defaultChoiceCode}
                          onChange={(e) => setCurrentOption({...currentOption, defaultChoiceCode: e.target.value})}
                        >
                          <option value="">Select default choice</option>
                          {currentOption.choices.map((choice) => (
                            <option key={choice.code} value={choice.code}>
                              {choice.code} - {choice.label} ({choice.price} Ft)
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="option-actions">
                    <button 
                      type="button" 
                      onClick={addOption}
                      className="btn-primary"
                      disabled={!currentOption.name || currentOption.choices.length === 0 || !currentOption.defaultChoiceCode}
                    >
                      {editingOptionIndex >= 0 ? 'Update Option' : 'Add Option'}
                    </button>
                    <button 
                      type="button" 
                      onClick={resetOptionsForm}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Toggle between Simple and Advanced */}
              <div className="options-toggle">
                <button 
                  type="button" 
                  onClick={() => setShowOptionsForm(!showOptionsForm)}
                  className="btn-toggle"
                >
                  {showOptionsForm ? '🔽 Use Simple Mode' : '🔼 Use Advanced Mode'}
                </button>
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" disabled={isLoading} className="btn-primary">
                {isLoading ? t('common.loading', { defaultValue: 'Loading' }) : t('products.addNew', { defaultValue: 'Add New Product' })}
              </button>
              <button 
                type="button" 
                onClick={() => setShowAddForm(false)} 
                className="btn-secondary"
              >
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Status Filter Tabs */}
      <div className="status-filter-tabs">
        <button
          className={`status-tab ${statusFilter === 'all' && scheduleFilter === 'all' ? 'active' : ''}`}
          onClick={() => { setStatusFilter('all'); setScheduleFilter('all'); }}
        >
          <span className="tab-icon">📦</span>
          All Products
          <span className="tab-count">({foodList.length})</span>
        </button>
        <button
          className={`status-tab ${statusFilter === 'active' ? 'active' : ''}`}
          onClick={() => { setStatusFilter('active'); setScheduleFilter('all'); }}
        >
          <span className="tab-icon">✅</span>
          Active
          <span className="tab-count">({foodList.filter(p => {
            const status = p.status ? p.status.toString().toLowerCase().trim() : ''
            return status === 'active' || status === ''
          }).length})</span>
        </button>
        <button
          className={`status-tab ${statusFilter === 'inactive' ? 'active' : ''}`}
          onClick={() => { setStatusFilter('inactive'); setScheduleFilter('all'); }}
        >
          <span className="tab-icon">⏸️</span>
          Inactive
          <span className="tab-count">({foodList.filter(p => {
            const status = p.status ? p.status.toString().toLowerCase().trim() : ''
            return status === 'inactive'
          }).length})</span>
        </button>
        <button
          className={`status-tab ${scheduleFilter === 'weekly' ? 'active schedule-tab' : 'schedule-tab'}`}
          onClick={() => { setScheduleFilter('weekly'); setStatusFilter('all'); setSelectedWeekDay(null); }}
          title="Hiển thị sản phẩm có lịch theo tuần (Weekly Schedule)"
        >
          <span className="tab-icon">📅</span>
          Menu Tuần
          <span className="tab-count">({foodList.filter(p => p.weeklySchedule?.enabled === true).length})</span>
        </button>
        <button
          className={`status-tab ${scheduleFilter === 'daily' ? 'active schedule-tab' : 'schedule-tab'}`}
          onClick={() => { setScheduleFilter('daily'); setStatusFilter('all'); setSelectedWeekDay(null); }}
          title="Hiển thị sản phẩm có giờ phục vụ hàng ngày (Daily Availability)"
        >
          <span className="tab-icon">🕐</span>
          Menu Ngày
          <span className="tab-count">({foodList.filter(p => p.dailyAvailability?.enabled === true).length})</span>
        </button>
      </div>

      {/* Day-of-week picker – hiện khi đang ở tab Menu Tuần */}
      {scheduleFilter === 'weekly' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
          padding: '10px 16px', background: '#f0f9ff',
          border: '1px solid #bae6fd', borderRadius: '10px', marginBottom: '12px'
        }}>
          <span style={{ fontWeight: 600, color: '#0369a1', fontSize: '13px', whiteSpace: 'nowrap' }}>📅 Xem menu ngày:</span>
          {[
            { label: 'Tất cả', value: null },
            { label: 'T2', value: 1 },
            { label: 'T3', value: 2 },
            { label: 'T4', value: 3 },
            { label: 'T5', value: 4 },
            { label: 'T6', value: 5 },
            { label: 'T7', value: 6 },
            { label: 'CN', value: 0 },
          ].map(day => {
            const count = day.value === null
              ? foodList.filter(p => p.weeklySchedule?.enabled === true).length
              : foodList.filter(p => p.weeklySchedule?.enabled === true && Array.isArray(p.weeklySchedule?.days) && p.weeklySchedule.days.includes(day.value)).length;
            const isActive = selectedWeekDay === day.value;
            return (
              <button
                key={String(day.value)}
                onClick={() => setSelectedWeekDay(day.value)}
                style={{
                  padding: '5px 12px', borderRadius: '20px', border: '1.5px solid',
                  borderColor: isActive ? '#0284c7' : '#cbd5e1',
                  background: isActive ? '#0284c7' : '#fff',
                  color: isActive ? '#fff' : '#334155',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '13px', cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                {day.label} <span style={{ opacity: 0.7, fontSize: '11px' }}>({count})</span>
              </button>
            );
          })}
        </div>
      )}
      


      {/* Filters and Search */}
      <div className="filters-section">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search products by name or category..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1); // Reset to page 1 on search
            }}
            className="search-input"
          />
        </div>
        <div className="filter-box">
          <select
            value={filterCategory}
            onChange={(e) => {
              const value = e.target.value === 'all'
                ? 'all'
                : (e.target.value || '').trim();
              setFilterCategory(value || 'all');
              setCurrentPage(1); // Reset to page 1 on filter change
            }}
            className="filter-select"
          >
            <option value="all">All Categories</option>
            {categories.map(category => (
              <option 
                key={category._id || category.name}
                value={category.name?.trim() || category._id}
              >
                {category.name || '(No name)'}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-box">
          <label style={{ marginRight: '10px', fontSize: '14px', fontWeight: '500' }}>Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1); // Reset to page 1 on status change
            }}
            className="filter-select"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Bulk Actions Toolbar */}
      {filteredProducts.length > 0 && (
        <div className="bulk-actions-bar">
          <div className="bulk-select-all">
            <input
              type="checkbox"
              id="select-all"
              checked={selectAll}
              onChange={handleSelectAll}
              className="bulk-checkbox"
            />
            <label htmlFor="select-all">
              {selectAll ? `Selected ${selectedProducts.length}` : 'Select All'}
            </label>
          </div>

          {selectedProducts.length > 0 && (
            <div className="bulk-actions">
              <span className="bulk-count">{selectedProducts.length} selected</span>
              <button
                onClick={() => handleBulkStatusChange('active')}
                className="bulk-btn bulk-show"
                title="Show selected products"
              >
                👁️ Show
              </button>
              <button
                onClick={() => handleBulkStatusChange('inactive')}
                className="bulk-btn bulk-hide"
                title="Hide selected products"
              >
                🚫 Hide
              </button>
              <button
                onClick={handleBulkDelete}
                className="bulk-btn bulk-delete"
                title="Delete selected products"
              >
                🗑️ Delete
              </button>
              <button
                onClick={() => { setSelectedProducts([]); setSelectAll(false); }}
                className="bulk-btn bulk-cancel"
                title="Clear selection"
              >
                ✖️ Clear
              </button>
            </div>
          )}
        </div>
      )}

      {/* Products Grid */}
      <div className="products-section">
        {isLoading ? (
          <div className="loading">Loading products...</div>
        ) : (
          <div className="products-grid">
            {filteredProducts.map((product) => {
              // Debug log for test product
              if (product.name === 'test') {
                console.log(`DEBUG - Rendering test product: ${product.name}, status: "${product.status}", filter: ${statusFilter}`)
              }
            return (
              <div key={product._id} className={`product-card ${selectedProducts.includes(product._id) ? 'selected' : ''}`}>
                <div className="product-select-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedProducts.includes(product._id)}
                    onChange={() => handleSelectProduct(product._id)}
                    className="product-checkbox"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div className="product-image">
                  <img 
                    src={
                      product.image && product.image.startsWith('http')
                        ? product.image
                        : product.image 
                          ? `${config.BACKEND_URL}/images/${product.image}`
                          : 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2Y1ZjVmNSIvPjx0ZXh0IHg9IjE1MCIgeT0iMTAwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5ObyBJbWFnZTwvdGV4dD48L3N2Zz4='
                    }
                    alt={product.name || 'Product'} 
                    loading="lazy"
                    decoding="async"
                    onError={(e) => { e.target.onerror = null; e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2Y1ZjVmNSIvPjx0ZXh0IHg9IjE1MCIgeT0iMTAwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSBFcnJvcjwvdGV4dD48L3N2Zz4='; }}
                    style={{ width: '100%', height: '180px', objectFit: 'cover' }}
                  />
                  <div className="product-overlay">
                    {(product.quantity || 0) === 0 && (
                      <div className="out-of-stock-badge">
                        <span className="out-of-stock-icon">🚫</span>
                        Out of Stock
                      </div>
                    )}
                  </div>
                </div>
                <div className="product-content">
                  <div className="product-header">
                    <h3>{product.name || product.nameVI || product.nameEN || product.nameHU || 'Unnamed Product'}</h3>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                      <span className="product-sku">SKU: {product.sku || 'N/A'}</span>
                      {product.weeklySchedule?.enabled && (
                        <span style={{ fontSize: '11px', background: '#e0f2fe', color: '#0369a1', borderRadius: '4px', padding: '1px 6px', fontWeight: 600 }}>📅 Menu Tuần</span>
                      )}
                      {product.dailyAvailability?.enabled && (
                        <span style={{ fontSize: '11px', background: '#fef3c7', color: '#92400e', borderRadius: '4px', padding: '1px 6px', fontWeight: 600 }}>🕐 {product.dailyAvailability.timeFrom}–{product.dailyAvailability.timeTo}</span>
                      )}
                    </div>
                  </div>
                  <div className="product-info">
                    <p className="product-category">{getCategoryName(product.category) || 'No Category'}</p>
                    {product.description && (
                      <p className="product-description">{product.description}</p>
                    )}
                    <div className="product-quantity quick-edit-field">
                      <span className="quantity-label">Stock:</span>
                      {quickEditing?.productId === product._id && quickEditing?.field === 'quantity' ? (
                        <div className="quick-edit-input-group">
                          <input
                            type="number"
                            value={quickEditValue}
                            onChange={(e) => setQuickEditValue(e.target.value)}
                            className="quick-edit-input"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleQuickEditSave(product._id);
                              if (e.key === 'Escape') handleQuickEditCancel();
                            }}
                          />
                          <button onClick={() => handleQuickEditSave(product._id)} className="quick-edit-save" title="Save">✓</button>
                          <button onClick={handleQuickEditCancel} className="quick-edit-cancel" title="Cancel">✕</button>
                        </div>
                      ) : (
                        <span 
                          className={`quantity-value editable ${(product.quantity || 0) === 0 ? 'out-of-stock' : (product.quantity || 0) <= 5 ? 'low-stock' : 'in-stock'}`}
                          onClick={() => handleQuickEdit(product._id, 'quantity', product.quantity)}
                          title="Click to edit"
                        >
                          {product.quantity || 0} ✏️
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="product-pricing">
                    {product.isPromotion && product.promotionPrice ? (
                      <div className="promotion-pricing">
                        <div className="original-price">{new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(product.price))}</div>
                        <div className="promotion-price">{new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(product.promotionPrice))}</div>
                        <div className="discount-badge">
                          Save {new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(parseFloat(product.price) - parseFloat(product.promotionPrice)))}
                        </div>
                      </div>
                    ) : (
                      <div className="regular-price-wrapper quick-edit-field">
                        {quickEditing?.productId === product._id && quickEditing?.field === 'price' ? (
                          <div className="quick-edit-input-group">
                            <input
                              type="number"
                              step="1"
                              value={quickEditValue}
                              onChange={(e) => setQuickEditValue(e.target.value)}
                              className="quick-edit-input price-input"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleQuickEditSave(product._id);
                                if (e.key === 'Escape') handleQuickEditCancel();
                              }}
                            />
                            <span className="currency-symbol">Ft</span>
                            <button onClick={() => handleQuickEditSave(product._id)} className="quick-edit-save" title="Save">✓</button>
                            <button onClick={handleQuickEditCancel} className="quick-edit-cancel" title="Cancel">✕</button>
                          </div>
                        ) : (
                          <div 
                            className="regular-price editable"
                            onClick={() => handleQuickEdit(product._id, 'price', product.price)}
                            title="Click to edit"
                          >
                            {new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(product.price) || 0)} ✏️
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Display variant options if available - Compact view */}
                    {product.options && product.options.length > 0 && (
                      <div className="variant-options">
                        <span className="variant-label">{product.options.length} Variant{product.options.length > 1 ? 's' : ''}</span>
                        {product.options.slice(0, 1).map((option, optionIndex) => (
                          <div key={optionIndex} className="variant-option">
                            <span className="variant-name">{option.name}:</span>
                            <div className="variant-choices">
                              {option.choices.slice(0, 3).map((choice, choiceIndex) => (
                                <div key={choiceIndex} className="variant-choice">
                                  <span className="choice-label">{choice.label}</span>
                                  {Number(choice.price) !== 0 && (
                                    <span className="choice-price">+{new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(choice.price))}</span>
                                  )}
                                </div>
                              ))}
                              {option.choices.length > 3 && (
                                <span className="variant-choice" style={{ background: 'transparent', border: 'none', padding: 0, color: '#6b7280' }}>
                                  +{option.choices.length - 3} more
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="product-actions">
                    <button
                      onClick={() => handleEditProduct(product)}
                      className="btn-edit"
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      onClick={() => handleDeleteProduct(product._id)}
                      className="btn-delete"
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {!isLoading && totalPages > 0 && (
        <div className="pagination-section" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px',
          background: 'white',
          borderRadius: '10px',
          marginTop: '20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <div className="pagination-info" style={{ fontSize: '14px', color: '#666' }}>
            Hiển thị {foodList.length > 0 ? ((currentPage - 1) * itemsPerPage + 1) : 0} - {Math.min(currentPage * itemsPerPage, totalItems)} của {totalItems} sản phẩm
          </div>
          
          <div className="pagination-controls" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              style={{
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '5px',
                background: currentPage === 1 ? '#f5f5f5' : 'white',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                opacity: currentPage === 1 ? 0.5 : 1
              }}
            >
              ⏮️ Đầu
            </button>
            
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              style={{
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '5px',
                background: currentPage === 1 ? '#f5f5f5' : 'white',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                opacity: currentPage === 1 ? 0.5 : 1
              }}
            >
              ◀️ Trước
            </button>
            
            <span style={{ padding: '0 15px', fontWeight: 'bold', color: '#333' }}>
              Trang {currentPage} / {totalPages}
            </span>
            
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              style={{
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '5px',
                background: currentPage === totalPages ? '#f5f5f5' : 'white',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                opacity: currentPage === totalPages ? 0.5 : 1
              }}
            >
              Sau ▶️
            </button>
            
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              style={{
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '5px',
                background: currentPage === totalPages ? '#f5f5f5' : 'white',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                opacity: currentPage === totalPages ? 0.5 : 1
              }}
            >
              Cuối ⏭️
            </button>
          </div>
          
          <div className="items-per-page" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontSize: '14px', color: '#666' }}>Items/trang:</label>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1); // Reset to page 1 when changing items per page
              }}
              style={{
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              <option value={10}>10</option>
              <option value={12}>12</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      )}

      {/* Edit Product Popup */}
      <EditProductPopup
        isOpen={!!editingProduct}
        product={editingProduct}
        editForm={editForm}
        onInputChange={handleInputChange}
        onSubmit={handleSubmitEdit}
        onCancel={closeEditForm}
        categories={categories}
        onImageChange={handleEditImageChange}
        url={url}
      />

      {/* Summary Stats */}
      <div className="products-summary">
        <div className="summary-card">
          <h3>{t('dashboard.totalProducts', { defaultValue: 'Total Products' })}</h3>
          <p>{foodList.length}</p>
        </div>
        <div className="summary-card">
          <h3>{t('dashboard.activeProducts', { defaultValue: 'Active Products' })}</h3>
          <p>{foodList.filter(p => {
            const st = (p.status || '').toString().toLowerCase().trim();
            return st === 'active' || st === '';
          }).length}</p>
        </div>
        <div className="summary-card">
          <h3>{t('dashboard.categories', { defaultValue: 'Categories' })}</h3>
          <p>{categories.length}</p>
        </div>
        <div className="summary-card">
          <h3>{t('dashboard.totalStock', { defaultValue: 'Total Stock' })}</h3>
          <p>{foodList.reduce((sum, product) => sum + (Number(product.quantity) || 0), 0)}</p>
        </div>
        <div className="summary-card">
          <h3>{t('dashboard.lowStockItems', { defaultValue: 'Low Stock Items' })}</h3>
          <p>{foodList.filter(product => (product.quantity || 0) <= 5 && (product.quantity || 0) > 0).length}</p>
        </div>
        <div className="summary-card">
          <h3>{t('dashboard.outOfStock', { defaultValue: 'Out of Stock' })}</h3>
          <p>{foodList.filter(product => (product.quantity || 0) === 0).length}</p>
        </div>
                <div className="summary-card">
          <h3>{t('dashboard.averagePrice', { defaultValue: 'Average Price' })}</h3>
          <p>
{new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(
  foodList.length
    ? Math.round(foodList.reduce((s, p) => {
        let totalPrice = Number(p.price) || 0;
        if (p.options && p.options.length > 0) {
          p.options.forEach(option => {
            if (option.choices && option.choices.length > 0) {
              const avgVariantPrice = option.choices.reduce((sum, choice) => sum + (Number(choice.price) || 0), 0) / option.choices.length;
              totalPrice += avgVariantPrice;
            }
          });
        }
        return s + totalPrice;
      }, 0) / foodList.length)
    : 0
)}
</p>
        </div>
      </div>


    </div>
  )
}

export default Products 