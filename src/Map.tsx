import { useEffect, useRef, useState, useCallback } from 'react'
import ForceGraph3D from 'react-force-graph-3d'
import * as THREE from 'three'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

interface Territory {
  domain: string
  tier: string
  zone: string
  first_seen_faction: string | null
  dominant_faction: string | null
  is_contested: boolean
  is_ephemeral: boolean
  value_snapshot: number
  last_visit_at: string | null
}

interface GraphNode {
  id: string
  name: string
  isHub: boolean
  zone: string
  tier?: string
  faction?: string
  isContested?: boolean
  isEphemeral?: boolean
  val: number
  color: string
  domain?: string
}

interface GraphLink { source: string; target: string }

const FACTION_COLORS: Record<string, string> = {
  Fondeurs: '#3c82f6',
  Spectres: '#8b5cf6',
  Nomades: '#22c55e',
}
const ZONE_COLORS: Record<string, string> = {
  'Tech & Dev': '#3c82f6',
  'Social & News': '#8b5cf6',
  'Culture & Niche': '#22c55e',
  Neutre: '#94a3b8',
}
const TIER_SIZE: Record<string, number> = { S: 12, A: 8, B: 6, C: 4, D: 3 }
const ZONES = ['Tech & Dev', 'Social & News', 'Culture & Niche', 'Neutre']

function activeFaction(t: Territory) {
  return t.dominant_faction ?? t.first_seen_faction
}

function buildGraph(territories: Territory[]) {
  const hubs: GraphNode[] = ZONES.map((zone) => ({
    id: `hub_${zone}`, name: zone, isHub: true, zone, val: 18,
    color: ZONE_COLORS[zone] ?? '#94a3b8',
  }))
  const domainNodes: GraphNode[] = territories.map((t) => {
    const faction = activeFaction(t)
    return {
      id: t.domain, name: t.domain, isHub: false, zone: t.zone,
      tier: t.tier, faction: faction ?? undefined,
      isContested: t.is_contested, isEphemeral: t.is_ephemeral,
      val: TIER_SIZE[t.tier] ?? 3,
      color: faction ? (FACTION_COLORS[faction] ?? '#94a3b8') : '#64748b',
      domain: t.domain,
    }
  })
  const links: GraphLink[] = territories.map((t) => ({ source: t.domain, target: `hub_${t.zone}` }))
  return { nodes: [...hubs, ...domainNodes], links }
}

export default function Map() {
  const [territories, setTerritories] = useState<Territory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({ nodes: [], links: [] })
  const [filterFaction, setFilterFaction] = useState('Tous')
  const [filterZone, setFilterZone] = useState('Toutes')
  const [showContested, setShowContested] = useState(false)
  const [showEphemeral, setShowEphemeral] = useState(false)
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight })
  const fgRef = useRef<any>(null)

  useEffect(() => {
    const onResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/territories?select=domain,tier,zone,first_seen_faction,dominant_faction,is_contested,is_ephemeral,value_snapshot,last_visit_at&order=last_visit_at.desc.nullslast&limit=1000`,
        { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setTerritories(await res.json())
    } catch { setError('Impossible de charger les territoires.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    let filtered = territories
    const faction = filterFaction !== 'Tous' ? filterFaction : null
    if (faction) filtered = filtered.filter((t) => activeFaction(t) === faction)
    if (filterZone !== 'Toutes') filtered = filtered.filter((t) => t.zone === filterZone)
    if (showContested) filtered = filtered.filter((t) => t.is_contested)
    if (showEphemeral) filtered = filtered.filter((t) => t.is_ephemeral)
    setGraphData(buildGraph(filtered))
  }, [territories, filterFaction, filterZone, showContested, showEphemeral])

  const nodeThreeObject = useCallback((node: GraphNode) => {
    const size = node.isHub ? 6 : (node.val ?? 3)
    const geo = new THREE.SphereGeometry(size, 16, 16)

    if (node.isEphemeral && !node.isHub) {
      // Gold pulsing shell for ephemerals
      const mat = new THREE.MeshLambertMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.85 })
      const mesh = new THREE.Mesh(geo, mat)
      const ring = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.SphereGeometry(size + 2, 8, 8)),
        new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.6 })
      )
      mesh.add(ring)
      return mesh
    }

    if (node.isContested && !node.isHub) {
      // Wireframe-only for contested
      const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(node.color), transparent: true, opacity: 0.3 })
      const mesh = new THREE.Mesh(geo, mat)
      const wire = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: new THREE.Color(node.color), opacity: 0.9, transparent: true })
      )
      mesh.add(wire)
      return mesh
    }

    const mat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(node.color),
      transparent: node.isHub,
      opacity: node.isHub ? 0.3 : 0.88,
    })
    const mesh = new THREE.Mesh(geo, mat)
    if (node.isHub) {
      mesh.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: new THREE.Color(node.color), opacity: 0.45, transparent: true })
      ))
    }
    return mesh
  }, [])

  const handleNodeClick = useCallback((node: GraphNode) => {
    if (!node.isHub && node.domain) window.open(`https://${node.domain}`, '_blank', 'noopener')
  }, [])

  const domainCount = (f: string) => territories.filter((t) => activeFaction(t) === f).length
  const contestedCount = territories.filter((t) => t.is_contested).length
  const ephemeralCount = territories.filter((t) => t.is_ephemeral).length

  return (
    <div className="map-root">
      <div className="map-overlay">
        <div className="map-overlay-header">
          <div>
            <p className="eyebrow">NetKingdoms</p>
            <h1 className="map-overlay-title">Carte des Territoires</h1>
            <p className="map-hint" style={{ margin: '4px 0 0' }}>
              {territories.length} territoires
              {contestedCount > 0 && <span style={{ color: '#f97316' }}> · {contestedCount} contestés</span>}
              {ephemeralCount > 0 && <span style={{ color: '#f59e0b' }}> · {ephemeralCount} éphémères ×5</span>}
            </p>
          </div>
          <div className="map-stats">
            {(['Fondeurs', 'Spectres', 'Nomades'] as const).map((f) => (
              <div key={f} className="map-stat" style={{ borderColor: FACTION_COLORS[f] }}>
                <span className="map-stat-count" style={{ color: FACTION_COLORS[f] }}>{domainCount(f)}</span>
                <span className="map-stat-label">{f}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="map-filters">
          <div className="filter-group">
            {['Tous', 'Fondeurs', 'Spectres', 'Nomades'].map((f) => (
              <button key={f}
                className={filterFaction === f ? 'filter-btn active' : 'filter-btn'}
                style={filterFaction === f && f !== 'Tous' ? { backgroundColor: FACTION_COLORS[f], borderColor: FACTION_COLORS[f], color: '#fff' } : undefined}
                onClick={() => setFilterFaction(f)}>{f}</button>
            ))}
            <button
              className={showContested ? 'filter-btn active' : 'filter-btn'}
              style={showContested ? { backgroundColor: '#f97316', borderColor: '#f97316', color: '#fff' } : undefined}
              onClick={() => setShowContested((v) => !v)}>Contestés</button>
            <button
              className={showEphemeral ? 'filter-btn active' : 'filter-btn'}
              style={showEphemeral ? { backgroundColor: '#f59e0b', borderColor: '#f59e0b', color: '#fff' } : undefined}
              onClick={() => setShowEphemeral((v) => !v)}>×5 Éphémères</button>
          </div>
          <div className="filter-group">
            {['Toutes', ...ZONES].map((z) => (
              <button key={z}
                className={filterZone === z ? 'filter-btn active' : 'filter-btn'}
                onClick={() => setFilterZone(z)}>{z}</button>
            ))}
          </div>
        </div>

        <div className="map-legend">
          {ZONES.map((z) => (
            <div key={z} className="legend-item">
              <span className="legend-dot" style={{ background: ZONE_COLORS[z] }} />
              <span>{z}</span>
            </div>
          ))}
          <div className="legend-item">
            <span className="legend-dot" style={{ background: '#f97316', border: '1px dashed #f97316', borderRadius: '50%' }} />
            <span>Contesté</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ background: '#f59e0b' }} />
            <span>Éphémère ×5</span>
          </div>
        </div>

        <p className="map-hint">Clic = ouvrir le site · Drag = tourner · Scroll = zoom</p>
      </div>

      {loading && <div className="map-fullscreen-state"><p>Chargement de la carte…</p></div>}
      {error && (
        <div className="map-fullscreen-state">
          <p>{error}</p>
          <button onClick={load} className="retry-btn">Réessayer</button>
        </div>
      )}

      {!loading && !error && (
        <ForceGraph3D
          ref={fgRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor="#020617"
          nodeThreeObject={nodeThreeObject}
          nodeLabel={(node: any) =>
            node.isHub
              ? `<div style="background:#0f172a;padding:6px 10px;border-radius:8px;color:#e2e8f0;font-size:13px;border:1px solid ${ZONE_COLORS[node.zone] ?? '#94a3b8'}">${node.name}</div>`
              : `<div style="background:#0f172a;padding:8px 12px;border-radius:8px;color:#e2e8f0;font-size:12px;border:1px solid ${FACTION_COLORS[node.faction] ?? '#94a3b8'}40">
                  <strong>${node.domain}</strong><br/>
                  Tier ${node.tier} · ${node.zone}<br/>
                  ${node.faction ? `<span style="color:${FACTION_COLORS[node.faction]}">${node.faction}</span>` : '<span style="color:#94a3b8">Non dominé</span>'}
                  ${node.isContested ? ' · <span style="color:#f97316">⚡ Contesté</span>' : ''}
                  ${node.isEphemeral ? ' · <span style="color:#f59e0b">★ ×5</span>' : ''}
                </div>`
          }
          linkColor={() => 'rgba(148,163,184,0.06)'}
          linkWidth={0.3}
          linkOpacity={0.3}
          onNodeClick={handleNodeClick}
          nodeAutoColorBy={undefined}
        />
      )}
    </div>
  )
}
