import {
  engine,
  Entity,
  Transform,
  GltfContainer,
  PointerEvents,
  PointerEventType,
  InputAction,
  pointerEventsSystem,
  Tween,
  EasingFunction,
  MeshCollider,
  ColliderLayer,
  MeshRenderer,
  Material,
  LightSource
} from '@dcl/sdk/ecs'
import { Vector3, Color3, Color4, Quaternion } from '@dcl/sdk/math'
import { UiEntity, ReactEcs } from '@dcl/sdk/react-ecs'
import { ReactEcsRenderer } from '@dcl/sdk/react-ecs'
import { getPlayer } from '@dcl/sdk/players'
import { onEnterScene } from '@dcl/sdk/players'

// ---------------------------------------------------------------------------
// H1-01 · Sliding puzzle 3D — 3×3 tejas .glb
// Flujo: acercarse a KALIZA -> cartel de bienvenida -> ir al templo ->
//        sliding puzzle -> volver a KALIZA -> consejo esoterico
// ---------------------------------------------------------------------------

// KALIZA es la entidad 512 del main.composite (assets/Models/kaliza/kaliza.glb),
// posicionada en el editor. El cartel de bienvenida se dispara por proximidad.
const KALIZA_POS = Vector3.create(106.25, 0, 42)
const KALIZA_RADIUS = 4.5

type Phase = 'adrift' | 'welcome' | 'guided' | 'puzzle' | 'done' | 'advice'

const COLS = 3
const ROWS = 3
const TOTAL = COLS * ROWS // 9
const HOLE_ID = TOTAL - 1 // 8

const puzzleState = {
  phase: 'adrift' as Phase,
  tiles: new Array(TOTAL).fill(0).map((_, i) => i) as number[],
  emptyIndex: HOLE_ID,
  moves: 0,
  solved: false,
  startedAt: 0,
  lastDebug: 0
}

// Objetivo: slot i -> id de teja. El layout final arma la cara completa del alien
// (el hueco ocupa la casilla donde iria la pieza "3", arriba a la derecha).
//   slot:      0  1  2  3  4  5  6  7  8
//   etiqueta:  1  2  _  4  5  6  7  8  9
const GOAL: number[] = [0, 1, HOLE_ID, 2, 3, 4, 5, 6, 7]

// las 8 piezas 3D actuales del puzzle (una por teja; 3.glb fue retirado).
// Cada .glb trae "horneada" la posición de la pieza en su layout original
// (el pivote NO está en el centro de la teja), por eso hay que anular ese
// bake para que la teja quede centrada exactamente en cada casilla del grid.
const TILE_SRC: string[] = ['1', '2', '4', '5', '6', '7', '8', '9'].map(
  (n) => `assets/om_krim_3x2_tiles/${n}.glb`
)
// bake = translation del nodo de cada .glb (leída de los archivos):
// columna z (slot c): +2.0196 / 0 / -2.0414 · fila y (slot r): 0 / -2.02 / -4.06
const TILE_BAKE: Vector3[] = [
  Vector3.create(0, 0.00333197, 2.01963329), // 1
  Vector3.create(0, 0.00293311, 0), // 2
  Vector3.create(0, -2.02398401, 2.01963329), // 4
  Vector3.create(0, -2.02273583, 0), // 5
  Vector3.create(0, -2.02273583, -2.04144044), // 6
  Vector3.create(0, -4.06044388, 2.01963329), // 7
  Vector3.create(0, -4.06044388, 0), // 8
  Vector3.create(0, -4.05935049, -2.04134893) // 9
]

// board geometry: 3×3 mounted in the editor at the requested transform
const BOARD_ORIGIN = Vector3.create(42.5, 4, 40.5)
const BOARD_ROTATION = Quaternion.create(0, -0.70710677, 0, 0.70710677)
const CELL = 1.0

// 3D tejas: cada .glb es una placa ~2×2 (delgada en X local, plano Y-Z). Con
// TILE_SCALE = 0.92/2 cada teja ocupa ~0.92 unidades sobre un grid de 1.0.
const TILE_SCALE = 0.92 / 2 // 0.46
const GLB_ROT_Y = 270 // agregar +180° si el jugador ve el reverso de las piezas

// tile id (0..7) -> entity; tile 8 (hole) has no entity
const TILE_ENTITIES: (Entity | null)[] = new Array(TOTAL - 1).fill(null)

let BOARD_PARENT: Entity | undefined

// ---------------------------------------------------------------------------
// geometry helpers
// ---------------------------------------------------------------------------
function slotPos(index: number): Vector3 {
  const r = Math.floor(index / COLS)
  const c = index % COLS
  return Vector3.create(
    (c - (COLS - 1) / 2) * CELL,
    ((ROWS - 1) / 2 - r) * CELL,
    0
  )
}

// posicion del pivote: slot del grid menos el bake del glb (así el centro de
// la placa queda exactamente en la casilla). Compensación en el frame del
// tablero: X local se rota a Z del tablero por GLB_ROT_Y, por eso se cruzan.
function tilePos(slot: number, tile: number): Vector3 {
  const s = slotPos(slot)
  const b = TILE_BAKE[tile]
  return Vector3.create(s.x + TILE_SCALE * b.z, s.y - TILE_SCALE * b.y, s.z)
}

// estado inicial VERIFICADO por BFS (walk de 9 movimientos validos desde el
// objetivo -> siempre resoluble hacia GOAL, distancia minima 9):
//  slot:      0  1  2  3  4  5  6  7  8
//  etiqueta:  4  1  2  7  9  5  8  _  6
function scrambleTiles(): number[] {
  return [2, 0, 1, 5, 7, 3, 6, 8, 4]
}

function isSolved(): boolean {
  for (let i = 0; i < TOTAL; i++) if (puzzleState.tiles[i] !== GOAL[i]) return false
  return true
}

function logHito(msg: string) {
  if (puzzleState.startedAt === 0) puzzleState.startedAt = Date.now()
  const s = ((Date.now() - puzzleState.startedAt) / 1000).toFixed(1)
  console.log(`[H1-01] t=+${String(s).padStart(6)}s · ${msg}`)
}

// ---------------------------------------------------------------------------
// sliding rules
// ---------------------------------------------------------------------------
function tryMoveTile(tile: number) {
  if (puzzleState.solved || puzzleState.phase !== 'puzzle') return
  const fromIdx = puzzleState.tiles.indexOf(tile)
  if (fromIdx < 0) return
  const r = Math.floor(fromIdx / COLS)
  const c = fromIdx % COLS
  const er = Math.floor(puzzleState.emptyIndex / COLS)
  const ec = puzzleState.emptyIndex % COLS
  if (Math.abs(r - er) + Math.abs(c - ec) !== 1) return

  const dst = puzzleState.emptyIndex
  puzzleState.tiles[dst] = tile
  puzzleState.tiles[fromIdx] = HOLE_ID
  puzzleState.emptyIndex = fromIdx
  puzzleState.moves++

  const ent = TILE_ENTITIES[tile]
  if (ent != null) {
    Tween.createOrReplace(ent, {
      mode: Tween.Mode.Move({
        start: Transform.get(ent).position,
        end: tilePos(dst, tile)
      }),
      duration: 180,
      easingFunction: EasingFunction.EF_EASEINQUAD
    })
  }

  if (isSolved()) {
    puzzleState.solved = true
    logHito(`PUZZLE RESUELTO en ${puzzleState.moves} movimientos`)
    puzzleState.phase = 'done'
    spawnSolveReward()
  }
}

// ---------------------------------------------------------------------------
// build scene
// ---------------------------------------------------------------------------
function buildBoard() {
  const parent = engine.addEntity()
  Transform.create(parent, { position: BOARD_ORIGIN, rotation: BOARD_ROTATION })
  BOARD_PARENT = parent

  const rot = Quaternion.fromEulerDegrees(0, GLB_ROT_Y, 0)
  const scale = Vector3.create(TILE_SCALE, TILE_SCALE, TILE_SCALE)

  // each tile is the 3D .glb plate mounted on the board frame.
  // collisionMask 0: la colisión la aportan los colliders fijos por casilla
  // (los .glb traen escala negativa horneada y su raycast no es fiable)
  for (let tile = 0; tile < TOTAL - 1; tile++) {
    const e = engine.addEntity()
    Transform.create(e, {
      parent,
      position: tilePos(tile, tile),
      rotation: rot,
      scale
    })
    GltfContainer.create(e, { src: TILE_SRC[tile], visibleMeshesCollisionMask: 0 })
    TILE_ENTITIES[tile] = e
  }
}

function initBoardState() {
  clearSolveReward()
  puzzleState.tiles = scrambleTiles()
  puzzleState.emptyIndex = puzzleState.tiles.indexOf(HOLE_ID)
  puzzleState.moves = 0
  puzzleState.solved = false
  puzzleState.phase = 'puzzle'
  logHito('puzzle abierto (estado barajado)')

  for (let tile = 0; tile < TOTAL - 1; tile++) {
    const ent = TILE_ENTITIES[tile]
    if (ent == null) continue
    const slot = puzzleState.tiles.indexOf(tile)
    Transform.getMutable(ent)!.position = tilePos(slot, tile)
  }
}

// ---------------------------------------------------------------------------
// reward on solved: point light + glowing orb over the board
// ---------------------------------------------------------------------------
let solvedRewardEntities: Entity[] = []

function spawnSolveReward() {
  if (solvedRewardEntities.length > 0) return
  const y = BOARD_ORIGIN.y + 2.4

  const orb = engine.addEntity()
  Transform.create(orb, {
    position: Vector3.create(BOARD_ORIGIN.x, y, BOARD_ORIGIN.z),
    scale: Vector3.create(0.45, 0.45, 0.45)
  })
  MeshRenderer.setBox(orb)
  Material.setPbrMaterial(orb, {
    emissiveColor: Color3.create(1, 0.85, 0.25),
    emissiveIntensity: 10,
    albedoColor: Color4.create(1, 0.9, 0.5, 1)
  })
  solvedRewardEntities.push(orb)

  const light = engine.addEntity()
  Transform.create(light, {
    position: Vector3.create(BOARD_ORIGIN.x, y, BOARD_ORIGIN.z)
  })
  LightSource.create(light, {
    active: true,
    color: Color3.create(1, 0.92, 0.5),
    intensity: 50000,
    range: 7,
    shadow: false,
    type: LightSource.Type.Point({})
  })
  solvedRewardEntities.push(light)
}

function clearSolveReward() {
  for (const e of solvedRewardEntities) engine.removeEntity(e)
  solvedRewardEntities = []
}

function wirePointerEvents() {
  if (BOARD_PARENT == null) return
  // un collider "caja" por cada casilla (incluida la del hueco): caja de
  // 0.1 (grosor) × 0.92 × 0.92 alineada con la placa, centrada en el slot.
  // Al hacer click se resuelve qué teja ocupa esa casilla y se desliza.
  const rot = Quaternion.fromEulerDegrees(0, GLB_ROT_Y, 0)
  const scale = Vector3.create(0.1, 0.92, 0.92)
  for (let slot = 0; slot < TOTAL; slot++) {
    const c = engine.addEntity()
    Transform.create(c, { parent: BOARD_PARENT, position: slotPos(slot), rotation: rot, scale })
    MeshCollider.setBox(c, ColliderLayer.CL_POINTER)
    PointerEvents.create(c, {
      pointerEvents: [
        {
          eventType: PointerEventType.PET_DOWN,
          eventInfo: { button: InputAction.IA_POINTER, hoverText: 'Deslizar teja', maxDistance: 8 }
        }
      ]
    })
    pointerEventsSystem.onPointerDown(
      { entity: c, opts: { button: InputAction.IA_POINTER } },
      () => {
        const tile = puzzleState.tiles[slot]
        if (tile === HOLE_ID) return
        tryMoveTile(tile)
      }
    )
  }
}

// ---------------------------------------------------------------------------
// proximity system: approach KALIZA -> welcome sign; puzzle zone -> open puzzle;
// solved + return to KALIZA -> advice
// ---------------------------------------------------------------------------
function update() {
  const player = getPlayer()
  if (!player?.position) return
  const px = player.position.x
  const pz = player.position.z
  const dK = Math.hypot(px - KALIZA_POS.x, pz - KALIZA_POS.z)

  // 1. acercarse a KALIZA muestra el cartel de bienvenida
  if (puzzleState.phase === 'adrift' && dK <= KALIZA_RADIUS) {
    puzzleState.phase = 'welcome'
    logHito('jugador se acerco a KALIZA (cartel de bienvenida)')
  }

  // 2. entrar a la carpa/templo abre el puzzle
  if (puzzleState.phase === 'guided') {
    if (px > 41 && px < 44 && pz > 39.5 && pz < 41.5) {
      puzzleState.phase = 'puzzle'
      initBoardState()
    }
  }

  // 3. tras resolver el puzzle, volver a KALIZA otorga el consejo
  if (puzzleState.phase === 'done' && dK <= KALIZA_RADIUS) {
    puzzleState.phase = 'advice'
    logHito('jugador volvio a KALIZA y recibio su consejo esoterico')
  }
}

// ---------------------------------------------------------------------------
// UI: dialogue + puzzle + advice + debug
// ---------------------------------------------------------------------------
function puzzleGrid(): ReactEcs.JSX.ReactNode[] {
  const cells: ReactEcs.JSX.ReactNode[] = []
  for (let slot = 0; slot < TOTAL; slot++) {
    const tile = puzzleState.tiles[slot]
    const isHole = tile === HOLE_ID
    cells.push(
      <UiEntity
        uiTransform={{ width: '30%', height: 52, margin: 1.5 }}
        uiBackground={{
          color: isHole ? Color4.create(0.06, 0.05, 0.12, 1) : Color4.create(0.4, 0.42, 0.55, 0.9)
        }}
        uiText={{
          value: isHole ? '' : String(tile + 1),
          fontSize: 20,
          color: Color4.create(1, 1, 1, 1),
          textAlign: 'middle-center'
        }}
      />
    )
  }
  return cells
}

const UI = () => (
  <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
    {puzzleState.phase === 'welcome' && (
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: '10%', left: '27%' },
          width: 640,
          flexDirection: 'column',
          alignItems: 'center',
          padding: 20
        }}
        uiBackground={{ color: Color4.create(0.18, 0.06, 0.35, 0.95) }}
      >
        <UiEntity
          uiTransform={{ width: '100%', height: 52, alignItems: 'center', justifyContent: 'center', margin: { bottom: 8 } }}
          uiText={{
            value: 'KALIZA',
            fontSize: 36,
            color: Color4.create(1, 0.85, 0.5, 1),
            textAlign: 'middle-center'
          }}
        />
        <UiEntity
          uiTransform={{ width: '100%', margin: { top: 6 } }}
          uiText={{
            value:
              'Hello, interdimensional being\u2014it\u2019s great to meet you! Now, head to my Temple to unlock a level, then return to me to receive your esoteric advice.',
            fontSize: 18,
            color: Color4.create(1, 0.9, 0.95, 1),
            textAlign: 'middle-center'
          }}
        />
        <UiEntity
          onMouseDown={() => {
            puzzleState.phase = 'guided'
            logHito('cartel de KALIZA cerrado, jugador guiado al templo')
          }}
          uiTransform={{
            width: 190,
            height: 46,
            margin: { top: 16 },
            alignItems: 'center',
            justifyContent: 'center'
          }}
          uiBackground={{ color: Color4.create(0.85, 0.3, 0.7, 1) }}
          uiText={{ value: 'GO TO TEMPLE', fontSize: 18, color: Color4.White(), textAlign: 'middle-center' }}
        />
      </UiEntity>
    )}

    {puzzleState.phase === 'puzzle' && (
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: '30%', right: '4%' },
          width: 300,
          flexDirection: 'column',
          alignItems: 'center',
          padding: 14
        }}
        uiBackground={{ color: Color4.create(0.16, 0.05, 0.3, 0.92) }}
      >
        <UiEntity
          uiText={{ value: 'ARMA LA IMAGEN DE LA CARA DEL ALIEN', fontSize: 16, color: Color4.White(), textAlign: 'middle-center' }}
        />
        <UiEntity
          uiTransform={{ flexDirection: 'row', flexWrap: 'wrap', width: 260, margin: { top: 10 } }}
        >
          {puzzleGrid()}
        </UiEntity>
        <UiEntity
          uiText={{ value: `Movimientos: ${puzzleState.moves}`, fontSize: 14, color: Color4.create(1, 0.8, 1, 1), textAlign: 'middle-center' }}
        />
        <UiEntity
          uiText={{
            value: 'TOCA UNA TEJA para deslizarla. La imagen que debes armar está en el panel OBJETIVO.',
            fontSize: 12,
            color: Color4.create(0.9, 0.7, 0.9, 0.8),
            textAlign: 'middle-center'
          }}
        />
      </UiEntity>
    )}

    {puzzleState.phase === 'done' && (
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: '18%', left: '27%' },
          width: 620,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 18
        }}
        uiBackground={{ color: Color4.create(0.05, 0.4, 0.5, 0.92) }}
      >
        <UiEntity
          uiTransform={{ width: '100%', height: 44, alignItems: 'center', justifyContent: 'center' }}
          uiText={{
            value: 'COMPLETE PUZZLE',
            fontSize: 26,
            color: Color4.White(),
            textAlign: 'middle-center'
          }}
        />
        <UiEntity
          uiTransform={{ width: '100%', margin: { top: 10 } }}
          uiText={{
            value: 'Come back to Kaliza, and she will give you esoteric advice.',
            fontSize: 20,
            color: Color4.create(1, 0.98, 0.85, 1),
            textAlign: 'middle-center'
          }}
        />
      </UiEntity>
    )}

    {puzzleState.phase === 'advice' && (
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: '20%', left: '30%' },
          width: 580,
          height: 240,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 22
        }}
        uiBackground={{ color: Color4.create(0.55, 0.1, 0.4, 0.94) }}
      >
        <UiEntity
          uiText={{
            value:
              'KALIZA: "You have rebuilt my essence. I offer you your esoteric advice.\\n\\nThe moon on your path guides you when darkness surrounds you."',
            fontSize: 19,
            color: Color4.create(1, 0.95, 1, 1),
            textAlign: 'middle-center'
          }}
        />
      </UiEntity>
    )}

    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { top: '2%', right: '2%' }, width: 240, height: 30 }}
      uiText={{
        value: `[debug] fase: ${puzzleState.phase} · pasos: ${puzzleState.moves}`,
        fontSize: 13,
        color: Color4.create(1, 0.85, 0.5, 0.9),
        textAlign: 'middle-right'
      }}
    />
  </UiEntity>
)

// ---------------------------------------------------------------------------
export function startH101() {
  console.log('[H1-01] sliding alien puzzle 3D iniciado')
  puzzleState.startedAt = Date.now()

  buildBoard()
  wirePointerEvents() // wire before init so tiles are clickable in any phase

  onEnterScene(() => {
    if (puzzleState.phase === 'adrift') logHito('jugador entro a la escena (esperando acercarse a KALIZA)')
  })

  engine.addSystem(update)
  ReactEcsRenderer.setUiRenderer(() => <UI />)
}