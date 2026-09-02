import React, { useEffect, useState } from 'react'
import './PageContent.css'
import axios from 'axios'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { Editor } from '@tinymce/tinymce-react'

const emptyTranslation = () => ({ title: '', content: '' })

const PageContent = ({ url }) => {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [activeLang, setActiveLang] = useState('hu')
  const [formData, setFormData] = useState({
    isPublished: true,
    translations: {
      hu: emptyTranslation(),
      vi: emptyTranslation(),
      en: emptyTranslation()
    }
  })

  const tinymceConfig = {
    height: 420,
    menubar: false,
    plugins: 'lists link table preview code fullscreen wordcount',
    toolbar: 'undo redo | blocks | bold italic underline | bullist numlist | table | link | preview code',
    content_style: 'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 14px; }',
    branding: false,
    promotion: false
  }

  const fetchPage = async () => {
    try {
      setIsLoading(true)
      const response = await axios.get(`${url}/api/page-content/delivery-info`, {
        headers: { token: localStorage.getItem('adminToken') || '' }
      })
      if (response.data.success) {
        const d = response.data.data
        setFormData({
          isPublished: d.isPublished !== false,
          translations: {
            hu: {
              title: d.translations?.hu?.title || '',
              content: d.translations?.hu?.content || ''
            },
            vi: {
              title: d.translations?.vi?.title || '',
              content: d.translations?.vi?.content || ''
            },
            en: {
              title: d.translations?.en?.title || '',
              content: d.translations?.en?.content || ''
            }
          }
        })
      }
    } catch (error) {
      console.error('Error fetching page content:', error)
      toast.error(t('pageContent.loadError'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchPage()
  }, [])

  const handleTitleChange = (lang, value) => {
    setFormData((prev) => ({
      ...prev,
      translations: {
        ...prev.translations,
        [lang]: { ...prev.translations[lang], title: value }
      }
    }))
  }

  const handleContentChange = (lang, value) => {
    setFormData((prev) => ({
      ...prev,
      translations: {
        ...prev.translations,
        [lang]: { ...prev.translations[lang], content: value }
      }
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      setIsSaving(true)
      const token = localStorage.getItem('adminToken')
      const response = await axios.put(`${url}/api/page-content/delivery-info`, formData, {
        headers: { token }
      })
      if (response.data.success) {
        toast.success(t('pageContent.saveSuccess'))
      } else {
        toast.error(response.data.message || t('pageContent.saveError'))
      }
    } catch (error) {
      toast.error(error.response?.data?.message || t('pageContent.saveError'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = async () => {
    if (!window.confirm(t('pageContent.resetConfirm'))) return
    try {
      setIsSaving(true)
      const token = localStorage.getItem('adminToken')
      const response = await axios.post(`${url}/api/page-content/delivery-info/reset`, {}, {
        headers: { token }
      })
      if (response.data.success) {
        toast.success(t('pageContent.resetSuccess'))
        await fetchPage()
      }
    } catch (error) {
      toast.error(t('pageContent.resetError'))
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="page-content-admin">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>{t('pageContent.loading')}</p>
        </div>
      </div>
    )
  }

  const langs = [
    { code: 'hu', flag: '🇭🇺', label: t('pageContent.langHu') },
    { code: 'vi', flag: '🇻🇳', label: t('pageContent.langVi') },
    { code: 'en', flag: '🇬🇧', label: t('pageContent.langEn') }
  ]

  return (
    <div className="page-content-admin">
      <div className="page-header">
        <div>
          <h1>🚚 {t('pageContent.title')}</h1>
          <p>{t('pageContent.subtitle')}</p>
        </div>
        <div className="header-actions">
          <button className="btn-reset" type="button" onClick={handleReset} disabled={isSaving}>
            ↺ {t('pageContent.reset')}
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-section">
          <label className="publish-toggle">
            <input
              type="checkbox"
              checked={formData.isPublished}
              onChange={(e) => setFormData((prev) => ({ ...prev, isPublished: e.target.checked }))}
            />
            {t('pageContent.published')}
          </label>
          <p className="field-hint">{t('pageContent.hint')}</p>
        </div>

        <div className="tabs">
          {langs.map((lang) => (
            <button
              key={lang.code}
              type="button"
              className={`tab ${activeLang === lang.code ? 'active' : ''}`}
              onClick={() => setActiveLang(lang.code)}
            >
              {lang.flag} {lang.label}
            </button>
          ))}
        </div>

        {langs.map((lang) => (
          <div
            key={lang.code}
            className="form-section"
            style={{ display: activeLang === lang.code ? 'block' : 'none' }}
          >
            <div className="form-group">
              <label>{t('pageContent.pageTitle')}</label>
              <input
                type="text"
                value={formData.translations[lang.code].title}
                onChange={(e) => handleTitleChange(lang.code, e.target.value)}
                placeholder={t('pageContent.pageTitlePlaceholder')}
              />
            </div>
            <div className="form-group">
              <label>{t('pageContent.body')}</label>
              <Editor
                apiKey="y36hnvlsoxs1oqqcctxdxjq5eyzpvsaiku7b09nh8dmr4mno"
                value={formData.translations[lang.code].content}
                onEditorChange={(content) => handleContentChange(lang.code, content)}
                init={tinymceConfig}
              />
            </div>
          </div>
        ))}

        <div className="form-actions">
          <button type="submit" className="btn-save" disabled={isSaving}>
            {isSaving ? `💾 ${t('pageContent.saving')}` : `💾 ${t('pageContent.save')}`}
          </button>
        </div>
      </form>
    </div>
  )
}

export default PageContent
