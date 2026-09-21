import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Render del texto del modelo. react-markdown NO interpreta HTML crudo salvo que
 * se le agregue rehype-raw, así que un `<script>` en la respuesta del modelo se
 * muestra como texto. No usamos dangerouslySetInnerHTML en ningún lado.
 */
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Los links del modelo apuntan afuera: nueva pestaña y sin referrer.
          a: ({ children: text, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer noopener">
              {text}
            </a>
          ),
          table: ({ children: rows }) => (
            <div className="md__tablewrap">
              <table>{rows}</table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
