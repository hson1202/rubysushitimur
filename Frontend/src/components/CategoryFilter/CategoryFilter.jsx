import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import './CategoryFilter.css'
import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'

const MOBILE_BREAKPOINT = 768

const CategoryFilter = ({  categories = [],
  onCategorySelect,
  selectedCategory,
  categoryRefs = {},
  onScrollToCategory,
}) => {
  const { t } = useTranslation()
  const scrollContainerRef = useRef(null)
  const categoryButtonRefs = useRef({})
  const [activeCategoryId, setActiveCategoryId] = useState(null)
  const activeCategoryIdRef = useRef(null)
  const isScrollingRef = useRef(false)
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= MOBILE_BREAKPOINT : false
  )
  const [scrollState, setScrollState] = useState({    hasPrev: false,
    hasNext: false,
    isOverflowing: false,
  })

  // Flatten all categories from menu sections
  const allCategories = categories.flatMap((section) =>
    section.categories.map((cat) => ({
      ...cat,
      sectionId: section._id,
      sectionName: section.localizedName,
    }))
  )

  const getStickyHeaderHeight = useCallback(() => {
    const rootStyles = getComputedStyle(document.documentElement)
    const topbar = parseFloat(rootStyles.getPropertyValue('--menu-topbar-h')) || 58
    const search = parseFloat(rootStyles.getPropertyValue('--menu-search-h')) || 0
    return topbar + search
  }, [])

  const updateScrollIndicators = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const { scrollLeft, scrollWidth, clientWidth } = container
    const canScroll = scrollWidth > clientWidth + 1

    setScrollState({
      hasPrev: canScroll && scrollLeft > 8,
      hasNext: canScroll && scrollLeft + clientWidth < scrollWidth - 8,
      isOverflowing: canScroll,
    })
  }, [])

  const getSidebarScrollParent = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return null
    return container.closest('.menu-sidebar') || container
  }, [])

  const alignActiveCategoryMobile = useCallback((categoryId, { animate = true } = {}) => {
    const container = scrollContainerRef.current
    const buttonRef = categoryButtonRefs.current[categoryId]
    const sidebar = getSidebarScrollParent()
    if (!container || !buttonRef || !sidebar) return

    const visibleHeight = sidebar.clientHeight
    const containerHeight = container.scrollHeight
    const offsetTop = buttonRef.offsetTop
    const buttonHeight = buttonRef.offsetHeight
    const buttonCenter = offsetTop + buttonHeight / 2
    const sidebarCenter = visibleHeight / 2
    const minY = Math.min(0, visibleHeight - containerHeight)
    const centeredY = sidebarCenter - buttonCenter
    const nextY = Math.max(minY, Math.min(0, centeredY))

    container.classList.toggle('is-instant', !animate)
    container.style.transform = `translateY(${nextY}px)`

    if (!animate) {
      requestAnimationFrame(() => {
        container.classList.remove('is-instant')
      })
    }
  }, [getSidebarScrollParent])

  const resetMobileSidebarTransform = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    container.style.transform = ''
    container.classList.remove('is-instant')
  }, [])

  // Desktop: keep active category visible inside the sticky sidebar scroll area
  const scrollCategoryIntoView = useCallback(    (categoryId, { behavior = 'auto' } = {}) => {
      const buttonRef = categoryButtonRefs.current[categoryId]
      const scrollParent = getSidebarScrollParent()
      if (!buttonRef || !scrollParent) return

      const parentRect = scrollParent.getBoundingClientRect()
      const buttonRect = buttonRef.getBoundingClientRect()
      const margin = 16

      const isFullyVisible =
        buttonRect.top >= parentRect.top + margin &&
        buttonRect.bottom <= parentRect.bottom - margin

      if (isFullyVisible) return

      let nextScrollTop = scrollParent.scrollTop
      if (buttonRect.top < parentRect.top + margin) {
        nextScrollTop -= parentRect.top + margin - buttonRect.top
      } else if (buttonRect.bottom > parentRect.bottom - margin) {
        nextScrollTop += buttonRect.bottom - (parentRect.bottom - margin)
      }

      scrollParent.scrollTo({
        top: Math.max(0, nextScrollTop),
        behavior,
      })

      requestAnimationFrame(updateScrollIndicators)
    },
    [getSidebarScrollParent, updateScrollIndicators]
  )

  const alignActiveCategory = useCallback(
    (categoryId, { behavior = 'auto' } = {}) => {
      if (!categoryId) return

      if (window.innerWidth <= MOBILE_BREAKPOINT) {
        alignActiveCategoryMobile(categoryId, { animate: behavior === 'smooth' })
        return
      }

      scrollCategoryIntoView(categoryId, { behavior })
    },
    [alignActiveCategoryMobile, scrollCategoryIntoView]
  )

  const handleCarouselScroll = useCallback(() => {    updateScrollIndicators()
  }, [updateScrollIndicators])

  const categoryKeySignature = useMemo(
    () => allCategories.map((cat) => cat.key).join('|'),
    [allCategories]
  )

  const categoryMetaById = useMemo(() => {
    const map = new Map()
    allCategories.forEach((cat) => {
      if (cat?.key) {
        map.set(cat.key, cat)
      }
    })
    return map
  }, [allCategories])

  useEffect(() => {
    const updateViewport = () => {
      const nextIsMobile = window.innerWidth <= MOBILE_BREAKPOINT
      setIsMobile((prev) => {
        if (prev && !nextIsMobile) {
          resetMobileSidebarTransform()
        }
        return nextIsMobile
      })
    }

    updateViewport()
    window.addEventListener('resize', updateViewport)
    return () => window.removeEventListener('resize', updateViewport)
  }, [resetMobileSidebarTransform])

  useEffect(() => {    updateScrollIndicators()

    const container = scrollContainerRef.current
    if (!container) return

    container.addEventListener('scroll', handleCarouselScroll, { passive: true })
    window.addEventListener('resize', updateScrollIndicators)

    return () => {
      container.removeEventListener('scroll', handleCarouselScroll)
      window.removeEventListener('resize', updateScrollIndicators)
    }
  }, [handleCarouselScroll, updateScrollIndicators])

  // Intersection observer to detect which category header is visible
  useEffect(() => {
    const refs = categoryRefs?.current || categoryRefs
    if (!refs || Object.keys(refs).length === 0) return

    const observedHeaders = new Set()
    let observer
    let rafId = null

    const cleanupObserverTargets = () => {
      observedHeaders.forEach((header) => {
        observer?.unobserve(header)
      })
      observedHeaders.clear()
    }

    const setupObserver = () => {
      cleanupObserverTargets()
      observer?.disconnect()

      const stickyHeaderHeight = getStickyHeaderHeight()
      observer = new IntersectionObserver(
        (entries) => {
          if (isScrollingRef.current) return

          if (rafId) cancelAnimationFrame(rafId)
          rafId = requestAnimationFrame(() => {
            const visibleEntries = entries
              .filter((entry) => entry.isIntersecting)
              .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)

            const nextCategory = visibleEntries[0]?.target?.dataset?.categoryId
            if (!nextCategory || nextCategory === activeCategoryIdRef.current) return

            activeCategoryIdRef.current = nextCategory
            setActiveCategoryId(nextCategory)
            alignActiveCategory(nextCategory, { behavior: 'auto' })
            const meta = categoryMetaById.get(nextCategory)
            if (meta && onCategorySelect) {
              onCategorySelect({
                id: nextCategory,
                label: meta.localizedName || meta.name,
                source: 'scroll',
              })
            }
          })
        },
        {
          root: null,
          rootMargin: `-${stickyHeaderHeight}px 0px -55% 0px`,
          threshold: 0,
        }
      )

      Object.entries(refs).forEach(([categoryId, refObj]) => {
        const categoryElement = refObj?.current
        if (!categoryElement) return
        const categoryHeader = categoryElement.querySelector('.menu-category-header')
        if (!categoryHeader) return
        categoryHeader.dataset.categoryId = categoryId
        observer.observe(categoryHeader)
        observedHeaders.add(categoryHeader)
      })
    }

    const handleResize = () => {
      requestAnimationFrame(setupObserver)
    }

    setupObserver()
    window.addEventListener('resize', handleResize)

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener('resize', handleResize)
      cleanupObserverTargets()
      observer?.disconnect()
    }
  }, [categoryRefs, categoryKeySignature, alignActiveCategory, getStickyHeaderHeight, categoryMetaById, onCategorySelect])
  const handleCategoryClick = (category) => {
    isScrollingRef.current = true
    activeCategoryIdRef.current = category.key
    setActiveCategoryId(category.key)

    if (onCategorySelect) {
      onCategorySelect({ id: category.key, label: category.localizedName, source: 'click' })
    }

    alignActiveCategory(category.key, { behavior: 'smooth' })
    onScrollToCategory?.(category.key, { behavior: 'smooth' })

    requestAnimationFrame(updateScrollIndicators)

    window.setTimeout(() => {
      isScrollingRef.current = false
    }, 900)
  }

  const handleNavClick = (direction) => {
    const container = scrollContainerRef.current
    if (!container) return

    const scrollAmount = window.innerWidth <= 768 ? 220 : 320
    container.scrollBy({
      left: direction === 'prev' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    })
  }

  useEffect(() => {
    if (selectedCategory?.id && selectedCategory.id !== activeCategoryId) {
      activeCategoryIdRef.current = selectedCategory.id
      setActiveCategoryId(selectedCategory.id)
      const behavior = selectedCategory.source === 'click' ? 'smooth' : 'auto'
      alignActiveCategory(selectedCategory.id, { behavior })
    }
  }, [selectedCategory, activeCategoryId, alignActiveCategory])

  useEffect(() => {
    if (!isMobile || !activeCategoryId) return
    alignActiveCategoryMobile(activeCategoryId, { animate: false })
  }, [isMobile, allCategories.length, activeCategoryId, alignActiveCategoryMobile])
  useEffect(() => {
    updateScrollIndicators()
  }, [allCategories.length, updateScrollIndicators])

  if (allCategories.length === 0) {
    return null
  }

  const activeCategory = allCategories.find((cat) => cat.key === activeCategoryId)

  return (
    <section className="category-filter">
      <div className="category-filter-header">
        <div className="category-filter-copy">
          <p className="eyebrow">{t('categoryFilter.browseMenu')}</p>
          <h3>{t('categoryFilter.findWhatYouCraving')}</h3>
        </div>
        <div className="category-filter-meta">
          <span className="active-label">
            {activeCategory?.localizedName || selectedCategory?.label || t('categoryFilter.allCategories')}
          </span>
          {scrollState.isOverflowing && (
            <div className="category-filter-nav">
              <button
                type="button"
                className="nav-button"
                onClick={() => handleNavClick('prev')}
                disabled={!scrollState.hasPrev}
                aria-label={t('categoryFilter.scrollLeft')}
              >
                ‹
              </button>
              <button
                type="button"
                className="nav-button"
                onClick={() => handleNavClick('next')}
                disabled={!scrollState.hasNext}
                aria-label={t('categoryFilter.scrollRight')}
              >
                ›
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="category-carousel-shell">
        {scrollState.hasPrev && <span className="fade-edge left" aria-hidden="true" />}
        <div className="category-carousel-container" ref={scrollContainerRef}>
          {allCategories.map((category) => {
            const isActive = activeCategoryId === category.key

            return (
              <button
                key={category.key}
                ref={(el) => {
                  if (el) {
                    categoryButtonRefs.current[category.key] = el
                  }
                }}
                className={`category-chip ${isActive ? 'active' : ''}`}
                onClick={() => handleCategoryClick(category)}
              >
                <span className="category-chip-label">{category.localizedName}</span>
                {category.sectionName && (
                  <span className="category-chip-section">{category.sectionName}</span>
                )}
              </button>
            )
          })}
        </div>
        {scrollState.hasNext && <span className="fade-edge right" aria-hidden="true" />}
      </div>
    </section>
  )
}

export default CategoryFilter

CategoryFilter.propTypes = {
  categories: PropTypes.arrayOf(
    PropTypes.shape({
      _id: PropTypes.string,
      localizedName: PropTypes.string,
      categories: PropTypes.arrayOf(
        PropTypes.shape({
          key: PropTypes.string,
          localizedName: PropTypes.string,
        })
      ),
    })
  ),
  onCategorySelect: PropTypes.func,
  selectedCategory: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    label: PropTypes.string,
  }),
  categoryRefs: PropTypes.object,
  onScrollToCategory: PropTypes.func,
}
