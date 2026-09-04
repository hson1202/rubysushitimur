import React, { useState, useEffect } from 'react'
import './Blog.css'
import axios from 'axios'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import RichTextEditor from '../../components/RichTextEditor/RichTextEditor'
import config from '../../config/config'

const Blog = ({ url }) => {
  const { t } = useTranslation();
  const [blogList, setBlogList] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterLanguage, setFilterLanguage] = useState('all')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingBlog, setEditingBlog] = useState(null)
  const [blogStats, setBlogStats] = useState({})
  const [newBlog, setNewBlog] = useState({
    title: '',
    titleVI: '',
    titleEN: '',
    titleHU: '',
    slug: '',
    content: '',
    excerpt: '',
    author: 'Admin',
    category: 'General',
    tags: '',
    status: 'draft',
    featured: false,
    image: null,
    // language: 'vi', // Removed as requested
    readTime: '5 min read'
  })


  const tinymceConfig = {
    height: 500,
    menubar: true,
    plugins: [
      'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
      'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
      'insertdatetime', 'media', 'table', 'help', 'wordcount',
      'emoticons', 'codesample', 'pagebreak', 'nonbreaking', 'directionality'
    ],
    toolbar: [
      'undo redo | blocks | bold italic underline strikethrough | fontfamily fontsize | forecolor backcolor',
      'alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | removeformat | help',
      'table image media link codesample | subscript superscript | pagebreak nonbreaking',
      'searchreplace visualblocks code fullscreen | preview | ltr rtl | emoticons'
    ],
    paste_data_images: true,
    automatic_uploads: true,
    file_picker_types: 'image',
    images_upload_url: `${config.BACKEND_URL}/api/upload-image`,
    images_upload_handler: (blobInfo) => Promise.resolve(
      `data:${blobInfo.blob().type};base64,${blobInfo.base64()}`
    )
  }

  useEffect(() => {
    fetchBlogList()
    fetchBlogStats()
  }, [filterLanguage])

  const fetchBlogList = async () => {
    setIsLoading(true)
    try {
      const params = {};
      if (filterLanguage !== 'all') {
        params.language = filterLanguage;
      }
      console.log('Fetching blogs with params:', params);
      const response = await axios.get(`${config.BACKEND_URL}/api/blog/list`, { params })
      console.log('Blog response:', response.data);
      setBlogList(response.data.data)
    } catch (error) {
      console.error('Error fetching blog list:', error)
      toast.error('Failed to fetch blogs')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchBlogStats = async () => {
    try {
      const response = await axios.get(`${config.BACKEND_URL}/api/blog/stats`)
      setBlogStats(response.data.data)
    } catch (error) {
      console.error('Error fetching blog stats:', error)
    }
  }

  const handleAddBlog = async (e) => {
    e.preventDefault()
    
    if (!newBlog.title || !newBlog.content || !newBlog.excerpt) {
      toast.error('Please fill in all required fields')
      return
    }

    const formData = new FormData()
    formData.append('title', newBlog.title)
    formData.append('titleVI', newBlog.titleVI)
    formData.append('titleEN', newBlog.titleEN)
    formData.append('titleHU', newBlog.titleHU)
    formData.append('content', newBlog.content)
    formData.append('excerpt', newBlog.excerpt)
    formData.append('readTime', newBlog.readTime || '5 min read')
    formData.append('author', newBlog.author)
    formData.append('category', newBlog.category)
    formData.append('tags', newBlog.tags)
    formData.append('status', newBlog.status)
    formData.append('featured', newBlog.featured)
    // Language field removed as requested
    
    if (newBlog.image) {
      formData.append('image', newBlog.image)
    }

    setIsLoading(true)
    try {
              await axios.post(`${config.BACKEND_URL}/api/blog/add-test`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      toast.success('Blog added successfully')
      setNewBlog({
        title: '',
        titleVI: '',
        titleEN: '',
        titleHU: '',
        slug: '',
        content: '',
        excerpt: '',
        author: 'Admin',
        category: 'General',
        tags: '',
        status: 'draft',
        featured: false,
        image: null,
        // language: 'vi', // Removed as requested
        readTime: '5 min read'
      })
      setShowAddForm(false)
      fetchBlogList()
      fetchBlogStats()
    } catch (error) {
      console.error('Error adding blog:', error)
      toast.error('Failed to add blog')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteBlog = async (blogId) => {
    if (window.confirm('Are you sure you want to delete this blog?')) {
      try {
        await axios.delete(`${config.BACKEND_URL}/api/blog/${blogId}`)
        toast.success('Blog deleted successfully')
        fetchBlogList()
        fetchBlogStats()
      } catch (error) {
        console.error('Error deleting blog:', error)
        toast.error('Failed to delete blog')
      }
    }
  }

  const handleStatusToggle = async (blogId, currentStatus) => {
    try {
              await axios.put(`${config.BACKEND_URL}/api/blog/${blogId}/status`)
      toast.success('Blog status updated successfully')
      fetchBlogList()
      fetchBlogStats()
    } catch (error) {
      console.error('Error updating blog status:', error)
      toast.error('Failed to update blog status')
    }
  }

  const handleFeaturedToggle = async (blogId) => {
    try {
              await axios.put(`${config.BACKEND_URL}/api/blog/${blogId}/featured`)
      toast.success('Blog featured status updated successfully')
      fetchBlogList()
      fetchBlogStats()
    } catch (error) {
      console.error('Error updating featured status:', error)
      toast.error('Failed to update featured status')
    }
  }

  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setNewBlog({ ...newBlog, image: file })
    }
  }

  const handleEditImageChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setEditingBlog({ ...editingBlog, image: file })
    }
  }

  const handleEditBlog = async (e) => {
    e.preventDefault()
    
    if (!editingBlog.title || !editingBlog.content || !editingBlog.excerpt) {
      toast.error('Please fill in all required fields')
      return
    }

    const formData = new FormData()
    formData.append('title', editingBlog.title)
    formData.append('titleVI', editingBlog.titleVI)
    formData.append('titleEN', editingBlog.titleEN)
    formData.append('titleHU', editingBlog.titleHU)
    formData.append('content', editingBlog.content)
    formData.append('excerpt', editingBlog.excerpt)
    formData.append('readTime', editingBlog.readTime || '5 min read')
    formData.append('author', editingBlog.author)
    formData.append('category', editingBlog.category)
    formData.append('tags', editingBlog.tags)
    formData.append('status', editingBlog.status)
    formData.append('featured', editingBlog.featured)
    // Language field removed as requested
    
    if (editingBlog.image && editingBlog.image instanceof File) {
      formData.append('image', editingBlog.image)
    }

    setIsLoading(true)
    try {
              await axios.put(`${config.BACKEND_URL}/api/blog/${editingBlog._id}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      toast.success('Blog updated successfully')
      setEditingBlog(null)
      fetchBlogList()
      fetchBlogStats()
    } catch (error) {
      console.error('Error updating blog:', error)
      toast.error('Failed to update blog')
    } finally {
      setIsLoading(false)
    }
  }

  const filteredBlogs = blogList.filter(blog => {
    const matchesSearch = (blog.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (blog.content || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (blog.tags && Array.isArray(blog.tags) ? blog.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase())) : false)
    const matchesStatus = filterStatus === 'all' || blog.status === filterStatus
    return matchesSearch && matchesStatus
  })

  const getStatusBadge = (status) => {
    return (
      <span className={`status-badge ${status}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  return (
    <div className='blog-page'>
      <div className="blog-header">
        <h1>{t('blog.blogManagement')}</h1>
        <p>{t('blog.manageYourBlogPostsAndArticles')}</p>
        <button 
          onClick={() => setShowAddForm(!showAddForm)} 
          className="btn-add-blog"
        >
          {showAddForm ? t('blog.cancel') : t('blog.addNewBlog')}
        </button>
      </div>

      {/* Add Blog Form */}
      {showAddForm && (
        <div className="add-blog-section">
          <h2>{t('blog.addNewBlogPost')}</h2>
          <form onSubmit={handleAddBlog} className="blog-form">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="title">{t('blog.title')}</label>
                <input
                  type="text"
                  id="title"
                  value={newBlog.title}
                  onChange={(e) => setNewBlog({ ...newBlog, title: e.target.value })}
                  placeholder={t('blog.enterMainTitle')}
                />
              </div>
              <div className="form-group">
                <label htmlFor="author">{t('blog.author')}</label>
                <input
                  type="text"
                  id="author"
                  value={newBlog.author}
                  onChange={(e) => setNewBlog({ ...newBlog, author: e.target.value })}
                  placeholder={t('blog.enterAuthorName')}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="slug">{t('blog.slug') || 'Slug (URL)'}</label>
                <input
                  type="text"
                  id="slug"
                  value={newBlog.slug}
                  onChange={(e) => setNewBlog({ ...newBlog, slug: e.target.value })}
                  placeholder={t('blog.enterCustomSlug') || 'Enter custom URL slug (optional)'}
                />
                <small className="form-help">
                  {t('blog.slugHelp') || 'Leave empty to auto-generate from title. Use lowercase letters, numbers, and hyphens only.'}
                </small>
              </div>
              {/* Language field removed as requested */}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="titleVI">{t('blog.titleVI')}</label>
                <input
                  type="text"
                  id="titleVI"
                  value={newBlog.titleVI}
                  onChange={(e) => setNewBlog({ ...newBlog, titleVI: e.target.value })}
                  placeholder={t('blog.enterVietnameseTitle')}
                />
              </div>
              <div className="form-group">
                <label htmlFor="titleEN">{t('blog.titleEN')}</label>
                <input
                  type="text"
                  id="titleEN"
                  value={newBlog.titleEN}
                  onChange={(e) => setNewBlog({ ...newBlog, titleEN: e.target.value })}
                  placeholder={t('blog.enterEnglishTitle')}
                />
              </div>
            </div>

                          <div className="form-row">
                <div className="form-group">
                  <label htmlFor="titleHU">{t('blog.titleHU')}</label>
                  <input
                    type="text"
                    id="titleHU"
                    value={newBlog.titleHU}
                    onChange={(e) => setNewBlog({ ...newBlog, titleHU: e.target.value })}
                    placeholder={t('blog.enterHungarianTitle')}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="category">{t('blog.category')}</label>
                  <select
                    id="category"
                    value={newBlog.category}
                    onChange={(e) => setNewBlog({ ...newBlog, category: e.target.value })}
                  >
                    <option value="General">{t('blog.enterCategory')}</option>
                    <option value="Recipes">Recipes</option>
                    <option value="Culture">Culture</option>
                    <option value="Health">Health</option>
                    <option value="History">History</option>
                    <option value="News">News</option>
                  </select>
                </div>
              </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="image">{t('blog.image')}</label>
                <input
                  type="file"
                  id="image"
                  onChange={handleImageChange}
                  accept="image/*"
                />
              </div>
            </div>
            
            <div className="form-group">
              <label htmlFor="excerpt">{t('blog.excerpt')}</label>
              <textarea
                id="excerpt"
                value={newBlog.excerpt}
                onChange={(e) => setNewBlog({ ...newBlog, excerpt: e.target.value })}
                placeholder={t('blog.enterABriefExcerptMax200Characters')}
                rows="2"
                maxLength="200"
                required
              />
              <span className="char-count">{newBlog.excerpt.length}/200</span>
            </div>

            <div className="form-group">
              <label htmlFor="readTime">{t('blog.readTime')}</label>
              <input
                type="text"
                id="readTime"
                value={newBlog.readTime}
                onChange={(e) => setNewBlog({ ...newBlog, readTime: e.target.value })}
                placeholder="e.g., 5 min read"
                defaultValue="5 min read"
              />
            </div>

            <div className="form-group">
              <label htmlFor="content">{t('blog.content')}</label>
              
              <RichTextEditor
                value={newBlog.content}
                onEditorChange={(content) => setNewBlog({ ...newBlog, content })}
                init={tinymceConfig}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="tags">{t('blog.tags')}</label>
                <input
                  type="text"
                  id="tags"
                  value={newBlog.tags}
                  onChange={(e) => setNewBlog({ ...newBlog, tags: e.target.value })}
                  placeholder={t('blog.enterTagsSeparatedByCommas')}
                />
              </div>
              <div className="form-group">
                <label htmlFor="status">{t('blog.status')}</label>
                <select
                  id="status"
                  value={newBlog.status}
                  onChange={(e) => setNewBlog({ ...newBlog, status: e.target.value })}
                >
                  <option value="draft">{t('blog.draft')}</option>
                  <option value="published">{t('blog.published')}</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={newBlog.featured}
                  onChange={(e) => setNewBlog({ ...newBlog, featured: e.target.checked })}
                />
                {t('blog.featuredPost')}
              </label>
            </div>



            <div className="form-actions">
              <button type="submit" disabled={isLoading} className="btn-primary">
                {isLoading ? t('blog.adding') : t('blog.addBlog')}
              </button>
              <button 
                type="button" 
                onClick={() => setShowAddForm(false)} 
                className="btn-secondary"
              >
                {t('blog.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters and Search */}
      <div className="filters-section">
        <div className="search-box">
          <input
            type="text"
            placeholder={t('blog.searchBlogsByTitleContentOrTags')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-box">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="filter-select"
          >
            <option value="all">{t('blog.allStatus')}</option>
            <option value="published">{t('blog.published')}</option>
            <option value="draft">{t('blog.draft')}</option>
          </select>
        </div>
        <div className="filter-box">
          <select
            value={filterLanguage}
            onChange={(e) => {
              setFilterLanguage(e.target.value)
              fetchBlogList()
            }}
            className="filter-select"
          >
            <option value="all">{t('blog.allLanguages')}</option>
            <option value="vi">{t('blog.vietnamese')}</option>
            <option value="en">{t('blog.english')}</option>
            <option value="hu">{t('blog.hungarian')}</option>
          </select>
        </div>
      </div>

      {/* Blogs Grid */}
      <div className="blogs-section">
        {isLoading ? (
          <div className="loading">{t('blog.loadingBlogs')}</div>
        ) : (
          <div className="blogs-grid">
            {filteredBlogs.map((blog) => (
              <div key={blog._id} className="blog-card">
                <div className="blog-image">
                  {blog.image ? (
                    <img src={`${url}/uploads/${blog.image}`} alt={blog.title} />
                  ) : (
                    <div className="no-image">{t('blog.noImage')}</div>
                  )}
                  <div className="blog-overlay">
                    <button
                      onClick={() => handleStatusToggle(blog._id, blog.status)}
                      className={`status-toggle ${blog.status}`}
                    >
                      {getStatusBadge(blog.status)}
                    </button>
                    {blog.featured && (
                      <span className="featured-badge">{t('blog.featured')}</span>
                    )}
                  </div>
                </div>
                <div className="blog-content">
                  <div className="blog-header">
                    <h3>{(() => {
                      const currentLang = i18n.language || 'vi';
                      switch (currentLang) {
                        case 'vi':
                          return blog.titleVI || blog.title;
                        case 'en':
                          return blog.titleEN || blog.title;
                        case 'hu':
                          return blog.titleHU || blog.title;
                        default:
                          return blog.title;
                      }
                    })()}</h3>
                    <span className="blog-author">{t('blog.by')} {blog.author}</span>
                  </div>
                  <p className="blog-excerpt">{blog.excerpt}</p>
                  <div className="blog-tags">
                    {blog.tags && Array.isArray(blog.tags) ? blog.tags.map((tag, index) => (
                      <span key={index} className="tag">{tag}</span>
                    )) : null}
                  </div>
                  <div className="blog-meta">
                    <span className="blog-date">
                      {blog.publishedAt ? formatDate(blog.publishedAt) : formatDate(blog.createdAt)}
                    </span>
                    <span className="blog-views">👁️ {blog.views || 0} {t('blog.views')}</span>
                  </div>
                  <div className="blog-actions">
                    <button
                      onClick={() => handleFeaturedToggle(blog._id)}
                      className={`btn-featured ${blog.featured ? 'active' : ''}`}
                    >
                      {blog.featured ? t('blog.unfeature') : t('blog.feature')}
                    </button>
                    <button
                      onClick={() => setEditingBlog(blog)}
                      className="btn-edit"
                    >
                      {t('blog.edit')}
                    </button>
                    <button
                      onClick={() => handleDeleteBlog(blog._id)}
                      className="btn-delete"
                    >
                      {t('blog.delete')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Blog Modal */}
      {editingBlog && (
        <div className="edit-blog-modal">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{t('blog.editBlogPost')}</h2>
              <button 
                onClick={() => setEditingBlog(null)} 
                className="modal-close"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleEditBlog} className="blog-form">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="edit-title">{t('blog.title')}</label>
                  <input
                    type="text"
                    id="edit-title"
                    value={editingBlog.title}
                    onChange={(e) => setEditingBlog({ ...editingBlog, title: e.target.value })}
                    placeholder={t('blog.enterMainTitle')}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="edit-author">{t('blog.author')}</label>
                  <input
                    type="text"
                    id="edit-author"
                    value={editingBlog.author}
                    onChange={(e) => setEditingBlog({ ...editingBlog, author: e.target.value })}
                    placeholder={t('blog.enterAuthorName')}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="edit-slug">{t('blog.slug') || 'Slug (URL)'}</label>
                  <input
                    type="text"
                    id="edit-slug"
                    value={editingBlog.slug || ''}
                    onChange={(e) => setEditingBlog({ ...editingBlog, slug: e.target.value })}
                    placeholder={t('blog.enterCustomSlug') || 'Enter custom URL slug (optional)'}
                  />
                  <small className="form-help">
                    {t('blog.slugHelp') || 'Leave empty to auto-generate from title. Use lowercase letters, numbers, and hyphens only.'}
                  </small>
                </div>
                {/* Language field removed as requested */}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="edit-titleVI">{t('blog.titleVI')}</label>
                  <input
                    type="text"
                    id="edit-titleVI"
                    value={editingBlog.titleVI || ''}
                    onChange={(e) => setEditingBlog({ ...editingBlog, titleVI: e.target.value })}
                    placeholder={t('blog.enterVietnameseTitle')}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="edit-titleEN">{t('blog.titleEN')}</label>
                  <input
                    type="text"
                    id="edit-titleEN"
                    value={editingBlog.titleEN || ''}
                    onChange={(e) => setEditingBlog({ ...editingBlog, titleEN: e.target.value })}
                    placeholder={t('blog.enterEnglishTitle')}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="edit-titleHU">{t('blog.titleHU')}</label>
                  <input
                    type="text"
                    id="edit-titleHU"
                    value={editingBlog.titleHU || ''}
                    onChange={(e) => setEditingBlog({ ...editingBlog, titleHU: e.target.value })}
                    placeholder={t('blog.enterHungarianTitle')}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="edit-category">{t('blog.category')}</label>
                  <select
                    id="edit-category"
                    value={editingBlog.category || 'General'}
                    onChange={(e) => setEditingBlog({ ...editingBlog, category: e.target.value })}
                  >
                    <option value="General">General</option>
                    <option value="Recipes">Recipes</option>
                    <option value="Culture">Culture</option>
                    <option value="Health">Health</option>
                    <option value="History">History</option>
                    <option value="News">News</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="edit-image">{t('blog.image')}</label>
                  <input
                    type="file"
                    id="edit-image"
                    onChange={handleEditImageChange}
                    accept="image/*"
                  />
                  {editingBlog.image && (
                    <div className="current-image">
                      <img src={`${url}/uploads/${editingBlog.image}`} alt="Current" style={{ width: '100px', height: '60px', objectFit: 'cover', marginTop: '5px' }} />
                    </div>
                  )}
                </div>
              </div>
              
              <div className="form-group">
                <label htmlFor="edit-excerpt">{t('blog.excerpt')}</label>
                <textarea
                  id="edit-excerpt"
                  value={editingBlog.excerpt}
                  onChange={(e) => setEditingBlog({ ...editingBlog, excerpt: e.target.value })}
                  placeholder={t('blog.enterABriefExcerptMax200Characters')}
                  rows="2"
                  maxLength="200"
                  required
                />
                <span className="char-count">{editingBlog.excerpt.length}/200</span>
              </div>

              <div className="form-group">
                <label htmlFor="edit-readTime">{t('blog.readTime')}</label>
                <input
                  type="text"
                  id="edit-readTime"
                  value={editingBlog.readTime || '5 min read'}
                  onChange={(e) => setEditingBlog({ ...editingBlog, readTime: e.target.value })}
                  placeholder="e.g., 5 min read"
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-content">{t('blog.content')}</label>
                
                <RichTextEditor
                  value={editingBlog.content}
                  onEditorChange={(content) => setEditingBlog({ ...editingBlog, content })}
                  init={tinymceConfig}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="edit-tags">{t('blog.tags')}</label>
                  <input
                    type="text"
                    id="edit-tags"
                    value={editingBlog.tags && Array.isArray(editingBlog.tags) ? editingBlog.tags.join(', ') : ''}
                    onChange={(e) => setEditingBlog({ ...editingBlog, tags: e.target.value.split(',').map(tag => tag.trim()) })}
                    placeholder={t('blog.enterTagsSeparatedByCommas')}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="edit-status">{t('blog.status')}</label>
                  <select
                    id="edit-status"
                    value={editingBlog.status}
                    onChange={(e) => setEditingBlog({ ...editingBlog, status: e.target.value })}
                  >
                    <option value="draft">{t('blog.draft')}</option>
                    <option value="published">{t('blog.published')}</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={editingBlog.featured}
                    onChange={(e) => setEditingBlog({ ...editingBlog, featured: e.target.checked })}
                  />
                  {t('blog.featuredPost')}
                </label>
              </div>

              <div className="form-actions">
                <button type="submit" disabled={isLoading} className="btn-primary">
                  {isLoading ? t('blog.updating') : t('blog.updateBlog')}
                </button>
                <button 
                  type="button" 
                  onClick={() => setEditingBlog(null)} 
                  className="btn-secondary"
                >
                  {t('blog.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Blog Statistics */}
      <div className="blog-summary">
        <div className="summary-card">
          <h3>{t('blog.totalBlogs')}</h3>
          <p>{blogStats.totalBlogs || 0}</p>
        </div>
        <div className="summary-card">
          <h3>{t('blog.published')}</h3>
          <p>{blogStats.publishedBlogs || 0}</p>
        </div>
        <div className="summary-card">
          <h3>{t('blog.drafts')}</h3>
          <p>{blogStats.draftBlogs || 0}</p>
        </div>
        <div className="summary-card">
          <h3>{t('blog.featured')}</h3>
          <p>{blogStats.featuredBlogs || 0}</p>
        </div>
        <div className="summary-card">
          <h3>{t('blog.totalViews')}</h3>
          <p>{blogStats.totalViews || 0}</p>
        </div>
      </div>
    </div>
  )
}

export default Blog 