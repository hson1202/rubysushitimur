import mongoose from "mongoose";

const allergenSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    match: /^[A-N]$/,
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  nameHU: {
    type: String,
    required: true,
    trim: true,
  },
  nameEN: {
    type: String,
    trim: true,
    default: "",
  },
  nameVI: {
    type: String,
    trim: true,
    default: "",
  },
  icon: {
    type: String,
    default: "",
  },
  sortOrder: {
    type: Number,
    default: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

allergenSchema.index({ sortOrder: 1, code: 1 });

const allergenModel = mongoose.models.allergen || mongoose.model("allergen", allergenSchema);

export default allergenModel;
