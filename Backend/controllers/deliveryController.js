import deliveryZoneModel from "../models/deliveryZoneModel.js";
import restaurantLocationModel from "../models/restaurantLocationModel.js";
import RestaurantInfo from "../models/restaurantInfoModel.js";
import {
  resolveDelivery,
  fetchNominatim,
  nominatimResultToAddress,
  GeocodeError,
  geocodeErrorResult
} from "../utils/deliveryCalculator.js";

// ========== GET DELIVERY ZONES ==========
const getDeliveryZones = async (req, res) => {
  try {
    const zones = await deliveryZoneModel.find({ isActive: true }).sort({ order: 1, minDistance: 1 });

    res.json({
      success: true,
      data: zones
    });
  } catch (error) {
    console.error("Error fetching delivery zones:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ========== CALCULATE DELIVERY FEE ==========
const calculateDeliveryFee = async (req, res) => {
  try {
    const restaurantInfo = await RestaurantInfo.getSingleton();
    if (restaurantInfo.deliveryEnabled === false) {
      return res.status(403).json({
        success: false,
        code: 'DELIVERY_DISABLED',
        message: 'Tạm thời không giao hàng được'
      });
    }

    const { address, latitude, longitude, street, houseNumber, city, zipcode } = req.body;
    const structuredAddress = street ? { street, houseNumber, city, zipcode } : undefined;

    const result = await resolveDelivery({ address, latitude, longitude, structuredAddress });

    if (!result.success) {
      if (result.message === "Restaurant location not configured") {
        return res.status(404).json(result);
      }
      if (result.message === "Please provide either address or latitude/longitude") {
        return res.status(400).json(result);
      }
      return res.json(result);
    }

    res.json({ success: true, data: result.data });
  } catch (error) {
    console.error("Error calculating delivery fee:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ========== AUTOCOMPLETE ADDRESS (NOMINATIM/OPENSTREETMAP) ==========
const autocompleteAddress = async (req, res) => {
  try {
    const { query, proximity } = req.query; // proximity: "lng,lat" để ưu tiên kết quả gần nhà hàng

    if (!query || query.length < 3) {
      return res.json({
        success: true,
        data: []
      });
    }

    // countrycodes=hu: giới hạn trong Hungary; limit=15: lấy nhiều kết quả để filter
    const params = { q: query, countrycodes: 'hu', limit: '15' };

    // Nominatim dùng viewbox (min_lon,min_lat,max_lon,max_lat) thay vì proximity
    if (proximity) {
      const [lng, lat] = proximity.split(',').map(parseFloat);
      if (!isNaN(lng) && !isNaN(lat)) {
        // Viewbox ~55km quanh nhà hàng để ưu tiên kết quả gần. KHÔNG dùng bounded=1
        // vì sẽ chặn hoàn toàn địa chỉ ngoài viewbox của các zone xa hơn
        const offset = 0.5;
        params.viewbox = `${lng - offset},${lat - offset},${lng + offset},${lat + offset}`;
      }
    }

    const data = await fetchNominatim('search', params, { priority: 'low' });

    let suggestions = [];

    if (Array.isArray(data) && data.length > 0) {
      suggestions = data.map((result, index) => {
        const parsed = nominatimResultToAddress(result);
        if (!parsed) return null;

        // Phân loại ưu tiên:
        // Priority 1: Có số nhà rõ ràng
        // Priority 2: Address nhưng không có số nhà (chỉ tên đường)
        // Priority 3: Place (địa chỉ chung chung)
        const hasHouseNumber = parsed.components.houseNumber &&
          parsed.components.houseNumber.trim().length > 0;
        const isPlace = result.type === 'administrative' ||
          result.type === 'city' ||
          result.type === 'town' ||
          result.type === 'village';
        const priority = hasHouseNumber ? 1 : (isPlace ? 3 : 2);

        return {
          id: result.place_id || result.osm_id || `nominatim-${index}`,
          address: parsed.formattedAddress, // Địa chỉ đã được format ngắn gọn
          shortAddress: parsed.formattedAddress || parsed.components.streetLine || parsed.components.street || result.display_name.split(',')[0],
          latitude: parsed.latitude,
          longitude: parsed.longitude,
          components: parsed.components,
          priority: priority,
          hasHouseNumber: hasHouseNumber
        };
      }).filter(Boolean);
    }

    // ✨ Sắp xếp: ưu tiên địa chỉ có số nhà trước
    suggestions.sort((a, b) => {
      // Ưu tiên theo priority (1 = có số nhà, 2 = address không có số nhà, 3 = place)
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // Nếu cùng priority, giữ nguyên thứ tự từ Nominatim
      return 0;
    });

    // Chỉ trả về 5 kết quả tốt nhất
    suggestions = suggestions.slice(0, 5);

    res.json({
      success: true,
      data: suggestions
    });

  } catch (error) {
    if (error instanceof GeocodeError) {
      console.warn(`⚠️ Autocomplete geocode error (${error.code}):`, error.message);
      return res.json({ ...geocodeErrorResult(error), data: [] });
    }
    console.error("❌ Autocomplete error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ========== ADMIN: CRUD DELIVERY ZONES ==========
const createDeliveryZone = async (req, res) => {
  try {
    const { name, minDistance, maxDistance, deliveryFee, minOrder, estimatedTime, color, order } = req.body;

    const zone = new deliveryZoneModel({
      name,
      minDistance,
      maxDistance,
      deliveryFee,
      minOrder,
      estimatedTime,
      color,
      order
    });

    await zone.save();

    res.json({
      success: true,
      message: "Delivery zone created successfully",
      data: zone
    });

  } catch (error) {
    console.error("Error creating delivery zone:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const updateDeliveryZone = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const zone = await deliveryZoneModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!zone) {
      return res.status(404).json({
        success: false,
        message: "Delivery zone not found"
      });
    }

    res.json({
      success: true,
      message: "Delivery zone updated successfully",
      data: zone
    });

  } catch (error) {
    console.error("Error updating delivery zone:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const deleteDeliveryZone = async (req, res) => {
  try {
    const { id } = req.params;

    const zone = await deliveryZoneModel.findByIdAndDelete(id);

    if (!zone) {
      return res.status(404).json({
        success: false,
        message: "Delivery zone not found"
      });
    }

    res.json({
      success: true,
      message: "Delivery zone deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting delivery zone:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ========== ADMIN: CRUD RESTAURANT LOCATION ==========
const getRestaurantLocation = async (req, res) => {
  try {
    const location = await restaurantLocationModel.findOne({
      isActive: true,
      isPrimary: true
    });

    res.json({
      success: true,
      data: location
    });

  } catch (error) {
    console.error("Error fetching restaurant location:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const updateRestaurantLocation = async (req, res) => {
  try {
    const { name, address, latitude, longitude, boxFee, systemFee } = req.body;

    console.log('🔍 Update Restaurant Location - Request body:', req.body);
    console.log('📦 Box Fee received:', boxFee, 'Type:', typeof boxFee);
    console.log('⚙️ System Fee received:', systemFee, 'Type:', typeof systemFee);

    // Tìm location hiện tại hoặc tạo mới
    let location = await restaurantLocationModel.findOne({
      isActive: true,
      isPrimary: true
    });

    if (location) {
      const oldBoxFee = location.boxFee;

      location.name = name || location.name;
      location.address = address || location.address;
      location.latitude = latitude || location.latitude;
      location.longitude = longitude || location.longitude;

      // Update box fee if provided
      if (boxFee !== undefined && boxFee !== null) {
        location.boxFee = Number(boxFee);
        console.log(`📦 Box Fee updated: ${oldBoxFee} → ${location.boxFee}`);
      }

      if (systemFee !== undefined && systemFee !== null) {
        location.systemFee = Number(systemFee);
        console.log(`⚙️ System Fee updated: ${location.systemFee}`);
      }

      await location.save();
      console.log('✅ Location saved successfully');
    } else {
      location = new restaurantLocationModel({
        name,
        address,
        latitude,
        longitude,
        boxFee: boxFee !== undefined && boxFee !== null ? Number(boxFee) : 0.3,
        systemFee: systemFee !== undefined && systemFee !== null ? Number(systemFee) : 0,
        isActive: true,
        isPrimary: true
      });
      await location.save();
      console.log('✅ New location created with boxFee:', location.boxFee);
    }

    res.json({
      success: true,
      message: "Restaurant location updated successfully",
      data: location
    });

  } catch (error) {
    console.error("Error updating restaurant location:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export {
  getDeliveryZones,
  calculateDeliveryFee,
  autocompleteAddress,
  createDeliveryZone,
  updateDeliveryZone,
  deleteDeliveryZone,
  getRestaurantLocation,
  updateRestaurantLocation
};

