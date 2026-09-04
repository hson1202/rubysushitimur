import { Editor } from '@tinymce/tinymce-react'

const DEFAULT_CONTENT_STYLE = [
  'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 14px; }',
  'table { border-collapse: collapse; width: 100%; }',
  'table th, table td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; }',
  'table th { background: #f3f4f6; font-weight: 700; }'
].join(' ')

const DEFAULT_PLUGINS = 'lists link table preview code fullscreen wordcount'

const DEFAULT_TOOLBAR = 'undo redo | blocks | bold italic underline | bullist numlist | table | link | preview code'

const tinymceScriptSrc = `${import.meta.env.BASE_URL}tinymce/tinymce.min.js`

const RichTextEditor = ({ value, onEditorChange, init = {}, ...rest }) => {
  const { content_style: extraContentStyle, ...restInit } = init

  return (
    <Editor
      tinymceScriptSrc={tinymceScriptSrc}
      licenseKey="gpl"
      value={value}
      onEditorChange={onEditorChange}
      init={{
        height: 420,
        menubar: false,
        plugins: DEFAULT_PLUGINS,
        toolbar: DEFAULT_TOOLBAR,
        branding: false,
        promotion: false,
        license_key: 'gpl',
        ...restInit,
        content_style: extraContentStyle
          ? `${DEFAULT_CONTENT_STYLE} ${extraContentStyle}`
          : DEFAULT_CONTENT_STYLE
      }}
      {...rest}
    />
  )
}

export default RichTextEditor
