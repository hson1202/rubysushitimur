// Configuration file for backend URLs
const normalizeBackendUrl = (url) => {
  if (!url) return url;
  const trimmed = String(url).trim().replace(/\/$/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const getBackendUrl = () => {
  // Always prioritize VITE_BACKEND_URL from environment variables
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_BACKEND_URL) {
    return normalizeBackendUrl(import.meta.env.VITE_BACKEND_URL);
  }
  
  // If no env variable, use defaults based on mode
  const isProduction = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.MODE === 'production';
  
  if (isProduction) {
    // In production, VITE_BACKEND_URL should be set in environment variables
    console.warn('⚠️ VITE_BACKEND_URL not set in production! Using localhost fallback. Please set VITE_BACKEND_URL in your environment variables.');
    return 'http://localhost:4000'; // Fallback, but should not happen in production
  }
  
  // Development mode: default to localhost
  return 'http://localhost:4000';
};

const config = {
  // Backend URL - read from VITE_BACKEND_URL env variable, fallback to localhost in dev
  BACKEND_URL: getBackendUrl(),
  
  // API endpoints
  API_ENDPOINTS: {
    FOOD: '/api/food',
    CATEGORY: '/api/category',
    USER: '/api/user',
    CART: '/api/cart',
    ORDER: '/api/order',
    BLOG: '/api/blog',
    CONTACT: '/api/contact',
    RESERVATION: '/api/reservation',
    ADMIN: '/api/admin'
  },
  
  // Image paths
  IMAGE_PATHS: {
    FOOD: '/images',      // For food images
    BLOG: '/uploads',     // For blog images
    CATEGORY: '/images'   // For category images
  },

  // Wooden background for food images (transparent PNGs)
  FOOD_BACKGROUND_URL: 'https://pub-e3da109533764cb29410b35fc1bd8b42.r2.dev/ruby/background.jpg',

  // Main Ruby Sushi website (order app links out for non-order pages)
  EXTERNAL_LINKS: {
    HOME: 'https://budaors.rubysushi.hu/',
    ABOUT: 'https://budaors.rubysushi.hu/Home/About',
    RESERVATION: 'https://budaors.rubysushi.hu/Home/Booking',
  },
};

export default config;
