import { memo, useEffect, useRef, useState } from 'react'

const OPEN_IMAGE = '/mascots/kitsu-open.png'
const CLOSED_IMAGE = '/mascots/kitsu-closed.png'
const POSITION_KEY = 'kitsu-mascot-position-v1'

function clampPosition(position, width, height) {
  return {
    x: Math.max(8, Math.min(position.x, window.innerWidth - width - 8)),
    y: Math.max(8, Math.min(position.y, window.innerHeight - height - 8)),
  }
}

function KitsuMascot({ onClick, className = '' }) {
  const [clicked, setClicked] = useState(false)
  const [position, setPosition] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(POSITION_KEY) || 'null')
      return Number.isFinite(saved?.x) && Number.isFinite(saved?.y) ? saved : null
    } catch { return null }
  })
  const clickTimeout = useRef(null)
  const buttonRef = useRef(null)
  const dragRef = useRef(null)
  const suppressClick = useRef(false)
  const suppressReset = useRef(null)

  useEffect(() => {
    const keepOnscreen = () => {
      const element = buttonRef.current
      if (!element || !position) return
      const rect = element.getBoundingClientRect()
      const next = clampPosition({ x: rect.left, y: rect.top }, rect.width, rect.height)
      if (next.x === position.x && next.y === position.y) return
      setPosition(next)
      try { window.localStorage.setItem(POSITION_KEY, JSON.stringify(next)) } catch { /* Ignore unavailable storage. */ }
    }
    window.addEventListener('resize', keepOnscreen)
    return () => window.removeEventListener('resize', keepOnscreen)
  }, [position])

  const applyPosition = nextPosition => {
    const element = buttonRef.current
    if (!element) return
    element.style.left = `${nextPosition.x}px`
    element.style.top = `${nextPosition.y}px`
    element.style.right = 'auto'
    element.style.bottom = 'auto'
  }

  const beginDrag = event => {
    if (event.button !== 0) return
    const rect = buttonRef.current.getBoundingClientRect()
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      moved: false,
    }
    buttonRef.current.setPointerCapture(event.pointerId)
  }

  const moveDrag = event => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) < 6) return
    drag.moved = true
    buttonRef.current.classList.add('is-dragging')
    applyPosition(clampPosition({ x: drag.left + dx, y: drag.top + dy }, buttonRef.current.offsetWidth, buttonRef.current.offsetHeight))
  }

  const endDrag = event => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    buttonRef.current.classList.remove('is-dragging')
    if (!drag.moved) return
    const rect = buttonRef.current.getBoundingClientRect()
    const nextPosition = clampPosition({ x: rect.left, y: rect.top }, rect.width, rect.height)
    setPosition(nextPosition)
    try { window.localStorage.setItem(POSITION_KEY, JSON.stringify(nextPosition)) } catch { /* Position remains available for this session. */ }
    suppressClick.current = true
    window.clearTimeout(suppressReset.current)
    suppressReset.current = window.setTimeout(() => { suppressClick.current = false }, 0)
  }

  const activate = () => {
    if (suppressClick.current) {
      suppressClick.current = false
      window.clearTimeout(suppressReset.current)
      return
    }
    setClicked(true)
    window.clearTimeout(clickTimeout.current)
    clickTimeout.current = window.setTimeout(() => {
      setClicked(false)
      onClick?.()
    }, 110)
  }

  return <button
    ref={buttonRef}
    type="button"
    className={`kitsu-mascot ${clicked ? 'is-clicked' : ''} ${className}`.trim()}
    onClick={activate}
    onPointerDown={beginDrag}
    onPointerMove={moveDrag}
    onPointerUp={endDrag}
    onPointerCancel={endDrag}
    style={position ? { left: `${position.x}px`, top: `${position.y}px`, right: 'auto', bottom: 'auto' } : undefined}
    aria-label="Open Kitsu AI assistant"
    title="Drag to reposition · Click to chat with Kitsu"
  >
    <img className="kitsu-mascot-image" src={OPEN_IMAGE} alt="" draggable="false" />
    <img className="kitsu-mascot-image kitsu-mascot-closed" src={CLOSED_IMAGE} alt="" draggable="false" />
  </button>
}

export default memo(KitsuMascot)
