// Các hàm xử lý/format địa chỉ dùng chung cho toàn backend (delivery geocoding,
// email đơn hàng, v.v.) để tránh lặp lại logic này ở nhiều file.

// Parse địa chỉ từ Nominatim (OpenStreetMap) response format
export const extractAddressComponents = (nominatimResult = {}) => {
  const components = {
    street: "",
    streetLine: "",
    houseNumber: "",
    city: "",
    village: "", // Thành phố nhỏ (ví dụ: Veča)
    town: "", // Thành phố lớn hơn (ví dụ: Budapest)
    state: "",
    zipcode: "",
    country: "",
  };

  const address = nominatimResult.address || {};

  // Số nhà
  components.houseNumber =
    address.house_number ||
    address.house ||
    address.housenumber ||
    "";

  // Tên đường
  components.street =
    address.road ||
    address.street ||
    address.pedestrian ||
    address.path ||
    "";

  // Village (thành phố nhỏ / ngoại ô, ví dụ: Óbuda)
  components.village = address.village || "";

  // Town/City (thành phố lớn hơn, ví dụ: Budapest)
  components.town = address.town || address.city || "";

  // City (fallback - dùng village hoặc town nếu không có)
  components.city =
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    "";

  // Tỉnh/Quận/Huyện
  components.state =
    address.state ||
    address.region ||
    address.county ||
    "";

  // Mã bưu điện
  components.zipcode = address.postcode || "";

  // Quốc gia
  components.country = address.country || "";

  // Tạo streetLine: kết hợp số nhà + tên đường
  components.streetLine = [components.houseNumber, components.street]
    .filter(Boolean)
    .join(" ")
    .trim();

  // Fallback: Nếu không có streetLine, thử parse từ display_name
  if (!components.streetLine && nominatimResult.display_name) {
    const displayName = nominatimResult.display_name;
    // Thử tách số nhà từ đầu chuỗi (ví dụ: "1870/19, Hliník" hoặc "Hliník 1870/19")
    const match = displayName.match(/^(\d+[\/\-\d]*[a-zA-Z]?)\s+(.+?)(?:,|$)/);
    if (match) {
      components.houseNumber = components.houseNumber || match[1];
      components.street = components.street || match[2].trim();
      components.streetLine = [components.houseNumber, components.street]
        .filter(Boolean)
        .join(" ")
        .trim();
    } else {
      // Thử pattern ngược lại: "Hliník 1870/19"
      const reverseMatch = displayName.match(/^(.+?)\s+(\d+[\/\-\d]*[a-zA-Z]?)(?:,|$)/);
      if (reverseMatch) {
        components.street = components.street || reverseMatch[1].trim();
        components.houseNumber = components.houseNumber || reverseMatch[2];
        components.streetLine = [components.street, components.houseNumber]
          .filter(Boolean)
          .join(" ")
          .trim();
      } else {
        // Lấy phần đầu tiên trước dấu phẩy
        components.streetLine = displayName.split(',')[0].trim();
      }
    }
  }

  return components;
};

// Format địa chỉ ngắn gọn từ components
// Ví dụ: "Bajcsy-Zsilinszky út 12, 1051 Budapest"
// Bỏ qua state/region và country để tránh lặp lại thông tin
export const formatShortAddress = (components = {}) => {
  const parts = [];

  // Phần 1: Street line (số nhà + tên đường)
  if (components.streetLine) {
    parts.push(components.streetLine);
  } else if (components.street) {
    parts.push(components.street);
  }

  // Phần 2: Village (thành phố nhỏ / ngoại ô, ví dụ: Óbuda)
  if (components.village && components.village !== components.town) {
    parts.push(components.village);
  }

  // Phần 3: Zipcode + Town (thành phố lớn hơn, ví dụ: 1051 Budapest)
  if (components.zipcode && components.town) {
    // Kết hợp zipcode và town nếu town khác với village
    const zipAndTown = `${components.zipcode} ${components.town}`;
    // Kiểm tra xem town đã có trong parts chưa (tránh lặp)
    const townAlreadyIncluded = parts.some(part => part.includes(components.town));
    if (!townAlreadyIncluded) {
      parts.push(zipAndTown);
    } else {
      // Nếu đã có town ở trên, chỉ thêm zipcode nếu chưa có
      const zipcodeAlreadyIncluded = parts.some(part => part.includes(components.zipcode));
      if (!zipcodeAlreadyIncluded) {
        parts.push(components.zipcode);
      }
    }
  } else if (components.zipcode) {
    // Chỉ có zipcode, không có town
    const zipcodeAlreadyIncluded = parts.some(part => part.includes(components.zipcode));
    if (!zipcodeAlreadyIncluded) {
      parts.push(components.zipcode);
    }
  } else if (components.town && !components.village) {
    // Chỉ có town, không có village
    const townAlreadyIncluded = parts.some(part => part.includes(components.town));
    if (!townAlreadyIncluded) {
      parts.push(components.town);
    }
  } else if (components.city && !components.village && !components.town) {
    // Fallback: dùng city nếu không có village và town
    const cityAlreadyIncluded = parts.some(part => part.includes(components.city));
    if (!cityAlreadyIncluded) {
      parts.push(components.city);
    }
  }

  // KHÔNG thêm state/region và country để tránh lặp lại thông tin
  // (ví dụ: "Region of Nitra 927 01" sẽ bị bỏ qua)

  // Nếu không có gì, trả về empty string
  if (parts.length === 0) {
    return "";
  }

  return parts.join(", ");
};

// Clean display_name để bỏ phần state/region và country
// Ví dụ: "Bajcsy-Zsilinszky út 12, 1051 Budapest, Budapest, Hungary"
// -> "Bajcsy-Zsilinszky út 12, 1051 Budapest"
export const cleanDisplayName = (displayName = "") => {
  if (!displayName) return "";

  // Tách địa chỉ thành các phần
  const parts = displayName.split(',').map(part => part.trim()).filter(Boolean);

  // Loại bỏ các phần chứa "Region of", "State", "Country", "Hungary"
  const cleanedParts = parts.filter(part => {
    const lowerPart = part.toLowerCase();
    // Bỏ qua các phần chứa từ khóa region/state/country
    if (lowerPart.includes('region of') ||
      lowerPart.includes('state') ||
      (lowerPart.includes('country') && !lowerPart.match(/\d/)) || // Bỏ "country" nhưng giữ nếu có số
      lowerPart === 'hungary' || lowerPart === 'magyarország') {
      return false;
    }
    return true;
  });

  // Loại bỏ các phần trùng lặp (ví dụ: "Budapest" xuất hiện 2 lần)
  // Ưu tiên giữ phần có zipcode (ví dụ: "1051 Budapest" thay vì chỉ "Budapest")
  const uniqueParts = [];
  const seenWords = new Set();

  // Đầu tiên, thêm các phần có zipcode (chứa số)
  for (const part of cleanedParts) {
    if (/\d/.test(part)) {
      uniqueParts.push(part);
      // Thêm các từ quan trọng vào seen (bỏ qua số và từ ngắn)
      part.split(/\s+/).forEach(word => {
        if (word.length >= 3 && !/\d/.test(word)) {
          seenWords.add(word.toLowerCase());
        }
      });
    }
  }

  // Sau đó, thêm các phần không có zipcode nhưng chưa bị trùng
  for (const part of cleanedParts) {
    if (!/\d/.test(part)) {
      const partWords = part.split(/\s+/).filter(w => w.length >= 3);
      const isDuplicate = partWords.some(word => seenWords.has(word.toLowerCase()));
      if (!isDuplicate) {
        uniqueParts.push(part);
        partWords.forEach(word => {
          seenWords.add(word.toLowerCase());
        });
      }
    }
  }

  return uniqueParts.join(", ");
};

// Frontend/src/utils/addressParser.js là bản sao của phần tách địa chỉ dưới đây — sửa cả hai nơi.

// Khách Hungary hay viết tắt loại đường ("Kossuth u. 5", "Teréz krt. 20") mà
// Nominatim không hiểu hết, nên mở rộng ra tên đầy đủ trước khi geocode
const STREET_ABBREVIATIONS = [
  ['krt', 'körút'],
  ['sgt', 'sugárút'],
  ['rkp', 'rakpart'],
  ['ltp', 'lakótelep'],
  ['stny', 'sétány'],
  ['u', 'utca'],
];

export const expandHungarianAbbreviations = (text = '') => {
  let result = (text || '').toString();
  for (const [abbr, full] of STREET_ABBREVIATIONS) {
    result = result.replace(new RegExp(`(^|\\s)${abbr}\\.?(?=[\\s,\\d]|$)`, 'gi'), `$1${full} `);
  }
  return result
    .replace(/(\d[a-zA-Z]?)\.(?=[\s,]|$)/g, '$1')
    .replace(/\s+,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

const STREET_TYPES = [
  'utca', 'útja', 'út', 'körút', 'körtér', 'tér', 'tere', 'köz', 'köze', 'sor', 'sora',
  'sétány', 'rakpart', 'lakótelep', 'sugárút', 'fasor', 'liget', 'park', 'dűlő', 'lejtő',
  'lépcső', 'udvar', 'kert', 'telep', 'tanya', 'árok', 'part', 'major', 'puszta',
  'ut', 'utja', 'korut', 'ter', 'koz', 'setany', 'sugarut', 'lakotelep', 'dulo',
  'krt', 'sgt', 'rkp', 'ltp', 'stny', 'u',
].sort((a, b) => b.length - a.length);
const STREET_TYPE_ALT = STREET_TYPES.join('|');
const HOUSE_NUMBER_PATTERN = '\\d+[a-zA-Z]?(?:\\s*[\\/\\-]\\s*[0-9a-zA-Z]+)*\\.?';
const STREET_SEGMENT_RE = new RegExp(
  `^((?:[^\\d,]*\\s)?(?:${STREET_TYPE_ALT}))\\.?(?=[\\s\\d]|$)\\s*(${HOUSE_NUMBER_PATTERN})?\\s*(.*)$`,
  'i'
);
const LEADING_HOUSE_RE = new RegExp(`^(${HOUSE_NUMBER_PATTERN})\\s+(\\D.*)$`);
const TRAILING_HOUSE_RE = new RegExp(`^(\\D.*?)\\s+(${HOUSE_NUMBER_PATTERN})(?:\\s+(\\D+))?$`);
const ENDS_WITH_STREET_TYPE_RE = new RegExp(`(?:^|\\s)(?:${STREET_TYPE_ALT})\\.?\\s*$`, 'i');
const COUNTRY_RE = /(^|,)\s*(hungary|magyarország|magyarorszag)\s*(?=,|$)/gi;

const cleanHouseNumber = (value = '') => value.replace(/\s+/g, '').replace(/\.$/, '');

// Tách chuỗi địa chỉ khách gõ thành street / houseNumber / city / zipcode.
// Hỗ trợ cả "Andrássy út 10, 1061 Budapest" lẫn "1061 Budapest, Andrássy út 10"
// và dạng không có dấu phẩy "Dózsa György út 12 Szigetszentmiklós".
export const parseHungarianAddress = (text = '') => {
  const result = { street: '', houseNumber: '', city: '', zipcode: '' };
  let rest = (text || '').toString().replace(COUNTRY_RE, '$1').trim();
  if (!rest) return result;

  // Mã bưu điện: số 4 chữ số đứng riêng, không nằm ngay sau loại đường (khi đó là số nhà)
  let cityAfterZip = '';
  const zipRe = /(^|[\s,])(\d{4})(?=[\s,]|$)/g;
  let match;
  while ((match = zipRe.exec(rest)) !== null) {
    const start = match.index + match[1].length;
    if (ENDS_WITH_STREET_TYPE_RE.test(rest.slice(0, start))) continue;
    result.zipcode = match[2];
    const after = rest.slice(start + 4);
    cityAfterZip = (after.match(/^\s+([^\s,\d]+)/) || [])[1] || '';
    rest = `${rest.slice(0, start)} ${after}`;
    break;
  }

  const segments = rest.split(',').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const cityParts = [];
  let streetFound = false;

  for (const segment of segments) {
    if (streetFound) {
      if (/[^\d\s.]/.test(segment)) cityParts.push(segment);
      continue;
    }

    let seg = segment;
    let leadingHouse = '';
    const leading = seg.match(LEADING_HOUSE_RE);
    if (leading) {
      leadingHouse = leading[1];
      seg = leading[2].trim();
    }

    const streetMatch = seg.match(STREET_SEGMENT_RE);
    if (!streetMatch) {
      if (leadingHouse) {
        result.houseNumber = cleanHouseNumber(leadingHouse);
        result.street = seg;
        streetFound = true;
      } else {
        cityParts.push(seg);
      }
      continue;
    }

    let street = streetMatch[1].trim();
    // "1061 Budapest Andrássy út 10": tên thành phố đứng ngay sau mã bưu điện
    if (cityAfterZip && street.split(' ').length > 2 &&
        street.toLowerCase().startsWith(`${cityAfterZip.toLowerCase()} `)) {
      street = street.slice(cityAfterZip.length).trim();
      cityParts.push(cityAfterZip);
    }
    result.street = street;
    result.houseNumber = cleanHouseNumber(streetMatch[2] || leadingHouse);
    if (streetMatch[3]?.trim()) cityParts.push(streetMatch[3].trim());
    streetFound = true;
  }

  // Không nhận ra loại đường: phần đầu tiên coi là đường (+ số nhà ở cuối), phần sau là thành phố
  if (!streetFound && cityParts.length > 1) {
    const first = cityParts.shift();
    const trailing = first.match(TRAILING_HOUSE_RE);
    result.street = trailing ? trailing[1].trim() : first;
    result.houseNumber = trailing ? cleanHouseNumber(trailing[2]) : '';
  } else if (!streetFound && cityParts.length === 1 && /\d/.test(cityParts[0])) {
    const trailing = cityParts[0].match(TRAILING_HOUSE_RE);
    if (trailing) {
      cityParts.shift();
      result.street = trailing[1].trim();
      result.houseNumber = cleanHouseNumber(trailing[2]);
      if (trailing[3]?.trim()) cityParts.push(trailing[3].trim());
    }
  } else if (!streetFound && cityParts.length === 1 && !result.zipcode) {
    // Một cụm chữ duy nhất (đang gõ dở) thường là tên đường
    result.street = cityParts.shift();
  }

  result.street = expandHungarianAbbreviations(result.street);
  result.city = (cityParts.find((p) => !/\d/.test(p)) || cityParts[0] || '').trim();
  return result;
};

// Ghép số nhà + tên đường thành 1 dòng cho email/PDF, tránh lặp số nhà nếu
// street đã chứa nó (dùng cho order.address đã lưu trong DB)
export const formatOrderStreetLine = (address = {}) => {
  const street = (address.street || '').toString().trim();
  const house = (address.houseNumber || '').toString().trim();
  if (!street && !house) return '';
  if (!house) return street;
  const streetAlreadyHasNumber = /^\d+/.test(street);
  const streetHasHouse = street && street.toLowerCase().includes(house.toLowerCase());
  if (streetAlreadyHasNumber || streetHasHouse) return street || house;
  return `${house} ${street}`.trim();
};
