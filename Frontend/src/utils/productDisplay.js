export const formatProductDisplayName = (product = {}, fallbackName = '') => {
  const rawSku = product.sku ?? product.SKU;
  const sku = rawSku === undefined || rawSku === null ? '' : String(rawSku).trim();
  const rawName = fallbackName || product.name || '';
  const name = String(rawName).trim();

  if (!sku) return name;
  if (!name) return sku;

  const normalizedName = name.toLowerCase();
  const normalizedSku = sku.toLowerCase();
  const alreadyPrefixed =
    normalizedName === normalizedSku ||
    normalizedName.startsWith(`${normalizedSku}.`) ||
    normalizedName.startsWith(`${normalizedSku} `);

  return alreadyPrefixed ? name : `${sku}. ${name}`;
};

export const getDisplayDescription = (description = '') => {
  const text = description === undefined || description === null ? '' : String(description).trim();
  return text.toLowerCase() === 'no description provided' ? '' : text;
};

export const getLocalizedDescription = (product = {}, language = 'en') => {
  if (typeof product === 'string') return getDisplayDescription(product);
  const lang = String(language || 'en').split('-')[0].toLowerCase();
  const byLang = {
    vi: product.descriptionVI,
    en: product.descriptionEN,
    hu: product.descriptionHU,
  };
  return getDisplayDescription(byLang[lang] || product.description || '');
};
