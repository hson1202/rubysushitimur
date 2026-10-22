import express from "express"
import { addFood, listFood, removeFood, updateFoodStatus, updateOrderBlocked, updateFood, updateFoodQuantity, quickUpdateFood, processOrder } from "../controllers/foodController.js"
import { upload } from "../middleware/r2Upload.js"

const foodRouter = express.Router();

// Debug middleware cho foodRouter
foodRouter.use((req, res, next) => {
  console.log(`=== FOOD ROUTER DEBUG ===`)
  console.log(`Food route called: ${req.method} ${req.path}`)
  next()
})

// Add error handling middleware for upload
const handleMulterError = (error, req, res, next) => {
    console.log('=== MULTER ERROR HANDLER ===')
    console.log('Error:', error)
    
    if (error && error.name === 'MulterError') {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                success: false, 
                message: 'File too large. Maximum size is 5MB.' 
            })
        }
        return res.status(400).json({ 
            success: false, 
            message: `Upload error: ${error.message}` 
        })
    } else if (error) {
        return res.status(400).json({ 
            success: false, 
            message: error.message 
        })
    }
    next()
}

// Test route for upload
foodRouter.post("/test-upload", upload.single("image"), (req, res) => {
    console.log('=== TEST UPLOAD ROUTE ===')
    console.log('Request body:', req.body)
    console.log('Request file:', req.file)
    res.json({
        message: 'Test upload working',
        body: req.body,
        file: req.file
    })
})

// Test route without image upload
foodRouter.post("/test-no-image", (req, res) => {
    console.log('=== TEST NO IMAGE ROUTE ===')
    console.log('Request body:', req.body)
    console.log('Content-Type:', req.get('Content-Type'))
    res.json({
        message: 'Test no image working',
        body: req.body
    })
})

// Test route for creating minimal food item
foodRouter.post("/test-minimal", async (req, res) => {
    try {
        console.log('=== TEST MINIMAL FOOD CREATION ===')
        console.log('Request body:', req.body)
        
        // Generate unique SKU and slug to avoid conflicts
        const timestamp = Date.now()
        const uniqueSku = `TEST-${timestamp}`
        const uniqueSlug = `test-food-${timestamp}`
        
                 const minimalFoodData = {
             sku: req.body.sku || uniqueSku,
             name: req.body.name || 'Test Food',
             slug: req.body.slug || uniqueSlug,
             description: req.body.description || 'Test description',
             price: parseFloat(req.body.price) || 10.00,
             image: '',
             category: req.body.category || 'Test Category'
         }
        
        console.log('Minimal food data:', minimalFoodData)
        
        // Import foodModel here to avoid circular dependency
        const foodModel = (await import('../models/foodModel.js')).default
        
        const food = new foodModel(minimalFoodData)
        console.log('Food model created, attempting to save...')
        
        await food.save()
        console.log('Food saved successfully')
        
        res.json({
            success: true,
            message: 'Minimal food created successfully',
            data: food
        })
    } catch (error) {
        console.error('Error in test minimal food:', error)
        res.status(500).json({
            success: false,
            message: 'Error creating minimal food',
            error: error.message
        })
    }
})

// Test route for creating food with manual slug generation
foodRouter.post("/test-manual-slug", async (req, res) => {
    try {
        console.log('=== TEST MANUAL SLUG CREATION ===')
        console.log('Request body:', req.body)
        
        const timestamp = Date.now()
        const name = req.body.name || 'Test Food'
        
        // Manual slug generation without pre-save middleware
        const manualSlug = name.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[đĐ]/g, 'd')
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim('-') + `-${timestamp}`
        
                 const foodData = {
             sku: `MANUAL-${timestamp}`,
             name: name,
             slug: manualSlug,
             description: req.body.description || 'Test description',
             price: parseFloat(req.body.price) || 10.00,
             image: '',
             category: req.body.category || 'Test Category'
         }
        
        console.log('Manual slug food data:', foodData)
        
        // Import foodModel here to avoid circular dependency
        const foodModel = (await import('../models/foodModel.js')).default
        
        const food = new foodModel(foodData)
        console.log('Food model created, attempting to save...')
        
        await food.save()
        console.log('Food saved successfully')
        
        res.json({
            success: true,
            message: 'Manual slug food created successfully',
            data: food
        })
    } catch (error) {
        console.error('Error in test manual slug food:', error)
        res.status(500).json({
            success: false,
            message: 'Error creating manual slug food',
            error: error.message
        })
    }
})

// Test route for creating food with multilingual names
foodRouter.post("/test-multilingual", async (req, res) => {
    try {
        console.log('=== TEST MULTILINGUAL FOOD CREATION ===')
        console.log('Request body:', req.body)
        
        const timestamp = Date.now()
        const name = req.body.name || 'Test Food'
        
        // Manual slug generation
        const manualSlug = name.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[đĐ]/g, 'd')
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim('-') + `-${timestamp}`
        
                 const foodData = {
             sku: `MULTI-${timestamp}`,
             name: name,
             nameVI: req.body.nameVI || `Món ăn ${timestamp}`,
             nameEN: req.body.nameEN || `Food ${timestamp}`,
             nameHU: req.body.nameHU || `Étel ${timestamp}`,
             slug: manualSlug,
             description: req.body.description || 'Test description',
             price: parseFloat(req.body.price) || 10.00,
             image: '',
             category: req.body.category || 'Test Category'
         }
        
        console.log('Multilingual food data:', foodData)
        
        // Import foodModel here to avoid circular dependency
        const foodModel = (await import('../models/foodModel.js')).default
        
        const food = new foodModel(foodData)
        console.log('Food model created, attempting to save...')
        
        await food.save()
        console.log('Food saved successfully')
        
        res.json({
            success: true,
            message: 'Multilingual food created successfully',
            data: food
        })
    } catch (error) {
        console.error('Error in test multilingual food:', error)
        res.status(500).json({
            success: false,
            message: 'Error creating multilingual food',
            error: error.message
        })
    }
})

// Test route for debugging category issues
foodRouter.post("/test-category", async (req, res) => {
    try {
        console.log('=== TEST CATEGORY DEBUG ===')
        console.log('Request body:', req.body)
        console.log('Category value:', req.body.category)
        console.log('Category type:', typeof req.body.category)
        console.log('Category length:', req.body.category?.length)
        console.log('Category trimmed:', req.body.category?.trim())
        
        // Test with minimal data
        const testData = {
            sku: `TEST-CAT-${Date.now()}`,
            name: req.body.name || 'Test Food',
            slug: `test-food-${Date.now()}`,
            description: req.body.description || 'Test description',
            price: parseFloat(req.body.price) || 10.00,
            image: '',
            category: req.body.category || 'Test Category',
            quantity: parseInt(req.body.quantity) || 0
        }
        
        console.log('Test data to save:', testData)
        
        // Import foodModel here to avoid circular dependency
        const foodModel = (await import('../models/foodModel.js')).default
        
        const food = new foodModel(testData)
        console.log('Food model created, attempting to save...')
        
        await food.save()
        console.log('Food saved successfully')
        
        res.json({
            success: true,
            message: 'Category test successful',
            data: food,
            originalCategory: req.body.category
        })
    } catch (error) {
        console.error('Error in category test:', error)
        res.status(500).json({
            success: false,
            message: 'Category test failed',
            error: error.message,
            errorName: error.name,
            errorCode: error.code
        })
    }
})

foodRouter.post("/add", upload.single("image"), handleMulterError, addFood)
foodRouter.get("/list", listFood)
// Accept multiple delete patterns for robustness
foodRouter.delete("/remove", removeFood) // DELETE /remove?id=...
foodRouter.delete("/remove/:id", removeFood) // DELETE /remove/:id
foodRouter.post("/remove", removeFood) // POST /remove { id }
foodRouter.put("/status", updateFoodStatus)
foodRouter.put("/update-status/:id", updateFoodStatus) // Support URL param
foodRouter.put("/order-block", updateOrderBlocked)
foodRouter.put("/order-block/:id", updateOrderBlocked)
foodRouter.put("/quick-update/:id", quickUpdateFood) // Quick update price/quantity
foodRouter.put("/edit/:id", upload.single("image"), handleMulterError, updateFood)
foodRouter.put("/quantity", updateFoodQuantity)
foodRouter.post("/process-order", processOrder)

export default foodRouter;