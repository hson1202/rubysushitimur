import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import './Home.css'
import Header from '../../components/Header/Header';
import ExploreMenu from '../../components/ExploreMenu/ExploreMenu';
import FoodDisplay from '../../components/FoodDisplay/FoodDisplay';
import TodaySpecialMenu from '../../components/TodaySpecialMenu/TodaySpecialMenu';
import ProductDetail from '../../components/ProductDetail/ProductDetail';
import { aboutImages, teamImages } from '../../assets/assets';
import config from '../../config/config';
import useRestaurantInfo from '../../hooks/useRestaurantInfo';

import axios from 'axios';

const Home = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { restaurantInfo, loading: infoLoading } = useRestaurantInfo()
  const [category, setCategory] = useState("All");
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);

  // 🖼️ EASY IMAGE REPLACEMENT - Thay đổi hình ảnh ở đây
  // Có sẵn: back1, back2, back3, back4, back5, back6, back7, back8, back9, back10, back11, back12, back13, back14, back15, back16
  // Team: food_1, food_2, food_3, food_4, food_5, food_6, food_7, food_8, food_9, food_10, food_11, food_12, food_13, food_14, food_15, food_16, food_17, food_18, food_19, food_20, food_21, food_22, food_23, food_24, food_25, food_26, food_27, food_28, food_29, food_30, food_31, food_32
  const IMAGES = {
    hero: aboutImages.back1,           // Hero image - hình chính
    story: aboutImages.back4,          // Story image - hình câu chuyện
    mission: aboutImages.back6,        // Mission image - hình sứ mệnh
    team: {
      chef: teamImages.chef,           // Chef Minh
      manager: teamImages.manager,     // Ms. Linh
      operations: teamImages.operations // Mr. An
    }
  }

  // 💡 QUICK CHANGE - Thay đổi nhanh hình ảnh:
  // IMAGES.hero = aboutImages.back2;        // Đổi hero thành back2
  // IMAGES.story = aboutImages.back8;       // Đổi story thành back8
  // IMAGES.mission = aboutImages.back12;    // Đổi mission thành back12
  // IMAGES.team.chef = teamImages.food_4;   // Đổi chef thành food_4

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${config.BACKEND_URL}/api/category`);
      setCategories(response.data.data || response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching categories:', error);
      setLoading(false);
    }
  };

  const handleViewDetails = (product) => {
    setSelectedProduct(product);
  };

  const closeProductDetail = () => {
    setSelectedProduct(null);
  };

  return (
    <div>
      <Header />
      <ExploreMenu
        category={category}
        setCategory={setCategory}
        categories={categories}
        loading={loading}
      />

      {/* Menu Hôm Nay - Món Ăn Theo Khung Giờ */}
      <TodaySpecialMenu />

      <FoodDisplay category={category} onViewDetails={handleViewDetails} />

      {/* Product Detail Popup */}
      {selectedProduct && (
        <ProductDetail
          product={selectedProduct}
          onClose={closeProductDetail}
        />
      )}

      {/* About Us Section */}
      <div className='about-us-section' id='about-us'>
        {/* Hero Section */}
        <div className="about-hero">
          <div className="hero-content">
            <h1 className="hero-title">
              {t('about.heroTitle', { name: restaurantInfo?.restaurantName || '' })}
            </h1>
            <p className="hero-subtitle">
              {restaurantInfo?.foundingYear
                ? t('about.heroSubtitle', { year: restaurantInfo.foundingYear })
                : t('about.heroSubtitleNoYear', 'Bringing authentic flavors to your table')}
            </p>
            <div className="hero-stats">
              <div className="stat-item">
                <span className="stat-number">4+</span>
                <span className="stat-label">Years of Excellence</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">1000+</span>
                <span className="stat-label">Happy Customers</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">50+</span>
                <span className="stat-label">Authentic Dishes</span>
              </div>
            </div>
          </div>
          <div className="hero-image">
            <div className="image-placeholder">
              <img
                src={IMAGES.hero}
                alt={restaurantInfo?.restaurantName || 'Restaurant'}
                className="hero-img"
              />
            </div>
          </div>
        </div>

        {/* Story Section */}
        <div className="about-section story-section">
          <div className="section-content">
            <div className="section-text">
              <h2>Our Story</h2>
              <p>
                {t('about.storyParagraph1', { name: restaurantInfo?.restaurantName || 'Our restaurant' })}
              </p>
              <p>
                What started as a humble kitchen serving traditional pho and banh mi has grown into a beloved
                destination for food lovers seeking authentic Vietnamese flavors. Our recipes have been passed down
                through generations, preserving the authentic taste of Vietnam.
              </p>
              <div className="story-highlights">
                <div className="highlight-item">
                  <span className="highlight-icon">🏠</span>
                  <span className="highlight-text">
                    {restaurantInfo?.foundingYear
                      ? t('about.familyOwned', { year: restaurantInfo.foundingYear })
                      : t('about.familyOwnedNoYear', 'Family-owned')}
                  </span>
                </div>
                <div className="highlight-item">
                  <span className="highlight-icon">👨‍🍳</span>
                  <span className="highlight-text">Traditional recipes</span>
                </div>
                <div className="highlight-item">
                  <span className="highlight-icon">🌿</span>
                  <span className="highlight-text">Fresh ingredients</span>
                </div>
              </div>
            </div>
            <div className="section-image">
              <div className="image-placeholder">
                <img
                  src={IMAGES.story}
                  alt="Our Story - Family Kitchen"
                  className="section-img"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Mission Section */}
        <div className="about-section mission-section">
          <div className="section-content reverse">
            <div className="section-image">
              <div className="image-placeholder">
                <img
                  src={IMAGES.mission}
                  alt="Our Mission - Authentic Flavors"
                  className="section-img"
                />
              </div>
            </div>
            <div className="section-text">
              <h2>Our Mission</h2>
              <p>
                {t('about.missionParagraph', { name: restaurantInfo?.restaurantName || 'Our restaurant' })}
              </p>
              <div className="mission-goals">
                <div className="goal-item">
                  <div className="goal-icon">🎯</div>
                  <div className="goal-content">
                    <h4>Authentic Taste</h4>
                    <p>Preserve traditional Vietnamese flavors</p>
                  </div>
                </div>
                <div className="goal-item">
                  <div className="goal-icon">🤝</div>
                  <div className="goal-content">
                    <h4>Community First</h4>
                    <p>Serve and support our local community</p>
                  </div>
                </div>
                <div className="goal-item">
                  <div className="goal-icon">🌟</div>
                  <div className="goal-content">
                    <h4>Quality Service</h4>
                    <p>Exceed customer expectations</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Values Section */}
        <div className="about-section values-section">
          <div className="section-header">
            <h2>Our Core Values</h2>
            <p>{t('about.valuesSubtitle', { name: restaurantInfo?.restaurantName || 'our restaurant' })}</p>
          </div>
          <div className="values-grid">
            <div className="value-card">
              <div className="value-icon">🍜</div>
              <h3>Authenticity</h3>
              <p>We stay true to traditional Vietnamese recipes and cooking methods, ensuring every dish tastes like it came straight from Vietnam.</p>
            </div>
            <div className="value-card">
              <div className="value-icon">🥬</div>
              <h3>Quality</h3>
              <p>We use only the freshest ingredients and maintain the highest standards in food preparation and service.</p>
            </div>
            <div className="value-card">
              <div className="value-icon">🏘️</div>
              <h3>Community</h3>
              <p>We're committed to serving and supporting our local community, building lasting relationships.</p>
            </div>
            <div className="value-card">
              <div className="value-icon">💝</div>
              <h3>Passion</h3>
              <p>Our love for Vietnamese cuisine drives us to create exceptional dining experiences every day.</p>
            </div>
          </div>
        </div>

        {/* Team Section */}
        <div className="about-section team-section">
          <div className="section-header">
            <h2>Meet Our Team</h2>
            <p>{t('about.teamSubtitle', { name: restaurantInfo?.restaurantName || 'our restaurant' })}</p>
          </div>
          <div className="team-grid">
            <div className="team-member">
              <div className="member-image">
                <div className="image-placeholder">
                  <img
                    src={IMAGES.team.chef}
                    alt="Chef Minh"
                    className="member-img"
                  />
                </div>
              </div>
              <h4>Chef Minh</h4>
              <p>Head Chef</p>
              <p className="member-desc">Master of traditional Vietnamese cuisine with 15+ years of experience</p>
            </div>
            <div className="team-member">
              <div className="member-image">
                <div className="image-placeholder">
                  <img
                    src={IMAGES.team.manager}
                    alt="Ms. Linh"
                    className="member-img"
                  />
                </div>
              </div>
              <h4>Ms. Linh</h4>
              <p>Restaurant Manager</p>
              <p className="member-desc">Ensuring every customer has an exceptional dining experience</p>
            </div>
            <div className="team-member">
              <div className="member-image">
                <div className="image-placeholder">
                  <div className="image-placeholder">
                    <img
                      src={IMAGES.team.operations}
                      alt="Mr. An"
                      className="member-img"
                    />
                  </div>
                </div>
              </div>
              <h4>Mr. An</h4>
              <p>Operations Manager</p>
              <p className="member-desc">Managing daily operations and maintaining quality standards</p>
            </div>
          </div>
        </div>

        {/* Call to Action */}
        <div className="about-cta">
          <div className="cta-content">
            <h3>Ready to Experience Authentic Vietnamese Cuisine?</h3>
            <p>Order now and taste the difference that tradition makes</p>
            <button className="cta-button" onClick={() => navigate('/menu')}>Order Now</button>
          </div>
        </div>
      </div>

      {/* Google Maps Section */}
      <div className="map-section">
        <div className="container">
          <h2>{t('contact.map.title')}</h2>
          <div className="map-container">
            {infoLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>Loading map...</div>
            ) : restaurantInfo?.googleMapsUrl ? (
              <iframe
                src={restaurantInfo.googleMapsUrl}
                width="100%"
                height="450"
                style={{ border: 0 }}
                allowFullScreen=""
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title={`${restaurantInfo.restaurantName || 'Restaurant'} Location`}
              ></iframe>
            ) : null}
          </div>
        </div>
      </div>
      {/* Floating Cart Button is now handled globally in App.jsx */}
    </div>
  )
}

export default Home;