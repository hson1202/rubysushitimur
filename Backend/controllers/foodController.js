import foodModel from "../models/foodModel.js";
import fs from "fs";
import { mapAllergenCodes } from "../utils/allergens.js";

// Parse allergens from FormData. Accepts a JSON array string (e.g. '["gluten","fish"]')
// or a comma-separated string (e.g. "a, c" / "gluten, fish"). Letter codes are case-insensitive.
const parseAllergens = (value, fallback = []) => {
  if (value === undefined || value === null) return fallback;
  let tokens = [];
  if (Array.isArray(value)) {
    tokens = value.map((a) => String(a).trim()).filter(Boolean);
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        tokens = parsed.map((a) => String(a).trim()).filter(Boolean);
      } else {
        tokens = trimmed.split(",").map((a) => a.trim()).filter(Boolean);
      }
    } catch (e) {
      tokens = trimmed.split(",").map((a) => a.trim()).filter(Boolean);
    }
  } else {
    return fallback;
  }
  return mapAllergenCodes(tokens);
};

const addFood = async (req, res) => {
  try {
    const {
      sku, name, description, descriptionVI, descriptionEN, descriptionHU, price, category,
      nameVI, nameEN, nameHU,
      isPromotion, promotionPrice,
      soldCount, quantity, slug, options, disableBoxFee,
      isRecommended, recommendPriority,
      portion, allergens,
      availableFrom, availableTo,
      dailyAvailabilityEnabled, dailyTimeFrom, dailyTimeTo,
      weeklyScheduleEnabled, weeklyScheduleDays
      // slug có thể để trống để model tự tạo
    } = req.body;

    // DEBUG: Log time-based fields
    console.log('🔍 TIME FIELDS DEBUG:', {
      availableFrom,
      availableTo,
      dailyAvailabilityEnabled,
      dailyTimeFrom,
      dailyTimeTo,
      weeklyScheduleEnabled,
      weeklyScheduleDays
    });

    if (!sku?.trim()) return res.status(400).json({ success: false, message: "SKU is required" });
    if (!name?.trim()) return res.status(400).json({ success: false, message: "Name is required" });
    if (price === undefined || price === null || isNaN(Number(price)))
      return res.status(400).json({ success: false, message: "Valid price is required" });
    if (!category?.trim())
      return res.status(400).json({ success: false, message: "Category is required" });
    if (quantity === undefined || quantity === null || isNaN(Number(quantity)) || Number(quantity) < 0)
      return res.status(400).json({ success: false, message: "Valid quantity is required (must be >= 0)" });

    // Store Cloudinary URL or local filename for server-side uploads
    const image_url = req.file ? (req.file.path || req.file.filename) : "";

    const isPromotionBool =
      isPromotion === true || isPromotion === "true" || isPromotion === 1 || isPromotion === "1";
    
    // Handle disableBoxFee - default to false if not provided
    // Xử lý nhiều trường hợp: undefined, null, false, "false", "", 0, hoặc bất kỳ falsy value nào
    let disableBoxFeeBool = false;
    if (disableBoxFee !== undefined && disableBoxFee !== null) {
      disableBoxFeeBool = disableBoxFee === true || 
                         disableBoxFee === "true" || 
                         disableBoxFee === 1 || 
                         disableBoxFee === "1" ||
                         (typeof disableBoxFee === 'string' && disableBoxFee.toLowerCase() === 'true');
    }

    // Handle isRecommended - default to false if not provided
    let isRecommendedBool = false;
    if (isRecommended !== undefined && isRecommended !== null) {
      isRecommendedBool = isRecommended === true || 
                         isRecommended === "true" || 
                         isRecommended === 1 || 
                         isRecommended === "1" ||
                         (typeof isRecommended === 'string' && isRecommended.toLowerCase() === 'true');
    }

    // Handle recommendPriority - default to 999 if not provided
    let recommendPriorityNum = 999;
    if (recommendPriority !== undefined && recommendPriority !== null) {
      const parsed = Number(recommendPriority);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 999) {
        recommendPriorityNum = parsed;
      }
    }

    // Debug log
    console.log('🔍 Add Food - Recommendations:', {
      received: { isRecommended, recommendPriority },
      parsed: { isRecommendedBool, recommendPriorityNum }
    });

    const doc = new foodModel({
      sku: sku.trim(),
      name: name.trim(),
      nameVI: nameVI?.trim(),
      nameEN: nameEN?.trim(),
      nameHU: nameHU?.trim(),
      // Only set slug if provided, otherwise let model generate it
      ...(slug?.trim() && { slug: slug.trim() }),
      description: description?.trim() || descriptionHU?.trim() || "",
      descriptionVI: descriptionVI?.trim() || "",
      descriptionEN: descriptionEN?.trim() || "",
      descriptionHU: descriptionHU?.trim() || description?.trim() || "",
      price: Number(price),
      category: category.trim(),
      image: image_url,
      quantity: Number(quantity),
      isPromotion: isPromotionBool,
      // originalPrice removed - using regular price as base
      promotionPrice: isPromotionBool ? Number(promotionPrice) : undefined,
      soldCount: Number.isFinite(Number(soldCount)) ? Number(soldCount) : 0,
      status: "active",
      disableBoxFee: disableBoxFeeBool,
      isRecommended: isRecommendedBool,
      recommendPriority: recommendPriorityNum,
      portion: portion?.trim() || "",
      allergens: parseAllergens(allergens, []),
      // Time-based availability
      availableFrom: availableFrom || null,
      availableTo: availableTo || null,
      dailyAvailability: {
        enabled: dailyAvailabilityEnabled === true || dailyAvailabilityEnabled === "true",
        timeFrom: dailyTimeFrom?.trim() || null,
        timeTo: dailyTimeTo?.trim() || null
      },
      weeklySchedule: (() => {
        const isEnabled = weeklyScheduleEnabled === true || weeklyScheduleEnabled === "true";
        let daysArray = [];
        
        if (weeklyScheduleDays) {
          try {
            // Parse if it's a JSON string
            const parsed = typeof weeklyScheduleDays === 'string' ? JSON.parse(weeklyScheduleDays) : weeklyScheduleDays;
            // Validate it's an array of numbers 0-6
            if (Array.isArray(parsed) && parsed.every(d => Number.isInteger(d) && d >= 0 && d <= 6)) {
              daysArray = parsed;
            }
          } catch (e) {
            console.error('Error parsing weeklyScheduleDays:', e);
          }
        }
        
        // Auto-disable if no days selected (prevents showing food on all days)
        return {
          enabled: isEnabled && daysArray.length > 0,
          days: daysArray
        };
      })()
    });

    // Add options if provided
    if (options && options.trim()) {
      try {
        const parsedOptions = JSON.parse(options)
        if (Array.isArray(parsedOptions)) {
          // Validate options structure
          for (let i = 0; i < parsedOptions.length; i++) {
            const option = parsedOptions[i]
            if (!option.name || !option.choices || !Array.isArray(option.choices) || option.choices.length === 0 || !option.defaultChoiceCode) {
              return res.status(400).json({ success: false, message: `Invalid option structure at index ${i}` })
            }
            
            // Check if default choice exists
            const defaultChoiceExists = option.choices.find(choice => choice.code === option.defaultChoiceCode)
            if (!defaultChoiceExists) {
              return res.status(400).json({ success: false, message: `Default choice not found for option "${option.name}"` })
            }
          }
          doc.options = parsedOptions
        } else {
          return res.status(400).json({ success: false, message: "Options must be an array" })
        }
      } catch (error) {
        console.error('Error parsing options JSON:', error)
        return res.status(400).json({ success: false, message: "Invalid options format" })
      }
    }

    await doc.save();
    console.log('✅ Food Added Successfully:', {
      _id: doc._id,
      name: doc.name,
      isRecommended: doc.isRecommended,
      recommendPriority: doc.recommendPriority
    });
    return res.json({ success: true, message: "Food Added", data: doc });

  } catch (error) {
    console.error("ADD FOOD ERROR:", error);
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || "unique field";
      return res.status(400).json({ success: false, message: `Duplicate ${field}` });
    }
    if (error.name === "ValidationError") {
      const details = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: "Validation error", details });
    }
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

//list food items with pagination
const listFood = async (req, res) => {
  try {
    console.log('=== LIST FOOD DEBUG ===')
    console.log('Query params:', req.query)

    const { 
      status = 'all', 
      search, 
      category, 
      forUser = false,
      page = 1,
      limit = 20,
      noPagination = false // Option to get all items (for frontend initial load if needed)
    } = req.query
    
    const filter = {}

    // Nếu là request từ user (frontend), chỉ trả về sản phẩm active
    if (forUser === 'true' || forUser === true) {
      filter.status = 'active'
    } else if (status !== 'all') {
      filter.status = status
    }

    if (category) filter.category = category
    if (search) {
      const rx = new RegExp(search, 'i')
      filter.$or = [
        { name: rx }, { nameVI: rx }, { nameEN: rx }, { nameHU: rx },
        { description: rx }, { descriptionVI: rx }, { descriptionEN: rx }, { descriptionHU: rx },
        { category: rx }, { sku: rx }
      ]
    }

    console.log('Filter applied:', filter)
    
    // Get total count for pagination
    const totalCount = await foodModel.countDocuments(filter)
    
    // If noPagination is true, return all items (useful for frontend)
    if (noPagination === 'true' || noPagination === true) {
      const foods = await foodModel.find(filter).sort({ createdAt: -1 })
      console.log('Foods found (no pagination):', foods.length)
      return res.json({ 
        success: true, 
        data: foods, 
        filter: filter, 
        count: foods.length,
        total: totalCount,
        pagination: false
      })
    }
    
    // Calculate pagination
    const pageNum = Math.max(1, parseInt(page))
    const limitNum = Math.max(1, Math.min(100, parseInt(limit))) // Max 100 items per page
    const skip = (pageNum - 1) * limitNum
    const totalPages = Math.ceil(totalCount / limitNum)
    
    // Fetch paginated data
    const foods = await foodModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
    
    console.log(`Foods found: ${foods.length} (Page ${pageNum}/${totalPages}, Total: ${totalCount})`)

    res.json({ 
      success: true, 
      data: foods, 
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: totalPages,
        hasMore: pageNum < totalPages
      },
      filter: filter, 
      count: foods.length
    })
  } catch (error) {
    console.error('Error listing foods:', error)
    res.status(500).json({ success: false, message: "Error listing foods", error: error.message })
  }
}

//remove food item
const removeFood = async (req, res) => {
  try {
    const id = req.params?.id || req.query?.id || req.body?.id
    if (!id) {
      return res.status(400).json({ success: false, message: "ID is required" })
    }
    const food = await foodModel.findById(id)
    if (!food) {
      return res.status(404).json({ success: false, message: "Food not found" })
    }

    // Delete image file if exists
    if (food.image && !food.image.startsWith('http')) {
      try {
        fs.unlinkSync(`uploads/${food.image}`)
      } catch (error) {
        console.log('Image file not found or already deleted')
      }
    }

    await foodModel.findByIdAndDelete(id)
    res.json({ success: true, message: "Food removed successfully" })

  } catch (error) {
    console.error('REMOVE FOOD ERROR:', error)
    res.status(500).json({ success: false, message: "Internal server error" })
  }
}

//update food status (active/inactive)
const updateFoodStatus = async (req, res) => {
  try {
    // Support both URL param and body
    const id = req.params.id || req.body.id;
    const status = req.body.status;
    
    if (!id || !status) {
      return res.status(400).json({ success: false, message: "ID and status are required" })
    }

    const updatedFood = await foodModel.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    )

    if (!updatedFood) {
      return res.status(404).json({ success: false, message: "Food not found" })
    }

    res.json({ success: true, message: "Status updated successfully", data: updatedFood })

  } catch (error) {
    console.error('UPDATE FOOD STATUS ERROR:', error)
    res.status(500).json({ success: false, message: "Internal server error" })
  }
}

//update food item (edit product)
const updateFood = async (req, res) => {
  try {
    const { id } = req.params
    const {
      sku, name, description, descriptionVI, descriptionEN, descriptionHU, price, category,
      nameVI, nameEN, nameHU,
      isPromotion, promotionPrice,
      soldCount, quantity, slug, options, disableBoxFee,
      isRecommended, recommendPriority,
      portion, allergens,
      availableFrom, availableTo,
      dailyAvailabilityEnabled, dailyTimeFrom, dailyTimeTo,
      weeklyScheduleEnabled, weeklyScheduleDays
    } = req.body

    const existingFood = await foodModel.findById(id)
    if (!existingFood) {
      return res.status(404).json({ success: false, message: "Food not found" })
    }

    const hasField = (field) => Object.prototype.hasOwnProperty.call(req.body, field)

    const skuValue = hasField('sku') ? sku : existingFood.sku
    const nameValue = hasField('name') ? name : existingFood.name
    const priceValue = hasField('price') ? price : existingFood.price
    const categoryValue = hasField('category') ? category : existingFood.category
    const quantityValue = hasField('quantity') ? quantity : existingFood.quantity

    // Validate required fields
    if (!skuValue?.trim()) return res.status(400).json({ success: false, message: "SKU is required" })
    if (!nameValue?.trim()) return res.status(400).json({ success: false, message: "Name is required" })
    if (priceValue === undefined || priceValue === null || isNaN(Number(priceValue)))
      return res.status(400).json({ success: false, message: "Valid price is required" })
    if (!categoryValue?.trim())
      return res.status(400).json({ success: false, message: "Category is required" })
    if (quantityValue === undefined || quantityValue === null || isNaN(Number(quantityValue)) || Number(quantityValue) < 0)
      return res.status(400).json({ success: false, message: "Valid quantity is required (must be >= 0)" })

    // Handle image update
    const isPromotionBool = hasField('isPromotion')
      ? (isPromotion === true || isPromotion === "true" || isPromotion === 1 || isPromotion === "1")
      : Boolean(existingFood.isPromotion);
    // Handle disableBoxFee - default to false if not provided
    // FormData sends boolean as string "true" or "false"
    // Xử lý nhiều trường hợp: undefined, null, false, "false", "", 0, hoặc bất kỳ falsy value nào
    let disableBoxFeeBool = Boolean(existingFood.disableBoxFee);
    if (hasField('disableBoxFee') && disableBoxFee !== undefined && disableBoxFee !== null) {
      disableBoxFeeBool = disableBoxFee === true || 
                         disableBoxFee === "true" || 
                         disableBoxFee === 1 || 
                         disableBoxFee === "1" ||
                         (typeof disableBoxFee === 'string' && disableBoxFee.toLowerCase() === 'true');
    }

    // Handle isRecommended - default to false if not provided
    let isRecommendedBool = Boolean(existingFood.isRecommended);
    if (hasField('isRecommended') && isRecommended !== undefined && isRecommended !== null) {
      isRecommendedBool = isRecommended === true || 
                         isRecommended === "true" || 
                         isRecommended === 1 || 
                         isRecommended === "1" ||
                         (typeof isRecommended === 'string' && isRecommended.toLowerCase() === 'true');
    }

    // Handle recommendPriority - default to 999 if not provided
    let recommendPriorityNum = Number.isFinite(Number(existingFood.recommendPriority))
      ? Number(existingFood.recommendPriority)
      : 999;
    if (hasField('recommendPriority') && recommendPriority !== undefined && recommendPriority !== null) {
      const parsed = Number(recommendPriority);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 999) {
        recommendPriorityNum = parsed;
      }
    }

    const parseWeeklyDays = (value, fallback = []) => {
      let parsed = value
      if (typeof value === 'string') {
        try {
          parsed = JSON.parse(value)
        } catch (e) {
          return fallback
        }
      }

      if (!Array.isArray(parsed)) return fallback

      const normalized = parsed
        .map((d) => Number(d))
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)

      return Array.from(new Set(normalized))
    }
    
    let updateData = {
      sku: skuValue.trim(),
      name: nameValue.trim(),
      nameVI: hasField('nameVI') ? nameVI?.trim() : existingFood.nameVI,
      nameEN: hasField('nameEN') ? nameEN?.trim() : existingFood.nameEN,
      nameHU: hasField('nameHU') ? nameHU?.trim() : existingFood.nameHU,
      // Don't update slug if it's empty - keep existing one
      ...(slug?.trim() && { slug: slug.trim() }),
      description: hasField('description')
        ? (description?.trim() || "")
        : existingFood.description,
      descriptionVI: hasField('descriptionVI')
        ? (descriptionVI?.trim() || "")
        : existingFood.descriptionVI,
      descriptionEN: hasField('descriptionEN')
        ? (descriptionEN?.trim() || "")
        : existingFood.descriptionEN,
      descriptionHU: hasField('descriptionHU')
        ? (descriptionHU?.trim() || "")
        : existingFood.descriptionHU,
      price: Number(priceValue),
      category: categoryValue.trim(),
      quantity: Number(quantityValue),
      isPromotion: isPromotionBool,
      // originalPrice removed - using regular price as base
      promotionPrice: isPromotionBool
        ? (hasField('promotionPrice')
            ? Number(promotionPrice)
            : Number(existingFood.promotionPrice || 0))
        : undefined,
      soldCount: hasField('soldCount')
        ? (Number.isFinite(Number(soldCount)) ? Number(soldCount) : 0)
        : Number(existingFood.soldCount || 0),
      disableBoxFee: Boolean(disableBoxFeeBool), // Ensure it's always a boolean, explicitly set
      isRecommended: Boolean(isRecommendedBool),
      recommendPriority: recommendPriorityNum,
      portion: hasField('portion') ? (portion?.trim() || "") : existingFood.portion,
      allergens: hasField('allergens')
        ? parseAllergens(allergens, [])
        : (existingFood.allergens || [])
    }

    // Time-based availability - only update when fields are explicitly provided
    if (hasField('availableFrom')) {
      updateData.availableFrom = availableFrom || null
    }
    if (hasField('availableTo')) {
      updateData.availableTo = availableTo || null
    }

    const hasDailyAvailabilityField =
      hasField('dailyAvailabilityEnabled') || hasField('dailyTimeFrom') || hasField('dailyTimeTo')

    if (hasDailyAvailabilityField) {
      const existingDaily = existingFood.dailyAvailability || {}
      const dailyEnabled = hasField('dailyAvailabilityEnabled')
        ? (dailyAvailabilityEnabled === true || dailyAvailabilityEnabled === "true")
        : Boolean(existingDaily.enabled)
      const dailyFrom = hasField('dailyTimeFrom')
        ? (dailyTimeFrom?.trim() || null)
        : (existingDaily.timeFrom || null)
      const dailyTo = hasField('dailyTimeTo')
        ? (dailyTimeTo?.trim() || null)
        : (existingDaily.timeTo || null)

      updateData.dailyAvailability = {
        enabled: dailyEnabled,
        timeFrom: dailyEnabled ? dailyFrom : null,
        timeTo: dailyEnabled ? dailyTo : null
      }
    }

    const hasWeeklyScheduleField =
      hasField('weeklyScheduleEnabled') || hasField('weeklyScheduleDays')

    if (hasWeeklyScheduleField) {
      const existingWeekly = existingFood.weeklySchedule || {}
      const isEnabled = hasField('weeklyScheduleEnabled')
        ? (weeklyScheduleEnabled === true || weeklyScheduleEnabled === "true")
        : Boolean(existingWeekly.enabled)
      const daysArray = hasField('weeklyScheduleDays')
        ? parseWeeklyDays(weeklyScheduleDays, [])
        : parseWeeklyDays(existingWeekly.days, [])

      updateData.weeklySchedule = {
        enabled: isEnabled && daysArray.length > 0,
        days: daysArray
      }
    }

    // If new image uploaded, update image field with Cloudinary URL or local filename
    if (req.file) {
      updateData.image = req.file.path || req.file.filename
    }

    // If new options provided, update options field
    if (options && options.trim()) {
      try {
        const parsedOptions = JSON.parse(options)
        if (Array.isArray(parsedOptions)) {
          // Validate options structure
          for (let i = 0; i < parsedOptions.length; i++) {
            const option = parsedOptions[i]
            if (!option.name || !option.choices || !Array.isArray(option.choices) || option.choices.length === 0 || !option.defaultChoiceCode) {
              return res.status(400).json({ success: false, message: `Invalid option structure at index ${i}` })
            }
            
            // Check if default choice exists
            const defaultChoiceExists = option.choices.find(choice => choice.code === option.defaultChoiceCode)
            if (!defaultChoiceExists) {
              return res.status(400).json({ success: false, message: `Default choice not found for option "${option.name}"` })
            }
          }
          updateData.options = parsedOptions
        } else {
          return res.status(400).json({ success: false, message: "Options must be an array" })
        }
      } catch (error) {
        console.error('Error parsing options JSON:', error)
        return res.status(400).json({ success: false, message: "Invalid options format" })
      }
    }

    const updatedFood = await foodModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )

    res.json({ success: true, message: "Food updated successfully", data: updatedFood })

  } catch (error) {
    console.error('UPDATE FOOD ERROR:', error)
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || "unique field"
      return res.status(400).json({ success: false, message: `Duplicate ${field}` })
    }
    if (error.name === "ValidationError") {
      const details = Object.values(error.errors).map(e => e.message)
      return res.status(400).json({ success: false, message: "Validation error", details })
    }
    return res.status(500).json({ success: false, message: "Internal server error" })
  }
}

//update food quantity (for inventory management)
// Quick update (price or quantity only)
const quickUpdateFood = async (req, res) => {
  try {
    const { id } = req.params;
    const { price, quantity } = req.body;
    
    if (!id) {
      return res.status(400).json({ success: false, message: "Product ID is required" });
    }
    
    const updateData = {};
    if (price !== undefined) updateData.price = parseFloat(price);
    if (quantity !== undefined) updateData.quantity = parseInt(quantity);
    
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, message: "No fields to update" });
    }
    
    const updatedFood = await foodModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!updatedFood) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    
    res.json({ success: true, message: "Product updated successfully", data: updatedFood });
  } catch (error) {
    console.error('QUICK UPDATE ERROR:', error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const updateFoodQuantity = async (req, res) => {
  try {
    const { id, quantity } = req.body

    if (quantity === undefined || quantity === null || isNaN(Number(quantity)) || Number(quantity) < 0) {
      return res.status(400).json({ success: false, message: "Valid quantity is required (must be >= 0)" })
    }

    const updatedFood = await foodModel.findByIdAndUpdate(
      id,
      { quantity: Number(quantity) },
      { new: true, runValidators: true }
    )

    if (!updatedFood) {
      return res.status(404).json({ success: false, message: "Food not found" })
    }

    res.json({ success: true, message: "Quantity updated successfully", data: updatedFood })

  } catch (error) {
    console.error('UPDATE FOOD QUANTITY ERROR:', error)
    if (error.name === "ValidationError") {
      const details = Object.values(error.errors).map(e => e.message)
      return res.status(400).json({ success: false, message: "Validation error", details })
    }
    return res.status(500).json({ success: false, message: "Internal server error" })
  }
}

//process order and update inventory
const processOrder = async (req, res) => {
  try {
    const { orderItems } = req.body; // Array of { foodId, quantity }

    if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Order items are required"
      });
    }

    const results = [];
    const errors = [];

    for (const item of orderItems) {
      const { foodId, quantity } = item;

      if (!foodId || !quantity || quantity <= 0) {
        errors.push(`Invalid item: foodId=${foodId}, quantity=${quantity}`);
        continue;
      }

      try {
        const food = await foodModel.findById(foodId);
        if (!food) {
          errors.push(`Food not found: ${foodId}`);
          continue;
        }

        if (food.quantity < quantity) {
          errors.push(`Insufficient stock for ${food.name}: available=${food.quantity}, requested=${quantity}`);
          continue;
        }

        // Update quantity and soldCount
        const updatedFood = await foodModel.findByIdAndUpdate(
          foodId,
          {
            $inc: {
              quantity: -quantity,  // Decrease quantity
              soldCount: quantity  // Increase soldCount
            }
          },
          { new: true, runValidators: true }
        );

        results.push({
          foodId,
          name: food.name,
          quantity: quantity,
          newStock: updatedFood.quantity,
          totalSold: updatedFood.soldCount
        });

      } catch (error) {
        errors.push(`Error processing ${foodId}: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Some items could not be processed",
        errors,
        results
      });
    }

    res.json({
      success: true,
      message: "Order processed successfully",
      data: results
    });

  } catch (error) {
    console.error('PROCESS ORDER ERROR:', error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}

export { addFood, listFood, removeFood, updateFoodStatus, updateFood, updateFoodQuantity, quickUpdateFood, processOrder }