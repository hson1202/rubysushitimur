import React, { useState, useEffect } from 'react'
import { Route, Routes, Navigate } from 'react-router-dom'
import axios from 'axios'
import Dashboard from './pages/Dashboard/Dashboard'
import Orders from './pages/Orders/Orders'
import Category from './pages/Category/Category'
import Products from './pages/Products/Products'
import Users from './pages/Users/Users'
import Permissions from './pages/Permissions/Permissions'
import Blog from './pages/Blog/Blog'
import Reservations from './pages/Reservations/Reservations'
import Messages from './pages/Messages/Messages'
import EmailTest from './pages/EmailTest/EmailTest'
import Login from './pages/Login/Login'
import DeliveryZones from './pages/DeliveryZones/DeliveryZones'
import RestaurantInfo from './pages/RestaurantInfo/RestaurantInfo'
import PageContent from './pages/PageContent/PageContent'
import ErrorLogs from './pages/ErrorLogs/ErrorLogs'
import MainLayout from './components/Layout/MainLayout'
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './i18n';
import config from './config/config';
import useRestaurantBranding from './hooks/useRestaurantBranding';

const App = () => {
  const url = config.BACKEND_URL
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  useRestaurantBranding();

  useEffect(() => {
    let isMounted = true;

    const validateSession = async () => {
      const token = localStorage.getItem('adminToken');

      if (!token) {
        if (isMounted) {
          setIsAuthenticated(false);
          setLoading(false);
        }
        return;
      }

      try {
        await axios.get(`${url}/api/admin/session`, {
          headers: { token }
        });
        if (isMounted) {
          setIsAuthenticated(true);
        }
      } catch (error) {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
        if (isMounted) {
          setIsAuthenticated(false);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    validateSession();

    return () => {
      isMounted = false;
    };
  }, [url]);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontSize: '18px',
        color: '#64748b'
      }}>
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div>
        <ToastContainer />
        <Routes>
          <Route path='/admin/login' element={<Login url={url} setIsAuthenticated={setIsAuthenticated} />} />
          <Route path='*' element={<Navigate to="/admin/login" replace />} />
        </Routes>
      </div>
    );
  }

  return (
    <div className="app-root">
      <ToastContainer
        position="top-right"
        style={{ marginTop: '60px', zIndex: 9999 }}
        toastStyle={{
          fontSize: '14px',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
        }}
      />

      <MainLayout setIsAuthenticated={setIsAuthenticated}>
        <Routes>
          <Route path='/admin' element={<Dashboard url={url} />} />
          <Route path='/admin/orders' element={<Orders url={url} />} />
          <Route path='/admin/category' element={<Category url={url} />} />
          <Route path='/admin/products' element={<Products url={url} />} />
          <Route path='/admin/users' element={<Users url={url} />} />
          <Route path='/admin/permissions' element={<Permissions url={url} />} />
          <Route path='/admin/blog' element={<Blog url={url} />} />
          <Route path='/admin/reservations' element={<Reservations url={url} />} />
          <Route path='/admin/delivery-zones' element={<DeliveryZones url={url} />} />
          <Route path='/admin/restaurant-info' element={<RestaurantInfo url={url} />} />
          <Route path='/admin/delivery-info' element={<PageContent url={url} />} />
          <Route path='/admin/messages' element={<Messages url={url} />} />
          <Route path='/admin/email-test' element={<EmailTest url={url} />} />
          <Route path='/admin/error-logs' element={<ErrorLogs url={url} />} />
          <Route path='/admin/login' element={<Navigate to="/admin" replace />} />
          <Route path='*' element={<Navigate to="/admin" replace />} />
        </Routes>
      </MainLayout>
    </div>
  )
}

export default App