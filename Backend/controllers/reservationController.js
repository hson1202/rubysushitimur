import reservationModel from "../models/reservationModel.js"
import RestaurantInfo from "../models/restaurantInfoModel.js"
import { sendReservationConfirmation, sendAdminReservationNotification, sendStatusUpdateEmail } from "../services/emailService.js"
import {
  normalizeWeeklyHours,
  isTimeWithinBusinessHours,
  generateTimeSlotsForDate,
  getHoursForDate,
  formatOpeningHoursLegacy
} from "../utils/restaurantHours.js"
import { calendarDateKey, setActiveRestaurantTimeZone } from "../utils/timeZone.js"

// Helper function to validate email
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// Helper function to validate phone number
const isValidPhone = (phone) => {
  // Remove all non-digit characters and check if we have at least 10 digits
  const digitsOnly = phone.replace(/\D/g, '')
  return digitsOnly.length >= 10
}

// Helper function to check if date is in the past
const isDateInPast = async (date) => {
  const info = await RestaurantInfo.getSingleton()
  setActiveRestaurantTimeZone(info.timeZone)
  const selected = String(date).slice(0, 10)
  return selected < calendarDateKey(new Date(), info.timeZone)
}

// Helper function to check business hours using restaurant weekly schedule
const isWithinBusinessHours = async (date, time) => {
  const info = await RestaurantInfo.getSingleton()
  setActiveRestaurantTimeZone(info.timeZone)
  const weeklyHours = normalizeWeeklyHours(info.weeklyHours)
  return isTimeWithinBusinessHours(weeklyHours, date, time)
}

// Helper function to generate available time slots based on weekly schedule
const generateAvailableTimeSlots = async (date) => {
  const info = await RestaurantInfo.getSingleton()
  setActiveRestaurantTimeZone(info.timeZone)
  const weeklyHours = normalizeWeeklyHours(info.weeklyHours)
  return generateTimeSlotsForDate(weeklyHours, date)
}

// Create new reservation
export const createReservation = async (req, res) => {
    try {
        console.log('📝 Creating reservation with data:', req.body)
        const { customerName, phone, email, reservationDate, reservationTime, numberOfPeople, note } = req.body

        // Validate required fields
        if (!customerName || !phone || !email || !reservationDate || !reservationTime || !numberOfPeople) {
            return res.status(400).json({ 
                success: false, 
                message: "All required fields must be provided" 
            })
        }

        // Validate email format
        if (!isValidEmail(email)) {
            return res.status(400).json({ 
                success: false, 
                message: "Please provide a valid email address" 
            })
        }

        // Validate phone format
        console.log('📞 Validating phone:', phone)
        if (!isValidPhone(phone)) {
            console.log('❌ Phone validation failed for:', phone)
            return res.status(400).json({ 
                success: false, 
                message: "Please provide a valid phone number" 
            })
        }
        console.log('✅ Phone validation passed')

        // Validate customer name (at least 2 characters)
        if (customerName.trim().length < 2) {
            return res.status(400).json({ 
                success: false, 
                message: "Customer name must be at least 2 characters long" 
            })
        }

        // Validate date (must not be in the past)
        if (await isDateInPast(reservationDate)) {
            return res.status(400).json({ 
                success: false, 
                message: "Reservation date cannot be in the past. Please select today or a future date." 
            })
        }

        // Validate business hours
        if (!(await isWithinBusinessHours(reservationDate, reservationTime))) {
            const info = await RestaurantInfo.getSingleton()
            const weeklyHours = normalizeWeeklyHours(info.weeklyHours)
            const hours = getHoursForDate(weeklyHours, reservationDate)
            if (hours.isClosed) {
                return res.status(400).json({
                    success: false,
                    message: "The restaurant is closed on the selected date"
                })
            }
            return res.status(400).json({
                success: false,
                message: `Reservations are only available from ${hours.openTime} to ${hours.closeTime}`
            })
        }

        // Validate number of people
        if (numberOfPeople < 1 || numberOfPeople > 20) {
            return res.status(400).json({ 
                success: false, 
                message: "Number of people must be between 1 and 20" 
            })
        }

        // Check if there's already a reservation for the same time slot
        const reservationDateTime = new Date(reservationDate)
        const existingReservation = await reservationModel.findOne({
            reservationDate: reservationDateTime,
            reservationTime: reservationTime,
            status: { $in: ['pending', 'confirmed'] }
        })

        if (existingReservation) {
            return res.status(400).json({ 
                success: false, 
                message: "This time slot is already booked. Please choose a different time." 
            })
        }

        const newReservation = new reservationModel({
            customerName: customerName.trim(),
            phone: phone.trim(),
            email: email.toLowerCase().trim(),
            reservationDate: reservationDateTime,
            reservationTime,
            numberOfPeople,
            note: note ? note.trim() : ''
        })

        console.log('💾 Saving reservation to database...')
        await newReservation.save()
        console.log('✅ Reservation saved successfully with ID:', newReservation._id)

        // Send emails in background (non-blocking)
        setImmediate(async () => {
            // 1. Send confirmation email to customer
            try {
                const emailResult = await sendReservationConfirmation(newReservation)
                if (emailResult && emailResult.success) {
                    console.log('✅ Confirmation email sent to customer:', newReservation.email)
                } else {
                    console.log('⚠️ Customer email not sent:', emailResult?.message || 'Unknown error')
                }
            } catch (emailError) {
                console.error('❌ Error sending customer confirmation email:', emailError)
            }

            // 2. Send notification email to admin
            try {
                const adminEmailResult = await sendAdminReservationNotification(newReservation)
                if (adminEmailResult && adminEmailResult.success) {
                    console.log('✅ Reservation notification email sent to admin')
                } else {
                    console.log('⚠️ Admin notification not sent:', adminEmailResult?.message || 'Unknown error')
                }
            } catch (adminEmailError) {
                console.error('❌ Error sending admin reservation notification:', adminEmailError)
            }
        })

        const response = {
            success: true,
            message: "Reservation created successfully! We will confirm your booking within 2 hours. Please check your email for confirmation details.",
            data: newReservation
        }
        console.log('✅ Sending success response:', response)
        res.status(201).json(response)
    } catch (error) {
        console.error("❌ Error creating reservation:", error)
        console.error("❌ Error stack:", error.stack)
        
        // Handle duplicate key errors
        if (error.code === 11000) {
            console.log('⚠️ Duplicate key error detected')
            return res.status(400).json({
                success: false,
                message: "A reservation with this information already exists"
            })
        }
        
        const errorResponse = {
            success: false,
            message: "Internal server error. Please try again later.",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        }
        console.log('❌ Sending error response:', errorResponse)
        res.status(500).json(errorResponse)
    }
}

// Get all reservations (admin only)
export const getAllReservations = async (req, res) => {
    try {
        const reservations = await reservationModel.find().sort({ createdAt: -1 })
        
        res.status(200).json({
            success: true,
            data: reservations
        })
    } catch (error) {
        console.error("Error fetching reservations:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        })
    }
}

// Get reservation by ID
export const getReservationById = async (req, res) => {
    try {
        const { id } = req.params
        const reservation = await reservationModel.findById(id)
        
        if (!reservation) {
            return res.status(404).json({
                success: false,
                message: "Reservation not found"
            })
        }

        res.status(200).json({
            success: true,
            data: reservation
        })
    } catch (error) {
        console.error("Error fetching reservation:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        })
    }
}

// Update reservation status (admin only)
export const updateReservationStatus = async (req, res) => {
    try {
        console.log('Update reservation status request:', { 
            id: req.params.id, 
            body: req.body, 
            userId: req.body.userId,
            isAdmin: req.body.isAdmin 
        })
        
        const { id } = req.params
        const { status, adminNote } = req.body

        if (!status) {
            console.log('Status is missing')
            return res.status(400).json({
                success: false,
                message: "Status is required"
            })
        }

        const validStatuses = ['pending', 'completed', 'cancelled']
        console.log('Validating status:', status, 'against valid statuses:', validStatuses)
        if (!validStatuses.includes(status)) {
            console.log('Invalid status:', status)
            return res.status(400).json({
                success: false,
                message: "Invalid status"
            })
        }

        // Get current reservation to check old status
        const currentReservation = await reservationModel.findById(id)
        if (!currentReservation) {
            return res.status(404).json({
                success: false,
                message: "Reservation not found"
            })
        }

        const oldStatus = currentReservation.status

        const updateData = { status }
        if (adminNote) updateData.adminNote = adminNote
        
        // If completing, add completion details
        if (status === 'completed') {
            updateData.completedBy = req.body.userId || 'Admin'
            updateData.completedAt = new Date()
        }
        
        // If going back to pending, clear completion details
        if (status === 'pending') {
            updateData.completedBy = null
            updateData.completedAt = null
        }

        console.log('Update data:', updateData)

        const updatedReservation = await reservationModel.findByIdAndUpdate(
            id,
            updateData,
            { new: true }
        )

        if (!updatedReservation) {
            return res.status(404).json({
                success: false,
                message: "Reservation not found"
            })
        }

        // Send status update email if status changed
        if (oldStatus !== status) {
            try {
                await sendStatusUpdateEmail(updatedReservation, oldStatus, status)
                console.log('Status update email sent successfully')
            } catch (emailError) {
                console.error('Error sending status update email:', emailError)
                // Don't fail the update if email fails
            }
        }

        res.status(200).json({
            success: true,
            message: "Reservation status updated successfully",
            data: updatedReservation
        })
    } catch (error) {
        console.error("Error updating reservation:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        })
    }
}

// Delete reservation (admin only)
export const deleteReservation = async (req, res) => {
    try {
        const { id } = req.params
        const deletedReservation = await reservationModel.findByIdAndDelete(id)

        if (!deletedReservation) {
            return res.status(404).json({
                success: false,
                message: "Reservation not found"
            })
        }

        res.status(200).json({
            success: true,
            message: "Reservation deleted successfully"
        })
    } catch (error) {
        console.error("Error deleting reservation:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        })
    }
}

// Get reservations by date range (admin only)
export const getReservationsByDateRange = async (req, res) => {
    try {
        const { startDate, endDate } = req.query
        
        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: "Start date and end date are required"
            })
        }

        const start = new Date(startDate)
        const end = new Date(endDate)

        const reservations = await reservationModel.find({
            reservationDate: {
                $gte: start,
                $lte: end
            }
        }).sort({ reservationDate: 1, reservationTime: 1 })

        res.status(200).json({
            success: true,
            data: reservations
        })
    } catch (error) {
        console.error("Error fetching reservations by date range:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        })
    }
}

// Get available time slots for a specific date
export const getAvailableTimeSlots = async (req, res) => {
    try {
        const { date } = req.params
        
        if (!date) {
            return res.status(400).json({
                success: false,
                message: "Date parameter is required"
            })
        }

        // Check if date is in the past
        if (await isDateInPast(date)) {
            return res.status(400).json({
                success: false,
                message: "Cannot get time slots for past dates"
            })
        }

        const info = await RestaurantInfo.getSingleton()
        const weeklyHours = normalizeWeeklyHours(info.weeklyHours)
        const availableSlots = await generateAvailableTimeSlots(date)
        const hours = getHoursForDate(weeklyHours, date)
        const legacy = formatOpeningHoursLegacy(weeklyHours, 'en')
        const businessHours = new Date(date).getDay() === 0
            ? legacy.sunday
            : legacy.weekdays
        
        res.status(200).json({
            success: true,
            data: {
                date,
                availableSlots,
                businessHours,
                isClosed: hours.isClosed
            }
        })
    } catch (error) {
        console.error("Error getting available time slots:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error. Please try again later.",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        })
    }
}
