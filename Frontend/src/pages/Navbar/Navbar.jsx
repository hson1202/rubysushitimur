import { useContext, useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import './Navbar.css'
import {assets} from '../../assets/assets'
import {Link, useNavigate, useLocation} from 'react-router-dom'
import { StoreContext } from '../../Context/StoreContext'
import { useAuth } from '../../Context/AuthContext'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../../components/LanguageSwitcher/LanguageSwitcher'
import config from '../../config/config'
import { getOptimizedImageUrl } from '../../utils/imageUtils'


const Navbar = ({ setShowLogin }) => {
    
    const { t } = useTranslation();
    const [menu,setMenu]=useState("home");
    const { isMobileMenuOpen, setIsMobileMenuOpen, restaurantInfo } = useContext(StoreContext);
    const { user, logout: authLogout, isAuthenticated } = useAuth();
    const location = useLocation();
    
    const navigate = useNavigate();
    const url = config.BACKEND_URL;
    const logout = () => {
        authLogout();
        navigate("/");
        setIsMobileMenuOpen(false);
    }

    // Update active menu based on current location
    useEffect(() => {
        const path = location.pathname;
        if (path === '/') setMenu("menu");
        else if (path === '/menu') setMenu("menu");
        else if (path === '/track-order') setMenu("track");
        else setMenu("");
    }, [location]);

    // Close mobile menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (isMobileMenuOpen && !event.target.closest('.navbar')) {
                setIsMobileMenuOpen(false);
            }
        };

        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [isMobileMenuOpen, setIsMobileMenuOpen]);

    const toggleMobileMenu = () => {
        setIsMobileMenuOpen(!isMobileMenuOpen);
    };

    const handleNavLinkClick = (menuItem) => {
        setMenu(menuItem);
        setIsMobileMenuOpen(false);
    };

    const handleLoginClick = () => {
        setShowLogin(true);
        setIsMobileMenuOpen(false);
    };
  
    return (
        <div className='navbar-wrapper'>
            <div className='navbar'>
                <a href={config.EXTERNAL_LINKS.HOME} onClick={() => handleNavLinkClick("home")}>
                    <div className="logo-frame">
                        {restaurantInfo?.logoUrl && (
                            <img
                                src={restaurantInfo.logoUrl}
                                alt={restaurantInfo?.restaurantName || ''}
                                className='logo'
                            />
                        )}
                    </div>
                </a>

            {/* Mobile center language switcher */}
            <div className="mobile-lang-center">
                <LanguageSwitcher />
            </div>

            {/* Desktop Menu */}
            <ul className='navbar-menu desktop-menu'>
                <Link to='/menu' onClick={()=>setMenu("menu")} className={menu==="menu"?"active":""}>{t('nav.menu')}</Link>
                {isAuthenticated && user?.role === 'admin' && (
                    <Link
                        to='/admin'
                        onClick={() => setMenu("admin")}
                        className={menu === "admin" ? "active" : ""}
                    >
                        {t('nav.admin') || 'Admin'}
                    </Link>
                )}
            </ul>
            
            {/* Mobile Menu Overlay */}
            <div className={`mobile-menu-overlay ${isMobileMenuOpen ? 'active' : ''}`}>
                <ul className='navbar-menu mobile-menu'>
                    <Link to='/menu' onClick={() => handleNavLinkClick("menu")} className={menu==="menu"?"active":""}>{t('nav.menu')}</Link>
                    
                    {/* Account Section in Mobile Menu */}
                    <div className="mobile-account-section">
                        <div className="mobile-account-divider"></div>
                        <div className="mobile-account-title">{t('nav.account')}</div>
                        
                        {!isAuthenticated ? (
                            <button onClick={handleLoginClick} className="mobile-login-btn">
                                {t('common.login')}
                            </button>
                        ) : (
                            <div className="mobile-account-options">
                                <button 
                                    onClick={() => {
                                        navigate('/account');
                                        setIsMobileMenuOpen(false);
                                    }}
                                    className="mobile-account-btn"
                                >
                                    <img src={assets.profile_icon} alt="" />
                                    <span>{t('nav.myAccount') || 'My Account'}</span>
                                </button>
                                <button 
                                    onClick={() => {
                                        navigate('/myorders');
                                        setIsMobileMenuOpen(false);
                                    }}
                                    className="mobile-account-btn"
                                >
                                    <img src={assets.bag_icon} alt="" />
                                    <span>{t('nav.myOrders')}</span>
                                </button>
                                <button onClick={logout} className="mobile-account-btn">
                                    <img src={assets.logout_icon} alt="" />
                                    <span>{t('common.logout')}</span>
                                </button>
                            </div>
                        )}
                    </div>
                </ul>
            </div>
        
            <div className="navbar-right">
                {/* Desktop language switcher */}
                <LanguageSwitcher />
                {/* Desktop Login Button - Hidden on Mobile */}
                {!isAuthenticated ? (
                    <button onClick={()=>setShowLogin(true)} className="login-btn desktop-login-btn">
                        {t('common.login')}
                    </button>
                ) : (
                    <div className="navbar-profile desktop-profile">
                        {user?.avatarUrl ? (
                            <img
                                src={getOptimizedImageUrl(user.avatarUrl, url, { width: 40, height: 40, crop: 'fill', gravity: 'face' })}
                                alt={user.name}
                                className="navbar-avatar"
                                onError={(e) => {
                                    e.target.onerror = null;
                                    e.target.src = assets.profile_icon;
                                }}
                            />
                        ) : (
                            <img src={assets.profile_icon} alt='' />
                        )}
                        <span className="navbar-user-name">
                            {user?.name || t('account.profile.user') || 'User'}
                        </span>
                        <ul className="nav-profile-dropdown">
                            <li onClick={()=>{navigate('/account'); setIsMobileMenuOpen(false);}}>
                                <img src={assets.profile_icon} alt="" />
                                <p>{t('nav.myAccount') || 'My Account'}</p>
                            </li>
                            <li onClick={()=>{navigate('/account/orders'); setIsMobileMenuOpen(false);}}>
                                <img src={assets.bag_icon} alt="" />
                                <p>{t('nav.myOrders')}</p>
                            </li>
                            <hr />
                            <li onClick={logout}>
                                <img src={assets.logout_icon} alt="" />
                                <p>{t('common.logout')}</p>
                            </li>
                        </ul>
                    </div>
                )}

                {/* Hamburger Menu Button - stays on the far right on mobile */}
                <button 
                    className={`hamburger-menu ${isMobileMenuOpen ? 'active' : ''}`}
                    onClick={toggleMobileMenu}
                    aria-label={t('nav.toggleMenu') || 'Toggle menu'}
                >
                    <span></span>
                    <span></span>
                    <span></span>
                </button>
            </div>
            </div>
        </div>
  )
}

Navbar.propTypes = {
    setShowLogin: PropTypes.func.isRequired,
}

export default Navbar