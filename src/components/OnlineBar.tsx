import React, { useEffect, useState, useCallback } from 'react'
import { getOnlineStaff } from '../api/staff'
import type { OnlineStaff } from '../types'
import { useAuth } from '../context/AuthContext'
import './OnlineBar.css'

export default function OnlineBar() {
  const { user } = useAuth()
  const [staff, setStaff] = useState<OnlineStaff[]>([])

  const refresh = useCallback(() => {
    getOnlineStaff().then(setStaff).catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 15000) // refresh every 15s
    return () => clearInterval(t)
  }, [refresh])

  const online  = staff.filter(s => s.isOnline)
  const offline = staff.filter(s => !s.isOnline)

  return (
    <div className="online-bar">
      <div className="ob-section">
        <span className="ob-label">
          <span className="ob-dot online" />
          Online ({online.length})
        </span>
        <div className="ob-avatars">
          {online.map(s => (
            <div key={s.id} className="ob-avatar-wrap" title={`${s.name} · ${s.roleType}`}>
              {s.avatar
                ? <img src={s.avatar} className="ob-avatar" alt={s.name} />
                : <div className="ob-avatar ob-avatar-letter" style={{ background: nameColor(s.name) }}>
                    {s.name[0]?.toUpperCase()}
                  </div>
              }
              <span className="ob-status-dot online" />
              <span className="ob-name">{s.name}</span>
              {s.userId === user?.userId && <span className="ob-you">you</span>}
            </div>
          ))}
          {online.length === 0 && <span className="ob-none">No one online</span>}
        </div>
      </div>

      {offline.length > 0 && (
        <div className="ob-section ob-offline-section">
          <span className="ob-label">
            <span className="ob-dot offline" />
            Offline ({offline.length})
          </span>
          <div className="ob-avatars">
            {offline.map(s => (
              <div key={s.id} className="ob-avatar-wrap" title={`${s.name} · last seen ${s.lastSeen || 'never'}`}>
                {s.avatar
                  ? <img src={s.avatar} className="ob-avatar offline" alt={s.name} />
                  : <div className="ob-avatar ob-avatar-letter offline" style={{ background: '#334155' }}>
                      {s.name[0]?.toUpperCase()}
                    </div>
                }
                <span className="ob-status-dot offline" />
                <span className="ob-name offline">{s.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function nameColor(name: string) {
  const colors = ['#16a34a','#2563eb','#9333ea','#ea580c','#0891b2','#be185d']
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return colors[Math.abs(h) % colors.length]
}
