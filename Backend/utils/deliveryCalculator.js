import deliveryZoneModel from "../models/deliveryZoneModel.js";
import restaurantLocationModel from "../models/restaurantLocationModel.js";
import { extractAddressComponents, formatShortAddress, cleanDisplayName } from "./addressFormat.js";

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
const NOMINATIM_USER_AGENT = process.env.NOMINATIM_USER_AGENT || 'FoodDeliveryApp/1.0';
const NOMINATIM_TIMEOUT_MS = 6000;
// Nominatim công cộng giới hạn 1 request/giây, vượt quá sẽ bị chậm hoặc chặn hẳn
const NOMINATIM_MIN_INTERVAL_MS = 1100;
const NOMINATIM_MAX_PENDING = 6;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 2000;

export class GeocodeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const GEOCODE_ERROR_MESSAGES = {
  ADDRESS_NOT_FOUND: {
    message: "Không tìm thấy địa chỉ này. Vui lòng kiểm tra lại tên đường, thành phố, mã bưu điện hoặc ghim vị trí trên bản đồ.",
    messageEn: "We couldn't find this address. Please check the street, city and zip code, or pin your location on the map.",
    messageHu: "Nem találjuk ezt a címet. Kérjük, ellenőrizze az utcát, a várost és az irányítószámot, vagy jelölje meg a helyet a térképen."
  },
  GEOCODE_UNAVAILABLE: {
    message: "Dịch vụ bản đồ đang chậm, chưa tính được phí giao hàng. Vui lòng thử lại sau vài giây hoặc ghim vị trí trên bản đồ.",
    messageEn: "The map service is slow right now, so the delivery fee couldn't be calculated. Please try again in a few seconds or pin your location on the map.",
    messageHu: "A térképszolgáltatás most lassú, ezért nem sikerült kiszámolni a szállítási díjat. Kérjük, próbálja újra néhány másodperc múlva, vagy jelölje meg a helyet a térképen."
  }
};

export function geocodeErrorResult(error) {
  const code = error?.code === 'ADDRESS_NOT_FOUND' ? 'ADDRESS_NOT_FOUND' : 'GEOCODE_UNAVAILABLE';
  return { success: false, code, ...GEOCODE_ERROR_MESSAGES[code] };
}

const cache = new Map();
let lastRequestAt = 0;
let pumping = false;
// Tính phí (high) luôn được đi trước gợi ý autocomplete (low). Gợi ý chỉ giữ 1 request
// chờ: request mới hơn thay request cũ, để khách gõ nhanh không làm nghẽn việc tính phí
const waiting = { high: [], low: [] };
const MAX_WAITING = { high: NOMINATIM_MAX_PENDING, low: 1 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pumpQueue() {
  if (pumping) return;
  pumping = true;
  try {
    while (waiting.high.length || waiting.low.length) {
      const wait = lastRequestAt + NOMINATIM_MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await sleep(wait);
      const next = waiting.high.shift() || waiting.low.shift();
      if (!next) break;
      lastRequestAt = Date.now();
      next.resolve();
    }
  } finally {
    pumping = false;
  }
}

function waitForSlot(priority) {
  return new Promise((resolve, reject) => {
    const queue = waiting[priority];
    if (queue.length >= MAX_WAITING[priority]) {
      if (priority === 'low') {
        queue.shift().reject(new GeocodeError('GEOCODE_UNAVAILABLE', 'Superseded by a newer autocomplete request'));
      } else {
        reject(new GeocodeError('GEOCODE_UNAVAILABLE', 'Too many pending Nominatim requests'));
        return;
      }
    }
    queue.push({ resolve, reject });
    pumpQueue();
  });
}

async function fetchNominatimUncached(url, priority) {
  try {
    await waitForSlot(priority);
    const response = await fetch(url, {
      headers: { 'User-Agent': NOMINATIM_USER_AGENT },
      signal: AbortSignal.timeout(NOMINATIM_TIMEOUT_MS)
    });
    if (!response.ok) {
      throw new GeocodeError('GEOCODE_UNAVAILABLE', `Nominatim API error: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof GeocodeError) throw error;
    throw new GeocodeError('GEOCODE_UNAVAILABLE', `Nominatim request failed: ${error.message}`);
  }
}

/**
 * Gọi Nominatim với timeout, giới hạn 1 request/giây và cache (dùng chung promise
 * cho các request trùng nhau đang chạy).
 * @param {'high'|'low'} [priority='high'] - 'low' cho autocomplete
 */
export function fetchNominatim(path, params, { priority = 'high' } = {}) {
  const search = new URLSearchParams({ format: 'json', addressdetails: '1', 'accept-language': 'en', ...params });
  const url = `${NOMINATIM_BASE_URL}/${path}?${search.toString()}`;

  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }

  const promise = fetchNominatimUncached(url, priority);
  cache.set(url, { promise, expiresAt: Date.now() + CACHE_TTL_MS });
  promise.catch(() => cache.delete(url));

  if (cache.size > CACHE_MAX_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
  return promise;
}

const parseCoordinate = (value) => {
  const num = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(num) ? num : null;
};

export function normalizeCoordinates(coords) {
  if (!coords) return null;
  const latitude = parseCoordinate(coords.latitude ?? coords.lat);
  const longitude = parseCoordinate(coords.longitude ?? coords.lng ?? coords.lon);
  if (latitude == null || longitude == null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

export const nominatimResultToAddress = (result = {}) => {
  const coords = normalizeCoordinates({ latitude: result.lat, longitude: result.lon });
  if (!coords) return null;
  const components = extractAddressComponents(result);
  const shortAddress = formatShortAddress(components);
  const formattedAddress = shortAddress || cleanDisplayName(result.display_name) || "";

  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    formattedAddress,
    components,
  };
};

function toRad(value) {
  return value * Math.PI / 180;
}

export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const normalizeText = (value) => (value || '')
  .toString()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

function matchesExpectedLocality(parsed, expected) {
  if (!expected) return true;
  const expectedZip = (expected.zipcode || '').toString().trim();
  const expectedCity = normalizeText(expected.city);
  const zip = (parsed.components.zipcode || '').toString().trim();
  const cities = [parsed.components.city, parsed.components.town, parsed.components.village]
    .map(normalizeText)
    .filter(Boolean);

  const canCheckZip = Boolean(expectedZip && zip);
  const canCheckCity = Boolean(expectedCity && cities.length > 0);
  if (!canCheckZip && !canCheckCity) return true;

  // Mã bưu điện trên OSM ở Hungary hay lệch, nên chỉ cần khớp mã bưu điện HOẶC thành phố
  if (canCheckZip && zip === expectedZip) return true;
  return canCheckCity && cities.some((c) => c === expectedCity || c.includes(expectedCity) || expectedCity.includes(c));
}

function pickBestResult(results, expected) {
  const parsed = results.map(nominatimResultToAddress).filter(Boolean);
  if (parsed.length === 0) return null;

  const matching = expected ? parsed.filter((p) => matchesExpectedLocality(p, expected)) : parsed;
  if (expected && matching.length === 0) return null;

  // Giữ thứ tự xếp hạng của Nominatim; chỉ ưu tiên kết quả có số nhà trong cùng khu vực
  return matching.find((p) => p.components.houseNumber?.trim()) || matching[0];
}

// Địa chỉ đã lưu hay để cả chuỗi đầy đủ trong `street` ("Kossuth utca 5, 1051 Budapest"),
// nên chỉ lấy phần trước dấu phẩy và không lặp lại số nhà nếu đã có
function structuredStreetLine({ street = '', houseNumber = '' } = {}) {
  const streetPart = (street || '').toString().split(',')[0].trim();
  const house = (houseNumber || '').toString().trim();
  if (!house || streetPart.toLowerCase().split(/\s+/).includes(house.toLowerCase())) {
    return streetPart;
  }
  return `${house} ${streetPart}`.trim();
}

const hasStructuredFields = (fields) => Boolean(
  fields && (fields.street || '').trim() && ((fields.city || '').trim() || (fields.zipcode || '').toString().trim())
);

/**
 * Geocode địa chỉ. Nếu có `structured` (street/houseNumber/city/zipcode) thì dùng
 * tìm kiếm có cấu trúc và chỉ chấp nhận kết quả cùng mã bưu điện/thành phố.
 */
export async function geocodeAddress(address, structured = null) {
  if (hasStructuredFields(structured)) {
    const city = (structured.city || '').trim();
    const zipcode = (structured.zipcode || '').toString().trim();
    const baseParams = { street: structuredStreetLine(structured), countrycodes: 'hu', limit: '5' };
    const attempts = [];
    if (city || zipcode) {
      attempts.push({ ...baseParams, ...(city && { city }), ...(zipcode && { postalcode: zipcode }) });
    }
    // Mã bưu điện khách nhập có thể khác mã trên OSM → thử lại chỉ với thành phố
    if (city && zipcode) {
      attempts.push({ ...baseParams, city });
    }

    for (const params of attempts) {
      const data = await fetchNominatim('search', params);
      const best = Array.isArray(data) ? pickBestResult(data, structured) : null;
      if (best) return best;
    }

    // OSM hay thiếu số nhà: thử lại theo chuỗi đầy đủ nhưng vẫn bắt buộc cùng khu vực
    const fallbackQuery = buildStructuredAddressQuery(structured);
    const fallback = await fetchNominatim('search', { q: fallbackQuery, countrycodes: 'hu', limit: '10' });
    const fallbackBest = Array.isArray(fallback) ? pickBestResult(fallback, structured) : null;
    if (fallbackBest) return fallbackBest;

    throw new GeocodeError('ADDRESS_NOT_FOUND', `Address not found: ${fallbackQuery}`);
  }

  const query = (address || '').trim();
  if (!query) {
    throw new GeocodeError('ADDRESS_NOT_FOUND', 'Empty address');
  }

  const data = await fetchNominatim('search', { q: query, countrycodes: 'hu', limit: '5' });
  const best = Array.isArray(data) ? pickBestResult(data, null) : null;
  if (!best) {
    throw new GeocodeError('ADDRESS_NOT_FOUND', `Address not found: ${query}`);
  }
  return best;
}

export async function reverseGeocodeCoordinates(latitude, longitude) {
  const data = await fetchNominatim('reverse', { lat: String(latitude), lon: String(longitude) });
  const parsed = data && !data.error ? nominatimResultToAddress(data) : null;
  if (!parsed) {
    throw new GeocodeError('ADDRESS_NOT_FOUND', 'Reverse geocoding failed');
  }
  return parsed;
}

export function buildStructuredAddressQuery({
  street = '',
  houseNumber = '',
  city = '',
  zipcode = '',
  country = 'Hungary'
} = {}) {
  const streetLine = structuredStreetLine({ street, houseNumber });
  return [streetLine, zipcode, city, country].filter(Boolean).join(', ');
}

function findMatchingZone(distance, zones) {
  let matchedZone = null;

  for (const zone of zones) {
    if (distance >= zone.minDistance && distance <= zone.maxDistance) {
      matchedZone = zone;
      break;
    }
  }

  if (!matchedZone && zones.length > 0) {
    const nearestZone = zones[0];
    if (distance < nearestZone.minDistance) {
      matchedZone = nearestZone;
    }
  }

  return matchedZone;
}

function buildOutOfRangeResult({ distance, formattedAddress, zones }) {
  if (zones.length === 0) {
    return {
      success: false,
      message: "Hiện chưa có khu vực giao hàng được cấu hình. Vui lòng liên hệ nhà hàng để biết thêm chi tiết.",
      messageEn: "No delivery zones are currently configured. Please contact the restaurant for more details.",
      messageHu: "Jelenleg nincsenek kiszállítási zónák beállítva. Kérjük, vegye fel a kapcsolatot az étteremmel.",
      distance: parseFloat(distance.toFixed(2)),
      address: formattedAddress,
      outOfRange: true,
      noZonesConfigured: true
    };
  }

  const maxDistance = Math.max(...zones.map(z => z.maxDistance || 0));
  return {
    success: false,
    message: `Xin lỗi, địa chỉ này quá xa (${parseFloat(distance.toFixed(2))}km). Hiện chúng tôi chưa phục vụ giao hàng tại khu vực này. Vui lòng chọn địa chỉ gần hơn hoặc liên hệ nhà hàng để biết thêm chi tiết.`,
    messageEn: `Sorry, this address is too far (${parseFloat(distance.toFixed(2))}km). We currently don't deliver to this area. Please choose a closer address or contact the restaurant for more details.`,
    messageHu: `Sajnáljuk, ez a cím túl messze van (${parseFloat(distance.toFixed(2))} km). Jelenleg nem szállítunk erre a területre. Kérjük, válasszon közelebbi címet, vagy vegye fel a kapcsolatot az étteremmel.`,
    distance: parseFloat(distance.toFixed(2)),
    address: formattedAddress,
    outOfRange: true,
    maxDeliveryDistance: maxDistance
  };
}

async function resolveDeliveryFromCoords(customerLat, customerLng, formattedAddress, addressComponents = null) {
  const restaurant = await restaurantLocationModel.findOne({
    isActive: true,
    isPrimary: true
  });

  if (!restaurant) {
    return {
      success: false,
      message: "Restaurant location not configured"
    };
  }

  const distance = calculateHaversineDistance(
    restaurant.latitude,
    restaurant.longitude,
    customerLat,
    customerLng
  );

  const zones = await deliveryZoneModel.find({ isActive: true }).sort({ minDistance: 1 });
  const matchedZone = findMatchingZone(distance, zones);

  if (!matchedZone) {
    return buildOutOfRangeResult({ distance, formattedAddress, zones });
  }

  return {
    success: true,
    data: {
      zone: {
        name: matchedZone.name,
        deliveryFee: matchedZone.deliveryFee,
        minOrder: matchedZone.minOrder,
        estimatedTime: matchedZone.estimatedTime,
        color: matchedZone.color
      },
      distance: parseFloat(distance.toFixed(2)),
      address: formattedAddress,
      addressComponents,
      coordinates: {
        latitude: customerLat,
        longitude: customerLng
      },
      restaurant: {
        name: restaurant.name,
        address: restaurant.address
      }
    }
  };
}

/**
 * Resolve delivery zone + fee from address input.
 * Toạ độ khách đã chọn (gợi ý / ghim bản đồ / địa chỉ đã lưu) luôn được ưu tiên;
 * chỉ geocode theo chữ khi không có toạ độ hợp lệ.
 * Lỗi geocode được trả về dạng `{ success: false, code }` thay vì throw.
 * @param {Object} options
 * @param {string} [options.address] - Free-text address for geocoding
 * @param {number} [options.latitude]
 * @param {number} [options.longitude]
 * @param {Object} [options.structuredAddress] - street/houseNumber/city/zipcode (+ optional coordinates)
 */
export async function resolveDelivery({
  address,
  latitude,
  longitude,
  structuredAddress
} = {}) {
  try {
    const coords =
      normalizeCoordinates({ latitude, longitude }) ||
      normalizeCoordinates(structuredAddress?.coordinates);

    if (coords) {
      if (address) {
        return await resolveDeliveryFromCoords(coords.latitude, coords.longitude, address);
      }

      try {
        const reverse = await reverseGeocodeCoordinates(coords.latitude, coords.longitude);
        return await resolveDeliveryFromCoords(
          coords.latitude,
          coords.longitude,
          reverse.formattedAddress,
          reverse.components
        );
      } catch (geoErr) {
        console.warn("⚠️ Reverse geocode failed, using raw coordinates:", geoErr?.message);
        return await resolveDeliveryFromCoords(
          coords.latitude,
          coords.longitude,
          `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`
        );
      }
    }

    if (hasStructuredFields(structuredAddress) || address) {
      const geocoded = await geocodeAddress(address, hasStructuredFields(structuredAddress) ? structuredAddress : null);
      return await resolveDeliveryFromCoords(
        geocoded.latitude,
        geocoded.longitude,
        geocoded.formattedAddress,
        geocoded.components
      );
    }

    return {
      success: false,
      message: "Please provide either address or latitude/longitude"
    };
  } catch (error) {
    if (error instanceof GeocodeError) {
      console.warn(`⚠️ Geocode error (${error.code}):`, error.message);
      return geocodeErrorResult(error);
    }
    throw error;
  }
}
