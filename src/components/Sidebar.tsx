import React from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Sidebar.css'

const NAV = [
  { to: '/chat',        icon: '💬', label: 'Live Chat'   },
  { to: '/orders',      icon: '📦', label: 'Orders'      },
  { to: '/withdrawals', icon: '💸', label: 'Transfers'   },
  { to: '/users',       icon: '👥', label: 'Users'       },
]

export default function Sidebar({ unread }: { unread: number }) {
  const { user, logout } = useAuth()
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span>⚡</span>
        <span className="sidebar-logo-txt">Tuka Staff</span>
      </div>

      <nav className="sidebar-nav">
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <span className="nav-icon">{n.icon}</span>
            <span className="nav-label">{n.label}</span>
            {n.to === '/chat' && unread > 0 && (
              <span className="nav-badge">{unread > 99 ? '99+' : unread}</span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-avatar">{(user?.nickName || 'S')[0].toUpperCase()}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-name">{user?.nickName}</div>
            <div className="sidebar-role">{user?.roleType}</div>
          </div>
        </div>
        <button className="logout-btn" onClick={logout} title="Sign out">⏻</button>
      </div>
    </aside>
  )
}
