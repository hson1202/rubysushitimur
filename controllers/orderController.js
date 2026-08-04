import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js"
import { sendOrderConfirmation, sendAdminOrderNotification } from "../services/emailService.js"
import eventBus from "../services/eventBus.js"

// placing user order from frontend (hỗ trợ cả đăng nhập và không đăng nhập)
const placeOrder = async (req,res) => {
    try {
        const { userId, items, amount, address, customerInfo, orderType = 'guest', fulfillmentType = 'delivery', paymentMethod = 'cash' } = req.body;
        // 'dinein' đã bỏ khỏi UI đặt hàng - đơn cũ trong DB vẫn giữ giá trị này để hiển thị
        const allowedFulfillmentTypes = ['delivery', 'pickup'];
        const normalizedFulfillmentType = allowedFulfillmentTypes.includes(fulfillmentType) ? fulfillmentType : 'delivery';
        const isDelivery = normalizedFulfillmentType === 'delivery';
        // Hiện chỉ nhận tiền mặt - khi mở thanh toán thẻ thì thêm 'card' vào allowlist
        const allowedPaymentMethods = ['cash'];
        const normalizedPaymentMethod = allowedPaymentMethods.includes(paymentMethod) ? paymentMethod : 'cash';
        
        console.log('📦 Placing order with userId:', userId, 'orderType:', orderType, 'fulfillmentType:', normalizedFulfillmentType);
        
        // Validate required fields
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No items in order"
            });
        }

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid order amount"
            });
        }

        if (isDelivery && !address) {
            return res.status(400).json({
                success: false,
                message: "Delivery address is required"
            });
        }

        if (!customerInfo || !customerInfo.name || !customerInfo.phone) {
            return res.status(400).json({
                success: false,
                message: "Customer information is required"
            });
        }
        
        // Extract deliveryInfo from request body if provided
        const { deliveryInfo } = req.body;

        if (isDelivery) {
            // Validate address fields
            const requiredAddressFields = ['street', 'city', 'state', 'zipcode', 'country'];
            for (const field of requiredAddressFields) {
                if (!address[field]) {
                    return res.status(400).json({
                        success: false,
                        message: `Address field '${field}' is required`
                    });
                }
            }
        }
        
        // Kiểm tra userId có hợp lệ không (nếu có)
        let validUserId = null;
        if (userId) {
            try {
                const user = await userModel.findById(userId);
                if (user) {
                    validUserId = userId;
                    console.log(`✅ Valid user found: ${user.name} (${userId})`);
                } else {
                    console.log(`⚠️ Invalid userId provided: ${userId}`);
                }
            } catch (error) {
                console.log(`⚠️ Error validating userId: ${error.message}`);
            }
        }
        
        // Tạo đơn hàng mới
        const newOrder = new orderModel({
            userId: validUserId, // Sẽ có giá trị nếu user đã đăng nhập và hợp lệ
            items: items,
            amount: amount,
            address: isDelivery ? address : null,
            customerInfo: customerInfo,
            orderType: validUserId ? 'registered' : 'guest', // Tự động set dựa trên userId
            fulfillmentType: normalizedFulfillmentType,
            language: req.body.language || 'vi', // Lưu ngôn ngữ khách hàng dùng khi đặt đơn
            payment: true, // COD - thanh toán khi nhận hàng
            paymentMethod: normalizedPaymentMethod,
            status: "Pending",
            deliveryInfo: isDelivery ? (deliveryInfo || null) : null, // Lưu thông tin delivery (zone, distance, deliveryFee, estimatedTime)
            note: req.body.note || "",
            preferredDeliveryTime: req.body.preferredDeliveryTime || ""
        })
        
        await newOrder.save();
        
        console.log(`✅ Order created successfully with ID: ${newOrder._id}, userId: ${validUserId}`);
        // Emit internal event for realtime admin updates
        try {
            eventBus.emit('order:created', newOrder)
        } catch (emitErr) {
            console.log('⚠️ Failed to emit order:created event', emitErr?.message)
        }
        
        // Nếu có userId hợp lệ (đăng nhập), xóa giỏ hàng
        if (validUserId) {
            try {
                await userModel.findByIdAndUpdate(validUserId, { cartData: {} });
                console.log(`🛒 Cart cleared for user: ${validUserId}`);
            } catch (cartError) {
                console.log('Error clearing cart:', cartError);
                // Không fail order nếu chỉ lỗi xóa cart
            }
        }

        // Trả về ngay cho client để UX mượt mà
        res.json({
            success: true, 
            trackingCode: newOrder.trackingCode,
            orderId: newOrder._id,
            message: "Order placed successfully! You can track your order using the tracking code."
        })

        // Gửi email xác nhận đơn hàng ở chế độ nền (không block response)
        setImmediate(async () => {
            try {
                console.log('📧 Starting email sending process for order:', newOrder.trackingCode);
                
                // Gửi email cho khách hàng
                const emailResult = await sendOrderConfirmation(newOrder)
                if (emailResult && emailResult.success) {
                    console.log('✅ Order confirmation email sent successfully (background)')
                } else {
                    console.log('⚠️ Order confirmation email not sent (background):', emailResult?.message || 'Unknown error')
                }
                
                // Gửi email thông báo cho admin (QUAN TRỌNG!)
                console.log('📧 Sending admin notification email...');
                const adminEmailResult = await sendAdminOrderNotification(newOrder)
                if (adminEmailResult && adminEmailResult.success) {
                    console.log('✅ Admin order notification email sent successfully (background)')
                    console.log(`   Admin was notified about new order #${newOrder.trackingCode}`)
                } else {
                    console.error('❌ Admin order notification email FAILED (background)')
                    console.error('   Error:', adminEmailResult?.message || 'Unknown error')
                    console.error('   This is important - admin may not know about the new order!')
                    console.error('   Please check ADMIN_EMAIL and email service configuration')
                }
            } catch (emailError) {
                console.error('❌ Error sending emails (background):', emailError)
                console.error('   Stack:', emailError.stack)
            }
        })

    } catch (error) {
        console.log('Error placing order:', error);
        
        // Check for specific MongoDB errors
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: `Validation error: ${error.message}`
            });
        }
        
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "Duplicate order detected"
            });
        }
        
        res.status(500).json({
            success: false,
            message: "Internal server error while placing order"
        });
    }
}

const userOrders = async (req,res) => {
    try {
        const {userId} = req.body;
        
        console.log('🔍 Fetching orders for userId:', userId);
        
        if (!userId) {
            console.log('❌ No userId provided in request body');
            return res.status(400).json({
                success: false,
                message: "User ID is required"
            });
        }
        
        const orders = await orderModel.find({userId}).sort({ createdAt: -1 });
        
        console.log(`✅ Found ${orders.length} orders for user ${userId}`);
        
        res.json({
            success: true,
            data: orders,
            count: orders.length
        });
    } catch (error) {
        console.error('❌ Error in userOrders:', error);
        res.status(500).json({
            success: false,
            message: "Error fetching user orders",
            error: error.message
        });
    }
}

const listOrders = async (req,res) => {
    try {
        // Check if user is admin
        if (!req.body.isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin privileges required."
            });
        }
        
        const orders = await orderModel.find({}).sort({ createdAt: -1 });
        
        res.json({
            success: true,
            data: orders,
            count: orders.length
        });
    } catch (error) {
        console.error('Error in listOrders:', error);
        res.status(500).json({
            success: false,
            message: "Error fetching orders",
            error: error.message
        });
    }
}

const updateStatus = async (req,res) => {
    try {
        // Check if user is admin
        if (!req.body.isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin privileges required."
            });
        }
        
        const {orderId,status} = req.body;
        
        const updatedOrder = await orderModel.findByIdAndUpdate(orderId, {status}, {new: true});
        
        if (!updatedOrder) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }
        
        res.json({
            success: true,
            message: "Status Updated",
            data: updatedOrder
        });
    } catch (error) {
        console.error('Error in updateStatus:', error);
        res.status(500).json({
            success: false,
            message: "Error updating order status",
            error: error.message
        });
    }
}

const trackOrder = async (req,res) => {
    try {
        const {trackingCode, phone} = req.body;
        
        if (!trackingCode || !phone) {
            return res.json({success:false,message:"Tracking code and phone number are required"})
        }
        
        // Nếu có trackingCode, tìm order cụ thể
        if (trackingCode) {
            const order = await orderModel.findOne({
                trackingCode: trackingCode,
                'customerInfo.phone': phone
            });
            
            if (order) {
                res.json({success:true,data:order})
            } else {
                res.json({success:false,message:"Order not found with this tracking code and phone number"})
            }
        } else {
            // Nếu không có trackingCode, tìm tất cả orders của phone number
            const orders = await orderModel.find({
                'customerInfo.phone': phone
            }).sort({ createdAt: -1 });
            
            if (orders.length > 0) {
                res.json({success:true,data:orders})
            } else {
                res.json({success:false,message:"No orders found with this phone number"})
            }
        }
    } catch (error) {
        console.log(error);
        res.json({success:false,message:"Error"})
    }
}

const getOrderStats = async (req,res) => {
    try {
        const totalOrders = await orderModel.countDocuments();
        const pendingOrders = await orderModel.countDocuments({status: "Pending"});
        const outForDelivery = await orderModel.countDocuments({status: "Out for delivery"});
        const deliveredOrders = await orderModel.countDocuments({status: "Delivered"});
        
        res.json({
            success: true,
            stats: {
                total: totalOrders,
                pending: pendingOrders,
                outForDelivery: outForDelivery,
                delivered: deliveredOrders
            }
        })
    } catch (error) {
        console.log(error);
        res.json({success:false,message:"Error"})
    }
}

export { placeOrder, userOrders, listOrders, updateStatus, trackOrder, getOrderStats }