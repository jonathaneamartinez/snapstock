import { useState, useMemo } from 'react'
import { ChevronLeft, Search } from 'lucide-react'
import { useArtists } from '../../hooks/useArtists'
import { supabase } from '../../lib/supabase'
import { STORE_ID } from '../../constants'
import Spinner from '../ui/Spinner'
import { useQuery } from '@tanstack/react-query'

const CARD_BACK = 'https://images.pokemontcg.io/back.png'
const LANG_FLAG = { en: '🇬🇧', jp: '🇯🇵', cn: '🇨🇳' }

/* ── Tarjeta de artista ─────────────────────────────────────────────── */
function ArtistCard({ artist, onClick }) {
  const [src, setSrc] = useState(artist.sample_image_url || CARD_BACK)
  return (
    <button
      onClick={onClick}
      className="flex flex-col rounded-2xl overflow-hidden border border-gray-100 bg-white
                 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200
                 cursor-pointer group text-left"
    >
      <div className="aspect-[2.5/3.5] bg-gray-50 overflow-hidden">
        <img src={src} alt={artist.name} loading="lazy" onError={() => setSrc(CARD_BACK)}
          className="w-full h-full object-contain group-hover:scale-[1.04] transition-transform duration-300" />
      </div>
      <div className="p-2.5 flex flex-col gap-1">
        <p className="text-xs font-bold text-gray-800 leading-tight line-clamp-2">{artist.name}</p>
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] text-gray-400">{artist.card_count} cartas</span>
          <span className="flex gap-0.5">
            {(artist.languages || []).map(l => (
              <span key={l} className="text-[10px]">{LANG_FLAG[l] || ''}</span>
            ))}
          </span>
        </div>
      </div>
    </button>
  )
}

/* ── Detalle: cartas de un artista en el stock de la tienda ─────────── */
function useArtistCards(artistName) {
  return useQuery({
    queryKey: ['artist_cards', STORE_ID, artistName],
    enabled: !!artistName,
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select('card_id, cards!inner(id, name, set_name, card_number, image_url, language, artist)')
        .eq('store_id', STORE_ID)
        .eq('status', 'disponible')
        .eq('cards.artist', artistName)
        .limit(500)
      if (error) throw error
      const seen = new Set()
      return (data ?? [])
        .map(r => r.cards)
        .filter(c => c && !seen.has(c.id) && seen.add(c.id))
    },
  })
}

function ArtistDetail({ artistName, onBack }) {
  const { data: cards = [], isLoading } = useArtistCards(artistName)
  return (
    <div>
      <button onClick={onBack}
        className="flex items-center gap-1 text-sm text-violet-600 hover:text-violet-800 font-semibold mb-4">
        <ChevronLeft size={16} /> Volver a artistas
      </button>
      <div className="flex items-baseline gap-2 mb-4">
        <h3 className="text-lg font-bold text-gray-800">{artistName}</h3>
        <span className="text-sm text-gray-400">{cards.length} cartas en tu stock</span>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size={26} className="text-violet-400" /></div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {cards.map(c => (
            <div key={c.id} className="flex flex-col rounded-2xl overflow-hidden border border-gray-100 bg-white shadow-sm">
              <div className="aspect-[2.5/3.5] bg-gray-50 overflow-hidden">
                <img src={c.image_url || CARD_BACK} alt={c.name} loading="lazy"
                  onError={e => { e.currentTarget.src = CARD_BACK }}
                  className="w-full h-full object-contain" />
              </div>
              <div className="p-2 flex flex-col gap-0.5">
                <p className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2">{c.name}</p>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-gray-400 truncate">{c.set_name}</p>
                  {c.card_number && <span className="text-[9px] text-gray-300 shrink-0">#{c.card_number}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ═══ Vista principal de Artistas ═══════════════════════════════════ */
export default function ArtistsView() {
  const { artists, total, isLoading } = useArtists()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('count')   // 'count' | 'alpha'
  const [selected, setSelected] = useState(null)

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    let arr = term ? artists.filter(a => a.name.toLowerCase().includes(term)) : artists
    arr = [...arr]
    if (sort === 'alpha') arr.sort((a, b) => a.name.localeCompare(b.name))
    else arr.sort((a, b) => b.card_count - a.card_count)
    return arr
  }, [artists, q, sort])

  if (selected) return <ArtistDetail artistName={selected} onBack={() => setSelected(null)} />

  if (isLoading) {
    return <div className="flex justify-center py-20"><Spinner size={28} className="text-violet-400" /></div>
  }

  if (!artists.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <span className="text-5xl">🎨</span>
        <p className="font-semibold text-gray-600">Todavía no hay artistas identificados en tu stock</p>
        <p className="text-sm text-gray-400 max-w-sm">
          Se completan a medida que ingresás cartas nuevas.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar artista…"
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white
                       focus:outline-none focus:ring-2 focus:ring-violet-300 placeholder:text-gray-300" />
        </div>
        <div className="flex gap-2">
          {[['count', 'Por cantidad'], ['alpha', 'Alfabético']].map(([val, lbl]) => (
            <button key={val} onClick={() => setSort(val)}
              className={`px-3 py-2 rounded-xl text-sm font-semibold border transition
                ${sort === val ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              {lbl}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-3">{total} artistas en tu stock</p>

      {/* Grilla */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {list.map(a => (
          <ArtistCard key={a.name} artist={a} onClick={() => setSelected(a.name)} />
        ))}
      </div>
    </div>
  )
}
