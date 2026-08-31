import { useState, useEffect, useContext, useMemo, useRef, useCallback } from 'react'
import './Menu.css'
import { StoreContext } from '../../Context/StoreContext'
import FoodItem from '../../components/FoodItem/FoodItem'
import ProductDetail from '../../components/ProductDetail/ProductDetail'
import CartPopup from '../../components/CartPopup/CartPopup'
import CategoryFilter from '../../components/CategoryFilter/CategoryFilter'
import axios from 'axios'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import config from '../../config/config'
import { isFoodAvailable } from '../../utils/timeUtils'
import { getLocalizedDescription } from '../../utils/productDisplay'

const Menu = () => {
  const { food_list, isLoadingFood } = useContext(StoreContext)
  const { t, i18n } = useTranslation()
  const [categories, setCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [showCartPopup, setShowCartPopup] = useState(false)
  const categoryRefs = useRef({})

  const getMenuStickyOffset = useCallback(() => {
    const rootStyles = getComputedStyle(document.documentElement)
    return parseFloat(rootStyles.getPropertyValue('--menu-topbar-h')) || 58
  }, [])

  const scrollToCategory = useCallback((categoryId, { behavior = 'smooth' } = {}) => {
    requestAnimationFrame(() => {
      const target =
        categoryRefs.current[categoryId]?.current ||
        document.getElementById(`category-${categoryId}`)

      if (!target) return

      const offset = getMenuStickyOffset()
      const top = target.getBoundingClientRect().top + window.scrollY - offset

      window.scrollTo({
        top: Math.max(0, top),
        behavior,
      })
    })
  }, [getMenuStickyOffset])

  useEffect(() => {
    fetchMenuStructure()
  }, [])

  useEffect(() => {
    document.body.classList.add('pattern-route')
    return () => document.body.classList.remove('pattern-route')
  }, [])

  useEffect(() => {
    const syncTopbarHeight = () => {
      const navbar = document.querySelector('.navbar-wrapper')
      const height = navbar ? Math.ceil(navbar.getBoundingClientRect().height) : 58
      document.documentElement.style.setProperty('--menu-topbar-h', `${height}px`)
    }

    syncTopbarHeight()
    window.addEventListener('resize', syncTopbarHeight)
    return () => window.removeEventListener('resize', syncTopbarHeight)
  }, [])

  const fetchMenuStructure = async () => {
    try {
      const response = await axios.get(`${config.BACKEND_URL}/api/category/menu-structure`)
      const menuData = response.data.data || []
      setCategories(menuData)
      setLoading(false)
    } catch (error) {
      console.error('Error fetching menu structure:', error)
      toast.error('Failed to load menu')
      setLoading(false)
    }
  }

  const getLocalizedName = useCallback((item, field = 'name') => {
    const currentLang = i18n.language
    const localizedField = `${field}${currentLang.toUpperCase()}`
    return item[localizedField] || item[field] || ''
  }, [i18n.language])

  const normalizeValue = (value) =>
    typeof value === 'string' ? value.trim().toLowerCase() : ''

  const menuSkuCollator = useMemo(
    () =>
      new Intl.Collator(undefined, {
        numeric: true,
        sensitivity: 'base',
      }),
    []
  )

  const getSortableFoodName = useCallback(
    (food) => getLocalizedName(food) || food.name || food.sku || '',
    [getLocalizedName]
  )

  const sortFoodsBySku = useCallback(
    (foods) =>
      [...foods].sort((firstFood, secondFood) => {
        const skuCompare = menuSkuCollator.compare(
          firstFood.sku || '',
          secondFood.sku || ''
        )

        if (skuCompare !== 0) return skuCompare
        return menuSkuCollator.compare(getSortableFoodName(firstFood), getSortableFoodName(secondFood))
      }),
    [getSortableFoodName, menuSkuCollator]
  )

  const doesFoodBelongToCategory = useCallback((food, category) => {
    if (!category) return false
    const categoryId = category._id?.toString()

    const possibleCategoryLabels = [
      category.name,
      category.nameEN,
      category.nameVI,
      category.nameHU,
      getLocalizedName(category),
    ]
      .filter(Boolean)
      .map(normalizeValue)

    const foodCategoryMatches =
      possibleCategoryLabels.includes(normalizeValue(food.category)) ||
      possibleCategoryLabels.includes(normalizeValue(food.categoryEN)) ||
      possibleCategoryLabels.includes(normalizeValue(food.categoryVI)) ||
      possibleCategoryLabels.includes(normalizeValue(food.categorySK))

    const foodCategoryId = food.categoryId?.toString()

    // food.category may store the category's _id directly (admin dropdown sends _id as value)
    const foodCategoryIsId = !!(categoryId && food.category && food.category === categoryId)

    return (categoryId && foodCategoryId && categoryId === foodCategoryId) || foodCategoryMatches || foodCategoryIsId
  }, [getLocalizedName])

  const filteredFoods = useMemo(() => {
    const availableFoods = food_list.filter((food) => isFoodAvailable(food))
    if (!searchTerm) return availableFoods

    const searchLower = normalizeValue(searchTerm)
    return availableFoods.filter((food) => {
      const localizedName = getLocalizedName(food)
      const description = getLocalizedDescription(food, i18n.language)
      return (
        normalizeValue(localizedName).includes(searchLower) ||
        normalizeValue(food.name).includes(searchLower) ||
        normalizeValue(description).includes(searchLower)
      )
    })
  }, [food_list, searchTerm, getLocalizedName, i18n.language])

  // Build one block per category, then sort dishes by menu SKU.
  const menuBlocks = useMemo(() => {
    if (!categories.length) return []

    const coveredFoodIds = new Set()

    const blocks = categories
      .map((category) => {
        const categoryKey = category._id?.toString() || category.name
        const foods = filteredFoods.filter((food) => {
          const belongs = doesFoodBelongToCategory(food, category)
          if (belongs) {
            coveredFoodIds.add(food._id)
          }
          return belongs
        })

        return {
          ...category,
          key: categoryKey,
          localizedName: getLocalizedName(category),
          foods: sortFoodsBySku(foods),
        }
      })
      .filter((block) => block.foods.length > 0)

    const ungroupedFoods = filteredFoods.filter((food) => !coveredFoodIds.has(food._id))
    if (ungroupedFoods.length) {
      const fallbackCategoryLabel = t('menu.miscCategory', { defaultValue: 'Popular now' })
      blocks.push({
        _id: 'fallback',
        key: 'fallback-category',
        localizedName: fallbackCategoryLabel,
        foods: sortFoodsBySku(ungroupedFoods),
      })
    }

    return blocks
  }, [categories, filteredFoods, t, getLocalizedName, doesFoodBelongToCategory, sortFoodsBySku])

  // CategoryFilter expects a list of sections each with a `categories` array.
  // With parent categories removed, we expose a single anonymous section.
  const filterSections = useMemo(
    () => [{ _id: 'all', localizedName: '', categories: menuBlocks }],
    [menuBlocks]
  )

  useEffect(() => {
    if (!selectedCategory?.id || selectedCategory?.source === 'scroll') return

    scrollToCategory(selectedCategory.id, {
      behavior: selectedCategory.source === 'click' ? 'smooth' : 'auto',
    })
  }, [selectedCategory, scrollToCategory])

  const handleViewDetails = (product) => {
    setSelectedProduct(product)
  }

  const closeProductDetail = () => {
    setSelectedProduct(null)
  }

  const closeCartPopup = () => {
    setShowCartPopup(false)
  }

  return (
    <div className="menu-page">
      {/* Two-pane layout: category sidebar (desktop + mobile) + content */}
      <div className="menu-shell">
        <aside className="menu-sidebar">
          <CategoryFilter
            categories={filterSections}
            onCategorySelect={setSelectedCategory}
            selectedCategory={selectedCategory}
            categoryRefs={categoryRefs}
            onScrollToCategory={scrollToCategory}
          />
        </aside>

        <div className="menu-content">
      {/* Food Sections - one per category */}
      <div className="menu-sections-container">
        {loading || isLoadingFood ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Loading delicious dishes...</p>
          </div>
        ) : categories.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🍽️</div>
            <h3>No menu available</h3>
            <p>Please check back later.</p>
          </div>
        ) : filteredFoods.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <h3>No dishes found</h3>
            <p>
              {searchTerm
                ? `No dishes match your search. Try a different keyword.`
                : 'No dishes available at the moment.'}
            </p>
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="reset-btn"
              >
                Clear Search
              </button>
            )}
          </div>
        ) : menuBlocks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🍱</div>
            <h3>No categories to show</h3>
            <p>We couldn’t match these dishes to any category.</p>
          </div>
        ) : (
          <div className="menu-categories-list">
            {menuBlocks.map((category) => (
              <article
                key={category.key}
                ref={(node) => {
                  if (node) {
                    categoryRefs.current[category.key] = { current: node }
                  } else {
                    delete categoryRefs.current[category.key]
                  }
                }}
                data-category-id={category.key}
                className="menu-category-block"
                id={`category-${category.key}`}
              >
                <div className="menu-category-header">
                  <h2 className="menu-category-name">{category.localizedName}</h2>
                  {category.description && (
                    <p className="menu-category-description">{category.description}</p>
                  )}
                </div>

                <div className="menu-category-dishes">
                  {category.foods.map((food) => (
                    <div key={food._id} className="menu-category-item">
                      <FoodItem 
                        id={food._id} 
                        name={food.name}
                        nameVI={food.nameVI}
                        nameEN={food.nameEN}
                        nameHU={food.nameHU}
                        description={food.description}
                        descriptionVI={food.descriptionVI}
                        descriptionEN={food.descriptionEN}
                        descriptionHU={food.descriptionHU} 
                        price={food.price} 
                        image={food.image}
                        sku={food.sku}
                        isPromotion={food.isPromotion}
                        originalPrice={food.originalPrice}
                        promotionPrice={food.promotionPrice}
                        soldCount={food.soldCount}
                        likes={food.likes}
                        options={food.options}
                        portion={food.portion}
                        allergens={food.allergens}
                        availableFrom={food.availableFrom}
                        availableTo={food.availableTo}
                        dailyAvailability={food.dailyAvailability}
                        weeklySchedule={food.weeklySchedule}
                        onViewDetails={handleViewDetails}
                        compact={true}
                      />
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
        </div>
      </div>

      {/* Product Detail Popup */}
      {selectedProduct && (
        <ProductDetail 
          product={selectedProduct}
          onClose={closeProductDetail}
        />
      )}

      {/* Cart Popup */}
      {showCartPopup && (
        <CartPopup 
          onClose={closeCartPopup}
        />
      )}
    </div>
  )
}

export default Menu
