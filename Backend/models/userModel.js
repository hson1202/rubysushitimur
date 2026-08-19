import mongoose from "mongoose"

// Address subdocument schema for address book
const addressSchema = new mongoose.Schema({
    label: { 
        type: String, 
        required: true,
        trim: true,
        maxlength: 50 // e.g., "Home", "Work", "Office"
    },
    fullName: { 
        type: String, 
        required: true,
        trim: true,
        maxlength: 100 // Receiver's name (may differ from user name)
    },
    phone: { 
        type: String, 
        required: true,
        trim: true,
        maxlength: 25 // Receiver's phone (may differ from user phone)
    },
    street: { 
        type: String, 
        required: true,
        trim: true
    },
    houseNumber: { 
        type: String, 
        default: '',
        trim: true,
        maxlength: 20
    },
    city: { 
        type: String, 
        required: true,
        trim: true
    },
    state: { 
        type: String, 
        required: true,
        trim: true // State/Province/District
    },
    zipcode: { 
        type: String, 
        default: '',
        trim: true,
        maxlength: 20 // Postal code
    },
    country: { 
        type: String, 
        required: true,
        trim: true,
        default: 'Hungary' // Default based on your domain, can be changed
    },
    coordinates: {
        lat: { type: Number, required: false },
        lng: { type: Number, required: false }
    },
    isDefault: { 
        type: Boolean, 
        default: false 
    }
}, {
    timestamps: true // createdAt, updatedAt for each address
});

// User schema
const userSchema = new mongoose.Schema({
    // Basic profile information
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    phone: { type: String, default: '', trim: true },
    
    // Profile enhancements
    avatarUrl: { 
        type: String, 
        default: null,
        trim: true 
    },
    
    // Address book (new structured addresses)
    addresses: [addressSchema],
    
    // Reference to default address (for quick access)
    // This stores the _id of the address in the addresses array
    defaultAddressId: { 
        type: mongoose.Schema.Types.ObjectId, 
        default: null
        // Note: This references an _id within the addresses subdocument array
    },
    
    // Legacy/deprecated fields (kept for backward compatibility)
    address: { 
        type: String, 
        default: '',
        // Deprecated: Use addresses array instead
        // Kept for backward compatibility with existing data
    },
    
    // Cart and session data
    cartData: { type: Object, default: {} },
    
    // Role and status
    role: { type: String, enum: ['user', 'admin', 'moderator'], default: 'user' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    
    // Future extensions (prepared but not yet used)
    wishlist: { 
        type: [mongoose.Schema.Types.ObjectId], 
        default: [],
        ref: 'food' // Future: reference to food items
    },
    savedCarts: { 
        type: [{
            name: String,
            cartData: Object,
            createdAt: Date
        }], 
        default: [] 
    },
    preferences: {
        notifications: {
            email: { type: Boolean, default: true },
            sms: { type: Boolean, default: false },
            push: { type: Boolean, default: false }
        },
        marketing: {
            email: { type: Boolean, default: false },
            sms: { type: Boolean, default: false }
        },
        language: { type: String, default: 'vi' }
    }
}, { 
    minimize: false,
    timestamps: true // createdAt, updatedAt for user
});

// Index for faster queries
userSchema.index({ 'addresses._id': 1 });

// Middleware to ensure only one default address per user
userSchema.pre('save', function(next) {
    // If this is a new document or addresses array was modified
    if (this.isNew || this.isModified('addresses')) {
        const defaultAddresses = this.addresses.filter(addr => addr.isDefault === true);
        
        // If more than one default, keep only the first one
        if (defaultAddresses.length > 1) {
            // Set all to false first
            this.addresses.forEach(addr => addr.isDefault = false);
            // Set the first one (by creation date) as default
            const sorted = this.addresses.sort((a, b) => 
                (a.createdAt || new Date()) - (b.createdAt || new Date())
            );
            sorted[0].isDefault = true;
        }
        
        // Update defaultAddressId reference
        const defaultAddr = this.addresses.find(addr => addr.isDefault === true);
        this.defaultAddressId = defaultAddr ? defaultAddr._id : null;
    }
    
    next();
});

// Virtual to get default address (convenience method)
userSchema.virtual('defaultAddress').get(function() {
    if (this.defaultAddressId) {
        return this.addresses.id(this.defaultAddressId);
    }
    // Fallback: return first address if no default is set
    return this.addresses.length > 0 ? this.addresses[0] : null;
});

// Ensure virtuals are included in JSON output
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

const userModel = mongoose.models.user || mongoose.model("user", userSchema);

export default userModel;