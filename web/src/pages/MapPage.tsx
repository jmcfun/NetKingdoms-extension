import { useEffect, useRef, useState, useCallback } from 'react'
import ForceGraph3D from 'react-force-graph-3d'
import * as THREE from 'three'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

interface Territory {
  domain: string; tier: string; zone: string
  first_seen_faction: string | null; dominant_faction: string | null
  is_contested: boolean; is_ephemeral: boolean; value_snapshot: number
}

interface GraphNode {
  id: string; name: string; isHub: boolean; zone: string
  tier?: string; faction?: string; isContested?: boolean; isEphemeral?: boolean
  val: number; color: string; domain?: string
}
interface GraphLink { source: string; target: string }

const FC: Record<string, string> = { Fondeurs: '#3c82f6', Spectres: '#8b5cf6', Nomades: '#22c55e' }
const ZC: Record<string, string> = {
  'Tech & Dev': '#3c82f6', 'Social & News': '#8b5cf6',
  'Culture & Niche': '#22c55e', Neutre: '#94a3b8',
}
const TS: Record<string, number> = { S: 12, A: 8, B: 6, C: 4, D: 3 }
const ZONES = ['Tech & Dev', 'Social & News', 'Culture & Niche', 'Neutre']

function activeFaction(t: Territory) { return t.dominant_faction ?? t.first_seen_faction }

function buildGraph(territories: Territory[]) {
  const hubs: GraphNode[] = ZONES.map((zone) => ({
    id: `hub_${zone}`, name: zone, isHub: true, zone, val: 18, color: ZC[zone] ?? '#94a3b8',
  }))
  const nodes: GraphNode[] = territories.map((t) => {
    const faction = activeFaction(t)
    return {
      id: t.domain, name: t.domain, isHub: false, zone: t.zone, tier: t.tier,
      faction: faction ?? undefined, isContested: t.is_contested, isEphemeral: t.is_ephemeral,
      val: TS[t.tier] ?? 3, color: faction ? (FC[faction] ?? '#94a3b8') : '#4b5563', domain: t.domain,
    }
  })
  const links: GraphLink[] = territories.map((t) => ({ source: t.domain, target: `hub_${t.zone}` }))
  return { nodes: [...hubs, ...nodes], links }
}

export default function MapPage() {
  const [territories, setTerritories] = useState<Territory[]>([])
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({ nodes: [], links: [] })
  const [loading, setLoading] = useState(true)
  const [filterFaction, setFilterFaction] = useState('Tous')
  const [filterZone, setFilterZone] = useState('Toutes')
  const [showContested, setShowContested] = useState(false)
  const [showEphemeral, setShowEphemeral] = useState(false)
  const [search, setSearch] = useState('')
  const [dimensions, setDimensions] = useState({ w: window.innerWidth, h: window.innerHeight - 56 })
  const fgRef = useRef<any>(null)

  useEffect(() => {
    const onResize = () => setDimensions({ w: window.innerWidth, h: window.innerHeight - 56 })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/territories?select=domain,tier,zone,first_seen_faction,dominant_faction,is_contested,is_ephemeral,value_snapshot&order=value_snapshot.desc&limit=1000`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    )
    if (res.ok) setTerritories(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    let f = territories
    if (search) f = f.filter((t) => t.domain.includes(search.toLowerCase()))
    if (filterFaction !== 'Tous') f = f.filter((t) => activeFaction(t) === filterFaction)
    if (filterZone !== 'Toutes') f = f.filter((t) => t.zone === filterZone)
    if (showContested) f = f.filter((t) => t.is_contested)
    if (showEphemeral) f = f.filter((t) => t.is_ephemeral)
    setGraphData(buildGraph(f))
  }, [territories, search, filterFaction, filterZone, showContested, showEphemeral])

  const nodeThreeObject = useCallback((node: GraphNode) => {
    const size = node.isHub ? 6 : (node.val ?? 3)
    const geo = new THREE.SphereGeometry(size, 16, 16)
    if (node.isEphemeral && !node.isHub) {
      const mat = new THREE.MeshLambertMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.85 })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.SphereGeometry(size + 2, 8, 8)),
        new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.6 })))
      return mesh
    }
    if (node.isContested && !node.isHub) {
      const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(node.color), transparent: true, opacity: 0.25 })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: new THREE.Color(node.color), opacity: 0.9, transparent: true })))
      return mesh
    }
    const mat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(node.color), transparent: node.isHub, opacity: node.isHub ? 0.28 : 0.88,
    })
    const mesh = new THREE.Mesh(geo, mat)
    if (node.isHub) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: new THREE.Color(node.color), opacity: 0.4, transparent: true })))
    return mesh
  }, [])

  const countFaction = (f: string) => territories.filter((t) => activeFaction(t) === f).length

  return (
    <div style={{ position: 'relative', width: '100vw', height: dimensions.h, overflow: 'hidden', background: '#020617' }}>
      {/* Overlay controls */}
      <div style={{
        position: 'absolute', top: 16, left: 16, zIndex: 10,
        display: 'flex', flexDirection: 'column', gap: 10,
        pointerEvents: 'none',
      }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', pointerEvents: 'auto' }}>
          <div>
            <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#4f46e5', marginBottom: 4 }}>
              NetKingdoms
            </p>
            <h2 style={{ color: '#e2e8f0', fontWeight: 800, fontSize: '1.3rem', margin: 0 }}>
              Carte des Territoires
            </h2>
            <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '4px 0 0' }}>
              {territories.length} territoires
              {territories.filter((t) => t.is_contested).length > 0 &&
                <span style={{ color: '#f97316' }}> · {territories.filter((t) => t.is_contested).length} contestés</span>}
              {territories.filter((t) => t.is_ephemeral).length > 0 &&
                <span style={{ color: '#f59e0b' }}> · {territories.filter((t) => t.is_ephemeral).length} éphémères</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, marginLeft: 20 }}>
            {(['Fondeurs', 'Spectres', 'Nomades'] as const).map((f) => (
              <div key={f} style={{
                padding: '8px 14px', borderRadius: 12,
                border: `1px solid ${FC[f]}40`, background: `${FC[f]}10`,
                textAlign: 'center',
              }}>
                <div style={{ color: FC[f], fontWeight: 800, fontSize: '1.2rem' }}>{countFaction(f)}</div>
                <div style={{ color: '#64748b', fontSize: '0.72rem' }}>{f}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, pointerEvents: 'auto' }}>
          <input
            style={{
              padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(148,163,184,0.15)',
              background: 'rgba(15,23,42,0.8)', color: '#e2e8f0', fontSize: '0.82rem',
              width: 160,
            }}
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {['Tous', 'Fondeurs', 'Spectres', 'Nomades'].map((f) => (
            <button key={f} onClick={() => setFilterFaction(f)} style={{
              padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${filterFaction === f ? (FC[f] ?? '#4f46e5') : 'rgba(148,163,184,0.15)'}`,
              background: filterFaction === f ? `${FC[f] ?? '#4f46e5'}20` : 'rgba(15,23,42,0.7)',
              color: filterFaction === f ? (FC[f] ?? '#e2e8f0') : '#94a3b8',
              fontSize: '0.8rem', fontWeight: filterFaction === f ? 700 : 400,
            }}>{f}</button>
          ))}
          <button onClick={() => setShowContested((v) => !v)} style={{
            padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
            border: `1px solid ${showContested ? '#f97316' : 'rgba(148,163,184,0.15)'}`,
            background: showContested ? 'rgba(249,115,22,0.15)' : 'rgba(15,23,42,0.7)',
            color: showContested ? '#f97316' : '#94a3b8', fontSize: '0.8rem',
          }}>⚡ Contestés</button>
          <button onClick={() => setShowEphemeral((v) => !v)} style={{
            padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
            border: `1px solid ${showEphemeral ? '#f59e0b' : 'rgba(148,163,184,0.15)'}`,
            background: showEphemeral ? 'rgba(245,158,11,0.15)' : 'rgba(15,23,42,0.7)',
            color: showEphemeral ? '#f59e0b' : '#94a3b8', fontSize: '0.8rem',
          }}>★ ×5</button>
          <button onClick={load} style={{
            padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
            border: '1px solid rgba(148,163,184,0.15)', background: 'rgba(15,23,42,0.7)',
            color: '#94a3b8', fontSize: '0.8rem',
          }}>↺</button>
        </div>

        {/* Zone filters */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', pointerEvents: 'auto' }}>
          {['Toutes', ...ZONES].map((z) => (
            <button key={z} onClick={() => setFilterZone(z)} style={{
              padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${filterZone === z ? (ZC[z] ?? '#4f46e5') : 'rgba(148,163,184,0.1)'}`,
              background: filterZone === z ? `${ZC[z] ?? '#4f46e5'}15` : 'rgba(15,23,42,0.5)',
              color: filterZone === z ? (ZC[z] ?? '#e2e8f0') : 'rgba(148,163,184,0.5)',
              fontSize: '0.75rem',
            }}>{z}</button>
          ))}
        </div>

        <p style={{ color: 'rgba(148,163,184,0.35)', fontSize: '0.72rem', pointerEvents: 'none' }}>
          Clic = ouvrir le site · Drag = tourner · Scroll = zoom
        </p>
      </div>

      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
          Chargement de la carte…
        </div>
      )}

      {!loading && (
        <ForceGraph3D
          ref={fgRef}
          graphData={graphData}
          width={dimensions.w}
          height={dimensions.h}
          backgroundColor="#020617"
          nodeThreeObject={nodeThreeObject}
          nodeLabel={(node: any) =>
            node.isHub
              ? `<div style="background:#0f172a;padding:6px 10px;border-radius:8px;color:#e2e8f0;font-size:13px">${node.name}</div>`
              : `<div style="background:#0f172a;padding:8px 12px;border-radius:8px;color:#e2e8f0;font-size:12px;border:1px solid ${FC[node.faction] ?? '#94a3b8'}40">
                  <strong>${node.domain}</strong><br/>
                  Tier ${node.tier} · ${node.zone}<br/>
                  ${node.faction ? `<span style="color:${FC[node.faction]}">${node.faction}</span>` : '<span style="color:#94a3b8">Non dominé</span>'}
                  ${node.isContested ? ' · <span style="color:#f97316">⚡ Contesté</span>' : ''}
                  ${node.isEphemeral ? ' · <span style="color:#f59e0b">★ ×5</span>' : ''}
                </div>`
          }
          linkColor={() => 'rgba(148,163,184,0.05)'}
          linkWidth={0.3}
          linkOpacity={0.3}
          onNodeClick={(node: any) => { if (!node.isHub && node.domain) window.open(`https://${node.domain}`, '_blank', 'noopener') }}
          nodeAutoColorBy={undefined}
        />
      )}
    </div>
  )
}
