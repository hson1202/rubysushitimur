import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js"
import RestaurantInfo from "../models/restaurantInfoModel.js"
import { sendOrderConfirmation, sendAdminOrderNotification } from "../services/emailService.js"
import eventBus from "../services/eventBus.js"
import { calculateOrderTotal, getSystemFeeFromDB, validatePrice } from "../utils/priceCalculator.js"
import { isRestaurantOpen, getRestaurantStatus, normalizeWeeklyHours } from "../utils/restaurantHours.js"
import { resolveDelivery } from "../utils/deliveryCalculator.js"

// Mã bưu điện Hungary luôn gồm đúng 4 chữ số (ví dụ: 1061)
const HU_ZIPCODE_REGEX = /^\d{4}$/;

// placing user order from frontend (hỗ trợ cả đăng nhập và không đăng nhập)
const placeOrder = async (req, res) => {
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

        const restaurantInfo = await RestaurantInfo.getSingleton()
        const weeklyHours = normalizeWeeklyHours(restaurantInfo.weeklyHours)
        if (!isRestaurantOpen(weeklyHours)) {
            const status = getRestaurantStatus(weeklyHours, 'vi')
            return res.status(403).json({
                success: false,
                code: 'RESTAURANT_CLOSED',
                message: status.message || 'Nhà hàng hiện đang đóng cửa'
            })
        }

        if (isDelivery && restaurantInfo.deliveryEnabled === false) {
            return res.status(403).json({
                success: false,
                code: 'DELIVERY_DISABLED',
                message: 'Tạm thời không giao hàng được'
            })
        }

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

        if (!customerInfo || !customerInfo.name || !customerInfo.phone || !customerInfo.email) {
            return res.status(400).json({
                success: false,
                message: "Customer information is required"
            });
        }

        const customerEmail = String(customerInfo.email).trim().toLowerCase();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(customerEmail)) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid email address"
            });
        }
        customerInfo.email = customerEmail;

        // Extract deliveryInfo from request body if provided
        const { deliveryInfo } = req.body;

        // ============================================
        // Validate địa chỉ giao hàng: yêu cầu đủ 4 trường rõ ràng
        // (street, houseNumber, city, zipcode - không còn suy đoán số nhà bằng regex
        // trong chuỗi geocode như trước, vì dữ liệu OpenStreetMap ở Hungary hay thiếu
        // số nhà/zipcode. Frontend nay bắt khách tự xác nhận/sửa các trường này trực tiếp)
        // ============================================
        let normalizedAddress = null;
        if (isDelivery) {
            normalizedAddress = {
                ...address,
                street: (address.street || address.address || '').trim(),
                houseNumber: (address.houseNumber || '').toString().trim(),
                city: (address.city || '').trim(),
                // accept postalCode alias from older frontend pages
                zipcode: (address.zipcode || address.postalCode || '').toString().trim(),
            };

            const missingAddressFields = [];
            if (!normalizedAddress.street) missingAddressFields.push('street');
            if (!normalizedAddress.houseNumber) missingAddressFields.push('houseNumber');
            if (!normalizedAddress.city) missingAddressFields.push('city');
            if (!HU_ZIPCODE_REGEX.test(normalizedAddress.zipcode)) missingAddressFields.push('zipcode');

            if (missingAddressFields.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Address is incomplete or invalid. Missing/invalid fields: ${missingAddressFields.join(', ')}. Street, house number, city and a valid 4-digit Hungarian zipcode are required.`,
                    missingAddressFields
                });
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

        // Tự động chọn option đầu tiên (defaultChoiceCode) nếu món có options nhưng không có selectedOptions
        const processedItems = items.map(item => {
            // Nếu item có options nhưng không có selectedOptions hoặc selectedOptions rỗng
            if (item.options && Array.isArray(item.options) && item.options.length > 0) {
                // Kiểm tra xem có selectedOptions không
                const hasSelectedOptions = item.selectedOptions &&
                    typeof item.selectedOptions === 'object' &&
                    Object.keys(item.selectedOptions).length > 0;

                if (!hasSelectedOptions) {
                    // Tự động tạo selectedOptions với defaultChoiceCode cho mỗi option
                    const defaultSelectedOptions = {};
                    item.options.forEach(option => {
                        if (option.defaultChoiceCode) {
                            defaultSelectedOptions[option.name] = option.defaultChoiceCode;
                        } else if (option.choices && option.choices.length > 0) {
                            // Nếu không có defaultChoiceCode, chọn choice đầu tiên
                            defaultSelectedOptions[option.name] = option.choices[0].code;
                        }
                    });

                    if (Object.keys(defaultSelectedOptions).length > 0) {
                        console.log(`🔧 Auto-selected default options for item "${item.name}":`, defaultSelectedOptions);
                        return {
                            ...item,
                            selectedOptions: defaultSelectedOptions
                        };
                    }
                }
            }
            return item;
        });

        // ========================================
        // ✅ SERVER-SIDE DELIVERY + PRICE VALIDATION
        // ========================================
        console.log('💰 Validating order price from database...');

        let deliveryFee = 0;
        let systemFee = 0;
        let normalizedDeliveryInfo = null;

        if (isDelivery) {
            // Dùng toạ độ khách đã chọn/ghim (normalizedAddress.coordinates) để phí lúc đặt
            // khớp với phí đang hiển thị; chỉ geocode lại theo chữ khi không có toạ độ
            const deliveryResult = await resolveDelivery({
                address: normalizedAddress.fullAddress || undefined,
                structuredAddress: normalizedAddress
            });

            if (!deliveryResult.success) {
                return res.status(400).json({
                    success: false,
                    code: deliveryResult.code || 'DELIVERY_UNAVAILABLE',
                    message: deliveryResult.message,
                    messageEn: deliveryResult.messageEn,
                    messageHu: deliveryResult.messageHu,
                    outOfRange: deliveryResult.outOfRange || false
                });
            }

            const { zone, distance, coordinates } = deliveryResult.data;
            deliveryFee = Number(zone.deliveryFee) || 0;
            systemFee = await getSystemFeeFromDB();

            if (coordinates) {
                normalizedAddress.coordinates = coordinates;
            }

            normalizedDeliveryInfo = {
                zone: zone.name,
                distance,
                deliveryFee,
                systemFee: Number(systemFee),
                estimatedTime: zone.estimatedTime
            };

            console.log(`🚚 Server delivery resolved: zone=${zone.name}, fee=${deliveryFee} Ft, distance=${distance} km`);
        }

        const calculationResult = await calculateOrderTotal(processedItems, deliveryFee, systemFee);

        const validation = validatePrice(amount, calculationResult.total, 1); // 1 Ft tolerance

        if (!validation.isValid) {
            console.error('❌ PRICE MISMATCH DETECTED!');
            console.error(`   Client amount: ${Math.round(validation.clientAmount)} Ft`);
            console.error(`   Server amount: ${Math.round(validation.serverAmount)} Ft`);
            console.error(`   Difference: ${Math.round(validation.difference)} Ft`);
            console.error(`   Tolerance: ${validation.tolerance} Ft`);

            return res.status(400).json({
                success: false,
                code: 'PRICE_MISMATCH',
                message: "Price validation failed. Please refresh the page and try again.",
                ...(process.env.NODE_ENV !== 'production' ? {
                    debug: {
                        clientAmount: validation.clientAmount,
                        serverAmount: validation.serverAmount,
                        difference: validation.difference,
                        breakdown: calculationResult.breakdown
                    }
                } : {})
            });
        }

        console.log(`✅ Price validated successfully:`);
        console.log(`   Client: ${Math.round(validation.clientAmount)} Ft`);
        console.log(`   Server: ${Math.round(validation.serverAmount)} Ft`);
        console.log(`   Diff: ${Math.round(validation.difference)} Ft`);
        console.log(`   Items total: ${Math.round(calculationResult.itemsTotal)} Ft`);
        console.log(`   Box fee total: ${Math.round(calculationResult.boxFeeTotal)} Ft`);
        console.log(`   Delivery fee: ${Math.round(calculationResult.deliveryFee)} Ft`);
        console.log(`   System fee: ${Math.round(calculationResult.systemFee)} Ft`);

        // Tạo đơn hàng mới
        const newOrder = new orderModel({
            userId: validUserId, // Sẽ có giá trị nếu user đã đăng nhập và hợp lệ
            items: processedItems, // Sử dụng processedItems đã được xử lý options
            amount: calculationResult.total,
            address: isDelivery ? normalizedAddress : null,
            customerInfo: customerInfo,
            orderType: validUserId ? 'registered' : 'guest', // Tự động set dựa trên userId
            fulfillmentType: normalizedFulfillmentType,
            language: req.body.language || 'vi', // Lưu ngôn ngữ khách hàng dùng khi đặt đơn
            payment: true, // COD - thanh toán khi nhận hàng
            paymentMethod: normalizedPaymentMethod,
            status: "Pending",
            deliveryInfo: normalizedDeliveryInfo, // Lưu thông tin delivery (zone, distance, deliveryFee, systemFee, estimatedTime)
            note: req.body.note || "",
            preferredDeliveryTime: req.body.preferredDeliveryTime || ""
        })

        // Lưu đơn với retry khi trùng trackingCode (E11000):
        // mã sinh ngẫu nhiên nên hiếm khi trùng với đơn cũ, nhưng nếu trùng
        // thì sinh mã mới và lưu lại thay vì trả lỗi cho khách
        const MAX_TRACKING_CODE_RETRIES = 5;
        for (let attempt = 1; ; attempt++) {
            try {
                await newOrder.save();
                break;
            } catch (saveError) {
                const isTrackingCodeCollision =
                    saveError?.code === 11000 &&
                    (saveError.keyPattern?.trackingCode || saveError.message?.includes('trackingCode'));

                if (!isTrackingCodeCollision || attempt >= MAX_TRACKING_CODE_RETRIES) {
                    throw saveError;
                }

                console.log(`⚠️ Tracking code collision (${newOrder.trackingCode}), regenerating... (attempt ${attempt}/${MAX_TRACKING_CODE_RETRIES})`);
                newOrder.trackingCode = orderModel.generateTrackingCode();
            }
        }

        console.log(`✅ Order created successfully with ID: ${newOrder._id}, userId: ${validUserId}`);
        // Emit internal event for realtime admin updates
        try {
            eventBus.emit('order:created', newOrder)
        } catch (emitErr) {
            console.log('⚠️ Failed to emit order:created event', emitErr?.message)
        }

        // Nếu có userId hợp lệ (đăng nhập), xóa giỏ hàng và kiểm tra auto-save address
        if (validUserId) {
            try {
                // Load user to check addresses
                const user = await userModel.findById(validUserId);

                if (user) {
                    // Clear cart
                    user.cartData = {};

                    // Auto-create address from first order if user has zero addresses
                    if (isDelivery && (!user.addresses || user.addresses.length === 0)) {
                        console.log(`📍 User has zero addresses. Auto-creating address from order for user: ${validUserId}`);

                        // Map order address fields to user address schema
                        const newAddress = {
                            label: 'Home', // Default label for first address
                            fullName: customerInfo.name || '',
                            phone: customerInfo.phone || '',
                            street: normalizedAddress.street || '',
                            houseNumber: normalizedAddress.houseNumber || '',
                            city: normalizedAddress.city || '',
                            state: normalizedAddress.state || '',
                            zipcode: normalizedAddress.zipcode || '',
                            country: normalizedAddress.country || 'Hungary',
                            coordinates: normalizedAddress.coordinates || null,
                            isDefault: true // First address is always default
                        };

                        // Add address to user's addresses array
                        user.addresses.push(newAddress);

                        // Set defaultAddressId to the newly created address
                        // Note: We need to save first to get the _id, then update defaultAddressId
                        await user.save();

                        // Get the newly added address (last in array) and set as default
                        const addedAddress = user.addresses[user.addresses.length - 1];
                        user.defaultAddressId = addedAddress._id;
                        await user.save();

                        console.log(`✅ Auto-created default address for user: ${validUserId}`);
                    } else {
                        // User already has addresses, just save cartData
                        await user.save();
                    }

                    console.log(`🛒 Cart cleared for user: ${validUserId}`);
                }
            } catch (cartError) {
                console.log('Error clearing cart or auto-creating address:', cartError);
                // Không fail order nếu chỉ lỗi xóa cart hoặc tạo address
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

const userOrders = async (req, res) => {
    try {
        const { userId } = req.body;

        console.log('🔍 Fetching orders for userId:', userId);

        if (!userId) {
            console.log('❌ No userId provided in request body');
            return res.status(400).json({
                success: false,
                message: "User ID is required"
            });
        }

        const orders = await orderModel.find({ userId }).sort({ createdAt: -1 });

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

const listOrders = async (req, res) => {
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

const updateStatus = async (req, res) => {
    try {
        // Check if user is admin
        if (!req.body.isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin privileges required."
            });
        }

        const { orderId, status } = req.body;

        const updatedOrder = await orderModel.findByIdAndUpdate(orderId, { status }, { new: true });

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

const trackOrder = async (req, res) => {
    try {
        const { trackingCode, phone } = req.body;

        // Nếu có trackingCode, tìm order cụ thể
        if (trackingCode) {
            if (!phone) {
                return res.json({ success: false, message: "Tracking code and phone number are required" })
            }
            const order = await orderModel.findOne({
                trackingCode: trackingCode,
                'customerInfo.phone': phone
            });

            if (order) {
                res.json({ success: true, data: order })
            } else {
                res.json({ success: false, message: "Order not found with this tracking code and phone number" })
            }
        } else {
            // Nếu không có trackingCode, tìm tất cả orders của phone number
            const orders = await orderModel.find({
                'customerInfo.phone': phone
            }).sort({ createdAt: -1 });

            if (orders.length > 0) {
                res.json({ success: true, data: orders })
            } else {
                res.json({ success: false, message: "No orders found with this phone number" })
            }
        }
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: "Error" })
    }
}

const getOrderStats = async (req, res) => {
    try {
        const totalOrders = await orderModel.countDocuments();
        const pendingOrders = await orderModel.countDocuments({ status: "Pending" });
        const cancelledOrders = await orderModel.countDocuments({ status: "Cancelled" });
        const deliveredOrders = await orderModel.countDocuments({ status: "Delivered" });

        res.json({
            success: true,
            stats: {
                total: totalOrders,
                pending: pendingOrders,
                cancelled: cancelledOrders,
                delivered: deliveredOrders
            }
        })
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: "Error" })
    }
}

export { placeOrder, userOrders, listOrders, updateStatus, trackOrder, getOrderStats }