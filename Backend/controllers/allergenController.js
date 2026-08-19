import allergenModel from "../models/allergenModel.js";
import { LETTER_TO_CODE } from "../utils/allergens.js";

const DEFAULT_META = {
  gluten: { nameEN: "Gluten", nameVI: "Gluten", icon: "🌾" },
  crustaceans: { nameEN: "Crustaceans", nameVI: "Giáp xác", icon: "🦐" },
  egg: { nameEN: "Egg", nameVI: "Trứng", icon: "🥚" },
  fish: { nameEN: "Fish", nameVI: "Cá", icon: "🐟" },
  peanut: { nameEN: "Peanut", nameVI: "Đậu phộng", icon: "🥜" },
  soy: { nameEN: "Soy", nameVI: "Đậu nành", icon: "🫘" },
  milk: { nameEN: "Milk", nameVI: "Sữa", icon: "🥛" },
  nuts: { nameEN: "Nuts", nameVI: "Các loại hạt", icon: "🌰" },
  celery: { nameEN: "Celery", nameVI: "Cần tây", icon: "🥬" },
  mustard: { nameEN: "Mustard", nameVI: "Mù tạt", icon: "🟡" },
  sesame: { nameEN: "Sesame", nameVI: "Vừng", icon: "🌱" },
  sulfites: { nameEN: "Sulfites", nameVI: "Sulfit", icon: "🧪" },
  lupin: { nameEN: "Lupin", nameVI: "Đậu lupin", icon: "🌸" },
  molluscs: { nameEN: "Molluscs", nameVI: "Nhuyễn thể", icon: "🐚" },
};

const normalizeAllergenInput = (item = {}) => {
  const code = String(item.code || "").trim().toUpperCase();
  const nameHU = String(item.nameHU || item.name || "").trim();

  if (!code || !LETTER_TO_CODE[code]) {
    return { error: `Invalid allergen code: ${item.code || "(empty)"}` };
  }
  if (!nameHU) {
    return { error: `Missing Hungarian name for code ${code}` };
  }

  const slug = item.slug || LETTER_TO_CODE[code];
  const meta = DEFAULT_META[slug] || {};
  const sortOrder = Number.isFinite(Number(item.sortOrder))
    ? Number(item.sortOrder)
    : code.charCodeAt(0) - 64;

  return {
    data: {
      code,
      slug,
      nameHU,
      nameEN: item.nameEN || meta.nameEN || "",
      nameVI: item.nameVI || meta.nameVI || "",
      icon: item.icon || meta.icon || "",
      sortOrder,
      isActive: item.isActive !== undefined ? Boolean(item.isActive) : true,
    },
  };
};

export const getAllergens = async (req, res) => {
  try {
    const allergens = await allergenModel.find().sort({ sortOrder: 1, code: 1 });
    res.json({ success: true, count: allergens.length, data: allergens });
  } catch (error) {
    console.error("Error fetching allergens:", error);
    res.status(500).json({ success: false, message: "Error fetching allergens" });
  }
};

export const addAllergen = async (req, res) => {
  try {
    const parsed = normalizeAllergenInput(req.body);
    if (parsed.error) {
      return res.status(400).json({ success: false, message: parsed.error });
    }

    const allergen = await allergenModel.findOneAndUpdate(
      { code: parsed.data.code },
      { $set: parsed.data },
      { new: true, upsert: true, runValidators: true }
    );

    res.json({ success: true, message: "Allergen saved", data: allergen });
  } catch (error) {
    console.error("Error adding allergen:", error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: "Allergen already exists" });
    }
    res.status(500).json({ success: false, message: "Error adding allergen", error: error.message });
  }
};

export const bulkUpsertAllergens = async (req, res) => {
  try {
    const items = Array.isArray(req.body?.allergens) ? req.body.allergens : req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Send an array of allergens, or { allergens: [...] }",
      });
    }

    const errors = [];
    const ops = [];

    for (const item of items) {
      const parsed = normalizeAllergenInput(item);
      if (parsed.error) {
        errors.push(parsed.error);
        continue;
      }
      ops.push({
        updateOne: {
          filter: { code: parsed.data.code },
          update: { $set: parsed.data },
          upsert: true,
        },
      });
    }

    if (ops.length === 0) {
      return res.status(400).json({ success: false, message: "No valid allergens to import", errors });
    }

    const result = await allergenModel.bulkWrite(ops, { ordered: false });
    const data = await allergenModel.find().sort({ sortOrder: 1, code: 1 });

    res.json({
      success: true,
      message: `Imported ${ops.length} allergens`,
      upserted: result.upsertedCount,
      modified: result.modifiedCount,
      matched: result.matchedCount,
      errors,
      data,
    });
  } catch (error) {
    console.error("Error bulk importing allergens:", error);
    res.status(500).json({ success: false, message: "Error importing allergens", error: error.message });
  }
};
