import mongoose from 'mongoose'

const contactMessageSchema = new mongoose.Schema({
  messageNumber: {
    type: Number,
    unique: true
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address']
  },
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    enum: {
      values: ['general', 'reservation', 'feedback', 'complaint', 'partnership', 'other'],
      message: 'Please select a valid subject'
    }
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    trim: true,
    maxlength: [1000, 'Message cannot exceed 1000 characters']
  },
  status: {
    type: String,
    enum: ['unread', 'read', 'in-progress', 'resolved', 'closed'],
    default: 'unread'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  adminResponse: {
    type: String,
    trim: true,
    maxlength: [1000, 'Admin response cannot exceed 1000 characters']
  },
  respondedBy: {
    type: String,
    default: null
  },
  respondedAt: {
    type: Date,
    default: null
  },
  tags: [{
    type: String,
    trim: true
  }],
  source: {
    type: String,
    enum: ['website', 'email', 'phone', 'social-media'],
    default: 'website'
  }
}, {
  timestamps: true
})

// Auto-increment messageNumber before save
contactMessageSchema.pre('save', async function(next) {
  if (this.isNew && !this.messageNumber) {
    try {
      // Find the highest messageNumber
      const lastMessage = await this.constructor.findOne({}, { messageNumber: 1 })
        .sort({ messageNumber: -1 })
        .lean()
      
      this.messageNumber = lastMessage ? (lastMessage.messageNumber + 1) : 1
      console.log(`📋 Assigned messageNumber: ${this.messageNumber}`)
    } catch (error) {
      console.error('Error generating messageNumber:', error)
      // Fallback to timestamp-based number if error
      this.messageNumber = Date.now() % 1000000
    }
  }
  next()
})

// Index for better query performance
contactMessageSchema.index({ status: 1, createdAt: -1 })
contactMessageSchema.index({ subject: 1, status: 1 })
contactMessageSchema.index({ email: 1 })

// Virtual for response time
contactMessageSchema.virtual('responseTime').get(function() {
  if (this.respondedAt && this.createdAt) {
    return this.respondedAt - this.createdAt
  }
  return null
})

// Method to mark as read
contactMessageSchema.methods.markAsRead = function() {
  this.status = 'read'
  return this.save()
}

// Method to add admin response
contactMessageSchema.methods.addAdminResponse = function(response, adminName) {
  this.adminResponse = response
  this.respondedBy = adminName
  this.respondedAt = new Date()
  this.status = 'resolved'
  return this.save()
}

// Static method to get statistics
contactMessageSchema.statics.getStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ])
}

const ContactMessage = mongoose.model('ContactMessage', contactMessageSchema)

export default ContactMessage
