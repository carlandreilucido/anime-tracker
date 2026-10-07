import bilibiliLogo from 'simple-icons/icons/bilibili.svg?url'
import crunchyrollLogo from 'simple-icons/icons/crunchyroll.svg?url'
import netflixLogo from 'simple-icons/icons/netflix.svg?url'
import youtubeLogo from 'simple-icons/icons/youtube.svg?url'

const logos = {
  bilibili: bilibiliLogo,
  crunchyroll: crunchyrollLogo,
  netflix: netflixLogo,
  youtube: youtubeLogo,
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0].toUpperCase()).join('') || 'TV'
}

function validColor(color) { return /^#[0-9a-f]{6}$/i.test(color || '') ? color : null }

export default function ProviderLogo({ provider }) {
  const logo = logos[provider.provider_key]
  const color = validColor(provider.brand_color)
  return <span className={`provider-mark ${logo ? 'has-provider-logo' : 'provider-mark-text'}`} style={color ? { '--provider-color': color } : undefined} aria-hidden="true">
    {logo ? <img src={logo} alt="" loading="lazy"/> : initials(provider.name)}
  </span>
}
