import { createContext,useEffect,useState,useCallback } from "react";
import axios from "axios"
import config from "../config/config"
import i18n from "../i18n"
import { getRestaurantStatus, normalizeWeeklyHours, isRestaurantOpen } from "../utils/restaurantHours"
import { setActiveRestaurantTimeZone } from "../utils/timeZone"
import { dishDisplayName, isDishOrderBlocked } from "../utils/orderAvailability"

export const CART_ITEMS_KEY = "ruby_cart_items"
export const CART_DATA_KEY = "ruby_cart_items_data"
export const CHECKOUT_DRAFT_KEY = "ruby_checkout_draft"

const readJsonStorage = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key)
        if (!raw) return fallback
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed
        }
    } catch (error) {
        console.error("Failed to read stored cart:", error)
    }
    return fallback
}

export const hasCartQuantities = (items) =>
    Object.values(items || {}).some((qty) => Number(qty) > 0)

export const hasStoredCartItems = () =>
    hasCartQuantities(readJsonStorage(CART_ITEMS_KEY, {}))

export const StoreContext= createContext(null)

const StoreContextProvider =(props)=>{

    
    const [cartItems,setCartItems] = useState(() => readJsonStorage(CART_ITEMS_KEY, {}));
    const [cartItemsData, setCartItemsData] = useState(() => readJsonStorage(CART_DATA_KEY, {})); // Store full item data including options
    const url = config.BACKEND_URL
    const [token,setToken]=useState("")
    const [food_list,setFoodList]=useState([]);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isLoadingFood, setIsLoadingFood] = useState(false);
    const [foodPagination, setFoodPagination] = useState(null);
    const [boxFee, setBoxFee] = useState(160); // Default box fee in HUF, fetched from backend
    const [systemFee, setSystemFee] = useState(0); // Delivery system fee in HUF, fetched from backend
    const [restaurantInfo, setRestaurantInfo] = useState(null);
    const [restaurantInfoLoading, setRestaurantInfoLoading] = useState(true);
    const [restaurantOpenStatus, setRestaurantOpenStatus] = useState(null);

    const updateRestaurantOpenStatus = useCallback((info) => {
        if (!info) {
            setRestaurantOpenStatus(null);
            return;
        }
        setActiveRestaurantTimeZone(info.timeZone);
        const weeklyHours = normalizeWeeklyHours(info.weeklyHours);
        const lang = (i18n.language || 'vi').split('-')[0];
        setRestaurantOpenStatus(getRestaurantStatus(weeklyHours, lang));
    }, []);

    const addToCart =async (itemId, itemData = null) =>{
        if (restaurantInfo) {
            const weeklyHours = normalizeWeeklyHours(restaurantInfo.weeklyHours);
            if (!isRestaurantOpen(weeklyHours)) {
                const lang = (i18n.language || 'vi').split('-')[0];
                const status = getRestaurantStatus(weeklyHours, lang);
                window.alert(status.message || 'Restaurant is closed');
                return false;
            }
        }

        const productId = String(itemId).split('_')[0]
        const liveProduct = food_list.find((product) => String(product._id) === productId)
        const source = liveProduct || itemData
        if (source && isDishOrderBlocked(source)) {
            window.alert(i18n.t('food.cannotOrder', { name: dishDisplayName(source) }))
            return false
        }
        if (liveProduct && Number.isFinite(Number(liveProduct.quantity))) {
            const inCart = Object.entries(cartItems).reduce((sum, [key, qty]) => {
                if (String(key).split('_')[0] !== productId) return sum
                return sum + (Number(qty) || 0)
            }, 0)
            if (inCart + 1 > Number(liveProduct.quantity)) {
                window.alert(i18n.t('food.cannotOrder', { name: dishDisplayName(liveProduct) }))
                return false
            }
        }

        if (!cartItems[itemId]) {  
            setCartItems((prev)=>({...prev,[itemId]:1}))  
        }  
        else {  
            setCartItems((prev)=>({...prev,[itemId]:prev[itemId]+1}))  
        } 
        
        // Store full item data if provided
        if (itemData) {
            setCartItemsData((prev) => ({
                ...prev,
                [itemId]: itemData
            }))
        }
        
        if (token){
            // For now, just send itemId. In the future, you might want to send options data
            await axios.post(url+"/api/cart/add",{itemId},{headers:{token}})
        }
        return true;
    }  
  
    const removeFromCart = async(itemId) => {
        setCartItems((prev)=>({...prev,[itemId]:prev[itemId]-1}))  
        
        // Remove item data if quantity becomes 0
        if (cartItems[itemId] <= 1) {
            setCartItemsData((prev) => {
                const newData = { ...prev }
                delete newData[itemId]
                return newData
            })
        }
        
        if (token) {
            await axios.post(url+"/api/cart/remove",{itemId},{headers:{token}})
        }
    }  

    const getTotalCartAmount=()=>{
        let totalAmount =0;
        for(const itemId in cartItems)
            {
                if(cartItems[itemId]>0){
                // Try to get item info from cartItemsData first (for items with options)
                let itemInfo = cartItemsData[itemId];
                
                // If not in cartItemsData, fall back to food_list
                if (!itemInfo) {
                    // Extract actual product ID (before the underscore for items with options)
                    const actualProductId = itemId.split('_')[0];
                    itemInfo = food_list.find((product)=>product._id===actualProductId)
                }
                
                if (itemInfo) {
                    // Tính giá gốc (chưa bao gồm box fee)
                    let basePrice = 0;
                    
                    // Nếu có currentPrice, kiểm tra xem đã bao gồm box fee chưa
                    // currentPrice từ ProductDetail đã bao gồm box fee, nên ta cần tính lại từ giá gốc
                    if (itemInfo.options && itemInfo.options.length > 0 && itemInfo.selectedOptions) {
                        basePrice = itemInfo.price || 0;
                        
                        Object.entries(itemInfo.selectedOptions).forEach(([optionName, choiceCode]) => {
                            const option = itemInfo.options.find(opt => opt.name === optionName);
                            if (option) {
                                const choice = option.choices.find(c => c.code === choiceCode);
                                if (choice) {
                                    if (option.pricingMode === 'override') {
                                        basePrice = choice.price;
                                    } else if (option.pricingMode === 'add') {
                                        basePrice += choice.price;
                                    }
                                }
                            }
                        });
                    } else {
                        // Nếu không có options, dùng promotion price hoặc regular price
                        basePrice = itemInfo.isPromotion && itemInfo.promotionPrice ? itemInfo.promotionPrice : (itemInfo.price || 0);
                    }
                    
                    // Kiểm tra giá có hợp lệ không
                    if (isNaN(Number(basePrice)) || Number(basePrice) < 0) {
                        basePrice = 0;
                    }
                    
                    // Thêm tiền hộp nếu không tắt
                    // Check rõ ràng: chỉ tắt khi disableBoxFee === true (explicitly true)
                    // Xử lý nhiều trường hợp: boolean true, string "true", number 1, hoặc bất kỳ truthy value nào
                    const isBoxFeeDisabled = itemInfo.disableBoxFee === true || 
                                           itemInfo.disableBoxFee === "true" || 
                                           itemInfo.disableBoxFee === 1 || 
                                           itemInfo.disableBoxFee === "1" ||
                                           (typeof itemInfo.disableBoxFee === 'string' && itemInfo.disableBoxFee.toLowerCase() === 'true');
                    const itemBoxFee = isBoxFeeDisabled ? 0 : boxFee;
                    const finalPrice = Number(basePrice) + itemBoxFee;
                    
                    // Debug log
                    if (isBoxFeeDisabled) {
                        console.log('🔍 Box fee disabled for item:', itemId, itemInfo.name, 'disableBoxFee:', itemInfo.disableBoxFee);
                    }
                    
                    totalAmount += finalPrice * cartItems[itemId];
                }
                }
            }
            return totalAmount;
    }

    const fetchFoodList = async (page = 1, append = false) => {
        setIsLoadingFood(true);
        try {
            // Load all products for user (better UX, faster filtering)
            // If you have many products and want pagination, change noPagination to false and add &page=${page}&limit=20
            const response = await axios.get(url + "/api/food/list?forUser=true&noPagination=true");
            
            if (append) {
                // Append for infinite scroll (if pagination enabled)
                setFoodList(prev => [...prev, ...(response.data.data || [])]);
            } else {
                // Replace for initial load or refresh
                setFoodList(response.data.data || []);
            }
            
            setFoodPagination(response.data.pagination || null);
        } catch (error) {
            console.error('Error fetching food list:', error);
            setFoodList([]);
        } finally {
            setIsLoadingFood(false);
        }
    }
    
    const loadMoreFood = async () => {
        if (!foodPagination || !foodPagination.hasMore || isLoadingFood) return;
        await fetchFoodList(foodPagination.page + 1, true);
    }
    
    const fetchRestaurantInfo = async ({ silent = false } = {}) => {
        try {
            if (!silent) setRestaurantInfoLoading(true);
            const response = await axios.get(url + "/api/restaurant-info");
            if (response.data.success) {
                setActiveRestaurantTimeZone(response.data.data?.timeZone);
                setRestaurantInfo(response.data.data);
                updateRestaurantOpenStatus(response.data.data);
            }
        } catch (error) {
            console.error('Error fetching restaurant info:', error);
        } finally {
            if (!silent) setRestaurantInfoLoading(false);
        }
    }

    const fetchDeliveryFees = async () => {
        try {
            const response = await axios.get(url + "/api/delivery/restaurant-location");
            if (response.data.success && response.data.data) {
                const nextBoxFee = response.data.data.boxFee;
                if (nextBoxFee !== undefined && nextBoxFee !== null) {
                    setBoxFee(Number(nextBoxFee));
                }

                const nextSystemFee = response.data.data.systemFee;
                if (nextSystemFee !== undefined && nextSystemFee !== null) {
                    setSystemFee(Number(nextSystemFee));
                }
            }
        } catch (error) {
            console.error('Error fetching delivery fees:', error);
            // Keep defaults if fetch fails
        }
    }
    
    const persistCart = (items, data) => {
        try {
            localStorage.setItem(CART_ITEMS_KEY, JSON.stringify(items || {}))
            localStorage.setItem(CART_DATA_KEY, JSON.stringify(data || {}))
        } catch (error) {
            console.error('Failed to persist cart:', error)
        }
    }

    const clearCart = useCallback(() => {
        setCartItems({})
        setCartItemsData({})
        try {
            localStorage.removeItem(CART_ITEMS_KEY)
            localStorage.removeItem(CART_DATA_KEY)
            localStorage.removeItem(CHECKOUT_DRAFT_KEY)
            sessionStorage.removeItem(CHECKOUT_DRAFT_KEY)
        } catch (error) {
            console.error('Failed to clear stored cart:', error)
        }
    }, [])

    const loadCartData = async (token) => {
        try {
            const response = await axios.post(url+"/api/cart/get",{},{headers:{token}});
            const remoteCart = response.data.cartData || {};
            setCartItems((prev) => {
                // Local cart (with options / guest items) is the source of truth on refresh.
                if (hasCartQuantities(prev)) return prev;
                if (hasCartQuantities(remoteCart)) return remoteCart;
                return prev;
            });
        } catch (error) {
            console.error('Error loading cart data:', error);
            // Keep the locally restored cart if the backend cart cannot be loaded.
        }
    }

    // Verify token with backend
    const verifyToken = async (token) => {
        try {
            const response = await axios.get(url + "/api/user/verify", {
                headers: { token }
            });
            return response.data.success === true;
        } catch (error) {
            console.error('Token verification failed:', error);
            return false;
        }
    }

    // Debug function to check token status
    const debugToken = () => {
        console.log('🔍 Current token in context:', token);
        console.log('🔍 Token in localStorage:', localStorage.getItem("token"));
        console.log('🔍 Token exists in context:', !!token);
        console.log('🔍 Token exists in localStorage:', !!localStorage.getItem("token"));
    }

    useEffect(()=>{
        async function loadData(){
            await fetchRestaurantInfo();
            await fetchFoodList();
            await fetchDeliveryFees(); // Fetch delivery fees from restaurant settings
            
            // Check for token in localStorage
            const localToken = localStorage.getItem("token");
            if (localToken) {
                console.log('🔄 Found token in localStorage, verifying...');
                
                // Verify token with backend before using it
                const isValid = await verifyToken(localToken);
                
                if (isValid) {
                    console.log('✅ Token is valid, loading user data...');
                    setToken(localToken);
                    await loadCartData(localToken);
                } else {
                    console.log('❌ Token is invalid or expired, clearing...');
                    // Token is invalid or expired, clear it — keep the local cart
                    localStorage.removeItem("token");
                    setToken("");
                }
            } else {
                console.log('ℹ️ No token found in localStorage');
            }
        }
        loadData();
    },[])

    useEffect(() => {
        persistCart(cartItems, cartItemsData)
    }, [cartItems, cartItemsData])

    useEffect(() => {
        const handleStorageChange = (e) => {
            if (e.key === CART_ITEMS_KEY && e.newValue) {
                try {
                    const parsed = JSON.parse(e.newValue)
                    if (parsed && typeof parsed === "object") setCartItems(parsed)
                } catch (error) {
                    console.error('Failed to sync cart items from another tab:', error)
                }
            }
            if (e.key === CART_DATA_KEY && e.newValue) {
                try {
                    const parsed = JSON.parse(e.newValue)
                    if (parsed && typeof parsed === "object") setCartItemsData(parsed)
                } catch (error) {
                    console.error('Failed to sync cart data from another tab:', error)
                }
            }
        }
        window.addEventListener("storage", handleStorageChange)
        return () => window.removeEventListener("storage", handleStorageChange)
    }, [])

    useEffect(() => {
        updateRestaurantOpenStatus(restaurantInfo);
    }, [restaurantInfo, updateRestaurantOpenStatus]);

    useEffect(() => {
        const interval = setInterval(() => {
            updateRestaurantOpenStatus(restaurantInfo);
        }, 60000);
        return () => clearInterval(interval);
    }, [restaurantInfo, updateRestaurantOpenStatus]);

    useEffect(() => {
        const interval = setInterval(() => {
            fetchRestaurantInfo({ silent: true });
        }, 60000);
        return () => clearInterval(interval);
    }, [url, updateRestaurantOpenStatus]);

    useEffect(() => {
        const handleLanguageChange = () => updateRestaurantOpenStatus(restaurantInfo);
        i18n.on('languageChanged', handleLanguageChange);
        return () => i18n.off('languageChanged', handleLanguageChange);
    }, [restaurantInfo, updateRestaurantOpenStatus]);

    const contextValue = {
        food_list,  
        cartItems,  
        cartItemsData,
        setCartItems,
        setCartItemsData,
        clearCart,
        addToCart,  
        removeFromCart,
        getTotalCartAmount,
        url,
        token,
        setToken,
        isMobileMenuOpen,
        setIsMobileMenuOpen,
        isLoadingFood,
        foodPagination,
        loadMoreFood,
        fetchFoodList,
        boxFee,  // Dynamic box fee from restaurant settings
        systemFee,
        restaurantInfo,
        restaurantInfoLoading,
        restaurantOpenStatus,
        isRestaurantOpenNow: restaurantOpenStatus?.isOpen ?? true,
        deliveryEnabled: restaurantInfo?.deliveryEnabled !== false
    }

    return (
        <StoreContext.Provider value={contextValue}>
            {props.children}
        </StoreContext.Provider>
    )
}

export default StoreContextProvider