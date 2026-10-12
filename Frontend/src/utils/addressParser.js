// Bản sao của parseHungarianAddress ở Backend/utils/addressFormat.js — sửa cả hai nơi cùng lúc.

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
export const parseTypedAddress = (text = '') => {
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
