import { useState } from 'react'
import { useClaimGenerator } from '../../hooks/useClaimGenerator'
import { useI18n } from '../../lib/i18n'
import Spinner from '../ui/Spinner'
import ClaimViewer from './ClaimViewer'

/* ─── Previsualización en miniatura de cada estilo ─────────────────── */
function PreviewA({ dark }) {
  return (
    <div className={`w-full aspect-[4/5] rounded-lg p-1.5 grid grid-cols-6 gap-0.5
      ${dark ? 'bg-[#0f0f1a]' : 'bg-gray-200'}`}>
      {Array.from({ length: 30 }).map((_, i) => (
        <div key={i} className={`rounded-[2px] aspect-[2.5/3.5]
          ${dark ? 'bg-gray-600' : 'bg-gray-400'}`} />
      ))}
    </div>
  )
}
function PreviewB({ dark }) {
  return (
    <div className={`w-full aspect-[3/4] rounded-lg p-1.5 grid grid-cols-5 gap-0.5
      ${dark ? 'bg-[#0f0f1a]' : 'bg-gray-200'}`}>
      {Array.from({ length: 25 }).map((_, i) => (
        <div key={i} className={`rounded-[2px] aspect-[2.5/3.5]
          ${dark ? 'bg-gray-600' : 'bg-gray-400'}`} />
      ))}
    </div>
  )
}

export default function ClaimOptionsModal({ cards, onClose, onConfirmed }) {
  const { t } = useI18n()
  const [style,     setStyle]     = useState('A')
  const [dark,      setDark]      = useState(true)
  const [showPrice, setShowPrice] = useState(true)
  const [title,     setTitle]     = useState('Disponibles')

  const { generating, progress, images, error, generate, reset } = useClaimGenerator()

  const STYLES = [
    { id: 'A', label: 'Collage', desc: t('claim_opt_style_desc_a'), Preview: PreviewA },
    { id: 'B', label: 'Grid',    desc: t('claim_opt_style_desc_b'), Preview: PreviewB },
  ]

  const handleGenerate = () =>
    generate({ cards, style, dark, showPrice, title })

  // Una vez generadas, mostrar el visor
  if (images.length > 0) {
    return (
      <ClaimViewer
        images={images}
        cards={cards}
        style={style}
        dark={dark}
        cardCount={cards.length}
        title={title}
        onBack={reset}
        onClose={onClose}
        onConfirmed={onConfirmed}
      />
    )
  }

  const perPage      = style === 'A' ? 30 : 25
  const pagesEst     = Math.ceil(cards.length / perPage) || 1

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-bold text-gray-800 text-sm">{t('claim_opt_prepare')}</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {cards.length} {t('claims_col_cards')} · {pagesEst} {pagesEst === 1 ? t('claim_opt_image') : t('claim_opt_images')}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        <div className="p-4 space-y-4">

          {/* Título */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">{t('claims_col_title')}</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t('claim_opt_title_ph')}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {/* Estilos */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2">{t('claims_col_style')}</label>
            <div className="grid grid-cols-2 gap-2">
              {STYLES.map(s => (
                <button
                  key={s.id}
                  onClick={() => setStyle(s.id)}
                  className={`rounded-xl border-2 p-2.5 text-left transition
                    ${style === s.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className="mb-2 w-full">
                    <s.Preview dark={dark} />
                  </div>
                  <p className="text-xs font-semibold text-gray-800">{s.id} — {s.label}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{s.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: t('claim_opt_dark_label'),  sub: t('claim_opt_dark_sub'),  val: dark,      set: setDark      },
              { label: t('claim_opt_price_label'), sub: t('claim_opt_price_sub'), val: showPrice, set: setShowPrice },
            ].map(opt => (
              <div key={opt.label}
                className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                <div>
                  <p className="text-xs font-medium text-gray-700">{opt.label}</p>
                  <p className="text-[10px] text-gray-400">{opt.sub}</p>
                </div>
                <button
                  onClick={() => opt.set(v => !v)}
                  className={`relative w-10 h-5 rounded-full transition-colors shrink-0 overflow-hidden
                    ${opt.val ? 'bg-blue-600' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow
                    transition-transform duration-200
                    ${opt.val ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            ))}
          </div>

          {/* Progreso */}
          {generating && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                  <Spinner size={11} className="text-blue-500" />
                  {t('claim_opt_generating')}
                </span>
                <span className="font-semibold text-blue-600">{progress}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <p className="text-red-500 text-xs bg-red-50 rounded-xl px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pb-4 shrink-0">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full py-2.5 bg-blue-600 text-white font-bold rounded-xl
                       hover:bg-blue-500 disabled:opacity-50 transition
                       flex items-center justify-center gap-2 text-sm"
          >
            {generating
              ? <><Spinner size={14} className="text-white" /> {t('claim_opt_generating')}</>
              : `${t('claim_opt_generate')} ${pagesEst} ${pagesEst === 1 ? t('claim_opt_image') : t('claim_opt_images')}`
            }
          </button>
        </div>
      </div>
    </div>
  )
}
