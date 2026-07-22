import type { ReactNode } from 'react'

export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="grabber" />
        {children}
      </div>
    </>
  )
}

export function KernelChip() {
  return (
    <span className="kernel-chip" title="This number is a deterministic Kernel calculation — not an AI guess.">
      ✓ Kernel — deterministic, not a guess
    </span>
  )
}
