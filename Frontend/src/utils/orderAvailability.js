export const isDishOrderBlocked = (food) => {
  if (!food) return true
  if (food.orderBlocked === true) return true
  if (food.status && String(food.status).toLowerCase().trim() === 'inactive') return true
  if (food.quantity === undefined || food.quantity === null || food.quantity === '') return false
  const qty = Number(food.quantity)
  return !Number.isFinite(qty) || qty <= 0
}

export const dishDisplayName = (food) =>
  food?.nameVI || food?.name || food?.nameEN || food?.nameHU || ''

export const findUnavailableCartItems = (cartItems, foodList) => {
  if (!Array.isArray(foodList) || foodList.length === 0) return []

  const requested = new Map()
  Object.entries(cartItems || {}).forEach(([cartKey, quantity]) => {
    const qty = Number(quantity) || 0
    if (qty <= 0) return
    const productId = String(cartKey).split('_')[0]
    requested.set(productId, (requested.get(productId) || 0) + qty)
  })

  const unavailable = []
  requested.forEach((qty, productId) => {
    const food = foodList.find((item) => String(item._id) === productId)
    if (!food || isDishOrderBlocked(food) || Number(food.quantity) < qty) {
      unavailable.push({
        id: productId,
        name: dishDisplayName(food) || productId
      })
    }
  })

  return unavailable
}
