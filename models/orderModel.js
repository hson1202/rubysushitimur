import mongoose from "mongoose"

const orderSchema = new mongoose.Schema({
    // Thông tin người dùng (có thể null nếu không đăng nhập)
    userId: { type: String, required: false },
    
    // Thông tin khách hàng (bắt buộc)
    customerInfo: {
        name: { type: String, required: true },
        phone: { type: String, required: true },
        email: { type: String, required: false }
    },
    
    // Thông tin đơn hàng
    items: { type: Array, required: true },
    amount: { type: Number, required: true },
    address: { type: Object, required: false },
    
    // Trạng thái và thanh toán
    status: { type: String, default: "Pending" },
    date: { type: Date, default: Date.now() },
    payment: { type: Boolean, default: false },
    // Hiện chỉ nhận 'cash' - 'card' để sẵn cho tương lai khi mở thanh toán thẻ
    paymentMethod: { type: String, enum: ['cash', 'card'], default: 'cash' },
    
    // Thông tin bổ sung
    orderType: { type: String, enum: ['guest', 'registered'], default: 'guest' },
    fulfillmentType: { type: String, enum: ['delivery', 'pickup', 'dinein'], default: 'delivery' },
    trackingCode: { type: String, unique: true, sparse: true }, // Mã dò đơn hàng
    language: { type: String, default: 'vi' }, // Ngôn ngữ khách hàng dùng khi đặt đơn (vi, en, hu)
    notes: { type: String, default: "" },
    note: { type: String, default: "" }, // Customer note for delivery
    preferredDeliveryTime: { type: String, default: "" }, // Preferred delivery time slot
    
    // Delivery information
    deliveryInfo: {
        zone: { type: String, required: false },
        distance: { type: Number, required: false },
        deliveryFee: { type: Number, required: false },
        estimatedTime: { type: Number, required: false }
    }
}, {
    timestamps: true
})

// Tạo mã dò đơn hàng tự động
orderSchema.pre('save', function(next) {
    if (!this.trackingCode) {
        // Tạo mã 8 ký tự: 2 chữ cái + 6 số
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const numbers = '0123456789';
        let code = '';
        
        // 2 chữ cái đầu
        for (let i = 0; i < 2; i++) {
            code += letters.charAt(Math.floor(Math.random() * letters.length));
        }
        
        // 6 số tiếp theo
        for (let i = 0; i < 6; i++) {
            code += numbers.charAt(Math.floor(Math.random() * numbers.length));
        }
        
        this.trackingCode = code;
    }
    next();
});

const orderModel = mongoose.models.order || mongoose.model("order", orderSchema)
export default orderModel;