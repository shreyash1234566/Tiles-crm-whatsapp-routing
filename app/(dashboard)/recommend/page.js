'use client'

import { useState } from 'react'
import { ImagePlus, Sparkles, Upload, X, AlertTriangle } from 'lucide-react'

const SURFACES = [
  ['floor', 'Floor tiles / stone flooring'],
  ['wall', 'Feature wall / wall cladding'],
  ['countertop', 'Kitchen platform / countertop'],
  ['backsplash', 'Kitchen backsplash'],
  ['staircase', 'Staircase treads / risers'],
  ['vanity', 'Vanity top'],
]

export default function RecommendPage() {
  const [roomFile, setRoomFile] = useState(null)
  const [surfaceFile, setSurfaceFile] = useState(null)
  const [maskFile, setMaskFile] = useState(null)
  const [target, setTarget] = useState('floor')
  const [instruction, setInstruction] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const runVisualization = async event => {
    event.preventDefault()
    if (!roomFile) { setError('Upload a site or room photo first.'); return }
    setLoading(true); setError(''); setResult(null)
    try {
      const formData = new FormData()
      formData.append('roomImage', roomFile)
      if (surfaceFile) formData.append('surface_reference', surfaceFile)
      if (maskFile) formData.append('surfaceMask', maskFile)
      formData.append('editInstruction', instruction || `Visualize a premium ${target} surface in this room`)
      formData.append('visualizationTarget', target)
      const response = await fetch('/api/recommend', { method: 'POST', body: formData })
      const payload = await response.json()
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Visualization could not be created')
      setResult(payload)
    } catch (err) {
      setError(err.message || 'Visualization could not be created')
    } finally { setLoading(false) }
  }

  return (
    <div className="w-full max-w-5xl space-y-5 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground">Surface Visualizer</h1>
        <p className="text-sm text-muted mt-1">Preview tiles, granite, marble or quartz on the actual floor, wall, countertop or staircase before approval.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <form onSubmit={runVisualization} className="glass-card p-4 md:p-5 space-y-5">
          <div>
            <label className="text-sm font-semibold text-foreground">Target surface</label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {SURFACES.map(([value, label]) => <button key={value} type="button" onClick={() => setTarget(value)} className={`px-3 py-2.5 rounded-xl border text-left text-xs transition-colors ${target === value ? 'border-accent bg-accent/10 text-accent font-semibold' : 'border-border bg-surface text-muted hover:border-accent/40'}`}>{label}</button>)}
            </div>
          </div>

          <FileUpload label="Site / room photo *" hint="Include the target floor, wall or countertop clearly in frame." file={roomFile} onChange={setRoomFile} />
          <FileUpload label="Tile / slab reference (optional)" hint="Upload a real tile, slab, sample or catalog image for closer material matching." file={surfaceFile} onChange={setSurfaceFile} />
          <FileUpload label="Surface mask (optional, Stability)" hint="White marks the area to edit; black marks everything to preserve." file={maskFile} onChange={setMaskFile} />

          <div>
            <label className="text-sm font-semibold text-foreground">Direction for the visualizer</label>
            <textarea value={instruction} onChange={event => setInstruction(event.target.value)} rows={3} placeholder="e.g. Replace the existing countertop with polished Black Galaxy granite; retain sink and hob cutouts." className="w-full mt-2" />
          </div>
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0" />Natural stone has real shade and vein variation. Use this for design discussion only; approve the physical lot/slab before cutting.</div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button disabled={loading} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-accent text-white font-semibold text-sm disabled:opacity-60"><Sparkles className="w-4 h-4" />{loading ? 'Creating surface preview…' : 'Generate surface preview'}</button>
        </form>

        <div className="glass-card p-4 md:p-5 min-h-[360px] md:min-h-[430px]">
          {!result && !loading && <div className="h-full min-h-[310px] md:min-h-[380px] flex flex-col items-center justify-center text-center text-muted"><ImagePlus className="w-12 h-12 opacity-25 mb-3" /><p className="font-medium">Your visualization will appear here</p><p className="text-xs mt-1 max-w-sm">Upload the project photo, choose a target surface, and optionally include a tile or stone reference.</p></div>}
          {loading && <div className="h-full min-h-[310px] md:min-h-[380px] flex flex-col items-center justify-center text-muted"><div className="animate-spin rounded-full h-9 w-9 border-b-2 border-accent mb-3" /><p className="text-sm text-center">Analysing the surface and its perspective…</p></div>}
          {result && <div className="space-y-4">{result.stagedImage && <img src={result.stagedImage} alt="AI surface visualization" className="w-full max-h-[360px] object-contain rounded-xl bg-surface" />}{result.isDemo && <p className="text-xs text-amber-700">Demo analysis shown because no live AI key is configured.</p>}{!result.isDemo && !result.stagedImage && <p className="text-xs text-amber-700">Material analysis completed, but no image-editing provider is configured. Add STABILITY_API_KEY, or use Gemini with a reference image, to render the edited preview.</p>}<div><h2 className="font-semibold text-foreground">{result.analysis?.overallAssessment || 'Surface recommendation'}</h2><p className="text-sm text-muted mt-1">{result.analysis?.targetSurface ? `Target: ${result.analysis.targetSurface}` : ''}</p></div>{(result.analysis?.recommendations || []).slice(0, 3).map((recommendation, index) => <div key={index} className="p-3 rounded-xl bg-surface border border-border"><p className="text-sm font-semibold text-foreground">{recommendation.category} · {recommendation.suggestedMaterial}</p><p className="text-xs text-muted mt-1">{recommendation.reason}</p></div>)}{(result.analysis?.designTips || []).length > 0 && <div className="p-3 rounded-xl bg-surface border border-border"><p className="text-xs font-semibold text-foreground">Practical checks</p><ul className="mt-1 space-y-1 text-xs text-muted list-disc list-inside">{result.analysis.designTips.slice(0, 3).map((tip, index) => <li key={index}>{tip}</li>)}</ul></div>}</div>}
        </div>
      </div>
    </div>
  )
}

function FileUpload({ label, hint, file, onChange }) {
  return <div><label className="text-sm font-semibold text-foreground">{label}</label><label className="mt-2 min-h-24 rounded-xl border-2 border-dashed border-border hover:border-accent/50 bg-surface flex items-center gap-3 p-4 cursor-pointer transition-colors overflow-hidden">{file ? <><div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0"><ImagePlus className="w-5 h-5 text-accent" /></div><div className="min-w-0 flex-1"><p className="text-sm font-medium text-foreground truncate">{file.name}</p><p className="text-xs text-muted">Click to replace</p></div><X className="w-4 h-4 text-muted ml-auto flex-shrink-0" /></> : <><Upload className="w-5 h-5 text-muted flex-shrink-0" /><div className="min-w-0"><p className="text-sm text-foreground">Upload image</p><p className="text-xs text-muted line-clamp-2">{hint}</p></div></>}<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={event => onChange(event.target.files?.[0] || null)} /></label></div>
}
