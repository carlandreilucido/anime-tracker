import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

const updated = 'October 7, 2026'

const termsSections = [
  {
    title: 'Using Kitsu',
    paragraphs: [
      'Kitsu is a personal anime watchlist and episode-tracking service. By creating an account or using the service, you agree to these Terms and Conditions. If you do not agree, do not use the service.',
      'You must provide accurate account information, keep your sign-in credentials secure, and be legally able to use the service where you live. You are responsible for activity performed through your account.',
    ],
  },
  {
    title: 'Your account and content',
    paragraphs: [
      'You retain your rights to the notes, ratings, and watchlist information you enter. You give the service permission to store and process that content only as needed to provide and maintain your account and its features.',
      'Your watchlist is intended for your personal use and is protected by account-based access controls. Do not use the service to upload unlawful, harmful, or infringing material, or to attempt to access another person’s account or data.',
    ],
  },
  {
    title: 'External services and links',
    paragraphs: [
      'Watch options link to third-party streaming services. Those services are independent of Kitsu and have their own terms, privacy practices, pricing, and availability. A search link is not a promise that a title is available or free in your region.',
      'When you choose to open a provider link, that provider may receive the search terms in the URL and information from your browser. Review the provider’s own policies before using its site.',
    ],
  },
  {
    title: 'Availability and changes',
    paragraphs: [
      'The service is provided as available. Features, provider links, and stored information may change or be unavailable from time to time. We may update these terms when the service changes; the date above indicates the latest revision.',
    ],
  },
  {
    title: 'Disclaimer and limits',
    paragraphs: [
      'To the extent permitted by applicable law, Kitsu is provided without guarantees that it will be uninterrupted, error-free, or suitable for every purpose. Provider information is general and may be incomplete or out of date.',
      'Nothing in these terms excludes rights or remedies that cannot be excluded under applicable law. To the extent permitted by law, the service operator is not responsible for indirect loss arising from your use of Kitsu or third-party services.',
    ],
  },
  {
    title: 'Contact',
    paragraphs: ['For questions about these terms, contact the Kitsu site administrator through the contact channel provided by the site operator.'],
  },
]

const privacySections = [
  {
    title: 'Information stored',
    paragraphs: [
      'When you create an account, the service processes your email address and authentication data. Passwords are handled by Supabase Authentication; Kitsu does not store your password as plain text.',
      'If a sign-in attempt fails because credentials are invalid, the app checks whether the submitted email exists in its profile directory so it can tell you whether to register or reset your password. A person submitting an email can learn whether that address is registered; the lookup returns no profile details and is subject to request throttling.',
      'Your profile may include a name, username, and avatar. Your library can include anime titles and metadata, season and episode progress, status, favorites, ratings, dates, and personal notes. Settings may include your preferred streaming provider and country code.',
    ],
  },
  {
    title: 'How information is used',
    paragraphs: [
      'Information is used to authenticate you, display and maintain your profile and watchlist, save progress and preferences, provide provider search links, and keep the service secure and functioning.',
      'The app stores your signed-in session and appearance preference in your browser so you can stay signed in and retain your theme choice.',
    ],
  },
  {
    title: 'Storage and service providers',
    paragraphs: [
      'Account, profile, and watchlist data are stored in the Supabase project used by this deployment. Supabase provides authentication, database, file storage, and server functions. Vercel hosts the website. These providers process information as needed to provide their services and under their own privacy terms.',
      'Profile avatars are stored in a public image bucket and can be viewed by anyone who has the image URL. Uploading an avatar is optional. Only the account owner is allowed to upload, replace, or delete files in their own avatar folder.',
    ],
  },
  {
    title: 'Who can see your information',
    paragraphs: [
      'Watchlist entries and personal notes are restricted to the account that owns them by database access policies. Administrators can access account directory information and aggregate service statistics for administration; the admin dashboard is designed not to expose users’ private anime titles, notes, ratings, or episode histories.',
      'The app does not send an anime title to a streaming provider merely by displaying watch options. If you click a provider search link, the title is included in that provider’s search URL and is then subject to the provider’s privacy policy.',
    ],
  },
  {
    title: 'Retention and your choices',
    paragraphs: [
      'Your information remains in the project while your account and entries are maintained. You can edit profile details and remove individual anime entries in the app. This version does not include self-service account deletion; account-wide deletion requests must be handled by the site administrator.',
      'Supabase and Vercel may retain operational logs or backups according to their own service settings and policies.',
    ],
  },
  {
    title: 'Security and updates',
    paragraphs: [
      'The service uses account authentication and database access policies to protect private records. No online system can guarantee absolute security. This notice may be updated as the service changes; the date above indicates the latest revision.',
      'For privacy questions or account data requests, contact the Kitsu site administrator through the contact channel provided by the site operator.',
    ],
  },
]

export default function LegalPage() {
  const { pathname } = useLocation()
  const isPrivacy = pathname === '/privacy'
  const title = isPrivacy ? 'Privacy Policy' : 'Terms & Conditions'
  const sections = isPrivacy ? privacySections : termsSections

  return <main className="page legal-page">
    <Link className="back-link legal-back-link" to="/"><ArrowLeft size={16}/> Back to Kitsu</Link>
    <header className="legal-heading">
      <span className="eyebrow">KITSU</span>
      <h1>{title}</h1>
      <p>Last updated {updated}</p>
    </header>
    <article className="legal-content">
      {sections.map(section => <section key={section.title}>
        <h2>{section.title}</h2>
        {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
      </section>)}
    </article>
    <nav className="legal-switch" aria-label="Legal pages">
      <Link to={isPrivacy ? '/terms' : '/privacy'}>{isPrivacy ? 'Terms & Conditions' : 'Privacy Policy'}</Link>
    </nav>
  </main>
}
