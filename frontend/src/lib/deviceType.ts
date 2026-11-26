/** Which of the three session slots this browser uses: phone, tablet or computer.
 *  iPadOS 13+ reports itself as a Mac, so touch support is used to spot iPads. */
export type DeviceType = 'mobile' | 'tablet' | 'desktop'

export function detectDeviceType(): DeviceType {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent || ''
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua)) return 'tablet'
  if (/Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1) return 'tablet'
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'mobile' : 'tablet'
  if (/iPhone|iPod|Windows Phone|IEMobile|Mobile/i.test(ua)) return 'mobile'
  return 'desktop'
}
