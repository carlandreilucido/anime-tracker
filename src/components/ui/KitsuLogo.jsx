export default function KitsuLogo({ iconOnly = false, admin = false, className = '' }) {
  return <span className={`kitsu-logo ${iconOnly ? 'kitsu-logo-icon-only' : ''} ${admin ? 'kitsu-logo-admin' : ''} ${className}`.trim()} role="img" aria-label={iconOnly ? 'Kitsu logo' : admin ? 'Kitsu admin' : 'Kitsu'}>
    <img className="kitsu-logo-mark" src="/logo.png" alt="" aria-hidden="true"/>
    {!iconOnly && <span className="kitsu-logo-wordmark">kitsu<span className="kitsu-logo-dot">.</span></span>}
    {!iconOnly && admin && <span className="kitsu-logo-admin-label">admin</span>}
  </span>
}
