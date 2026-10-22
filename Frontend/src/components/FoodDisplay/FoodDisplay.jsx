import React, { useContext, useRef, useState, useEffect } from 'react'
import './FoodDisplay.css'
import { StoreContext } from '../../Context/StoreContext'
import FoodItem from '../FoodItem/FoodItem'
import { isFoodAvailable } from '../../utils/timeUtils'

const FoodDisplay = ({category, onViewDetails}) => {
    const {food_list} = useContext(StoreContext)
    const scrollContainerRef = useRef(null)
    const [canScrollLeft, setCanScrollLeft] = useState(false)
    const [canScrollRight, setCanScrollRight] = useState(false)

    const checkScrollPosition = () => {
        if (scrollContainerRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current
            setCanScrollLeft(scrollLeft > 0)
            setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1)
        }
    }

    useEffect(() => {
        checkScrollPosition()
        const container = scrollContainerRef.current
        if (container) {
            container.addEventListener('scroll', checkScrollPosition)
            return () => container.removeEventListener('scroll', checkScrollPosition)
        }
    }, [food_list, category])

    const scrollLeft = () => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollBy({
                left: -300,
                behavior: 'smooth'
            })
        }
    }

    const scrollRight = () => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollBy({
                left: 300,
                behavior: 'smooth'
            })
        }
    }

    const filteredFoodList = food_list
        .filter(item => category === "All" || category === item.category)
        .filter(item => isFoodAvailable(item))

    return (
        <div className='food-display' id='food-display'>
            <h2>Top dishes near you</h2>
            <div 
                className={`food-display-list ${canScrollLeft ? 'can-scroll-left' : ''} ${canScrollRight ? 'can-scroll-right' : ''}`} 
                ref={scrollContainerRef}
            >
                {filteredFoodList.map((item, index) => (
                    <FoodItem 
                        key={index} 
                        id={item._id} 
                        name={item.name}
                        nameVI={item.nameVI}
                        nameEN={item.nameEN}
                        nameHU={item.nameHU}
                        description={item.description} 
                        price={item.price} 
                        image={item.image}
                        sku={item.sku}
                        isPromotion={item.isPromotion}
                        originalPrice={item.originalPrice}
                        promotionPrice={item.promotionPrice}
                        soldCount={item.soldCount}
                        likes={item.likes}
                        options={item.options}
                        availableFrom={item.availableFrom}
                        availableTo={item.availableTo}
                        dailyAvailability={item.dailyAvailability}
                        weeklySchedule={item.weeklySchedule}
                        quantity={item.quantity}
                        orderBlocked={item.orderBlocked}
                        onViewDetails={onViewDetails}
                    />
                ))}
            </div>
            
            {/* Carousel Navigation */}
            {filteredFoodList.length > 0 && (
                <div className={`carousel-nav ${!canScrollLeft && !canScrollRight ? 'hidden' : ''}`}>
                    <button 
                        className="carousel-btn" 
                        onClick={scrollLeft}
                        disabled={!canScrollLeft}
                        aria-label="Scroll left"
                    >
                        Previous
                    </button>
                    <button 
                        className="carousel-btn" 
                        onClick={scrollRight}
                        disabled={!canScrollRight}
                        aria-label="Scroll right"
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    )
}

export default FoodDisplay