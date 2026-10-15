export const EMAIL_VERIFICATION_NOTICE = 'Your email address is not verified yet. Please check your inbox for the verification link.'

export function hasVerifiedEmail(user) {
  return !user?.email || Boolean(user.email_confirmed_at)
}

export function verificationStatusLabel(status) {
  return ({
    verified: 'Verified',
    pending_verification: 'Pending Verification',
    disabled: 'Disabled',
  })[status] || 'Unknown'
}
