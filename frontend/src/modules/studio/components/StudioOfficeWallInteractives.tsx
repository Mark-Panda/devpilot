import React, { useEffect, useState } from 'react'

const STICKY_TIPS = [
  '点我切换：输入 @ 可定向子 Agent',
  '左侧「任务进度」看委派与子任务',
  '下方「协作状态」可固定展示',
  '对话只经主 Agent，委派由工具完成',
]

const BOARD_LINES = [
  'devpilot_studio_todo',
  '巡检 ≈105s → 简报',
  '成员工作区可单独设目录',
]

interface StudioOfficeWallInteractivesProps {
  nightMode: boolean
  onNightModeToggle: () => void
  onAir: boolean
  onOnAirToggle: () => void
}

/** 上半墙可点击装饰：窗户、时钟、便签、白板、录制灯 */
export function StudioOfficeWallInteractives({
  nightMode,
  onNightModeToggle,
  onAir,
  onOnAirToggle,
}: StudioOfficeWallInteractivesProps) {
  const [now, setNow] = useState(() => new Date())
  const [stickyIdx, setStickyIdx] = useState(0)
  const [boardIdx, setBoardIdx] = useState(0)
  const [clockFlash, setClockFlash] = useState(false)

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])

  const h = now.getHours().toString().padStart(2, '0')
  const m = now.getMinutes().toString().padStart(2, '0')
  const s = now.getSeconds().toString().padStart(2, '0')
  const mon = now.getMonth() + 1
  const day = now.getDate()

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[38%]">
      {/* 窗户：昼夜 */}
      <button
        type="button"
        onClick={onNightModeToggle}
        title={nightMode ? '点击切回白昼' : '点击切换夜景'}
        aria-pressed={nightMode}
        aria-label="切换窗户昼夜"
        className="pointer-events-auto absolute left-[3%] top-[14%] border-2 border-[#2a1810] bg-[#3d2d22] p-1 shadow-[3px_3px_0_#000] transition-transform hover:scale-[1.02] active:scale-[0.98]"
      >
        <div className="relative h-16 w-[52px] overflow-hidden border-2 border-[#1a120c]">
          {nightMode ? (
            <div className="studio-office-window-night relative h-full w-full">
              <div className="absolute inset-0 bg-gradient-to-b from-[#0f172a] via-[#1e1b4b] to-[#312e81]" />
              <span
                className="studio-office-star absolute left-[10%] top-[18%] h-0.5 w-0.5 bg-white opacity-90"
                style={{ animationDelay: '0s' }}
              />
              <span
                className="studio-office-star absolute left-[45%] top-[12%] h-px w-px bg-white opacity-80"
                style={{ animationDelay: '0.5s' }}
              />
              <span
                className="studio-office-star absolute right-[20%] top-[22%] h-0.5 w-0.5 bg-white opacity-70"
                style={{ animationDelay: '1s' }}
              />
              <span
                className="studio-office-star absolute left-[30%] top-[40%] h-px w-px bg-amber-100 opacity-60"
                style={{ animationDelay: '0.3s' }}
              />
              <span
                className="studio-office-star absolute right-[12%] top-[38%] h-0.5 w-0.5 bg-white opacity-85"
                style={{ animationDelay: '1.4s' }}
              />
              <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-[#0c4a6e]/40 to-transparent" />
            </div>
          ) : (
            <div className="relative h-full w-full bg-gradient-to-b from-[#38bdf8] via-[#7dd3fc] to-[#e0f2fe]">
              <div className="absolute left-[20%] top-[30%] h-3 w-8 rounded-full bg-white/35 blur-[1px]" />
            </div>
          )}
        </div>
        <span className="mt-0.5 block text-center font-[system-ui] text-[8px] text-[#d6c4a8]">
          {nightMode ? '夜景' : '白昼'}
        </span>
      </button>

      {/* 便签 */}
      <button
        type="button"
        onClick={() => setStickyIdx((i) => (i + 1) % STICKY_TIPS.length)}
        title="点击切换提示"
        aria-label="工作室便签提示"
        className="pointer-events-auto absolute left-[18%] top-[18%] w-[100px] -rotate-6 border border-[#ca8a04]/60 bg-[#fef9c3] px-1.5 py-1 text-left shadow-[2px_3px_0_rgba(0,0,0,0.25)] transition-transform hover:rotate-0 hover:shadow-[3px_4px_0_rgba(0,0,0,0.2)] active:scale-95"
      >
        <div className="mb-0.5 h-2 w-2 rounded-full bg-[#facc15]/80 shadow-sm" />
        <p className="font-[system-ui] text-[9px] leading-snug text-[#422006]">{STICKY_TIPS[stickyIdx]}</p>
        <span className="mt-0.5 block text-[7px] text-[#78716c]">再点换下一条</span>
      </button>

      {/* 小白板 */}
      <button
        type="button"
        onClick={() => setBoardIdx((i) => (i + 1) % BOARD_LINES.length)}
        title="点击切换白板行"
        aria-label="工作室白板"
        className="pointer-events-auto absolute left-1/2 top-[13%] w-[120px] -translate-x-1/2 border-4 border-[#57534e] bg-[#ecfdf5] px-2 py-1.5 shadow-[2px_3px_0_#000] transition-transform hover:scale-[1.02] active:scale-[0.98]"
      >
        <div className="mb-0.5 font-[system-ui] text-[8px] font-bold uppercase tracking-wide text-[#57534e]">
          白板
        </div>
        <p className="font-mono text-[10px] font-semibold text-[#134e4a]">{BOARD_LINES[boardIdx]}</p>
        <span className="mt-0.5 block text-[7px] text-[#64748b]">点击切换</span>
      </button>

      {/* 时钟 */}
      <button
        type="button"
        onClick={() => {
          setClockFlash(true)
          window.setTimeout(() => setClockFlash(false), 400)
        }}
        title="挂钟 · 点击闪一下"
        aria-label={`当前时间 ${h}点${m}分`}
        className={`pointer-events-auto absolute right-[16%] top-[12%] flex w-[64px] flex-col items-center border-4 border-[#44403c] bg-[#292524] px-1 py-1 shadow-[3px_3px_0_#000] transition-transform hover:scale-105 active:scale-95 ${clockFlash ? 'ring-2 ring-amber-400/80' : ''}`}
      >
        <div className="h-1 w-8 bg-[#57534e]" />
        <div className="mt-1 font-mono text-[15px] font-bold leading-none tracking-wider text-[#fbbf24]">
          {h}:{m}:{s}
        </div>
        <div className="mt-0.5 font-[system-ui] text-[8px] text-[#a8a29e]">
          {mon}月{day}日
        </div>
      </button>

      {/* ON AIR */}
      <button
        type="button"
        onClick={onOnAirToggle}
        aria-pressed={onAir}
        aria-label="切换录制指示灯"
        title={onAir ? '关闭录制灯' : '打开录制灯'}
        className="pointer-events-auto absolute right-[3%] top-[14%] flex flex-col items-center gap-1 border-2 border-[#44403c] bg-[#1c1917] px-2 py-1.5 shadow-[2px_2px_0_#000] hover:border-[#78716c]"
      >
        <span
          className={`h-2.5 w-2.5 border border-[#7f1d1d] ${onAir ? 'studio-office-onair-led bg-red-500' : 'bg-[#450a0a]'}`}
        />
        <span className="font-[system-ui] text-[8px] font-bold tracking-widest text-[#d6d3d1]">REC</span>
      </button>
    </div>
  )
}
