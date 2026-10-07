import bilibiliLogo from 'simple-icons/icons/bilibili.svg?url'
import crunchyrollLogo from 'simple-icons/icons/crunchyroll.svg?url'
import netflixLogo from 'simple-icons/icons/netflix.svg?url'
import youtubeLogo from 'simple-icons/icons/youtube.svg?url'

const logos = {
  bilibili: bilibiliLogo,
  crunchyroll: crunchyrollLogo,
  youtube: youtubeLogo,
}

function ProviderWordmark({ provider }) {
  switch (provider.provider_key) {
    case 'disney_plus': return <span className="disney-logo-word">Disney<span>+</span></span>
    case 'prime_video': return <span className="prime-logo-word"><strong>prime</strong><small>video</small><i/></span>
    case 'animekai': return <span className="animekai-logo-letter">K</span>
    case 'netflix': return <span className="netflix-logo-letter">N</span>
    case 'loklok': return <span className="loklok-logo-word"><small>ASIA DRAMA&amp;MOVIE</small><strong>LOKLOK</strong><i/></span>
    case 'hidive': return <span className="hidive-logo-word"><span>HI</span>DIVE</span>
    default: return <span className="wordmark-generic">{provider.name}</span>
  }
}

function validColor(color) { return /^#[0-9a-f]{6}$/i.test(color || '') ? color : null }

export default function ProviderLogo({ provider }) {
  const logo = logos[provider.provider_key]
  const color = validColor(provider.brand_color)
  const customLogo = ['animekai', 'netflix', 'loklok', 'disney_plus', 'prime_video', 'hidive'].includes(provider.provider_key)
  return <span className={`provider-mark ${logo ? 'has-provider-logo' : 'provider-mark-text'} ${customLogo ? `provider-mark-${provider.provider_key}` : ''}`} style={color ? { '--provider-color': color } : undefined} aria-hidden="true">
    {logo ? <img src={logo} alt="" loading="lazy"/> : <ProviderWordmark provider={provider}/>}
  </span>
}
