import React from 'react'

/** 纯 CSS 像素风家具与装饰（不含位图素材） */
export function StudioOfficeFurniture() {
  return (
    <div className="pointer-events-none absolute inset-0 select-none" aria-hidden>
      {/* 上半墙：砖纹 + 挂画 */}
      <div className="studio-office-brick-wall absolute inset-x-0 top-[10%] h-[28%] opacity-55" />
      <div className="absolute left-[32%] top-[14%] h-10 w-8 border-2 border-[#5c4033] bg-[#2c1810] shadow-[2px_2px_0_#000]">
        <div className="mx-auto mt-1 h-5 w-5 bg-[#1a3d2e]" />
        <div className="mx-auto mt-0.5 h-1 w-4 bg-[#c9a227]" />
      </div>

      {/* 地毯（工位下） */}
      <div className="studio-office-rug absolute bottom-[16%] left-[3%] h-[18%] w-[22%] opacity-90" />

      {/* ========== 工位：桌、显示器、键盘、椅、台灯 ========== */}
      <div className="absolute bottom-[20%] left-[5%] z-0">
        {/* 办公椅 */}
        <div className="absolute -bottom-1 left-[52px] flex flex-col items-center">
          <div className="h-2 w-10 border border-[#1a120c] bg-[#374151]" />
          <div className="-mt-px h-6 w-8 border-2 border-[#1a120c] bg-[#4b5563]" />
          <div className="mt-0.5 h-1 w-6 bg-[#1f2937]" />
        </div>
        {/* 桌腿 */}
        <div className="absolute bottom-0 left-2 h-5 w-2 bg-[#3d2d22]" />
        <div className="absolute bottom-0 left-[88px] h-5 w-2 bg-[#3d2d22]" />
        {/* 桌面 */}
        <div className="relative h-3 w-[104px] border-2 border-[#2d1f16] bg-[#6b5344] shadow-[inset_0_-2px_0_#4a3728,3px_3px_0_#1a0f0a]" />
        <div className="relative -mt-px h-7 w-[100px] border-x-2 border-b-2 border-[#2d1f16] bg-[#5c4332] shadow-[2px_2px_0_#1a0f0a]">
          {/* 显示器 */}
          <div className="absolute -top-[34px] left-[34px] flex flex-col items-center">
            <div className="studio-office-monitor-screen h-[26px] w-[34px] border-2 border-[#1e293b] bg-[#0f172a] shadow-[0_0_10px_rgba(56,189,248,0.25)]">
              <div className="m-0.5 h-[calc(100%-4px)] bg-gradient-to-b from-[#1e40af]/80 to-[#0c4a6e]/90" />
            </div>
            <div className="h-1.5 w-5 bg-[#334155]" />
            <div className="h-1 w-8 border border-[#1e293b] bg-[#475569]" />
          </div>
          {/* 键盘 */}
          <div className="absolute bottom-1 left-3 h-2 w-12 border border-[#374151] bg-[#1f2937] shadow-[inset_0_-1px_0_#111]">
            <div className="mx-0.5 mt-0.5 flex gap-px">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-0.5 w-1 bg-[#64748b]" />
              ))}
            </div>
          </div>
          {/* 马克杯 */}
          <div className="absolute bottom-1 right-4 h-3 w-2.5 border border-[#78350f] bg-[#b45309]" />
        </div>
        {/* 台灯 */}
        <div className="absolute -top-[42px] left-0 flex flex-col items-center">
          <div className="h-3 w-5 border border-[#ca8a04] bg-[#facc15] shadow-[0_0_6px_rgba(250,204,21,0.4)]" />
          <div className="h-8 w-0.5 bg-[#57534e]" />
          <div className="h-1.5 w-4 border border-[#44403c] bg-[#57534e]" />
        </div>
      </div>

      {/* ========== 书架（三层 + 彩色书脊） ========== */}
      <div className="absolute bottom-[17%] left-[22%] z-0 flex flex-col items-center">
        <div className="flex h-[76px] w-[38px] flex-col border-2 border-[#2a1810] bg-[#4a3628] shadow-[3px_3px_0_#120a06]">
          <div className="flex h-[22px] items-end justify-center gap-px border-b-2 border-[#3d2818] px-0.5 pb-px pt-0.5">
            <div className="h-[18px] w-[5px] bg-[#7f1d1d]" />
            <div className="h-[16px] w-[4px] bg-[#1e3a8a]" />
            <div className="h-[19px] w-[5px] bg-[#14532d]" />
            <div className="h-[15px] w-[3px] bg-[#713f12]" />
            <div className="h-[17px] w-[4px] bg-[#831843]" />
          </div>
          <div className="flex h-[22px] items-end justify-center gap-px border-b-2 border-[#3d2818] px-0.5 pb-px pt-0.5">
            <div className="h-[17px] w-[4px] bg-[#0c4a6e]" />
            <div className="h-[19px] w-[5px] bg-[#9a3412]" />
            <div className="h-[18px] w-[4px] bg-[#365314]" />
            <div className="h-[18px] w-[5px] bg-[#4c1d95]" />
          </div>
          <div className="flex h-[22px] items-end justify-center gap-px px-0.5 pb-px pt-0.5">
            <div className="h-[17px] w-[5px] bg-[#b45309]" />
            <div className="h-[14px] w-[3px] bg-[#115e59]" />
            <div className="h-[19px] w-[5px] bg-[#be123c]" />
            <div className="h-[15px] w-[4px] bg-[#1c1917]" />
          </div>
        </div>
        <div className="-mt-px h-1 w-[42px] bg-[#3d2d22]" />
      </div>

      {/* ========== 沙发 + 茶几 ========== */}
      <div className="absolute bottom-[22%] left-[36%] z-0">
        <div className="relative">
          {/* 沙发靠背 */}
          <div className="absolute -top-3 left-1 h-4 w-[72px] border-2 border-[#5c4f45] bg-[#78716c] shadow-[inset_0_-2px_0_#57534e]" />
          {/* 沙发座 + 双 cushion */}
          <div className="flex h-7 w-[76px] items-end border-2 border-[#44403c] bg-[#57534e] shadow-[3px_3px_0_#1c1917]">
            <div className="mx-0.5 mb-0.5 flex flex-1 gap-0.5">
              <div className="h-5 flex-1 border border-[#4b5563] bg-[#9ca3af] shadow-[inset_0_2px_0_rgba(255,255,255,0.15)]" />
              <div className="h-5 flex-1 border border-[#4b5563] bg-[#a8a29e] shadow-[inset_0_2px_0_rgba(255,255,255,0.12)]" />
            </div>
          </div>
          {/* 左扶手 */}
          <div className="absolute -left-1.5 bottom-0 h-6 w-2.5 border-2 border-[#44403c] bg-[#6b7280]" />
          {/* 右扶手 */}
          <div className="absolute -right-1.5 bottom-0 h-6 w-2.5 border-2 border-[#44403c] bg-[#6b7280]" />
        </div>
        {/* 茶几 */}
        <div className="absolute -bottom-6 left-[10px] flex flex-col items-center">
          <div className="h-1.5 w-[52px] border-2 border-[#3f2e22] bg-[#6b4f3a] shadow-[inset_0_-1px_0_#4a3728]" />
          <div className="flex w-[40px] justify-between">
            <div className="h-3 w-1 bg-[#3d2d22]" />
            <div className="h-3 w-1 bg-[#3d2d22]" />
          </div>
          {/* 咖啡杯 */}
          <div className="absolute -top-2 left-3 h-2 w-1.5 border border-[#57534e] bg-[#e7e5e4]" />
          <div className="absolute -top-2 right-5 h-1.5 w-2 rounded-none border border-[#44403c] bg-[#292524]" />
        </div>
      </div>

      {/* ========== 机柜组（通风栅 + 闪烁指示灯） ========== */}
      <div className="absolute bottom-[20%] right-[8%] z-0 flex items-end gap-1.5">
        <div className="studio-office-rack flex h-[68px] w-[22px] flex-col border-2 border-[#0f172a] bg-[#1e293b] shadow-[3px_3px_0_#020617]">
          <div className="mx-0.5 mt-1 space-y-0.5 border-b border-[#334155] pb-1">
            <div className="studio-office-rack-vents h-2 w-full opacity-80" />
            <div className="flex justify-center gap-0.5 py-0.5">
              <span className="studio-office-led" />
              <span className="studio-office-led studio-office-led--delay" />
              <span className="studio-office-led" />
            </div>
          </div>
          <div className="mx-0.5 mt-1 space-y-0.5 border-b border-[#334155] pb-1">
            <div className="studio-office-rack-vents h-2 w-full opacity-80" />
            <div className="flex justify-center gap-0.5 py-0.5">
              <span className="studio-office-led studio-office-led--delay2" />
              <span className="studio-office-led" />
              <span className="studio-office-led studio-office-led--delay" />
            </div>
          </div>
          <div className="mx-0.5 mt-1 flex flex-col items-center gap-0.5 pb-1">
            <div className="studio-office-rack-vents h-2 w-full opacity-80" />
            <div className="flex gap-0.5">
              <span className="studio-office-led-alt" />
              <span className="studio-office-led" />
            </div>
          </div>
        </div>
        <div className="studio-office-rack flex h-[72px] w-[22px] flex-col border-2 border-[#0f172a] bg-[#172554] shadow-[3px_3px_0_#020617]">
          <div className="mx-0.5 mt-1 space-y-0.5 border-b border-[#312e81] pb-1">
            <div className="studio-office-rack-vents h-2 w-full opacity-80" />
            <div className="flex justify-center gap-0.5 py-0.5">
              <span className="studio-office-led" />
              <span className="studio-office-led-alt" />
              <span className="studio-office-led studio-office-led--delay2" />
            </div>
          </div>
          <div className="mx-0.5 mt-1 space-y-0.5 border-b border-[#312e81] pb-1">
            <div className="studio-office-rack-vents h-2 w-full opacity-80" />
            <div className="flex justify-center gap-0.5 py-0.5">
              <span className="studio-office-led studio-office-led--delay" />
              <span className="studio-office-led" />
              <span className="studio-office-led" />
            </div>
          </div>
          <div className="mx-0.5 mt-1 flex flex-col items-center gap-0.5 pb-1">
            <div className="studio-office-rack-vents h-2 w-full opacity-80" />
            <div className="flex gap-0.5">
              <span className="studio-office-led" />
              <span className="studio-office-led studio-office-led--delay" />
            </div>
          </div>
        </div>
      </div>

      {/* 文件柜 */}
      <div className="absolute bottom-[21%] right-[22%] z-0 h-12 w-7 border-2 border-[#374151] bg-[#4b5563] shadow-[2px_2px_0_#111]">
        <div className="mx-0.5 mt-1 space-y-0.5 border-b border-[#6b7280] pb-0.5">
          <div className="h-0.5 w-full bg-[#9ca3af]" />
          <div className="mx-auto h-1 w-2 bg-[#d1d5db]" />
        </div>
        <div className="mx-0.5 mt-1 space-y-0.5 border-b border-[#6b7280] pb-0.5">
          <div className="h-0.5 w-full bg-[#9ca3af]" />
          <div className="mx-auto h-1 w-2 bg-[#d1d5db]" />
        </div>
      </div>

      {/* 大绿植 */}
      <div className="absolute bottom-[18%] right-[30%] z-0 flex flex-col items-center">
        <div className="flex gap-0.5">
          <div className="h-4 w-3 -rotate-12 border border-[#14532d] bg-[#166534]" />
          <div className="h-5 w-3 border border-[#14532d] bg-[#15803d]" />
          <div className="h-4 w-3 rotate-12 border border-[#14532d] bg-[#166534]" />
        </div>
        <div className="h-5 w-6 border-2 border-[#78350f] bg-[#92400e] shadow-[inset_-2px_0_0_rgba(0,0,0,0.2)]" />
      </div>

      {/* 墙角落地灯（暖光） */}
      <div className="absolute bottom-[24%] left-[31%] z-0 flex flex-col items-center opacity-90">
        <div className="h-2 w-4 border border-[#ca8a04] bg-[#fde047] shadow-[0_0_12px_rgba(253,224,71,0.35)]" />
        <div className="h-10 w-0.5 bg-[#57534e]" />
        <div className="h-2 w-3 border border-[#44403c] bg-[#44403c]" />
      </div>
    </div>
  )
}
