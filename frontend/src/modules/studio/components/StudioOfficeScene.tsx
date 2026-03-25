import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { StudioOfficeMood } from './StudioOfficeDashboard'
import type { StudioProgressEvent } from '../types'
import { StudioOfficeFurniture } from './StudioOfficeFurniture'
import { StudioOfficeWallInteractives } from './StudioOfficeWallInteractives'

/** 协作状态 → 房间内锚点（百分比，相对场景内层） */
const MOOD_SPOTS: Record<StudioOfficeMood, { left: string; bottom: string }> = {
  idle: { left: '42%', bottom: '30%' },
  work: { left: '16%', bottom: '25%' },
  sync: { left: '74%', bottom: '27%' },
  alarm: { left: '56%', bottom: '21%' },
}

/** 主 Agent 刚发出委派时走向机柜过道（与 MOOD_SPOTS.sync、子 Agent 的 sync 位错开） */
const MAIN_DELEGATION_SPOT = { left: '66%', bottom: '29%' }

/** 子 Agent 分区：每名子 Agent 用 slot 0/1 取不同偏移，避免重叠 */
const SUB_ZONE: Record<'lounge' | 'work' | 'sync' | 'alarm', { left: string; bottom: string }[]> = {
  lounge: [
    { left: '48%', bottom: '33%' },
    { left: '62%', bottom: '31%' },
  ],
  work: [
    { left: '26%', bottom: '27%' },
    { left: '30%', bottom: '23%' },
  ],
  sync: [
    { left: '71%', bottom: '28%' },
    { left: '77%', bottom: '25%' },
  ],
  alarm: [
    { left: '52%', bottom: '22%' },
    { left: '58%', bottom: '19%' },
  ],
}

function latestEventForAgent(
  progress: StudioProgressEvent[],
  agentId: string
): StudioProgressEvent | null {
  const sorted = [...progress].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
  return sorted.find((e) => e.agent_id === agentId) ?? null
}

/** 根据该子 Agent 最近一条进度事件推断所在区域（与后端 kind 语义对齐） */
function spotCategoryForSub(ev: StudioProgressEvent | null): 'lounge' | 'work' | 'sync' | 'alarm' {
  if (!ev) return 'lounge'
  const age = Date.now() - new Date(ev.timestamp).getTime()
  const k = ev.kind

  if (k === 'sub_task_failed' || k === 'delegation_failed') {
    if (age < 90_000) return 'alarm'
    return 'lounge'
  }
  if (k === 'sub_task_finished' || k === 'delegation_finished') {
    return 'lounge'
  }
  if (k === 'sub_task_accepted') {
    if (age < 180_000) return 'work'
    return 'lounge'
  }
  if (k === 'delegation_started') {
    if (age < 45_000) return 'sync'
    return 'lounge'
  }
  return 'lounge'
}

function computeSubSpot(
  agentId: string,
  progress: StudioProgressEvent[],
  slotIndex: number
): { left: string; bottom: string; zone: 'lounge' | 'work' | 'sync' | 'alarm' } {
  const ev = latestEventForAgent(progress, agentId)
  const zone = spotCategoryForSub(ev)
  const list = SUB_ZONE[zone]
  const spot = list[slotIndex % list.length] ?? list[0]
  return { ...spot, zone }
}

export interface StudioSubAgentPin {
  id: string
  name: string
}

interface StudioOfficeSceneProps {
  studioName: string
  mood: StudioOfficeMood
  /** 主 Agent，随 mood 在工位 / 沙发 / 机柜 / 警报区移动 */
  mainAgentName: string
  /** 最多 2 名子 Agent；站位由进度事件驱动（委派→机柜、接单→工位、失败→警报旁） */
  subAgents?: StudioSubAgentPin[]
  /** 工作室进度时间线（与左侧任务进度同源） */
  progress?: StudioProgressEvent[]
}

function PixelActor({
  label,
  left,
  bottom,
  headColor,
  bodyColor,
  moving,
  alarmPulse,
  zClass = 'z-[2]',
  hairColor = '#292524',
}: {
  label: string
  left: string
  bottom: string
  headColor: string
  bodyColor: string
  moving: boolean
  alarmPulse?: boolean
  zClass?: string
  /** 头顶发片颜色，略增立体感 */
  hairColor?: string
}) {
  const bobble = moving ? 'studio-office-actor--walk' : 'studio-office-actor--idle'
  return (
    <div
      className={`studio-office-actor pointer-events-none absolute ${zClass} flex -translate-x-1/2 flex-col items-center`}
      style={{ left, bottom, transition: 'left 0.85s cubic-bezier(0.45, 0, 0.2, 1), bottom 0.85s cubic-bezier(0.45, 0, 0.2, 1)' }}
    >
      <div className="relative flex flex-col items-center">
        <div className={`flex items-start gap-px ${bobble}`}>
          <div
            className="mt-2 h-2 w-1 border border-[#1a120c] shadow-[1px_0_0_rgba(0,0,0,0.25)]"
            style={{ backgroundColor: bodyColor }}
          />
          <div className="flex flex-col items-center">
            <div
              className="mb-px h-1 w-[18px] border border-[#1a120c]"
              style={{ backgroundColor: hairColor }}
            />
            <div
              className={`h-3.5 w-3.5 border-2 border-[#1a120c] shadow-[inset_-2px_-2px_0_rgba(0,0,0,0.15)] ${alarmPulse ? 'studio-office-actor-head-alarm' : ''}`}
              style={{ backgroundColor: headColor }}
            />
            <div
              className="-mt-px h-4 w-[18px] border-2 border-t-0 border-[#1a120c] shadow-[inset_-2px_0_0_rgba(0,0,0,0.12)]"
              style={{ backgroundColor: bodyColor }}
            />
            <div className="mt-px flex w-5 justify-between px-0.5">
              <div className="h-1 w-1.5 border border-[#1a120c] bg-[#292524]" />
              <div className="h-1 w-1.5 border border-[#1a120c] bg-[#292524]" />
            </div>
          </div>
          <div
            className="mt-2 h-2 w-1 border border-[#1a120c] shadow-[1px_0_0_rgba(0,0,0,0.25)]"
            style={{ backgroundColor: bodyColor }}
          />
        </div>
        <div className="studio-office-actor-feet-shadow" />
      </div>
      <span className="mt-0.5 max-w-[76px] truncate rounded-sm bg-[#1a1510]/90 px-1 text-[9px] leading-tight text-[#f5e6d3] ring-1 ring-[#4a3728]">
        {label}
      </span>
    </div>
  )
}

/** 纯 CSS 的「像素办公室」装饰区，视觉参考 Star-Office-UI 布局，不含第三方美术素材 */
export function StudioOfficeScene({
  studioName,
  mood,
  mainAgentName,
  subAgents = [],
  progress = [],
}: StudioOfficeSceneProps) {
  const [showCoords, setShowCoords] = useState(false)
  const [nightMode, setNightMode] = useState(false)
  const [onAir, setOnAir] = useState(false)
  const [visionPanned, setVisionPanned] = useState(false)
  const [moving, setMoving] = useState(false)
  const [subMoving, setSubMoving] = useState(false)
  const [delegationDetour, setDelegationDetour] = useState(false)
  const prevMainSpotKey = useRef<string>('')
  const prevSubSpotKey = useRef<string>('')
  const progressHydratedRef = useRef(false)
  const seenDelegationIdsRef = useRef<Set<string>>(new Set())
  const delegationClearTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const subs = subAgents.slice(0, 2)

  const subLayouts = useMemo(() => {
    return subs.map((ag, i) => {
      const { left, bottom, zone } = computeSubSpot(ag.id, progress, i)
      return { ...ag, left, bottom, zone }
    })
  }, [subs, progress])

  const subSpotKey = useMemo(
    () => subLayouts.map((s) => `${s.id}:${s.left}:${s.bottom}`).join('|'),
    [subLayouts]
  )

  /** 首次载入只登记已有 delegation_started，不触发动画；之后新 entry 触发「主 Agent 跑向机柜」约 1.5s */
  useEffect(() => {
    if (!progressHydratedRef.current) {
      progressHydratedRef.current = true
      for (const e of progress) {
        if (e.kind === 'delegation_started') seenDelegationIdsRef.current.add(e.entry_id)
      }
      return
    }
    for (const e of progress) {
      if (e.kind !== 'delegation_started') continue
      if (seenDelegationIdsRef.current.has(e.entry_id)) continue
      seenDelegationIdsRef.current.add(e.entry_id)
      const age = Date.now() - new Date(e.timestamp).getTime()
      if (age > 20_000) continue
      if (delegationClearTimerRef.current) window.clearTimeout(delegationClearTimerRef.current)
      setDelegationDetour(true)
      delegationClearTimerRef.current = window.setTimeout(() => {
        setDelegationDetour(false)
        delegationClearTimerRef.current = undefined
      }, 1500)
      break
    }
  }, [progress])

  useEffect(() => {
    return () => {
      if (delegationClearTimerRef.current) window.clearTimeout(delegationClearTimerRef.current)
    }
  }, [])

  const mainSpot = useMemo(() => {
    if (delegationDetour) return MAIN_DELEGATION_SPOT
    return MOOD_SPOTS[mood]
  }, [mood, delegationDetour])

  useEffect(() => {
    const key = `${mainSpot.left}|${mainSpot.bottom}`
    if (prevMainSpotKey.current === '') {
      prevMainSpotKey.current = key
      return
    }
    if (prevMainSpotKey.current === key) return
    prevMainSpotKey.current = key
    setMoving(true)
    const t = window.setTimeout(() => setMoving(false), 900)
    return () => window.clearTimeout(t)
  }, [mainSpot])

  useEffect(() => {
    if (prevSubSpotKey.current === '') {
      prevSubSpotKey.current = subSpotKey
      return
    }
    if (prevSubSpotKey.current === subSpotKey) return
    prevSubSpotKey.current = subSpotKey
    setSubMoving(true)
    const t = window.setTimeout(() => setSubMoving(false), 900)
    return () => window.clearTimeout(t)
  }, [subSpotKey])

  return (
    <div
      className={`studio-office-scene relative shrink-0 border-b-2 border-[var(--so-red)] bg-[#2a2218] ${nightMode ? 'studio-office-scene--night' : ''}`}
    >
      <button
        type="button"
        onClick={() => setVisionPanned((v) => !v)}
        title={visionPanned ? '恢复默认视野' : '横向略放大场景'}
        aria-pressed={visionPanned}
        className="studio-office-scene-hud-btn absolute left-2 top-2 z-[12] border border-[var(--so-red)] bg-[#1a1510] px-2 py-1 text-[11px] text-[#f5e6d3] hover:bg-[#2a2218]"
      >
        {visionPanned ? '默认视野' : '移动视野'}
      </button>
      <button
        type="button"
        onClick={() => setShowCoords((v) => !v)}
        className="studio-office-scene-hud-btn absolute right-2 top-2 z-[12] border border-[var(--so-red)] bg-[#1a1510] px-2 py-1 text-[11px] text-[#f5e6d3] hover:bg-[#2a2218]"
      >
        {showCoords ? '隐藏坐标' : '显示坐标'}
      </button>

      <div
        className={`studio-office-scene-inner relative mx-auto flex h-[min(40vh,340px)] min-h-[240px] max-h-[380px] w-full max-w-5xl items-end justify-center overflow-hidden px-4 pb-10 pt-8 ${visionPanned ? 'studio-office-scene-inner--vision-pan' : ''}`}
      >
        {/* 等轴测感地板 */}
        <div className="studio-office-floor pointer-events-none absolute inset-x-0 bottom-0 top-[14%] opacity-90" aria-hidden />

        <StudioOfficeWallInteractives
          nightMode={nightMode}
          onNightModeToggle={() => setNightMode((v) => !v)}
          onAir={onAir}
          onOnAirToggle={() => setOnAir((v) => !v)}
        />

        <StudioOfficeFurniture />

        {/* 警报灯示意（alarm 状态时闪烁） */}
        <div
          className={`pointer-events-none absolute bottom-[36%] right-[20%] z-[1] h-2.5 w-2.5 border-2 border-[#450a0a] ${mood === 'alarm' ? 'studio-office-alarm-lamp' : 'bg-[#991b1b]'}`}
          aria-hidden
        />

        {subLayouts.map((s) => (
          <PixelActor
            key={`sub_${s.id}`}
            label={s.name}
            left={s.left}
            bottom={s.bottom}
            headColor="#cbd5e1"
            bodyColor="#64748b"
            hairColor="#475569"
            moving={subMoving}
            alarmPulse={s.zone === 'alarm'}
          />
        ))}

        <PixelActor
          label={mainAgentName || '主 Agent'}
          left={mainSpot.left}
          bottom={mainSpot.bottom}
          headColor="#fcd34d"
          bodyColor="#ea580c"
          hairColor="#b45309"
          moving={moving}
          alarmPulse={mood === 'alarm'}
          zClass="z-[3]"
        />

        {showCoords ? (
          <div className="absolute bottom-2 right-3 z-10 font-mono text-[10px] text-[#a0aec0]">
            tile (0,0) — (24,16)
          </div>
        ) : null}

        <div className="relative z-[1] border-2 border-[#c9a227] bg-[#1a1510] px-4 py-1.5 text-center shadow-[3px_3px_0_#000]">
          <span className="text-[13px] font-bold tracking-wider text-[#f6e05e]">✦</span>
          <span className="mx-2 text-sm font-bold text-[#f5e6d3]">{studioName || '工作室'}</span>
          <span className="text-[13px] font-bold tracking-wider text-[#f6e05e]">✦</span>
          <div className="text-[10px] text-[#a89968]">DevPilot · 协作空间</div>
        </div>
      </div>
    </div>
  )
}
