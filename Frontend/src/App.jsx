import React , { useState, useEffect, useContext }from 'react'
import Navbar from './pages/Navbar/Navbar';
import { Route, Routes, Navigate } from 'react-router-dom';
import Menu from './pages/Menu/Menu'
// import Blog from './pages/Blog/Blog'
// import BlogDetail from './pages/Blog/BlogDetail'
import ContactUs from './pages/ContactUs/ContactUs'
import Cart from './pages/Cart/Cart'
import PlaceOrder from './pages/PlaceOrder/PlaceOrder';
import Footer from './components/Footer/Footer';
import LoginPopup from'./components/LoginPopup/LoginPopup';
import DeliveryInfoPopup from './components/DeliveryInfoPopup/DeliveryInfoPopup';
import MyOrders from './pages/MyOrders/MyOrders'
import TrackOrder from './pages/TrackOrder/TrackOrder'
import Admin from './pages/Admin/Admin'
import FloatingCartBtn from './components/FloatingCartBtn/FloatingCartBtn'
import RestaurantClosedBanner from './components/RestaurantClosedBanner/RestaurantClosedBanner'
import RequireAuth from './components/RequireAuth/RequireAuth'
import AccountLayout from './pages/Account/AccountLayout'
import ProfilePage from './pages/Account/ProfilePage'
import ChangePasswordPage from './pages/Account/ChangePasswordPage'
import AddressBookPage from './pages/Account/AddressBookPage'
import AccountOrdersPage from './pages/Account/AccountOrdersPage'
import ExternalRedirect from './components/ExternalRedirect/ExternalRedirect'
import config from './config/config'
import i18n from './i18n';
import { StoreContext } from './Context/StoreContext';

const App = () => {

  const [showLogin,setShowLogin]=useState(false)
  const [showDeliveryInfo, setShowDeliveryInfo] = useState(false)
  const { restaurantInfo } = useContext(StoreContext);

  // Dynamically update browser tab title and favicon from admin settings
  useEffect(() => {
    if (!restaurantInfo) return;
    if (restaurantInfo.restaurantName) {
      document.title = restaurantInfo.restaurantName;
    }
    // Keep browser tab icon aligned with current restaurant information.
    // Prefer logoUrl from restaurant info and fall back to faviconUrl.
    const faviconHref = restaurantInfo.logoUrl || restaurantInfo.faviconUrl;
    if (faviconHref) {
      let link = document.getElementById('favicon');
      if (!link) {
        link = document.createElement('link');
        link.id = 'favicon';
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      const version = restaurantInfo.updatedAt || restaurantInfo.logoUrl || restaurantInfo.faviconUrl;
      const separator = faviconHref.includes('?') ? '&' : '?';
      link.href = `${faviconHref}${separator}v=${encodeURIComponent(version)}`;
    }
  }, [restaurantInfo]);

  // Sync HTML language class for font switching (e.g., Montserrat for Vietnamese)
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;

    const handleLanguageChange = (lng) => {
      if (!root || !lng) return;

      // Handle 'vi' and variants like 'vi-VN'
      const isVietnamese = lng === 'vi' || lng.startsWith('vi-');

      if (isVietnamese) {
        root.classList.add('lang-vi');
      } else {
        root.classList.remove('lang-vi');
      }
    };

    // Initialize on first load
    handleLanguageChange(i18n.language || i18n.resolvedLanguage);

    // Listen to language changes
    i18n.on('languageChanged', handleLanguageChange);

    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
  }, []);

  return (
    <>
    {showLogin?<LoginPopup setShowLogin={setShowLogin}/>:<></>}
    {showDeliveryInfo ? <DeliveryInfoPopup setShowDeliveryInfo={setShowDeliveryInfo} /> : null}
    <Navbar setShowLogin={setShowLogin} setShowDeliveryInfo={setShowDeliveryInfo}/>
    <RestaurantClosedBanner />
    <div className='app'>
      <Routes>
        <Route path='/' element={<Menu/>}/>
        <Route path='/home' element={<ExternalRedirect to={config.EXTERNAL_LINKS.HOME} />}/>
        <Route path='/menu' element={<Menu/>}/>
        <Route path='/about' element={<ExternalRedirect to={config.EXTERNAL_LINKS.ABOUT} />}/>
        {/* <Route path='/blog' element={<Blog/>}/> */}
        {/* <Route path='/blog/:slug' element={<BlogDetail/>}/> */}
        <Route path='/contact' element={<ContactUs/>}/>
        <Route path='/reservation' element={<ExternalRedirect to={config.EXTERNAL_LINKS.RESERVATION} />}/>
        <Route path='/cart' element={<Cart/>}/>
        <Route path='/order' element={<PlaceOrder/>}/>
        <Route path='/myorders' element={<MyOrders />} />
        <Route path='/track-order' element={<TrackOrder />} />
        <Route path='/admin' element={<Admin />} />
        
        {/* Account routes - protected */}
        <Route 
          path='/account' 
          element={
            <RequireAuth setShowLogin={setShowLogin}>
              <AccountLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/account/profile" replace />} />
          <Route path='profile' element={<ProfilePage />} />
          <Route path='password' element={<ChangePasswordPage />} />
          <Route path='addresses' element={<AddressBookPage />} />
          <Route path='orders' element={<AccountOrdersPage />} />
        </Route>

      </Routes>
    </div>
    <Footer setShowDeliveryInfo={setShowDeliveryInfo}/>
    <FloatingCartBtn />
    </>
  )
}

export default App;